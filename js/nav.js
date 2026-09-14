/* 分段导航（所有第二阶段页面共用） */
(function () {
  'use strict';
  var PAGES = [
    { href: './stage2.html',          label: '① 阶段总览', desc: '里程碑分段 + 计算器' },
    { href: './stage2-s1.html',       label: '② S1 · 1 IP → C9', desc: '分步操作 + 逐笔购买' },
    { href: './stage2-sim.html',      label: '③ 逐 tick 仿真', desc: '验证 / 拟合 / 卡点' },
    { href: './stage2-formula.html',  label: '④ 公式与边界', desc: '源码常数 + 诚实说明' },
    { href: './index.html',           label: '↩ 第一阶段', desc: '首次维度提升 → 首次无限' }
  ];
  function boot() {
    var host = document.getElementById('subnav');
    if (!host) return;
    var here = location.pathname.split('/').pop() || 'stage2.html';
    var h = '';
    PAGES.forEach(function (p) {
      var f = p.href.replace('./', '');
      h += '<a class="' + (f === here ? 'active' : '') + '" href="' + p.href + '">' + p.label + '</a>';
    });
    host.innerHTML = h;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
