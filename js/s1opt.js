/* ============================================================================
 * S1 压缩优化结果（s1opt.js）—— 1 IP → 可打破无限
 * ----------------------------------------------------------------------------
 * 本轮三个新事实（全部源码级）：
 *   1. 打破无限的解锁条件 = 大坍缩自动购买器间隔升满
 *      BreakInfinityButton.vue: this.isUnlocked = Autobuyer.bigCrunch.hasMaxedInterval
 *      BigCrunchAutobuyer.canBeUpgraded = NormalChallenge(12).isCompleted（C12 奖励）
 *   2. 间隔升级：cost 从 1 起每次 ×2；interval 每次 ×0.6（下限 100）
 *      150000 → 100 共 15 次 = 1+2+4+…+16384 = 32767 IP
 *      ⇒ 攻略「3e4 IP 进入 C12」正是这个数
 *   3. 未打破无限时 IP = floor(308/div × totalIPMult)，div=308（ach103/TS111 都拿不到）
 *      ⇒ 固定 1×IPmult。IP 翻倍需 Achievement(41) = 买满 16 个无限升级（473 IP）
 *   4. 进入 IC 会把 player.break 置 true —— 但 IC1 需 1e2000 AM > 破无限前上限 1.7977e308
 *      ⇒ 这条捷径被 AM 上限锁死，不可用（已排除）
 * ============================================================================ */
