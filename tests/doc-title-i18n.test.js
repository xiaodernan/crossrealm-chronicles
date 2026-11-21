import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * W-Z495 浏览器标题跟随语言切换（需求八「不中英夹杂」）。
 * i18n.js 在读模块时不会碰 document；setLanguage 里才做 DOM 写入（无 DOM 静默跳过）。
 * 这里用假的 globalThis.document 验证两条语言的标题取值。
 */
describe('document.title 跟随语言（W-Z495）', () => {
  let realDoc;
  beforeEach(() => {
    realDoc = globalThis.document;
  });
  afterEach(() => {
    if (realDoc === undefined) delete globalThis.document;
    else globalThis.document = realDoc;
    vi.resetModules();
  });

  it('zh 与 en 各取对应 doc_title，en 不含中文', async () => {
    const fake = { documentElement: { lang: 'zh-CN' }, title: 'initial' };
    globalThis.document = fake;
    const { setLanguage } = await import('../src/engine/i18n.js?t=' + Date.now());

    setLanguage('zh');
    expect(fake.title).toBe('跨界纪元 — Crossrealm Chronicles');
    expect(fake.documentElement.lang).toBe('zh-CN');

    setLanguage('en');
    expect(fake.title).toBe('Crossrealm Chronicles — The Keeper\'s Anchor Fire');
    expect(fake.title).not.toMatch(/[\u4e00-\u9fff]/);
    expect(fake.documentElement.lang).toBe('en');
  });

  it('无 document 时不抛（纯逻辑环境）', async () => {
    delete globalThis.document;
    const { setLanguage } = await import('../src/engine/i18n.js?t=' + (Date.now() + 1));
    expect(() => setLanguage('en')).not.toThrow();
    expect(() => setLanguage('zh')).not.toThrow();
  });
});