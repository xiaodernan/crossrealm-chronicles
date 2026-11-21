import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z510 showcase 英雄区文案曾写死「小说七章+七番外」「9 微服务」，实际已 290 卷 / 10 服务。
 * 现在接上 latest.json 的 live-novels 与 inline 跨度，实况数字自动刷新。
 */
describe('showcase 英雄区实况文案（W-Z510）', () => {
  const html = readFileSync(join(process.cwd(), 'creative/showcase.html'), 'utf8');
  const mirror = JSON.parse(readFileSync(join(process.cwd(), 'creative/latest.json'), 'utf8'));

  it('英雄区与跨媒体卡都接上 live 卷数', () => {
    expect(html).toContain('id="live-novels"');
    expect(html).toContain('id="live-novels-en"');
    expect((html.match(/class="live-novel-inline"/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("querySelectorAll('.live-novel-inline')");
  });

  it('fetch 把 novel_chapters 灌进所有跨度', () => {
    const m = html.match(/typeof d\.novel_chapters_zh === 'number'[\s\S]{0,400}?\n {6}\}/);
    expect(m).toBeTruthy();
    expect(m[0]).toContain('live-novels');
    expect(m[0]).toContain('novel_chapters_en');
    expect(m[0]).toContain('live-novel-inline');
  });

  it('微服务数改为 10，旧「9 个微服务」文案不残留', () => {
    expect(html).toMatch(/<b>10<\/b><span class="locale locale-zh">Spring Cloud 微服务/);
    expect(html).not.toMatch(/Spring Cloud 9 个微服务|nine Spring Cloud microservices/);
  });

  it('镜像卷数与权威数一致', () => {
    expect(mirror.novel_chapters_zh).toBeGreaterThanOrEqual(290);
    expect(mirror.novel_chapters_en).toBe(mirror.novel_chapters_zh);
  });
});