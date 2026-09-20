"use strict";
/* breakverify.cjs
 * Loads js/logmath.js + js/breaksim.js and asserts the minimal post-break
 * log10 baseline behaves exactly as the contract requires.
 */
const assert = require("node:assert/strict");
const path = require("node:path");

global.window = global;                                  // emulate browser global
require(path.join(__dirname, "..", "js", "logmath.js"));
require(path.join(__dirname, "..", "js", "breaksim.js"));
const B = global.BreakSim;
const LM = global.LM;

// 1. LM 1100 formats without Infinity.
{
  const f = LM.lformat(1100);
  assert.equal(typeof f, "string");
  assert.ok(!f.includes("Infinity"), "lformat(1100) must not contain Infinity: " + f);
}

// 2. ID1 unlock needs BOTH maxAMAllLog >= 1100 AND ipLog >= 8 (four combinations).
assert.equal(B.id1Unlocked(1099.999, 7.999), false); // AM low,  IP low
assert.equal(B.id1Unlocked(1099.999, 8),     false); // AM low,  IP ok
assert.equal(B.id1Unlocked(1100,     7.999), false); // AM ok,   IP low
assert.equal(B.id1Unlocked(1100,     8),     true);  // AM ok,   IP ok

// 3. IP eternity boundary 7.999 / 8 (IP >= 1e8).
assert.equal(B.canEternity(7.999), false);
assert.equal(B.canEternity(8), true);

// 4. ID1 first purchase: cost 1e8, amount 10, production 500/s; next cost 1e11.
{
  const s = B.newState({ preboughtIDs: {} });
  s.idUnlocked[1] = true;          // unlock for the purchase test
  s.ip = 20;                       // enough IP to buy
  const firstCost = B.idCostLog(s, 1);
  assert.ok(Math.abs(Math.pow(10, firstCost) - 1e8) < 1, "first cost should be ~1e8, got " + firstCost);
  const okBuy = B.idBuy(s, 1);
  assert.equal(okBuy, true);
  assert.equal(s.idBought[1], 1);
  assert.ok(Math.abs(Math.pow(10, s.idAmt[1]) - 10) < 1e-6, "amount should be 10, got " + s.idAmt[1]);
  const prod = Math.pow(10, B.idProductionLog(s, 1));
  assert.ok(Math.abs(prod - 500) < 1e-6, "production should be 500/s, got " + prod);
  const nextCost = B.idCostLog(s, 1);
  assert.ok(Math.abs(Math.pow(10, nextCost) - 1e11) < 1, "next cost should be ~1e11, got " + nextCost);
}

// 4b. ID2/3/4 first-purchase cost (1e9/1e10/1e20) and per-tier power (30/10/5).
{
  const mk = function () {
    const s = B.newState({ preboughtIDs: {} });
    s.ip = 30;                                       // plenty of IP for the buys
    s.idUnlocked[2] = s.idUnlocked[3] = s.idUnlocked[4] = true; // force-unlock for checks
    return s;
  };
  // First-purchase cost (idBought = 0 for all three).
  const s0 = mk();
  const c2 = Math.pow(10, B.idCostLog(s0, 2));
  const c3 = Math.pow(10, B.idCostLog(s0, 3));
  const c4 = Math.pow(10, B.idCostLog(s0, 4));
  assert.ok(Math.abs(c2 - 1e9) < 1, "ID2 first cost should be ~1e9, got " + c2);
  assert.ok(Math.abs(c3 - 1e10) < 1, "ID3 first cost should be ~1e10, got " + c3);
  assert.ok(Math.abs(c4 - 1e20) < 1, "ID4 first cost should be ~1e20, got " + c4);
  // Per-tier power = 10^ID_POWER_LOG[t], realized after one purchase (idBought=0 -> mult 1).
  const s2 = mk(); B.idBuy(s2, 2);
  assert.ok(Math.abs(Math.pow(10, B.idMultLog(s2, 2)) - 30) < 1e-6, "ID2 power 30, got " + Math.pow(10, B.idMultLog(s2, 2)));
  const s3 = mk(); B.idBuy(s3, 3);
  assert.ok(Math.abs(Math.pow(10, B.idMultLog(s3, 3)) - 10) < 1e-6, "ID3 power 10, got " + Math.pow(10, B.idMultLog(s3, 3)));
  const s4 = mk(); B.idBuy(s4, 4);
  assert.ok(Math.abs(Math.pow(10, B.idMultLog(s4, 4)) - 5) < 1e-6, "ID4 power 5, got " + Math.pow(10, B.idMultLog(s4, 4)));
  // Real ID2 buy: amount 10 * multiplier 30 -> production 300/s; next cost 1e15.
  const s = mk();
  const okBuy = B.idBuy(s, 2);
  assert.equal(okBuy, true);
  assert.equal(s.idBought[2], 1);
  const prod2 = Math.pow(10, B.idProductionLog(s, 2));
  assert.ok(Math.abs(prod2 - 300) < 1e-6, "ID2 production should be 300/s, got " + prod2);
  const next2 = Math.pow(10, B.idCostLog(s, 2));
  assert.ok(Math.abs(next2 - 1e15) < 1, "ID2 next cost should be ~1e15, got " + next2);
}

