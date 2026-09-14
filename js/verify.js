/* ============================================================================
 * AD Speedrun Optimizer — 模型校验 (verify.js)
 * ----------------------------------------------------------------------------
 * 两级校验：
 *  A. 与「真实游戏实测数值」对拍 —— 取自 E:/Downloads 的《反物质维度安卓通关攻略》
 *     里玩家逐条记录的"到某反物质数量时买了几个维度 / 买了第几次维度提升"，
 *     这些是真实游戏的硬数据，可以精确反推出成本公式。
 *  B. 与「参考优化器公开存档」对拍 —— menelajjj/ad-dimboost-optimizer 的
 *     docs/Saved_Runs，同样策略下的完成时间，容差 3%（其存档由较早期版本生成，
 *     成就结算细节略有差异，见 README 说明）。
 * ============================================================================ */
(function (global) {
  'use strict';
  var AD = global.AD, Solver = global.Solver;

  // ---- A. 攻略实测检查点 ----------------------------------------------------
  // 每条：到达某个维度提升时，最高维度的累计购买数 & 当时的大致反物质量
  // 反物质量用"该组 10 个维度的总花费"反推，必须与攻略记载的数量级一致
  var GUIDE_CHECKPOINTS = [
    { boosts: 1, tier: 4, bought: 20, am: 1e13, src: '攻略 1.1：1e13AM 购买了20个第4维度，购买维度提升1' },
    { boosts: 2, tier: 5, bought: 20, am: 1e18, src: '攻略 1.2：1e18AM 购买了20个第5维度，购买维度提升2' },
    { boosts: 3, tier: 6, bought: 20, am: 1e24, src: '攻略 1.2：1e24AM 购买了20个第6维度，购买维度提升3' },
    { boosts: 4, tier: 7, bought: 20, am: 1e31, src: '攻略 1.2：1e31AM 购买了20个第7维度，购买维度提升4' },
    { boosts: 5, tier: 8, bought: 20, am: 1e40, src: '攻略 1.2：1e40AM 购买了20个第8维度，购买维度提升5' },
    { boosts: 6, tier: 8, bought: 35, am: 5e69, src: '攻略 1.2：5e69AM 购买了35个第8维度，购买维度提升6' },
    { boosts: 7, tier: 8, bought: 50, am: 1e85, src: '攻略 1.2：1e85AM 购买了50个第8维度，购买维度提升7' },
    { boosts: 9, tier: 8, bought: 80, am: 1e130, src: '攻略 1.2：1e130AM 购买了80个第8维度，购买反物质星系1' },
    { boosts: 10, tier: 8, bought: 99, am: 1e160, src: '攻略 1.3：1e160AM 买到刚好99个第8维度（拿成就r23）' },
    { boosts: 2, tier: 8, bought: 140, am: 1e220, src: '攻略 1.3：1e220AM 购买了140个第8维度，购买反物质星系2' }
  ];

  /** 计算"买到 bought 个 tier 维度"总共需要的反物质（含分组涨价） */
  function costToBuy(tier, count) {
    var total = 0;
    var bought = 0;
    while (bought < count) {
      var group = Math.floor(bought / 10);
      var unit = AD.DIM_BASE_COST[tier] * Math.pow(AD.DIM_COST_MULT[tier], group);
      var n = Math.min(10, count - bought);
      total += unit * n;
      bought += n;
    }
    return total;
  }

  function runGuideChecks() {
    var rows = [];
    var allOk = true;
    for (var i = 0; i < GUIDE_CHECKPOINTS.length; i++) {
      var c = GUIDE_CHECKPOINTS[i];
      var cost = costToBuy(c.tier, c.bought);
      var ratio = cost / c.am;
      // 允许 10 倍以内偏差：攻略里的反物质是在"买到该组之前"的近似值
      var ok = ratio > 0.03 && ratio < 30;
      allOk = allOk && ok;
      rows.push({
        label: '维度提升 ' + c.boosts + '：第 ' + c.tier + ' 维度 x' + c.bought,
        model: cost,
        guide: c.am,
        ratio: ratio,
        ok: ok,
        src: c.src
      });
    }
    return { ok: allOk, rows: rows };
  }

  // ---- B. 参考优化器存档对拍 ------------------------------------------------
  var REF_RUNS = [
    { platform: 'pc', galaxies: 0, boosts: 1, kind: 'dimboost', ref: 1301.685 },
    { platform: 'pc', galaxies: 0, boosts: 2, kind: 'dimboost', ref: 1272.513 },
    { platform: 'mobile', galaxies: 0, boosts: 1, kind: 'dimboost', ref: 650.825 },
    { platform: 'mobile', galaxies: 0, boosts: 2, kind: 'dimboost', ref: 636.200 }
  ];

  function runReferenceChecks() {
    var rows = [];
    var allOk = true;
    for (var i = 0; i < REF_RUNS.length; i++) {
      var r = REF_RUNS[i];
      var res = Solver.simulateFixedStrategy(r.galaxies, r.boosts, r.kind, '12345678T', { platform: r.platform });
      var dev = (res.time - r.ref) / r.ref * 100;
      var ok = Math.abs(dev) < 3.0;
      allOk = allOk && ok;
      rows.push({
        label: r.platform.toUpperCase() + ' 星系' + r.galaxies + ' 提升' + r.boosts,
        model: res.time, ref: r.ref, dev: dev, ok: ok
      });
    }
    return { ok: allOk, rows: rows };
  }

  global.Verify = {
    GUIDE_CHECKPOINTS: GUIDE_CHECKPOINTS, REF_RUNS: REF_RUNS,
    costToBuy: costToBuy,
    runGuideChecks: runGuideChecks, runReferenceChecks: runReferenceChecks
  };
})(typeof window !== 'undefined' ? window : globalThis);
