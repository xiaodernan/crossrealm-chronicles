import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z499 Oracle RAG 卡片的语料源数必须与 lore-retrieval-probe 实测一致。
 * 之前卡片写死「475 源」（W-Z415 时的旧值），但 corpus 已随新卷涨到 611。
 */
describe('Oracle RAG 卡片语料源数对齐（W-Z499）', () => {
  const html = readFileSync(join(process.cwd(), 'docs/admin/index.html'), 'utf8');
  const probe = JSON.parse(readFileSync(join(process.cwd(), 'docs/admin/data/lore-retrieval-probe.json'), 'utf8'));

  it('probe 实测 611 源', () => {
    expect(probe.sources).toBe(611);
  });

  it('卡片三处文案都是 611 源，无残留 475 源', () => {
    expect(html).toContain('BM25 · 611 源');
    expect(html).toContain('BM25 · 611 sources');
    expect(html).not.toMatch(/BM25 · 475/);
  });

  it('W-Z475 里程碑号不受影响（别把合法编号也改了）', () => {
    expect(html).toContain('W-Z475');
  });
});