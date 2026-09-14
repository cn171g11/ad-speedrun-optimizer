/* ============================================================================
 * 对数空间大数运算 (logmath.js)
 * ----------------------------------------------------------------------------
 * 为什么需要它：反物质维度打破无限后，反物质 / IP / 复制器都会远超
 * IEEE754 double 的上限 1.7976931348623157e308（例如 1e2000、1e30000）。
 * 游戏源码用的是 break_infinity.js（任意精度十进制）。
 *
 * 本文件用一个更轻的方案：**把所有量表示成 log10 的值（单个 double）**。
 *   · 乘法 = 加，除法 = 减，幂 = 乘，比较 = 比大小  —— 全部无精度损失
 *   · 加法用 log-sum-exp（10^a + 10^b = 10^(hi + log10(1 + 10^(lo-hi))))
 *   · 减法同理，差值极小时直接判零
 * 精度：log10 的绝对精度约 1e-16，对应相对精度约 2.3e-16，
 *       对"买不买得起"和"产量是多少"这类判断绰绰有余。
 *
 * 约定：0（以及任何"空"）表示为 -Infinity。
 * ============================================================================ */
(function (global) {
  'use strict';

  var NEG = -Infinity;
  var LOG10E = Math.LOG10E;          // 0.4342944819
  var LN10 = Math.LN10;

  /** log10(10^a + 10^b) */
  function ladd(a, b) {
    if (a === NEG) return b;
    if (b === NEG) return a;
    var hi = a > b ? a : b, lo = a > b ? b : a;
    var d = lo - hi;
    if (d < -17) return hi;                       // 小于精度，忽略
    return hi + Math.log10(1 + Math.pow(10, d));
  }

  /** log10(10^a - 10^b)，要求 a >= b；结果 <= 0 时返回 -Infinity */
  function lsub(a, b) {
    if (b === NEG) return a;
    if (a === NEG) return NEG;
    var d = b - a;
    if (d < -17) return a;
    var r = 1 - Math.pow(10, d);
    if (r <= 0) return NEG;
    return a + Math.log10(r);
  }

  /** log10(10^a × 10^b) */
  function lmul(a, b) { return (a === NEG || b === NEG) ? NEG : a + b; }
  /** log10(10^a / 10^b) */
  function ldiv(a, b) { return (a === NEG) ? NEG : (b === NEG ? Infinity : a - b); }
  /** log10(10^a × k)  k 为普通正数 */
  function lscale(a, k) { return (a === NEG || k <= 0) ? NEG : a + Math.log10(k); }
  /** log10(10^a ^ k) = a × k */
  function lpow(a, k) { return (a === NEG) ? NEG : a * k; }
  /** 普通数 -> log10 */
  function fromNum(x) { return x > 0 ? Math.log10(x) : NEG; }
  /** log10 -> 普通数（可能溢出成 Infinity，用于展示大小时用 log 形式） */
  function toNum(a) { return a === NEG ? 0 : Math.pow(10, a); }
  /** 比较：a>b 返回正 */
  function lcmp(a, b) { return a - b; }

  /** 求和一组 log 值 */
  function lsum(arr) {
    var s = NEG;
    for (var i = 0; i < arr.length; i++) s = ladd(s, arr[i]);
    return s;
  }

  /** 把 log 值格式化成 "1.23e456" 或 "1234" */
  function lformat(a, digits) {
    if (a === NEG) return '0';
    if (!isFinite(a)) return '∞';
    digits = digits === undefined ? 3 : digits;
    if (a < 6) {                                  // 小于 1e6 直接显示
      var v = Math.pow(10, a);
      return v >= 1000 ? v.toFixed(0) : v.toPrecision(digits);
    }
    var e = Math.floor(a);
    var m = Math.pow(10, a - e);
    return m.toFixed(2) + 'e' + e;
  }

  /** 把 log 值写成 {m, e} 便于任意精度输出 */
  function lsplit(a) {
    if (a === NEG || !isFinite(a)) return null;
    var e = Math.floor(a);
    return { m: Math.pow(10, a - e), e: e };
  }

  /** 指数增长：每 1 单位时间乘 (1+c)，求从 a 涨到 target 需要的时间 */
  function ltimeToGrow(a, target, logGrowthPerSec) {
    if (logGrowthPerSec <= 0) return Infinity;
    return (target - a) / logGrowthPerSec;
  }

  global.LM = {
    NEG: NEG, LOG10E: LOG10E, LN10: LN10,
    ladd: ladd, lsub: lsub, lmul: lmul, ldiv: ldiv, lscale: lscale, lpow: lpow,
    fromNum: fromNum, toNum: toNum, lcmp: lcmp, lsum: lsum,
    lformat: lformat, lsplit: lsplit, ltimeToGrow: ltimeToGrow,
    /** 数值自检用：把 log 值转成 JS 数（用于小数值场景） */
    debug: function (a) { return a; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
