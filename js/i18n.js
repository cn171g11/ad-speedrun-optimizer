/* ============================================================================
 * i18n.js —— 全站双语引擎（中文为作者原稿，英文由 zh_en.js 字典 + 规则直译）
 * ----------------------------------------------------------------------------
 * 机制：
 *   1. 默认中文（HTML/JS 里本来就是中文）。
 *   2. 切到 EN：先用「数字模式规则」翻译带序数/数字的模式，再用「字典」最长匹配
 *      翻译剩余中文；对整棵 DOM 的文本节点 + title/placeholder/aria-label/alt 生效。
 *   3. MutationObserver 捕获后续异步渲染（表格、仿真结果等）并即时翻译。
 *   4. 切回中文：直接 reload 复位到作者原稿（100% 无损）。
 * 依赖：先加载 js/zh_en.js（定义 window.ZH_EN 字典）。
 * ============================================================================ */
(function () {
  'use strict';

  var LS_KEY = 'adspeedrun_lang';
  var DICT = (typeof window !== 'undefined' && window.ZH_EN) || {};

  // ── 数字模式规则（在字典之前执行，避免「第 N 维度 / 第 N 步」歧义）───────
  // 每条 { re: RegExp(全局), fn: function(match, g1, g2...) -> string }
  var RULES = [
    { re: /首次买入第\s*(\d+)\s*维度（(\d+)\s*个）/g,  fn: function (m, a, b) { return 'first buy dim ' + a + ' (' + b + ')'; } },
    { re: /需要\s*第\s*(\d+)\s*维\s*≥\s*(\S+)/g,       fn: function (m, a, b) { return 'need dim ' + a + ' \u2265 ' + b; } },
    { re: /第\s*(\d+)\s*维度自动购买器/g,               fn: function (m, a) { return 'dim ' + a + ' autobuyer'; } },
    { re: /奖励：第\s*(\d+)\s*维度自动购买器/g,          fn: function (m, a) { return 'reward: dim ' + a + ' autobuyer'; } },
    { re: /第\s*(\d+)\s*个维度/g,                       fn: function (m, a) { return 'dimension #' + a; } },
    { re: /第\s*(\d+)\s*维度/g,                         fn: function (m, a) { return 'dimension ' + a; } },
    { re: /第\s*(\d+)\s*次大坍缩/g,                     fn: function (m, a) { return 'big crunch #' + a; } },
    { re: /第\s*(\d+)\s*次无限/g,                       fn: function (m, a) { return 'infinity #' + a; } },
    { re: /第\s*(\d+)\s*次维度提升/g,                   fn: function (m, a) { return 'dimension boost #' + a; } },
    { re: /第\s*(\d+)\s*跑/g,                           fn: function (m, a) { return 'run #' + a; } },
    { re: /第\s*(\d+)\s*个星系/g,                       fn: function (m, a) { return 'galaxy #' + a; } },
    { re: /第\s*(\d+)\s*步/g,                           fn: function (m, a) { return 'step ' + a; } },
    { re: /通关\s*C\s*(\d+)/g,                          fn: function (m, a) { return 'clear C' + a; } },
    { re: /第\s*(\d+)\s*行第\s*(\d+)\s*列/g,            fn: function (m, a, b) { return 'row ' + a + ' col ' + b; } },
  ];
  var UNIT = { '分钟': 'min', '小时': 'h', '秒': 's' };

  function applyRules(s) {
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r.re.test(s)) { s = s.replace(r.re, r.fn); }
    }
    return s;
  }

  // ── 字典（最长匹配优先，避免短 token 先吃掉长词）────────────────────
  var KEYS = Object.keys(DICT).sort(function (a, b) { return b.length - a.length; });

  function applyDict(s) {
    if (!/[\u4e00-\u9fa5]/.test(s)) return s;
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (s.indexOf(k) >= 0) {
        s = s.split(k).join(DICT[k]);
        if (!/[\u4e00-\u9fa5]/.test(s)) break;
      }
    }
    return s;
  }

  function translateString(s) {
    if (!s || !/[\u4e00-\u9fa5]/.test(s)) return s;
    // 先字典（最长匹配，保留完整短语），再规则（补数字模式）
    var a = applyDict(s);
    return applyRules(a);
  }

  // ── DOM 遍历 ────────────────────────────────────────────────────────
  function translateTextNode(node) {
    if (node.nodeType !== 3) return;
    var v = node.nodeValue;
    if (!v || !/[\u4e00-\u9fa5]/.test(v)) return;
    var t = translateString(v);
    if (t !== v) node.nodeValue = t;
  }

  var ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  function translateAttrs(el) {
    if (!el || !el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      var v = el.getAttribute(a);
      if (v && /[\u4e00-\u9fa5]/.test(v)) el.setAttribute(a, translateString(v));
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateTextNode(root); return; }
    if (root.nodeType !== 1) return;
    translateAttrs(root);
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) translateAttrs(all[i]);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var n;
    while ((n = w.nextNode())) translateTextNode(n);
  }

  // ── 切换 ────────────────────────────────────────────────────────────
  var en = false;
  function isEn() { return en; }

  function setEn(on) {
    if (on && !en) {
      en = true;
      document.documentElement.lang = 'en';
      walk(document.body);
      updateBtn();
    } else if (!on && en) {
      // 回中文：reload 复位到原稿
      try { localStorage.setItem(LS_KEY, 'zh'); } catch (e) {}
      location.reload();
    }
  }

  function updateBtn() {
    var b = document.getElementById('langToggle');
    if (b) b.textContent = en ? '中文' : 'EN';
  }

  function injectToggle() {
    if (document.getElementById('langToggle')) return;
    var b = document.createElement('button');
    b.id = 'langToggle';
    b.type = 'button';
    b.textContent = 'EN';
    b.title = '切换语言 / Switch language';
    b.setAttribute('aria-label', '切换语言 / Switch language');
    b.onclick = function () { setEn(!en); };
    b.style.cssText = 'position:fixed;top:14px;right:14px;z-index:9999;padding:6px 13px;border-radius:9px;cursor:pointer;border:1px solid #3a4758;background:#14202e;color:#dbe7f3;font-size:13px;font-weight:600;font-family:inherit;letter-spacing:.5px;box-shadow:0 2px 10px rgba(0,0,0,.35);';
    b.addEventListener('mouseenter', function () { b.style.background = '#1d2d40'; });
    b.addEventListener('mouseleave', function () { b.style.background = '#14202e'; });
    document.body.appendChild(b);
  }

  // ── 启动 ────────────────────────────────────────────────────────────
  function boot() {
    injectToggle();
    var want = false;
    try { want = localStorage.getItem(LS_KEY) === 'en'; } catch (e) {}
    if (want) {
      en = true;
      document.documentElement.lang = 'en';
      walk(document.body);
      updateBtn();
    }
    // 捕获后续动态渲染
    if (window.MutationObserver) {
      var mo = new MutationObserver(function (muts) {
        if (!en) return;
        for (var i = 0; i < muts.length; i++) {
          var added = muts[i].addedNodes;
          for (var j = 0; added && j < added.length; j++) {
            var nd = added[j];
            if (nd.nodeType === 3) translateTextNode(nd);
            else if (nd.nodeType === 1) walk(nd);
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
    // 兜底：晚到的同步渲染再刷两轮
    setTimeout(function () { if (en) walk(document.body); }, 250);
    setTimeout(function () { if (en) walk(document.body); }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
