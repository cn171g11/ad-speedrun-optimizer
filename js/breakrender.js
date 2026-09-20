/* Break-log workbench renderer. This page intentionally does not consume S1 data. */
(function (global) {
  'use strict';

  var B = global.BreakSim;
  var L = global.LM;
  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function num(id, fallback) {
    var value = Number($(id).value);
    return isFinite(value) ? value : fallback;
  }

  function fmtLog(value) {
    if (value == null || !isFinite(value)) return '不可用';
    return esc(L.lformat(value)) + ' <span class="log-sub">(log10=' + value.toFixed(6) + ')</span>';
  }

  function fmtPlain(value, digits) {
    if (value == null || !isFinite(value)) return '不可用';
    return Number(value).toFixed(digits == null ? 3 : digits);
  }

  function fmtBool(value) {
    return value ? '<span class="pass">通过</span>' : '<span class="fail">不满足</span>';
  }

  function parseDims() {
    var raw = $('breakStartDims').value.split(',');
    var dims = [null, null, null, null, null, null, null, null, null];
    for (var i = 0; i < 8; i++) {
      var value = Number(String(raw[i] == null ? '' : raw[i]).trim());
      if (isFinite(value) && value > -Infinity) dims[i + 1] = value;
    }
    return dims;
  }

  function configFromForm() {
    var idPreset = $('breakIdPreset').value;
    var cfg = {
      challenge: Number($('breakChallenge').value),
      startAMLog: num('breakStartAM', 100),
      maxAMAllLog: num('breakMaxAMAll', 1200),
      startIPLog: num('breakStartIP', 8),
      achMultLog: num('breakAchMult', 6),
      dt: Math.max(num('breakDt', 0.1), 0.001),
      maxSeconds: Math.max(num('breakMaxSeconds', 100000), 0.1),
      startDims: parseDims()
    };
    if (idPreset === 'id1') cfg.preboughtIDs = { 1: 1 };
    return cfg;
  }

  function renderContract() {
    $('breakContract').innerHTML = 'sourceMode=break-log · numericMode=log10';
  }

  function renderResult(result) {
    var status = result.ok ? 'ok' : 'bad';
    var stateText = result.ok ? '达到 C9 目标（预置维度基线）' : '未达到 C9 目标';
    var reason = result.reason ? esc(result.reason) : '完成';
    var html = '';
    html += '<div class="break-status ' + status + '"><strong>' + stateText + '</strong><br>';
    html += 'reason: <code>' + reason + '</code></div>';
    html += '<div class="break-kpis">';
    html += kpi('挑战内时间', fmtPlain(result.time, 3) + ' s', '不是 1 IP → C9 全程时间');
    html += kpi('最终 AM', fmtLog(result.finalAMLog), 'log10(AM)');
    html += kpi('本次最高 AM', fmtLog(result.maxAMLog), 'log10(AM)');
    html += kpi('永恒内最高 AM', fmtLog(result.maxAMAllLog), 'log10(AM)，ID 解锁门槛用此值');
    html += kpi('IP', fmtLog(result.ip), 'log10(IP)，合同字段不是 raw IP');
    html += kpi('无限之力', fmtLog(result.infPowerLog), 'log10(Infinity Power)');
    html += kpi('步数', fmtPlain(result.ticksRun, 0), 'dt=' + fmtPlain(num('breakDt', 0.1), 3) + ' s');
    html += kpi('ID1 已购', result.idBought && result.idBought[1] != null ? result.idBought[1] : '不可用', '永久购买次数');
    html += '</div>';
    html += '<pre class="logbox break-log">' + esc((result.log || []).join('\n')) + '</pre>';
    $('breakResult').className = 'break-result';
    $('breakResult').innerHTML = html;
  }

  function kpi(label, value, sub) {
    return '<div class="break-kpi"><div class="k">' + label + '</div><div class="v">' + value + '</div><div class="s">' + sub + '</div></div>';
  }

  function renderIdTable() {
    var rows = [];
    var unlock = B.ID_UNLOCK;
    for (var t = 1; t <= 8; t++) {
      var s = B.newState({ maxAMAllLog: unlock[t], startIPLog: 20 });
      s.idUnlocked[t] = true;
      var firstCost = B.idCostLog(s, t);
      s.idBought[t] = 1;
      s.idAmt[t] = L.fromNum(10);
      var power = B.idMultLog(s, t);
      var production = B.idProductionLog(s, t);
      rows.push('<tr><td>ID' + t + '</td><td>' + fmtLog(unlock[t]) + '</td><td>' + fmtLog(firstCost) + '</td><td>' + fmtLog(power) + '</td><td>' + fmtLog(production) + '</td></tr>');
    }
    $('breakIdTable').innerHTML = '<table class="break-table"><thead><tr><th>层级</th><th>AM 解锁阈值</th><th>首购成本</th><th>1 次购买倍率</th><th>1 次购买产量 / 秒</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }

  function renderC9Checks() {
    var partial = B.newState({ challenge: 9 });
    partial.am = 100;
    for (var i = 0; i < 9; i++) B.buyDimOnce(partial, 1);
    var partialPass = partial.costBumps.reduce(function (a, b) { return a + b; }, 0) === 0 && partial.chall9TickBumps === 0;

    var tenth = B.newState({ challenge: 9 });
    tenth.am = 100;
    tenth.bought[1] = 19;
    B.buyDimOnce(tenth, 1);
    var tenthPass = tenth.costBumps[3] === 1 && tenth.dims[1] === 0;

    var tick = B.newState({ challenge: 9 });
    tick.am = 100;
    tick.ticksBought = 3;
    B.buyTickOnce(tick);
    var tickPass = tick.costBumps[4] === 1;

    var rows = [
      '<tr><td>买 9 个 AD1（未满组）</td><td>' + fmtBool(partialPass) + '</td><td>所有跳档 = 0</td></tr>',
      '<tr><td>AD1 从 19 → 20</td><td>' + fmtBool(tenthPass) + '</td><td>预购指数 4 命中 AD3；amount 更新由 helper 单测覆盖</td></tr>',
      '<tr><td>tickspeed 指数 6 → 7</td><td>' + fmtBool(tickPass) + '</td><td>命中 AD4，costBumps[4] = 1</td></tr>',
      '<tr><td>C9 目标</td><td><span class="pass">固定</span></td><td>MAX_LOG = ' + fmtPlain(B.MAX_LOG, 6) + '</td></tr>'
    ];
    $('breakC9Checks').innerHTML = '<table class="break-table"><thead><tr><th>检查</th><th>结果</th><th>源码边界</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }

  function renderBoundaries() {
    var rows = [
      ['AM 1099.999 / IP 8', B.id1Unlocked(1099.999, 8)],
      ['AM 1100 / IP 7.999', B.id1Unlocked(1100, 7.999)],
      ['AM 1100 / IP 8', B.id1Unlocked(1100, 8)],
      ['Eternity IP 8', B.canEternity(8)]
    ];
    $('breakBoundaries').innerHTML = '<div class="break-boundary-grid">' + rows.map(function (row) {
      return '<div class="break-boundary"><div class="label">' + row[0] + '</div><div class="value">' + (row[1] ? '<span class="pass">满足</span>' : '<span class="fail">不满足</span>') + '</div></div>';
    }).join('') + '</div>';
  }

  function run() {
    var button = $('breakRun');
    button.disabled = true;
    $('breakRunHint').textContent = '正在运行 log10 baseline...';
    try {
      renderResult(B.run(configFromForm()));
    } catch (error) {
      $('breakResult').className = 'break-result';
      $('breakResult').innerHTML = '<div class="break-status bad"><strong>运行错误</strong><br><code>' + esc(error.message || error) + '</code></div>';
    } finally {
      button.disabled = false;
      $('breakRunHint').textContent = '时间是 challenge-internal seconds，不是从 1 IP 开始的全程时间。';
    }
  }

  function boot() {
    renderContract();
    renderIdTable();
    renderC9Checks();
    renderBoundaries();
    $('breakRun').addEventListener('click', run);
    run();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
