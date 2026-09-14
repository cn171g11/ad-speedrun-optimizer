/* ============================================================================
 * 挑战起始时机优化器（timing.js）
 * ----------------------------------------------------------------------------
 * 为什么不能"一解锁就进挑战"：
 *   进入挑战 = 强制一次大坍缩（源码 NormalChallenge.start → bigCrunchReset）。
 *   大坍缩会清掉反物质/维度/计数频率，**但不会清掉你已经买过的无限维度**：
 *     · 每个 ID 的 amount 回到 baseAmount = 10 × 已购次数（不清零！）
 *     · 无限之力 → 0，但 ID1 从第 1 帧就开始重新产无限之力
 *     · 无限之力给全部反物质维度的倍率 = IPower^7
 *   → 所以"等一等再进挑战"的收益 = 你能用攒下的 IP 多买几次 ID，
 *     进挑战后第一秒就带着 50^次数 的 ID1 倍率起步，挑战时长按指数下降。
 *   → 而且在挑战里这些加成**一直有效**（无限维度不受普通挑战的限制）。
 *
 * 本模块对每个挑战做一维扫描：
 *   总代价(prep) = 筹备耗时(prep) + 挑战耗时(prep)
 * 取 argmin。prep 的含义随场景不同：
 *   开场前（打破无限前）：多刷 prep 次无限（每次 +1×IP倍率 IP）
 *   打破无限后：攒够 IP 买 prep 次 ID1
 * ============================================================================ */
