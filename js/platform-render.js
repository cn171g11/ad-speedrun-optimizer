/* 平台差异页渲染（platform-render.js） */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function fmtT(sec) {
    if (sec === null || sec === undefined) return '—';
    if (sec < 60) return sec.toFixed(1) + ' 秒';
    if (sec < 3600) return (sec / 60).toFixed(2) + ' 分钟';
    return (sec / 3600).toFixed(3) + ' 小时';
  }
  function tb(rows, cols) {
    var h = ['<div class="scroll"><table><thead><tr>' +
      cols.map(function (c) { return '<th style="width:' + c[1] + '">' + c[0] + '</th>'; }).join('') +
      '</tr></thead><tbody>'];
    rows.forEach(function (r) {
      h.push('<tr>' + r.map(function (v) {
        return '<td style="font-size:12px;line-height:1.75">' + v + '</td>';
      }).join('') + '</tr>');
    });
    h.push('</tbody></table></div>');
    return h.join('');
  }
  function boot() {
    var P = global.PLATFORM; if (!P) return;
    var e = $('pfDiff');
    if (e) e.innerHTML = tb(P.DIFF, [['项目', '130px'], ['Web / Steam', ''], ['安卓', ''], ['出处', '150px']]);

    var e2 = $('pfStage1');
    if (e2) {
      var h = ['<div class="scroll"><table><thead><tr><th>阶段</th><th>Web/Steam（模型）</th>' +
        '<th>安卓（模型）</th><th>倍数</th><th>Web 世界纪录</th><th>Mobile(Ad) 世界纪录</th>' +
        '</tr></thead><tbody>'];
      var totPc = 0, totMb = 0;
      P.STAGE1.forEach(function (r) {
        totPc += r.pc; totMb += r.mobile;
        h.push('<tr><td>' + r.name + '</td><td><b>' + fmtT(r.pc) + '</b></td>' +
          '<td><b>' + fmtT(r.mobile) + '</b></td><td>' + (r.pc / r.mobile).toFixed(2) + '×</td>' +
          '<td>' + fmtT(r.wrWeb) + '</td><td>' + fmtT(r.wrMob) + '</td></tr>');
      });
      h.push('<tr style="background:rgba(126,231,135,.10)"><td><b>合计（到首次无限）</b></td>' +
        '<td><b>' + fmtT(totPc) + '</b></td><td><b>' + fmtT(totMb) + '</b></td>' +
        '<td>' + (totPc / totMb).toFixed(2) + '×</td><td>—</td><td>3.849 小时（WR）</td></tr>');
      h.push('</tbody></table></div>');
      h.push('<div class="ok-note" style="margin-top:10px">★ <b>Web 档：模型 4.124h vs 世界纪录 4h07m58s —— 误差 0.2%</b>；' +
        '安卓档：模型 2.062h vs Mobile(Ad) 记录 2h14m24s —— 模型快 8%。两平台的比值正好 <b>2.001×</b>。</div>');
      e2.innerHTML = h.join('');
    }

    var e3 = $('pfS1');
    if (e3) {
      var h3 = ['<div class="scroll"><table><thead><tr><th>配置</th><th>Web/Steam</th>' +
        '<th>安卓（无广告）</th><th>安卓（有广告）</th><th>攻略实测</th><th>攻略 vs 安卓无广告</th>' +
        '</tr></thead><tbody>'];
      P.S1_LADDER.forEach(function (r) {
        var cmp = '—';
        if (r.guide) cmp = (r.and / r.guide).toFixed(2) + '×';
        h3.push('<tr><td>' + r.name + '</td><td>' + fmtT(r.pc) + '</td>' +
          '<td><b>' + fmtT(r.and) + '</b></td><td>' + fmtT(r.andAd) + '</td>' +
          '<td style="color:var(--gold)">' + (r.guide ? fmtT(r.guide) : '—') + '</td>' +
          '<td>' + cmp + '</td></tr>');
      });
      h3.push('</tbody></table></div>');
      h3.push('<div class="warn" style="margin-top:10px">注意：攻略《安卓通关攻略》的阶梯（1分20秒/45秒/18秒/10秒/6秒）是<b>安卓档</b>的实测，' +
        '但和我的模型对不齐：+IU14 模型 45.5s vs 攻略 80s（模型快 1.76×）、+IU44 模型 13.2s vs 攻略 6s（模型慢 2.2×）。' +
        '而 <b>Web 档</b>在 IU14/IU24 两档反而更贴近攻略值（73.8s vs 80s、48.1s vs 45s）。' +
        '说明攻略作者那几档很可能不是在同一平台/同一成就状态下测的 —— 这也是为什么本站把三档都列出来，而不是只给一个数。</div>');
      e3.innerHTML = h3.join('');
    }

    var eS2 = $('pfS2');
    if (eS2) {
      var h = ['<div class="scroll"><table><thead><tr><th>段</th><th>Web/Steam</th>' +
        '<th>平台比值区间</th><th>安卓（无广告）估算</th><th>说明</th></tr></thead><tbody>'];
      var tp = 0, tl = 0, th = 0;
      (P.S2_EST || []).forEach(function (r) {
        tp += r.pc; tl += r.pc / r.ratio[0]; th += r.pc / r.ratio[1];
        h.push('<tr><td>' + r.seg + '</td><td><b>' + fmtT(r.pc) + '</b></td>' +
          '<td>' + r.ratio[0] + '~' + r.ratio[1] + '×</td>' +
          '<td>' + fmtT(r.pc / r.ratio[1]) + ' ~ ' + fmtT(r.pc / r.ratio[0]) + '</td>' +
          '<td class="dim" style="font-size:11.5px">' + r.note + '</td></tr>');
      });
      h.push('<tr style="background:rgba(126,231,135,.10)"><td><b>合计</b></td><td><b>' + fmtT(tp) +
        '</b></td><td>—</td><td><b>' + fmtT(tl) + ' ~ ' + fmtT(th) + '</b></td>' +
        '<td class="dim" style="font-size:11.5px">安卓有广告再 ÷1.5~1.8</td></tr>');
      h.push('</tbody></table></div>');
      h.push('<div class="warn" style="margin-top:10px">这一段是<b>区间估算</b>，不是逐 tick 重算 —— ' +
        '第二阶段后段（打破无限之后）反物质超出 double 上限，本站用的是分段解析模型（见第二阶段页的边界说明）。' +
        '平台换算基于第一阶段与 S1 实测出来的比值区间，逐段取不同值。</div>');
      eS2.innerHTML = h.join('');
    }

    var e4 = $('pfArb');
    if (e4) e4.innerHTML = tb(P.ARBITRATION, [['项目', '130px'], ['内容', '']]);
    var e5 = $('pfSens');
    if (e5) e5.innerHTML = tb(P.SENSITIVE, [['阶段', '190px'], ['平台敏感点', ''], ['量级', '']]);

    var e6 = $('pfOffline');
    if (e6) {
      var O = P.OFFLINE;
      var h6 = ['<div class="scroll"><table><thead><tr><th>项目</th><th>Web / Steam</th><th>安卓</th></tr></thead><tbody>'];
      h6.push('<tr><td>最大离线段数</td><td>' + O.web.maxTicks.toLocaleString() + ' 刻</td><td>' + O.mobile.maxTicks.toLocaleString() + ' 刻</td></tr>');
      h6.push('<tr><td>单刻最小长度</td><td>' + O.web.minTickMs + ' ms</td><td>' + O.mobile.minTickMs + ' ms</td></tr>');
      h6.push('<tr><td>算满一次的耗时</td><td>' + O.web.calcMinutes + ' 分钟</td><td>' + O.mobile.calcMinutes + ' 分钟</td></tr>');
      h6.push('<tr><td>单次离线上限</td><td>无明确上限</td><td><b>' + O.mobile.perSessionHours + ' 小时</b></td></tr>');
      h6.push('<tr><td>广告加成持续时间</td><td>—（无广告）</td><td>无魔法 ' + O.adBonus.noAds + ' 小时 / 有魔法 ' + O.adBonus.withProxy + ' 小时</td></tr>');
      h6.push('<tr><td>备注</td><td class="dim">' + O.web.note + '</td><td class="dim">' + O.mobile.note + '</td></tr>');
      h6.push('</tbody></table></div>');
      h6.push('<p class="hint">换算：安卓 100 万刻 × 50ms = 50,000 秒 ≈ <b>13.9 小时</b>的游戏内时间/次离线；' +
        '网页 50 万刻 × 50ms = 25,000 秒 ≈ 6.9 小时。也就是说<b>安卓一次离线能覆盖更长的游戏内时间</b>（13.9h vs 6.9h），' +
        '但计算耗时反而更短（7 分钟 vs 20 分钟）—— 挂机阶段这是实打实的优势。</p>');
      e6.innerHTML = h6.join('');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
