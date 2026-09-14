/* ============================================================================
 * AD Speedrun Optimizer — 「速通操作表」标签页 (runtab.js)
 * 把参考优化器的每阶段最优动作序列拼成一条完整的速通流水，
 * 并提供「追踪模式」：按空格逐步推进，直接照着按游戏里的按钮即可。
 * ============================================================================ */
(function () {
  'use strict';
  var RunPlan = window.RunPlan;
  var $ = function (id) { return document.getElementById(id); };
  var S = { platform: 'pc', stage: 0, plan: null, trace: false, cursor: 0 };

  // ---------------------------------------------------------------- 工具
  function hms(sec) {
    if (!isFinite(sec)) return '—';
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(Math.floor(s)).padStart(2, '0');
    return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0');
  }
  function tickText() {
    return S.platform === 'mobile' ? 'tick 25ms + 维度×2 加成' : 'tick 33ms，无广告加成';
  }
  function human(sec) {
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
    return (h ? h + ' 小时 ' : '') + (h || m ? m + ' 分 ' : '') + s + ' 秒';
  }
  function num(x) {
    if (x === 0) return '0';
    if (!isFinite(x)) return 'inf';
    if (x >= 1e6 || x < 1e-3) return x.toExponential(2).replace('e+', 'e');
    return String(Math.round(x * 100) / 100);
  }
  function itemTag(item) {
    if (item === 9) return '<span class="tag sac">维度献祭</span>';
    if (item === 0) return '<span class="tag tick">计数频率</span>';
    return '<span class="tag boost">第 ' + item + ' 维度</span>';
  }
  function itemPlain(item) {
    if (item === 9) return '点「维度献祭」';
    if (item === 0) return '买计数频率升级';
    return '买第 ' + item + ' 维度';
  }

  // ---------------------------------------------------------------- 渲染
  function rebuild() {
    S.plan = RunPlan.build(S.platform);
    S.stage = 0; S.cursor = 0;
    renderAll();
  }

  function renderAll() {
    var p = S.plan;
    if (!p.playable) {
      $('rt_kpis').innerHTML = '<span class="bad">缺少该平台的数据。</span>';
      return;
    }
    var pub = RunPlan.PUBLISHED[S.platform];
    $('rt_kpis').innerHTML = '<div class="kpis">' +
      kpi('理论最快总用时', hms(p.total), human(p.total) + ' → 首次大坍缩') +
      kpi('阶段数', p.stages.length, '维度提升 / 星系 / 冲无限') +
      kpi('操作步数', p.actionCount, '已按同价合并') +
      kpi('参考站公布', hms(pub.total), ((p.total / pub.total - 1) * 100).toFixed(2) + '% 偏差') +
      kpi('平台', RunPlan.PUBLISHED[S.platform].label, tickText()) +
      '</div>';

    // 阶段列表
    var rows = ['<thead><tr><th>#</th><th>阶段</th><th>目标</th><th>耗时</th><th>起止</th></tr></thead><tbody>'];
    p.stages.forEach(function (st, i) {
      var kindTag = st.kind === 'galaxy' ? '<span class="tag galaxy">买星系</span>'
        : (st.kind === 'infinity' ? '<span class="tag inf">冲无限</span>' : '<span class="tag boost">提升</span>');
      rows.push('<tr data-si="' + i + '" class="stage-row' + (i === S.stage ? ' sel' : '') + '">' +
        '<td class="dim">' + (i + 1) + '</td>' +
        '<td>' + st.g + ' 星系 · 第 ' + (st.b + 1) + ' 次 ' + kindTag + (st.sac ? ' <span class="tag sac">献祭</span>' : '') + '</td>' +
        '<td class="dim">' + st.goalText + '</td>' +
        '<td>' + hms(st.time) + '</td>' +
        '<td class="dim">' + hms(st.start) + ' → ' + hms(st.end) + '</td></tr>');
    });
    rows.push('</tbody>');
    $('rt_stageTable').innerHTML = rows.join('');
    Array.prototype.forEach.call($('rt_stageTable').querySelectorAll('.stage-row'), function (tr) {
      tr.addEventListener('click', function () {
        S.stage = parseInt(tr.dataset.si, 10);
        S.cursor = 0;
        renderAll();
      });
    });

    renderStageDetail();
    renderTimeline();

    $('rt_prev').disabled = S.stage <= 0;
    $('rt_next').disabled = S.stage >= p.stages.length - 1;
  }

  function kpi(k, v, s) {
    return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="s">' + s + '</div></div>';
  }

  function renderStageDetail() {
    var p = S.plan, st = p.stages[S.stage];
    if (!st) return;
    $('rt_stageTitle').innerHTML = '阶段 ' + (S.stage + 1) + ' / ' + p.stages.length +
      '　·　' + st.g + ' 星系 / 第 ' + (st.b + 1) + ' 次维度提升' +
      (st.sac ? '（使用献祭）' : '');
    $('rt_stageGoal').innerHTML = st.goalText +
      '　<span class="dim">本阶段耗时 ' + hms(st.time) + '，全局限时 ' + hms(st.start) + ' → ' + hms(st.end) + '</span>';

    var rows = ['<thead><tr><th>#</th><th>全局时刻</th><th>本阶段</th><th>操作</th><th>数量</th><th>累计</th><th>单价</th><th>本次总花费</th></tr></thead><tbody>'];
    var total = 0;
    st.actions.forEach(function (a, i) {
      var item = a[0], n = a[1], cost = a[2], t = a[3];
      if (item !== 9) total += n; else total = total;
      var cum = 0;
      for (var k = 0; k <= i; k++) if (st.actions[k][0] === item) cum += st.actions[k][1];
      var isCur = S.trace && i === S.cursor;
      rows.push('<tr data-ai="' + i + '" class="act-row' + (isCur ? ' cur' : '') + '">' +
        '<td class="dim">' + (i + 1) + '</td>' +
        '<td>' + hms(st.start + t) + '</td>' +
        '<td class="dim">' + hms(t) + '</td>' +
        '<td>' + itemTag(item) + '</td>' +
        '<td>' + n + '</td>' +
        '<td class="dim">' + (item === 9 ? '—' : cum) + '</td>' +
        '<td>' + (item === 9 ? ('×' + cost.toFixed(2)) : num(cost)) + '</td>' +
        '<td>' + (item === 9 ? '第 8 维度倍率 ×' + cost.toFixed(2) : num(cost * n)) + '</td></tr>');
    });
    rows.push('</tbody>');
    var tbl = $('rt_actTable');
    tbl.innerHTML = rows.join('');
    Array.prototype.forEach.call(tbl.querySelectorAll('.act-row'), function (tr) {
      tr.addEventListener('click', function () {
        S.cursor = parseInt(tr.dataset.ai, 10);
        S.trace = true;
        renderTrace();
        highlight();
      });
    });
    renderTrace();
    highlight();
  }

  function highlight() {
    var tbl = $('rt_actTable');
    if (!tbl) return;
    var cur = tbl.querySelector('.act-row.cur');
    if (S.trace) {
      Array.prototype.forEach.call(tbl.querySelectorAll('.act-row'), function (tr) { tr.classList.remove('cur'); });
      var tr = tbl.querySelector('.act-row[data-ai="' + S.cursor + '"]');
      if (tr) {
        tr.classList.add('cur');
        if (tr.scrollIntoView) tr.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

  function renderTrace() {
    var p = S.plan, st = p.stages[S.stage];
    if (!st) return;
    if (!S.trace) {
      $('rt_now').innerHTML = '<div class="now-idle">点击「开始追踪」后，按 <kbd>空格</kbd> 逐步推进；也可以直接点表格里的任意一行跳到那一步。</div>';
      return;
    }
    var a = st.actions[S.cursor];
    if (!a) {
      $('rt_now').innerHTML = '<div class="now-idle">本阶段已执行完，按空格进入下一阶段。</div>';
      return;
    }
    $('rt_now').innerHTML =
      '<div class="now-step">第 ' + (S.cursor + 1) + ' / ' + st.actions.length + ' 步</div>' +
      '<div class="now-act">' + itemPlain(a[0]) + (a[0] === 9 ? '' : ' × <b>' + a[1] + '</b>') + '</div>' +
      '<div class="now-meta">全局时刻 <b>' + hms(st.start + a[3]) + '</b>　·　' +
      (a[0] === 9 ? ('第 8 维度倍率 ×' + a[2].toFixed(2)) : ('单价 ' + num(a[2]) + '，共 ' + num(a[2] * a[1]))) + '</div>';
  }

  function renderTimeline() {
    var p = S.plan;
    var maxT = p.total || 1;
    var html = ['<div class="tl-row total"><span class="tl-name">总计</span>' +
      '<span class="tl-track"><span class="tl-fill" style="width:100%"></span></span>' +
      '<span class="tl-val">' + hms(p.total) + '</span></div>'];
    var acc = 0;
    p.stages.forEach(function (st) {
      var w = st.time / maxT * 100;
      var left = acc / maxT * 100;
      acc += st.time;
      var cls = st.kind === 'galaxy' ? 'fill-gal' : (st.kind === 'infinity' ? 'fill-inf' : '');
      html.push('<div class="tl-row"><span class="tl-name">' + hms(st.start) + ' 提升' + (st.b + 1) + '</span>' +
        '<span class="tl-track"><span class="tl-fill ' + cls + '" style="margin-left:' + left.toFixed(3) + '%;width:' + w.toFixed(3) + '%"></span></span>' +
        '<span class="tl-val">' + hms(st.time) + '</span></div>');
    });
    var el = $('rt_timeline');
    el.className = 'timeline';
    el.innerHTML = html.join('');
  }

  // ---------------------------------------------------------------- 交互
  $('rt_platform').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-btn');
    if (!b) return;
    Array.prototype.forEach.call($('rt_platform').querySelectorAll('.seg-btn'), function (x) { x.classList.remove('active'); });
    b.classList.add('active');
    S.platform = b.dataset.val;
    rebuild();
  });

  $('rt_prev').addEventListener('click', function () {
    if (S.stage > 0) { S.stage--; S.cursor = 0; renderAll(); }
  });
  $('rt_next').addEventListener('click', function () {
    if (S.stage < S.plan.stages.length - 1) { S.stage++; S.cursor = 0; renderAll(); }
  });
  $('rt_trace').addEventListener('click', function () {
    S.trace = !S.trace;
    this.textContent = S.trace ? '停止追踪' : '开始追踪（按空格推进）';
    this.classList.toggle('on', S.trace);
    renderStageDetail();
  });

  document.addEventListener('keydown', function (e) {
    if (!S.trace) return;
    if (e.code !== 'Space') return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    var st = S.plan.stages[S.stage];
    if (!st) return;
    if (S.cursor < st.actions.length - 1) {
      S.cursor++;
      renderTrace(); highlight();
    } else if (S.stage < S.plan.stages.length - 1) {
      S.stage++; S.cursor = 0; renderAll();
    }
  });

  $('rt_copy').addEventListener('click', function () {
    var st = S.plan.stages[S.stage];
    if (!st) return;
    var lines = ['阶段 ' + (S.stage + 1) + '  ' + st.g + ' 星系 / 第 ' + (st.b + 1) + ' 次维度提升',
      '目标：' + st.goalText.replace(/<[^>]+>/g, ''), ''];
    st.actions.forEach(function (a, i) {
      lines.push([
        String(i + 1).padStart(3),
        hms(st.start + a[3]).padStart(9),
        itemPlain(a[0]),
        a[0] === 9 ? ('x' + a[2].toFixed(2)) : ('x' + a[1]),
        a[0] === 9 ? '' : ('单价 ' + num(a[2]))
      ].join('\t'));
    });
    var txt = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () {
        $('rt_copy').textContent = '已复制 ✓';
        setTimeout(function () { $('rt_copy').textContent = '复制本阶段操作表'; }, 1500);
      });
    } else {
      window.prompt('复制以下内容：', txt);
    }
  });

  rebuild();
})();
