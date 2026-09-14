/* ============================================================================
 * AD Speedrun Optimizer — 求解器 (solver.js)
 * ----------------------------------------------------------------------------
 * 三层结构：
 *   Layer A  单阶段前向仿真  simulate()      —— 忠实复刻游戏 tick 循环
 *   Layer B  阶段内策略优化  solveStage()    —— 决策序列局部搜索（增量式）
 *   Layer C  全局阶段图 DP   solveRun()      —— 维度提升/星系的最优排程
 *
 * 关键结构性结论（本优化器的理论基础）：
 *   维度提升 / 星系都会把"维度数量、已购维度、计数频率、献祭量"全部清零，
 *   因此一次速通可以严格分解为若干**独立阶段** (星系 g, 提升 b)。
 *   阶段耗时只取决于 (g,b) 与该阶段的阶段目标，与到达路径无关，
 *   于是全局最优 = 阶段 DAG 上的最短路（DP），阶段内最优 = 局部搜索。
 *
 * 性能核心：局部搜索采用「前缀快照 + 时间上界剪枝」的增量求值。
 *   - 改变第 k 个决策只影响 k 之后的过程 -> 从 prefix[k] 续跑，省掉前缀
 *   - 任何试解一旦 s.time > best.time 就立即剪枝（到目标必然更晚）
 *   两者结合把一轮全扫描从 ~10^3 次全程仿真降到 ~3 次全程仿真的开销。
 * ============================================================================ */
