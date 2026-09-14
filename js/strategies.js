/* ============================================================================
 * AD Speedrun Optimizer — 购买策略层 (strategies.js)
 * ----------------------------------------------------------------------------
 * 这里实现了两类东西：
 *  1) 固定优先级策略（baseline）：完全复刻 menelajjj/ad-dimboost-optimizer 里的
 *     FixedXXXXPurchaseStrategy，用来给优化器当"对照组"。
 *  2) 候选集生成器：给束搜索(beam search)提供"当前值得考虑的动作"，
 *     把 Naive 的 9 种动作裁剪到通常 2~4 种，是搜索能跑得动的关键。
 *
 * 物品编号约定：0 = 计数频率(Tickspeed)，1..8 = 第 1..8 维度。
 * ============================================================================ */
(function (global) {
  'use strict';
  var AD = global.AD;

  function costOf(s, item) { return item === 0 ? AD.tickCost(s) : AD.dimCost(s, item); }
  function costStackOf(s, item) { return item === 0 ? AD.tickCost(s) : AD.dimCost(s, item) * 10; }

  /**
   * 固定策略的候选过滤（照抄 reference 的 filter_items_for_fixed_strategies）：
   *  1. 第 1 维度没买过 -> 只考虑它
   *  2. 任何维度购买数不是 10 的倍数 -> 只考虑它（保证"成组购买"）
   *  3. 取"最便宜整组"（维度按 10 个一组计，计数频率按 1 次计，容差 1%）
   *  4. 若最贵的那一档还没买过 -> 直接买它（解锁新维度优先）
   *  5. 若买它就能满足本阶段目标 -> 直接买它
   */
  function filterFixed(s, M, targetAmount) {
    if (s.bought[1] === 0) return [1];

    for (var t = 1; t <= M; t++) if (s.bought[t] % 10 !== 0) return [t];

    var lastTier = 0;
    for (var i = 1; i <= M; i++) if (s.bought[i] > 0) lastTier = i;
    if (lastTier === 0) lastTier = 1;
    if (s.bought[lastTier] >= 10 && lastTier < M) lastTier += 1;

    var cand = [{ item: 0, cost: costOf(s, 0), stack: costStackOf(s, 0) }];
    for (var j = 1; j <= lastTier; j++) {
      cand.push({ item: j, cost: costOf(s, j), stack: costStackOf(s, j) });
    }
    var minStack = Infinity;
    for (var k = 0; k < cand.length; k++) minStack = Math.min(minStack, cand[k].stack);
    cand = cand.filter(function (x) { return x.stack <= minStack * 1.01; });

    var last = cand[cand.length - 1].item;
    if (s.bought[last] === 0) return [last];
    if (last === M && (s.bought[last] + 10) >= targetAmount) return [last];

    return cand.map(function (x) { return x.item; });
  }

  /** 各固定策略：从候选里挑 1 个 */
  var FIXED = {
    '12345678T': function (f) {           // 维度由低到高，计数频率兜底
      if (f.indexOf(0) < 0) return f[0];
      if (f.length > 1) return f[1];
      return 0;
    },
    'T12345678': function (f) {           // 计数频率优先
      if (f.indexOf(0) >= 0) return 0;
      return f[0];
    },
    'T87654321': function (f) {           // 计数频率优先，其次维度由高到低
      if (f.indexOf(0) >= 0) return 0;
      return f[f.length - 1];
    },
    '87654321T': function (f) {           // 维度由高到低，计数频率兜底
      if (f.indexOf(0) < 0) return f[0];
      if (f.length > 1) return f[f.length - 1];
      return 0;
    }
  };

  /**
   * 参考优化器的 OptimizedPurchaseStrategy —— 一个相当强的规则型启发式，
   * 我们把它作为"高级基线"，也是束搜索剪枝前的默认候选来源。
   */
  function optimizedCandidates(s, M, targetAmount) {
    if (s.bought[1] === 0) return [1];

    for (var i = 0; i <= M; i++) {
      if (costOf(s, i) * 1000 <= s.am) return [i];
    }
    for (var t = 1; t <= M; t++) {
      if (s.bought[t] > 10 && s.bought[t] % 10 !== 0) return [t];
    }

    var lastTier = 0;
    for (var q = 1; q <= M; q++) if (s.bought[q] > 0) lastTier = q;
    if (lastTier === 0) lastTier = 1;
    if (s.bought[lastTier] >= 10 && lastTier < M) lastTier += 1;

    var cand = [{ item: 0, cost: costOf(s, 0), stack: costStackOf(s, 0) }];
    for (var j = 1; j < lastTier; j++) cand.push({ item: j, cost: costOf(s, j), stack: costStackOf(s, j) });
    if (cand.length === 0) cand.push({ item: 1, cost: costOf(s, 1), stack: costStackOf(s, 1) });

    var minStack = Infinity;
    for (var k = 0; k < cand.length; k++) minStack = Math.min(minStack, cand[k].stack);
    cand = cand.filter(function (x) { return x.stack <= minStack * 1.01; });

    var lastStack = costStackOf(s, lastTier);
    var out;
    if (lastStack < minStack * 0.2) return [lastTier];
    if (lastStack < minStack * 20) {
      out = cand.slice();
      out.push({ item: lastTier, cost: costOf(s, lastTier), stack: costStackOf(s, lastTier) });
    } else {
      out = cand.slice();
    }
    out.sort(function (a, b) { return a.cost - b.cost; });
    return out.map(function (x) { return x.item; });
  }

  /**
   * 更激进的候选集：把所有"当前买得起"的动作都放进来（按成本升序），
   * 但受 branchLimit 限制。束搜索用它来做真正的分支。
   */
  function allAffordable(s, M, branchLimit) {
    var list = [];
    for (var i = 0; i <= M; i++) {
      var c = costOf(s, i);
      if (c <= s.am && c < AD.INFINITY_AM) list.push({ item: i, cost: c });
    }
    list.sort(function (a, b) { return a.cost - b.cost; });
    return list.slice(0, branchLimit || 6).map(function (x) { return x.item; });
  }

  global.Strategies = {
    costOf: costOf, costStackOf: costStackOf,
    filterFixed: filterFixed, FIXED: FIXED,
    optimizedCandidates: optimizedCandidates,
    allAffordable: allAffordable
  };
})(typeof window !== 'undefined' ? window : globalThis);
