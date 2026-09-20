/* ============================================================================
 * breaksim.js - Minimal independent post-break log10 simulation baseline.
 * ----------------------------------------------------------------------------
 * Goal: cover the *completed Break* state of Antimatter Dimensions using
 * log10 arithmetic (js/logmath.js) so values far beyond 1e308 stay exact.
 *
 * Scope (minimal, kept independent of stagesim.js):
 *   - 8 antimatter dimensions advanced through the production cascade.
 *   - 8 infinity dimensions with the exact post-break rules:
 *       * ID1 unlock (before first eternity) needs BOTH lifetime max AM log10 >= 1100
 *         AND IP log10 >= 8. Tiers 2-8 unlock at their maxAMAll log10 thresholds.
 *       * Eternity needs IP log10 >= 8 (i.e. IP >= 1e8), checked before eternity.
 *       * Per-tier per-purchase cost = ID_BASE_LOG[t] * ID_COST_MULT_LOG[t]^p (log10),
 *         e.g. ID1 = 1e8*1e3^p, ID2 = 1e9*1e6^p, ID3 = 1e10*1e8^p, ID4 = 1e20*1e10^p.
 *       * Each purchase adds 10 to the ID amount.
 *       * Per-tier multiplier = ID_POWER_LOG[t]^p, e.g. ID1 50^p, ID2 30^p,
 *         ID3 10^p, ID4-8 5^p (faithful to model.js ID_POWER_MULT / stagesim ID_POWER).
 *       * Tier d feeds tier d-1 at rate dt/10; tier 1 feeds Infinity Power at dt.
 *       * AD multiplier adds 7 * InfinityPowerLog.
 *   - Challenge 9 target = MAX_LOG = log10(Number.MAX_VALUE). The C9 cost
 *     bump follows the real source cost curve below (costBump/costBumpTick),
 *     triggered only when a full group of 10 ADs or a tick is bought.
 *
 * IMPORTANT BOUNDARY:
 *   - The runner `run()` models the *within-challenge* progression of a
 *     post-break state whose dimensions are PRESET via `startDims` (a
 *     challenge-internal state model). It does NOT auto-buy dimensions or
 *     ticks, so it is NOT a full C9 solver. The real C9 purchase/cost-bump
 *     flow is exercised separately by buyDimOnce/buyTickOnce/costBump.
 *   - All `ip*` fields in the contract are LOG10 of IP (not raw IP). `ip` is
 *     log10(IP); to get raw IP use 10^ip. This avoids confusion with the plain
 *     IP value the user may expect.
 * ========================================================================== */
