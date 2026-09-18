/* ============================================================================
 * S1 段工作台渲染（s1render.js）
 * ----------------------------------------------------------------------------
 * Consumes the data contract window.S1FLOW (version 's1-audit-1') produced by
 * the main agent, plus S1SIM (model.js + s1sim.js) for the IU grid and the
 * on-demand C9 recompute. All times render as HH:MM:SS. No data is fabricated:
 * missing/empty fields render an explicit "未生成" placeholder.
 * ============================================================================ */
(function (global) {
  'use strict';

  var FLOW = global.S1FLOW;
  var SIM = global.S1SIM;
  var CONTRACT_VERSION = 's1-audit-1';
  var SECONDS_PER_HOUR = 3600;
  var SECONDS_PER_MINUTE = 60;
  var $ = function (id) { return document.getElementById(id); };

  // ── formatting helpers ────────────────────────────────────────────────
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function roundSec(s) { return Math.round(s || 0); }

  // All duration cells use HH:MM:SS so the operation table stays internally
  // consistent (rounded cumulative, rounded wait diff).
  function fmtHMS(sec) {
    var s = Math.max(0, roundSec(sec));
    var h = Math.floor(s / SECONDS_PER_HOUR);
    var m = Math.floor((s % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
    var r = s % SECONDS_PER_MINUTE;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(r);
  }

  function fmtNum(x) {
    if (x === null || x === undefined) return '—';
    if (!isFinite(x)) return '∞';
    if (x >= 1e6 || x < 1e-3) return x.toExponential(2).replace('e+', 'e');
    return String(Math.round(x * 1000) / 1000);
  }

  // Escape data strings before injecting into innerHTML to avoid HTML injection.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;';
    });
  }

  function empty(msg) { return '<div class="s1-empty">' + esc(msg || '未生成') + '</div>'; }

  // Break routes flagged unverified must keep their original order (never sorted).
  function isUnverified(status) {
    if (status == null) return false;
    return /未验证/i.test(status) || /unverif/i.test(status) || status === 'unverified';
  }

  // ── version banner ────────────────────────────────────────────────────
  function renderVersion() {
    var host = $('s1Version');
    if (!host) return;
    var v = FLOW && FLOW.version;
    if (v === CONTRACT_VERSION) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="s1-warn">数据合同版本不匹配（当前：' +
      esc(v || '未定义') + '，期望：' + CONTRACT_VERSION +
      '）。请重新生成仿真数据后刷新，当前各区块显示为空占位。</div>';
  }

  // ── assumptions ───────────────────────────────────────────────────────
  function renderAssumptions() {
    var host = $('s1Assumptions');
    if (!host) return;
    var list = FLOW && FLOW.assumptions;
    if (!list || !list.length) { host.innerHTML = empty('假设未生成'); return; }
    host.innerHTML = '<ul class="s1-assumptions">' + list.map(function (a) {
      return '<li>' + esc(a) + '</li>';
    }).join('') + '</ul>';
  }

  // ── route comparison ─────────────────────────────────────────────────
  function renderComparison() {
    var host = $('s1Comparison');
    if (!host) return;
    var list = FLOW && FLOW.comparison;
    if (!list || !list.length) { host.innerHTML = empty('路线对比未生成'); return; }

    // Verified routes sort by seconds; unverified break routes keep original order.
    var verified = [], unverified = [];
    list.forEach(function (r) {
      (isUnverified(r.status) || r.seconds == null ? unverified : verified).push(r);
    });
    verified.sort(function (a, b) { return (a.seconds || 0) - (b.seconds || 0); });
    var ordered = verified.concat(unverified);

    var h = ['<div class="scroll"><table><thead><tr>',
      '<th>路线</th><th>状态</th><th>耗时</th><th>说明</th>',
      '</tr></thead><tbody>'];
    ordered.forEach(function (r) {
      var cls = isUnverified(r.status) ? 'unverified' : 'verified';
      var sec = (r.seconds == null) ? '<span class="s1-mute">—</span>' : '<b>' + fmtHMS(r.seconds) + '</b>';
      h.push('<tr><td>' + esc(r.name) + '</td><td><span class="s1-tag ' + cls + '">' + esc(r.status || '') + '</span></td><td>' + sec + '</td><td class="s1-note">' + esc(r.note || '') + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    if (unverified.length) {
      h.push('<p class="s1-warn">标注「未验证」的 break 路线不参与排序，按原始顺序置于末尾。</p>');
    }
    host.innerHTML = h.join('');
  }

  // Durations that may be missing (route did not finish) render as an explicit
  // "超时/未完成" marker instead of 00:00:00.
  function fmtUnfinished(sec) {
    if (sec == null) return '<span class="s1-unfinished">超时/未完成</span>';
    return '<b>' + fmtHMS(sec) + '</b>';
  }

  // ── candidate routes ──────────────────────────────────────────────────
  function renderCandidates() {
    var host = $('s1Candidates');
    if (!host) return;
    var list = FLOW && FLOW.candidates;
    if (!list || !list.length) { host.innerHTML = empty('候选路线未生成'); return; }
    var h = ['<div class="scroll"><table><thead><tr>',
      '<th>路线</th><th>总耗时</th><th>C9 耗时</th><th>筹备耗时</th><th>库存 IP</th><th>boostCap</th><th>galaxyCap</th>',
      '</tr></thead><tbody>'];
    list.forEach(function (r) {
      // r.seconds is the full-route total time; null ⇒ route did not finish.
      var prep = (r.preparationSeconds == null)
        ? '<span class="s1-mute">—</span>' : fmtHMS(r.preparationSeconds);
      h.push('<tr><td>' + esc(r.name) + '</td>',
        '<td>' + fmtUnfinished(r.seconds) + '</td>',
        '<td>' + fmtUnfinished(r.c9Seconds) + '</td>',
        '<td>' + prep + '</td>',
        '<td>' + esc(r.stock) + '</td>',
        '<td>' + esc(r.boostCap) + '</td>',
        '<td>' + esc(r.galaxyCap) + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    host.innerHTML = h.join('');
  }

  // ── selected route header ─────────────────────────────────────────────
  function renderSelectedHeader() {
    var name = $('s1SelectedName');
    var meta = $('s1SelectedMeta');
    var sel = FLOW && FLOW.selected;
    if (name) name.textContent = sel && sel.name ? sel.name : '（未生成）';
    if (!meta) return;
    if (!sel) { meta.textContent = ''; return; }
    var parts = [];
    if (sel.seconds != null) parts.push('估计总耗时 ' + fmtHMS(sel.seconds));
    if (sel.c9Seconds != null) parts.push('C9 耗时 ' + fmtHMS(sel.c9Seconds));
    meta.textContent = parts.join('　·　');
  }

  // ── operation table ───────────────────────────────────────────────────
  // Expands a preparation/purchase row's per-round farm log (row.farmRuns).
  // Each entry is { seconds, boostCap, galaxyCap, ipBefore, infinity } from the
  // real simulation — rendered as-is, with no fabricated values.
  function renderFarmRuns(runs) {
    var body = runs.map(function (run, k) {
      return '<tr><td>' + (k + 1) + '</td><td>' + fmtHMS(run.seconds) + '</td><td>' +
        esc(run.boostCap) + '</td><td>' + esc(run.galaxyCap) + '</td><td>' +
        esc(run.ipBefore) + '</td><td>' + esc(run.infinity) + '</td></tr>';
    }).join('');
    return '<details class="s1-farm"><summary>查看 ' + runs.length + ' 轮筹备明细</summary>' +
      '<div class="scroll"><table><thead><tr><th>#</th><th>逐轮用时</th><th>提升上限</th>' +
      '<th>星系上限</th><th>IP 起点</th><th>无限次数</th></tr></thead><tbody>' +
      body + '</tbody></table></div></details>';
  }

  function renderFlow() {
    var host = $('s1Flow');
    if (!host) return;
    var sel = FLOW && FLOW.selected;
    if (!sel || !sel.rows || !sel.rows.length) { host.innerHTML = empty('操作表未生成'); return; }

    // Wait cell shows the integer diff of adjacent rounded cumulative seconds,
    // so the displayed waits sum back to the displayed total. Tooltip keeps the
    // raw (possibly fractional) wait seconds from the data.
    var h = ['<div class="scroll tall"><table><thead><tr>',
      '<th>#</th><th>操作流程</th><th>购买项目</th><th>数量</th>',
      '<th>等待时间</th><th>累计时间</th><th>剩余IP</th>',
      '</tr></thead><tbody>'];
    var prevCum = 0;
    sel.rows.forEach(function (r, i) {
      var cum = roundSec(r.cumulative);
      var dispWait = cum - prevCum;
      prevCum = cum;
      var text = (r.action || '') + ' ' + (r.item || '') + ' ' + (r.quantity || '');
      var itemCell = esc(r.item);
      if (r.farmRuns && r.farmRuns.length) itemCell += renderFarmRuns(r.farmRuns);
      h.push('<tr data-text="' + esc(text.toLowerCase()) + '"><td>' + (i + 1) + '</td><td>' + esc(r.action) + '</td><td>' + itemCell + '</td><td>' + esc(r.quantity) + '</td><td title="原始等待 ' + fmtNum(r.wait) + ' 秒">' + fmtHMS(dispWait) + '</td><td><b>' + fmtHMS(cum) + '</b></td><td>' + esc(r.ip) + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    host.innerHTML = h.join('');
  }

  // Hide rows whose data-text does not contain the filter query.
  function wireFilter() {
    var inp = $('s1FlowFilter');
    var host = $('s1Flow');
    if (!inp || !host) return;
    inp.addEventListener('input', function () {
      var q = inp.value.trim().toLowerCase();
      var trs = host.getElementsByTagName('tr');
      for (var i = 0; i < trs.length; i++) {
        var dt = trs[i].getAttribute('data-text');
        if (dt === null) continue; // header row has no data-text
        trs[i].style.display = (!q || dt.indexOf(q) >= 0) ? '' : 'none';
      }
    });
  }

  // ── IU grid (from S1SIM, not from data contract) ──────────────────────
  function renderIU() {
    var host = $('s1IU');
    if (!host) return;
    if (!SIM || !SIM.IU || !SIM.IU.length) { host.innerHTML = empty('IU 网格未生成'); return; }
    var h = ['<div class="scroll"><table><thead><tr>',
      '<th>编号</th><th>位置</th><th>成本</th><th>名称</th><th>效果（源码）</th><th>前置</th>',
      '</tr></thead><tbody>'];
    SIM.IU.forEach(function (u) {
      h.push('<tr><td><b>' + esc(u.key) + '</b></td>',
        '<td>第 ' + u.row + ' 行 第 ' + u.col + ' 列</td>',
        '<td>' + fmtNum(u.cost) + ' IP</td>',
        '<td>' + esc(u.name) + '</td>',
        '<td class="s1-note">' + esc(u.eff) + '</td>',
        '<td>' + (u.req ? esc(u.req) : '—') + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    host.innerHTML = h.join('');
  }

  // ── sensitivity ────────────────────────────────────────────────────────
  function renderSensitivity() {
    var host = $('s1Sensitivity');
    if (!host) return;
    var list = FLOW && FLOW.sensitivity;
    if (!list || !list.length) { host.innerHTML = empty('敏感性未生成'); return; }
    var h = ['<div class="scroll"><table><thead><tr>',
      '<th>步长 dt</th><th>结果</th><th>耗时</th>',
      '</tr></thead><tbody>'];
    list.forEach(function (r) {
      var cls = r.ok ? 'verified' : 'unverified';
      var sec = (r.seconds == null) ? '<span class="s1-mute">—</span>' : '<b>' + fmtHMS(r.seconds) + '</b>';
      h.push('<tr><td><b>' + esc(r.dt) + '</b></td>',
        '<td><span class="s1-tag ' + cls + '">' + (r.ok ? '成功' : '超时') + '</span></td>',
        '<td>' + sec + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    host.innerHTML = h.join('');
  }

  // ── constants table (S1DATA.CONST) ─────────────────────────────────────
  // Kept for the formula page (stage2-formula.html) which reuses this renderer's
  // #s1const entry: it injects window.S1DATA.CONST directly. Guarded so it is a
  // no-op on pages (e.g. stage2-s1.html) that do not carry S1DATA / #s1const.
  function renderConst() {
    var el = $('s1const');
    if (!el) return;
    var D = global.S1DATA;
    if (!D || !D.CONST || !D.CONST.length) { el.innerHTML = empty('常数未生成'); return; }
    var h = ['<div class="scroll"><table><thead><tr><th style="width:130px">项目</th>' +
      '<th>公式 / 值</th><th style="width:210px">源码位置</th></tr></thead><tbody>'];
    D.CONST.forEach(function (r) {
      h.push('<tr><td><b>' + esc(r[0]) + '</b></td><td style="font-size:12px;line-height:1.7">' + r[1] +
        '</td><td style="color:var(--txt-mute);font-size:11px">' + esc(r[2]) + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    el.innerHTML = h.join('');
  }

  // ── C9 recompute button ───────────────────────────────────────────────
  function runC9Recompute(btn, out) {
    if (!SIM || typeof SIM.runInfinity !== 'function') {
      out.className = 'c9-result'; out.textContent = '未生成：S1SIM 不可用'; return;
    }
    var cfg = FLOW && FLOW.selected && FLOW.selected.c9Config;
    if (!cfg) { out.className = 'c9-result'; out.textContent = '未生成：selected.c9Config 缺失'; return; }

    btn.disabled = true;
    out.className = 'c9-result';
    out.textContent = '复算中…';
    // Defer the (blocking) run so "复算中" paints before it starts.
    setTimeout(function () {
      try {
        var res = SIM.runInfinity(cfg);
        if (res && res.ok) {
          out.className = 'c9-result ok';
          out.textContent = '复算成功：C9 通关用时 ' + fmtHMS(res.time) + '（模型估计，非实测）';
        } else {
          out.className = 'c9-result timeout';
          out.textContent = '复算超时：在设定上限内未通关（模型估计）';
        }
      } catch (err) {
        out.className = 'c9-result timeout';
        out.textContent = '复算出错：' + (err && err.message ? err.message : err);
      } finally {
        btn.disabled = false;
      }
    }, 0);
  }

  function wireC9() {
    var btn = $('s1RecomputeC9');
    var out = $('s1C9Result');
    if (!btn || !out) return;
    btn.addEventListener('click', function () { runC9Recompute(btn, out); });
  }

  // ── boot ──────────────────────────────────────────────────────────────
  function boot() {
    renderVersion();
    renderAssumptions();
    renderComparison();
    renderCandidates();
    renderSelectedHeader();
    renderFlow();
    wireFilter();
    renderIU();
    renderSensitivity();
    renderConst();
    wireC9();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
