import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z509 showcase.html 用 `fetch('./latest.json')` 取实况数字，但该文件长期不存在——
 * 于是「单测全绿」永远卡在硬编码 6696。现在 build-latest.mjs 每次同步一份到 creative/。
 */
describe('showcase 实况数字镜像（W-Z509）', () => {
  const build = readFileSync(join(process.cwd(), 'scripts/build-latest.mjs'), 'utf8');
  const show = readFileSync(join(process.cwd(), 'creative/showcase.html'), 'utf8');
  const mirror = JSON.parse(readFileSync(join(process.cwd(), 'creative/latest.json'), 'utf8'));
  const canonical = JSON.parse(readFileSync(join(process.cwd(), 'docs/latest.json'), 'utf8'));

  it('build-latest 同步写 creative/latest.json', () => {
    expect(build).toContain("join(ROOT, 'creative', 'latest.json')");
  });

  it('镜像存在且与权威事实包同源', () => {
    expect(mirror.total_commits).toBe(canonical.total_commits);
    expect(mirror.test_files).toBe(canonical.test_files);
    expect(mirror.i18n_keys).toBe(canonical.i18n_keys);
  });

  it('showcase fallback 数字不再停在旧的 6696', () => {
    expect(show).toContain('id="live-testfiles"');
    expect(show).not.toContain('>6696</b>');
  });
});