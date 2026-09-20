/* 全站统一导航 */
(function () {
  'use strict';
  var PAGES = [
    { href: './index.html',          label: '🏠 总入口',        desc: '四个阶段的总览' },
    { href: './stage1.html',         label: 'Ⅰ 首次无限',      desc: '第一阶段：逐 tick 最短路' },
    { href: './stage2.html',         label: 'Ⅱ 阶段总览',      desc: '首次无限 → 首次永恒' },
    { href: './stage2-s1.html',      label: 'Ⅱ-S1 操作表',     desc: '1 IP → C9：手动/自动/时机' },
    { href: './stage2-break.html',    label: 'Ⅱ-Break 基线',    desc: 'Break → ID1 → C9：对数域边界' },
    { href: './stage2-sim.html',     label: 'Ⅱ-仿真',          desc: '对数空间逐 tick' },
    { href: './stage2-formula.html', label: 'Ⅱ-公式',          desc: '常数与边界' },
    { href: './stage3.html',         label: 'Ⅲ 永恒 → Cel7',   desc: '永恒/现实/天体 里程碑' },
    { href: './platform.html',       label: '🔀 平台差异',      desc: 'Web/Steam vs 安卓' },
    { href: './en.html',            label: '🌐 EN / 中文',   desc: 'English overview' }
  ];
  function boot() {
    var host = document.getElementById('subnav');
    if (!host) return;
    var here = location.pathname.split('/').pop() || 'index.html';
    var isEn = here === 'en.html';
    if (isEn) PAGES[PAGES.length - 1] = { href: './index.html', label: '中文', desc: '中文总入口' };
    host.innerHTML = PAGES.map(function (p) {
      var f = p.href.replace('./', '');
      return '<a class="' + (f === here ? 'active' : '') + '" href="' + p.href + '">' + p.label + '</a>';
    }).join('');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
