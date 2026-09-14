/* ============================================================================
 * AD Speedrun Optimizer — 游戏模型层 (model.js)
 * ----------------------------------------------------------------------------
 * 把《反物质维度》网页版"首次无限(Big Crunch)"之前的全部核心机制，
 * 按官方源码 1:1 逆向成可计算的公式，供优化器做前向仿真。
 *
 * 逆向来源（IvarK/AntimatterDimensionsSourceCode, branch master）：
 *   src/core/dimensions/antimatter-dimension.js   —— 维度成本 / 倍率 / 产量 / tick 循环
 *   src/core/dimboost.js                          —— 维度提升需求与倍率
 *   src/core/galaxy.js                            —— 反物质星系需求
 *   src/core/tickspeed.js + src/core/cache.js     —— 计数频率成本与倍率
 *   src/core/sacrifice.js                         —— 维度献祭公式
 *   src/core/math.js (ExponentialCostScaling)     —— 成本曲线
 *   src/core/secret-formula/achievements/*        —— 成就加成
 *
 * 数值约定：IEEE754 double，反物质上限 1.7976931348623157e308（游戏里的 Infinity）。
 * 性能约定：成就倍率 / 献祭倍率 / 维度倍率全部走缓存，只在必要时失效重算，
 *           保证每 tick 的热路径只有常数级运算。
 * ============================================================================ */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 常量表
  var DIM_BASE_COST = [0, 10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24];
  var DIM_COST_MULT = [0, 1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15];
  // 维度 t 的"产量系数"：t=1 直接产反物质(系数 1)；t>=2 产出下一维时先除 10
  // 源码：AntimatterDimension(tier+1).produceDimensions(AntimatterDimension(tier), diff/10)
  var DIM_FLOW = [0, 1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];

  var TICKSPEED_BASE_COST = 1e3;   // ExponentialCostScaling.baseCost
  var TICKSPEED_COST_MULT = 10;    // baseIncrease => 第 n 次成本 = 1000 * 10^n

  var BUY_TEN_MULT = 2;            // 每买满 10 个，该维度倍率 x2
  var DIMBOOST_MULT = 2;           // 每次维度提升，维度倍率 x2（依次递减）
  var GALAXY_BASE_COST = 80;
  var GALAXY_COST_MULT = 60;
  var GALAXY_COST_SCALING_START = 100;

  var ACH_MULT = 1.03;             // 每个成就 x1.03
  var ACH_ROW_MULT = 1.25;         // 每完成一整行成就再 x1.25

  var START_AM = 10;
  var INFINITY_AM = 1.7976931348623157e308;

  // ------------------------------------------------- 计数频率倍率（tickspeed）
  // cache.js getTickSpeedMultiplier() -> 间隔倍率 m；tickspeed.js perSecond = (1/m)^n
  var TICK_BASE_M = [1 / 1.1245, 1 / 1.11888888 - 0.02, 1 / 1.11267177 - 0.04];

  function tickSpeedIntervalMult(galaxies) {
    if (galaxies < 3) return TICK_BASE_M[galaxies];
    return 0.8 * Math.pow(0.965, galaxies - 4);
  }
  function tickSpeedFactor(galaxies) { return 1 / tickSpeedIntervalMult(galaxies); }

  // ------------------------------------------------------------------ 成就
  // 只收录"首次无限前可达成、且会影响维度倍率/计数频率/成就数"的成就。
  var ACHIEVEMENTS = [
    { id: 11, row: 1, name: '买第1维度' }, { id: 12, row: 1, name: '买第2维度' },
    { id: 13, row: 1, name: '买第3维度' }, { id: 14, row: 1, name: '买第4维度' },
    { id: 15, row: 1, name: '买第5维度' }, { id: 16, row: 1, name: '买第6维度' },
    { id: 17, row: 1, name: '买第7维度' }, { id: 18, row: 1, name: '买第8维度' },

    { id: 22, row: 2, name: 'FAKE NEWS(读50条新闻)', default: true },
    { id: 23, row: 2, name: '第9维度是谎言(恰好99个8维)', effect: { dim: 8, mult: 1.1 },
      cond: function (s) { return s.bought[8] === 99; } },
    { id: 24, row: 2, name: '反物质末日(AM>=1e80)', cond: function (s) { return s.am >= 1e80; } },
    { id: 25, row: 2, name: '极限提升(10次维度提升)', cond: function (s) { return s.boosts >= 10; } },
    { id: 26, row: 2, name: '翻过那堵墙(买星系)', cond: function (s) { return s.galaxies >= 1; } },
    { id: 27, row: 2, name: '双星系', cond: function (s) { return s.galaxies >= 2; } },
    { id: 28, row: 2, name: '徒劳无功(D1>=1e150)', effect: { dim: 1, mult: 1.1 },
      cond: function (s) { return s.dims[1] >= 1e150; } },

    { id: 31, row: 3, name: '我忘了削弱它(维度倍率>=1e31)', effect: { dim: 1, mult: 1.05 },
      cond: function (s) { return s.maxDimMult >= 1e31; } },
    { id: 32, row: 3, name: '诸神喜悦(献祭总倍率>=1e12)',
      cond: function (s) { return sacrificeTotalBoost(s.sacrificed) >= 1e12; } },
    { id: 35, row: 3, name: '别睡(离线6小时)', default: true },
    { id: 76, row: 8, name: 'One for each dimension', default: true },

    { id: 36, row: 4, name: '幽闭恐惧(1个星系)', effect: { tick: 1.02 },
      cond: function (s) { return s.galaxies >= 1; } },

    { id: 42, row: 5, name: 'Super Sanic(AM>=1e63)', cond: function (s) { return s.am >= 1e63; } },
    { id: 44, row: 5, name: '30秒搞定(AM>=1e80持续30s)', cond: function (s) { return s.hold1e80 >= 30; } },
    { id: 45, row: 5, name: '比土豆快(计数频率<=1e-26)', effect: { tick: 1.02 },
      cond: function (s) { return s.ticksPerSecond >= 1e26; } },
    { id: 46, row: 5, name: '多维(D7>=1e12)', cond: function (s) { return s.dims[7] >= 1e12; } },

    // 以下需要突破无限之后才可能拿到，模型里保留但默认锁死
    { id: 48, row: 6, name: '抗挑战(通关全部普通挑战)', effect: { dims: [1, 2, 3, 4, 5, 6, 7, 8], mult: 1.1 }, locked: true },
    { id: 64, row: 8, name: '零死亡', effect: { dims: [1, 2, 3, 4, 5, 6, 7, 8], mult: 1.25 }, locked: true }
  ];
  var ACH_BY_ID = {};
  ACHIEVEMENTS.forEach(function (a) { ACH_BY_ID[a.id] = a; });

  /** 献祭对第 8 维度的累计倍率（sacrifice.js: Sacrifice.totalBoost） */
  function sacrificeTotalBoost(sacrificed) {
    if (!(sacrificed > 0)) return 1;
    return Math.pow(Math.max(Math.log10(sacrificed) / 10, 1), 2);
  }
  /** 一次献祭的倍率增益 = new/old（等价于 runner.py 的 predict_sacrifice_boost） */
  function sacrificeBoost(nd1Amount, sacrificed) {
    return sacrificeTotalBoost(sacrificed + nd1Amount) / sacrificeTotalBoost(sacrificed);
  }

  // -------------------------------------------------------------- 状态对象
  var scratchP = new Array(9);
  var scratchM = new Array(9);

  function newState(opts) {
    opts = opts || {};
    var s = {
      platform: opts.platform || 'pc',
      am: opts.am !== undefined ? opts.am : START_AM,
      dims: new Array(9).fill(0),
      bought: new Array(9).fill(0),
      ticksBought: opts.ticksBought || 0,
      sacrificed: opts.sacrificed || 0,
      boosts: opts.boosts || 0,
      galaxies: opts.galaxies || 0,
      time: opts.time || 0,
      achs: {},
      hold1e80: 0,
      maxDimMult: 0,
      ticksPerSecond: 1,
      achPower: 1, perDimAch: new Array(9).fill(1), tickAch: 1,
      achDirty: true, sacBoost: 1, sacDirty: true
    };
    if (opts.achs) for (var k in opts.achs) s.achs[k] = true;
    ACHIEVEMENTS.forEach(function (a) { if (a.default) s.achs[a.id] = true; });
    if (opts.boosts !== undefined && opts.galaxies !== undefined) grantInevitables(s);
    return s;
  }

  function cloneState(s) {
    var c = {
      platform: s.platform, am: s.am,
      dims: s.dims.slice(), bought: s.bought.slice(),
      ticksBought: s.ticksBought, sacrificed: s.sacrificed,
      boosts: s.boosts, galaxies: s.galaxies, time: s.time,
      achs: Object.assign({}, s.achs),
      hold1e80: s.hold1e80, maxDimMult: s.maxDimMult, ticksPerSecond: s.ticksPerSecond,
      achPower: s.achPower, perDimAch: s.perDimAch.slice(), tickAch: s.tickAch,
      achDirty: s.achDirty, sacBoost: s.sacBoost, sacDirty: s.sacDirty
    };
    return c;
  }

  // ------------------------------------------------------- 成就结算与倍率
  /** 按 (星系, 提升) 进度补发"必然已经拿到"的成就（用于分段独立求解） */
  function grantInevitables(s) {
    var G = s.galaxies, B = s.boosts;
    // 第一行：进入本阶段前必定已买过的维度
    //  - 开局 (G=0,B=0)：一个新维度都没买
    //  - 提升阶段 B：上一阶段最多解锁到第 B+3 维度
    //  - 星系阶段 (G>=1,B=0)：上一阶段为了买星系必然买满 1~8
    var nDims = (G >= 1) ? 8 : (B === 0 ? 0 : Math.min(B + 3, 8));
    for (var t = 1; t <= nDims; t++) s.achs[10 + t] = true;
    s.achs[22] = true; s.achs[35] = true; s.achs[76] = true;
    if (B >= 10) s.achs[25] = true;
    if (G >= 1) { s.achs[24] = true; s.achs[26] = true; s.achs[36] = true; }
    if (G >= 2) s.achs[27] = true;
    s.achDirty = true;
  }

  function achCount(s) { var n = 0; for (var k in s.achs) if (s.achs[k]) n++; return n; }

  /** 整行完成数（每行 8 个：11-18, 21-28, 31-38, ...） */
  function achRows(s) {
    var rows = 0;
    for (var r = 1; r <= 18; r++) {
      var has = 0;
      for (var i = 1; i <= 8; i++) {
        var a = ACH_BY_ID[r * 10 + i];
        if (a && a.locked) { has = -999; break; }
        if (s.achs[r * 10 + i]) has++;
      }
      if (has === 8) rows++;
    }
    return rows;
  }

  /** 刷新成就相关的缓存（只在成就集合变化后调用） */
  function refreshAchCache(s) {
    var power = Math.pow(ACH_MULT, achCount(s)) * Math.pow(ACH_ROW_MULT, achRows(s));
    s.achPower = power;
    for (var t = 1; t <= 8; t++) s.perDimAch[t] = 1;
    s.tickAch = 1;
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      if (!a.effect || !s.achs[a.id]) continue;
      if (a.effect.tick) { s.tickAch *= a.effect.tick; continue; }
      if (a.effect.dim) s.perDimAch[a.effect.dim] *= a.effect.mult;
      else if (a.effect.dims) for (var j = 0; j < a.effect.dims.length; j++) s.perDimAch[a.effect.dims[j]] *= a.effect.mult;
    }
    s.achDirty = false;
    s.sacDirty = true;
  }

  function checkAchievements(s) {
    var changed = false;
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      if (!a.cond || s.achs[a.id]) continue;
      if (a.cond(s)) { s.achs[a.id] = true; changed = true; }
    }
    if (changed) refreshAchCache(s);
    return changed;
  }

  // ---------------------------------------------------------------- 成本
  function dimCost(s, tier) {
    return DIM_BASE_COST[tier] * Math.pow(DIM_COST_MULT[tier], Math.floor(s.bought[tier] / 10));
  }
  function dimCostUntil10(s, tier) {
    return dimCost(s, tier) * (10 - (s.bought[tier] % 10));
  }
  function tickCost(s) { return TICKSPEED_BASE_COST * Math.pow(TICKSPEED_COST_MULT, s.ticksBought); }

  // ------------------------------------------------------------ 需求与解锁
  function dimBoostReq(boosts) {
    var target = boosts + 1;
    var tier = Math.min(target + 3, 8);
    var amount = 20;
    if (tier === 8) amount += (target - 5) * 15;
    return { tier: tier, amount: amount };
  }
  function galaxyReq(galaxies) {
    var amount = GALAXY_BASE_COST + galaxies * GALAXY_COST_MULT;
    if (galaxies >= GALAXY_COST_SCALING_START) {
      var d = galaxies - GALAXY_COST_SCALING_START + 1;
      amount += d * d + d;
    }
    return { tier: 8, amount: Math.floor(amount) };
  }
  function maxDims(boosts) { return boosts >= 4 ? 8 : boosts + 4; }
  function dimUnlocked(s, tier) {
    if (tier > maxDims(s.boosts)) return false;
    if (tier === 1) return true;
    return s.dims[tier - 1] > 0 || s.bought[tier - 1] > 0;
  }

  // ---------------------------------------------------------------- 倍率
  function ensureCaches(s) {
    if (s.achDirty) refreshAchCache(s);
    if (s.sacDirty) { s.sacBoost = sacrificeTotalBoost(s.sacrificed); s.sacDirty = false; }
  }

  /** 计算 1..8 全部维度倍率，写入 scratchM，并更新 maxDimMult */
  function computeMults(s) {
    ensureCaches(s);
    var power = s.achPower, mobile = s.platform === 'mobile' ? 2 : 1;
    var maxM = 0;
    for (var t = 1; t <= 8; t++) {
      var m = DIM_FLOW[t] * power * s.perDimAch[t];
      var b = Math.floor(s.bought[t] / 10);
      if (b) m *= Math.pow(BUY_TEN_MULT, b);
      var bp = s.boosts - t + 1;
      if (bp > 0) m *= Math.pow(DIMBOOST_MULT, bp);
      if (t === 8) m *= s.sacBoost;
      m *= mobile;
      scratchM[t] = m;
      if (m > maxM) maxM = m;
    }
    s.maxDimMult = maxM;
    return scratchM;
  }

  function ticksPerSecond(s) {
    ensureCaches(s);
    return Math.pow(tickSpeedFactor(s.galaxies), s.ticksBought) * s.tickAch;
  }

  /** 各维度每秒产量（写入 scratchP 并返回） */
  function productions(s) {
    var mult = computeMults(s);
    var tps = ticksPerSecond(s);
    for (var t = 1; t <= 8; t++) scratchP[t] = s.dims[t] * mult[t] * tps;
    return scratchP;
  }

  function amRate(s) { return productions(s)[1]; }

  // ------------------------------------------------------------ 时间推进
  function step(s, dt) {
    var M = maxDims(s.boosts);
    var p = productions(s);
    for (var t = M; t >= 2; t--) {
      var v = s.dims[t - 1] + p[t] * dt;
      s.dims[t - 1] = v;
    }
    var am = s.am + p[1] * dt;
    s.am = am > INFINITY_AM ? INFINITY_AM : am;
    s.time += dt;
    if (s.am >= 1e80) s.hold1e80 += dt; else s.hold1e80 = 0;
    return p;
  }

  // ---------------------------------------------------------------- 动作
  function buyDim(s, tier, count) {
    count = count || 1;
    var n = 0;
    for (; n < count; n++) {
      var c = dimCost(s, tier);
      if (c > s.am) break;
      s.am -= c;
      s.dims[tier] += 1;
      s.bought[tier] += 1;
    }
    return n;
  }
  function buyTick(s, count) {
    count = count || 1;
    var n = 0;
    for (; n < count; n++) {
      var c = tickCost(s);
      if (c > s.am) break;
      s.am -= c;
      s.ticksBought += 1;
    }
    return n;
  }
  function canSacrifice(s) { return s.boosts >= 5 && s.dims[8] > 0 && s.dims[1] > 0; }
  function doSacrifice(s) {
    var boost = sacrificeBoost(s.dims[1], s.sacrificed);
    s.sacrificed += s.dims[1];
    for (var t = 1; t <= 7; t++) s.dims[t] = 0;   // sacrifice.js: resetAmountUpToTier(7)
    s.sacDirty = true;
    return boost;
  }
  function doDimBoost(s) {
    s.boosts += 1;
    for (var t = 1; t <= 8; t++) { s.dims[t] = 0; s.bought[t] = 0; }
    s.ticksBought = 0; s.sacrificed = 0; s.am = 0;
    s.sacDirty = true; s.hold1e80 = 0;
    grantInevitables(s);
  }
  function doGalaxy(s) {
    s.galaxies += 1; s.boosts = 0;
    for (var t = 1; t <= 8; t++) { s.dims[t] = 0; s.bought[t] = 0; }
    s.ticksBought = 0; s.sacrificed = 0; s.am = 0;
    s.sacDirty = true; s.hold1e80 = 0;
    grantInevitables(s);
  }
  function requirementMet(s, req) { return s.dims[req.tier] >= req.amount; }

  // ------------------------------------------------------------------ 导出
  global.AD = {
    DIM_BASE_COST: DIM_BASE_COST, DIM_COST_MULT: DIM_COST_MULT, DIM_FLOW: DIM_FLOW,
    TICKSPEED_BASE_COST: TICKSPEED_BASE_COST, TICKSPEED_COST_MULT: TICKSPEED_COST_MULT,
    BUY_TEN_MULT: BUY_TEN_MULT, DIMBOOST_MULT: DIMBOOST_MULT,
    GALAXY_BASE_COST: GALAXY_BASE_COST, GALAXY_COST_MULT: GALAXY_COST_MULT,
    START_AM: START_AM, INFINITY_AM: INFINITY_AM,
    ACHIEVEMENTS: ACHIEVEMENTS, ACH_BY_ID: ACH_BY_ID, TICK_BASE_M: TICK_BASE_M,
    ACH_MULT: ACH_MULT, ACH_ROW_MULT: ACH_ROW_MULT,

    tickSpeedIntervalMult: tickSpeedIntervalMult, tickSpeedFactor: tickSpeedFactor,
    sacrificeTotalBoost: sacrificeTotalBoost, sacrificeBoost: sacrificeBoost,
    newState: newState, cloneState: cloneState, grantInevitables: grantInevitables,
    achCount: achCount, achRows: achRows, refreshAchCache: refreshAchCache,
    checkAchievements: checkAchievements,
    dimCost: dimCost, dimCostUntil10: dimCostUntil10, tickCost: tickCost,
    dimBoostReq: dimBoostReq, galaxyReq: galaxyReq,
    maxDims: maxDims, dimUnlocked: dimUnlocked,
    computeMults: computeMults, ticksPerSecond: ticksPerSecond,
    productions: productions, amRate: amRate,
    step: step, buyDim: buyDim, buyTick: buyTick,
    canSacrifice: canSacrifice, doSacrifice: doSacrifice,
    doDimBoost: doDimBoost, doGalaxy: doGalaxy,
    requirementMet: requirementMet
  };
})(typeof window !== 'undefined' ? window : globalThis);
