import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z506 管理员「智能洞察」的预期影响栏不许编百分比 —— 用户明确要求数据真实、不虚假。
 * 之前 12 条建议写死 +30%/+35% 并标「实测预估/实测模型」，零数据支撑。
 */
describe('管理洞察不编造影响数字（W-Z506）', () => {
  const html = readFileSync(join(process.cwd(), 'docs/admin/index.html'), 'utf8');

  it('impact 文案里没有假百分比', () => {
    const impacts = [...html.matchAll(/impact: zh \?\s*'([^']*[^']*)'/g)].map((m) => m[1]);
    expect(impacts.length, '一条 impact 都没扫到，扫描坏了').toBeGreaterThan(5);
    const fake = impacts.filter((x) => /\d+\s*%/.test(x) || /实测预估|实测模型|行为模型/.test(x));
    expect(fake, '预期影响里还有编造的百分比/虚假实测标注').toEqual([]);
  });

  it('改成方向假设 + 待 A/B 验证，并在页脚讲清', () => {
    expect(html).toContain('方向：提升通关率 · 假设待 A/B 验证');
    expect(html).toContain('direction: higher clear-rate · hypothesis, needs A/B');
    expect(html).toContain('只是方向假设、没有实测数字');
    expect(html).toContain('directional hypothesis with no measured number');
  });
});