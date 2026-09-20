"use strict";
/* ============================================================================
 * tests/model-postbreak.cjs — model.js 打破无限(post-break) 路径最小修复回归测试
 * ----------------------------------------------------------------------------
 * 对应 legacy-model-fixes 的最小修复：
 *   1) newState 初始化 maxAM，brk=false 直接路径回归不变
 *   2) step() 仅未打破无限时把 AM 截断到 INFINITY_AM；brk=true 不伪装超大数、不返回 NaN
 *   3) idTick() ID1 = idProduction*dt（无 /1000），ID8→ID2 的 /10 保留
 *   4) buyDimBulk/purchaseDimensionBatch 只在买到「第 10 个」时触发 C9 costBump
 *   5) ID_UNLOCK 改为 log10 安全形式，加载不得得到 Infinity；idUnlocked 对溢出明确判不可用且不 NaN
 *
 * 运行：node tests/model-postbreak.cjs
 * 前置：node --check js/model.js 已通过；tools/s1-audit.cjs --replay 仍 PASS（见报告）
 * ============================================================================ */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
global.window = global;
require(path.join(ROOT, "js", "model.js"));

const INF = AD.INFINITY_AM;

let passed = 0;
function ok(name) { passed++; console.log("PASS " + name); }

// ---------------------------------------------------------------- 修复 1
(function testNewStateMaxAM() {
  // brk=false 直接路径：maxAM 应等于起始 AM，行为不变
  const s1 = AD.newState({ am: 1e30 });
  assert.equal(s1.brk, false);
  assert.equal(s1.maxAM, 1e30);

  // 默认起始 AM = START_AM(10)
  const s2 = AD.newState({});
  assert.equal(s2.maxAM, 10);

  // brk=true：maxAM 从起始/current AM 初始化（不得是 undefined，否则 ipGain 会 NaN）
  const s3 = AD.newState({ brk: true, am: 1e20 });
  assert.equal(s3.maxAM, 1e20);
  assert.ok(typeof s3.maxAM === "number" && !isNaN(s3.maxAM));

  // 显式 opts.maxAM 优先
  const s4 = AD.newState({ brk: true, maxAM: 5e40 });
  assert.equal(s4.maxAM, 5e40);

  // 回归：bigCrunch 在 brk=false 直接路径仍可用，且不再因 maxAM 未初始化而 NaN
  const s5 = AD.newState({ am: INF, ipMult: 4 });
  const gained = AD.s1.bigCrunch(s5);
  assert.ok(typeof gained === "number" && !isNaN(gained), "bigCrunch 必须返回有限 IP");
  assert.equal(gained, 4);

  // cloneState 必须保留 maxAM
  const c = AD.cloneState(s3);
  assert.equal(c.maxAM, s3.maxAM);
  ok("fix1 newState/cloneState.maxAM 初始化 + brk=false bigCrunch 回归");
})();

// ---------------------------------------------------------------- 修复 2
(function testStepClampBrkConditional() {
  // brk=false：AM 封顶到 INFINITY_AM（即使产量溢出成 Infinity 也夹回）
  const b = AD.newState({ brk: false });
  b.dims[1] = INF;                 // 产出溢出 -> am 必为 Infinity
  AD.step(b, 1e-9);
  assert.equal(b.am, INF, "brk=false am 必须封顶到 INFINITY_AM");
  assert.ok(!isNaN(b.am));

  // brk=true：不截断；溢出即 Infinity（明确不可用），且不得是 NaN
  const c = AD.newState({ brk: true, am: 1e100 });
  c.dims[1] = INF;
  AD.step(c, 1e-9);
  assert.equal(c.am, Infinity, "brk=true am 不应被截断（溢出即 Infinity）");
  assert.ok(!isNaN(c.am), "brk=true 溢出不得是 NaN");
  assert.ok(c.am !== Number.MAX_VALUE, "brk=true 不得用 Number.MAX_VALUE 伪装");

  // brk=true 且 AM 仍为有限（未超范围）：保持有限、正常增长
  const d = AD.newState({ brk: true, am: 1e10 });
  d.dims[1] = 1e6;
  AD.step(d, 1);
  assert.ok(isFinite(d.am), "brk=true 有限 AM 仍是有限值");
  assert.ok(d.am > 1e10, "brk=true 有限 AM 应正常增长");

  // brk=true 溢出后 maxAMAll 也变 Infinity，但 idUnlocked 必须判为不可用而非 NaN（见修复 5）
  assert.equal(AD.id.unlocked(c, 1), false);
  ok("fix2 step() 仅未打破无限时截断 + brk=true 溢出明确不可用且不 NaN");
})();

// ---------------------------------------------------------------- 修复 3
(function testIdTickNoDiv1000() {
  // 运行时：ID 在 double 路径下无法真正解锁（阈值 1e1100 超 double），
  // 故 idTick 在 brk=true 且未解锁时为 no-op（不崩溃、不 NaN）。
  const s = AD.newState({ brk: true, ip: 1e9, maxAMAll: 1e308 });
  const ip0 = s.infPower;
  AD.id.tick(s, 1);
  assert.equal(s.infPower, ip0, "未解锁时 idTick 不改变 infPower");
  assert.ok(!isNaN(s.infPower));

  // 产量公式 = idAmt * 50^idBought（无 /1000）
  s.idAmt[1] = 100; s.idBought[1] = 3;
  assert.equal(AD.id.production(s, 1), 100 * Math.pow(50, 3));

  // 源码级回归守卫：idTick 内 ID1 用 *dt（无 /1000），级联用 *dt/10
  const src = fs.readFileSync(path.join(ROOT, "js", "model.js"), "utf8");
  const m = src.match(/function idTick\(s, dt\) \{[\s\S]*?\n  \}/);
  assert.ok(m, "找不到 idTick 定义");
  assert.ok(/s\.infPower \+= idProduction\(s, 1\) \* dt;/.test(m[0]),
    "idTick 的 ID1 必须是 idProduction*dt（不得有 /1000）");
  assert.ok(/s\.idAmt\[t - 1\] \+= idProduction\(s, t\) \* dt \/ 10;/.test(m[0]),
    "idTick 的 ID8→ID2 级联必须保留 /10");
  assert.ok(!/infPower \+= idProduction\(s, 1\) \* dt \/ 1000/.test(m[0]),
    "idTick 的 ID1 不得有重复 /1000");
  ok("fix3 idTick ID1=idProduction*dt(无/1000) + ID8→ID2 /10 保留");
})();

