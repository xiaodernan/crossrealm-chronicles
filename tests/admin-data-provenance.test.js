import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const context = {};
runInNewContext(readFileSync(join(process.cwd(), 'docs/admin/admin-metrics.js'), 'utf8'), context);
const { summarizeAdminRollup } = context;

const snapshot = JSON.parse(readFileSync(join(process.cwd(), 'docs/admin/data/telemetry-summary.json'), 'utf8'));
const html = readFileSync(join(process.cwd(), 'docs/admin/index.html'), 'utf8');

const fixture = () => ({
  enabled: true,
  windowDays: 14,
  totals: { boss_kill: 3, canon_open: 1, smoke: 2, loadtest: 4 },
  byDayAndType: [
    { day: '2026-11-01', type: 'boss_kill', count: 1 },
    { day: '2026-11-01', type: 'smoke', count: 2 },
    { day: '2026-11-03', type: 'boss_kill', count: 2 },
    { day: '2026-11-03', type: 'canon_open', count: 1 },
    { day: '2026-11-03', type: 'loadtest', count: 4 },
  ],
});

describe('管理页实测遥测口径', () => {
  it('仓库快照的分类总数与逐日原账逐条对上', () => {
    const reading = summarizeAdminRollup(snapshot);
    expect(reading.real).toBe(true);
    expect(reading.mode).toBe('snapshot');
    expect(reading.total).toBe(snapshot.total);
    expect(reading.grouped).toEqual({ humanAdjacent: 38, probe: 573, other: 0 });
    expect(reading.daily.reduce((sum, day) => sum + day.total, 0)).toBe(snapshot.total);
    expect(reading.daily.map((day) => day.day)).toEqual(['2026-11-15', '2026-11-17']);
  });

  it('趋势只比较实测日计数，间隔按自然日算，不做预测', () => {
    const reading = summarizeAdminRollup(fixture());
    expect(reading.trend).toEqual({
      metric: 'humanAdjacentEventCount', fromDay: '2026-11-01', toDay: '2026-11-03', elapsedDays: 2,
      previous: 1, current: 3, delta: 2, percent: 2, forecast: null,
    });
  });

  it('只有一个实测日或上一日为 0 时，不编造变化率', () => {
    const one = fixture();
    one.totals = { boss_kill: 1 };
    one.byDayAndType = [{ day: '2026-11-01', type: 'boss_kill', count: 1 }];
    expect(summarizeAdminRollup(one).trend.current).toBe(1);
    expect(summarizeAdminRollup(one).trend.previous).toBeNull();
    const zero = fixture();
    zero.totals = { boss_kill: 3, canon_open: 1 };
    zero.byDayAndType = [
      { day: '2026-11-01', type: 'smoke', count: 0 },
      { day: '2026-11-03', type: 'boss_kill', count: 3 },
      { day: '2026-11-03', type: 'canon_open', count: 1 },
    ];
    expect(summarizeAdminRollup(zero).trend.percent).toBeNull();
  });

  it('未知事件归 other，不冒充玩家事件或压测事件', () => {
    const data = fixture();
    data.totals.future_event = 7;
    data.byDayAndType.push({ day: '2026-11-03', type: 'future_event', count: 7 });
    expect(summarizeAdminRollup(data).grouped.other).toBe(7);
  });

  it('没有用户/会话身份时留存恒不可计算，给再多事件也不能放行', () => {
    const data = fixture();
    data.distinctUsers = 10000;
    data.sessionCount = 10000;
    expect(summarizeAdminRollup(data).retention).toEqual({
      eligible: false,
      reasons: ['user-identity-missing', 'session-cohort-missing'],
      minimumDistinctUsers: 200,
      minimumWindowDays: 14,
    });
  });

  it('后端关闭且没有实测快照标记时拒绝把空数据当真实读数', () => {
    expect(() => summarizeAdminRollup({ enabled: false })).toThrow('disabled');
    expect(() => summarizeAdminRollup(null)).toThrow('missing');
  });

  it('总数与逐日账对不上必须失败，不能悄悄选一边', () => {
    const data = fixture();
    data.totals.boss_kill += 1;
    expect(() => summarizeAdminRollup(data)).toThrow('do not reconcile');
  });

  it('反面证据：改动快照分类后读数必须跟着变', () => {
    const before = summarizeAdminRollup(snapshot);
    const changed = structuredClone(snapshot);
    changed.totals.boss_kill = 31;
    changed.byDayAndType[0].count = 31;
    changed.total += 1;
    const after = summarizeAdminRollup(changed);
    expect(after.grouped.humanAdjacent).toBe(before.grouped.humanAdjacent + 1);
    expect(after.total).toBe(before.total + 1);
  });
});

describe('三种数据在页面上分列', () => {
  it('合成区有边界和醒目标记，真实留存不与合成留存混放', () => {
    expect(html).toContain('data-synthetic-region');
    expect(html.match(/data-source="synthetic"/g)?.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('data-source="measured"');
    expect(html).toContain('实测遥测 · Measured Telemetry');
    expect(html).not.toContain('真实多用户数据由后端聚合时呈现在上面的合成面板中');
    expect(html).not.toContain('will fold into the same charts');
    expect(html).toMatch(/data-i18n="meas_l26"[^>]*>真实留存 · 不可计算<\/div><div class="kpi-value">N\/A<\/div>/);
    expect(html).not.toContain('lt_session_end: \'会话结束（留存）\'');
  });

  it('合成失败会清空旧图表，实测快照仍独立加载', () => {
    expect(html).toContain("for (const id of ['dChart', 'pChart', 'featureBars', 'funnelRow', 'retentionGrid', 'recList', 'slopeLine'])");
    expect(html).toContain("fetch('data/telemetry-summary.json'");
    expect(html).toContain('window.__adminRollupSummary = liveRollupSummary');
    expect(html.indexOf('<script src="admin-metrics.js">')).toBeLessThan(html.indexOf('async function loadLiveRollup()'));
  });

  it('Pages 部署会带上管理页的汇总脚本、实测快照和双语分析报告', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/pages.yml'), 'utf8');
    for (const asset of [
      'admin-metrics.js',
      'data/telemetry-summary.json',
      'data/measured-funnel.json',
      'data/admin-llm-analysis.zh.md',
      'data/admin-llm-analysis.en.md',
    ]) {
      expect(workflow).toContain(`cp docs/admin/${asset} _site/admin/${asset}`);
      expect(existsSync(join(process.cwd(), 'docs/admin', asset))).toBe(true);
    }
  });

  it('所有动态遥测文案都走双语字典，英文值不含汉字', () => {
    const block = html.match(/const I18N = (\{[\s\S]*?\n\});/)[1];
    const dict = new Function(`return (${block});`)();
    const keys = ['live_group_human', 'live_group_probe', 'live_group_other', 'live_trend_title', 'live_trend_one', 'live_trend_compare', 'live_retention_blocked', 'live_snapshot_asof', 'live_snapshot_source', 'live_live_source'];
    for (const key of keys) {
      expect(dict.zh[key], key).toBeTruthy();
      expect(dict.en[key], key).toBeTruthy();
      expect(dict.en[key], key).not.toMatch(/[\u3400-\u9fff]/);
    }
  });
});
