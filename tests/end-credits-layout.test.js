/**
 * 片尾字幕布局门禁（W-E3 切片50）—— 真机在 390px 宽下量出来的裁切。
 *
 * 2026-10-31 真浏览器读数：`white-space: nowrap` + 居中定位让英文结局句
 * 在 390px 视口下左右各越界约 123–135px；中文「熄灯」那句也越界约 21px。
 * 字幕是通关后的最后一屏，被裁掉半句等于结局没说完。
 *
 * 修法只用 CSS：`width: max-content` 保留短句的自然宽度，
 * `max-width: min(90vw, 40rem)` 给长句一个随视口收缩的上限，
 * `white-space: normal` 让超出的部分换行而不是溢出。
 *
 * 这一条是静态腿：真机读数记在 §9。反向控制把旧规则还原，
 * 断言同一把尺必须点名 —— 防它退化成恒真。
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
  if (!/max-width:\s*min\(90vw,\s*40rem\)/.test(规则)) 问.push('字幕没有随视口收缩的 max-width');
  if (!/width:\s*max-content/.test(规则)) 问.push('短句没有保留自然宽度');
  return 问;
}

describe('片尾字幕布局（W-E3 切片50）', () => {
  it('允许换行、短句自然宽、长句最多 90vw / 40rem', () => {
    expect(布局问题(字幕规则(样式))).toEqual([]);
  });

  it('反向控制：改回 nowrap 并删掉 max-width 必须被点名', () => {
    const 旧 = 字幕规则(样式)
      .replace('white-space: normal', 'white-space: nowrap')
      .replace(/max-width:\s*min\(90vw,\s*40rem\);?/, '');
    expect(布局问题(旧)).toEqual([
      '字幕不许 nowrap：长句必须换行',
      '字幕仍是 nowrap',
      '字幕没有随视口收缩的 max-width',
    ]);
  });
});
