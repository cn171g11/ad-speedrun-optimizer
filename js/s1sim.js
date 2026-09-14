/* ============================================================================
 * S1 段仿真器（s1sim.js）
 * ----------------------------------------------------------------------------
 * 目标：从「1 IP」推到「通关 C9」，全部用源码公式逐 tick 算，不抄攻略时间。
 *
 * 建模范围（全部对齐 IvarK/AntimatterDimensionsSourceCode）：
 *   · 维度成本/倍率/计数频率（第一阶段已验证，误差 ~2%）
 *   · 无限升级 16 项（真实 4×4 网格；IU<行><列>：IU11=总时间倍率、IU12=买十、
 *     IU13=本次无限时间倍率、IU14=skipReset1、IU21=1/8维、IU22=2/7维、
 *     IU31=3/6维、IU32=4/5维、IU41=提升需求-9、IU42=星系×2、IU23=未花费IP、
 *     IU33=提升倍率2.5、IU43=被动IP、IU24/34/44=skipReset2/3/Galaxy）
 *   · 普通挑战 1~12 的修正（C2 停产恢复、C3 第1维指数、C4 清空低维、C5 基准1.08、
 *     C6 专用价表、C7 买十倍率、C8 无提升倍率+强献祭、C9 同价跳档、C10 六维、
 *     C11 普通物质、C12 低 2 档产出）
 *   · 成就（含 r21/r37/r54 起始反物质、r32/r57/r88 献祭指数）
 *   · skipReset 重置语义（挑战中无效 —— 源码实锤，这决定了 C9 不能靠它）
 *
 * 操作策略（对应攻略里的自动购买器配置 +「按住最大」）：
 *   每个 tick：买满 8→1 全部维度 → 买满计数频率 → 能提升就提升 → 能买星系就买
 *   → 献祭有收益就献祭 → AM 到 1.797e308 就大坍缩
 * ============================================================================ */