(function (global) {
  'use strict';
  var AD = global.AD;
  var S1 = AD && AD.s1;
  var ID = AD && AD.id;

  // 攻略实测的刷 IP 速率阶梯（IP 量级 → IP/分钟），用于估算"筹备耗时"
  // 来源：《反物质维度安卓通关攻略》第四章各节点的「当前速度 x IP/分钟」
  var FARM_LADDER = [
    [1e4, 1.2e4], [1e4 * 10, 1.1e5], [1e5 * 10, 3.4e5], [1e6 * 10, 1.2e6],
    [1e7 * 10, 1.5e7], [1e8 * 10, 1.9e8], [1e9 * 10, 1e9], [1e10 * 10, 3.85e9],
    [1e11 * 10, 6.2e9], [1e12 * 10, 1.07e10]
  ];
  /** 在 IP 量级 ip 时的刷 IP 速率（IP/分钟），对数线性插值 */
  function farmRate(ip) {
    if (!(ip > 1)) return FARM_LADDER[0][1];
    if (ip <= FARM_LADDER[0][0]) return FARM_LADDER[0][1];
    for (var i = 0; i < FARM_LADDER.length - 1; i++) {
      var a = FARM_LADDER[i], b = FARM_LADDER[i + 1];
      if (ip <= b[0]) {
        var u = (Math.log10(ip) - Math.log10(a[0])) / (Math.log10(b[0]) - Math.log10(a[0]));
        return Math.pow(10, Math.log10(a[1]) + u * (Math.log10(b[1]) - Math.log10(a[1])));
      }
    }
    return FARM_LADDER[FARM_LADDER.length - 1][1];
  }
  /** 攒到目标 IP 需要多久（秒）：对速率做积分（速率随 IP 增长） */
  function farmSeconds(ipFrom, ipTo) {
    if (ipTo <= ipFrom) return 0;
    var t = 0, cur = ipFrom;
    for (var k = 0; k < 4000 && cur < ipTo; k++) {
      var step = Math.max(cur * 0.02, 10);          // 每次推进 2% 或 10 IP
      if (cur + step > ipTo) step = ipTo - cur;
      t += step / (farmRate(cur) / 60);             // 秒
      cur += step;
    }
    return t;
  }
  /** 买 n 次 ID1 需要的累计 IP（成本 1e8 × 1e3^k） */
  function idCostTotal(n, base) {
    var c = base || 1e8, mult = 1e3, sum = 0;
    for (var k = 0; k < n; k++) { sum += c; c *= mult; }
    return sum;
  }

  // ── 一次挑战仿真（可指定：打破无限、ID 已购次数、IP 存量）─────────────
  function runChallenge(cfg) {
    var S = global.S1SIM;
    if (!S) return null;
    return S.runInfinity({
      iuSet: cfg.iuSet, challenge: cfg.challenge, infinities: cfg.infinities || 100,
      ip: cfg.ipStock || 0, ipMult: cfg.ipMult || 1,
      galaxyCap: (cfg.challenge === 8 || cfg.challenge === 10) ? 0 : 'inf',
      maxSeconds: cfg.maxSeconds || 3 * 3600, dt: cfg.dt || (1 / 30),
      logDetail: 'none', achOverride: cfg.ach,
      brk: !!cfg.brk, id1: cfg.id1 || 0, ipStock: cfg.ipStock || 0
    });
  }

  /**
   * 打破无限前的场景：筹备 = 多刷 prep 次无限
   *   每次无限：耗时 T_run（用当前 IU 配置算），收益 ipMult IP
   */
  function sweepPreBreak(o) {
    var rows = [];
    var S = global.S1SIM;
    // 先算一次普通无限的耗时（用作"每次刷无限的耗时"）
    var farm = S.runInfinity({
      iuSet: o.iuSet, challenge: 0, infinities: o.infinities || 100,
      ip: o.ipStart, ipMult: o.ipMult || 1, galaxyCap: 'inf',
      maxSeconds: o.maxSeconds || 3 * 3600, dt: o.dt || (1 / 30),
      logDetail: 'none', achOverride: o.ach
    });
    for (var n = 0; n <= o.maxPrep; n++) {
      var ipStock = o.ipStart + n * (o.ipMult || 1);
      var r = runChallenge({
        iuSet: o.iuSet, challenge: o.challenge, infinities: (o.infinities || 100) + n,
        ipStock: ipStock, ipMult: o.ipMult || 1, ach: o.ach, dt: o.dt,
        maxSeconds: o.maxSeconds
      });
      var prepTime = n * farm.time;
      rows.push({
        prep: n, ipStock: ipStock, prepTime: prepTime,
        chalTime: r ? r.time : null, ok: r ? r.ok : false,
        total: r ? prepTime + r.time : null
      });
    }
    return { farmRun: farm.time, rows: rows };
  }

  /**
   * 打破无限后的场景：筹备 = 攒 IP 买 prep 次 ID1
   *   筹备耗时 = farmSeconds(当前 IP, ID1 累计成本)；挑战本身从"已买 p 次 ID1"的状态开始
   */
  function sweepPostBreak(o) {
    var rows = [];
    var base = ID ? ID.BASE_COST[1] : 1e8;
    for (var p = o.minPrep || 0; p <= o.maxPrep; p++) {
      var need = idCostTotal(p, base);
      var prepTime = farmSeconds(o.ipStart, need);          // 秒
      var r = runChallenge({
        iuSet: o.iuSet, challenge: o.challenge, infinities: o.infinities || 1000,
        ipStock: need, ipMult: o.ipMult || 16, ach: o.ach, dt: o.dt,
        maxSeconds: o.maxSeconds, brk: true, id1: p
      });
      rows.push({
        prep: p, ipNeed: need, prepTime: prepTime,
        chalTime: r ? r.time : null, ok: r ? r.ok : false,
        total: r ? prepTime + r.time : null,
        ipowerStart: r ? r.infPower : null
      });
    }
    return { rows: rows };
  }

  global.TIMING = {
    FARM_LADDER: FARM_LADDER, farmRate: farmRate, farmSeconds: farmSeconds,
    idCostTotal: idCostTotal, runChallenge: runChallenge,
    sweepPreBreak: sweepPreBreak, sweepPostBreak: sweepPostBreak
  };
})(typeof window !== 'undefined' ? window : globalThis);