(function (global) {
  'use strict';
  var AD = global.AD, ST = global.Strategies;

  var MAX_STAGE_SECONDS = 24 * 3600;      // 单阶段仿真上限
  var SCREEN_STAGE_SECONDS = 4 * 3600;    // 粗筛用上限：超过 4 小时游戏时间的阶段一律视为不可行
  var STUCK = Infinity;

  // ======================================================= A. 目标与阶段描述
  function stageGoal(galaxies, boosts, kind) {
    if (kind === 'dimboost') {
      var r = AD.dimBoostReq(boosts);
      return { kind: kind, tier: r.tier, amount: r.amount };
    }
    if (kind === 'galaxy') {
      var g = AD.galaxyReq(galaxies);
      return { kind: kind, tier: g.tier, amount: g.amount };
    }
    return { kind: 'infinity', tier: 8, amount: Infinity, amGoal: AD.INFINITY_AM };
  }

  function goalMet(s, goal) {
    if (goal.kind === 'infinity') return s.am >= AD.INFINITY_AM;
    return s.bought[goal.tier] >= goal.amount;
  }

  /** 阶段起始状态：刚买完一次维度提升 / 星系 */
  function stageStartState(galaxies, boosts, platform) {
    var s = AD.newState({ platform: platform, galaxies: galaxies, boosts: boosts });
    // 游戏构造时会立刻买下 1 个第 1 维度
    s.bought[1] = 1; s.dims[1] = 1; s.am = AD.START_AM - AD.DIM_BASE_COST[1];
    return s;
  }

  // ============================================================== A. 仿真
  /**
   * @param state0  起始状态
   * @param goal    阶段目标
   * @param policy  整数数组，policy[k] = 第 k 个决策点选第几个候选
   * @param opts    {dt, candidates, maxSeconds, timeLimit, startDecision, prefix,
   *                 pickFn, sacrificePolicy}
   */
  function simulate(state0, goal, policy, opts) {
    opts = opts || {};
    var dt = opts.dt || (state0.platform === 'mobile' ? 0.025 : 0.033);
    var candFn = opts.candidates || function (s, M, tgt) { return ST.optimizedCandidates(s, M, tgt); };
    var maxSec = opts.maxSeconds || MAX_STAGE_SECONDS;
    var timeLimit = opts.timeLimit === undefined ? Infinity : opts.timeLimit;
    var prefix = opts.prefix || null;          // prefix[d] = 第 d 个决策点之前的状态快照
    var refPrefix = opts.refPrefix || null;    // 参考轨迹快照，用于支配剪枝
    var pickFn = opts.pickFn || null;          // 用函数代替静态策略（用于播种基线）
    var s = AD.cloneState(state0);
    var actions = [];
    var used = [];                             // 记录实际用到的决策序列
    var d = opts.startDecision || 0;
    var started = d > 0;                        // 从快照续跑时，第一步不再 tick

    while (true) {
      if (!started) {
        AD.step(s, dt);
        AD.checkAchievements(s);
        if (goalMet(s, goal)) {
          return { ok: true, time: s.time, actions: actions, decisions: d, policyUsed: used, state: s };
        }
      }
      started = false;

      var M = AD.maxDims(s.boosts);
      var targetAmount = goal.kind === 'infinity' ? Infinity : goal.amount;

      // ---- 连续购买阶段（每次购买 = 一个决策点）
      while (true) {
        if (s.time > timeLimit) return { ok: false, reason: 'pruned', time: STUCK, decisions: d, actions: actions };
        // 支配剪枝：同一决策位上如果"更晚 + 反物质更少 + 维度更少 + 购买数完全相同"，
        // 则该分支永远追不上参考轨迹，可安全剪掉（购买数相同保证成本/倍率结构一致）
        if (refPrefix && refPrefix[d]) {
          var rf = refPrefix[d];
          if (s.time > rf.time && s.am <= rf.am) {
            var dom = true;
            for (var tt = 1; tt <= 8; tt++) if (s.dims[tt] > rf.dims[tt]) { dom = false; break; }
            if (dom) for (var tb = 0; tb <= 8; tb++) if (s.bought[tb] !== rf.bought[tb]) { dom = false; break; }
            if (dom) return { ok: false, reason: 'dominated', time: STUCK, decisions: d, actions: actions };
          }
        }
        if (prefix) prefix[d] = AD.cloneState(s);

        var cands = candFn(s, M, targetAmount);
        if (!cands || cands.length === 0) break;
        var idx;
        if (pickFn) idx = pickFn(s, cands, d);
        else idx = policy && policy[d] !== undefined ? policy[d] : 0;
        if (!(idx >= 0)) idx = 0;
        if (idx >= cands.length) idx = cands.length - 1;
        var item = cands[idx];
        var cost = ST.costOf(s, item);
        if (!(cost <= s.am)) break;

        if (item === 0) AD.buyTick(s, 1); else AD.buyDim(s, item, 1);
        actions.push({ t: s.time, item: item, cost: cost });
        used[d] = idx;
        d++;
        AD.checkAchievements(s);
        if (goalMet(s, goal)) {
          return { ok: true, time: s.time, actions: actions, decisions: d, policyUsed: used, state: s };
        }
      }

      // ---- 献祭（可选：由 sacrificePolicy 决定是否值得）
      if (opts.sacrificePolicy && AD.canSacrifice(s)) {
        var boost = AD.sacrificeBoost(s.dims[1], s.sacrificed);
        if (opts.sacrificePolicy(s, boost)) {
          if (prefix) prefix[d] = AD.cloneState(s);
          AD.doSacrifice(s);
          actions.push({ t: s.time, item: 9, cost: boost });
          used[d] = 0;
          d++;
        }
      }

      if (s.time >= maxSec) return { ok: false, reason: 'timeout', time: STUCK, decisions: d, actions: actions };
    }
  }

  // ================================================== B. 阶段内策略优化
  function solveStage(galaxies, boosts, kind, opts) {
    opts = opts || {};
    var platform = opts.platform || 'pc';
    var dtFine = platform === 'mobile' ? 0.025 : 0.033;
    var dtSearch = opts.dtSearch || 0.1;             // 搜索用粗步长（最后会用原生 tick 复算）
    var restarts = opts.restarts === undefined ? (effort >= 2 ? 2 : 0) : opts.restarts;
    var branchLimit = opts.branchLimit || 6;
    // effort: -1=粗筛(DP 全局扫描用) 0=快速 1=标准 2=深度
    var effort = opts.effort === undefined ? 1 : opts.effort;
    var passLimit = opts.passLimit || (effort >= 2 ? 6 : (effort >= 1 ? 3 : 0));
    var stride = opts.stride || (effort >= 2 ? 1 : 3);
    var budgetMs = opts.timeBudgetMs === undefined
      ? ({ '-1': 400, '0': 900, '1': 3500, '2': 20000 })[String(effort)] || 3500
      : opts.timeBudgetMs;
    // 阶段仿真时间上限：粗筛时收紧到 4 小时，避免在"这辈子都到不了"的节点上浪费时间
    var maxSec = opts.maxSeconds || (effort < 0 ? SCREEN_STAGE_SECONDS : MAX_STAGE_SECONDS);
    if (effort < 0) dtSearch = opts.dtSearch || 0.2;
    var t0 = Date.now();
    function outOfTime() { return Date.now() - t0 > budgetMs; }

    var start = stageStartState(galaxies, boosts, platform);
    var goal = stageGoal(galaxies, boosts, kind);
    var targetAmount = goal.kind === 'infinity' ? Number.MAX_SAFE_INTEGER : goal.amount;

    // ---- 候选集：规则型候选 ∪ 四种固定基线的选择（保证基线解一定落在搜索空间里）
    var FIXED_NAMES = ['12345678T', 'T12345678', 'T87654321', '87654321T'];
    var candFn = function (s, M, tgt) {
      var list = ST.optimizedCandidates(s, M, tgt).slice();
      var f = ST.filterFixed(s, M, tgt);
      for (var i = 0; i < FIXED_NAMES.length; i++) {
        var it = ST.FIXED[FIXED_NAMES[i]](f);
        if (list.indexOf(it) < 0) list.push(it);
      }
      if (opts.branch) {
        var extra = ST.allAffordable(s, M, branchLimit);
        for (var j = 0; j < extra.length; j++) if (list.indexOf(extra[j]) < 0) list.push(extra[j]);
      }
      return list;
    };
    // 静态策略（局部搜索用）与动态挑选函数（播种用）共用同一候选集
    var seedCandFn = function (s, M, tgt) { return candFn(s, M, tgt); };

    // ---------- 献祭策略
    // 第 5 次维度提升解锁献祭。攻略推荐"乘数达到 4 倍时献祭"，
    // 这里把阈值 theta 也当成一个搜索维度（effort>=1 时枚举多档）。
    var thetaList = opts.sacThetas || (effort >= 2 ? [2, 4, 8, 16, 30]
      : (effort >= 1 ? [4, 12] : [4]));
    var sacPolicyFor = function (th) {
      return function (s, boost) { return s.boosts >= 5 && s.dims[8] > 0 && boost >= th; };
    };
    var sacPolicy = opts.sacrificePolicy || sacPolicyFor(thetaList[0]);

    // ---------- 播种：贪心(优化候选第 0 位) + 固定基线
    // effort 0 只播种两个最强基线（快）；effort>=1 再补上其余基线与贪心
    var best = null, bestPolicy = null, prefix = null, bestTheta = thetaList[0];
    var seedNames = effort >= 1 ? FIXED_NAMES : (effort === 0 ? ['12345678T', '87654321T'] : ['12345678T']);
    var seeds = [];
    if (effort >= 1) seeds.push(function () { return 0; });
    for (var fi = 0; fi < seedNames.length; fi++) {
      (function (nm) {
        seeds.push(function (s, cands) {
          var f = ST.filterFixed(s, AD.maxDims(s.boosts), targetAmount);
          var want = ST.FIXED[nm](f);
          var k = cands.indexOf(want);
          return k >= 0 ? k : 0;
        });
      })(seedNames[fi]);
    }
    for (var si = 0; si < seeds.length; si++) {
      var pfx = [];
      var r = simulate(start, goal, [], {
        dt: dtSearch, candidates: seedCandFn, pickFn: seeds[si],
        prefix: pfx, sacrificePolicy: sacPolicy, maxSeconds: maxSec
      });
      if (r.ok && (!best || r.time < best.time)) {
        best = r;
        bestPolicy = (r.policyUsed || []).slice();
        prefix = pfx;
      }
      if (outOfTime() && best) break;
    }
    if (!best) return { ok: false, time: STUCK, galaxies: galaxies, boosts: boosts, kind: kind, goal: goal };

    // ---------- 献祭阈值扫描（只对已解锁献祭的阶段有意义）
    if (thetaList.length > 1 && boosts >= 5) {
      for (var ti = 1; ti < thetaList.length && !outOfTime(); ti++) {
        var sp = sacPolicyFor(thetaList[ti]);
        var pfx2 = [];
        var rt = simulate(start, goal, [], {
          dt: dtSearch, candidates: seedCandFn, pickFn: seeds[0],
          prefix: pfx2, sacrificePolicy: sp, maxSeconds: maxSec
        });
        if (rt.ok && rt.time < best.time) {
          best = rt; bestPolicy = (rt.policyUsed || []).slice();
          prefix = pfx2; bestTheta = thetaList[ti]; sacPolicy = sp;
        }
      }
      // 若换到更好的阈值，用当前最优策略在该阈值下重跑一遍
      if (bestTheta !== thetaList[0]) {
        var sp2 = sacPolicyFor(bestTheta);
        var pfx3 = [];
        var r3 = simulate(start, goal, bestPolicy, {
          dt: dtSearch, candidates: candFn, prefix: pfx3,
          sacrificePolicy: sp2, maxSeconds: maxSec
        });
        if (r3.ok && r3.time <= best.time) { best = r3; prefix = pfx3; }
        sacPolicy = sp2;
      }
    }

    // ---------- 增量局部搜索：逐决策位尝试其他候选
    // stride = 每轮只扫描 1/stride 的决策位（轮换偏移），用速度换搜索覆盖面
    for (var pass = 0; pass < passLimit && !outOfTime(); pass++) {
      var improved = false;
      var nDec = best.decisions;
      var offset = pass % stride;
      for (var i = offset; i < nDec; i += stride) {
        if (outOfTime()) break;
        var cur = bestPolicy[i] !== undefined ? bestPolicy[i] : 0;
        var base = prefix[i];
        if (!base) continue;
        for (var alt = 0; alt < branchLimit; alt++) {
          if (alt === cur) continue;
          var trial = bestPolicy.slice();
          trial[i] = alt;
          var newPrefix = [];
          var r = simulate(base, goal, trial, {
            dt: dtSearch, candidates: candFn, startDecision: i,
            prefix: newPrefix, refPrefix: prefix,
            timeLimit: best.time, sacrificePolicy: sacPolicy, maxSeconds: maxSec
          });
          if (r.ok && r.time < best.time - 1e-9) {
            best = r; bestPolicy = trial;
            for (var q = 0; q < i; q++) newPrefix[q] = prefix[q];
            prefix = newPrefix;
            improved = true;
            nDec = best.decisions;
            break;
          }
        }
      }
      if (!improved && stride === 1) break;
    }

    // ---------- 少量随机重启
    for (var rs = 0; rs < restarts && !outOfTime(); rs++) {
      var pol = [];
      for (var k = 0; k < best.decisions; k++) pol.push(Math.random() < 0.5 ? 0 : 1);
      var pr = [];
      var r0 = simulate(start, goal, pol, { dt: dtSearch, candidates: candFn, prefix: pr, sacrificePolicy: sacPolicy, maxSeconds: maxSec });
      if (!r0.ok) continue;
      for (var p2 = 0; p2 < 3 && !outOfTime(); p2++) {
        var imp = false;
        for (var i2 = 0; i2 < r0.decisions && !outOfTime(); i2++) {
          var cu = pol[i2] !== undefined ? pol[i2] : 0;
          var bs = pr[i2];
          if (!bs) continue;
          for (var a2 = 0; a2 < branchLimit; a2++) {
            if (a2 === cu) continue;
            var tr = pol.slice(); tr[i2] = a2;
            var np = [];
            var rr = simulate(bs, goal, tr, {
              dt: dtSearch, candidates: candFn, startDecision: i2,
              prefix: np, timeLimit: r0.time, sacrificePolicy: sacPolicy, maxSeconds: maxSec
            });
            if (rr.ok && rr.time < r0.time - 1e-9) {
              r0 = rr; pol = tr;
              for (var q2 = 0; q2 < i2; q2++) np[q2] = pr[q2];
              pr = np; imp = true; break;
            }
          }
        }
        if (!imp) break;
      }
      if (r0.ok && r0.time < best.time) { best = r0; bestPolicy = pol; }
    }

    // ---------- 用游戏原生 tick 口径复算最终结果（粗筛模式跳过，省一半时间）
    var finalRun = effort < 0 ? best
      : simulate(start, goal, bestPolicy, { dt: dtFine, candidates: candFn, sacrificePolicy: sacPolicy, maxSeconds: maxSec });
    if (!finalRun.ok) finalRun = best;

    return {
      ok: true, galaxies: galaxies, boosts: boosts, kind: kind, goal: goal,
      time: finalRun.time, searchTime: best.time, elapsedMs: Date.now() - t0,
      actions: finalRun.actions, decisions: finalRun.decisions, policy: bestPolicy
    };
  }

  // ==================================================== C. 全局阶段图 DP
  var RUN_CACHE = {};   // key: 参数签名 -> 计算结果（重复调用秒回）

  /**
   * 求"首次无限"的最优全局排程。
   *   节点 = (星系 g, 提升 b)，边权 = 该阶段的最优耗时
   *   边   = 继续提升 / 买星系（g+1, b 归零）/ 直接冲无限（AM 达 1.797e308）
   * 阶段耗时只与 (g,b) 和目标有关，所以这是严格的 DAG 最短路。
   */
  function solveRun(opts) {
    opts = opts || {};
    var MAX_G = opts.maxGalaxies === undefined ? 3 : opts.maxGalaxies;
    var MAX_B = opts.maxBoosts === undefined ? 16 : opts.maxBoosts;
    var effort = opts.effort === undefined ? 0 : opts.effort;
    var progress = opts.onProgress || null;
    var budgetMs = opts.timeBudgetMs === undefined ? 240000 : opts.timeBudgetMs;
    var t0 = Date.now();

    var cacheKey = [opts.platform || 'pc', MAX_G, MAX_B, effort, opts.sacrifice ? 1 : 0].join('|');
    if (RUN_CACHE[cacheKey] && !opts.force) return RUN_CACHE[cacheKey];

    var stageResult = {};
    var calls = 0;
    function T(g, b, kind) {
      var key = g + ':' + b + ':' + kind;
      if (stageResult[key]) return stageResult[key];
      if (progress) progress(++calls, g, b, kind);
      var r = solveStage(g, b, kind, {
        platform: opts.platform, dtSearch: opts.dtSearch, effort: effort,
        branchLimit: opts.branchLimit, branch: opts.branch,
        sacrificePolicy: opts.sacrificePolicy,
        maxSeconds: opts.maxSeconds,
        timeBudgetMs: opts.stageBudgetMs === undefined ? [700, 900, 3500, 20000][effort + 1] : opts.stageBudgetMs
      });
      stageResult[key] = r;
      return r;
    }

    var dist = {}, prev = {};
    dist['0:0'] = 0;
    var finalBest = { time: Infinity, at: null };

    for (var g = 0; g <= MAX_G; g++) {
      for (var b = 0; b <= MAX_B; b++) {
        var k = g + ':' + b;
        if (dist[k] === undefined) continue;
        var base = dist[k];
        if (base >= finalBest.time) continue;                 // 分支限界
        if (Date.now() - t0 > budgetMs) break;

        if (b < MAX_B) {
          var rd = T(g, b, 'dimboost');
          if (rd.ok) {
            var nk = g + ':' + (b + 1);
            if (dist[nk] === undefined || base + rd.time < dist[nk]) {
              dist[nk] = base + rd.time;
              prev[nk] = { from: k, kind: 'dimboost' };
            }
          }
        }
        if (g < MAX_G && b >= 4) {
          var rg = T(g, b, 'galaxy');
          if (rg.ok) {
            var nk2 = (g + 1) + ':0';
            if (dist[nk2] === undefined || base + rg.time < dist[nk2]) {
              dist[nk2] = base + rg.time;
              prev[nk2] = { from: k, kind: 'galaxy' };
            }
          }
        }
        // 冲无限：至少要有 1 个星系才可能把产量堆到 1.797e308
        if (b >= 4 && g >= 1) {
          var ri = T(g, b, 'infinity');
          if (ri.ok && base + ri.time < finalBest.time) {
            finalBest = { time: base + ri.time, at: k };
          }
        }
      }
    }

    var path = [];
    if (finalBest.at) {
      var cur = finalBest.at;
      while (cur && prev[cur]) {
        var p = prev[cur];
        path.push({ from: p.from, to: cur, kind: p.kind, stage: stageResult[p.from + ':' + p.kind] });
        cur = p.from;
      }
      path.reverse();
      path.push({ from: finalBest.at, to: 'INFINITY', kind: 'infinity',
        stage: stageResult[finalBest.at + ':infinity'] });
    }

    var result = {
      ok: finalBest.time < Infinity, effort: effort,
      totalTime: finalBest.time, path: path, dist: dist,
      stageResult: stageResult, stagesSolved: calls, elapsedMs: Date.now() - t0
    };
    RUN_CACHE[cacheKey] = result;
    return result;
  }

  /** 对给定排程路径上的阶段做更高强度的重算（迭代精化） */
  function refinePath(run, effort, opts) {
    opts = opts || {};
    if (!run || !run.path) return run;
    for (var i = 0; i < run.path.length; i++) {
      var st = run.path[i].stage;
      if (!st) continue;
      var key = st.galaxies + ':' + st.boosts + ':' + st.kind;
      run.stageResult[key] = solveStage(st.galaxies, st.boosts, st.kind, {
        platform: opts.platform, effort: effort,
        sacrificePolicy: opts.sacrificePolicy,
        timeBudgetMs: opts.stageBudgetMs
      });
    }
    return run;
  }

  /** 列出 DP 需要的所有阶段（拓扑序），供异步求解器逐个处理 */
  function listStages(MAX_G, MAX_B) {
    var out = [];
    for (var g = 0; g <= MAX_G; g++) {
      for (var b = 0; b <= MAX_B; b++) {
        out.push({ g: g, b: b, kind: 'dimboost' });
        if (g < MAX_G && b >= 4) out.push({ g: g, b: b, kind: 'galaxy' });
        if (g >= 1 && b >= 4) out.push({ g: g, b: b, kind: 'infinity' });
      }
    }
    return out;
  }

  /**
   * 异步版 solveRun：逐个阶段求解并在批次之间让出主线程，
   * 保证浏览器界面不卡死、进度条能刷新。
   */
  function solveRunAsync(opts, onProgress) {
    opts = opts || {};
    var MAX_G = opts.maxGalaxies === undefined ? 3 : opts.maxGalaxies;
    var MAX_B = opts.maxBoosts === undefined ? 14 : opts.maxBoosts;
    var effort = opts.effort === undefined ? 0 : opts.effort;
    var cacheKey = [opts.platform || 'pc', MAX_G, MAX_B, effort].join('|');
    if (RUN_CACHE[cacheKey] && !opts.force) {
      return Promise.resolve(RUN_CACHE[cacheKey]);
    }
    var stages = listStages(MAX_G, MAX_B);
    var stageResult = {};
    var i = 0, t0 = Date.now();

    function frame() { return new Promise(function (r) { setTimeout(r, 0); }); }

    function stepBatch() {
      var batchStart = Date.now();
      // 每个批次最多跑 250ms，然后让出
      while (i < stages.length && Date.now() - batchStart < 250) {
        var st = stages[i++];
        stageResult[st.g + ':' + st.b + ':' + st.kind] = solveStage(st.g, st.b, st.kind, {
          platform: opts.platform, effort: effort, branchLimit: opts.branchLimit,
          branch: opts.branch, sacrificePolicy: opts.sacrificePolicy,
          maxSeconds: opts.maxSeconds, timeBudgetMs: opts.stageBudgetMs
        });
      }
      if (onProgress) onProgress(i, stages.length, stages[Math.min(i, stages.length - 1)]);
      if (i < stages.length) return frame().then(stepBatch);

      // ---- 阶段全部算完，跑同步 DP
      var dist = {}, prev = {};
      dist['0:0'] = 0;
      var finalBest = { time: Infinity, at: null };
      for (var g = 0; g <= MAX_G; g++) {
        for (var b = 0; b <= MAX_B; b++) {
          var k = g + ':' + b;
          if (dist[k] === undefined) continue;
          var base = dist[k];
          if (base >= finalBest.time) continue;
          var rd = stageResult[g + ':' + b + ':dimboost'];
          if (b < MAX_B && rd && rd.ok) {
            var nk = g + ':' + (b + 1);
            if (dist[nk] === undefined || base + rd.time < dist[nk]) {
              dist[nk] = base + rd.time; prev[nk] = { from: k, kind: 'dimboost' };
            }
          }
          if (g < MAX_G && b >= 4) {
            var rg = stageResult[g + ':' + b + ':galaxy'];
            if (rg && rg.ok) {
              var nk2 = (g + 1) + ':0';
              if (dist[nk2] === undefined || base + rg.time < dist[nk2]) {
                dist[nk2] = base + rg.time; prev[nk2] = { from: k, kind: 'galaxy' };
              }
            }
          }
          if (g >= 1 && b >= 4) {
            var ri = stageResult[g + ':' + b + ':infinity'];
            if (ri && ri.ok && base + ri.time < finalBest.time) {
              finalBest = { time: base + ri.time, at: k };
            }
          }
        }
      }
      var path = [];
      if (finalBest.at) {
        var cur = finalBest.at;
        while (cur && prev[cur]) {
          var p = prev[cur];
          path.push({ from: p.from, to: cur, kind: p.kind, stage: stageResult[p.from + ':' + p.kind] });
          cur = p.from;
        }
        path.reverse();
        path.push({ from: finalBest.at, to: 'INFINITY', kind: 'infinity',
          stage: stageResult[finalBest.at + ':infinity'] });
      }
      var result = {
        ok: finalBest.time < Infinity, effort: effort, totalTime: finalBest.time,
        path: path, dist: dist, stageResult: stageResult,
        stagesSolved: stages.length, elapsedMs: Date.now() - t0
      };
      RUN_CACHE[cacheKey] = result;
      return result;
    }
    return frame().then(stepBatch);
  }

  /** 固定策略仿真（用于与参考优化器存档对拍） */
  function simulateFixedStrategy(galaxies, boosts, kind, strategyName, opts) {
    opts = opts || {};
    var dt = opts.platform === 'mobile' ? 0.025 : 0.033;
    var start = stageStartState(galaxies, boosts, opts.platform || 'pc');
    var goal = stageGoal(galaxies, boosts, kind);
    var pick = ST.FIXED[strategyName];
    var candFn = function (s, M, tgt) { return [pick(ST.filterFixed(s, M, tgt))]; };
    return simulate(start, goal, [], { dt: dt, candidates: candFn, maxSeconds: opts.maxSeconds || MAX_STAGE_SECONDS });
  }

  global.Solver = {
    stageGoal: stageGoal, goalMet: goalMet, stageStartState: stageStartState,
    simulate: simulate, solveStage: solveStage, solveRun: solveRun,
    solveRunAsync: solveRunAsync, refinePath: refinePath, listStages: listStages,
    simulateFixedStrategy: simulateFixedStrategy, RUN_CACHE: RUN_CACHE
  };
})(typeof window !== 'undefined' ? window : globalThis);
