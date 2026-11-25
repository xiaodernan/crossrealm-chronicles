import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NOVELLA_ZH } from '../src/content/novella/zh.js';
import { NOVELLA_EN } from '../src/content/novella/en.js';

/**
 * W-Z520：新入典卷的「仓库原稿 ↔ 游戏内典籍」逐字同源门禁。
 *
 * 为什么只钉新卷而不全校：历史卷的键号与 `creative/novel/` 文件号并非一一对应
 * （游戏内 0..289 是另一套卷序），全表对齐是一条会立刻红的假规矩。新卷从这一片起
 * 走同一条路：原稿文件就是 codex body，任何一侧手改另一侧没跟上，这条当场红。
 */
const ROOT = process.cwd();
// Windows runner 会把仓库里的 LF 检出成 CRLF；正文按 LF 落 JS 字面量，比较前归一。
const 读 = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n').trim();

describe.each([
  { 卷: '290', 中稿: 'creative/novel/291-余烬.md', 英稿: 'creative/novel/en/291-embers.md' },
  { 卷: '291', 中稿: 'creative/novel/292-认鸟.md', 英稿: 'creative/novel/en/292-the-bird.md' },
])('典籍馆新卷与原稿同源（$卷）', ({ 卷, 中稿, 英稿 }) => {

  it('中文典籍正文 = 中文原稿逐字', () => {
    expect(NOVELLA_ZH[卷]).toBeTruthy();
    expect(NOVELLA_ZH[卷].body).toBe(读(中稿));
    expect(NOVELLA_ZH[卷].id).toBe(卷);
  });

  it('英文典籍正文 = 英文原稿逐字', () => {
    expect(NOVELLA_EN[卷]).toBeTruthy();
    expect(NOVELLA_EN[卷].body).toBe(读(英稿));
    expect(NOVELLA_EN[卷].id).toBe(卷);
  });

  it('这一卷确有叙事细节，不是重复的「灶火燃着」填充', () => {
    const body = NOVELLA_ZH[卷].body;
    // 具体物件与动作：两卷各钉一组，防退化成口号
    const 细节 = 卷 === '290'
      ? ['焦洞', '陶缸', '木头小鸟', '彩带', '灶膛']   // 291-余烬
      : ['门闩', '桦树皮', '炭字', '碱霜', '树底下'];   // 292-认鸟
    for (const 词 of 细节) {
      expect(body, `正文缺少具体细节「${词}」——这一卷退化成口号了`).toContain(词);
    }
    expect(body.length).toBeGreaterThan(600);
  });
});
