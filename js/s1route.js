/* Reproducible pre-break route search. Shared legacy model is isolated by isS1Audit. */
(function (global) {
  "use strict";
  const SIM = global.S1SIM;
  const OPTIONS = {
    initialAge: 4 * 3600, dt: 1 / 30, maxSeconds: 6 * 3600,
    stocks: [10, 25, 50, 100, 200], stages: [8, 11, 14],
    boostCaps: [8, 11, 14], galaxyCaps: [1, 2], manualInterval: 0.5,
    order: ["IU11", "IU21", "IU31", "IU41", "IU12", "IU22", "IU32", "IU42",
      "IU13", "IU23", "IU33", "IU14", "IU24", "IU34"]
  };
  const INITIAL_ACHIEVEMENTS = [11,12,13,14,15,16,17,18,21,24,25,26,27,28,31,32,42,44,45,46];
  function createRoute() {
    return { ip: 1, infinities: 1, elapsed: 0, upgrades: {}, rows: [],
      achievements: Object.fromEntries(INITIAL_ACHIEVEMENTS.map(id => [id, true])) };
  }
  function configuration(route, overrides) {
    return Object.assign({ isS1Audit: true, platform: "pc", adBonus: 1, brk: false,
      iuSet: { ...route.upgrades }, infinities: route.infinities, ipStock: route.ip,
      ipMult: 1, tTotal: OPTIONS.initialAge + route.elapsed,
      achOverride: { ...route.achievements }, dt: OPTIONS.dt,
      maxSeconds: OPTIONS.maxSeconds, logDetail: "none", galaxyCap: 2,
      c9AutoTiers: [], c9ManualOrder: [8,7,6,5,4,3,2,1],
      c9PurchaseMode: "single", c9ManualInterval: OPTIONS.manualInterval }, overrides);
  }
  function settleRun(route, result) {
    if (!result.ok) throw new Error("Selected preparation run did not finish");
    route.elapsed += result.time;
    route.ip += result.ipGained;
    route.infinities++;
    route.achievements = Object.fromEntries(result.achievements.map(id => [id, true]));
    for (const [id, seconds] of [[37,7200],[54,600],[55,60],[78,0.25]]) {
      if (result.time <= seconds) route.achievements[id] = true;
    }
    if (result.galaxies === 1) route.achievements[36] = true;
  }
  function fastestFarm(route) {
    let best = null;
    for (const boostCap of [5, 8, 12]) {
      const config = configuration(route, { challenge: 0, boostCap });
      const result = SIM.runInfinity(config);
      if (result.ok && (!best || result.time < best.result.time)) best = { result, config };
    }
    if (!best) throw new Error("No preparation strategy completed");
    return best;
  }
  function farmTo(route, target) {
    const startTime = route.elapsed;
    const firstRun = route.infinities;
    const records = [];
    while (route.ip < target) {
      const best = fastestFarm(route);
      records.push({ seconds: best.result.time, boostCap: best.config.boostCap,
        galaxyCap: best.config.galaxyCap, ipBefore: route.ip, infinity: route.infinities });
      settleRun(route, best.result);
    }
    return { wait: route.elapsed - startTime, runs: route.infinities - firstRun, records };
  }
  function purchaseUpgrade(route, key) {
    if (!SIM.canBuyIU(route.upgrades, key)) throw new Error("Illegal prerequisite: " + key);
    const upgrade = SIM.IU_BY_KEY[key];
    const farm = farmTo(route, upgrade.cost);
    route.ip -= upgrade.cost;
    route.upgrades[key] = true;
    route.rows.push({ action: "普通无限 " + farm.runs + " 次后购买", item: key + " " + upgrade.name,
      quantity: "1 项 / " + upgrade.cost + " IP", wait: farm.wait,
      cumulative: route.elapsed, ip: route.ip, runs: farm.runs, farmRuns: farm.records });
  }
  function probeChallenge(route, stock, onProgress) {
    const prepared = JSON.parse(JSON.stringify(route));
    const farm = farmTo(prepared, stock);
    prepared.rows.push({ action: "普通无限 " + farm.runs + " 次，保留 IP", item: "未花费 IP 倍率",
      quantity: stock + " IP", wait: farm.wait, cumulative: prepared.elapsed,
      ip: prepared.ip, runs: farm.runs, farmRuns: farm.records });
    const attempts = [];
    for (const boostCap of OPTIONS.boostCaps) for (const galaxyCap of OPTIONS.galaxyCaps) {
      const config = configuration(prepared, { challenge: 9, boostCap, galaxyCap });
      const result = SIM.runInfinity(config);
      attempts.push({ name: Object.keys(route.upgrades).length + " IU / " + stock + " IP / B" + boostCap + " G" + galaxyCap,
        seconds: result.ok ? prepared.elapsed + result.time : null, stock, boostCap, galaxyCap,
        preparationSeconds: prepared.elapsed, c9Seconds: result.ok ? result.time : null,
        ok: result.ok, config, prepared });
    }
    onProgress({ stage: Object.keys(route.upgrades).length, stock,
      completed: attempts.filter(attempt => attempt.ok).length });
    return attempts;
  }
  function selectedRoute(attempt) {
    const result = SIM.runInfinity({ ...attempt.config, logDetail: "full" });
    const rows = attempt.prepared.rows.slice();
    let previous = 0;
    for (const event of result.log.filter(event => ["boost", "galaxy", "sac"].includes(event.kind))) {
      rows.push({ action: event.text, item: event.extra, quantity: 1,
        wait: event.t - previous, cumulative: attempt.preparationSeconds + event.t,
        ip: attempt.stock, runs: 0 });
      previous = event.t;
    }
    rows.push({ action: "达到无限阈值并完成 C9", item: "大坍缩", quantity: "1 次 / +1 IP",
      wait: result.time - previous, cumulative: attempt.seconds, ip: attempt.stock + 1, runs: 1 });
    return { name: attempt.name, seconds: attempt.seconds, rows,
      c9Config: attempt.config, c9Seconds: result.time };
  }
  function generate(onProgress) {
    const route = createRoute();
    const attempts = [];
    for (const key of OPTIONS.order) {
      purchaseUpgrade(route, key);
      if (!OPTIONS.stages.includes(Object.keys(route.upgrades).length)) continue;
      for (const stock of OPTIONS.stocks) attempts.push(...probeChallenge(route, stock, onProgress));
    }
    const completed = attempts.filter(attempt => attempt.ok).sort((left, right) => left.seconds - right.seconds);
    if (!completed.length) throw new Error("No complete C9 route in the configured search space");
    const selected = selectedRoute(completed[0]);
    const sensitivity = [1/20,1/30,1/60].map(dt => {
      const result = SIM.runInfinity({ ...selected.c9Config, dt });
      return { dt, ok: result.ok, seconds: result.ok ? result.time : null };
    });
    return { version: "s1-audit-1", options: OPTIONS, initialAchievements: INITIAL_ACHIEVEMENTS,
      assumptions: assumptions(), selected, sensitivity,
      comparison: comparison(selected),
      candidates: attempts.map(({config, prepared, ...attempt}) => attempt),
      source: "js/s1route.js + js/s1sim.js + js/model.js" };
  }
  function assumptions() {
    return [
      "Web/Steam 条件模型：起点为 1 IP、1 次无限，总游玩时间设为 04:00:00；该四小时只影响 IU11 倍率，不计入本段时间。不是上一阶段存档的自动导入。",
      "初始成就 ID 明细见生成数据；不赠送新闻、离线 6 小时、游玩 8 天和后期整行成就。37/54/55/78 在实际满足单次无限时限后结算。未建模的其他成就奖励可能影响时间。",
      "筹备采用普通无限，每轮扫描提升上限 5/8/12、星系上限 2；固定合法升级顺序，比较 8/11/14 项升级节点与 10/25/50/100/200 IP 存量。没有遍历全部升级排列或 C8 农场。",
      "C9 不使用自动购买器：每 0.5 秒执行一轮 8→1 单个购买，同成本指数时优先高维，计数频率也避让同价维度。批内动作和重置耗时按 0 计，是理想操作模型，不是普通人手速保证。",
      "C9 扫描提升上限 8/11/14、星系上限 1/2；满足门槛时先星系后提升，献祭沿用模拟器收益阈值。未使用 ID1、免费挑战星系、被动 IP、广告或 IP 翻倍。",
      "等待时间为模型计算，秒位是显示分辨率而非实测精度；累计先取整、再作差显示每行等待，避免逐行四舍五入后总和不一致。",
      "打破无限路线未完成全程验证：32767 IP 仅为大坍缩购买器 15 次升级费用，另需 C12；ID1 还需达到 1e1100 AM 与 1e8 IP。不能把旧固定 210 秒筹备估值加入本表。"
    ];
  }
  function comparison(selected) {
    return [{ name: "直接 C9 / 未打破无限", status: "模型完成", seconds: selected.seconds,
      note: "90 个预设候选中可完成路线的最短值；不是全局最优证明。" },
    { name: "C12 → 32767 IP → Break → ID1 → C9", status: "未验证", seconds: null,
      note: "现有 double 模型上限为 Number.MAX_VALUE，不能验证 1e1100 AM 解锁与后续 IP 农场；不参与总耗时排名。" }];
  }
  global.S1ROUTE = { generate, selectedRoute, configuration, createRoute, OPTIONS };
})(typeof window !== "undefined" ? window : globalThis);
