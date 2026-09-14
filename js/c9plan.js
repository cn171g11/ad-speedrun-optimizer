/* ============================================================================
 * S1 段「1 IP → 通关 C9」逐 tick 仿真 (c9plan.js)
 * ----------------------------------------------------------------------------
 * 这一段全部发生在打破无限之前，反物质不超 1.797e308，
 * 所以可以**直接复用第一阶段那套已验证的模型**（model.js + strategies.js，误差 ~2%）。
 *
 * 做法：临时替换 AD.dimCost / AD.tickCost / AD.dimMult 等函数，把 12 个普通挑战的
 * 限制条件注入进去，然后用第一阶段已验证的 OptimizedPurchaseStrategy 规则跑完整流程。
 *
 * 挑战修正（全部来自源码）：
 *   C2  买维度/计数频率后产量归零，3 分钟内线性恢复（chall2Pow）
 *   C3  第 1 维度 ×0.01 起步，随时间指数增长（chall3Pow），提升/星系后归零
 *   C4  买某维度会清空所有更低维度的数量
 *   C5  计数频率基准倍率 1.1245 → 1.080
 *   C6  维度升级用"低 2 档的维度"付账，且价格表换成 C6 专用表
 *   C7  买满 10 个的倍率 2 → min(2, 1 + 总提升数/5)
 *   C8  维度提升不提供倍率、不能买星系，献祭大幅增强
 *   C9  买计数频率或买满 10 个维度时，所有同价物的价格跳到下一档（costBumps）
 *   C10 只有 6 个维度；提升/星系成本改为 tier6 / 99+90g
 *   C11 普通物质上涨，超过反物质时强制维度提升（不给加成）
 *   C12 每个维度产出低 2 档；1/2 维度都产反物质；2/4/6 维度强化
 * ============================================================================ */
