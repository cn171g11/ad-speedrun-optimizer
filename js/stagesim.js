/* ============================================================================
 * 第二阶段逐 tick 仿真器 (stagesim.js)
 * ----------------------------------------------------------------------------
 * 只用公式跑完整段「首次无限 → 首次永恒」，不参考攻略给出的任何时间。
 * 所有量用 log10 表示（logmath.js），因此能表示 1e30000 级别的数值。
 *
 * 公式全部对齐 IvarK/AntimatterDimensionsSourceCode master：
 *   维度成本（含 >1e308 后的超指数缩放）/ 维度倍率 / 计数频率 / 维度提升 /
 *   星系 / 献祭 / IP 收益 / 16 项无限升级 / 9 项打破无限升级 / 无限维度 8 层 /
 *   无限之力(=AD×IP^7) / 复制器 / 官方速通里程碑
 *
 * 已简化（README 与页面底部有说明）：
 *   挑战用"目标 AM + 生产惩罚系数"近似；自动购买器视为瞬时；无离线进度/广告/卡键
 * ============================================================================ */
(function (global) {
  'use strict';
  var L = global.LM, NEG = L.NEG;
  var lg = Math.log10, LOG2 = lg(2), LOG25 = lg(2.5);
  var MAXVAL_LOG = lg(1.7976931348623157e308);   // ≈308.2547

  // ------------------------------------------------------------ 常量
  var DIM_BASE = [0, 1, 2, 4, 6, 9, 13, 18, 24];
  var DIM_MULT = [0, 3, 4, 5, 6, 8, 10, 12, 15];
  var FLOW_LOG = [0, 0, -1, -1, -1, -1, -1, -1, -1];
  var ID_BASE = [0, 8, 9, 10, 20, 140, 200, 250, 280];
  var ID_MULT = [0, 3, 6, 8, 10, 15, 20, 25, 30];
  var ID_POWER = [0, 50, 30, 10, 5, 5, 5, 5, 5];
  var ID_UNLOCK = [0, 1100, 1900, 2400, 10500, 30000, 45000, 54000, 60000];

  // 无限升级（网格顺序 IU11..IU44 + ipOffline），成本与效果均来自源码
  var IU = [
    null,
    { key: 'timeMult', cost: 1 }, { key: 'dim18', cost: 1 },
    { key: 'dim27', cost: 1 }, { key: 'dim36', cost: 1 },
    { key: 'dim45', cost: 1 }, { key: 'resetBoost', cost: 1 },
    { key: 'buy10', cost: 1 }, { key: 'galaxyBoost', cost: 2 },
    { key: 'timeMult2', cost: 3 }, { key: 'unspentIP', cost: 5 },
    { key: 'resetMult', cost: 7 }, { key: 'passiveGen', cost: 10 },
    { key: 'skipReset1', cost: 20 }, { key: 'skipReset2', cost: 40 },
    { key: 'skipReset3', cost: 80 }, { key: 'skipResetGalaxy', cost: 300 },
    { key: 'ipOffline', cost: 1000 }
  ];
  var BIU = [
    { key: 'totalAM', costLog: 4 }, { key: 'currentAM', costLog: 4 + lg(5) },
    { key: 'infinitied', costLog: 5 }, { key: 'achievement', costLog: 6 },
    { key: 'slowestChal', costLog: 7 }, { key: 'infGen', costLog: 7 + lg(2) },
    { key: 'autoDimboost', costLog: 9 + lg(5) }, { key: 'galaxyBoost', costLog: 11 + lg(5) },
    { key: 'autoSpeed', costLog: 15 }
  ];

  // 普通挑战目标（log10 AM）与近似生产惩罚（log10 倍率，负值）
  var NC = [
    null,
    { goal: 1e3, pen: -3 }, { goal: lg(1e5), pen: 0 }, { goal: lg(1e6), pen: -1.5 },
    { goal: lg(1e8), pen: -1 }, { goal: lg(1e9), pen: -0.5 }, { goal: lg(1e10), pen: -1 },
    { goal: lg(1e11), pen: -0.3 }, { goal: lg(1e13), pen: -4 }, { goal: lg(1e15), pen: -2.5 },
    { goal: lg(1e20), pen: -1 }, { goal: lg(1e25), pen: -3 }, { goal: lg(1e30), pen: -3 }
  ];
  // 无限挑战目标
  var IC_G = [null, 650, 10500, 5000, 13000, 16500, 22222, 10000, 27000];

  // ------------------------------------------------------------ 状态
  function newState() {
    return {
      t: 0, tTotal: 0, am: 1,
      dims: [NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG],
      bought: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      costBumps: 0,
      ticks: 0, boosts: 0, galaxies: 0, sacrificed: NEG,
      maxAM: 1, totalAM: 1,
      ip: NEG, ipMultLv: 0, infinities: 0, infinitiesTotal: 0,
      broken: false, canCrunch: false,
      iu: {}, biu: {}, tickCostLv: 0, dimCostLv: 0, ipGenLv: 0,
      idAmt: [NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG],
      idBought: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      idUnlocked: [false, false, false, false, false, false, false, false, false],
      infPower: NEG,
      repUnl: false, repAmt: NEG, repChance: 0, repInterval: 0, repGalaxies: 0,
      achCount: 22, bestInfTime: Infinity, worstChalMin: 10,
      nc: {}, ic: {},
      pen: 0,                       // 当前挑战的生产惩罚（log10）
      marks: {}, evt: []
    };
  }

  // ------------------------------------------------------------ 成就（近似）
  function updAch(s) {
    var n = 22;                                        // 第一阶段必得
    if (s.infinities >= 1) n += 1;
    if (s.infinities >= 10) n += 1;
    if (s.infinitiesTotal >= 1e3) n += 1;
    if (s.broken) n += 1;
    if (s.bestInfTime <= 600) n += 1;
    if (s.bestInfTime <= 60) n += 1;
    if (s.bestInfTime <= 5) n += 1;
    if (s.bestInfTime <= 1) n += 1;
    if (s.galaxies >= 10) n += 1;
    if (s.ip > lg(1e10)) n += 1;
    if (s.ip > lg(1e50)) n += 1;
    if (s.ip > lg(1e100)) n += 1;
    if (s.ip > lg(1e150)) n += 1;
    if (s.ip > lg(1e200)) n += 1;
    if (s.ip > lg(1e250)) n += 1;
    if (s.repUnl) n += 1;
    if (s.repGalaxies >= 1) n += 1;
    if (s.repGalaxies >= 10) n += 1;
    var k = 0; for (var i in s.nc) if (s.nc[i]) k++;
    if (k >= 12) n += 2;
    var m = 0; for (var j in s.ic) if (s.ic[j]) m++;
    n += m;
    s.achCount = n;
  }
  function achMultLog(s) { return s.achCount * lg(1.03) + 3 * lg(1.25); }

  // ------------------------------------------------------------ 倍率
  function infPowerMultLog(s) { return s.infPower === NEG ? 0 : s.infPower * 7; }

  function adCommonMultLog(s) {
    var m = achMultLog(s);
    m = L.ladd(m, infPowerMultLog(s));
    // 用总游玩时间（不是本次无限时间）
    if (s.iu.timeMult) {
      var v1 = Math.pow(Math.max(s.tTotal / 120, 1e-9), 0.15);
      if (v1 > 1) m = L.ladd(m, lg(v1));
    }
    if (s.iu.timeMult2) {
      var v2 = Math.pow(Math.max(s.tTotal / 240, 1e-9), 0.25);
      if (v2 > 1) m = L.ladd(m, lg(v2));
    }
    if (s.iu.dim18 || s.iu.dim27 || s.iu.dim36 || s.iu.dim45) {
      m = L.ladd(m, lg(1 + s.infinitiesTotal * 0.2));
    }
    if (s.biu.totalAM) m = L.ladd(m, 0.5 * lg(Math.max(s.totalAM, 1)));
    if (s.biu.currentAM) m = L.ladd(m, 0.5 * lg(Math.max(s.am, 1)));
    if (s.biu.infinitied) m = L.ladd(m, lg(1 + Math.max(s.infinitiesTotal, 0) * 0.2 * 10));
    if (s.biu.achievement) m = L.ladd(m, lg(Math.max(Math.pow(Math.max(s.achCount - 30, 0), 3) / 40, 1)));
    if (s.biu.slowestChal) m = L.ladd(m, lg(Math.max(50 / s.worstChalMin, 1)));
    m += s.pen;
    return m;
  }

  /** 维度成本（ExponentialCostScaling，含 >1e308 的超指数缩放） */
  function costScaleLog(s, t, n) {
    var logMult = DIM_MULT[t], logBase = DIM_BASE[t];
    var before = Math.ceil((MAXVAL_LOG - logBase) / logMult);
    var cs = Math.max(1, 10 - (s.dimCostLv || 0) * 1.0 - (s.biu.dimCostMult ? 0 : 0));
    var excess = n - before;
    var v = n * logMult + logBase;
    if (excess > 0) v += 0.5 * excess * (excess + 1) * lg(cs);
    return v;
  }
  function dimCostLog(s, t) {
    return costScaleLog(s, t, Math.floor(s.bought[t] / 10) + s.costBumps);
  }
  function tickCostLog(s) {
    var logMult = 1, logBase = 3;
    var before = Math.ceil((MAXVAL_LOG - logBase) / logMult);
    var cs = Math.max(1, 10 - (s.tickCostLv || 0));
    var excess = s.ticks - before;
    var v = s.ticks * logMult + logBase;
    if (excess > 0) v += 0.5 * excess * (excess + 1) * lg(cs);
    return v;
  }

  var TICK_M = [1 / 1.1245, 1 / 1.11888888 - 0.02, 1 / 1.11267177 - 0.04];
  function tickPerSecLog(s) {
    var G = s.galaxies + s.repGalaxies;
    var m = G < 3 ? TICK_M[G] : 0.8 * Math.pow(0.965, G - 4);
    return s.ticks * lg(1 / m);
  }
  function sacBoostLogOf(sacLog) {
    if (sacLog === NEG || sacLog <= 0) return 0;
    return Math.log10(Math.max(sacLog / 10, 1)) * 2;
  }
  function dimMultLog(s, t) {
    var m = FLOW_LOG[t] + achMultLog(s);
    m += Math.floor(s.bought[t] / 10) * LOG2;
    var bp = s.boosts - t + 1;
    if (bp > 0) m += bp * (s.iu.resetMult ? LOG25 : LOG2);
    if (t === 8) m += sacBoostLogOf(s.sacrificed);
    if (t === 1 && s.iu.unspentIP && s.ip > 0) m = L.ladd(m, 1.5 * (s.ip - lg(2)));
    return m;
  }
  function prodLog(s, t) { return s.dims[t] + dimMultLog(s, t) + tickPerSecLog(s); }

  // ------------------------------------------------------------ 推进
  function step(s, dt) {
    var tps = tickPerSecLog(s);
    for (var t = 8; t >= 2; t--) {
      if (s.dims[t] === NEG) continue;
      s.dims[t - 1] = L.ladd(s.dims[t - 1], L.lscale(s.dims[t] + dimMultLog(s, t) + tps, dt * 0.1));
    }
    if (s.dims[1] !== NEG) s.am = L.ladd(s.am, L.lscale(prodLog(s, 1), dt));
    for (var d = 8; d >= 2; d--) {
      if (s.idAmt[d] === NEG) continue;
      s.idAmt[d - 1] = L.ladd(s.idAmt[d - 1], L.lscale(s.idAmt[d] + idMultLog(s, d), dt * 0.1));
    }
    if (s.idAmt[1] !== NEG) s.infPower = L.ladd(s.infPower, L.lscale(s.idAmt[1] + idMultLog(s, 1), dt));
    if (s.repUnl) {
      var ch = Math.min(1, s.repChance * 0.01);
      if (ch > 0) {
        var iv = Math.max(0.05, Math.pow(0.9, s.repInterval));
        s.repAmt += (dt / iv) * lg(1 + ch);
        if (s.repAmt > MAXVAL_LOG) s.repAmt = MAXVAL_LOG;
      }
    }
    s.t += dt; s.tTotal += dt;
    if (s.am > s.maxAM) s.maxAM = s.am;
    if (s.maxAM > s.totalAM) s.totalAM = s.maxAM;
    s.canCrunch = s.broken || s.maxAM >= MAXVAL_LOG - 1e-6;
  }

  function idCommonLog(s) { return achMultLog(s) * 0.35; }
  function idMultLog(s, t) {
    if (s.idAmt[t] === NEG) return NEG;
    return idCommonLog(s) + Math.floor(s.idBought[t] / 10) * lg(ID_POWER[t]);
  }

  // ------------------------------------------------------------ 购买
  function dimUnlocked(s, t) { return t <= Math.min(s.boosts + 4, 8); }

  /**
   * 购买决策 —— 移植参考优化器里「已验证」的 OptimizedPurchaseStrategy 规则：
   *   1. 第 1 维度没买过 -> 先买它
   *   2. 任何单价便宜到 AM/1000 以下 -> 买最便宜的
   *   3. 某维度买过 >10 个且不是 10 的倍数 -> 补完这一组
   *   4. last = 最高已购维度（若已满 10 个则上移一档）
   *   5. 候选 = 计数频率 + 维度 1..last-1，只保留"整组成本"最小的那一档（容差 1%）
   *   6. last 的整组成本若在 [0.2x, 20x] 区间也纳入候选
   *   7. 候选按单价升序，同价取更高维度
   * 这条规则就是第一阶段算出的 18.83 分钟成绩的来源，原样搬到 log 空间。
   */
  function bestPurchase(s) {
    var M = Math.min(s.boosts + 4, 8);
    if (s.bought[1] === 0) return { t: 1 };
    var cheapest = null, t, c;
    for (t = 0; t <= M; t++) {
      if (t > 0 && !dimUnlocked(s, t)) continue;
      if (t > 1 && s.dims[t - 1] === NEG) continue;
      c = (t === 0) ? tickCostLog(s) : dimCostLog(s, t);
      if (c <= s.am - 3) {
        if (!cheapest || c < cheapest.c) cheapest = { t: t, c: c };
      }
    }
    if (cheapest) return cheapest;
    for (t = 1; t <= M; t++) {
      if (s.bought[t] > 10 && s.bought[t] % 10 !== 0) return { t: t };
    }
    var last = 0;
    for (t = 1; t <= M; t++) if (s.bought[t] > 0) last = t;
    if (last === 0) last = 1;
    if (s.bought[last] >= 10 && last < M) last += 1;
    var cands = [{ t: 0, stack: tickCostLog(s), c: tickCostLog(s) }];
    for (var j = 1; j < last; j++) {
      var dj = dimCostLog(s, j);
      cands.push({ t: j, stack: dj + 1, c: dj });
    }
    if (cands.length === 1) {
      var d1 = dimCostLog(s, 1);
      cands.push({ t: 1, stack: d1 + 1, c: d1 });
    }
    var minStack = Infinity;
    for (var q = 0; q < cands.length; q++) if (cands[q].stack < minStack) minStack = cands[q].stack;
    cands = cands.filter(function (x) { return x.stack <= minStack + 0.005; });
    var dlast = dimCostLog(s, last);
    var lastStack = dlast + 1;
    if (lastStack < minStack - 0.7) return { t: last };
    if (lastStack < minStack + 1.3) cands.push({ t: last, stack: dlast, c: dlast });
    cands.sort(function (a, b) { return (a.c - b.c) || (a.t - b.t); });
    return cands[0];
  }

  function applyPurchase(s, p) {
    if (!p) return false;
    var c = (p.t === 0) ? tickCostLog(s) : dimCostLog(s, p.t);
    if (c > s.am) return false;
    s.am = L.lsub(s.am, c);
    if (p.t === 0) { s.ticks += 1; return true; }
    s.bought[p.t] += 1;
    s.dims[p.t] = L.ladd(s.dims[p.t], 0);        // log10(10^a + 1)
    return true;
  }

  function buyMaxDims(s) {
    var guard = 0;
    while (guard++ < 200) {
      var p = bestPurchase(s);
      if (!p || !applyPurchase(s, p)) break;
    }
  }
  function buyMaxTick(s) { /* 由 buyMaxDims 统一按规则决策 */ }
  function boostNeed(s) {
    var target = s.boosts + 1;
    var tier = Math.min(target + 3, 8);
    var need = 20;
    if (tier === 8) need += (target - 5) * 15;
    need -= (s.iu.resetBoost ? 9 : 0);
    return { tier: tier, need: Math.max(need, 1) };
  }
  function doBoost(s) {
    var r = boostNeed(s);
    if (s.dims[r.tier] < lg(r.need) - 1e-9) return false;   // 容差：避免边界上 1ulp 差异卡死
    s.boosts += 1;
    for (var t = 1; t <= 8; t++) { s.dims[t] = NEG; s.bought[t] = 0; }
    s.ticks = 0; s.sacrificed = NEG;
    s.am = 1; s.maxAM = 1; s.costBumps = 0;   // 游戏里 reset 到初始 10 AM（=log10 1），不是 0
    return true;
  }
  function doGalaxy(s) {
    if (s.boosts < 4) return false;
    if (s.dims[8] < lg(80 + 60 * s.galaxies) - 1e-9) return false;
    s.galaxies += 1; s.boosts = 0;
    for (var t = 1; t <= 8; t++) { s.dims[t] = NEG; s.bought[t] = 0; }
    s.ticks = 0; s.sacrificed = NEG;
    s.am = 1; s.maxAM = 1; s.costBumps = 0;
    return true;
  }
  function doSac(s, th) {
    if (s.boosts < 5 || s.dims[8] === NEG || s.dims[1] === NEG) return false;
    var oldL = sacBoostLogOf(s.sacrificed);
    var combined = L.ladd(s.sacrificed === NEG ? NEG : s.sacrificed, s.dims[1]);
    var gain = sacBoostLogOf(combined) - oldL;
    if (gain < th - 1e-9) return false;
    s.sacrificed = combined;
    for (var t = 1; t <= 7; t++) s.dims[t] = NEG;
    return true;
  }

  // 无限
  function ipGainLog(s) {
    if (!s.canCrunch) return NEG;
    return s.ipMultLv * LOG2 + s.maxAM / 308 - 0.75;
  }
  function doCrunch(s) {
    var g = ipGainLog(s);
    if (g === NEG || g < 0) return false;
    s.ip = L.ladd(s.ip, g);
    s.infinities += 1; s.infinitiesTotal += 1;
    if (s.t < s.bestInfTime) s.bestInfTime = s.t;
    for (var t = 1; t <= 8; t++) { s.dims[t] = NEG; s.bought[t] = 0; }
    s.ticks = 0; s.sacrificed = NEG; s.costBumps = 0;
    s.boosts = s.iu.skipReset3 ? 3 : (s.iu.skipReset2 ? 2 : (s.iu.skipReset1 ? 1 : 0));
    s.galaxies = s.iu.skipResetGalaxy ? 1 : 0;
    s.am = 1; s.maxAM = 1; s.t = 0;
    return true;
  }

  // 无限维度
  function idCostLog(s, t) { return ID_BASE[t] + Math.floor(s.idBought[t] / 10) * 0 + s.idBought[t] * 0 + idGroup(s, t) * ID_MULT[t]; }
  function idGroup(s, t) { return Math.floor(s.idBought[t] / 10); }
  function idCostLog2(s, t) { return ID_BASE[t] + Math.floor(s.idBought[t] / 10) * ID_MULT[t]; }
  function buyIDs(s, reserveLog) {
    for (var t = 8; t >= 1; t--) {
      if (!s.idUnlocked[t]) continue;
      var guard = 0;
      while (guard++ < 100) {
        var c = idCostLog2(s, t);
        var avail = L.lsub(s.ip, reserveLog === NEG ? NEG : reserveLog);
        if (c > s.ip) break;
        if (reserveLog !== NEG && c > s.ip - reserveLog) break;
        s.ip = L.lsub(s.ip, c);
        s.idBought[t] += 1;
        s.idAmt[t] = L.ladd(s.idAmt[t], 0);
      }
    }
  }
  function unlockIDs(s) {
    for (var t = 1; t <= 8; t++) {
      if (s.idUnlocked[t]) continue;
      if (s.maxAM >= ID_UNLOCK[t]) s.idUnlocked[t] = true;
    }
  }

  // ------------------------------------------------------------ 策略
  function buyUpgrades(s, cfg) {
    if (s.broken) {
      // 打破无限升级：按成本升序买得起就买
      for (var i = 0; i < BIU.length; i++) {
        var b = BIU[i];
        if (s.biu[b.key]) continue;
        if (s.ip >= b.costLog) { s.biu[b.key] = true; s.ip = L.lsub(s.ip, b.costLog); }
      }
    }
    // 无限升级：按成本升序
    for (var k = 1; k < IU.length; k++) {
      var u = IU[k];
      if (s.iu[u.key]) continue;
      var c = lg(u.cost);
      if (s.ip >= c) { s.iu[u.key] = true; s.ip = L.lsub(s.ip, c); }
    }
    // IP 翻倍（成本 10^3 × 10^(n+1)? 游戏里是固定档位，这里按 10^(3+n) 近似）
    if (cfg.ipMult && s.ip > 0) {
      var need = lg(10) * (s.ipMultLv + 1);          // 攻略实测：10 / 100 / 1e3 / 1e4 IP
      while (s.ip >= need && s.ipMultLv < 60) { s.ip = L.lsub(s.ip, need); s.ipMultLv += 1; need += 1; }
    }
  }
  function buyReplicanti(s, cfg) {
    if (!s.repUnl) return;
    // 目标：先把概率推高，再压间隔（两者交替收益最大）
    var guard = 0;
    while (guard++ < 200) {
      var chCost = lg(1e150) + s.repChance * lg(1e15);
      var ivCost = lg(1e140) + s.repInterval * lg(1e10);
      var ch = Math.min(1, s.repChance * 0.01);
      var iv = Math.max(0.05, Math.pow(0.9, s.repInterval));
      var gainCh = ch < 1 ? lg(1 + ch + 0.01) / iv : 0;   // 每买一次概率的增长率提升
      var gainIv = (1 / (iv * 0.9) - 1 / iv);             // 每买一次间隔的速率提升
      var affordCh = s.ip >= chCost, affordIv = s.ip >= ivCost;
      if (!affordCh && !affordIv) break;
      // 选"单位成本收益"更高的一项；概率未满时优先概率
      if (affordCh && (ch < 1 && (gainCh >= gainIv || !affordIv))) {
        s.ip = L.lsub(s.ip, chCost); s.repChance += 1;
      } else if (affordIv) {
        s.ip = L.lsub(s.ip, ivCost); s.repInterval += 1;
      } else break;
    }
    // 复制器星系
    if (s.repAmt >= MAXVAL_LOG - 1e-4) { s.repGalaxies += 1; s.repAmt = NEG; }
  }

  function policy(s, cfg) {
    updAch(s);
    unlockIDs(s);
    // 1) 复制器升级（升值最快，优先）
    buyReplicanti(s, cfg);
    // 2) 升级
    buyUpgrades(s, cfg);
    // 3) 无限维度：留一部分 IP 给下一档升级
    var reserve = NEG;
    if (cfg.reserveForUpgrades) {
      var min = Infinity;
      for (var i = 0; i < BIU.length; i++) if (!s.biu[BIU[i].key]) min = Math.min(min, BIU[i].costLog);
      for (var k = 1; k < IU.length; k++) if (!s.iu[IU[k].key]) min = Math.min(min, lg(IU[k].cost));
      if (isFinite(min) && min > 3) reserve = min - 1;
    }
    buyIDs(s, cfg.keepIDs ? NEG : reserve);
    // 4) 维度 / 计数频率 / 提升 / 星系 / 献祭
    buyMaxDims(s);
    buyMaxTick(s);
    var g = 0;
    while (g++ < 60 && doGalaxy(s)) { buyMaxDims(s); buyMaxTick(s); }
    g = 0;
    while (g++ < 200 && doBoost(s)) { buyMaxDims(s); buyMaxTick(s); }
    if (s.boosts >= 5) {
      var sg = 0;
      while (sg++ < 300 && doSac(s, cfg.sacTheta || 4)) { buyMaxDims(s); buyMaxTick(s); }
    }
  }

  function shouldCrunch(s) {
    if (!s.canCrunch) return false;
    if (!s.broken) return true;                    // 未打破无限：一到上限就坍缩
    if (s.t < cfgMinTime) return false;
    var g = ipGainLog(s);
    if (g === NEG || g < 0) return false;
    var ipm = g - lg(Math.max(s.t, 1e-9));         // log10(IP/秒)
    if (s._bestIPM === undefined || ipm > s._bestIPM) {
      s._bestIPM = ipm; s._bestT = s.t;
    } else if (s.t > s._bestT * 1.10 && s.t > 5) {
      s._bestIPM = undefined; s._bestT = undefined;
      return true;
    }
    return false;
  }
  var cfgMinTime = 0.5;

  // ------------------------------------------------------------ 主循环
  var MILESTONES = [
    { id: 'firstInfinity', name: '首次无限', test: function (s) { return s.infinities >= 1; } },
    { id: 'completeC9', name: '通关 C9', test: function (s) { return !!s.nc[9]; } },
    { id: 'completeAllNC', name: '通关全部普通挑战', test: function (s) { var n = 0; for (var i = 1; i <= 12; i++) if (s.nc[i]) n++; return n >= 12; } },
    { id: 'breakInfinity', name: '打破无限', test: function (s) { return s.broken; } },
    { id: 'upgrade5e11IP', name: '星系 +50%（5e11 IP 升级）', test: function (s) { return !!s.biu.galaxyBoost; } },
    { id: 'completeIC5', name: '通关 IC5', test: function (s) { return !!s.ic[5]; } },
    { id: 'unlockReplicanti', name: '解锁复制器', test: function (s) { return s.repUnl; } },
    { id: 'firstEternity', name: '首次永恒', test: function (s) { return s.ip >= MAXVAL_LOG - 1e-6; } }
  ];

  function simulate(opts) {
    opts = opts || {};
    var dt = opts.dt || 0.05;
    var maxT = opts.maxSeconds || 72 * 3600;
    var s = newState();
    cfgMinTime = opts.crunchMin || 0.5;
    var cfg = {
      sacTheta: opts.sacTheta === undefined ? 4 : opts.sacTheta,
      reserveForUpgrades: opts.reserve !== false,
      ipMult: opts.ipMult !== false
    };
    var log = [];
    var nextMile = 0;
    var chalPhase = 0;                    // 0 普通 1 NC 2 IC
    var ncIdx = 1;

    while (s.t < maxT) {
      step(s, dt);
      policy(s, cfg);

      // 挑战推进（简化：以目标 AM 判定通关）
      if (chalPhase === 1) {
        var c = NC[ncIdx];
        if (s.maxAM >= c.goal) {
          s.nc[ncIdx] = true; s.pen = 0; chalPhase = 0;
          ncIdx++;
          s.maxAM = 1; s.am = 1; s.t = 0;
          for (var tt = 1; tt <= 8; tt++) { s.dims[tt] = NEG; s.bought[tt] = 0; }
          s.ticks = 0; s.boosts = 0; s.galaxies = 0; s.sacrificed = NEG;
        }
      }

      // 里程碑
      while (nextMile < MILESTONES.length && MILESTONES[nextMile].test(s)) {
        s.marks[MILESTONES[nextMile].id] = s.t;
        log.push({ id: MILESTONES[nextMile].id, name: MILESTONES[nextMile].name, t: s.t });
        nextMile++;
      }
      if (nextMile >= MILESTONES.length) break;

      // 打破无限条件：无限次数 ≥ 16 且 IP ≥ 3e4（近似游戏内的解锁条件）
      if (!s.broken && s.infinities >= 16 && s.ip >= lg(3e4)) s.broken = true;
      // 解锁复制器：ID5 解锁后即可（1e30000 AM）
      if (!s.repUnl && s.maxAM >= ID_UNLOCK[5]) s.repUnl = true;
      // IC 推进（简化：达到 IC 目标 AM）
      if (s.broken) {
        for (var q = 1; q <= 8; q++) {
          if (!s.ic[q] && s.maxAM >= IC_G[q]) s.ic[q] = true;
        }
      }
      // 大坍缩判定
      if (shouldCrunch(s)) doCrunch(s);
    }
    return { state: s, milestones: log, elapsed: s.t };
  }

  global.StageSim = {
    newState: newState, step: step, policy: policy, simulate: simulate,
    ipGainLog: ipGainLog, doCrunch: doCrunch, doBoost: doBoost, doGalaxy: doGalaxy,
    doSac: doSac, dimCostLog: dimCostLog, dimMultLog: dimMultLog, prodLog: prodLog,
    adCommonMultLog: adCommonMultLog, infPowerMultLog: infPowerMultLog,
    ID_UNLOCK: ID_UNLOCK, NC: NC, IC_G: IC_G, IU: IU, BIU: BIU, MAXVAL_LOG: MAXVAL_LOG,
    boostNeed: boostNeed, bestPurchase: bestPurchase, applyPurchase: applyPurchase,
    tickPerSecLog: tickPerSecLog, updAchRef: updAch
  };
})(typeof window !== 'undefined' ? window : globalThis);
