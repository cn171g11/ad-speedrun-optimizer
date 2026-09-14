/* ============================================================================
 * 第二阶段页面逻辑 (stage2.js)
 * ============================================================================ */
(function () {
  'use strict';
  var S2 = window.Stage2, F = S2.F;
  var $ = function (id) { return document.getElementById(id); };

  function fmtTime(sec) {
    if (!isFinite(sec)) return '—';
    if (sec < 60) return sec.toFixed(1) + ' 秒';
    if (sec < 3600) return (sec / 60).toFixed(1) + ' 分钟';
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h + ' 小时 ' + m + ' 分';
  }
  function num(x) {
    if (!isFinite(x)) return '∞';
    if (x === 0) return '0';
    if (x >= 1e6 || x < 1e-3) return x.toExponential(2).replace('e+', 'e');
    return String(Math.round(x * 100) / 100);
  }
  function parseNum(str) {
    var s = String(str).trim();
    var m = /^([\d.]+)\s*e\s*([+-]?\d+)$/i.exec(s);
    if (m) return parseFloat(m[1]) * Math.pow(10, parseInt(m[2], 10));
    return parseFloat(s) || 0;
  }
  var SRC = { formula: '公式计算', guide: '攻略实测', derived: '推算' };

  // ------------------------------------------------------------- 总览
  var tl = S2.timeline();
  $('overview').innerHTML = '<div class="kpis">' +
    kpi('本阶段总时长（估算）', fmtTime(tl.total - 3600) + ' ~ ' + fmtTime(tl.total + 7200), '首次无限 → 首次永恒') +
    kpi('分段数', tl.rows.length, '对应官方里程碑 4~10') +
    kpi('最长的一段', '复制器时间墙', '3~8 小时（最不确定）') +
    kpi('起点时间', '第一阶段终点', 'PC 7:10:27 / 安卓 3:35:05') +
    '</div>';

  $('verifyNote').innerHTML =
    '<b>一个重要的交叉验证：</b>speedrun.com 上这个游戏的前两个 level 分别有世界纪录 —— ' +
    '<b>Dimension Boost 19m44s</b>、<b>Galaxy 4h07m58s</b>。' +
    '而本工具第一阶段用完全独立的方法（逆向公式 + 阶段图最短路）算出的对应成绩是 ' +
    '<b>18m50s</b> 与 <b>4h07m27s</b>，误差在 5% 以内。' +
    '说明这套模型给出的数字是真实可跑的，不是纸面推算。<br>' +
    '而 <b>Infinity 及其之后的所有 level 在 speedrun.com 上都是空的（0 runs）</b> —— ' +
    '也就是说下面这份流程与时间，目前没有公开记录可以对照。';

  function kpi(k, v, s) {
    return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  }

  // ------------------------------------------------------------- 里程碑表
  var sel = 0;
  function renderMs() {
    var rows = ['<thead><tr><th>#</th><th>里程碑</th><th>SR.com level</th><th>IP 区间</th><th>耗时</th><th>起止</th><th>来源</th></tr></thead><tbody>'];
    tl.rows.forEach(function (r, i) {
      var off = r.official ? (' <span class="tag boost">官方 #' + r.official + '</span>') : '';
      rows.push('<tr class="ms-row' + (i === sel ? ' sel' : '') + '" data-i="' + i + '">' +
        '<td class="dim">' + (i + 1) + '</td>' +
        '<td><b>' + r.short + '</b>' + off + '</td>' +
        '<td class="dim">' + r.sr + '</td>' +
        '<td>' + r.range + '</td>' +
        '<td>' + (r.time ? fmtTime(r.time) : '—') + '</td>' +
        '<td class="dim">' + fmtTime(r.start) + ' → ' + fmtTime(r.end) + '</td>' +
        '<td><span class="src ' + r.timeSource + '">' + SRC[r.timeSource] + '</span></td></tr>');
    });
    rows.push('</tbody>');
    $('msTable').innerHTML = rows.join('');
    Array.prototype.forEach.call($('msTable').querySelectorAll('.ms-row'), function (tr) {
      tr.addEventListener('click', function () { sel = parseInt(tr.dataset.i, 10); renderMs(); });
    });
    renderDetail();
  }

  function renderDetail() {
    var r = tl.rows[sel];
    var h = ['<div class="ms-detail">'];
    h.push('<h4>' + r.short + '　·　' + r.name + '</h4>');
    h.push('<div style="font-size:12.5px;color:var(--txt-dim);margin-bottom:8px">' +
      '<b style="color:var(--gold)">目标：</b>' + r.goal + '<br><b>IP 区间：</b>' + r.range +
      '　<b>耗时：</b>' + r.timeText + '</div>');
    h.push('<p style="font-size:12.5px;color:var(--txt-dim);line-height:1.75">' + r.detail + '</p>');

    if (r.steps && r.steps.length) {
      h.push('<h4 style="margin-top:14px">最优操作流程</h4><ol>');
      r.steps.forEach(function (s) { h.push('<li>' + s + '</li>'); });
      h.push('</ol>');
    }
    if (r.icGoals) {
      h.push('<h4 style="margin-top:14px">无限挑战目标与奖励</h4><ul>');
      r.icGoals.forEach(function (g) {
        h.push('<li><b>IC' + g.id + '</b>　目标 ' + g.goal + ' AM　·　' + g.note + '</li>');
      });
      h.push('</ul>');
    }
    if (r.ipRates) {
      h.push('<h4 style="margin-top:14px">各档位的自动大坍缩阈值与实测 IP 速率</h4><ul>');
      r.ipRates.forEach(function (x) {
        h.push('<li>阈值 <b>' + num(x.threshold) + ' IP</b>　→　实测 <b>' + num(x.rate) + ' IP/分钟</b></li>');
      });
      h.push('</ul>');
    }
    if (r.anchors) {
      h.push('<h4 style="margin-top:14px">攻略给出的 ' + r.anchors.length + ' 个大坍缩 IP 锚点</h4>');
      h.push('<p style="font-size:12px;color:var(--txt-mute);word-break:break-all">' +
        r.anchors.map(function (a) { return num(a); }).join('　·　') + '</p>');
    }
    h.push('<div class="note"><b>时间依据：</b>' + r.note + '</div>');
    h.push('</div>');
    $('msDetail').innerHTML = h.join('');
  }

  // ------------------------------------------------------------- 计算器
  function calc1() {
    var am = parseNum($('c1_am').value);
    var mult = parseFloat($('c1_mult').value) || 1;
    var t = parseFloat($('c1_t').value) || 1;
    var ip = F.ipGain(am, mult);
    var ipm = ip / t * 60;
    $('c1_out').innerHTML =
      '<div><span class="k">单次无限收益　</span><b>' + num(ip) + ' IP</b></div>' +
      '<div><span class="k">每分钟收益　　</span><b>' + num(ipm) + ' IP/分钟</b></div>' +
      '<div><span class="k">每跨 1 个数量级</span><b>' + (ip > 0 ? fmtTime(ip * 9 / ipm * 60) : '—') + '</b>' +
        '（IP 涨 10 倍）</div>' +
      '<div><span class="k">每跨 10 个数量级</span><b>' + (ip > 0 ? fmtTime(ip * (1e10 - 1) / ipm * 60) : '—') + '</b></div>';
  }

  function calc2() {
    var ch = parseInt($('c2_ch').value, 10) || 0;
    var iv = parseInt($('c2_iv').value, 10) || 0;
    var tg = parseNum($('c2_tg').value);
    var chance = F.repChance(ch);
    var interval = F.repInterval(iv);
    var t = F.repTimeTo(tg, interval, chance);
    var perSec = 1 / interval;
    var rgTime = F.repTimeTo(1.7976931348623157e308, interval, chance);
    $('c2_out').innerHTML =
      '<div><span class="k">复制概率　　</span><b>' + (chance * 100).toFixed(0) + '%</b>（满 100%）</div>' +
      '<div><span class="k">复制间隔　　</span><b>' + interval.toFixed(0) + ' ms</b>（下限 50ms）</div>' +
      '<div><span class="k">每秒复制次数</span><b>' + perSec.toFixed(2) + '</b></div>' +
      '<div><span class="k">到目标数量需要</span><b>' + fmtTime(t) + '</b></div>' +
      '<div><span class="k">产 1 个复制器星系</span><b>' + fmtTime(rgTime) + '</b>（需 1.797e308 复制器）</div>' +
      '<div><span class="k">概率升级总花费</span>' + repCostText(ch, 'chance') + '</div>' +
      '<div><span class="k">间隔升级总花费</span>' + repCostText(iv, 'interval') + '</div>';
  }
  function repCostText(n, kind) {
    if (n <= 0) return ' 0';
    var c0 = kind === 'chance' ? S2.CONST.REP_CHANCE_COST0 : S2.CONST.REP_INTERVAL_COST0;
    var m = kind === 'chance' ? 1e15 : 1e10;
    // 在 log10 空间累加，避免 1e150 × 1e15^n 直接溢出成 Infinity
    var log10total = Math.log10(c0) + (n - 1) * Math.log10(m) + Math.log10(1 - Math.pow(m, -n)) - Math.log10(1 - 1 / m);
    var e = Math.floor(log10total);
    var mant = Math.pow(10, log10total - e);
    return ' <b>' + mant.toFixed(2) + 'e' + e + ' IP</b>';
  }

  function calc3() {
    var ip0 = parseNum($('c3_ip').value);
    var k = parseFloat($('c3_k').value) || 10;
    var t = parseFloat($('c3_t').value) || 180;
    var goal = S2.CONST.ETERNITY_IP;
    var n = F.crunchesTo(ip0, goal, k);
    $('c3_out').innerHTML =
      '<div><span class="k">还需要跨越　</span><b>' + (Math.log10(goal) - Math.log10(ip0)).toFixed(1) + ' 个数量级</b></div>' +
      '<div><span class="k">需要大坍缩　</span><b>' + (isFinite(n) ? Math.ceil(n) + ' 次' : '∞') + '</b></div>' +
      '<div><span class="k">预计总时长　</span><b>' + fmtTime(n * t) + '</b></div>' +
      '<div><span class="k">换算　　　　</span>' + (n * t / 3600).toFixed(2) + ' 小时</div>';
  }

  // ------------------------------------------------------------- 公式框
  var _fb = $('formulaBox');
  if (_fb) _fb.innerHTML = [
    '<div><b>IP 收益</b><br><span style="color:#a8d1ff">IP = floor(IPmult × 10^(log10(maxAM)/308 − 0.75))</span>' +
    '<br><span class="k">infinity-points.js；成就 103 / TS111 会把 308 改小</span></div>',
    '<div style="margin-top:10px"><b>无限维度</b><br>' +
    '<span class="k">基础价 </span><span style="color:#a8d1ff">1e8 / 1e9 / 1e10 / 1e20 / 1e140 / 1e200 / 1e250 / 1e280 IP</span><br>' +
    '<span class="k">涨价倍率 </span><span style="color:#a8d1ff">1e3 / 1e6 / 1e8 / 1e10 / 1e15 / 1e20 / 1e25 / 1e30</span></div>',
    '<div style="margin-top:10px"><b>复制器</b><br>' +
    '<span style="color:#a8d1ff">复制间隔 = max(50ms, 1000 × 0.9^n)</span><br>' +
    '<span style="color:#a8d1ff">复制概率 = min(100%, n × 1%)</span><br>' +
    '<span class="k">升级成本：概率 1e150 × 1e15^n，间隔 1e140 × 1e10^n（IP）</span><br>' +
    '<span style="color:#a8d1ff">到 1.797e308 复制器 → +1 复制器星系（复制器清零）</span></div>',
    '<div style="margin-top:10px"><b>永恒门槛</b><br><span style="color:#a8d1ff">1.8e308 IP</span>' +
    '<br><span class="k">requiredIPForEP(1)；攻略原文：「第一次永恒无需等 1e349 IP，只需要 1.8e308 IP」</span></div>'
  ].join('');

  // ------------------------------------------------------------- 边界说明
  var _lb = $('limitsBox');
  if (_lb) _lb.innerHTML = [
    '<b>1. 这不是完整仿真。</b>第一阶段（10 AM → 首次大坍缩）我做到了逐 tick 仿真 + 阶段图最短路；' +
    '第二阶段做不到，原因是打破无限后反物质会远超 IEEE754 double 的 1.8e308 上限，' +
    '要精确仿真必须引入任意精度十进制数（源码用的是 break_infinity.js）。本页的模型是<b>分段的解析/半解析模型</b>，不是逐帧模拟。',
    '<br><br><b>2. 时间数字的来源分三档，表格里都标了：</b>' +
    '<br>· <span class="src formula">公式计算</span>：里程碑本身不额外耗时（如「买 5e11 IP 升级」含在上一段内）' +
    '<br>· <span class="src guide">攻略实测</span>：攻略原文给出的时间（如「10 分钟左右」、单次无限 80s→45s→18s→10s→6s→1.5s）' +
    '<br>· <span class="src derived">推算</span>：用攻略标注的 IP/分钟速率对 IP 区间积分得到 —— 这部分是估算，误差可能达到 2 倍',
    '<br><br><b>3. 总时长 12 小时是数量级估计，不是最优值。</b>攻略本身没有给出从首次无限到首次永恒的总时长，' +
    '我把它拆成 8 段分别估算后求和。其中「复制器时间墙」和「打破无限」两段占了全部时间的 78%，' +
    '而这两段的估算最不确定。',
    '<br><br><b>4. 没有人验证过。</b>speedrun.com 上 Infinity 之后的 21 个 level 全部是 0 runs，' +
    '没有任何真人记录可以对照。第一阶段我能用「Galaxy 4h07m58s」这个世界纪录反验证模型，第二阶段没有这样的锚点。',
    '<br><br><b>5. 没有做的事：</b>本页只到「首次永恒」为止。永恒之后（时间研究树、永恒挑战 EC1~EC12、' +
    '时间膨胀、首次现实）需要另一套完全不同的模型（TT 增长、EC 时间限制、TP/DT 机制），不在本次范围内。'
  ].join('');

  // ------------------------------------------------------------- 绑定
  // 各页面只渲染自己需要的部分（拆页后同一脚本被多页引用）
  ['c1_am', 'c1_mult', 'c1_t'].forEach(function (id) {
    var el = $(id); if (el) el.addEventListener('input', calc1);
  });
  ['c2_ch', 'c2_iv', 'c2_tg'].forEach(function (id) {
    var el = $(id); if (el) el.addEventListener('input', calc2);
  });
  ['c3_ip', 'c3_k', 'c3_t'].forEach(function (id) {
    var el = $(id); if (el) el.addEventListener('input', calc3);
  });

  if ($('msTable')) renderMs();
  if ($('c1_out')) calc1();
  if ($('c2_out')) calc2();
  if ($('c3_out')) calc3();
})();
