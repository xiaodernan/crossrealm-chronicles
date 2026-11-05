/**
 * 片尾字幕布局门禁（W-E3 切片50）—— 真机在 390px 宽下量出来的裁切。
 *
 * 2026-10-31 真浏览器读数：`white-space: nowrap` + 居中定位让英文结局句
 * 在 390px 视口下左右各越界约 123–135px；中文「熄灯」那句也越界约 21px。
 * 字幕是通关后的最后一屏，被裁掉半句等于结局没说完。
 *
 * 修法只用 CSS：`width: max-content` 保留短句的自然宽度，
 * `max-width: min(90vw, 44rem)` 给长句一个随视口收缩的上限，
 * `white-space: normal` 让超出的部分换行而不是溢出。
 *
 * 这一条是静态腿：真机读数记在 §9。反向控制把旧规则还原，
 * 断言同一把尺必须点名 —— 防它退化成恒真。
 *
 * ## W-E3 切片54：整段滚动的契约（真机量过，静态钉住）
 * 真机（headless Chrome，390×844，页面内真调 `EndCreditsDirector.play()`）读数：
 * 动画在 **28000 ms** 走到 `finished`，此时字幕块底边 **−84.4 px**、最后一行底边
 * **−91.4 px**、仍在屏上的行 **0** —— 即"整段滚完真的滚出去了"，不是滚到一半停住。
 * 同一轮平板两档（768×1024 / 1024×768）块宽均 379.25、越界 0、多行段落 0。
 *
 * 这条契约里能静态守的三件事：时长 28s（改短就是"字幕没滚完就没了"）、
 * `linear`（匀速，避免结尾突然加速）、`forwards`（滚完不许回弹到 `bottom: -20%` 重新露出）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const 样式 = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8').replace(/\r\n/g, '\n');

function 字幕规则(源) {
  const m = 源.match(/^\.end-credits-scroll \{([^}]*)\}/m);
  expect(m, 'style.css 里找不到 .end-credits-scroll 规则').not.toBeNull();
  return m[1];
}

function 布局问题(规则) {
  const 问 = [];
  if (!/white-space:\s*normal/.test(规则)) 问.push('字幕不许 nowrap：长句必须换行');
  if (/white-space:\s*nowrap/.test(规则)) 问.push('字幕仍是 nowrap');
  if (!/max-width:\s*min\(90vw,\s*44rem\)/.test(规则)) 问.push('字幕没有随视口收缩的 max-width');
  if (!/width:\s*max-content/.test(规则)) 问.push('短句没有保留自然宽度');
  return 问;
}

describe('片尾字幕布局（W-E3 切片50）', () => {
  it('允许换行、短句自然宽、长句最多 90vw / 44rem', () => {
    expect(布局问题(字幕规则(样式))).toEqual([]);
  });

  it('反向控制：改回 nowrap 并删掉 max-width 必须被点名', () => {
    const 旧 = 字幕规则(样式)
      .replace('white-space: normal', 'white-space: nowrap')
      .replace(/max-width:\s*min\(90vw,\s*44rem\);?/, '');
    expect(布局问题(旧)).toEqual([
      '字幕不许 nowrap：长句必须换行',
      '字幕仍是 nowrap',
      '字幕没有随视口收缩的 max-width',
    ]);
  });

  /** 关键帧：从视口下方 30% 滚到上方 110%（滚完全出屏） */
  function 关键帧问题(源) {
    const 问 = [];
    // 关键帧里有嵌套花括号（`from { … } to { … }`），按**整行**取，别在第一个 `}` 停下
    const m = 源.match(/@keyframes credits-roll \{([^\n]*)\}/);
    if (!m) { 问.push('没有 credits-roll 关键帧'); return 问; }
    if (!/from\s*\{\s*bottom:\s*-30%/.test(m[1])) 问.push('起点不是视口下方 30%');
    if (!/to\s*\{\s*bottom:\s*110%/.test(m[1])) 问.push('终点没有滚出视口顶');
    return 问;
  }

  it('整段滚动 28 秒匀速、滚完停在上面不回弹（真机 28000ms 走到 finished）', () => {
    const 规则 = 字幕规则(样式);
    expect(规则, '动画不是 28 秒 —— 改时长要重写真机读数').toContain('animation: credits-roll 28s linear forwards');
    expect(关键帧问题(样式)).toEqual([]);
    // 反向控制：去掉 forwards 必须点名（回弹会让字幕在结尾重新露出）
    const 回弹 = 规则.replace('forwards', '');
    const 问 = [];
    if (!/forwards/.test(回弹)) 问.push('滚完没有 forwards，会回弹');
    expect(问).toEqual(['滚完没有 forwards，会回弹']);
  });
});