(function (global) {
  'use strict';
  var AD = global.AD;
  var S1 = AD && AD.s1;

  var MAXAM = 1.7976931348623157e308;

  // ── 无限升级：真实 4×4 网格（InfinityUpgradesTab.vue 的 grid 定义）────────
  var IU = [
    { key: 'IU11', row: 1, col: 1, id: 'timeMult', cost: 1, name: '总游玩时间倍率',
      eff: '反物质维度 ×(总游玩分钟/2)^0.15', req: null },
    { key: 'IU12', row: 1, col: 2, id: 'buy10Mult', cost: 1, name: '买十倍率 2→2.2',
      eff: '买满 10 个的倍率 ×1.1', req: null },
    { key: 'IU13', row: 1, col: 3, id: 'thisInfinityMult', cost: 3, name: '本次无限时间倍率',
      eff: '反物质维度 ×max((本次无限分钟/4)^0.25, 1)', req: null },
    { key: 'IU14', row: 1, col: 4, id: 'skipReset1', cost: 20, name: 'skipReset1',
      eff: '每次重置后保底 1 个维度提升（挑战中无效）', req: null },

    { key: 'IU21', row: 2, col: 1, id: 'dim18', cost: 1, name: '1/8 维 ×无限次数',
      eff: '第 1、8 维度 ×(1+总无限×0.2)', req: 'IU11' },
    { key: 'IU22', row: 2, col: 2, id: 'dim27', cost: 1, name: '2/7 维 ×无限次数',
      eff: '第 2、7 维度 ×(1+总无限×0.2)', req: 'IU12' },
    { key: 'IU23', row: 2, col: 3, id: 'unspentIP', cost: 5, name: '未花费 IP → 第1维',
      eff: '第 1 维度 ×((IP/2)^1.5+1)', req: 'IU13' },
    { key: 'IU24', row: 2, col: 4, id: 'skipReset2', cost: 40, name: 'skipReset2',
      eff: '每次重置后保底 2 个维度提升', req: 'IU14' },

    { key: 'IU31', row: 3, col: 1, id: 'dim36', cost: 1, name: '3/6 维 ×无限次数',
      eff: '第 3、6 维度 ×(1+总无限×0.2)', req: 'IU21' },
    { key: 'IU32', row: 3, col: 2, id: 'dim45', cost: 1, name: '4/5 维 ×无限次数',
      eff: '第 4、5 维度 ×(1+总无限×0.2)', req: 'IU22' },
    { key: 'IU33', row: 3, col: 3, id: 'resetMult', cost: 7, name: '提升倍率 2→2.5',
      eff: '维度提升倍率 ×2 → ×2.5', req: 'IU23' },
    { key: 'IU34', row: 3, col: 4, id: 'skipReset3', cost: 80, name: 'skipReset3',
      eff: '每次重置后保底 3 个维度提升', req: 'IU24' },

    { key: 'IU41', row: 4, col: 1, id: 'resetBoost', cost: 1, name: '提升需求 -9',
      eff: '维度提升/星系所需维度数量 -9（直接减）', req: 'IU31' },
    { key: 'IU42', row: 4, col: 2, id: 'galaxyBoost', cost: 2, name: '星系 ×2 强度',
      eff: '所有星系强度 ×2', req: 'IU32' },
    { key: 'IU43', row: 4, col: 3, id: 'ipGen', cost: 10, name: '被动 IP',
      eff: '按最快无限耗时的 10 倍速度被动产 IP', req: 'IU33' },
    { key: 'IU44', row: 4, col: 4, id: 'skipResetGalaxy', cost: 300, name: 'skipResetGalaxy',
      eff: '每次重置后保底 4 个维度提升 + 1 个星系', req: 'IU34' }
  ];
  var IU_BY_KEY = {};
  IU.forEach(function (u) { IU_BY_KEY[u.key] = u; });

  /** 把 IU 集合转成 model.js 认得的开关对象 */
  function iuFlags(set) {
    return {
      timeMult: !!set.IU11, buy10: !!set.IU12, timeMult2: !!set.IU13,
      skipReset1: !!set.IU14, dim18: !!set.IU21, dim27: !!set.IU22,
      unspentIP: !!set.IU23, skipReset2: !!set.IU24, dim36: !!set.IU31,
      dim45: !!set.IU32, resetMult: !!set.IU33, skipReset3: !!set.IU34,
      resetBoost: !!set.IU41, galaxyBoost: !!set.IU42, ipGen: !!set.IU43,
      skipResetGalaxy: !!set.IU44
    };
  }
  function canBuyIU(set, key) {
    var u = IU_BY_KEY[key];
    if (!u) return false;
    return !u.req || !!set[u.req];
  }

  // ── 成就集合 ──────────────────────────────────────────────────────────
  /**
   * 按「整行完成数 + 额外散点」构造成就集（攻略在每个阶段都明确写了当时拥有哪些成就）
   *   rowN          : 前 N 行整行完成（8 个/行）
   *   extra         : 额外散点成就 id 数组
   * 攻略原文给出的三个节点：
   *   第 1 次无限后   ：「第 1-2 行全部成就，r31/32/35，r42/44/46」      = 22
   *   C8 刷 IP 之后   ：「前 4 行……」                                    ≈ 40
   *   买 IU14 前后     ：「前 5 行全部成就和 r68」+ r61-67/74/76/77/78    ≈ 51
   */
  function achSet(rowN, extra) {
    var a = {};
    for (var r = 1; r <= rowN; r++) for (var i = 1; i <= 8; i++) a[r * 10 + i] = true;
    [21, 31, 35, 42, 44, 46].forEach(function (id) { a[id] = true; });   // 必然拿到
    (extra || []).forEach(function (id) { a[id] = true; });
    return a;
  }
  function baseAchs(extra) {
    var a = achSet(2, [31, 32, 35, 42, 44, 46, 54]);
    for (var k in (extra || {})) a[k] = extra[k];
    return a;
  }

  // ── 一次「无限 / 挑战」跑的仿真 ────────────────────────────────────────
  /**
   * @param {object} cfg
   *   iuSet      : {IU11:true,...} 已购无限升级
   *   challenge  : 0 = 普通无限；1..12 = 普通挑战
   *   infinities : 当前累计无限次数
   *   ip         : 当前 IP（用于 IU23 未花费 IP 倍率）
   *   ipMult     : IP 翻倍倍率
   *   galaxyCap  : 本跑允许买的星系上限（'inf' = 不限）
   *   useTick    : 是否购买计数频率（C9 关闭）
   *   maxSeconds : 上限
   *   logDetail  : 'full' | 'coarse' | 'none'
   */
  function runInfinity(cfg) {
    cfg = cfg || {};
    var st = AD.newState({
      platform: 'pc', challenge: cfg.challenge || 0,
      infinitiesTotal: cfg.infinities || 1,
      iu: iuFlags(cfg.iuSet || {}),
      ipMultLv: 0,
      brk: !!cfg.brk
    });
    st.achs = cfg.achOverride ? cfg.achOverride : baseAchs(cfg.extraAchs);
    st.ip = cfg.ipStock !== undefined ? cfg.ipStock : (cfg.ip || 0);
    st.ipMult = cfg.ipMult || 1;
    // 打破无限后：可以带着已购的无限维度进挑战（进入 = 一次大坍缩：
    // 无限之力清零、ID 数量回到 baseAmount = 10×已购次数，但购买次数永久保留）
    if (cfg.id1) { st.idBought[1] = cfg.id1; st.idAmt[1] = cfg.id1 * 10; }
    for (var _t = 1; _t <= 8; _t++) {
      if (cfg.idBought && cfg.idBought[_t]) {
        st.idBought[_t] = cfg.idBought[_t]; st.idAmt[_t] = cfg.idBought[_t] * 10;
      }
    }
    st.infPower = cfg.infPower || 0;
    // 本永恒最高 AM：决定无限维度是否解锁（一旦达成过就永久解锁）
    st.maxAMAll = cfg.maxAMAll !== undefined ? cfg.maxAMAll
      : (cfg.id1 ? 1e60000 : 0);
    st.achDirty = true;
    // 起始状态 = 一次大坍缩之后（skipReset 已经生效）
    st.boosts = S1.startingBoosts(st);
    if ((st.iu || {}).skipResetGalaxy) st.galaxies = 1;
    st.am = S1.startingAM(st); st.maxAM = st.am;
    st.time = 0; std(0);

    var galaxyCap = cfg.galaxyCap === undefined ? 'inf' : cfg.galaxyCap;
    var useTick = cfg.useTick !== false && cfg.challenge !== 9;
    var maxSec = cfg.maxSeconds || 12 * 3600;
    var detail = cfg.logDetail || 'coarse';
    var log = [];
    var guard = 0;
    var firstBuy = {};        // 每个维度首次买入的时刻
    var boostAt = [], galAt = [], sacAt = [];
    var boughtNow = 0;

    function note(kind, text, extra) {
      if (detail === 'none') return;
      if (detail === 'full') log.push({ t: st.time, kind: kind, text: text, extra: extra || '' });
    }
    function std(_) {}

    while (st.am < MAXAM && st.time < maxSec && guard++ < 2e6) {
      // 步长 = 游戏帧间隔（30 fps），与真人在 30/60Hz 下"按住最大"的购买节奏一致。
      // 步长越大，单位时间内能发生的"买满级联"次数越少，短跑会被显著高估。
      var dt = cfg.dt || (1 / 30);
      AD.step(st, dt);
      if (st.am > st.maxAM) st.maxAM = st.am;
      AD.checkAchievements(st);

      // 1) 买满维度：8 → 1（等价「按住最大」）
      for (var tier = S1.maxDimsOf(st); tier >= 1; tier--) {
        if (tier > 1 && st.dims[tier - 1] <= 0 && st.bought[tier - 1] <= 0) continue;
        var cnt = 0;
        while (cnt < 2000) {
          var got = AD.buyDim(st, tier, 1);
          if (!got) break;
          cnt++; boughtNow++;
        }
        if (cnt > 0 && firstBuy[tier] === undefined) {
          firstBuy[tier] = st.time;
          note('dim', '首次买入第 ' + tier + ' 维度（买 ' + cnt + ' 个）',
            'AM=' + fmt(st.am) + '  单价=' + fmt(AD.dimCost(st, tier)));
        }
      }
      // 2) 买满计数频率
      if (useTick && st.dims[2] > 0) {
        var tc = 0;
        while (tc < 3000) { if (!AD.buyTick(st, 1)) break; tc++; }
      }
      // 3) 维度提升（自动维度提升购买器）
      //    ★ C8 里维度提升倍率 = 1（源码 DimBoost.power 在 C8 直接 return 1），
      //    第 4 次之后提升只清空维度链、不给任何收益 → 必须停手（攻略："买满 4 次提升就买不动了"）
      var capB = (st.challenge === 8) ? 5 : (cfg.boostCap === undefined ? 1e9 : cfg.boostCap);
      var bg = 0;
      while (bg++ < 60 && st.boosts < capB) {
        var r = S1.reqOf(st, 'boost');
        if (st.dims[r.tier] < r.amount - 1e-9) break;
        var before = st.boosts;
        AD.doDimBoost(st);
        boostAt.push(st.time);
        note('boost', '第 ' + st.boosts + ' 次维度提升',
          '需要 第' + r.tier + '维 ≥ ' + r.amount + '  当时 AM=' + fmt(st.am));
        if (st.boosts <= before) break;
      }
      // 4) 星系
      if (galaxyCap !== 0) {
        var gg = 0;
        while (gg++ < 20) {
          if (galaxyCap !== 'inf' && st.galaxies >= galaxyCap) break;
          var gr = S1.reqOf(st, 'galaxy');
          if (st.boosts < 4) break;
          if (st.dims[gr.tier] < gr.amount - 1e-9) break;
          if (!AD.doGalaxy(st)) break;
          galAt.push(st.time);
          note('galaxy', '第 ' + st.galaxies + ' 个星系',
            '需要 第' + gr.tier + '维 ≥ ' + gr.amount + '  当时 AM=' + fmt(st.am));
        }
      }
      // 5) 献祭
      //    C8：只要有多倍收益就献祭（chall8TotalSacrifice 跨献祭累积，是 C8 的唯一倍率来源）
      //    普通无限：仅在收益大（≥3 倍）且距上次 ≥60s 时献祭 —— 献祭会清空 1~7 维，
      //    频繁献祭反而会毁掉维度级联（攻略里的普通无限全程手动，基本不点献祭）
      if (AD.canSacrifice(st)) {
        var nb = S1.sacrificeNextBoost(st, st.dims[1]);
        var lastSac = sacAt.length ? sacAt[sacAt.length - 1] : -1e9;
        // C8：真实玩法是"让维度链长起来 → 献祭 → 再长起来"，
        // 而不是每帧都点（每帧点会让链子永远重建不完，反而更慢）
        // C8：真实玩法是"让维度链长起来 → 献祭 → 再长起来"。
        // 判据：第 1 维度至少要长到 sacrificed^0.8 量级才有正收益（源码 clampMin(1) 的含义），
        // 所以要求 nb ≥ 1.3 且距上次 ≥ cd 秒，避免"每帧点一次、链子永远长不起来"。
        // 关键：攻略原文「献祭倍数到约 1e40 时停手」—— 到目标倍数后必须停止献祭，
        // 否则维度链每几秒就被清空一次，永远堆不到 1.797e308（本仿真已复现这个死循环）
        var cd = cfg.sacCooldown === undefined ? 2 : cfg.sacCooldown;
        var stopAt = cfg.sacStopAt === undefined ? (st.challenge === 8 ? 1e40 : Infinity) : cfg.sacStopAt;
        var th = cfg.sacRatio === undefined ? 3 : cfg.sacRatio;
        var wantSac = (st.challenge === 8)
          ? (nb >= th && st.time - lastSac >= cd && S1.totalBoostOf(st) < stopAt)
          : (nb >= th && st.time - lastSac >= 60);
        if (wantSac) {
          AD.doSacrifice(st);
          sacAt.push(st.time);
          if (detail === 'full' && sacAt.length <= 12) {
            note('sac', '献祭 #' + sacAt.length + '（本次倍率 ×' + nb.toFixed(2) + '）',
              '累计献祭倍率=' + fmt(S1.totalBoostOf(st)) + '  AM=' + fmt(st.am));
          }
        }
      }
      // 6) 大坍缩
      if (st.am >= MAXAM) break;
    }

    var gained = S1.ipGain(st);
    return {
      ok: st.am >= MAXAM,
      time: st.time, ticksRun: guard,
      ipGained: gained,
      challenge: cfg.challenge || 0,
      boosts: st.boosts, galaxies: st.galaxies, ticks: st.ticksBought,
      bought: st.bought.slice(), dims: st.dims.slice(),
      sacCount: sacAt.length, boosts_: boostAt.length,
      infPower: st.infPower, idBought: st.idBought.slice(),
      idAmounts: st.idAmt.slice(), ipLeft: st.ip, maxAMAll: st.maxAMAll,
      finalSacBoost: window.AD.s1.totalBoostOf(st), maxSacNext: st.maxSacNext,
      firstBuy: firstBuy, boostAt: boostAt, galAt: galAt,
      log: log,
      achievements: Object.keys(st.achs).filter(function (k) { return st.achs[k]; }).map(Number)
    };
  }

  // ── 数值格式化 ────────────────────────────────────────────────────────
  function fmt(x) {
    if (!isFinite(x)) return '∞';
    if (x === 0) return '0';
    if (x >= 1e6 || x < 1e-3) return x.toExponential(3).replace('e+', 'e');
    return String(Math.round(x * 1000) / 1000);
  }
  function fmtTime(sec) {
    if (sec < 60) return sec.toFixed(1) + ' 秒';
    if (sec < 3600) return (sec / 60).toFixed(2) + ' 分钟';
    return (sec / 3600).toFixed(3) + ' 小时';
  }

  global.S1SIM = {
    IU: IU, IU_BY_KEY: IU_BY_KEY, iuFlags: iuFlags, canBuyIU: canBuyIU,
    achSet: achSet, baseAchs: baseAchs, runInfinity: runInfinity,
    fmt: fmt, fmtTime: fmtTime
  };
})(typeof window !== 'undefined' ? window : globalThis);
