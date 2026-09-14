/* ============================================================================
 * 逐 tick 仿真结果 (simresults.js) —— 全部来自 stagesim.js 的实跑输出
 * 生成方式：node tools/fit_report.js  →  tools/fit_report.txt
 *           node tools/sim_milestones.js（本次为内联脚本）→ tools/sim_milestones.txt
 * ============================================================================ */
(function (global) {
  'use strict';

  // ---- A. 已逐项验证正确的部分 ----
  var VERIFIED = [
    { name: '对数大数运算', detail: 'log10(1e3+1e4) / log10(9000) / (1e30000)^7 等', ok: true,
      note: '精确到 1e-9，支持 1e30000 级数值（打破无限后必需）' },
    { name: 'IP 收益公式', detail: 'maxAM=1.7977e308, IPmult=1', ok: true,
      note: 'floor(1.7817) = 1 —— 与游戏内「第一次无限得 1 IP」完全一致' },
    { name: '维度级联动力学', detail: 'dim4 → dim3 → dim2 → dim1', ok: true,
      note: '产量按 t³~t⁴ 放大：实测 t=1440s 时 dim1=2.92e7、产量 5.03e9/s，与游戏行为一致' },
    { name: 'tick 积分 / 购买 / 重置', detail: 'step() + policy() + doCrunch/doBoost/doGalaxy', ok: true,
      note: '终点状态 bought=[40,30,20,20]、ticks=10、boosts=0，与参考站存档逐项一致' },
    { name: '里程碑判定', detail: '官方 speedrun-milestones.js 的 7 个条件', ok: true,
      note: '条件表达式按源码移植' }
  ];

  // ---- B. 拟合对拍（参考优化器公开存档 pc_galaxy0_dimboost0） ----
  var FIT = {
    target: '第 1 次维度提升（20 个第 4 维度）',
    reference: '参考优化器 Optimized 策略：1129.56 s = 18.83 min',
    rows: [
      { event: 'dim1 x10', ref: 25.18, sim: 7.60 },
      { event: 'dim2 x10', ref: 56.40, sim: 20.16 },
      { event: 'ts1（第 1 次计数频率）', ref: 68.08, sim: 28.90 },
      { event: 'dim3 x10', ref: 197.21, sim: 199.16 },
      { event: 'dim4 x10', ref: 367.82, sim: 515.92 },
      { event: 'ts10', ref: 925.49, sim: 1549.14 },
      { event: '完成（买到 20 个 dim4）', ref: 1129.56, sim: 1929.78 }
    ],
    completionRatio: 1.71,
    verdict: '失败但可解释',
    reason: '早段比参考快 3 倍（我给的成就倍率偏高），中段开始落后，完成时间晚 1.71 倍'
  };

  // ---- C. 完整流程仿真的进展与卡点（诚实记录） ----
  var FULLRUN = {
    reachedGameTime: '4.043 h',
    infinities: 721, boosts: 8, galaxies: 2, ip: 934, id1: 0, infPower: 0,
    reachedMilestones: ['首次无限'],
    blockedAt: '打破无限（需要 3e4 IP，仿真只到 934）',
    rootCauses: [
      '每次无限耗时约 20 s，参考站压到 1.5 s —— 差 13 倍。原因是缺了若干无限升级的联动，且购买策略未收敛',
      'IP 翻倍升级的成本公式我一开始写成 10^(n+3)，应为 10^(n+1)（攻略实测 10/100/1e3/1e4 IP）—— 已修',
      'IU11 / IU31 用的是「总游玩时间」，我误用了会随无限归零的本轮时间 —— 已修'
    ]
  };

  // ---- D. 过程中修掉的真实 bug（都有实跑证据） ----
  var BUGS = [
    { bug: '浮点边界比较', detail: 'dim 数量恰好等于需求时，log 空间累积值比 lg(need) 低 1 ulp，「<」判定永远为假，维度提升被永久卡死', fix: '改为 lg(need) - 1e-9 的容差比较' },
    { bug: '购买顺序贪心', detail: '从低维往高维买，dim1（单价 1e4）会把 AM 抢光，导致同价的 dim3 永远买不到', fix: '移植参考优化器已验证的候选规则（整组成本分档 + 同价取高维）' },
    { bug: '提升后 AM 归零', detail: '维度提升后把 AM 设成 0，而游戏里 reset 到初始值 10 AM；导致提升后什么都买不起，仿真冻结 2.5 小时', fix: '改为 s.am = 1（log10 10）' },
    { bug: 'IP 翻倍成本', detail: '写成 10^(n+3)，比实际贵 100 倍', fix: '改为 10^(n+1)' },
    { bug: '时间倍率取错变量', detail: 'IU11/IU31 用本轮无限时间（每轮归零）而非总游玩时间', fix: '新增 tTotal 累计量' }
  ];

  global.SIMRESULTS = {
    VERIFIED: VERIFIED, FIT: FIT, FULLRUN: FULLRUN, BUGS: BUGS
  };
})(typeof window !== 'undefined' ? window : globalThis);
