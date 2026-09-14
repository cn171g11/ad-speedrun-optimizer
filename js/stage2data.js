/* ============================================================================
 * AD 速通优化器 · 第二阶段 (无限 → 永恒)
 * 里程碑分段数据 + 定量模型
 * ----------------------------------------------------------------------------
 * 里程碑来源：
 *   1) 游戏内置速通里程碑 src/core/secret-formula/speedrun-milestones.js
 *      （共 25 个，本次覆盖 id 4~10）
 *   2) speedrun.com 的官方 level 列表（Dimension Boost → … → EC1）
 *   3) 《反物质维度安卓通关攻略》第二章~第五章的实测流程与时间点
 * 公式来源：IvarK/AntimatterDimensionsSourceCode
 * ============================================================================ */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- 常量
  var IP_AM_DIV = 308;          // IP = floor(IPmult * 10^(log10(maxAM)/308 - 0.75))
  var IP_OFFSET = 0.75;
  var INFINITY_AM = 1.7976931348623157e308;
  // 首次永恒门槛：攻略写作 1.8e308 IP，但 1.8e308 > double 上限 1.7976931348623157e308，
  // 在 JS 里会直接溢出成 Infinity。游戏内部用的是 Decimal，实际门槛就是 double 上限附近，
  // 因此这里取 Number.MAX_VALUE 作为可比较的等价门槛。
  var ETERNITY_IP = 1.7976931348623157e308;
  var RG_RT = INFINITY_AM;      // 每个复制器星系需要 复制器 >= 1.797e308
  var REP_BASE_INTERVAL = 1000; // ms
  var REP_INTERVAL_MULT = 0.9;  // 每次升级
  var REP_INTERVAL_CAP = 50;    // ms（TS22 之前的下限）
  var REP_CHANCE_STEP = 0.01;   // 每次 +1%
  var REP_CHANCE_CAP = 1;
  var REP_CHANCE_COST0 = 1e150; // IP
  var REP_CHANCE_COST_MULT = 1e15;
  var REP_INTERVAL_COST0 = 1e140;
  var REP_INTERVAL_COST_MULT = 1e10;
  var BEYOND_IP = 1.7976931348623157e308;

  // -------------------------------------------------- 里程碑分段定义
  // timeSource: formula=公式计算  guide=攻略实测  derived=由速率×区间推算
  var MILESTONES = [
    {
      id: 'M0', short: '起点', sr: 'Infinity',
      name: '首次大坍缩完成', official: 3,
      range: '—  →  1 IP',
      goal: '点「大坍缩」，拿到第 1 个 IP',
      detail: '第一阶段（10 AM → 1.797e308 AM）的终点。本页所有时间都从这里起算。',
      steps: ['点大坍缩'],
      time: 0, timeText: '0（起点）', timeSource: 'formula',
      note: '第一阶段最优用时见「速通操作表」页：PC 7:10:27 / 安卓 3:35:05'
    },
    {
      id: 'M1', short: 'IU11 + C8 农场', sr: '—',
      name: '无限升级开局（1 IP → 20 IP）', official: null,
      range: '1 IP  →  20 IP',
      goal: '买 IU11（无限升级 11），进入 C8 循环刷 IP',
      detail: '第一个 IP 必须买无限升级而不是自动购买器。开启「自动重试挑战」，不断完成 C8 —— C8 里的速度比正常无限更快。',
      steps: [
        '1 IP → 买 IU11（反物质维度按游玩时间获得加成）',
        '挑战界面打开「自动重试挑战」，进入 C8',
        '自动购买器切成「购买 10 个」（有成就 r31 后不会被卡住）',
        '买满 4 次维度提升后会买不动，此时献祭效果大幅提升，每次倍数明显增长（5~10 倍）时献祭',
        '献祭倍数到约 1e40 时停手，手动买 1 个第 1 维度完成成就 r43',
        '再攒到 1.797e308 AM 大坍缩，买 IU12',
        '依次买 IU21, 22, 31, 32, 41, 42'
      ],
      time: 600, timeText: '≈ 10 分钟', timeSource: 'guide',
      note: '攻略实测："正常运行一次达到无限（10 分钟左右，现在达到无限只需要 1 个星系 + 8 个维度提升）"'
    },
    {
      id: 'M2', short: '重刷挑战 · IU 补全', sr: '—',
      name: '挑战重刷 + 无限升级补全（20 IP → 3e4 IP）', official: null,
      range: '20 IP  →  3e4 IP',
      goal: '通关 C1~C12，把单次无限时间压到 1.5 秒以内',
      detail: '单次无限时间随升级快速下降——这是本段唯一真正重要的指标，因为它直接决定刷 IP 的速率。',
      steps: [
        '2 IP → IU13, IU23, IU33（预留至少 6 IP 完成 C11）',
        '星系自动购买器设为 1，半自动完成无限',
        '20 IP → IU14（暂不买 IU43）→ 单次无限 1 分 20 秒 → 45 秒',
        '40 IP → IU24 → 18 秒',
        '80 IP → IU34；多出 10 个时买 IU43 → 10 秒',
        '300 IP → IU44 → 6 秒',
        '按住「最大」+ 点大坍缩，单次无限压到 1.5 秒以内',
        'IP 翻倍升级：10 IP(2x) → 100(4x) → 1e3(8x) → 1e4(16x)',
        '3e4 IP → 进 C12，完成后把自动大坍缩购买器升满 → 解锁「打破无限」'
      ],
      time: 1500,
      timeText: '≈ 25 分钟（含 C1~C12 与挑战时间重刷）',
      timeSource: 'derived',
      note: '攻略给出的单次无限时间阶梯 80s→45s→18s→10s→6s→1.5s；时间由「IP 区间 ÷ 逐步提高的 IP/min」推算，攻略未直接给出本段总时长',
      ipPerMin: [1.2e4, 3e4]
    },
    {
      id: 'M3', short: '打破无限', sr: 'Break Infinity',
      name: '打破无限 · 无限维度起飞（3e4 IP → 5e11 IP）', official: 6,
      range: '3e4 IP  →  5e11 IP',
      goal: '买 BIU1~BIU12 + 无限维度 ID1~ID3，突破 1.797e308 AM 上限',
      detail: '打破无限后反物质不再封顶，IP 公式 IP = floor(IPmult × 10^(log10(maxAM)/308 − 0.75)) 开始指数增长。本段是整个第二阶段最长的一段。',
      steps: [
        '3e4 IP → 打破无限 → 自动大坍缩设 300 IP（此时 1.2e4 IP/分钟）',
        '1e4 IP → BIU1；5e4 IP → BIU2',
        '阈值 840 IP（3e4 IP/min）→ 1e5 IP → IP 翻倍 32x + 维度购买器 16x → BIU3',
        '1e6 IP → IP 翻倍 64x → BIU4 → BIU10（10x→9x）',
        '1e7 IP → IP 翻倍 128x + 全部维度购买器 512x → BIU5',
        '打开自动重试挑战，自动大坍缩 0 IP、自动星系 0、自动维度提升 4，重刷 C2~C8/C11（星系切 1 刷 C10/C12），再关星系刷 C9',
        '1e7 IP → BIU11；5e6 → BIU10；2.5e7 → BIU10 → 等约 55 分钟到 1e8 IP',
        '1e8 IP → 停止自动运行，手动买维度提升+星系+献祭，等约 10 分钟到 1e1100 AM → 解锁并购买 ID1',
        '1e8 IP → IP 翻倍；1e7 → BIU12；1.25e8 → BIU10；2e7 → BIU6',
        '1e9 IP → IP 翻倍 → 挂约 90 分钟到 5e9 IP',
        '5e9 IP → BIU7（解锁自动维度提升上限）',
        '6.25e8 → BIU10；1e10 → IP 翻倍；3.13e9 → BIU10；1.56e10 → BIU10；1e9 → BIU12(10%→15%)',
        '停止自动运行 → 挂约 82 分钟到 10 星系 + 46 维度提升 → 1e1900 AM → 解锁并买 ID2',
        '1e11 IP → 买第二个 ID1（3~4 倍加成）',
        '7.81e10 → BIU10；5e10 → BIU11；1e11 → IP 翻倍；1e10 → BIU12；5e11 → BIU8'
      ],
      time: 17400,
      timeText: '≈ 4.8 小时（主力段）',
      timeSource: 'derived',
      note: '攻略明确给出的等待：55 分钟 + 10 分钟 + 90 分钟 + 82 分钟 = 237 分钟；其余部分按攻略标注的 IP/min 速率对 IP 区间积分推算',
      ipRates: [
        { threshold: 300, rate: 1.2e4 }, { threshold: 840, rate: 3e4 },
        { threshold: 1.88e3, rate: 1.1e5 }, { threshold: 4.3e3, rate: 3.4e5 },
        { threshold: 2.4e4, rate: 1.2e6 }, { threshold: 2e5, rate: 1.5e7 },
        { threshold: 5.2e6, rate: 1.9e8 }, { threshold: 6e7, rate: 1e9 },
        { threshold: 1.1e8, rate: 3.85e9 }, { threshold: 6.6e8, rate: 6.2e9 },
        { threshold: 4.8e8, rate: 1.07e10 }
      ]
    },
    {
      id: 'M4', short: '星系 +50%', sr: '2x → 50% Galaxies',
      name: '买 5e11 IP 升级（星系 +50%）', official: 7,
      range: '5e11 IP',
      goal: '购买打破无限升级 8：所有星系强度 +50%',
      detail: '这是官方速通里程碑之一。星系变强 → 计数频率倍率更好 → 反物质产量与 IP 产量同时抬升。',
      steps: ['5e11 IP → BIU8（星系增强 50%）', '移除自动维度提升 / 自动星系的所有限制'],
      time: 0, timeText: '含在 M3 内', timeSource: 'formula',
      note: '里程碑本身不额外耗时，是 M3 的最后一个购买'
    },
    {
      id: 'M5', short: '通关全部 IC', sr: 'IC2 / IC4 Unlock / IC5',
      name: '无限挑战 IC1~IC8 通关（5e11 IP → 1e140 IP）', official: 8,
      range: '5e11 IP  →  1e140 IP',
      goal: '通关全部 8 个无限挑战，IC2 解锁自动献祭',
      detail: 'IC 是"用不同的限制条件把 AM 堆到某个目标"。每个 IC 的目标与奖励都不同，IC2 完成后解锁自动维度献祭，是全流程的关键节点。',
      steps: [
        '关掉自动大坍缩 —— 一段时间内不必再刷 IP，IP 会爆发式增长',
        '1e2400 AM → 解锁并购买 ID3',
        '1e13 IP → IC1（约 1 分钟）；难度靠 BIU11 > IP 翻倍 > ID1 > 其他无限维度 的优先级',
        '1e17 IP → 数次 2e17 IP 大坍缩到 1.25e18 IP → BIU11 + ID3 + IP 翻倍 → 17 星系',
        '1e24 IP → 关闭自动维度提升与自动星系，完成所有普通挑战（每个 < 100ms）',
        '1e42 IP → 关闭所有自动购买器、不按最大，进 C2 只买 1 次第 1 维度达成无限（成就 r71）',
        '1e46 IP / 32 星系 + 135 维度提升 → 1e10500 AM → 解锁并买 ID4',
        '1e48 IP → IC2（解锁自动维度献祭，倍数设 100）',
        '1e58 IP → IC3（等 6~7 分钟）',
        '1e67 IP → IC4（唯一需要微操的 IC：最大/最大/维度提升 与 最大/最大/7654321 循环，约 36 星系 + 124 维度提升）',
        '1e79 IP → 42 星系左右反复重置 → 1e80 IP 买 ID1 + ID4 → 1e81 IP 买 ID2 → 挂 5 分钟买 43 星系 → 1e18000 AM → IC5',
        '1e82 IP → IC5（1-7 维度自动购买设「单个」，自行完成）',
        '1e102 IP → IC6；1e116 IP → IC7（挂 5 分钟）',
        '1e128 IP → 买 1e128 IP 的 ID1 与 1e129 IP 的 ID2 → 1e28000 AM → IC8'
      ],
      time: 9000, timeText: '≈ 2.5 小时',
      timeSource: 'derived',
      note: '攻略明确标注 IC1≈1 分钟、IC3≈6~7 分钟、IC4≈2 分钟、IC7≈5 分钟，以及若干次 5 分钟 / 82 分钟级挂机；IC2 是纯挂机段（"虽然 C2 用的时间会很长，但是无需任何技巧"）',
      icGoals: [
        { id: 1, goal: '1e650', note: '所有普通挑战限制同时生效' },
        { id: 2, goal: '1e10500', note: '奖励：解锁自动维度献祭（每 400ms 一次）' },
        { id: 3, goal: '1e5000', note: '奖励：AD 倍率基于星系与计数频率' },
        { id: 4, goal: '1e13000', note: '最需要微操的一个' },
        { id: 5, goal: '1e16500', note: '买 1-4 维度会使更便宜的维度涨价' },
        { id: 6, goal: '2e22222', note: '奖励：AD 2~7 倍率基于第 1 与第 8 维度' },
        { id: 7, goal: '1e10000', note: '奖励：无限维度倍率基于计数频率' },
        { id: 8, goal: '1e27000', note: '奖励：维度提升倍率下限 ×4' }
      ]
    },
    {
      id: 'M6', short: '复制器解锁', sr: 'Replicanti',
      name: '解锁复制器（1e140 IP）', official: 9,
      range: '1e140 IP',
      goal: '买 1e140 IP 的 ID5 → 解锁复制器',
      detail: '复制器是第二阶段最后一个大机制：一个独立的指数增长资源，每涨到 1.797e308 就能换 1 个复制器星系（RG），而 RG 直接加厚计数频率与星系强度。',
      steps: ['1e140 IP → 买 ID5 → 解锁复制器'],
      time: 0, timeText: '含在 M5 内', timeSource: 'formula',
      note: '解锁本身不耗时'
    },
    {
      id: 'M7', short: '复制器时间墙', sr: 'ID6 / ID8 · 50% Galaxies',
      name: '复制器成长与复制器星系（1e140 IP → 1e308 IP）', official: null,
      range: '1e140 IP  →  1e308 IP',
      goal: '把复制器推到 1e308，反复买 RG，同时把 IP 推到 1.8e308',
      detail: '本段是纯粹的时间墙：复制器按 (1+复制概率) 每「复制间隔」翻一次，指数增长但底数很小。攻略的节奏是「IP 涨约 10 倍就大坍缩一次」，共约 30 次。',
      steps: [
        '1e140 IP → 买 ID5（复制器）×1',
        'e142 IP（57 星系，1 复制器）→ 大坍缩',
        '此后按攻略的 34 个锚点逐个推进：e143 → e146 → e148 → e151 → e153 → e157 → e161 → e166 → e171 → e173 → e177 → e182 → e185 → e188 → e190 → e194 → e199 → e200 → e204',
        'e204 IP → 70 星系 + 1e45000 AM → 解锁并用 1e200 IP 买 ID6 → 挂机不坍缩，等出第 1 个复制器星系',
        'e216 → e226 → e234 → e240（买复制器升级，1 小时内可到 1e308 复制器，成就 r95 让 1 RG 重置不再消耗 RG）',
        'e244 → e248 → e255（买 ID7，此后可每几分钟坍缩一次）→ e268 → e273（买 ID8）→ e280 → e285 → e293',
        'e300 → e308 IP → 满足永恒条件'
      ],
      time: 18000, timeText: '≈ 3~8 小时（区间，取中值 5 小时）',
      timeSource: 'derived',
      note: '攻略未逐条给出耗时，仅说明「现在开始可以每隔几分钟（IP 增加 10 倍左右即可大坍缩）」以及「每隔几分钟 IP 增加 10 倍」。'
        + '区间下限 3h 来自「34 个锚点 × 每个约 3 分钟」，上限 8h 来自「用计算器 ③ 按 k=10、单次 180 秒算出 168 个数量级需要 8.4 小时」。'
        + '真实值取决于你什么时候买复制器升级（概率/间隔）—— 用本页计算器 ② 可以自己试不同配置',
      anchors: [1.42e142, 1e143, 5e146, 1e148, 1e151, 2e153, 1e157, 1.5e161, 2e166, 1e171,
                1e173, 1e177, 1e182, 1e185, 1e188, 1e190, 1e194, 1e199, 1e200, 1e204,
                1e216, 1e226, 1e234, 1e240, 1e244, 1e248, 1e255, 1e268, 1e273, 1e280,
                1e285, 1e293, 1e300, 1e308]
    },
    {
      id: 'M8', short: '首次永恒', sr: 'Eternity',
      name: '首次永恒（1.8e308 IP）', official: 10,
      range: '1.8e308 IP',
      goal: 'IP 达到 1.8e308 → 点「永恒」',
      detail: '永恒门槛是 1.8e308 IP（不是 1e349，攻略明确说明）。完成后得到 1 EP，进入早期永恒阶段。',
      steps: ['e308 IP → 点「永恒」', '获得 1 EP'],
      time: 0, timeText: '含在 M7 末段', timeSource: 'formula',
      note: '攻略：「第一次永恒的时候无需等 1e349 IP，只需要 1.8e308 IP」'
    }
  ];

  // ------------------------------------------------- 公式（全部来自源码）
  var F = {
    /** 无限点数收益：infinity-points.js */
    ipGain: function (maxAM, ipMult) {
      ipMult = ipMult || 1;
      return Math.floor(ipMult * Math.pow(10, Math.log10(maxAM) / IP_AM_DIV - IP_OFFSET));
    },
    /** 从 0 攒到 maxAM 的纯收益（含 IP 翻倍倍率） */
    ipPerRun: function (maxAM, ipMult) { return F.ipGain(maxAM, ipMult); },

    /** 复制器指数增长：每 interval 毫秒 ×(1+chance) */
    repInterval: function (upgrades) {
      return Math.max(REP_INTERVAL_CAP, REP_BASE_INTERVAL * Math.pow(REP_INTERVAL_MULT, upgrades));
    },
    repChance: function (upgrades) {
      return Math.min(REP_CHANCE_CAP, upgrades * REP_CHANCE_STEP);
    },
    /** 从 1 涨到 target 需要的秒数 */
    repTimeTo: function (target, intervalMs, chance) {
      if (chance <= 0) return Infinity;
      return (Math.log(target) / Math.log(1 + chance)) * (intervalMs / 1000);
    },
    /** 复制器升级成本（第 n 次，从 0 起算） */
    repChanceCost: function (n) { return REP_CHANCE_COST0 * Math.pow(REP_CHANCE_COST_MULT, n); },
    repIntervalCost: function (n) { return REP_INTERVAL_COST0 * Math.pow(REP_INTERVAL_COST_MULT, n); },
    /** 给定 IP 能买多少次某升级（等比数列求和反解） */
    repBuyable: function (ip, cost0, mult) {
      if (ip < cost0) return 0;
      return Math.floor(Math.log(ip * (mult - 1) / cost0 + 1) / Math.log(mult));
    },

    /** 指数增长阶段：每次 crunch 让 IP 乘 k，从 ip0 到 ipTarget 需要多少次 */
    crunchesTo: function (ip0, ipTarget, k) {
      if (k <= 1) return Infinity;
      return Math.log(ipTarget / ip0) / Math.log(k);
    }
  };

  // ------------------------------------------------- 里程碑时间表汇总
  function timeline() {
    var rows = [], acc = 0;
    MILESTONES.forEach(function (m) {
      acc += m.time || 0;
      rows.push({
        id: m.id, short: m.short, sr: m.sr, name: m.name,
        range: m.range, goal: m.goal, steps: m.steps,
        official: m.official, detail: m.detail, note: m.note,
        time: m.time, timeText: m.timeText, timeSource: m.timeSource,
        start: acc - (m.time || 0), end: acc,
        anchors: m.anchors, icGoals: m.icGoals, ipRates: m.ipRates
      });
    });
    return { rows: rows, total: acc };
  }

  global.Stage2 = {
    MILESTONES: MILESTONES, F: F, timeline: timeline,
    CONST: {
      IP_AM_DIV: IP_AM_DIV, ETERNITY_IP: ETERNITY_IP, RG_RT: RG_RT,
      REP_INTERVAL_CAP: REP_INTERVAL_CAP, REP_BASE_INTERVAL: REP_BASE_INTERVAL,
      REP_CHANCE_COST0: REP_CHANCE_COST0, REP_INTERVAL_COST0: REP_INTERVAL_COST0
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
