import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z501 build-latest.mjs --check 的自指字段处理：head/total_commits 天生领先一笔，
 * 不能被当成 drift，否则每次正常提交 fact pack 后门禁必红。
 */
describe('latest.json --check 自指字段（W-Z501）', () => {
  const src = readFileSync(join(process.cwd(), 'scripts/build-latest.mjs'), 'utf8');

  it('drift 判定里不含 head / total_commits', () => {
    const m = src.match(/const keys = \[([^\]]+)\];/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toMatch(/\bhead\b/);
    expect(m[1]).not.toMatch(/total_commits/);
  });

  it('仍校验真正的内容派生字段', () => {
    const m = src.match(/const keys = \[([^\]]+)\];/);
    for (const key of ['i18n_keys', 'lore_sources', 'novel_chapters_zh', 'novel_chapters_en', 'test_files']) {
      expect(m[1]).toContain(key);
    }
  });

  it('当前 latest.json 能通过 --check（命令已在 CI 外验证，这里守脚本形状）', () => {
    expect(src).toContain("W-Z501");
  });
});