// 5. One second tick: Infinity Power log ~ log10(500).
{
  const s = B.newState({ preboughtIDs: { 1: 1 } });
  B.step(s, 1);
  const ipVal = Math.pow(10, s.infPower);
  assert.ok(Math.abs(ipVal - 500) < 1e-6, "infPower after 1s should be ~500, got " + ipVal);
}

// 6. ID reset keeps permanent purchase amount and clears Infinity Power.
{
  const cfg = { maxAMAllLog: 1200, startIPLog: 8 };
  const s = B.newState(cfg);
  s.idUnlocked[1] = true;
  assert.equal(B.idBuy(s, 1), true);
  assert.equal(s.idBought[1], 1);
  B.step(s, 1);                     // accumulate some Infinity Power
  assert.ok(s.infPower > 0, "expected non-zero infPower before reset");
  B.resetRun(s, {});                 // no prebought injection; permanent count must survive
  assert.equal(s.idBought[1], 1, "reset must keep permanent ID purchase count");
  assert.ok(Math.abs(Math.pow(10, s.idAmt[1]) - 10) < 1e-6, "amount must stay 10 after reset");
  assert.equal(s.infPower, LM.NEG, "infPower must reset to NEG");
}

// 7. runner returns a clear timeout/unreachable contract (no dims -> no AM growth).
{
  const r = B.run({ challenge: 9, preboughtIDs: { 1: 1 }, maxSeconds: 50, dt: 0.1 });
  assert.equal(r.sourceMode, "break-log");
  assert.equal(r.numericMode, "log10");
  assert.equal(typeof r.ok, "boolean");
  assert.ok(r.reason && r.reason.length > 0, "failure must carry a reason");
  assert.ok(["timeout", "unreachable"].some(p => r.reason.includes(p)), "unclear reason: " + r.reason);
  const j = JSON.stringify(r);
  assert.ok(!j.includes("Infinity"), "JSON must not contain Infinity");
  assert.ok(!j.includes("NaN"), "JSON must not contain NaN");
}

// 8. runner can also run "bought ID1 once, enter C9" and stay JSON-clean.
{
  const r = B.run({
    challenge: 9,
    preboughtIDs: { 1: 1 },
    startAMLog: 100,
    maxAMAllLog: 1200,
    startDims: [null, 100, 100, 100, 100, 100, 100, 100, 100],
    achMultLog: 6,
    maxSeconds: 100000,
    dt: 0.1
  });
  assert.equal(r.sourceMode, "break-log");
  assert.equal(typeof r.ok, "boolean");
  assert.equal(r.challenge, 9);
  assert.equal(r.idBought[1], 1);
  const j = JSON.stringify(r);
  assert.ok(!j.includes("Infinity"), "JSON must not contain Infinity");
  assert.ok(!j.includes("NaN"), "JSON must not contain NaN");
}

