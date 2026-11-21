import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z498 W-Z492 的全链路压测产物必须真正在管理页露出——否则 MEASURED 数据白测。
 */
describe('压测产物在管理页露出（W-Z498）', () => {
  const html = readFileSync(join(process.cwd(), 'docs/admin/index.html'), 'utf8');

  it('有 meas_l40 KPI 卡引用 crossrealm-load 产物', () => {
    expect(html).toMatch(/data-i18n="meas_l40"/);
    expect(html).toContain('crossrealm-load-2026-11-21.json');
    expect(html).toContain('meas_l40:');
  });

  it('卡片引用真实存在的产物文件', () => {
    const d = JSON.parse(readFileSync(join(process.cwd(), 'docs/admin/data/crossrealm-load-2026-11-21.json'), 'utf8'));
    expect(d.schema).toBe('crossrealm.load-probe.v1');
    expect(html).toMatch(/网关 vs 直连/);
  });

  it('产物里的关键数字出现在卡片文案中', () => {
    expect(html).toContain('964.17');
    expect(html).toContain('899.83');
  });
});