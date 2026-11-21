import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z508 现实对照札记 vol.1 事实复核 —— 都是 Lore Oracle 的检索语料。
 * 2026-11-21 修正四处：① 伊势神宫式年迁宫 690年起/每20年/1300余年（非「四百年」）；
 * ② 秋分不写死的年份时刻；③ 节气次序 白露→秋分→寒露→霜降；④ Bai Lu = White Dew（非 Cold Dew）。
 */
describe('现实对照札记 vol.1 事实准确（W-Z508）', () => {
  const zh = readFileSync(join(process.cwd(), 'creative/refs/crossrealm-realworld-notes.md'), 'utf8');
  const en = readFileSync(join(process.cwd(), 'creative/refs/crossrealm-realworld-notes.en.md'), 'utf8');

  it('伊势神宫年数正确，无「四百年」错误', () => {
    expect(zh).toContain('公元 690 年');
    expect(zh).toContain('一千三百余年');
    expect(zh).not.toContain('已延续四百年');
    expect(zh).not.toContain('每四百年');
  });

  it('秋分无写死的年份时间戳，节气次序正确', () => {
    expect(zh).not.toMatch(/19:02/);
    expect(zh).toContain('白露 → **秋分**（黄经 180°）→ 寒露 → 霜降');
  });

  it('Bai Lu 译名为 White Dew 而非 Cold Dew', () => {
    expect(en).toContain('Bai Lu (White Dew, 白露)');
    expect(en).toContain('Han Lu (Cold Dew, 寒露)');
    expect(en).not.toContain('Bai Lu (Cold Dew');
  });
});