/**
 * 信纸页签的语言门禁 —— KindleLetterTab 的「你 / 炉火」两个对话标签。
 *
 * 病灶（实测，改前）：同一个渲染函数里两个对称标签，`tagMe` 做了语言分支
 * （`getLanguage() === 'en' ? 'You' : '你'`），`tagFire` 却写死 `'炉火 · Ember'`——
 * 英文模式下玩家在信纸里读到中文「炉火」，且这句本身是中英并列，违反
 * 「中文模式全中文 / 英文模式全英文，不中英夹杂」。
 *
 * 钉住：两个标签都必须经 getLanguage() 分支；源码里不许再出现写死的中英并列标签。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/ui/KindleLetterTab.js', 'utf8');

describe('KindleLetterTab 对话标签的语言', () => {
  it('「你」标签按语言切换', () => {
    expect(SRC).toMatch(/tagMe\.textContent\s*=\s*getLanguage\(\)\s*===\s*'en'\s*\?\s*'You'\s*:\s*'你'/);
  });

  it('「炉火」标签同样按语言切换，不再写死中英并列', () => {
    expect(SRC).toMatch(/tagFire\.textContent\s*=\s*getLanguage\(\)\s*===\s*'en'\s*\?\s*'Ember'\s*:\s*'炉火'/);
    expect(SRC).not.toContain('炉火 · Ember');
  });

  it('两个标签的判据一致（同函数内不许只改一处）', () => {
    const me = /tagMe\.textContent\s*=\s*(getLanguage\(\))/.test(SRC);
    const fire = /tagFire\.textContent\s*=\s*(getLanguage\(\))/.test(SRC);
    expect(me && fire, 'tagMe 与 tagFire 必须用同一套语言判据').toBe(true);
  });
});
