/* 第三阶段渲染（s3render.js） */
(function (global) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var ETERNITY = [
    ['第一次永恒的门槛', '<b>只需 1.8e308 IP，不是 1e349</b>（源码 requiredIPForEP(1)）。攻略原文：「第一次永恒无需等 1e349 IP，只需要 1.8e308 IP」', '《新人必看》三章'],
    ['永恒的入口条件', '先刷挑战时间与无限挑战时间：开「自动重试挑战」，禁自动维度提升与自动星系，开自动大坍缩，按住 M；目标把所有挑战时间刷到 <b>约 25 毫秒</b>', '同上'],
    ['EP 使用优先级', '<b>5 倍 EP 升级 &gt; 时间维度 &gt; 永恒升级 &gt; TT</b>', '同上'],
    ['前期时间研究树', '起步 <code>11-21-31-22</code>；购买用<b>深度优先</b>（先买更深的行）。<br>11 TT：<code>11,22,32,42</code>；40 TT：<code>11,22,32,42,51,61,72,82,92,102</code>；45 TT：<code>…71,81,91,101,111</code>；52 TT：换成 102 版；54 TT：加 122', '同上'],
    ['三条路径的取舍', '活跃（121,131,141）＝跑，要不停操作；被动（122,132,142）＝站，少操作但加成小；挂机（123,133,143）＝睡，需要长时间挂机才有大加成。<br>选挂机路径要<b>每 29 分 58.562 秒永恒一次</b>才优于活跃路径', '同上'],
    ['自动化的设置', '拿到 5 永恒里程碑后：自动大坍缩设成 <b>1e30~1e50 倍</b>；自动永恒设成"EP/min 刚过峰值时的 EP"（用永恒按钮上的 Peak at 数值）', '同上'],
    ['刷 EP / 刷 TT 的节奏', '轮流做：刷 EP（保证 EP/min 峰值）+ 刷 TT（长挂机）。这一段可能要一两个星期（与肝度、有无广告加成相关）', '同上'],
    ['时间维度的作用', '现在不能在没有时间维度的情况下购买时间定理 → 第一件事就是尽快拿时间维度加成', '同上'],
    ['里程碑 #11~#15 的位置', '#11 全部永恒里程碑（8 个）→ #12 第一个永恒挑战（EC1，需约 2 万次永恒）→ #13 EC10 → #14 第一次膨胀永恒 → #15 时间定理产出升级', '源码 speedrun-milestones.js']
  ];

  var REALITY = [
    ['里程碑骨架', '#16 首次现实 → #17 黑洞 → #18 全部现实升级 → #19 Teresa 的现实', '源码'],
    ['现实带来的新系统', '符文（Glyph，可装备并组合效果）、现实升级、黑洞、以及"机器/自动化"体系', '《现实更新攻略·第六版》'],
    ['这一段的攻略细节', '<b>尚未系统提取</b>：《现实更新攻略·第六版》有完整章节（约 21 万字符），本轮只用到它的序章。下一轮可以把 #16~#19 的每步操作逐条抄出来，格式同 S1 的操作表', '——']
  ];

  var CEL = [
    ['#19 Teresa', '第一个天体：用现实次数换取 Teresa 的记忆/升级，解锁"充能无限升级"等', '《Cel-7 永恒部分全解》'],
    ['#20 Effarig', '第二个天体：引入符文熔炉与"记忆碎片"体系', '同上'],
    ['#21 The Nameless Ones（Enslaved）', '第三个天体：以"被奴役现实"的机制推进，要求特定的挑战/研究组合', '同上'],
    ['#22 V（基础 V 成就）', '第四个天体：需要完成 36 个基础 V 成就', '同上'],
    ['#23 Ra', '第五个天体：宠物等级与记忆恢复体系', '同上'],
    ['#24 Lai’tela（完全失稳）', '第六个天体：完全失稳（Full Destabilization）为里程碑条件', '同上'],
    ['#25 Pelle（游戏完成）', '第七个天体：末日（Doomed）现实，通关即游戏完成', '同上'],
    ['这一段的攻略细节', '<b>尚未系统提取</b>：《Cel-7 永恒部分全解》（2.4 万字符）+《现实更新攻略》的天体章节。下一轮可以按天体逐个拆出"该买什么/什么时候做"，格式同 S1', '——']
  ];

  var C8FIND = [
    ['结论', '<b>仍然没能复现「挑战 8 比正常无限快」</b>。在三个不同进度点分别对比，C8 都比普通无限慢 2.4~3.8 倍。'],
    ['机制已经全部对齐', '① C8 里 DimBoost.power = ×1（源码直证）② 献祭要求 boosts≥5，所以提升到 5 次就停手 ③ 献祭阈值必须 ≥8 倍（AD1 要长到 sacrificed^0.8）',
      '修正后再仿真：C8 首次可通关，结束献祭总倍率 <b>1.2e40</b>，与攻略「献祭倍数到约 1e40 时停手」完全吻合'],
    ['三个进度点的实测', 'IU11：普通 2.95h vs C8 6.99h（慢 2.37×）　IU11+IU12：1.38h vs 4.33h（3.13×）　IU 三列：23.9min vs 1.52h（3.82×）'],
    ['剩下的最可能解释（未验证）', '<code>player.chall8TotalSacrifice</code> 在我下载的源码文件里<b>只被初始化、只被乘，没有任何地方重置它</b>。' +
      '如果它在真实游戏里也是"跨大坍缩保留"，那么<b>连续刷 C8 会一次比一次快</b> —— 攻略说的"不断完成 C8 快速获得大量 IP"衡量的是<b>连续吞吐</b>，而不是单跑时长。' +
      '我的仿真每次 C8 都从这个倍率 = 1 开始，所以看不到这个加速链。', '这是本轮最可能的答案，但需要一个未下载的文件（resetChallengeStuff 的实现）来确认']
  ];

  function table(rows, h1, h2, h3) {
    var h = ['<div class="scroll"><table><thead><tr><th style="width:' + (h1 || '180px') + '">' + (h2 || '项目') +
      '</th><th>' + (h3 || '内容') + '</th></tr></thead><tbody>'];
    rows.forEach(function (r) {
      h.push('<tr><td><b>' + r[0] + '</b></td><td style="font-size:12px;line-height:1.75">' + r[1] + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    return h.join('');
  }

  function boot() {
    var el = $('s3ms');
    if (el) {
      var ms = global.S3_MILESTONES || [];
      var h = ['<div class="scroll tall"><table><thead><tr><th>#</th><th>key</th><th>名称</th>' +
        '<th>达成条件</th><th>属于</th></tr></thead><tbody>'];
      var segOf = function (id) {
        if (id <= 9) return '（前两阶段，已完成）';
        if (id <= 16) return '段① 永恒→现实';
        if (id <= 19) return '段② 现实→Cel1';
        return '段③ Cel1→Cel7';
      };
      ms.forEach(function (m) {
        var hi = m.id >= 10;
        h.push('<tr' + (hi ? '' : ' style="opacity:.45"') + '><td><b>' + m.id + '</b></td>' +
          '<td style="font-size:11.5px;color:#9dcaff">' + m.key + '</td><td>' + m.name + '</td>' +
          '<td class="dim" style="font-size:11.5px">' + m.desc + '</td>' +
          '<td style="font-size:11.5px">' + segOf(m.id) + '</td></tr>');
      });
      h.push('</tbody></table></div>');
      el.innerHTML = h.join('');
    }
    var a = $('s3eternity'); if (a) a.innerHTML = table(ETERNITY, '200px', '节点', '该怎么做');
    var b = $('s3reality'); if (b) b.innerHTML = table(REALITY, '200px', '节点', '内容 / 状态');
    var c = $('s3cel'); if (c) c.innerHTML = table(CEL, '250px', '天体', '内容 / 状态');
    var d = $('s3c8'); if (d) d.innerHTML = table(C8FIND, '230px', '项目', '说明');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
