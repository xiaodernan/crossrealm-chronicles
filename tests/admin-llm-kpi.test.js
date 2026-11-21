import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z494 管理页 LLM 分析 KPI 卡必须与最新报告同源——防止报告重跑后卡片数字/日期停在旧版。
 */
describe('Admin LLM KPI 卡与报告同源（W-Z494）', () => {
  const html = readFileSync(join(process.cwd(), 'docs/admin/index.html'), 'utf8');
  const zh = readFileSync(join(process.cwd(), 'docs/admin/data/admin-llm-analysis.zh.md'), 'utf8');
  const en = readFileSync(join(process.cwd(), 'docs/admin/data/admin-llm-analysis.en.md'), 'utf8');

  it('卡片引用最新里程碑 W-Z491 而非旧的 W-Z451', () => {
    expect(html).toContain('W-Z491 重跑');
    expect(html).not.toMatch(/meas_l18b[^\n]*W-Z451/);
  });

  it('卡片字数/日期与报告一致，无残留旧数字 2792/4969', () => {
    expect(html).toContain('zh chars=2577 / en chars=5305');
    expect(html).toContain('2026-11-21 已刷新');
    expect(html).not.toContain('2792');
    expect(html).not.toContain('4969');
  });

  it('报告确实含新探针引用（卡片的「纳入探针」说法有据）', () => {
    for (const text of [zh, en]) {
      expect(text).toContain('88.8');
      expect(text).toContain('guideLost');
    }
  });
});