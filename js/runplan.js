/* ============================================================================
 * AD Speedrun Optimizer — 全局速通操作表 (runplan.js)
 * ----------------------------------------------------------------------------
 * 数据源：window.REFDATA —— 参考优化器 menelajjj/ad-dimboost-optimizer 公开的
 *         每阶段最优动作序列（由该站点的分支搜索 + 支配剪枝求出）。
 *
 * 关键性质（本工具的理论基础）：维度提升 / 星系会把维度状态全部清零，
 * 因此每个阶段互不影响，可以直接把每阶段的最优动作序列首尾拼接成整段速通，
 * 得到一条「全局最优（当前已知）」的完整操作流水。
 *
 * 排程（哪一次提升后买星系）沿用参考站点的结论：
 *   星系 1：买满 8 次维度提升后
 *   星系 2：买满 12 次维度提升后
 *   最后：  买满 16 次维度提升后，反物质冲过 1.797e308 → 大坍缩
 * （本工具的阶段图 DP 用自有模型独立验证过该排程，结论一致，见 README）
 * ============================================================================ */
(function (global) {
  'use strict';

  var SCHEDULE = {
    // galaxyIndex -> 该星系阶段内要完成的维度提升次数（含最后一次）
    // 例如 [0,8] 表示：0 星系阶段依次完成提升 1..8，第 8 次提升之后买星系 1
    0: { lastBoost: 8, next: 'galaxy' },
    1: { lastBoost: 12, next: 'galaxy' },
    2: { lastBoost: 16, next: 'infinity' }
  };

  function stageList(platform) {
    var all = (global.REFDATA && global.REFDATA[platform]) || [];
    var byKey = {};
    all.forEach(function (s) { byKey[s.g + ':' + s.b] = s; });
    return byKey;
  }

  /** 取某个阶段的记录（含动作序列） */
  function getStage(platform, g, b) {
    return stageList(platform)[g + ':' + b] || null;
  }

  /**
   * 构建整段速通计划。
   * @returns {platform, stages:[{g,b,kind,goalText,time,sac,st,start,end,actions:[...]}],
   *           total, perGalaxy:{g:time}, actionCount, playable}
   */
  function build(platform) {
    platform = platform || 'pc';
    var byKey = stageList(platform);
    var stages = [];
    var t0 = 0;
    var perGalaxy = {};
    var g = 0;
    var guard = 0;

    while (guard++ < 12) {
      var cfg = SCHEDULE[g];
      if (!cfg) break;
      for (var b = 0; b <= cfg.lastBoost; b++) {
        var s = byKey[g + ':' + b];
        if (!s) continue;
        var kind = (b === cfg.lastBoost) ? cfg.next : 'dimboost';
        var goalText;
        if (kind === 'infinity') {
          goalText = '反物质冲过 1.797e308 → 点「大坍缩」';
        } else if (kind === 'galaxy') {
          goalText = '第 8 维度买到 ' + (80 + 60 * g) + ' 个 → 买第 ' + (g + 1) + ' 个反物质星系';
        } else {
          var need = b < 4 ? 20 : 20 + (b - 4) * 15;
          var tier = Math.min(b + 4, 8);
          goalText = '第 ' + tier + ' 维度买到 ' + need + ' 个 → 买第 ' + (b + 1) + ' 次维度提升';
        }
        var start = t0;
        t0 += s.t;
        perGalaxy[g] = (perGalaxy[g] || 0) + s.t;
        stages.push({
          g: g, b: b, kind: kind, goalText: goalText,
          time: s.t, sac: s.sac, st: s.st,
          start: start, end: t0, actions: s.a,
          source: s
        });
      }
      if (cfg.next === 'infinity') break;
      g++;
    }

    // 展开全局动作流水
    var actions = [];
    stages.forEach(function (st, si) {
      st.actions.forEach(function (a) {
        actions.push({
          stage: si, g: st.g, b: st.b,
          item: a[0], n: a[1], cost: a[2],
          t: st.start + a[3]
        });
      });
    });

    return {
      platform: platform,
      stages: stages,
      perGalaxy: perGalaxy,
      actions: actions,
      actionCount: actions.length,
      total: t0,
      playable: stages.length > 0 && actions.length > 0
    };
  }

  /** 从第 si 个阶段起裁剪计划（用于中途接手） */
  function sliceFrom(plan, si) {
    if (si <= 0) return plan;
    var stages = plan.stages.slice(si);
    var base = stages.length ? stages[0].start : plan.total;
    var stages2 = stages.map(function (s) {
      var c = {};
      for (var k in s) c[k] = s[k];
      c.start = s.start - base;
      c.end = s.end - base;
      return c;
    });
    var actions = [];
    stages2.forEach(function (st, k) {
      st.actions.forEach(function (a) {
        actions.push({ stage: k, g: st.g, b: st.b, item: a[0], n: a[1], cost: a[2], t: st.start + a[3] });
      });
    });
    var perGalaxy = {};
    stages2.forEach(function (s) { perGalaxy[s.g] = (perGalaxy[s.g] || 0) + s.time; });
    return {
      platform: plan.platform, stages: stages2, perGalaxy: perGalaxy,
      actions: actions, actionCount: actions.length,
      total: stages2.length ? stages2[stages2.length - 1].end : 0,
      playable: stages2.length > 0
    };
  }

  /** 参考站公布的汇总数字（用于对照展示） */
  var PUBLISHED = {
    pc: { g0: 247 * 60 + 26.631, g1: 132 * 60 + 37.913, g2: 50 * 60 + 22.567,
          total: 430 * 60 + 27.113, label: 'PC / Steam' },
    mobile: { g0: 123 * 60 + 42.250, g1: 66 * 60 + 15.649, g2: 25 * 60 + 7.424,
              total: 215 * 60 + 5.325, label: '安卓（永久广告加成 维度×2）' }
  };

  global.RunPlan = {
    SCHEDULE: SCHEDULE, PUBLISHED: PUBLISHED,
    build: build, getStage: getStage, sliceFrom: sliceFrom
  };
})(typeof window !== 'undefined' ? window : globalThis);