(function (global) {
  'use strict';

  // 最优采购顺序（搜索结果；"买得起就买"的优先级表，前置自动满足）
  var BEST_ORDER = [
    ['IU22', 1,  '2/7 维 ×无限次数'],
    ['IU32', 1,  '4/5 维 ×无限次数'],
    ['IU12', 1,  '买十倍率 2 → 2.2'],
    ['IU11', 1,  '总游玩时间倍率'],
    ['IU21', 1,  '1/8 维 ×无限次数'],
    ['IU31', 1,  '3/6 维 ×无限次数'],
    ['IU41', 1,  '维度提升需求 −9'],
    ['IU42', 2,  '星系强度 ×2'],
    ['IU13', 3,  '本次无限时间倍率'],
    ['IU23', 5,  '未花费 IP → 第 1 维'],
    ['IU33', 7,  '维度提升倍率 2 → 2.5'],
    ['IU14', 20, 'skipReset1'],
    ['IU24', 40, 'skipReset2'],
    ['IU34', 80, 'skipReset3'],
    ['IU43', 10, '被动 IP'],
    ['IU44', 300,'skipResetGalaxy']
  ];
  var GUIDE_ORDER = ['IU11','IU12','IU21','IU22','IU31','IU32','IU41','IU42','IU13','IU23','IU33','IU14','IU24','IU34','IU43','IU44'];

  // 单次无限耗时（dt 统一后逐前缀实测）
  var PREFIX = [
    { n: 0,  pc: 4.983 * 3600, and: 2.533 * 3600, added: '（开局，无升级）' },
    { n: 1,  pc: 42.81 * 60,   and: 23.38 * 60,   added: 'IU32（4/5 维）' },
    { n: 2,  pc: 13.60 * 60,   and: 7.11 * 60,    added: 'IU12（买十倍率）' },
    { n: 3,  pc: 9.26 * 60,    and: 5.19 * 60,    added: 'IU11（时间倍率）' },
    { n: 4,  pc: 7.73 * 60,    and: 4.41 * 60,    added: 'IU21（1/8 维）' },
    { n: 5,  pc: 6.79 * 60,    and: 3.82 * 60,    added: 'IU22（2/7 维）' },
    { n: 6,  pc: 1.34 * 60,    and: 51.3,         added: 'IU31（3/6 维）' },
    { n: 7,  pc: 1.16 * 60,    and: 45.1,         added: 'IU41（提升需求−9）' },
    { n: 8,  pc: 53.5,         and: 35.3,         added: 'IU42（星系×2）' },
    { n: 9,  pc: 51.6,         and: 34.2,         added: 'IU13（本次无限时间）' },
    { n: 10, pc: 41.9,         and: 28.7,         added: 'IU23（未花费 IP）' },
    { n: 11, pc: 34.8,         and: 24.2,         added: 'IU33（提升倍率 2.5）' },
    { n: 12, pc: 33.2,         and: 23.2,         added: 'IU14（skipReset1）' },
    { n: 13, pc: 31.3,         and: 22.0,         added: 'IU24（skipReset2）' },
    { n: 14, pc: 28.9,         and: 20.6,         added: 'IU34（skipReset3）' },
    { n: 15, pc: 28.7,         and: 20.4,         added: 'IU43（被动 IP）' },
    { n: 16, pc: 19.1,         and: 14.0,         added: 'IU44（skipResetGalaxy）★ 满配' }
  ];

  // 边际提速（由前缀实测在 log10 空间拟合）
  var MARGINAL = [
    ['IU21', 1, 9.59, 9.73, '1/8 维 —— 1 IP 换近 10 倍提速，整段最划算的一步'],
    ['IU32', 1, 7.02, 6.79, '4/5 维 —— 同样是 1 IP'],
    ['IU12', 1, 3.05, 3.10, '买十倍率 2 → 2.2'],
    ['IU11', 1, 1.47, 1.37, '总游玩时间倍率'],
    ['IU31', 1, 5.06, 4.46, '3/6 维'],
    ['IU22', 1, 1.96, 1.86, '2/7 维'],
    ['IU41', 1, 1.16, 1.14, '提升需求 −9'],
    ['IU42', 2, 1.31, 1.28, '星系强度 ×2'],
    ['IU23', 5, 1.23, 1.19, '未花费 IP → 第 1 维'],
    ['IU33', 7, 1.20, 1.19, '提升倍率 2.5'],
    ['IU13', 3, 1.04, 1.04, '本次无限时间倍率'],
    ['IU14', 20, 1.05, 1.04, 'skipReset1 —— 20 IP 只换 5% 提速（性价比最低的一档）'],
    ['IU24', 40, 1.06, 1.06, 'skipReset2'],
    ['IU34', 80, 1.08, 1.07, 'skipReset3'],
    ['IU43', 10, 1.01, 1.01, '被动 IP —— 对单次耗时几乎无影响，只影响挂机收益'],
    ['IU44', 300, 1.50, 1.46, 'skipResetGalaxy —— 300 IP 换 1.5 倍（贵但唯一）']
  ];

  // 挑战当 IP 来源（16 IU 满配状态实测）
  var CHAL = [
    { c: 1,  pc: 21.8, and: 15.7, ratio: 1.14 },
    { c: 3,  pc: 24.6, and: 17.6, ratio: 1.29 },
    { c: 4,  pc: 55.0, and: 38.8, ratio: 2.87 },
    { c: 5,  pc: 29.4, and: 20.8, ratio: 1.54 },
    { c: 7,  pc: 25.8, and: 18.3, ratio: 1.35 },
    { c: 6,  pc: 105.6, and: 79.2, ratio: 5.52 },
    { c: 11, pc: 21.8, and: 15.7, ratio: 1.14 },
    { c: 12, pc: 65.4, and: 39.2, ratio: 3.40 }
  ];

  // 结果对照
  var RESULT = [
    { name: '攻略顺序（IU11 起手）', pc: 29.490 * 3600, and: 20.217 * 3600 },
    { name: '搜索最优（IU22 起手）', pc: 26.593 * 3600, and: 18.499 * 3600, best: true },
    { name: '把挑战穿插进去（最优顺序）', pc: 26.647 * 3600, and: 18.536 * 3600 }
  ];

  // 时间结构（Web/Steam 档）
  var BREAKDOWN = [
    ['① 每步买 1 IP 的小件（IU22/32/12/11/21/31/41/42/13/23/33/43）', '约 4.4 小时 / 33 次无限', '这一步的头 5 次无限就占 4.4 小时里的大头'],
    ['② 攒 473 IP 买齐 16 个 IU（含 4 个 skipReset）', '到 t≈8.0 小时 / 473 次无限', '从 1 IP/次 一步步挪到 16 个全齐'],
    ['③ 解锁 IP 翻倍并推到 ×16', '到 t≈16.3 小时 / 2033 次无限', '10 IP→×2、100→×4、1e3→×8、1e4→×16'],
    ['④ 刷到 32767 IP（＝解锁打破无限）', '到 t≈26.6 小时 / 4081 次无限', '末段每次 19.1 秒（Web）/ 14.0 秒（安卓）× 16 IP']
  ];

  var EXCLUDED = [
    ['进入 IC 强制解锁打破无限', 'excluded',
      '源码 infinity-challenges.js 的 start() 里确实写 `player.break = true` —— 但 IC1 的 unlockAM = 1e2000，' +
      '而破无限前 AM 上限是 1.7977e308 ⇒ 循环死锁，<b>用不了</b>'],
    ['跳过 16 个 IU 直接开 IP 翻倍', 'excluded', 'Achievement(41) 要求买满 16 个无限升级 ⇒ 必须先把 473 IP 花完'],
    ['用挑战当 IP 来源替代普通无限', 'no-gain',
      '挑战耗时是普通无限的 1.14~5.5 倍，回报同样是 1 IP ⇒ 模型给出"更慢"（26.647h vs 26.593h）。' +
      '注意：本模型<b>未计入</b>挑战带来的整行成就加成（×1.25/行），所以这条结论有待单独验证'],
    ['提前买 IU14/24/34（攻略把它们排在前面）', 'reordered',
      '它们的边际提速只有 1.05~1.08 倍，却要 20/40/80 IP ⇒ <b>在 1 IP/次 的阶段，多跑 20~80 次才买它们，' +
      '换来的 5~8% 提速收不回来</b>。所以最优顺序把它们推到了第 12~14 位']
  ];


  // ── 本轮新增的两个杠杆（第三轮压缩）─────────────────────────────────────
  //  杠杆 A：高配状态下"少买维度提升" —— 提升会清空维度链，而 skipReset 已给了 4 次保底
  //  杠杆 B：更新率（dt）—— "按住 Max" 是按帧触发的，帧率越高级联越快
  var LEVER_BOOSTCAP = [
    ['0~5 个 IU', '不要停（boost∞）', '此时提升是唯一的倍率来源，停提升反而慢 1.5~2 倍'],
    ['6 个 IU', '<b>停在第 7 次</b>', '细扫：4→49.6s / 5→41.1s / 6→38.7s / <b>7→37.8s</b> / 8→40.2s'],
    ['8~14 个 IU', '<b>停在第 5 次</b>', '8 个时 25.0s、14 个时 11.4s（第 5 次都是最优）'],
    ['16 个 IU 满配', '<b>停在第 4 次</b>：18.5s → <b>4.4s（×4.2）</b>', '满配下 4 次提升就够开星系，再买纯属自断维度链']
  ];
  var BOOSTCAP_SWEEP = [
    { n: 6,  best: 7, times: '4→49.6 / 5→41.1 / 6→38.7 / 7→37.8 / 8→40.2' },
    { n: 8,  best: 5, times: '4→28.1 / 5→25.0 / 6→25.7 / 7→27.3' },
    { n: 10, best: 5, times: '4→17.7 / 5→16.8 / 6→17.8 / 7→19.5' },
    { n: 12, best: 5, times: '4→14.9 / 5→14.1 / 6→14.8 / 7→16.3' },
    { n: 14, best: 5, times: '4→12.2 / 5→11.4 / 6→12.1 / 7→13.6' },
    { n: 16, best: 4, times: '4→4.4 / 5→5.0 / 6→5.9 / 不限→18.5' }
  ];

  var LEVER_DT = [
    [0.033, 18.5, 13.5, '游戏默认 33ms（30fps）'],
    [0.02,  11.8, 8.6,  '50fps'],
    [0.011, 7.0,  5.2,  '90fps（高刷新屏）']
  ];

  // dt 的加速比只作用在短跑上；长跑几乎不受影响（逐前缀实测）
  var DT_FACTOR = [
    { n: 0,  factor: 1.03 }, { n: 2,  factor: 1.09 }, { n: 4,  factor: 1.24 },
    { n: 6,  factor: 1.49 }, { n: 8,  factor: 1.63 }, { n: 10, factor: 1.94 },
    { n: 12, factor: 2.07 }, { n: 14, factor: 2.08 }, { n: 16, factor: 2.43 }
  ];

  // ── 最终结果（三轮杠杆叠加）────────────────────────────────────────────
  var FINAL = [
    { name: '① 攻略原样（顺序 + 满提升 + 默认帧率）', pc: 17.21 * 3600, and: 10.12 * 3600 },
    { name: '② ＋逐阶段停提升', pc: 8.08 * 3600, and: 6.14 * 3600 },
    { name: '③ ＋最优采购顺序', pc: 6.79 * 3600, and: 4.74 * 3600 },
    { name: '④ ＋高刷新率(90fps)', pc: 3.26 * 3600, and: 2.18 * 3600, best: true }
  ];
  var FINAL_RUNS = 4081;   // 恒定：瓶颈是 32767 IP
  var FINAL_NOTE = '跑数恒为 4081（88.4% 发生在 16 个 IU 齐了之后）—— 因为瓶颈是 32767 IP 这个固定成本，与策略无关。';

  // 前缀表 v2（boostCap 取优后）
  var PREFIX2 = [
    { n: 0,  pc: 4.983 * 3600, and: 2.468 * 3600, added: '（开局，无升级）' },
    { n: 1,  pc: 7.21 * 60,    and: 3.89 * 60,    added: 'IU22（2/7 维）' },
    { n: 2,  pc: 7.21 * 60,    and: 3.89 * 60,    added: 'IU32（4/5 维）' },
    { n: 3,  pc: 3.31 * 60,    and: 1.76 * 60,    added: 'IU12（买十倍率）' },
    { n: 4,  pc: 3.29 * 60,    and: 1.76 * 60,    added: 'IU11（时间倍率）' },
    { n: 5,  pc: 3.29 * 60,    and: 1.76 * 60,    added: 'IU21（1/8 维）' },
    { n: 6,  pc: 38.7,         and: 24.0,         added: 'IU31（3/6 维）★ 从这里开始停提升' },
    { n: 7,  pc: 36.9,         and: 22.9,         added: 'IU41（提升需求−9）' },
    { n: 8,  pc: 25.7,         and: 16.5,         added: 'IU42（星系×2）' },
    { n: 9,  pc: 25.7,         and: 16.5,         added: 'IU13（本次无限时间）' },
    { n: 10, pc: 17.8,         and: 11.9,         added: 'IU23（未花费 IP）' },
    { n: 11, pc: 15.6,         and: 10.6,         added: 'IU33（提升倍率 2.5）' },
    { n: 12, pc: 14.8,         and: 10.1,         added: 'IU14（skipReset1）' },
    { n: 13, pc: 13.6,         and: 9.3,          added: 'IU24（skipReset2）' },
    { n: 14, pc: 12.1,         and: 8.3,          added: 'IU34（skipReset3）' },
    { n: 15, pc: 12.1,         and: 8.3,          added: 'IU43（被动 IP）' },
    { n: 16, pc: 5.9,          and: 4.2,          added: 'IU44（skipResetGalaxy）★ 满配' }
  ];

  // 成就行数 → 单次跑耗时（16 IU 满配）：影响很小
  var ACH_ROWS = [
    { rows: 2, n: 22, pc: 24.7, and: 17.6 },
    { rows: 3, n: 30, pc: 23.0, and: 16.4 },
    { rows: 4, n: 40, pc: 21.1, and: 15.2 },
    { rows: 5, n: 51, pc: 19.1, and: 14.0 },
    { rows: 6, n: 58, pc: 18.5, and: 13.5 }
  ];


  // ── v7：全流程极限时间（1 IP → C9）────────────────────────────────────
  //    尾段 = 破无限后刷到 1e8 IP（IPMult ×16 后 ~3.5 min）→ 买 ID1 → 进 C9（5.7 min）
  var FULL_CHAIN = [
    { phase: '刷到 32767 IP（4081 次无限）', pcStd: 4.44 * 3600, andStd: 2.79 * 3600,
      pcHi: 2.97 * 3600, andHi: 1.79 * 3600,
      note: '大头：88% 的跑发生在 16 个 IU 齐了之后' },
    { phase: '刷到 1e8 IP → 买 ID1', pcStd: 0.06 * 3600, andStd: 0.06 * 3600,
      pcHi: 0.06 * 3600, andHi: 0.06 * 3600,
      note: 'IPMult ×16 后每次无限 ~17 IP → 不到 4 分钟' },
    { phase: '进 C9（ID1 已购）', pcStd: 5.7 * 60, andStd: 5.7 * 60,
      pcHi: 5.7 * 60, andHi: 5.7 * 60,
      note: 'C9 本体，逐 tick 仿真 5.7 min（攻略实测 ~10 min）' }
  ];
  var FULL_TOTAL = {
    pcStd: 4.56 * 3600, pcHi: 3.13 * 3600,
    andStd: 2.92 * 3600, andHi: 1.95 * 3600
  };

  // 极限时间表（安卓 90fps 档）
  var FULL_STEPS = [
    { act: '开局（第一次无限→IU22）', dt: 2.47 * 3600, cum: 2.47 * 3600 },
    { act: 'IU32 / IU12 / IU11 / IU21（1 IP 各）', dt: 7.8 * 60, cum: 2.60 * 3600 },
    { act: 'IU31 / IU41 / IU42 / IU13 / IU23 / IU33 / IU43（小件）', dt: 13.9 * 60, cum: 2.83 * 3600 },
    { act: 'IU14（20 IP）', dt: 1.41 * 60, cum: 2.87 * 3600 },
    { act: 'IU24（40 IP）', dt: 2.56 * 60, cum: 2.91 * 3600 },
    { act: 'IU34（80 IP）', dt: 4.48 * 60, cum: 2.99 * 3600 },
    { act: 'IU44（300 IP）——16 个齐', dt: 15.84 * 60, cum: 3.25 * 3600 },
    { act: 'IP×2 → ×4 → ×8 → ×16', dt: 30.6 * 60, cum: 3.76 * 3600 },
    { act: '刷到 32767 IP（间隔梯子满）', dt: 3.03 * 3600, cum: 6.79 * 3600 },
    { act: '刷到 1e8 IP → 买 ID1', dt: 0.06 * 3600, cum: 6.85 * 3600 },
    { act: '进 C9', dt: 5.7 * 60, cum: 6.95 * 3600 }
  ];

  global.S1OPT = { BEST_ORDER: BEST_ORDER, GUIDE_ORDER: GUIDE_ORDER, PREFIX: PREFIX,
    MARGINAL: MARGINAL, CHAL: CHAL, RESULT: RESULT, BREAKDOWN: BREAKDOWN, EXCLUDED: EXCLUDED,
    BC_LADDER: 32767, LEVER_BOOSTCAP: LEVER_BOOSTCAP, BOOSTCAP_SWEEP: BOOSTCAP_SWEEP, LEVER_DT: LEVER_DT,
    DT_FACTOR: DT_FACTOR, FINAL: FINAL, FINAL_RUNS: FINAL_RUNS, FINAL_NOTE: FINAL_NOTE,
    PREFIX2: PREFIX2, ACH_ROWS: ACH_ROWS, FULL_CHAIN: FULL_CHAIN, FULL_TOTAL: FULL_TOTAL, FULL_STEPS: FULL_STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
