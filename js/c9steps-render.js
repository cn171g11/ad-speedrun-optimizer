/* S1 段分步操作表渲染 (c9steps-render.js) */
(function () {
  'use strict';
  var D = window.C9STEPS;
  var $ = function (id) { return document.getElementById(id); };
  if (!D || !$('c9steps')) return;

  // 1) 分步操作表（按分组）
  var h = [];
  D.GROUPS.forEach(function (grp) {
    var rows = D.STEPS.filter(function (s) { return s.g === grp.g; });
    if (!rows.length) return;
    h.push('<h3 style="font-size:13px;color:' + grp.color + ';margin:22px 0 8px">' + grp.name + '</h3>');
    h.push('<table><thead><tr><th>#</th><th>时刻</th><th>操作</th><th>为什么这么做</th></tr></thead><tbody>');
    rows.forEach(function (s) {
      h.push('<tr><td class="dim">' + s.n + '</td><td style="white-space:nowrap;color:var(--txt-mute)">' + s.t +
        '</td><td style="color:#dcecff"><b>' + s.act + '</b></td><td class="dim">' + s.why + '</td></tr>');
    });
    h.push('</tbody></table>');
  });
  $('c9steps').innerHTML = h.join('');

  // 2) 单次无限耗时阶梯
  var g = ['<table><thead><tr><th>阶段</th><th>单次无限耗时</th><th>备注</th></tr></thead><tbody>'];
  D.LADDER.forEach(function (r) {
    g.push('<tr><td>' + r.after + '</td><td style="color:var(--gold);white-space:nowrap">' + r.time +
      '</td><td class="dim">' + (r.ip || '—') + '</td></tr>');
  });
  g.push('</tbody></table>');
  $('c9ladder').innerHTML = g.join('');

  // 3) 无限升级清单
  var k = ['<table><thead><tr><th>升级</th><th>成本</th><th>效果</th><th>什么时候买</th></tr></thead><tbody>'];
  D.IU.forEach(function (u) {
    k.push('<tr><td style="color:#9dcaff;white-space:nowrap">' + u.key + '</td><td>' + u.cost + ' IP</td><td class="dim">' +
      u.effect + '</td><td style="color:var(--txt-mute)">' + u.when + '</td></tr>');
  });
  k.push('</tbody></table>');
  $('c9iu').innerHTML = k.join('');

  // 4) 普通挑战一览
  var m = ['<table><thead><tr><th>#</th><th>名称</th><th>解锁</th><th>限制条件</th><th>打法要点</th></tr></thead><tbody>'];
  D.NC.forEach(function (c) {
    var hi = c.id === 9 ? ' style="background:rgba(255,215,0,.08)"' : '';
    m.push('<tr' + hi + '><td class="dim">C' + c.id + '</td><td style="white-space:nowrap">' + c.name + '</td><td>' +
      (c.lock === 0 ? '<span class="tag boost">开局</span>' : '<span class="tag inf">16 次无限</span>') +
      '</td><td class="dim">' + c.desc + '</td><td style="color:#9ff0c0">' + c.tip + '</td></tr>');
  });
  m.push('</tbody></table>');
  $('c9nc').innerHTML = m.join('');
})();
