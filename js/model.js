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
  // ── 无限维度（源码 dimensions/infinity-dimension.js）──────────────────
  //   UNLOCK 用「本次永恒内的最高 AM」判定；ID1 额外需要 1e8 IP
  var ID_UNLOCK = [0, 1e1100, 1e1900, 1e2400, 1e10500, 1e30000, 1e45000, 1e54000, 1e60000];
  var ID_BASE_COST = [0, 1e8, 1e9, 1e10, 1e20, 1e140, 1e200, 1e250, 1e280];
  var ID_COST_MULT = [0, 1e3, 1e6, 1e8, 1e10, 1e15, 1e20, 1e25, 1e30];
  var ID_POWER_MULT = [0, 50, 30, 10, 5, 5, 5, 5, 5];   // 每次购买给的倍率底数
  var ID_POWER_CONV = 7;                                  // 无限之力 → AD 倍率 = IPower^7

  // C6 专用价格表（源码 antimatter-dimension.js 的 _c6BaseCost / _c6BaseCostMultiplier）
  var C6_BASE_COST = [0, 10, 100, 100, 500, 2500, 2e4, 2e5, 4e6];
  var C6_BASE_COST_MULT = [0, 1e3, 5e3, 1e4, 1.2e4, 1.8e4, 2.6e4, 3.2e4, 4.2e4];
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
  /** C5 的专用基准：1.1245 → 1.080 */
  var TICK_BASE_M_C5 = [1 / 1.08, 1 / 1.07632 - 0.02, 1 / 1.072 - 0.04];
  // 星系强度倍率对"有效星系数"的作用（tickspeed.js: Effects.product(...)）
  var TICK_RAW = [1 / 1.1245, 1 / 1.11888888, 1 / 1.11267177];
  var TICK_RAW_C5 = [1 / 1.08, 1 / 1.07632, 1 / 1.072];
  function galaxyStrength(s) {
    var e = 1;
    if (s && s.iu && s.iu.galaxyBoost) e *= 2;          // 无限升级 IU42
    if (s && s.achs) { if (s.achs[86]) e *= 1.01; if (s.achs[178]) e *= 1.01; }
    return e;
  }
  function tickSpeedIntervalMultOf(s) {
    var g = (s && s.galaxies) || 0, e = galaxyStrength(s);
    var base = (s && s.challenge === 5) ? 0.83 : 0.8;
    if (g < 3) {
      var tbl = (s && s.challenge === 5) ? TICK_RAW_C5 : TICK_RAW;
      return Math.max(0.01, tbl[g] - 0.02 * g * e);
    }
    return base * Math.pow(0.965, (g - 2) * e - 2);
  }
  function tickSpeedFactorOf(s) { return 1 / tickSpeedIntervalMultOf(s); }
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
    // r43：第 t 维度获得 1+0.01t 倍（8 维 +8%、7 维 +7%……）——用 reward 文本还原
    { id: 43, row: 5, name: '反向表格(维度倍率按 tier 递增)',
      effect: { dims: [1, 2, 3, 4, 5, 6, 7, 8], mult: 1.0 }, cond: null, perTier: 0.01 },
    { id: 71, row: 8, name: 'ERROR 909(C2 内仅 1 个第1维通关)', effect: { dim: 1, mult: 3 } },
    { id: 32, row: 3, name: '诸神喜悦(C8 外献祭倍率>=600)',
      cond: function (s) { return s.challenge !== 8 && totalBoostOf(s) >= 600; } },
    { id: 57, row: 3, name: '诸神的赠礼(C8 内 3 分钟内通关)',
      cond: function (s) { return s.challenge === 8 && s.time <= 180; } },
    { id: 88, row: 8, name: '再一次无限引用(单次献祭>=1.797e308)',
      cond: function (s) { return s.maxSacNext >= 1.7976931348623157e308; } },
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

  /**
   * 献祭指数（sacrifice.js: Sacrifice.sacrificeExponent）
   *   普通：base=2；C8：base=1；IC2 完成后 base=1/120
   *   exponent = base × (1 + ach32 + ach57) × (1 + ach88 + TS228) × TS304
   *   成就 32 / 57 / 88 各自 effect = 0.1（源码核对），首次现实前 TS228/TS304 不可得
   */
  function sacExp(s) {
    var a = (s && s.achs) || {};
    var pre = 1 + (a[32] ? 0.1 : 0) + (a[57] ? 0.1 : 0);
    var post = 1 + (a[88] ? 0.1 : 0);
    var base = (s && s.challenge === 8) ? 1 : 2;
    return base * pre * post;
  }
  /** 一次献祭的倍率增益（Sacrifice.nextBoost） */
  function sacrificeNextBoost(s, nd1Amount) {
    if (!(nd1Amount > 0)) return 1;
    var sac = Math.max(s.sacrificed, 1);
    var pre;
    if (s.challenge === 8) {
      // C8 专用：nd1^0.05/sacrificed^0.04 × nd1^0.05/(sacrificed+nd1)^0.04
      pre = Math.max(Math.pow(nd1Amount, 0.05) / Math.pow(sac, 0.04), 1)   // 源码：第一项先 clampMin(1)
          * (Math.pow(nd1Amount, 0.05) / Math.pow(sac + nd1Amount, 0.04));
    } else {
      pre = (Math.log10(nd1Amount) / 10) / Math.max(Math.log10(sac) / 10, 1);
    }
    return Math.pow(Math.max(pre, 1), sacExp(s));
  }
  /** 献祭对第 8 维度的累计倍率（sacrifice.js: Sacrifice.totalBoost） */
  function sacrificeTotalBoost(sacrificed) {
    if (!(sacrificed > 0)) return 1;
    return Math.pow(Math.max(Math.log10(sacrificed) / 10, 1), 2);
  }
  /** 携带 state 的版本（C8 走 chall8Sac，且指数随成就变化） */
  function totalBoostOf(s) {
    if (s.challenge === 8) return Math.max(s.chall8Sac || 1, 1);
    if (!(s.sacrificed > 0)) return 1;
    return Math.pow(Math.max(Math.log10(s.sacrificed) / 10, 1), sacExp(s));
  }
  /** 一次献祭的倍率增益 = new/old（兼容第一阶段旧接口） */
  function sacrificeBoost(nd1Amount, sacrificed) {
    return sacrificeTotalBoost(sacrificed + nd1Amount) / sacrificeTotalBoost(sacrificed);
  }

  /**
   * 重置后的起始反物质（currency.js: antimatter.startingValue）
   *   max(10, ach21=100, ach37=5000, ach54=5e5, ach55, ach78)
   */
  function startingAM(s) {
    var a = (s && s.achs) || {};
    var v = 10;
    if (a[21]) v = Math.max(v, 100);
    if (a[37]) v = Math.max(v, 5000);
    if (a[54]) v = Math.max(v, 5e5);
    if (a[55]) v = Math.max(v, 1e6);
    if (a[78]) v = Math.max(v, 1e10);
    return v;
  }

  /** 重置后起始维度提升数（skipReset 系列）；挑战中无效（dimboost.js 源码） */
  function startingBoosts(s) {
    if (!s || (s.challenge && s.challenge > 0)) return 0;
    var iu = s.iu || {};
    if (iu.skipResetGalaxy) return 4;
    if (iu.skipReset3) return 3;
    if (iu.skipReset2) return 2;
    if (iu.skipReset1) return 1;
    return 0;
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
      // ---- 第二阶段扩展（默认全关，不影响第一阶段） ----
      challenge: opts.challenge || 0,   // 0 = 无挑战；1..12 = 普通挑战
      chall2Pow: 1, chall3Pow: 0.01, chall8Sac: 1, normalMatter: 0,
      maxSacNext: 1,            // 单次献祭最大倍率（成就 88）
      // ---- 无限维度（打破无限后才存在；默认关闭，不影响第一阶段与 S1）----
      brk: !!opts.brk,          // 是否已打破无限
      idAmt: [0,0,0,0,0,0,0,0,0], idBought: [0,0,0,0,0,0,0,0,0],
      infPower: 0, maxAMAll: opts.maxAMAll || 0,
      crunches: 0, ip: opts.ip || 0, ipMult: opts.ipMult || 1,
      costBumps: [0, 0, 0, 0, 0, 0, 0, 0, 0], chall9TickBumps: 0, tSinceBuy: 1e9,
      infinitiesTotal: opts.infinitiesTotal || 0,
      iu: opts.iu ? Object.assign({}, opts.iu) : {},
      ipMultLv: opts.ipMultLv || 0,
      tTotal: 0,
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
      challenge: s.challenge, chall2Pow: s.chall2Pow, chall3Pow: s.chall3Pow,
      chall8Sac: s.chall8Sac, normalMatter: s.normalMatter, maxSacNext: s.maxSacNext,
      brk: s.brk, idAmt: s.idAmt.slice(), idBought: s.idBought.slice(),
      infPower: s.infPower, maxAMAll: s.maxAMAll,
      crunches: s.crunches, ip: s.ip, ipMult: s.ipMult,
      costBumps: s.costBumps.slice(), chall9TickBumps: s.chall9TickBumps, tSinceBuy: s.tSinceBuy,
      infinitiesTotal: s.infinitiesTotal, iu: Object.assign({}, s.iu), ipMultLv: s.ipMultLv,
      tTotal: s.tTotal,
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
      var full = true;
      for (var i = 1; i <= 8; i++) if (!s.achs[r * 10 + i]) { full = false; break; }
      if (full) rows++;
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
      if (a.perTier) for (var q = 1; q <= 8; q++) s.perDimAch[q] *= 1 + a.perTier * q;
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
    var c6 = s.challenge === 6;
    var base = c6 ? C6_BASE_COST[tier] : DIM_BASE_COST[tier];
    var mult = c6 ? C6_BASE_COST_MULT[tier] : DIM_COST_MULT[tier];
    var bump = s.costBumps ? s.costBumps[tier] : 0;
    return base * Math.pow(mult, Math.floor(s.bought[tier] / 10) + bump);
  }
  function dimCostUntil10(s, tier) {
    return dimCost(s, tier) * (10 - (s.bought[tier] % 10));
  }
  function tickCost(s) {
    return TICKSPEED_BASE_COST * Math.pow(TICKSPEED_COST_MULT,
      s.ticksBought + (s.chall9TickBumps || 0));
  }

  // ------------------------------------------------------------ 需求与解锁
  function dimBoostReq(boosts) {
    var target = boosts + 1;
    var tier = Math.min(target + 3, 8);
    var amount = 20;
    if (tier === 8) amount += (target - 5) * 15;
    return { tier: tier, amount: amount };
  }
  /** C10 里只有 6 个维度、提升成本改用第 6 维度 */
  function dimBoostReqC10(boosts) {
    var target = boosts + 1;
    var tier = Math.min(target + 3, 6);
    var amount = 20;
    if (tier === 6) amount += (target - 3) * 20;
    return { tier: 6, amount: amount };
  }
  function reqOf(s, kind) {
    var b = (s && s.boosts) || 0;
    if (kind === 'boost') {
      var r = (s && s.challenge === 10) ? dimBoostReqC10(b) : dimBoostReq(b);
      r.amount -= (s && s.iu && s.iu.resetBoost) ? 9 : 0;
      if (r.amount < 1) r.amount = 1;
      return r;
    }
    var g = (s && s.galaxies) || 0;
    var base = (s && s.challenge === 10) ? 99 : GALAXY_BASE_COST;
    var mult = (s && s.challenge === 10) ? 90 : GALAXY_COST_MULT;
    var tier = (s && s.challenge === 10) ? 6 : 8;
    var amount = base + g * mult;
    if (g >= GALAXY_COST_SCALING_START) {
      var d = g - GALAXY_COST_SCALING_START + 1;
      amount += d * d + d;
    }
    return { tier: tier, amount: Math.floor(amount) };
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
  /** 挑战感知的维度上限（C10 只有 6 个） */
  function maxDimsOf(s) { return s.challenge === 10 ? 6 : maxDims(s.boosts); }
  function dimUnlocked(s, tier) {
    if (tier > maxDims(s.boosts)) return false;
    if (tier === 1) return true;
    return s.dims[tier - 1] > 0 || s.bought[tier - 1] > 0;
  }

  // ---------------------------------------------------------------- 倍率
  function ensureCaches(s) {
    if (s.achDirty) refreshAchCache(s);
    if (s.sacDirty) { s.sacBoost = totalBoostOf(s); s.sacDirty = false; }
  }

  /** 计算 1..8 全部维度倍率，写入 scratchM，并更新 maxDimMult */
  function computeMults(s) {
    ensureCaches(s);
    var power = s.achPower, mobile = s.platform === 'mobile' ? 2 : 1;
    var c = s.challenge || 0, iu = s.iu || {};
    // 无限升级的公共倍率
    var iuCommon = 1;
    if (iu.dim18 || iu.dim27 || iu.dim36 || iu.dim45) {
      iuCommon *= 1 + (s.infinitiesTotal || 0) * 0.2;
    }
    if (iu.timeMult) iuCommon *= Math.pow(Math.max((s.tTotal || s.time || 0) / 120, 1), 0.15);
    if (iu.timeMult2) {
      var v2 = Math.pow(Math.max((s.tTotal || s.time || 0) / 240, 1), 0.25);
      if (v2 > 1) iuCommon *= v2;
    }
    if (iu.buy10) iuCommon *= 1;                       // buy10 只影响买十倍率，见下
    iuCommon *= infPowerEffect(s);                     // 无限之力^7（仅打破无限后）
    // 买满 10 个的倍率（C7 会被压到 ×1，每次提升 +0.2）
    var buy10 = BUY_TEN_MULT;
    if (iu.buy10) buy10 *= 1.1;
    if (c === 7) buy10 = Math.min(2, 1 + (s.boosts || 0) / 5);
    // 维度提升倍率（C8 完全不提供）
    var dbPower = DIMBOOST_MULT;
    if (iu.resetMult) dbPower = 2.5;
    if (c === 8) dbPower = 1;
    // C2 的产量因子
    var p2 = (c === 2) ? s.chall2Pow : 1;
    var maxM = 0;
    for (var t = 1; t <= 8; t++) {
      var m = DIM_FLOW[t] * power * s.perDimAch[t] * iuCommon * p2;
      var b = Math.floor(s.bought[t] / 10);
      if (b) m *= Math.pow(buy10, b);
      var bp = s.boosts - t + 1;
      if (bp > 0) m *= Math.pow(dbPower, bp);
      if (t === 8) m *= s.sacBoost;
      if (t === 1 && c === 3) m *= s.chall3Pow;        // C3：第 1 维度弱化+指数倍率
      if (t === 1 && iu.unspentIP && (s.ip || 0) > 0) {
        m *= Math.pow(Math.max(s.ip / 2, 1), 1.5);
      }
      if (c === 12 && (t === 2 || t === 4 || t === 6) && s.dims[t] > 1) {
        m *= Math.pow(s.dims[t], t === 2 ? 0.6 : (t === 4 ? 0.4 : 0.2));
      }
      m *= mobile;
      scratchM[t] = m;
      if (m > maxM) maxM = m;
    }
    s.maxDimMult = maxM;
    return scratchM;
  }

  function ticksPerSecond(s) {
    ensureCaches(s);
    return Math.pow(tickSpeedFactorOf(s), s.ticksBought) * s.tickAch;
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
    var M = maxDimsOf(s);
    var p = productions(s);
    if (s.challenge === 12) {
      // C12：每个维度产出「低 2 档」的维度；第 1、2 维度都产反物质
      for (var t12 = M; t12 >= 3; t12--) s.dims[t12 - 2] += p[t12] * dt;
      var am12 = s.am + (p[1] + p[2]) * dt;
      s.am = am12 > INFINITY_AM ? INFINITY_AM : am12;
    } else {
      for (var t = M; t >= 2; t--) s.dims[t - 1] += p[t] * dt;
      var am = s.am + p[1] * dt;
      s.am = am > INFINITY_AM ? INFINITY_AM : am;
    }
    s.time += dt;
    if (s.am > (s.maxAMAll || 0)) s.maxAMAll = s.am;
    idTick(s, dt);

    // ---- 挑战的每帧演化（normal-challenges.js: updateNormalAndInfinityChallenges）
    if (s.challenge === 2) {
      s.chall2Pow = Math.min(s.chall2Pow + dt / 180, 1);          // diff/100/1800（ms→s）
    } else if (s.challenge === 3) {
      s.chall3Pow = Math.min(s.chall3Pow * Math.pow(1.00038, dt * 10), 1.7976931348623157e308);
    } else if (s.challenge === 11) {
      if (s.dims[2] !== 0) {
        if (!(s.normalMatter > 0)) s.normalMatter = 1;
        var cappedBase = 1.03 + Math.min(s.boosts, 400) / 200 + Math.min(s.galaxies, 100) / 100;
        s.normalMatter *= Math.pow(cappedBase, dt * 50);           // diff/20（ms→s）
        if (s.normalMatter > s.am && s.am < INFINITY_AM) {
          for (var k = 1; k <= 8; k++) { s.dims[k] = 0; s.bought[k] = 0; }
          s.ticksBought = 0; s.sacrificed = 0; s.sacDirty = true;
          s.am = startingAM(s); s.normalMatter = 0;
        }
      }
    }
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
      if (s.bought[tier] % 10 === 9) costBump(s, tier);   // 第 10 个 → 同价跳档
      s.dims[tier] += 1;
      s.bought[tier] += 1;
      if (s.challenge === 2) s.chall2Pow = 0;
      if (s.challenge === 4) for (var k = 1; k < tier; k++) s.dims[k] = 0;
      n++;
    }
    return n;
  }
  /** C9：买满 10 个维度时，所有「同价位」（成本指数相同）的东西跳到下一档 */
  function costBump(s, tier) {
    if (s.challenge !== 9) return;
    var e = Math.floor(Math.log10(dimCost(s, tier)));
    for (var k = 1; k <= 8; k++) {
      if (k === tier) continue;
      if (Math.floor(Math.log10(dimCost(s, k))) === e) s.costBumps[k] += 1;
    }
    if (Math.floor(Math.log10(tickCost(s))) === e) s.chall9TickBumps += 1;
  }
  /** C9：买计数频率时同理 */
  function costBumpTick(s) {
    if (s.challenge !== 9) return;
    var e = Math.floor(Math.log10(tickCost(s)));
    for (var k = 1; k <= 8; k++) {
      if (Math.floor(Math.log10(dimCost(s, k))) === e) s.costBumps[k] += 1;
    }
  }
  function buyTick(s, count) {
    count = count || 1;
    var n = 0;
    for (; n < count; n++) {
      var c = tickCost(s);
      if (c > s.am) break;
      s.am -= c;
      costBumpTick(s);
      s.ticksBought += 1;
      if (s.challenge === 2) s.chall2Pow = 0;
    }
    return n;
  }
  function canSacrifice(s) {
    if (s.challenge === 10) return false;                    // C10 没有第 8 维度
    return s.boosts >= 5 && s.dims[8] > 0 && s.dims[1] > 0;
  }
  function doSacrifice(s) {
    var nd1 = s.dims[1];
    var next = sacrificeNextBoost(s, nd1);
    if (next >= 1.7976931348623157e308 && s.maxSacNext < next) { /* 成就 88 用 */ }
    if (next > (s.maxSacNext || 1)) s.maxSacNext = next;
    // 源码：sacrificed 两种模式下都会累加（sacrifice.js 第 125 行不分模式）
    s.sacrificed += nd1;
    if (s.challenge === 8) {
      s.chall8Sac = Math.max(s.chall8Sac || 1, 1) * next;     // C8：跨献祭累积的专属倍率
      for (var t8 = 1; t8 <= 8; t8++) { s.dims[t8] = 0; s.bought[t8] = 0; }
      s.ticksBought = 0;
      s.am = startingAM(s);
    } else {
      var upto = (s.challenge === 12) ? 6 : 7;                // sacrifice.js: resetAmountUpToTier
      for (var t = 1; t <= upto; t++) s.dims[t] = 0;
    }
    s.sacDirty = true;
    return next;
  }
  /** 一次「包括 skipReset 在内」的完整重置（dimboost.js: softReset + skipResetsIfPossible） */
  function applyReset(s) {
    for (var t = 1; t <= 8; t++) { s.dims[t] = 0; s.bought[t] = 0; s.costBumps[t] = 0; }
    s.ticksBought = 0; s.chall9TickBumps = 0;
    s.sacrificed = 0; s.chall8Sac = 1; s.normalMatter = 0;
    s.am = startingAM(s); s.maxAM = s.am;
    s.sacDirty = true; s.hold1e80 = 0;
    // skipReset 系列：重置后保证至少有 N 个维度提升（挑战中无效）
    var sb = startingBoosts(s);
    if (sb > 0) {
      if (s.boosts < sb) s.boosts = sb;
      if ((s.iu || {}).skipResetGalaxy && s.galaxies === 0) s.galaxies = 1;
    }
    grantInevitables(s);
  }
  function doDimBoost(s) {
    s.boosts += 1;
    applyReset(s);
    if (s.boosts < 1) s.boosts = 1;
  }
  function doGalaxy(s) {
    if (s.challenge === 8 || s.challenge === 10) return false;   // C8/C10 不能买星系
    s.galaxies += 1; s.boosts = 0;
    applyReset(s);
    return true;
  }

  /**
   * 大坍缩（big-crunch.js）
   *   IP = floor( IPmult × 10^(log10(maxAM)/308 − 0.75) )
   *   重置：boosts=0, galaxies=0, 维度/计数频率/献祭全部清空（skipReset 重新给）
   */
  function bigCrunch(s) {
    if (s.am < INFINITY_AM && s.maxAM < INFINITY_AM) return null;
    var gained = ipGain(s);
    s.ip += gained; s.crunches += 1; s.infinitiesTotal += 1;
    s.t = 0; s.tTotal += 0;
    s.boosts = 0; s.galaxies = 0;
    applyReset(s);
    idReset(s);            // 无限之力清零、ID 数量回到 baseAmount
    return gained;
  }
  // ------------------------------------------------ 无限维度 / 无限之力
  function idUnlocked(s, t) {
    if (!s.brk) return false;
    if (t === 1 && !(s.ip >= 1e8)) return false;        // ID1 额外要 1e8 IP（pre-eternity）
    return (s.maxAMAll || 0) >= ID_UNLOCK[t];
  }
  /** 第 t 层倍率：含 powerMultiplier^(已购次数) —— 50^p / 30^p / 10^p / 5^p */
  function idMult(s, t) { return Math.pow(ID_POWER_MULT[t], s.idBought[t]); }
  function idProduction(s, t) { return s.idAmt[t] * idMult(s, t); }
  function idCost(s, t) { return ID_BASE_COST[t] * Math.pow(ID_COST_MULT[t], s.idBought[t]); }
  /** 买 1 次 = amount 与 baseAmount 同时 +10（永久保留，源码 269~270 行） */
  function buyID(s, t) {
    if (!idUnlocked(s, t)) return false;
    var c = idCost(s, t);
    if (!(s.ip >= c)) return false;
    s.ip -= c; s.idAmt[t] += 10; s.idBought[t] += 1;
    return true;
  }
  function buyMaxID(s, t) {
    var k = 0;
    while (k++ < 2000 && buyID(s, t)) { /* keep buying */ }
    return k - 1;
  }
  /**
   * 大坍缩 / 进入挑战时的无限维度处理（源码 InfinityDimensions.resetAmount）
   *   无限之力 → 0；每个 ID 的 amount → baseAmount（= 10 × 已购次数，**不清零**）
   *   这就是"挑战里加成仍然有用"的来源：买过的 ID 不会丢
   */
  function idReset(s) {
    s.infPower = 0;
    for (var t = 1; t <= 8; t++) s.idAmt[t] = s.idBought[t] * 10;
  }
  /** 每帧：ID8→ID2 依次给下一层，ID1 产无限之力 */
  function idTick(s, dt) {
    if (!s.brk) return;
    for (var t = 8; t >= 2; t--) {
      if (!idUnlocked(s, t)) continue;
      s.idAmt[t - 1] += idProduction(s, t) * dt / 10;      // produceDimensions(diff/10)
    }
    if (idUnlocked(s, 1)) s.infPower += idProduction(s, 1) * dt / 1000;
  }
  /** 无限之力给全部反物质维度的倍率 = IPower^7（下限 1） */
  function infPowerEffect(s) {
    if (!s.brk || !(s.infPower > 1)) return 1;
    var v = Math.pow(s.infPower, ID_POWER_CONV);
    return isFinite(v) ? v : 1.7976931348623157e308;
  }
  function ipGain(s) {
    var maxAM = Math.max(s.maxAM, s.am, 1);
    var logv = Math.log10(maxAM) / 308 - 0.75;
    if (logv < 0) return 0;
    return Math.floor(Math.pow(10, logv) * (s.ipMult || 1));
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
    requirementMet: requirementMet,
    s1: {
      sacExp: sacExp, sacrificeNextBoost: sacrificeNextBoost, totalBoostOf: totalBoostOf,
      startingAM: startingAM, startingBoosts: startingBoosts,
      applyReset: applyReset, bigCrunch: bigCrunch, ipGain: ipGain,
      costBump: costBump, costBumpTick: costBumpTick,
      maxDimsOf: maxDimsOf, reqOf: reqOf, tickSpeedFactorOf: tickSpeedFactorOf
    },
    id: {
      UNLOCK: ID_UNLOCK, BASE_COST: ID_BASE_COST, COST_MULT: ID_COST_MULT,
      POWER_MULT: ID_POWER_MULT, POWER_CONV: ID_POWER_CONV,
      unlocked: idUnlocked, mult: idMult, production: idProduction, cost: idCost,
      buy: buyID, buyMax: buyMaxID, reset: idReset, tick: idTick,
      infPowerEffect: infPowerEffect
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
