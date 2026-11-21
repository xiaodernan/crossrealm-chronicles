import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z502 真·行为信号（session_end / guide_asked）必须从游戏贯通到管理员页——
 * 否则行为建模白做，管理员看不到「没耐心就关掉」「在哪迷茫」。
 */
describe('行为信号贯通管理员页（W-Z502）', () => {
  const html = readFileSync(join(process.cwd(), 'docs/admin/index.html'), 'utf8');
  const qa = readFileSync(join(process.cwd(), 'src/ui/QuestAssistant.js'), 'utf8');

  it('游戏侧：守夜人指路记录 guide_asked + mood', () => {
    expect(qa).toContain("recordTelemetry('guide_asked'");
    expect(qa).toContain('mood: res.data.mood');
  });

  it('管理员侧：known 列表与 labelKey 含 session_end / guide_asked', () => {
    expect(html).toMatch(/const known = \[[^\]]*'session_end'[^\]]*'guide_asked'/);
    expect(html).toContain("session_end: 'lt_session_end'");
    expect(html).toContain("guide_asked: 'lt_guide_asked'");
  });

  it('两语标签键都登记', () => {
    expect(html).toContain("lt_session_end: '会话结束（留存）'");
    expect(html).toContain("lt_session_end: 'Session end (retention)'");
    expect(html).toContain("lt_guide_asked: '求过守夜人指路'");
    expect(html).toContain("lt_guide_asked: 'Asked the keeper'");
  });

  it('智能洞察用 session_end / guide_asked 推出优化措施', () => {
    expect(html).toContain("e.event === 'session_end'");
    expect(html).toContain("e.event === 'guide_asked'");
    expect(html).toContain('shortSessions >= 2');
    expect(html).toContain('lostVerdicts >= 1');
  });
});