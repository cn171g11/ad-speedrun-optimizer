/* ============================================================================
 * S1 段渲染（s1render.js）
 *   · 静态部分：数据来自 js/s1data.js
 *   · 动态部分：页面直接加载 model.js + s1sim.js，可以现场跑逐 tick 仿真，
 *     输出「这一次无限里的每一笔购买」（买什么维度、第几次提升、第几个星系）
 * ============================================================================ */
(function (global) {
  'use strict';
  var D = global.S1DATA;
  var $ = function (id) { return document.getElementById(id); };
  var t = function (s) { return s; };

  function fmtNum(x) {
    if (!isFinite(x)) return '∞';
    if (x >= 1e6 || x < 1e-3) return x.toExponential(2).replace('e+', 'e');
    return String(Math.round(x * 1000) / 1000);
  }
  function fmtT(sec) {
    if (sec < 60) return sec.toFixed(1) + ' 秒';
    if (sec < 3600) return (sec / 60).toFixed(2) + ' 分钟';
    return (sec / 3600).toFixed(3) + ' 小时';
  }

  // ── 分步操作表 ────────────────────────────────────────────────────────
  function renderSteps() {
    var el = $('s1steps'); if (!el) return;
    var h = [];
    D.GROUPS.forEach(function (g) {
      h.push('<h3 style="font-size:13px;color:' + g.color + ';margin:22px 0 10px;' +
        'border-left:3px solid ' + g.color + ';padding-left:9px">' + g.name + '</h3>');
      h.push('<div class="scroll tall"><table><thead><tr>' +
        '<th style="width:34px">#</th><th style="width:26%">做什么</th>' +
        '<th style="width:24%">买什么（逐笔）</th><th style="width:11%">成本</th><th>为什么</th>' +
        '</tr></thead><tbody>');
      D.STEPS.filter(function (s) { return s.g === g.g; }).forEach(function (s) {
        h.push('<tr><td><b>' + s.n + '</b></td><td>' + s.act + '</td>' +
          '<td style="color:#9dcaff">' + s.buy + '</td>' +
          '<td style="color:var(--gold)">' + s.cost + '</td>' +
          '<td style="color:var(--txt-dim);font-size:12px">' + s.why + '</td></tr>');
      });
      h.push('</tbody></table></div>');
    });
    el.innerHTML = h.join('');
  }

  // ── 无限升级网格 ─────────────────────────────────────────────────────
  function renderIU() {
    var el = $('s1iu'); if (!el) return;
    var h = ['<div class="scroll"><table><thead><tr><th>编号</th><th>位置</th><th>成本</th>' +
      '<th>名称</th><th>效果（源码）</th><th>前置</th><th>攻略时机</th></tr></thead><tbody>'];
    D.IU_GRID.forEach(function (u) {
      h.push('<tr><td><b>' + u.key + '</b></td><td>第 ' + u.row + ' 行 第 ' + u.col + ' 列</td>' +
        '<td style="color:var(--gold)">' + u.cost + ' IP</td><td>' + u.name + '</td>' +
        '<td style="color:#9dcaff;font-size:12px">' + u.eff + '</td>' +
        '<td>' + (u.req || '—') + '</td>' +
        '<td style="color:var(--txt-dim);font-size:12px">' + u.why + '</td></tr>');
    });
    h.push('</tbody></table></div>' +
      '<p class="hint">网格结构来自 <code>InfinityUpgradesTab.vue</code> 的 <code>grid</code> 定义，' +
      '源码注释写明「同一列内必须自上而下购买」。攻略正文用的是「第 x 行第 y 列」，与上表编号一一对应。</p>');
    el.innerHTML = h.join('');
  }

  // ── 阶梯表 ────────────────────────────────────────────────────────────
  function renderLadder() {
    var el = $('s1ladder'); if (!el) return;
    var h = ['<div class="scroll"><table><thead><tr><th>配置</th><th>仿真 dt=1/30</th>' +
      '<th>仿真 dt=1/60</th><th>攻略实测</th><th>偏差</th><th>说明</th></tr></thead><tbody>'];
    D.LADDER.forEach(function (r) {
      var dev = r.guide ? (r.dt30 / r.guide) : null;
      var cls = dev === null ? 'var(--txt-mute)' :
        (dev < 1.6 && dev > 0.6 ? '#7ee787' : (dev < 3 && dev > 0.33 ? '#ffd700' : '#ff9d3d'));
      h.push('<tr><td>' + r.name + '</td>' +
        '<td><b>' + fmtT(r.dt30) + '</b></td><td>' + fmtT(r.dt60) + '</td>' +
        '<td>' + (r.guide ? fmtT(r.guide) : '—') + '</td>' +
        '<td style="color:' + cls + '">' + (dev === null ? '—' : dev.toFixed(2) + '×') + '</td>' +
        '<td style="color:var(--txt-dim);font-size:12px">' + r.note + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    el.innerHTML = h.join('');
  }

  // ── 全流程时间线 ─────────────────────────────────────────────────────
  function renderTimeline() {
    var el = $('s1timeline'); if (!el) return;
    var h = ['<div class="scroll"><table><thead><tr><th>第几次无限</th><th>本次买入</th>' +
      '<th>本跑用时</th><th>累计</th><th>手上 IP</th></tr></thead><tbody>'];
    D.TIMELINE.forEach(function (r) {
      h.push('<tr><td>' + r.n + '</td><td style="color:#9dcaff">' + r.buy + '</td>' +
        '<td>' + r.time + '</td><td><b>' + r.cum + '</b></td><td>' + r.ip + '</td></tr>');
    });
    h.push('</tbody></table></div>' +
      '<div class="warn" style="margin-top:12px">上面这张表是<b>仿真跑出来的</b>（正常无限路线，dt=1/30）。' +
      '它只到第 5 次无限就停了 —— 因为第 6 次开始攻略要求进 C8 刷，而<b>我的 C8 模型攻不下来</b>（见下方未解问题）。' +
      '所以「1 IP → C9」的<b>总时长我给不出可信数字</b>：前 5 次 5.58 小时是算出来的，之后的部分是攻略实测值。</div>');
    el.innerHTML = h.join('');
  }

  // ── 常数表 ────────────────────────────────────────────────────────────
  function renderConst() {
    var el = $('s1const'); if (!el) return;
    var h = ['<div class="scroll"><table><thead><tr><th style="width:130px">项目</th>' +
      '<th>公式 / 值</th><th style="width:210px">源码位置</th></tr></thead><tbody>'];
    D.CONST.forEach(function (r) {
      h.push('<tr><td><b>' + r[0] + '</b></td><td style="font-size:12px;line-height:1.7">' + r[1] + '</td>' +
        '<td style="color:var(--txt-mute);font-size:11px">' + r[2] + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    el.innerHTML = h.join('');
  }

  // ── 未解问题 ─────────────────────────────────────────────────────────
  function renderOpen() {
    var el = $('s1open'); if (!el) return;
    var h = [];
    D.OPEN.forEach(function (o) {
      h.push('<div class="warn" style="margin-bottom:10px"><b>' + o.t + '</b><br>' + o.d + '</div>');
    });
    el.innerHTML = h.join('');
  }

  // ── 现场逐 tick 仿真 + 逐笔购买日志 ──────────────────────────────────
  var STAGES = [
    { k: 's1', label: 'IU11（第 2 次无限）', iu: ['IU11'], ip: 1, ach: 1 },
    { k: 's2', label: '+IU12', iu: ['IU11', 'IU12'], ip: 2, ach: 1 },
    { k: 's3', label: '+21,22,31,32,41,42', iu: ['IU11', 'IU12', 'IU21', 'IU22', 'IU31', 'IU32', 'IU41', 'IU42'], ip: 8, ach: 2 },
    { k: 's4', label: '+13,23,33', iu: ['IU11', 'IU12', 'IU13', 'IU21', 'IU22', 'IU23', 'IU31', 'IU32', 'IU33', 'IU41', 'IU42'], ip: 15, ach: 2 },
    { k: 's5', label: '+IU14（20 IP）', iu: ['IU11', 'IU12', 'IU13', 'IU21', 'IU22', 'IU23', 'IU31', 'IU32', 'IU33', 'IU41', 'IU42', 'IU14'], ip: 20, ach: 3 },
    { k: 's6', label: '+IU24（40 IP）', iu: ['IU11', 'IU12', 'IU13', 'IU21', 'IU22', 'IU23', 'IU31', 'IU32', 'IU33', 'IU41', 'IU42', 'IU14', 'IU24'], ip: 40, ach: 3 },
    { k: 's7', label: '+IU34（80 IP）', iu: ['IU11', 'IU12', 'IU13', 'IU21', 'IU22', 'IU23', 'IU31', 'IU32', 'IU33', 'IU41', 'IU42', 'IU14', 'IU24', 'IU34'], ip: 80, ach: 3 },
    { k: 's8', label: '+IU44（300 IP）', iu: ['IU11', 'IU12', 'IU13', 'IU21', 'IU22', 'IU23', 'IU31', 'IU32', 'IU33', 'IU41', 'IU42', 'IU14', 'IU24', 'IU34', 'IU43', 'IU44'], ip: 300, ach: 3 },
    { k: 'c9', label: '★ C9 本体（挑战 9）', iu: ['IU11', 'IU12', 'IU13', 'IU21', 'IU22', 'IU23', 'IU31', 'IU32', 'IU33', 'IU41', 'IU42', 'IU14', 'IU24', 'IU34', 'IU43', 'IU44'], ip: 300, ach: 3, ch: 9 },
    { k: 'c8', label: 'C8 本体（挑战 8）', iu: ['IU11', 'IU12', 'IU21', 'IU22', 'IU31', 'IU32', 'IU41', 'IU42'], ip: 8, ach: 2, ch: 8 }
  ];
  function achFor(lvl) {
    var S = global.S1SIM;
    if (lvl === 1) return S.achSet(2, [31, 32, 35, 42, 44, 46, 54]);
    if (lvl === 2) return S.achSet(4, [54, 61, 66, 68]);
    return S.achSet(6, [54, 61, 62, 63, 64, 65, 66, 67, 68, 74, 75, 76, 77, 78]);
  }
  function runOne(stageKey, dt, wantLog) {
    var S = global.S1SIM;
    if (!S) return null;
    var st = null;
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === stageKey) st = STAGES[i];
    if (!st) return null;
    var set = {}; st.iu.forEach(function (k) { set[k] = true; });
    var r = S.runInfinity({
      iuSet: set, challenge: st.ch || 0, infinities: st.ip, ip: st.ip, ipMult: 1,
      galaxyCap: (st.ch === 8 || st.ch === 10) ? 0 : 'inf',
      maxSeconds: 3 * 3600, dt: dt, logDetail: wantLog ? 'full' : 'none',
      achOverride: achFor(st.ach)
    });
    return r;
  }
  function renderLive() {
    var el = $('s1live'); if (!el) return;
    if (!global.S1SIM) {
      el.innerHTML = '<div class="warn">仿真器脚本未加载（js/model.js + js/s1sim.js）</div>';
      return;
    }
    var h = ['<div class="grid" style="grid-template-columns:1fr 1fr 1fr">' +
      '<div><label class="sub">配置</label><select id="lv_stage">'];
    STAGES.forEach(function (s) { h.push('<option value="' + s.k + '">' + s.label + '</option>'); });
    h.push('</select></div>' +
      '<div><label class="sub">步长（游戏帧间隔）</label><select id="lv_dt">' +
      '<option value="0.0333">1/30 秒（游戏默认 33ms）</option>' +
      '<option value="0.0167">1/60 秒</option>' +
      '<option value="0.1">0.1 秒（手速慢）</option></select></div>' +
      '<div><label class="sub">输出</label><button class="btn" id="lv_go">跑一次仿真</button></div>' +
      '</div><div id="lv_out"></div>');
    el.innerHTML = h.join('');
    var go = $('lv_go');
    if (go) go.addEventListener('click', function () {
      var key = $('lv_stage').value, dt = parseFloat($('lv_dt').value);
      var out = $('lv_out');
      out.innerHTML = '<p class="hint">跑仿真中…（长跑可能要几秒）</p>';
      setTimeout(function () {
        var st = null;
        STAGES.forEach(function (s) { if (s.k === key) st = s; });
        var r = runOne(key, dt, true);
        if (!r) { out.innerHTML = '<div class="warn">失败</div>'; return; }
        var buyArr = [];
        r.log.forEach(function (l) {
          buyArr.push('  ' + (l.t).toFixed(1).padStart(7) + ' s  ' + l.text +
            (l.extra ? '　（' + l.extra.replace(/<[^>]+>/g, '') + '）' : ''));
        });
        out.innerHTML =
          '<div class="out" style="margin-top:14px;line-height:2">' +
          '<div><span class="k">配置　　</span><b>' + st.label + '</b>　步长 ' + dt.toFixed(4) + ' s</div>' +
          '<div><span class="k">结果　　</span>' + (r.ok ? '<b style="color:#7ee787">达成 1.797e308 AM</b>' : '<b style="color:#ff9b9b">未达成</b>') +
          '　用时 <b>' + fmtT(r.time) + '</b>　IP +' + r.ipGained + '</div>' +
          '<div><span class="k">终点状态</span>提升 ' + r.boosts + ' 次　星系 ' + r.galaxies +
          ' 个　计数频率 ' + r.ticks + ' 次　献祭 ' + r.sacCount + ' 次</div>' +
          '<div><span class="k">维度已购</span>[' + r.bought.slice(1).join(', ') + ']</div>' +
          '</div>' +
          '<h3 style="font-size:13px;color:var(--gold);margin:18px 0 8px">逐笔购买日志（共 ' + r.log.length + ' 条）</h3>' +
          '<pre class="logbox">' + (buyArr.join('\n') || '（无）') + '</pre>';
      }, 30);
    });
  }

  function boot() {
    renderSteps(); renderIU(); renderLadder(); renderTimeline();
    renderConst(); renderOpen(); renderLive();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