// ---------------------------------------------------------------- 修复 4
(function testBuyDimBulkCostBumpGating() {
  // 构造与 s1-audit 一致的场景：tier1 与 tier3 成本 exponent 相同(=4)，买满整组会触发 tier3 的 costBump。
  function setup(bought1) {
    const s = AD.newState({ isS1Audit: true, challenge: 9, am: 1e30 });
    s.bought[1] = bought1;
    return s;
  }
  assert.equal(AD.dimCostExponent(setup(10), 1), AD.dimCostExponent(setup(10), 3),
    "前置：tier1 与 tier3 成本 exponent 必须相同，才能观测 costBump");

  // 买满整组(10→20)：必须触发 C9 costBump（bought 达到 10 的整数倍）
  const s = setup(10);
  const bought = AD.buyDimBulk(s, 1);   // remaining=10, affordable 巨大 -> 买 10 个(10→20)
  assert.equal(bought, 10);
  assert.equal(s.bought[1], 20);
  assert.equal(s.costBumps[3], 1, "买满整组(10→20)必须触发 C9 costBump");

  // 只买到部分组(10→13)：不得触发 costBump
  const s2 = setup(10);
  const cost = AD.dimCost(s2, 1);
  s2.am = cost * 3 + 1;                 // 只够买 3 个（部分组）
  const bought2 = AD.buyDimBulk(s2, 1);  // remaining=10, affordable=3 -> 买 3 个(10→13)
  assert.equal(bought2, 3);
  assert.equal(s2.bought[1], 13);
  assert.equal(s2.costBumps[3], 0, "部分组购买不得误触发 C9 costBump");
  assert.deepEqual(s2.costBumps, new Array(9).fill(0), "部分组购买 costBumps 必须全 0");

  // 从 bought=19 买 1 个(19→20)：等价于 buyDim 单买触发 costBump 的情形
  const s3 = setup(19);
  const bought3 = AD.buyDimBulk(s3, 1);  // remaining=1, 买 1 个(19→20)
  assert.equal(bought3, 1);
  assert.equal(s3.bought[1], 20);
  assert.equal(s3.costBumps[3], 1, "买到第10个(19→20)必须触发 C9 costBump，与 buyDim 一致");

  // 直接 C9 既有流程(buyDimUntilTen 买满整组)不变：仍触发 costBump
  const s4 = setup(10);
  const bought4 = AD.buyDimUntilTen(s4, 1);  // 买满整组(10→20)
  assert.equal(bought4, 10);
  assert.equal(s4.costBumps[3], 1, "buyDimUntilTen 买满整组仍触发 C9 costBump");

  ok("fix4 buyDimBulk 只在买到第10个时触发 C9 costBump");
})();

// ---------------------------------------------------------------- 修复 5
(function testIdUnlockSafe() {
  // model.js 加载时 ID_UNLOCK / ID_UNLOCK_LOG 不得是 Infinity
  for (let t = 1; t <= 8; t++) {
    assert.ok(isFinite(AD.id.UNLOCK[t]), "AD.id.UNLOCK[" + t + "] 必须是有限值（加载不得得 Infinity）");
    assert.ok(isFinite(AD.id.UNLOCK_LOG[t]), "AD.id.UNLOCK_LOG[" + t + "] 必须是有限值");
  }
  assert.deepEqual(AD.id.UNLOCK_LOG,
    [0, 1100, 1900, 2400, 10500, 30000, 45000, 54000, 60000]);
  assert.deepEqual(AD.id.UNLOCK, AD.id.UNLOCK_LOG, "AD.id.UNLOCK 向后兼容导出(log10 形式)");

  // 普通 double 范围 maxAMAll(≤1.8e308, log10≤308) 永远达不到 1e1100 -> 明确不可用
  const s = AD.newState({ brk: true, ip: 1e9, maxAMAll: 1e308 });
  assert.equal(AD.id.unlocked(s, 1), false);
  assert.equal(AD.id.unlocked(s, 2), false);
  assert.ok(!isNaN(AD.id.unlocked(s, 1)));

  // 溢出 maxAMAll(Infinity) 明确判不可用，且不 NaN
  const s3 = AD.newState({ brk: true, ip: 1e9, maxAMAll: Infinity });
  assert.equal(AD.id.unlocked(s3, 1), false);
  assert.ok(!isNaN(AD.id.unlocked(s3, 1)));

  // brk=false 永不解锁
  const s4 = AD.newState({ brk: false, ip: 1e9, maxAMAll: Infinity });
  assert.equal(AD.id.unlocked(s4, 1), false);

  ok("fix5 ID_UNLOCK 加载无 Infinity + idUnlocked 溢出明确不可用且不 NaN");
})();

console.log(JSON.stringify({ status: "PASS", tests: passed }));
