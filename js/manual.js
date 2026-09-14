/* ============================================================================
 * 手动路线规划器（manual.js）
 * ----------------------------------------------------------------------------
 * 场景：1 IP 之后的头几次大坍缩 —— 还没有（或刻意不用）自动购买器。
 *
 * 为什么手动反而更快（源码事实）：
 *   · 反物质维度自动购买器默认间隔 = [500,600,700,800,900,1000,1100,1200] 毫秒，
 *     即第 1 维度每 500ms 才买一次、第 8 维度每 1200ms 一次（autobuyers/antimatter-dimension-autobuyer.js）
 *   · 而 PC 端按住「Max」是**按帧**购买（30fps = 33ms 一次）—— 快 15~36 倍
 *   · 自动购买器还要花反物质买：第 k 个的价格 = 1e40 × 1e10^(k−1)（第 1 个 1e40、第 8 个 1e110）
 *   · 只有通关对应普通挑战后才变成"可升级"（`canBeUpgraded = NormalChallenge(tier).isCompleted`）
 *   → 结论：头几次大坍缩手动「按住 Max + 手动按提升/星系/献祭」是最快的；
 *     自动购买器要到"反物质多得没处花"或者通关 C1~C8 之后才值得接管。
 *
 * 本模块做的事：
 *   在给定的 IU 配置 + 成就状态下，搜索"什么时候按提升 / 按星系 / 按献祭"这组
 *   人类决策的最优序列，并输出一条带时间戳的手动操作流水。
 *   维度与计数频率一律按"按住 Max"处理（每帧买满）。
 * ============================================================================ */
