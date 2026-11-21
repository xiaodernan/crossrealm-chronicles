import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * W-Z491 管理页 LLM 分析的 digest 必须纳入两条新增 MEASURED 探针，
 * 且重跑产物要真实引用它们（不是悄悄用了旧报告）。
 */
describe('admin LLM 分析纳入 MEASURED 探针（W-Z491）', () => {
  const script = readFileSync(join(process.cwd(), 'scripts/admin-llm-analysis.mjs'), 'utf8');

  it('digest 读取并注入 v5 深潜 / guide 两条探针', () => {
    expect(script).toContain("readData('oracle-v5-live-probe-2026-11-21.json')");
    expect(script).toContain("readData('guide-live-probe-2026-11-21.json')");
    expect(script).toContain('llmDeepDiveProbe');
    expect(script).toContain('llmGuideProbe');
  });

  it('诚实标注把新探针列为 MEASURED', () => {
    expect(script).toMatch(/oracle-v5-live-probe\.json \/ guide-live-probe\.json = MEASURED/);
  });

  it('重跑产物真实引用新探针数字/状态流转路径', () => {
    const zh = readFileSync(join(process.cwd(), 'docs/admin/data/admin-llm-analysis.zh.md'), 'utf8');
    const en = readFileSync(join(process.cwd(), 'docs/admin/data/admin-llm-analysis.en.md'), 'utf8');
    for (const [label, text] of [['zh', zh], ['en', en]]) {
      expect(text, `${label} 应引用 88.8% 深潜命中`).toContain('88.8');
      expect(text, `${label} 应引用 guideLost 状态流转`).toContain('guideLost');
      expect(text, `${label} 应引用 82968 上下文`).toMatch(/82,?968/);
    }
  });
});