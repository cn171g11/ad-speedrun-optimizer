/* ============================================================================
 * 第二阶段页面 · 逐 tick 仿真结果渲染 (stage2sim.js)
 * ============================================================================ */
(function () {
  'use strict';
  var R = window.SIMRESULTS;
  var $ = function (id) { return document.getElementById(id); };
  if (!R) return;

  function srcTag(cls, txt) {
    return '<span class="src ' + cls + '">' + txt + '</span>';
  }

  // ---- A. 已验证正确的部分 ----
  var h = ['<h3 style="font-size:13px;color:var(--gold);margin:20px 0 8px">A. 逐项验证通过的部分</h3>'];
  h.push('<table><thead><tr><th>项目</th><th>对拍内容</th><th>结果</th></tr></thead><tbody>');
  R.VERIFIED.forEach(function (v) {
    h.push('<tr><td>' + v.name + '</td><td class="dim">' + v.detail + '<br>' + v.note +
      '</td><td class="ok" style="white-space:nowrap">' + (v.ok ? '✓ 通过' : '✗') + '</td></tr>');
  });
  h.push('</tbody></table>');
  $('simVerified').innerHTML = h.join('');

  // ---- B. 拟合对拍 ----
  var f = R.FIT;
  var g = ['<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">B. 拟合对拍 —— 与参考站存档逐事件比较</h3>'];
  g.push('<p style="font-size:12.5px;color:var(--txt-dim)">对拍目标：' + f.target +
    '<br>参考成绩：' + f.reference + '</p>');
  g.push('<table><thead><tr><th>事件</th><th>参考 (s)</th><th>仿真 (s)</th><th>比值</th><th></th></tr></thead><tbody>');
  f.rows.forEach(function (r) {
    var ratio = r.sim / r.ref;
    var bar = Math.min(100, ratio * 50);
    g.push('<tr><td>' + r.event + '</td><td>' + r.ref.toFixed(2) + '</td><td>' + r.sim.toFixed(2) +
      '</td><td style="color:' + (ratio > 1.15 ? '#ff9d9d' : (ratio < 0.9 ? '#9ff0c0' : '#ffd700')) + '">' +
      ratio.toFixed(2) + '×</td><td style="width:120px"><span style="display:inline-block;height:8px;border-radius:4px;' +
      'background:linear-gradient(90deg,#58a6ff,#8a5cff);width:' + bar.toFixed(0) + '%"></span></td></tr>');
  });
  g.push('</tbody></table>');
  g.push('<div class="warn" style="margin-top:12px"><b>拟合结论：' + f.verdict + '</b>（主拟合指标 —— 完成时间比 <b>' +
    f.completionRatio + '×</b>）<br>' + f.reason +
    '<br><br>早期事件比参考快 3 倍，是因为我在仿真里给的基础成就倍率偏高（多算了 3 个整行加成）；' +
    '而 <b>dim4 的买入时机比参考晚</b>（参考 275 s 买第 1 个，仿真约 480 s）—— dim4 是整条级联的引擎，' +
    '晚买会被后面所有阶段放大，最终完成时间晚 1.71 倍。</div>');
  $('simFit').innerHTML = g.join('');

  // ---- C. 完整流程仿真进展 ----
  var u = R.FULLRUN;
  var p = ['<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">C. 完整流程仿真的实际进展</h3>'];
  p.push('<div class="kpis" style="margin-bottom:12px">' +
    kpi('跑到游戏时间', u.reachedGameTime, '之后墙钟超时') +
    kpi('无限次数', u.infinities, '已买 8 次提升 / 2 个星系') +
    kpi('当前 IP', u.ip, '距离打破无限还差 3e4') +
    kpi('达成里程碑', u.reachedMilestones.length + ' / 8', '只有「首次无限」') +
    '</div>');
  p.push('<p style="font-size:12.5px;color:var(--txt-dim)"><b>卡在：</b>' + u.blockedAt + '</p>');
  p.push('<p style="font-size:12.5px;color:var(--txt-dim)"><b>原因（已定位）：</b></p><ul>');
  u.rootCauses.forEach(function (c) { p.push('<li style="font-size:12.5px;color:var(--txt-dim)">' + c + '</li>'); });
  p.push('</ul>');
  $('simFull').innerHTML = p.join('');

  function kpi(k, v, s) {
    return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  }

  // ---- D. 过程中修掉的真实 bug ----
  var b = ['<h3 style="font-size:13px;color:var(--gold);margin:22px 0 8px">D. 逐 tick 仿真过程中修掉的真实 bug</h3>'];
  b.push('<p style="font-size:12.5px;color:var(--txt-mute)">这些都是靠「与外部数据对不上」才暴露出来的，' +
    '也正是这次强行逐 tick 计算的收获 —— 单看公式是发现不了的。</p>');
  b.push('<table><thead><tr><th>bug</th><th>现象</th><th>修法</th></tr></thead><tbody>');
  R.BUGS.forEach(function (x) {
    b.push('<tr><td style="color:#ff9d9d;white-space:nowrap">' + x.bug + '</td><td class="dim">' + x.detail +
      '</td><td style="color:#9ff0c0">' + x.fix + '</td></tr>');
  });
  b.push('</tbody></table>');
  $('simBugs').innerHTML = b.join('');
})();