(function (global) {
  'use strict';
  var AD = global.AD;
  var S1 = AD && AD.s1;
  var SIM = null;                    // 延迟绑定 S1SIM（脚本加载顺序无关）
  function sim() { if (!SIM) SIM = global.S1SIM; return SIM; }
  function fmt(x) { return sim().fmt(x); }

  /**
   * 跑一次手动攻略
   * @param {object} cfg
   *   iuSet        已购无限升级
   *   ach          成就集
   *   infinities   累计无限次数
   *   ipMult       IP 倍率
   *   fps          「按住 Max」的帧率（30 = 游戏默认，60 = 60fps）
   *   galaxyCap    本跑最多买几个星系（'inf' 不限）
   *   sacPolicy    'never' | 'ratio'（只在 ≥ratio 倍时献祭）
   *   sacRatio     献祭阈值
   *   boostPlan    null = 能提升就提升；或 [{maxBoosts, galaxyAfter}...] 形式的排程
   *   maxSeconds   上限
   *   clickCost    每次"人类动作"（提升/星系/献祭/大坍缩）占用的时间（秒）
   */
  function runManual(cfg) {
    var st = AD.newState({
      platform: 'pc', iu: sim().iuFlags(cfg.iuSet || {}),
      infinitiesTotal: cfg.infinities || 1
    });
    st.achs = cfg.ach;
    st.ip = cfg.ip || 0; st.ipMult = cfg.ipMult || 1; st.ipMultLv = 0;
    st.achDirty = true;
    st.boosts = S1.startingBoosts(st);
    if ((st.iu || {}).skipResetGalaxy) st.galaxies = 1;
    st.am = S1.startingAM(st); st.maxAM = st.am; st.time = 0;

    var fps = cfg.fps || 30;
    var dt = 1 / fps;
    var click = cfg.clickCost === undefined ? 0.12 : cfg.clickCost;   // 一次人类点击 ~120ms
    var cap = cfg.galaxyCap === undefined ? 'inf' : cfg.galaxyCap;
    var sacRatio = cfg.sacRatio === undefined ? 3 : cfg.sacRatio;
    var sacPolicy = cfg.sacPolicy || 'ratio';
    var maxSec = cfg.maxSeconds || 12 * 3600;

    var actions = [];           // 人类动作流水
    var firstBuy = {}, groups10 = {}, tickBought = 0;
    var guard = 0, tHuman = 0;

    function push(act, extra, kind) {
      actions.push({ t: st.time, act: act, extra: extra || '', kind: kind || 'act' });
    }
    push('开局：按住「Max」买满 1~8 维度 + 计数频率', '开局 AM=' + fmt(st.am), 'start');

    while (st.am < 1.7976931348623157e308 && st.time < maxSec && guard++ < 4e6) {
      AD.step(st, dt);
      if (st.am > st.maxAM) st.maxAM = st.am;
      AD.checkAchievements(st);

      // 按住 Max：8→1 全部维度买满
      for (var tier = S1.maxDimsOf(st); tier >= 1; tier--) {
        if (tier > 1 && st.dims[tier - 1] <= 0 && st.bought[tier - 1] <= 0) continue;
        var c = 0;
        while (c < 3000) { if (!AD.buyDim(st, tier, 1)) break; c++; }
        if (c > 0 && firstBuy[tier] === undefined) {
          firstBuy[tier] = st.time;
          push('首次买入第 ' + tier + ' 维度（' + c + ' 个）',
            'AM=' + fmt(st.am) + '　单价 ' + fmt(AD.dimCost(st, tier)), 'dim');
        }
        // 买满 10 个的档位（每个 10 个 ×2 / ×2.2）
        var g10 = Math.floor(st.bought[tier] / 10);
        if (g10 > (groups10[tier] || 0)) {
          groups10[tier] = g10;
          if (g10 <= 3 || g10 % 10 === 0) {
            push('第 ' + tier + ' 维度买满 ' + (g10 * 10) + ' 个（累计倍率 ×' +
              fmtMult(st, tier) + '）', 'AM=' + fmt(st.am), 'dim10');
          }
        }
      }
      // 计数频率（也按住 Max）
      if (st.dims[2] > 0) {
        var tc = 0;
        while (tc < 3000) { if (!AD.buyTick(st, 1)) break; tc++; }
        if (st.ticksBought > tickBought) {
          if (tickBought === 0 || st.ticksBought - tickBought >= 10) {
            push('买计数频率 → 第 ' + st.ticksBought + ' 次（×' +
              fmt(S1.tickSpeedFactorOf(st)) + '^n）', 'AM=' + fmt(st.am), 'tick');
          }
          tickBought = st.ticksBought;
        }
      }
      // 维度提升（人类动作，按不按由策略决定）
      var bg = 0;
      while (bg++ < 40) {
        var r = S1.reqOf(st, 'boost');
        if (st.dims[r.tier] < r.amount - 1e-9) break;
        if (cfg.boostPlan && !boostAllowed(cfg.boostPlan, st.boosts, st.galaxies)) break;
        st.time += click;                       // 点击耗时
        AD.doDimBoost(st);
        push('★ 按「维度提升」→ 第 ' + st.boosts + ' 次',
          '需要 第' + r.tier + '维 ≥ ' + r.amount + '　当时 AM=' + fmt(st.am), 'boost');
      }
      // 星系
      if (cap !== 0) {
        var gg = 0;
        while (gg++ < 20) {
          if (cap !== 'inf' && st.galaxies >= cap) break;
          if (st.boosts < 4) break;
          var gr = S1.reqOf(st, 'galaxy');
          if (st.dims[gr.tier] < gr.amount - 1e-9) break;
          if (cfg.boostPlan && !galaxyAllowed(cfg.boostPlan, st.boosts, st.galaxies)) break;
          st.time += click;
          if (!AD.doGalaxy(st)) break;
          push('★ 按「星系」→ 第 ' + st.galaxies + ' 个',
            '需要 第' + gr.tier + '维 ≥ ' + gr.amount + '　当时 AM=' + fmt(st.am), 'galaxy');
        }
      }
      // 献祭
      if (sacPolicy !== 'never' && AD.canSacrifice(st)) {
        var nb = S1.sacrificeNextBoost(st, st.dims[1]);
        var last = actions.filter(function (a) { return a.kind === 'sac'; });
        var lastT = last.length ? last[last.length - 1].t : -1e9;
        if (nb >= sacRatio && st.time - lastT >= 60) {
          st.time += click;
          AD.doSacrifice(st);
          push('★ 按「维度献祭」（本次倍率 ×' + nb.toFixed(2) + '）',
            '累计献祭倍率 ' + fmt(S1.totalBoostOf(st)), 'sac');
        }
      }
      if (st.am >= 1.7976931348623157e308) break;
    }
    push('★ 按「大坍缩」→ 通关本阶段', '最终 AM=' + fmt(st.am) + '　获得 ' + ipText(st), 'crunch');

    function fmtMult(s, tier) {
      var m = AD.computeMults(s)[tier];
      return m >= 1e6 ? m.toExponential(2) : m.toFixed(2);
    }
    function ipText(s) { return S1.ipGain(s) + ' IP'; }

    return {
      ok: st.am >= 1.7976931348623157e308,
      time: st.time, actions: actions,
      boosts: st.boosts, galaxies: st.galaxies, ticks: st.ticksBought,
      bought: st.bought.slice(), sacCount: actions.filter(function (a) { return a.kind === 'sac'; }).length,
      ipGained: S1.ipGain(st), fps: fps
    };
  }

  // 排程辅助：boostPlan = [{maxBoosts: n, galaxy: true|false}, ...] 逐段推进
  function boostAllowed(plan, boosts, galaxies) {
    var seg = plan[Math.min(galaxies, plan.length - 1)];
    if (!seg) return true;
    return boosts < (seg.maxBoosts === undefined ? Infinity : seg.maxBoosts);
  }
  function galaxyAllowed(plan, boosts, galaxies) {
    var seg = plan[Math.min(galaxies, plan.length - 1)];
    if (!seg) return true;
    return seg.galaxy !== false && boosts >= (seg.minBoosts || 0);
  }
  global.MANUAL = { runManual: runManual };
})(typeof window !== 'undefined' ? window : globalThis);