(function (global) {
  'use strict';
  var L = global.LM;
  var NEG = L.NEG;
  // C9 target = log10(Number.MAX_VALUE) (~308.2547). Equals stagesim MAXVAL_LOG;
  // per legacy-model-fixes, double domain overflows past this, so this log baseline is mandatory.
  var MAX_LOG = Math.log10(Number.MAX_VALUE);
  // Lifetime-max-AM log10 thresholds to unlock each infinity-dimension tier. Mirrors
  // model.js AD.id.UNLOCK_LOG (and stagesim ID_UNLOCK); double model.js idUnlocked can
  // never reach these (maxAMAll log10 <= ~308), so ID unlock is handled ONLY here in log domain.
  var ID_UNLOCK = [0, 1100, 1900, 2400, 10500, 30000, 45000, 54000, 60000];
  // Per-tier base antimatter-dimension multiplier (log10); mirrors stagesim FLOW_LOG.
  var TIER_LOG = [0, 0, -1, -1, -1, -1, -1, -1, -1];

  // ---- Infinity-dimension cost / multiplier (log10, faithful to model.js / stagesim.js) ----
  // Per-tier cost = ID_BASE_LOG[t] + ID_COST_MULT_LOG[t] * purchases.
  // Per-tier multiplier = ID_POWER_LOG[t] * purchases (e.g. 50^p for ID1).
  var ID_BASE_LOG      = [0, 8, 9, 10, 20, 140, 200, 250, 280];
  var ID_COST_MULT_LOG = [0, 3, 6, 8, 10, 15, 20, 25, 30];
  var ID_POWER_LOG     = [0, Math.log10(50), Math.log10(30), Math.log10(10),
                             Math.log10(5), Math.log10(5), Math.log10(5), Math.log10(5), Math.log10(5)];

  // ---- C9 dimension / tickspeed cost model (faithful to js/model.js) ----
  // Costs are expressed in log10. The raw curve is:
  //   dimCost = base * mult^(floor(bought/10) + bump)
  //   tickCost = 1000 * 10^(ticksBought + chall9TickBumps)
  // `bump` comes from C9 costBumps, which are only raised by buying the 10th of
  // a dimension group or by a tickspeed purchase (costBump / costBumpTick).
  var DIM_BASE_COST = [0, 10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24];
  var DIM_COST_MULT  = [0, 1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15];
  var TICK_BASE_COST = 1e3;          // tickspeed base cost (log10 = 3)
  var TICK_COST_MULT = 10;           // tickspeed cost multiplier (log10 = 1)

  // ---- ID unlock / eternity gating (pure helpers, unit-tested) ----
  // ID1 (before first eternity) unlocks only when BOTH lifetime-max AM log10 >= 1100
  // AND IP log10 >= 8. Tiers 2-8 unlock at maxAMAll thresholds (see unlockIDs).
  function id1Unlocked(maxAMAllLog, ipLog) { return maxAMAllLog >= 1100 && ipLog >= 8; }
  function canEternity(ipLog) { return ipLog >= 8; }            // IP >= 1e8

  // ---- ID cost / amount / multiplier ----
  // Cost in log10 for the NEXT purchase of tier t: ID_BASE_LOG[t] + ID_COST_MULT_LOG[t]*purchases.
  // Matches model.js idCost = ID_BASE_COST[t] * ID_COST_MULT[t]^idBought (see audit fix).
  function idCostLog(s, t) { return ID_BASE_LOG[t] + ID_COST_MULT_LOG[t] * s.idBought[t]; }
  // Raw amount held by an ID tier = 10 per purchase.
  function idAmount(bought) { return 10 * bought; }
  // Multiplier log10 = ID_POWER_LOG[t]^purchases (e.g. 50^p for ID1, 30^p for ID2, ...).
  function idMultLog(s, t) { return ID_POWER_LOG[t] * s.idBought[t]; }
  // Production rate per second from an ID tier (log10).
  // amount * multiplier = 10^(idAmt + idMult) -> plain sum of logs.
  function idProductionLog(s, t) {
    if (s.idAmt[t] === NEG) return NEG;
    return s.idAmt[t] + idMultLog(s, t);
  }

  // ---- state ----
  function newState(cfg) {
    cfg = cfg || {};
    var startAM = cfg.startAMLog != null ? cfg.startAMLog : 0;   // log10(1) = 0
    var s = {
      t: 0,
      am: startAM,
      dims: [NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG],
      bought: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      maxAM: startAM,
      maxAMAll: cfg.maxAMAllLog != null ? cfg.maxAMAllLog : startAM,
      ip: cfg.startIPLog != null ? cfg.startIPLog : NEG,
      ipStart: cfg.startIPLog != null ? cfg.startIPLog : NEG,
      idAmt: [NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG],
      idBought: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      idUnlocked: [false, false, false, false, false, false, false, false, false],
      infPower: NEG,
      achMultLog: cfg.achMultLog != null ? cfg.achMultLog : 0,
      challenge: cfg.challenge || 0,
      ticks: 0,
      ticksBought: 0,
      costBumps: [0, 0, 0, 0, 0, 0, 0, 0, 0],   // C9 per-tier cost-exponent bumps
      chall9TickBumps: 0                          // C9 tickspeed cost-exponent bumps
    };
    if (cfg.startDims) {
      for (var d = 1; d <= 8; d++) if (cfg.startDims[d] != null) s.dims[d] = cfg.startDims[d];
    }
    applyPrebought(s, cfg.preboughtIDs);
    unlockIDs(s);
    return s;
  }

  function applyPrebought(s, pre) {
    if (!pre) return;
    for (var t = 1; t <= 8; t++) {
      var n = pre[t] || 0;
      if (n > 0) {
        s.idBought[t] = n;
        s.idAmt[t] = L.fromNum(idAmount(n));
        s.idUnlocked[t] = true;
      }
    }
  }

  function unlockIDs(s) {
    for (var t = 1; t <= 8; t++) {
      if (s.idUnlocked[t]) continue;
      if (t === 1) {
        // ID1 needs BOTH max AM >= 1e1100 and IP >= 1e8 before first eternity.
        if (id1Unlocked(s.maxAMAll, s.ip)) s.idUnlocked[1] = true;
      } else if (s.maxAMAll >= ID_UNLOCK[t]) {
        s.idUnlocked[t] = true;
      }
    }
  }

  // ---- AD (antimatter dimension) multiplier ----
  // Infinity Power adds 7 * InfinityPowerLog to the common AD multiplier.
  function infPowerMultLog(s) { return s.infPower === NEG ? 0 : 7 * s.infPower; }
  // Multiplicative factors combine by adding their logs (plain +, not L.ladd).
  // ticksBought adds the no-galaxy tickspeed bonus: each buy multiplies AD
  // production rate ~x1.1245 (log10 of which is added per purchase).
  function dimMultLog(s, t) {
    return infPowerMultLog(s) + s.achMultLog + TIER_LOG[t] + s.ticksBought * Math.log10(1.1245);
  }

  // ---- ID purchase ----
  function idBuy(s, t) {
    if (!s.idUnlocked[t]) return false;
    var c = idCostLog(s, t);
    if (s.ip < c) return false;                    // ip stored as log10
    s.ip = L.lsub(s.ip, c);
    s.idBought[t] += 1;
    s.idAmt[t] = L.fromNum(idAmount(s.idBought[t]));
    return true;
  }

  // ---- one simulation tick ----
  function step(s, dt) {
    var d, inc;
    // Infinity-dimension cascade: tier d -> tier d-1 at rate dt/10.
    for (d = 8; d >= 2; d--) {
      if (s.idAmt[d] === NEG) continue;
      inc = L.lscale(s.idAmt[d] + idMultLog(s, d), dt / 10);   // amount*mult*rate
      s.idAmt[d - 1] = L.ladd(s.idAmt[d - 1], inc);
    }
    // Tier 1 feeds Infinity Power at rate dt.
    if (s.idAmt[1] !== NEG) {
      s.infPower = L.ladd(s.infPower, L.lscale(s.idAmt[1] + idMultLog(s, 1), dt));
    }
    // Antimatter-dimension cascade: tier t -> tier t-1 at rate dt/10.
    for (d = 8; d >= 2; d--) {
      if (s.dims[d] === NEG) continue;
      inc = L.lscale(s.dims[d] + dimMultLog(s, d), dt / 10);
      s.dims[d - 1] = L.ladd(s.dims[d - 1], inc);
    }
    // Tier 1 produces antimatter at rate dt.
    if (s.dims[1] !== NEG) {
      s.am = L.ladd(s.am, L.lscale(s.dims[1] + dimMultLog(s, 1), dt));
    }
    s.t += dt;
    s.ticks += 1;
    if (s.am > s.maxAM) s.maxAM = s.am;
    if (s.maxAM > s.maxAMAll) s.maxAMAll = s.maxAM;
    unlockIDs(s);
  }

  // Reset per-run accumulators but keep permanent ID purchases.
  // Faithful to source resetAmount: each tier's amount is restored from its
  // current idBought (amount = 10 per buy), so a reset never drops a permanent
  // ID purchase. Only flow accumulators (am/infPower/ticks/costBumps) are cleared.
  function resetRun(s, cfg) {
    cfg = cfg || {};
    s.t = 0; s.ticks = 0;
    s.am = cfg.startAMLog != null ? cfg.startAMLog : 0;
    s.dims = [NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG, NEG];
    s.bought = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    s.maxAM = cfg.startAMLog != null ? cfg.startAMLog : NEG;
    s.infPower = NEG;                              // flow accumulator cleared
    s.ticksBought = 0;
    s.costBumps = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    s.chall9TickBumps = 0;
    // Restore each tier's amount from its permanent purchase count (idBought kept).
    // Source resetAmount: every tier returns to baseAmount=0 (NEG) unless it was
    // actually bought, so any manually-corrupted non-NEG amount on an un-bought tier is cleared.
    for (var t = 1; t <= 8; t++) {
      s.idAmt[t] = s.idBought[t] > 0 ? L.fromNum(idAmount(s.idBought[t])) : NEG;
    }
    applyPrebought(s, cfg.preboughtIDs);           // explicit injection overrides/augments
    unlockIDs(s);
  }

  // Optional policy: auto-buy IDs when IP allows.
  function policy(s, cfg) {
    if (!cfg.autoBuyIDs) return;
    for (var t = 1; t <= 8; t++) {
      var guard = 0;
      while (guard++ < 50 && s.idUnlocked[t] && s.ip >= idCostLog(s, t)) idBuy(s, t);
    }
  }

  // ---- challenge completion ----
  function challengeGoal(cfg) {
    if (cfg.challenge === 9) return MAX_LOG;
    return cfg.goalLog != null ? cfg.goalLog : Infinity;
  }
  function challengeDone(s, cfg) {
    var g = challengeGoal(cfg);
    if (g === Infinity) return false;
    return s.maxAM >= g - 1e-9;
  }

  // ---- C9 dimension / tickspeed cost (faithful to js/model.js) ----
  // Raw dimension cost = base * mult^(floor(bought/10) + bump). In log10 space
  // that is log10(base) + log10(mult)*steps (no overflow risk).
  function dimCostLog(s, t) {
    var steps = Math.floor(s.bought[t] / 10) + (s.costBumps ? s.costBumps[t] : 0);
    return Math.log10(DIM_BASE_COST[t]) + Math.log10(DIM_COST_MULT[t]) * steps;
  }
  // Raw dimension cost as a plain number (for assertions), small tiers only.
  function dimCost(s, t) {
    var steps = Math.floor(s.bought[t] / 10) + (s.costBumps ? s.costBumps[t] : 0);
    return DIM_BASE_COST[t] * Math.pow(DIM_COST_MULT[t], steps);
  }
  // Pre-purchase exponent used by costBump to find same-exponent tiers.
  function dimCostExponent(s, t) {
    var steps = Math.floor(s.bought[t] / 10) + (s.costBumps ? s.costBumps[t] : 0);
    return Math.floor(Math.log10(DIM_BASE_COST[t]) + Math.log10(DIM_COST_MULT[t]) * steps + 1e-12);
  }
  // Tickspeed cost (log10) and its exponent.
  function tickCostLog(s) {
    return Math.log10(TICK_BASE_COST) + Math.log10(TICK_COST_MULT) * (s.ticksBought + (s.chall9TickBumps || 0));
  }
  function tickCostExponent(s) { return 3 + s.ticksBought + (s.chall9TickBumps || 0); }

  // C9: bump every OTHER tier whose pre-purchase exponent equals this tier's;
  // also bump tickspeed if its exponent matches. Source: model.js costBump().
  function costBump(s, tier) {
    if (s.challenge !== 9) return;
    var e = dimCostExponent(s, tier);
    for (var o = 1; o <= 8; o++) {
      if (o === tier) continue;
      if (dimCostExponent(s, o) === e) s.costBumps[o] += 1;
    }
    if (tickCostExponent(s) === e) s.chall9TickBumps += 1;
  }
  // C9: same pre-purchase exponent comparison, triggered by a tickspeed buy.
  function costBumpTick(s) {
    if (s.challenge !== 9) return;
    var e = tickCostExponent(s);
    for (var t = 1; t <= 8; t++) {
      if (dimCostExponent(s, t) === e) s.costBumps[t] += 1;
    }
  }

  // Buy exactly one dimension of tier t (C9-aware). Returns true if purchased.
  // Mirrors model.js buyDim: pay cost, bump on the 10th of a group, count++,
  // and amount += 1 (log10(10^dims + 1) = L.ladd(dims, 0)).
  function buyDimOnce(s, t) {
    var c = dimCostLog(s, t);
    if (s.am < c) return false;                       // not enough antimatter
    s.am = L.lsub(s.am, c);
    if (s.bought[t] % 10 === 9) costBump(s, t);       // buying the 10th -> bump
    s.bought[t] += 1;
    s.dims[t] = L.ladd(s.dims[t], 0);                 // amount += 1 -> NEG becomes log10(1)
    return true;
  }
  // Buy one tickspeed. Always runs costBumpTick (a no-op outside C9). Returns true if purchased.
  function buyTickOnce(s) {
    var c = tickCostLog(s);
    if (s.am < c) return false;
    s.am = L.lsub(s.am, c);
    costBumpTick(s);
    s.ticksBought += 1;
    return true;
  }

  // ---- runner ----
  function run(cfg) {
    cfg = normalizeConfig(cfg);
    var s = newState(cfg);
    var log = ['start: challenge=' + cfg.challenge + ' maxAMAllLog=' + L.lformat(s.maxAMAll)];
    var dt = cfg.dt, maxT = cfg.maxSeconds, maxTicks = cfg.maxTicks;
    var stall = 0, lastMax = s.maxAM, reason = '';
    var ok = false;
    try {
      for (var i = 0; i < maxTicks && s.t < maxT; i++) {
        step(s, dt);
        policy(s, cfg);
        if (challengeDone(s, cfg)) {
          ok = true; reason = '';
          log.push('challenge complete at t=' + s.t.toFixed(2));
          break;
        }
        // Stall detection: AM not improving -> goal is unreachable.
        if (s.maxAM <= lastMax + 1e-12) stall++; else { stall = 0; lastMax = s.maxAM; }
        if (stall > cfg.stallLimit) { reason = 'unreachable: AM production stalled'; log.push(reason); break; }
      }
      if (!ok && !reason) {
        if (s.t >= maxT || i >= maxTicks) reason = 'timeout: goal not reached within budget';
        else reason = 'unreachable: goal not reached';
        log.push(reason);
      }
    } catch (e) {
      ok = false; reason = 'error: ' + (e && e.message ? e.message : String(e)); log.push(reason);
    }
    return buildContract(s, cfg, ok, reason, log);
  }

  function normalizeConfig(cfg) {
    cfg = cfg || {};
    cfg.dt = cfg.dt || 0.1;
    cfg.maxSeconds = cfg.maxSeconds != null ? cfg.maxSeconds : 3600;
    cfg.maxTicks = cfg.maxTicks != null ? cfg.maxTicks : Math.ceil(cfg.maxSeconds / cfg.dt) + 1;
    cfg.stallLimit = cfg.stallLimit != null ? cfg.stallLimit : 2000;
    return cfg;
  }

  function buildContract(s, cfg, ok, reason, log) {
    return sanitize({
      sourceMode: 'break-log',
      numericMode: 'log10',
      ok: ok,
      time: s.t,
      ticksRun: s.ticks,
      reason: reason,
      challenge: cfg.challenge,
      finalAMLog: s.am,
      maxAMLog: s.maxAM,
      maxAMAllLog: s.maxAMAll,
      ip: s.ip,
      ipGainedLog: L.lsub(s.ip, s.ipStart),
      infPowerLog: s.infPower,
      idBought: s.idBought.slice(),
      idAmountsLog: s.idAmt.slice(),
      log: log
    });
  }

  // Replace non-finite numbers with null so JSON has no Infinity/NaN.
  function sanitize(o) {
    if (Array.isArray(o)) return o.map(sanitize);
    if (o && typeof o === 'object') {
      var r = {};
      for (var k in o) r[k] = sanitize(o[k]);
      return r;
    }
    if (typeof o === 'number') return isFinite(o) ? o : null;
    return o;
  }

  global.BreakSim = {
    MAX_LOG: MAX_LOG,
    ID_UNLOCK: ID_UNLOCK,
    id1Unlocked: id1Unlocked,
    canEternity: canEternity,
    idCostLog: idCostLog,
    idAmount: idAmount,
    idMultLog: idMultLog,
    idProductionLog: idProductionLog,
    idBuy: idBuy,
    newState: newState,
    step: step,
    resetRun: resetRun,
    policy: policy,
    dimMultLog: dimMultLog,
    infPowerMultLog: infPowerMultLog,
    challengeGoal: challengeGoal,
    challengeDone: challengeDone,
    dimCostLog: dimCostLog,
    dimCost: dimCost,
    dimCostExponent: dimCostExponent,
    tickCostLog: tickCostLog,
    tickCostExponent: tickCostExponent,
    costBump: costBump,
    costBumpTick: costBumpTick,
    buyDimOnce: buyDimOnce,
    buyTickOnce: buyTickOnce,
    run: run
  };
})(typeof window !== 'undefined' ? window : globalThis);
