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

  // ── 挑战起始时机 ──────────────────────────────────────────────────────
  function renderTiming() {
    var el = $('s1timing'); if (!el) return;
    var h = ['<div class="scroll"><table><thead><tr><th style="width:150px">项目</th>' +
      '<th>内容</th><th style="width:200px">源码位置</th></tr></thead><tbody>'];
    (D.TIMING_MECH || []).forEach(function (r) {
      h.push('<tr><td><b>' + r[0] + '</b></td><td style="font-size:12px;line-height:1.7">' + r[1] + '</td>' +
        '<td style="color:var(--txt-mute);font-size:11px">' + r[2] + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">C9：进挑战前先买几次 ID1？（扫描结果）</h3>');
    h.push('<div class="scroll"><table><thead><tr><th>ID1 已购</th><th>需要的 IP</th>' +
      '<th>筹备耗时</th><th>C9 耗时</th><th>总耗时</th><th>说明</th></tr></thead><tbody>');
    (D.TIMING_C9 || []).forEach(function (r) {
      h.push('<tr' + (r.best ? ' style="background:rgba(126,231,135,.10)"' : '') + '>' +
        '<td>' + r.id1 + ' 次</td>' +
        '<td>' + (r.need ? fmtNum(r.need) + ' IP' : '—') + '</td>' +
        '<td>' + fmtT(r.prep) + '</td>' +
        '<td>' + (r.chal === null ? '<span style="color:#ff9d9d">未达成</span>' : fmtT(r.chal)) + '</td>' +
        '<td><b>' + (r.total === null ? '—' : fmtT(r.total)) + '</b></td>' +
        '<td style="color:var(--txt-dim);font-size:12px">' + r.note + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">其它挑战：立刻进 vs 买 1 次 ID1 再进</h3>');
    h.push('<div class="scroll"><table><thead><tr><th>挑战</th><th>立刻进</th><th>买 1 次 ID1 再进</th>' +
      '<th>提速</th><th>说明</th></tr></thead><tbody>');
    (D.TIMING_OTHERS || []).forEach(function (r) {
      h.push('<tr><td><b>C' + r.ch + '</b></td><td>' + fmtT(r.now) + '</td>' +
        '<td style="color:#7ee787"><b>' + fmtT(r.withId1) + '</b></td>' +
        '<td>' + (r.now / r.withId1).toFixed(1) + '×</td>' +
        '<td style="color:var(--txt-dim);font-size:12px">' + r.note + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">打破无限前：要不要"先多刷几次再进"？（结论：基本不用）</h3>');
    h.push('<div class="scroll"><table><thead><tr><th>挑战</th><th>每次刷无限</th><th>立刻进</th>' +
      '<th>最优等待</th><th>最优总耗时</th><th>为什么</th></tr></thead><tbody>');
    (D.TIMING_PRE || []).forEach(function (r) {
      h.push('<tr><td><b>C' + r.ch + '</b></td><td>' + r.farm + ' 秒</td><td>' + fmtT(r.now) + '</td>' +
        '<td>' + (r.best === 0 ? '0 次（立刻进）' : r.best + ' 次') + '</td>' +
        '<td><b>' + fmtT(r.bestTime) + '</b></td>' +
        '<td style="color:var(--txt-dim);font-size:12px">' + r.why + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    el.innerHTML = h.join('');
  }

  // ── 现场扫描：挑战起始时机 ────────────────────────────────────────────
  function renderTimingLive() {
    var el = $('s1timinglive'); if (!el) return;
    if (!global.TIMING) {
      el.innerHTML = '<div class="warn">扫描器未加载（js/timing.js）</div>';
      return;
    }
    el.innerHTML = '<div class="grid" style="grid-template-columns:1fr 1fr 1fr 1fr">' +
      '<div><label class="sub">挑战</label><select id="tg_ch">' +
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function (c) {
        return '<option value="' + c + '"' + (c === 9 ? ' selected' : '') + '>C' + c + '</option>';
      }).join('') + '</select></div>' +
      '<div><label class="sub">起点 IP</label><input type="text" id="tg_ip" value="1e7" /></div>' +
      '<div><label class="sub">最多买几次 ID1</label><input type="number" id="tg_max" value="3" min="0" max="8" /></div>' +
      '<div><label class="sub">扫描</label><button class="btn" id="tg_go">开始扫描</button></div>' +
      '</div><div id="tg_out"></div>';
    var go = $('tg_go');
    if (!go) return;
    go.addEventListener('click', function () {
      var ch = parseInt($('tg_ch').value, 10);
      var ip0 = parseFloat($('tg_ip').value) || 1e7;
      var mx = parseInt($('tg_max').value, 10) || 0;
      var out = $('tg_out');
      out.innerHTML = '<p class="hint">扫描中…（每个档位都要跑一次挑战仿真）</p>';
      setTimeout(function () {
        var ALL = ['IU11','IU12','IU13','IU21','IU22','IU23','IU31','IU32','IU33','IU41','IU42',
                   'IU14','IU24','IU34','IU43','IU44'];
        var set = {}; ALL.forEach(function (k) { set[k] = true; });
        var ach = global.S1SIM.achSet(6, [54,61,62,63,64,65,66,67,68,74,75,76,77,78]);
        var sw = global.TIMING.sweepPostBreak({
          iuSet: set, challenge: ch, infinities: 1000, ipStart: ip0, ipMult: 16,
          ach: ach, minPrep: 0, maxPrep: mx, dt: 1 / 60, maxSeconds: 1800
        });
        var rows = sw.rows, best = null;
        rows.forEach(function (r) { if (r.total !== null && (best === null || r.total < best.total)) best = r; });
        var h = ['<div class="scroll" style="margin-top:12px"><table><thead><tr>' +
          '<th>ID1 已购</th><th>需要 IP</th><th>筹备</th><th>C' + ch + ' 耗时</th><th>总耗时</th></tr></thead><tbody>'];
        rows.forEach(function (r) {
          h.push('<tr' + (best && r === best ? ' style="background:rgba(126,231,135,.12)"' : '') + '>' +
            '<td>' + r.prep + ' 次</td><td>' + (r.ipNeed ? fmtNum(r.ipNeed) : '—') + '</td>' +
            '<td>' + fmtT(r.prepTime) + '</td>' +
            '<td>' + (r.chalTime === null ? '未达成' : (r.ok ? fmtT(r.chalTime) : fmtT(r.chalTime) + '（超时）')) + '</td>' +
            '<td><b>' + (r.total === null ? '—' : fmtT(r.total)) + '</b></td></tr>');
        });
        h.push('</tbody></table></div>');
        if (best) {
          h.push('<div class="ok-note" style="margin-top:12px">★ 最优：先攒到 <b>' + fmtNum(best.ipNeed) +
            ' IP</b>（筹备 ' + fmtT(best.prepTime) + '）买 <b>' + best.prep + ' 次 ID1</b>，再进 C' + ch +
            ' → 总耗时 <b>' + fmtT(best.total) + '</b></div>');
        }
        out.innerHTML = h.join('');
      }, 30);
    });
  }

  // ── 手动路线（1 IP 之后头几次大坍缩：还没有自动化）──────────────────────
  var KIND_LABEL = {
    start: ['开局', 'tag boost'], dim: ['维度', 'tag tick'], dim10: ['买满10', 'tag galaxy'],
    tick: ['计数频率', 'tag tick'], boost: ['维度提升', 'tag boost'],
    galaxy: ['星系', 'tag galaxy'], sac: ['献祭', 'tag sac'], crunch: ['大坍缩', 'tag inf']
  };
  var manSel = 0;

  function renderManual() {
    var el = $('s1manual'); if (!el) return;
    var runs = D.MANUAL_RUNS || [];
    var h = [];

    // 机制表
    h.push('<div class="scroll"><table><thead><tr><th style="width:150px">项目</th>' +
      '<th>内容</th><th style="width:210px">源码位置</th></tr></thead><tbody>');
    (D.MANUAL_MECH || []).forEach(function (r) {
      h.push('<tr><td><b>' + r[0] + '</b></td><td style="font-size:12px;line-height:1.7">' + r[1] + '</td>' +
        '<td style="color:var(--txt-mute);font-size:11px">' + r[2] + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    // 阶段表（同第一阶段格式）
    var cum = 0;
    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">阶段表（手动最优解）</h3>');
    h.push('<div class="ok-note">三次手动合计 <b>' + fmtT(D.MANUAL_TOTAL) + '</b>' +
      '（第 2 次 ' + fmtT(runs[0].time) + ' + 第 3 次 ' + fmtT(runs[1].time) +
      ' + 第 4 次 ' + fmtT(runs[2].time) + '）</div>');
    h.push('<div class="scroll" style="margin-top:10px"><table><thead><tr>' +
      '<th>#</th><th>阶段</th><th>已购无限升级</th><th>最优排程</th><th>耗时</th><th>起止</th>' +
      '</tr></thead><tbody>');
    runs.forEach(function (r, i) {
      var st = cum; cum += r.time;
      h.push('<tr><td class="dim">' + (i + 1) + '</td><td>' + r.label + '</td>' +
        '<td style="color:#9dcaff;font-size:11.5px">' + r.iu + '</td>' +
        '<td class="dim" style="font-size:11.5px">' + r.plan + '</td>' +
        '<td><b>' + fmtT(r.time) + '</b></td>' +
        '<td class="dim">' + fmtT(st) + ' → ' + fmtT(cum) + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    // 动作明细
    h.push('<h3 style="font-size:13px;color:var(--gold);margin:24px 0 8px">动作明细（点上面选一次，这里是"什么时机点什么"）</h3>');
    h.push('<div class="seg" style="margin-bottom:10px">' + runs.map(function (r, i) {
      return '<button class="seg-btn' + (i === manSel ? ' active' : '') + '" data-mrun="' + i + '">' +
        r.label + '（' + r.actions.length + ' 个动作）</button>';
    }).join('') + '</div>');
    var R = runs[manSel];
    if (R) {
      h.push('<p class="hint">' + R.label + '　·　' + R.plan + '　·　用时 <b>' + fmtT(R.time) +
        '</b>　·　维度提升 ' + R.boosts + ' 次 / 星系 ' + R.galaxies + ' 个 / 献祭 ' + R.sac + ' 次</p>');
      h.push('<div class="scroll tall"><table><thead><tr><th>#</th><th>时刻</th><th>距上次</th>' +
        '<th>操作</th><th>说明</th></tr></thead><tbody>');
      var prev = 0;
      R.actions.forEach(function (a, i) {
        var kl = KIND_LABEL[a[3]] || ['', ''];
        var gap = a[0] - prev; prev = a[0];
        h.push('<tr><td class="dim">' + (i + 1) + '</td>' +
          '<td><b>' + fmtT(a[0]) + '</b></td>' +
          '<td class="dim">' + (i === 0 ? '—' : fmtT(gap)) + '</td>' +
          '<td><span class="' + kl[1] + '">' + kl[0] + '</span> ' + a[1] + '</td>' +
          '<td class="dim" style="font-size:11.5px">' + a[2] + '</td></tr>');
      });
      h.push('</tbody></table></div>');
    }
    el.innerHTML = h.join('');
    Array.prototype.forEach.call(el.querySelectorAll('[data-mrun]'), function (b) {
      b.addEventListener('click', function () {
        manSel = parseInt(b.getAttribute('data-mrun'), 10);
        renderManual();
      });
    });
  }

  // ── 逐 tick 分析与机制修正（对照 4 份教程交叉比对）──────────────────────
  function renderTick() {
    var el = $('s1tick'); if (!el) return;
    var h = [];
    h.push('<h3 style="font-size:13px;color:var(--gold);margin:6px 0 8px">三处修正（教程交叉比对后改掉的）</h3>');
    h.push('<div class="scroll"><table><thead><tr><th style="width:120px">项目</th>' +
      '<th style="width:150px">我原来的做法</th><th>改正为</th><th style="width:230px">影响</th></tr></thead><tbody>');
    (D.TICK_FIX || []).forEach(function (r) {
      h.push('<tr><td><b>' + r[0] + '</b></td><td style="color:#ff9d9d">' + r[1] + '</td>' +
        '<td>' + r[2] + '</td><td class="dim" style="font-size:11.5px">' + r[3] + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">50ms 内部 tick 基准（真实）vs 33ms / 17ms</h3>');
    h.push('<div class="scroll"><table><thead><tr><th>阶段</th><th>dt=50ms（真实）</th>' +
      '<th>dt=33ms</th><th>dt=17ms</th></tr></thead><tbody>');
    (D.TICK_BASE || []).forEach(function (r) {
      h.push('<tr><td>' + r.name + '</td><td><b>' + fmtT(r.t50) + '</b></td>' +
        '<td>' + fmtT(r.t33) + '</td><td>' + fmtT(r.t17) + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">C8 修正结果（提升上限 5 + 献祭阈值扫描）</h3>');
    h.push('<div class="scroll"><table><thead><tr><th>状态</th><th>普通无限</th>' +
      '<th>C8 献祭阈值</th><th>C8 用时</th><th>献祭次数</th><th>结束献祭倍率</th></tr></thead><tbody>');
    (D.C8_FIX || []).forEach(function (g) {
      g.rows.forEach(function (r, i) {
        h.push('<tr>' + (i === 0 ? '<td rowspan="' + g.rows.length + '"><b>' + g.st +
          '</b><br><span class="dim" style="font-size:11.5px">普通无限 ' + fmtT(g.normal) + '</span></td>' : '') +
          '<td>' + (i === 0 ? fmtT(g.normal) : '') + '</td>' +
          '<td>nb ≥ ' + r[0] + '</td><td><b>' + fmtT(r[1]) + '</b></td>' +
          '<td>' + r[2] + '</td><td style="color:var(--gold)">' + r[3] + '</td></tr>');
      });
    });
    h.push('</tbody></table></div>');
    h.push('<div class="warn" style="margin-top:10px"><b>结论（诚实版）：</b>' +
      '修正后 C8 <b>可以打通了</b>（提升上限 5、献祭阈值 ≥8），而且结束时的献祭总倍率落在 <b>1.2e40</b>，' +
      '与攻略「献祭倍数到约 1e40 时停手」完全吻合 —— 机制完全对上了。' +
      '但在我的仿真里 C8 仍然比普通无限慢约 3~4 倍（43.7 分 vs 12.7 分）。' +
      '所以「挑战 8 比正常无限快」这句攻略断言，我<b>能把机制全部对齐，但仍无法复现「更快」</b>。' +
      '剩下的可能差异：攻略语境是"第一次无限之后"（那时普通无限要 7 小时），以及攻略靠<b>自动重试挑战</b>连续刷的吞吐量而非单跑时长。</div>');

    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">逐 tick 轨迹（第 4 次大坍缩，每 30 秒采样）</h3>');
    h.push('<p class="hint">看到"d1/d4/d8 归零、AM 掉回 5e5"就是一次献祭或维度提升；' +
      '倍率与产量每 30 秒跨好几个数量级，这就是"按住 Max"的级联效果。</p>');
    h.push('<div class="scroll tall"><table><thead><tr><th>t (秒)</th><th>AM</th><th>d1</th>' +
      '<th>d4</th><th>d8</th><th>计数频率</th><th>提升</th><th>星系</th><th>d1 倍率</th><th>d1 产量/s</th>' +
      '</tr></thead><tbody>');
    (D.TRACE || []).forEach(function (r) {
      h.push('<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] +
        '</td><td>' + r[4] + '</td><td>' + r[5] + '</td><td>' + r[6] + '</td><td>' + r[7] +
        '</td><td>' + r[8] + '</td><td>' + r[9] + '</td></tr>');
    });
    h.push('</tbody></table></div>');

    h.push('<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">教程交叉比对：之前遗漏的条目（已补进操作表）</h3>');
    h.push('<div class="scroll"><table><thead><tr><th style="width:250px">条目</th><th>内容</th>' +
      '<th style="width:130px">出处</th></tr></thead><tbody>');
    (D.TUT_MISSED || []).forEach(function (r) {
      h.push('<tr><td><b>' + r[0] + '</b></td><td style="font-size:12px;line-height:1.7">' + r[1] + '</td>' +
        '<td class="dim" style="font-size:11.5px">' + r[2] + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    el.innerHTML = h.join('');
  }

  function boot() {
    renderSteps(); renderIU(); renderLadder(); renderTimeline();
    renderConst(); renderOpen(); renderLive();
    renderTiming(); renderTimingLive(); renderManual(); renderTick();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