(function (global) {
  'use strict';
  var AD = global.AD, ST = global.Strategies;

  var INF = 1.7976931348623157e308;
  var LOG_MAX = Math.log10(INF);

  // ---- C6 专用价格表（源码 antimatter-dimension.js） ----
  var C6_COST = [0, 10, 100, 100, 500, 2500, 2e4, 2e5, 4e6];
  var C6_MULT = [0, 1e3, 5e3, 1e4, 1.2e4, 1.8e4, 2.6e4, 3.2e4, 4.2e4];

  // ---- 挑战目标：全部是"再次达到 Infinity" ----
  var NC_GOAL = INF;

  function newRun(opts) {
    opts = opts || {};
    var s = {
      am: 10,
      dims: new Array(9).fill(0),
      bought: new Array(9).fill(0),
      ticksBought: 0,
      boosts: opts.boosts || 0,
      galaxies: opts.galaxies || 0,
      sacrificed: 0,
      costBumps: new Array(9).fill(0),
      chall9TickBumps: 0,
      t: 0,
      challenge: opts.challenge || 0,
      chall2Pow: 1, chall3Pow: 0.01,
      chall8Sac: 1,
      normalMatter: 0,
      iu: opts.iu || {},
      ipMult: opts.ipMult || 1,
      maxAM: 10,
      // 供 Strategies 复用
      platform: 'pc'
    };
    if (s.challenge === 2) s.chall2Pow = 1;
    return s;
  }

  // ---------------------------------------------------------------- 成本
  var _dimCost = AD.dimCost, _tickCost = AD.tickCost;
  function installChallengeCosts(s) {
    var c = s.challenge;
    if (c === 6) {
      AD.dimCost = function (st, t) {
        return C6_COST[t] * Math.pow(C6_MULT[t],
          Math.floor(st.bought[t] / 10) + (st.costBumps ? st.costBumps[t] : 0));
      };
    } else {
      AD.dimCost = function (st, t) {
        return AD.DIM_BASE_COST[t] * Math.pow(AD.DIM_COST_MULT[t],
          Math.floor(st.bought[t] / 10) + (st.costBumps ? st.costBumps[t] : 0));
      };
    }
    AD.tickCost = function (st) {
      return 1000 * Math.pow(10, st.ticksBought + (st.chall9TickBumps || 0));
    };
  }
  function restoreCosts() { AD.dimCost = _dimCost; AD.tickCost = _tickCost; }

  // ---------------------------------------------------------------- 倍率
  function maxDims(s) { return s.challenge === 10 ? 6 : Math.min(s.boosts + 4, 8); }
  function dimFlow(t, s) {
    if (s.challenge === 12) return t === 1 ? 1 : (t === 2 ? 1 : 0.1);
    return t === 1 ? 1 : 0.1;
  }
  function buyTenMult(s) {
    if (s.challenge === 7) return Math.min(2, 1 + (s.boosts + s.boostTotal || 0) / 5);
    return 2;
  }
  function dimboostPower(s) {
    if (s.challenge === 8) return 1;
    return s.iu.resetMult ? 2.5 : 2;
  }
  function sacBoostLog(s) {
    if (s.challenge === 8) return Math.log10(Math.max(s.chall8Sac || 1, 1));
    if (!(s.sacrificed > 0)) return 0;
    return Math.log10(Math.max(Math.log10(s.sacrificed) / 10, 1)) * 2;
  }
  function tickFactor(s) {
    var G = s.galaxies;
    if (s.challenge === 5) {
      var b5 = G === 0 ? 1 / 1.08 : (G === 1 ? 1 / 1.07632 : 1 / 1.072);
      var m5 = b5 - G * 0.02;
      return 1 / Math.max(m5, 0.01);
    }
    var m = G < 3 ? AD.TICK_BASE_M[G] : 0.8 * Math.pow(0.965, G - 4);
    return 1 / m;
  }
  function achPower() { return 1.0927; }   // 与第一阶段开局同口径（3 个成就）

  function dimMult(s, t) {
    var m = dimFlow(t, s) * achPower();
    m *= Math.pow(2, Math.floor(s.bought[t] / 10));
    var bp = s.boosts - t + 1;
    if (bp > 0) m *= Math.pow(dimboostPower(s), bp);
    if (t === 8) m *= Math.pow(10, sacBoostLog(s));
    if (s.iu.dim18 || s.iu.dim27 || s.iu.dim36 || s.iu.dim45) m *= 1 + (s.infinitiesTotal || 0) * 0.2;
    if (t === 1 && s.iu.timeMult) m *= Math.pow(Math.max(s.tTotal / 120, 1), 0.15);
    if (s.challenge === 3 && t === 1) m *= s.chall3Pow;
    if (s.challenge === 12 && (t === 2 || t === 4 || t === 6)) {
      var a = s.dims[t];
      if (a > 1) m *= Math.pow(a, t === 2 ? 0.6 : (t === 4 ? 0.4 : 0.2));
    }
    return m;
  }

  function tickPerSec(s) { return Math.pow(tickFactor(s), s.ticksBought); }

  // ---------------------------------------------------------------- 推进
  function step(s, dt) {
    var M = maxDims(s);
    var tps = tickPerSec(s);
    var p2 = s.challenge === 2 ? s.chall2Pow : 1;
    var top = s.challenge === 12 ? M - 1 : M;
    var off = s.challenge === 12 ? 2 : 1;
    for (var t = top; t >= 1; t--) {
      var lo = t - off;
      if (lo < 1) continue;
      if (s.dims[t] <= 0) continue;
      var rate = s.dims[t] * dimMult(s, t) * tps * (s.challenge === 12 && lo === 1 ? 1 : 0.1);
      s.dims[lo] += rate * dt * p2;
    }
    if (s.dims[1] > 0) s.am += s.dims[1] * dimMult(s, 1) * tps * p2 * dt;
    if (s.challenge === 12 && s.dims[2] > 0) s.am += s.dims[2] * dimMult(s, 2) * tps * p2 * dt;
    // C2 产量恢复（3 分钟线性）
    if (s.challenge === 2) s.chall2Pow = Math.min(1, s.tSinceBuy / 180);
    // C3 第 1 维度倍率指数增长
    if (s.challenge === 3) s.chall3Pow *= Math.pow(1.0004, dt);
    // C11 普通物质
    if (s.challenge === 11) {
      s.normalMatter += s.dims[2] * 0.0001 * dt;
      if (s.normalMatter > s.am && s.dims[1] > 0) { s.normalMatter = 0; }
    }
    s.t += dt; s.tTotal = (s.tTotal || 0) + dt;
    if (s.am > s.maxAM) s.maxAM = s.am;
    if (s.am > INF) s.am = INF;
  }

  // ---------------------------------------------------------------- 购买
  function applyBuy(s, item) {
    var c = item === 0 ? AD.tickCost(s) : AD.dimCost(s, item);
    if (c > s.am) return false;
    s.am -= c;
    if (item === 0) {
      s.ticksBought += 1;
      if (s.challenge === 9) bumpSameCost(s, 0);
      s.tSinceBuy = 0;
      return true;
    }
    s.dims[item] += 1; s.bought[item] += 1;
    // C9：买满 10 个时同价物涨价
    if (s.challenge === 9 && s.bought[item] % 10 === 0) bumpSameCost(s, item);
    // C4：买维度清空更低维度
    if (s.challenge === 4) for (var k = 1; k < item; k++) s.dims[k] = 0;
    s.tSinceBuy = 0;
    return true;
  }
  function bumpSameCost(s, boughtItem) {
    var c0 = boughtItem === 0 ? AD.tickCost(s) : AD.dimCost(s, boughtItem);
    var e = Math.floor(Math.log10(c0));
    for (var t = 1; t <= maxDims(s); t++) {
      if (t === boughtItem) continue;
      var ct = AD.dimCost(s, t);
      if (Math.floor(Math.log10(ct)) === e) s.costBumps[t] = (s.costBumps[t] || 0) + 1;
    }
    if (boughtItem !== 0) {
      var tc = AD.tickCost(s);
      if (Math.floor(Math.log10(tc)) === e) s.chall9TickBumps = (s.chall9TickBumps || 0) + 1;
    }
  }

  function buyLoop(s) {
    var M = maxDims(s), guard = 0;
    while (guard++ < 300) {
      var cands = ST.optimizedCandidates(s, M, NC_GOAL);
      if (!cands || !cands.length) break;
      if (!applyBuy(s, cands[0])) break;
    }
  }
  function doBoost(s) {
    var target = s.boosts + 1;
    var tier = Math.min(s.challenge === 10 ? 6 : target + 3, maxDims(s));
    var need = 20;
    if (tier === 8) need += (target - 5) * 15;
    else if (tier === 6 && s.challenge === 10) need += (target - 3) * 20;
    need -= (s.iu.resetBoost ? 9 : 0);
    if (need < 1) need = 1;
    if (s.dims[tier] < need - 1e-9) return false;
    s.boosts += 1;
    for (var t = 1; t <= 8; t++) { s.dims[t] = 0; s.bought[t] = 0; }
    s.ticksBought = 0; s.sacrificed = 0; s.costBumps = new Array(9).fill(0);
    s.chall9TickBumps = 0; s.am = 10; s.maxAM = 10; s.chall3Pow = 0.01; s.tSinceBuy = 0;
    return true;
  }
  function doGalaxy(s) {
    if (s.challenge === 8) return false;
    if (s.boosts < 4) return false;
    var base = s.challenge === 10 ? 99 : 80, mult = s.challenge === 10 ? 90 : 60;
    var tier = s.challenge === 10 ? 6 : 8;
    if (s.dims[tier] < base + mult * s.galaxies) return false;
    s.galaxies += 1; s.boosts = 0;
    for (var t = 1; t <= 8; t++) { s.dims[t] = 0; s.bought[t] = 0; }
    s.ticksBought = 0; s.sacrificed = 0; s.costBumps = new Array(9).fill(0);
    s.chall9TickBumps = 0; s.am = 10; s.maxAM = 10; s.chall3Pow = 0.01; s.tSinceBuy = 0;
    return true;
  }
  function doSac(s) {
    if (s.boosts < 5 || s.dims[8] <= 0 || s.dims[1] <= 0) return false;
    if (s.challenge === 8) {
      var pre = Math.pow(s.dims[1], 0.05) / Math.max(Math.pow(Math.max(s.sacrificed, 1), 0.04), 1);
      var pre2 = Math.pow(s.dims[1], 0.05) / Math.pow(Math.max(s.sacrificed + s.dims[1], 1), 0.04);
      var boost = Math.max(pre * pre2, 1);
      if (boost < 3) return false;
      s.chall8Sac = (s.chall8Sac || 1) * boost;
      s.sacrificed += s.dims[1];
      for (var k = 1; k <= 7; k++) s.dims[k] = 0;
      return true;
    }
    var oldB = sacBoostLog(s);
    var newS = s.sacrificed + s.dims[1];
    var oldL = s.sacrificed > 0 ? Math.log10(Math.max(Math.log10(s.sacrificed) / 10, 1)) * 2 : 0;
    var newL = newS > 0 ? Math.log10(Math.max(Math.log10(newS) / 10, 1)) * 2 : 0;
    if (newL - oldL < Math.log10(4)) return false;
    s.sacrificed = newS;
    for (var q = 1; q <= 7; q++) s.dims[q] = 0;
    return true;
  }

  // ---------------------------------------------------------------- 单次挑战
  function runChallenge(chall, opts) {
    opts = opts || {};
    var dt = opts.dt || 0.05;
    var maxT = opts.maxSeconds || 6 * 3600;
    var s = newRun({ challenge: chall, boosts: opts.boosts || 0, galaxies: opts.galaxies || 0,
                     iu: opts.iu, ipMult: opts.ipMult });
    s.tTotal = opts.tTotal || 0;
    s.tSinceBuy = 0;
    installChallengeCosts(s);
    var boostLog = [];
    while (s.am < INF && s.t < maxT) {
      step(s, dt);
      buyLoop(s);
      var g = 0;
      while (g++ < 40 && doGalaxy(s)) { buyLoop(s); }
      g = 0;
      while (g++ < 200 && doBoost(s)) { buyLoop(s); }
      if (s.boosts >= 5) { var sg = 0; while (sg++ < 200 && doSac(s)) { buyLoop(s); } }
    }
    restoreCosts();
    return { ok: s.am >= INF, time: s.t, state: s };
  }

  // ---------------------------------------------------------------- 单次无限（刷 IP）
  function runInfinity(opts) {
    var r = runChallenge(0, opts);
    var ip = Math.floor(1.7817 * (opts.ipMult || 1));
    return { time: r.time, ip: ip, state: r.state };
  }

  // ------------------------------------------------- 完整计划：1 IP → C9
  var IU_COST = { iu11: 1, iu12: 1, iu13: 1, iu14: 1, iu21: 1, iu22: 1, iu23: 1,
                  iu24: 2, iu31: 3, iu32: 5, iu33: 7, iu34: 10, iu41: 20, iu42: 40,
                  iu43: 80, iu44: 300, iuOffline: 1000 };
  var IU_KEY = { iu11: null, iu12: 'dim18', iu13: 'dim27', iu14: 'dim36', iu21: 'dim45',
                 iu22: 'resetBoost', iu23: 'buy10', iu24: 'galaxyBoost', iu31: 'timeMult',
                 iu32: 'timeMult2', iu33: 'unspentIP', iu34: 'resetMult', iu41: 'passiveGen',
                 iu42: 'skipReset1', iu43: 'skipReset2', iu44: 'skipReset3', iuOffline: 'skipResetGalaxy' };

  /**
   * 主驱动：按攻略顺序 8-3-4-5-7-6-11-10-12-2-9 打通（C9 最后）
   * 每完成一次无限 / 挑战都记入步骤日志
   */
  function buildPlan(opts) {
    opts = opts || {};
    var dt = opts.dt || 0.1;
    var iu = {}, ip = 1, ipMult = 1, infCount = 0, tGlobal = 0, tTotal = 0;
    var log = [];
    var order = [8, 3, 4, 5, 7, 6, 11, 10, 12, 2, 9];

    function push(t, action, note) {
      log.push({ t: tGlobal + t, gmin: (tGlobal + t) / 60, action: action, note: note || '' });
    }

    // 1) 买 IU11
    push(0, '买无限升级 11', '花费 1 IP，反物质维度按游玩时间获得加成');
    iu.timeMult = true; ip -= 1; tGlobal += 0.5;

    // 2) 进 C8 刷 IP：每轮给 1.7817×IPmult IP，直到能买齐前置无限升级
    var needIUs = ['dim18', 'dim45', 'resetBoost', 'buy10', 'galaxyBoost', 'timeMult', 'timeMult2', 'unspentIP'];
    var guard = 0;
    while (guard++ < 400) {
      var r = runInfinity({ dt: dt, iu: iu, ipMult: ipMult, tTotal: tTotal });
      infCount++; tTotal += r.time; tGlobal += r.time;
      ip += r.ip;
      if (guard <= 3 || infCount % 10 === 0) {
        push(-r.time, '大坍缩（第 ' + infCount + ' 次无限）', '用时 ' + r.time.toFixed(1) + ' s，获得 ' + r.ip + ' IP');
      }
      // 买无限升级
      var bought = [];
      ['iu22', 'iu12', 'iu21', 'iu13', 'iu14', 'iu24', 'iu31', 'iu32', 'iu33', 'iu34', 'iu41', 'iu42'].forEach(function (k) {
        var key = IU_KEY[k], cost = IU_COST[k];
        if (key && !iu[key] && ip >= cost) { iu[key] = true; ip -= cost; bought.push(k + '(' + cost + 'IP)'); }
      });
      if (bought.length) push(0, '购买无限升级：' + bought.join(', '), '剩余 ' + ip.toFixed(0) + ' IP');
      // IP 翻倍
      var need = Math.pow(10, Math.floor(Math.log10(ipMult * 4)) || 1);
      if (ip >= 10 && ipMult < 16) { var c = 10 * ipMult; if (ip >= c) { ip -= c; ipMult *= 2;
        push(0, '购买 IP 翻倍（×' + ipMult + '）', '花费 ' + c + ' IP'); } }
      if (iu.dim18 && iu.dim45 && iu.galaxyBoost && iu.timeMult && iu.skipReset1) break;
    }

    // 3) 依次通关众挑战
    order.forEach(function (c) {
      if (c === 9) return;
      var r = runChallenge(c, { dt: dt, iu: iu, ipMult: ipMult, tTotal: tTotal });
      tTotal += r.time; tGlobal += r.time; infCount++;
      push(-r.time, '通关 C' + c, '用时 ' + (r.time / 60).toFixed(2) + ' 分钟');
    });

    // 4) 攒到 100 IP 再打 C9
    var g2 = 0;
    while (ip < 100 && g2++ < 200) {
      var r2 = runInfinity({ dt: dt, iu: iu, ipMult: ipMult, tTotal: tTotal });
      infCount++; tTotal += r2.time; tGlobal += r2.time; ip += r2.ip;
    }
    push(0, '攒 IP 到 ' + ip.toFixed(0), '合计 ' + infCount + ' 次无限');

    // 5) C9
    var r9 = runChallenge(9, { dt: dt, iu: iu, ipMult: ipMult, tTotal: tTotal });
    tTotal += r9.time; tGlobal += r9.time;
    push(-r9.time, '通关 C9（Tickspeed Autobuyer Challenge）', '用时 ' + (r9.time / 60).toFixed(2) + ' 分钟');

    return { log: log, total: tGlobal, infinities: infCount, ipLeft: ip, iu: iu,
             c9ok: r9.ok, c9time: r9.time, ipMult: ipMult };
  }

  global.C9Plan = {
    newRun: newRun, runChallenge: runChallenge, runInfinity: runInfinity,
    buildPlan: buildPlan, NC_GOAL: NC_GOAL, IU_COST: IU_COST, ORDER: [8, 3, 4, 5, 7, 6, 11, 10, 12, 2, 9]
  };
})(typeof window !== 'undefined' ? window : globalThis);
