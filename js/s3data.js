/* ============================================================================
 * 第三阶段数据（s3data.js）—— 永恒 → 第一次现实 → Cel1 → Cel7
 * ----------------------------------------------------------------------------
 * 里程碑骨架 = 游戏内置 speedrun-milestones.js 的 25 个（本文件用其 id 10~25）
 * 攻略细节 = 《反物质维度-新人必看攻略-首次现实前》+《现实更新攻略-第六版》+《Cel-7 永恒部分全解》
 * 诚实声明：从「永恒」开始，游戏引入了时间研究树 / 永恒挑战 / 时间膨胀 / 符文 /
 *           天体等数百个机制，本工具无法做逐 tick 仿真（不像前两个阶段）。
 *           这一页给的是「官方里程碑骨架 + 教程里的关键节点 + 可算的部分」。
 * ============================================================================ */
(function (global) {
  'use strict';

  // 官方速通里程碑（全 25 个，来自源码）
  var MILESTONES = [{"id": 1, "key": "firstBoost", "name": "First Dimboost", "desc": "Get your first Dimboost"}, {"id": 2, "key": "firstGalaxy", "name": "First Galaxy", "desc": "Get your first Galaxy"}, {"id": 3, "key": "firstInfinity", "name": "First Infinity", "desc": "Complete your first Infinity"}, {"id": 4, "key": "completeC9", "name": "Tickspeed Challenge", "desc": "Complete the Tickspeed Autobuyer Challenge"}, {"id": 5, "key": "completeAllNC", "name": "All Normal Challenges", "desc": "Complete all Normal Challenges"}, {"id": 6, "key": "breakInfinity", "name": "Break Infinity", "desc": "Break Infinity for the first time"}, {"id": 7, "key": "upgrade5e11IP", "name": "${format(5e11)} IP Upgrade", "desc": "Purchase the ${formatPercents(0.5)} stronger Galaxies upgrade"}, {"id": 8, "key": "completeIC5", "name": "Infinity Challenge 5", "desc": "Complete Infinity Challenge 5"}, {"id": 9, "key": "unlockReplicanti", "name": "Replicanti", "desc": "Unlock Replicanti"}, {"id": 10, "key": "firstEternity", "name": "First Eternity", "desc": "Complete your first Eternity"}, {"id": 11, "key": "allEternityMilestones", "name": "All Eternity Milestones", "desc": "Unlock all Eternity Milestones"}, {"id": 12, "key": "completeFirstEC", "name": "First Eternity Challenge", "desc": "Complete any tier of an Eternity Challenge"}, {"id": 13, "key": "completeEC10", "name": "Eternity Challenge 10", "desc": "Complete Eternity Challenge 10 for the first time"}, {"id": 14, "key": "firstDilation", "name": "First Dilated Eternity", "desc": "Complete a Dilated Eternity for the first time"}, {"id": 15, "key": "upgradeTTgen", "name": "Time Theorem Generation", "desc": "Purchase the Time Theorem Generation Dilation Upgrade"}, {"id": 16, "key": "firstReality", "name": "First Reality", "desc": "Complete your first Reality"}, {"id": 17, "key": "upgradeBlackHole", "name": "Black Hole", "desc": "Unlock the Black Hole"}, {"id": 18, "key": "allRealityUpgrades", "name": "All Reality Upgrades", "desc": "Purchase all Reality Upgrades"}, {"id": 19, "key": "completeTeresaReality", "name": "Teresa's Reality", "desc": "Complete Teresa's Reality"}, {"id": 20, "key": "completeEffarigReality", "name": "Effarig's Reality", "desc": "Complete all tiers of Effarig's Reality"}, {"id": 21, "key": "completeEnslavedReality", "name": "The Nameless Ones' Reality", "desc": "Complete The Nameless Ones' Reality"}, {"id": 22, "key": "complete36VAchievement", "name": "All basic V-Achievements", "desc": "Complete ${formatInt(36)} V-Achievements"}, {"id": 23, "key": "completeRaMemories", "name": "Regain Ra's Memories", "desc": "Regain all of Ra's Celestial Memories"}, {"id": 24, "key": "completeFullDestabilize", "name": "Full Destabilization", "desc": "Disable all Dimensions within Lai'tela's Reality"}, {"id": 25, "key": "completeFullGame", "name": "Game Completed!", "desc": "Complete the entire game"}];

  // 把 25 个里程碑映射到本页的三段
  var SEGMENTS = [
    { key: 'eternity', name: '永恒 → 第一次现实', range: [10, 16],
      desc: '从第 10 个里程碑（首次永恒）到第 16 个（首次现实）。这一段是"重置次数换成长"：EP 换时间维度/永恒升级，TT 换时间研究树。' },
    { key: 'reality', name: '现实 → Cel1（Teresa）', range: [16, 19],
      desc: '从首次现实到 Teresa 的现实。引入符文（Glyph）、黑洞、现实升级。' },
    { key: 'celestials', name: 'Cel1 → Cel7（Teresa → Pelle）', range: [19, 25],
      desc: '七个天体依次通关：Teresa → Effarig → Enslaved → V → Ra → Lai\'tela → Pelle（#19~#25）。' }
  ];
  global.S3_MILESTONES = MILESTONES;
  global.S3_SEGMENTS = SEGMENTS;
})(typeof window !== 'undefined' ? window : globalThis);
