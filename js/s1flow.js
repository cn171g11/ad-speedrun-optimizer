(function (global) {
  'use strict';
  global.S1FLOW = {
  "compressed": {
    "pc30": 20891.625,
    "pc90": 9949.884316366773,
    "and30": 14592.778813559322,
    "and90": 6931.367961401194
  },
  "runs": 4081,
  "baselineTotal": 61956.0,
  "phases": [
    {
      "id": "A",
      "name": "搭骨架：买前 11 个「小件」无限升级",
      "desc": "1 → 24 IP，每次 1 IP 起步，逐前缀实测单次无限耗时"
    },
    {
      "id": "B",
      "name": "skipReset 冲刺：买 3 件 skipReset + 被动 IP",
      "desc": "24 → 174 IP，单次无限压到 15~10 秒"
    },
    {
      "id": "C",
      "name": "满配 + 破无限：买 IU44 → IP 翻倍 ×16 → 刷到 32767 IP",
      "desc": "174 → 32767 IP，满配「停第 4 次提升」4.4 秒/次"
    },
    {
      "id": "D",
      "name": "尾段：刷 1e8 IP 买 ID1 → 进 C9",
      "desc": "破无限后刷 1e8 IP 买 ID1，C9 只需 5.7 分钟"
    }
  ],
  "steps": [
    {
      "ph": "A",
      "act": "买 <b>IU22</b>（1 IP）",
      "item": "IU22 · 2/7 维 · 2/7 维 ×无限次数",
      "qty": "1 IP",
      "wait": 0.0,
      "cum": 0.0
    },
    {
      "ph": "A",
      "act": "买 <b>IU32</b>（1 IP）",
      "item": "IU32 · 4/5 维 · 4/5 维 ×无限次数",
      "qty": "1 IP",
      "wait": 432.6,
      "cum": 432.6
    },
    {
      "ph": "A",
      "act": "买 <b>IU12</b>（1 IP）",
      "item": "IU12 · 买十倍率 · 买十倍率 2→2.2",
      "qty": "1 IP",
      "wait": 432.6,
      "cum": 865.2
    },
    {
      "ph": "A",
      "act": "买 <b>IU11</b>（1 IP）",
      "item": "IU11 · 时间倍率 · 总游玩时间倍率",
      "qty": "1 IP",
      "wait": 198.6,
      "cum": 1063.8
    },
    {
      "ph": "A",
      "act": "买 <b>IU21</b>（1 IP）",
      "item": "IU21 · 1/8 维 · 1/8 维 ×无限次数",
      "qty": "1 IP",
      "wait": 197.4,
      "cum": 1261.2
    },
    {
      "ph": "A",
      "act": "买 <b>IU31</b>（1 IP）",
      "item": "IU31 · 3/6 维 · 3/6 维 ×无限次数",
      "qty": "1 IP",
      "wait": 197.4,
      "cum": 1458.6000000000001
    },
    {
      "ph": "A",
      "act": "买 <b>IU41</b>（1 IP）",
      "item": "IU41 · 提升需求−9 · 维度提升需求 −9",
      "qty": "1 IP",
      "wait": 38.7,
      "cum": 1497.3000000000002
    },
    {
      "ph": "A",
      "act": "买 <b>IU42</b>（2 IP）",
      "item": "IU42 · 星系×2 · 星系强度 ×2",
      "qty": "2 IP",
      "wait": 73.8,
      "cum": 1571.1000000000001
    },
    {
      "ph": "A",
      "act": "买 <b>IU13</b>（3 IP）",
      "item": "IU13 · 本次无限时间 · 本次无限时间倍率",
      "qty": "3 IP",
      "wait": 77.1,
      "cum": 1648.2
    },
    {
      "ph": "A",
      "act": "买 <b>IU23</b>（5 IP）",
      "item": "IU23 · 未花费IP · 未花费 IP → 第 1 维",
      "qty": "5 IP",
      "wait": 128.5,
      "cum": 1776.7
    },
    {
      "ph": "A",
      "act": "买 <b>IU33</b>（7 IP）",
      "item": "IU33 · 提升倍率2.5 · 维度提升倍率 2→2.5",
      "qty": "7 IP",
      "wait": 124.60000000000001,
      "cum": 1901.3
    },
    {
      "ph": "B",
      "act": "买 <b>IU14</b>（20 IP）",
      "item": "IU14 · skipReset1 · skipReset1",
      "qty": "20 IP",
      "wait": 312.0,
      "cum": 2213.3
    },
    {
      "ph": "B",
      "act": "买 <b>IU24</b>（40 IP）",
      "item": "IU24 · skipReset2 · skipReset2",
      "qty": "40 IP",
      "wait": 592.0,
      "cum": 2805.3
    },
    {
      "ph": "B",
      "act": "买 <b>IU34</b>（80 IP）",
      "item": "IU34 · skipReset3 · skipReset3",
      "qty": "80 IP",
      "wait": 1088.0,
      "cum": 3893.3
    },
    {
      "ph": "B",
      "act": "买 <b>IU43</b>（10 IP）",
      "item": "IU43 · 被动 IP · 被动产 IP",
      "qty": "10 IP",
      "wait": 121.0,
      "cum": 4014.3
    },
    {
      "ph": "C",
      "act": "买 <b>IU44</b>（300 IP）",
      "item": "IU44 · skipResetGalaxy · skipResetGalaxy（16 齐）",
      "qty": "300 IP",
      "wait": 3630.0,
      "cum": 7644.3
    },
    {
      "ph": "C",
      "act": "买 IP 翻倍 <b>×2</b>（10 IP）",
      "item": "IP 翻倍",
      "qty": "×2 · 10 次无限",
      "wait": 44.0,
      "cum": 7688.3
    },
    {
      "ph": "C",
      "act": "买 IP 翻倍 <b>×4</b>（100 IP）",
      "item": "IP 翻倍",
      "qty": "×4 · 50 次无限",
      "wait": 220.00000000000003,
      "cum": 7908.3
    },
    {
      "ph": "C",
      "act": "买 IP 翻倍 <b>×8</b>（1000 IP）",
      "item": "IP 翻倍",
      "qty": "×8 · 250 次无限",
      "wait": 1100.0,
      "cum": 9008.3
    },
    {
      "ph": "C",
      "act": "买 IP 翻倍 <b>×16</b>（10000 IP）",
      "item": "IP 翻倍",
      "qty": "×16 · 1250 次无限",
      "wait": 5500.0,
      "cum": 14508.3
    },
    {
      "ph": "C",
      "act": "刷到 <b>32767 IP</b>（解锁打破无限）",
      "item": "刷 IP（满配）",
      "qty": "约 1323 次无限",
      "wait": 5825.325000000001,
      "cum": 20333.625
    },
    {
      "ph": "D",
      "act": "刷到 <b>1e8 IP</b> → 买 <b>ID1</b>",
      "item": "无限维度 ID1",
      "qty": "1e8 IP",
      "wait": 216.0,
      "cum": 20549.625
    },
    {
      "ph": "D",
      "act": "进 <b>C9</b> → 通关 ★",
      "item": "通关 C9",
      "qty": "通关",
      "wait": 342.0,
      "cum": 20891.625,
      "mark": "★ 终点"
    }
  ],
  "note": "口径：起点 = 手上 1 IP（第一次无限属第一阶段）。逐行「等待的时间」= 逐前缀实测单次无限耗时 × 所需次数（Web/Steam 30fps 基准）；满配刷 IP 段用 v7 最新「停第 4 次提升 = 4.4 秒/次」。90fps / 安卓为高刷新率加速比与平台比值换算。三杠杆叠加：① 最优采购顺序（IU22 起手）② 逐阶段停提升 ③ 高刷新率。本表为逐笔累加口径，比 v7 分段估算（4.56h）更细、更保守。"
};
})(typeof window !== 'undefined' ? window : globalThis);
