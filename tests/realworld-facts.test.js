import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z507 现实对照札记的事实准确性 —— 这些是 Lore Oracle 回答「现实原型」题的依据，
 * 数字/名称错了就等于给用户假知识（需求九「真实数据」）。
 * 2026-11-21 复核英文维基：凯旋门长明火 1923-11-11 首燃、至 2026 为 103 年、
 * 主办协会 La Flamme sous l'Arc de Triomphe（非 La Flamme de l'Espérance）。
 */
describe('现实对照札记事实准确（W-Z507）', () => {
  const zh = readFileSync(join(process.cwd(), 'creative/refs/crossrealm-realworld-notes-2.md'), 'utf8');
  const en = readFileSync(join(process.cwd(), 'creative/refs/crossrealm-realworld-notes-2.en.md'), 'utf8');
  const corpus = readFileSync(join(process.cwd(), 'server/ai-service/src/main/resources/lore/corpus.txt'), 'utf8');

  it('zh/en 都写 103 年，无残留错误的 102 年', () => {
    expect(zh).toContain('103 年');
    expect(en).toContain('103 years');
    expect(zh).not.toMatch(/102 年/);
    expect(en).not.toMatch(/102 years/);
  });

  it('协会名正确，无错误名', () => {
    expect(zh).toContain("La Flamme sous l'Arc de Triomphe");
    expect(en).toContain("La Flamme sous l'Arc de Triomphe");
    expect(en).not.toContain("La Flamme de l'Espérance");
  });

  it('纠正后的事实已进入 Oracle 检索语料', () => {
    expect(corpus).toMatch(/103 年|103 years/);
    expect(corpus).not.toMatch(/102 年|102 years/);
  });
});