// 9. C9 cost-bump: a bump happens ONLY on the (a) 10th of a dimension group or
//    (b) a tickspeed purchase whose exponent matches another tier. A partial
//    purchase must NOT bump. Exponents are compared exactly as in js/model.js.
{
  // (a) partial purchase does NOT bump. Buy 9 of tier1 from scratch.
  const s = B.newState({ challenge: 9 });
  s.am = 100;                                        // log10(1e100), enough for the buys
  for (let i = 0; i < 9; i++) assert.equal(B.buyDimOnce(s, 1), true);
  let bumps = s.costBumps.reduce((a, b) => a + b, 0) + s.chall9TickBumps;
  assert.equal(bumps, 0, "9 partial purchases must not bump any tier");

  // (b) buying the 10th of a group bumps the same-exponent tier.
  // tier1 at bought=19 -> exponent 4 -> matches tier3 (bought 0 -> exponent 4).
  const s2 = B.newState({ challenge: 9 });
  s2.am = 100;
  s2.bought[1] = 19;
  assert.equal(B.buyDimOnce(s2, 1), true);
  assert.equal(s2.costBumps[3], 1, "10th-of-group buy should bump same-exponent tier 3");
  assert.equal(s2.chall9TickBumps, 0, "tick must not bump from a dimension buy here");

  // (c) tick bumps the same-exponent tier, only when exponents match.
  const t0 = B.newState({ challenge: 9 });
  t0.am = 100;
  assert.equal(B.buyTickOnce(t0), true);             // ticksBought 0 -> exp 3, no match
  let tb0 = t0.costBumps.reduce((a, b) => a + b, 0) + t0.chall9TickBumps;
  assert.equal(tb0, 0, "first tick (exp 3) matches no tier -> no bump");

  const t1 = B.newState({ challenge: 9 });
  t1.am = 100;
  t1.ticksBought = 3;                                // tick exp = 3 + 3 = 6
  assert.equal(B.buyTickOnce(t1), true);             // tier4 bought 0 -> exp 6 -> match
  assert.equal(t1.costBumps[4], 1, "tick exp 6 should bump same-exponent tier 4");
}

// 10. Buy helpers also drive production, not just cost/count.
{
  // (a) buying a dimension lifts its log10 count from NEG to log10(1)=0.
  const sd = B.newState({ challenge: 9 });
  sd.am = 100;                                        // log10(1e100)
  assert.equal(sd.dims[1], LM.NEG, "tier1 starts unowned (NEG)");
  assert.equal(B.buyDimOnce(sd, 1), true);
  assert.ok(Math.abs(sd.dims[1] - 0) < 1e-12, "after buy dims[1] should be log10(1)=0, got " + sd.dims[1]);

  // (b) buying a tick raises dimMultLog by one tickspeed notch (~x1.1245).
  const st = B.newState({ challenge: 9 });
  st.am = 100;
  const before = B.dimMultLog(st, 1);
  assert.equal(B.buyTickOnce(st), true);
  const notch = B.dimMultLog(st, 1) - before;
  assert.ok(Math.abs(notch - Math.log10(1.1245)) < 1e-12, "tick should add log10(1.1245) to mult, got " + notch);
}

// 11. Permanent ID purchases survive resetRun (source resetAmount restores amount from idBought).
{
  const s = B.newState({});
  s.idUnlocked[1] = true;            // unlock for the buy test
  s.ip = 20;                        // enough IP to buy
  const ok = B.idBuy(s, 1);
  assert.equal(ok, true);
  assert.equal(s.idBought[1], 1);
  assert.ok(Math.abs(Math.pow(10, s.idAmt[1]) - 10) < 1e-6, "amount should be 10 after buy, got " + s.idAmt[1]);
  // Reset with empty cfg: permanent ID purchase must survive, amount recomputed = 10.
  B.resetRun(s, {});
  assert.equal(s.idBought[1], 1, "idBought must survive resetRun");
  assert.ok(Math.abs(Math.pow(10, s.idAmt[1]) - 10) < 1e-6, "amount must stay 10 after resetRun, got " + s.idAmt[1]);
}

// 12. resetRun clears a manually-corrupted idAmt on a zero-purchase tier (no residual).
{
  const s = B.newState({ preboughtIDs: { 1: 1 } });
  s.idAmt[3] = 5;                           // corrupt tier3: idBought=0 but idAmt forced non-NEG
  B.resetRun(s, {});
  assert.equal(s.idAmt[3], LM.NEG, "resetRun must reset zero-purchase tier3 idAmt to NEG (no residual)");
  assert.equal(s.idBought[1], 1, "permanent ID1 purchase survives reset");
  assert.ok(Math.abs(Math.pow(10, s.idAmt[1]) - 10) < 1e-6, "ID1 amount must stay 10 after reset");
}

console.log(JSON.stringify({ status: "PASS", note: "breakverify: all assertions passed" }));
