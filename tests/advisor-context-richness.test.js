/**
 * 星轨顾问 · 上下文丰富度门禁（深度运用 LLM 的关键落点）
 *
 * 背景：用户反馈"输入上下文总是太少"——顾问原本只喂 5 个标量。服务端
 * ChatRequest.context 上限 8（tests 已从 Java 源码钉死），冻结前缀只覆盖 system
 * prompt，context 拼在 userMessage 尾部 ⇒ 扩容不破坏缓存命中。
 * 所以把玩家真实处境（等级 / 赛季剩余 / 试炼进度）补进白名单内的 8 个标量，
 * 让 LLM 能基于"你现在几级、赛季还剩几天、试炼杀了几个"给具体建议——
 * 这正是"用大模型分析能力实现状态流转与内容输出"。
 *
 * 不变量：
 *  ① 恰好 8 个字段（把上限用满，但不越界）；
 *  ② 全部标量、snake_case、非空（normalizeAdvisorContext 二次白名单仍会过）；
 *  ③ game 各子系统缺失/半初始化时不抛，缺的字段留空被白名单过滤；
 *  ④ 字段值取自真实状态而非写死常量。
 *
 * 变异判据：删掉任一新增字段 / 写死常量 → 对应用例红。
 */
import { describe, it, expect } from 'vitest';
import { AdvisorPanel } from '../src/ui/AdvisorPanel.js';
import { normalizeAdvisorContext, ADVISOR_LIMITS } from '../src/content/advisor.js';

const EXPECTED_KEYS = [
  'season', 'season_day', 'season_remaining',
  'trial_state', 'trial_layer', 'trial_progress',
  'chapter', 'player_level',
];

const fullGame = () => ({
  seasons: { getState: () => ({ id: 'ember', dayInCycle: 4, daysRemaining: 11 }) },
  trial: { getState: () => ({ state: 'running', layer: 3, kills: 7, quota: 12 }) },
  quests: { chapter: 2 },
  stats: { level: 9 },
});

describe('AdvisorPanel._context —— 把玩家真实处境喂给大模型', () => {
  it('产出 8 个字段，正好用满服务端 context 上限', () => {
    const panel = new AdvisorPanel(fullGame());
    const ctx = panel._context();
    expect(Object.keys(ctx).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(ctx).length).toBe(ADVISOR_LIMITS.contextMaxEntries);
  });

  it('每个字段都通过白名单：标量、snake_case、非空', () => {
    const panel = new AdvisorPanel(fullGame());
    const ctx = panel._context();
    const normalized = normalizeAdvisorContext(ctx);
    expect(normalized).toEqual(ctx); // 没有任何字段被白名单丢弃或改写
    for (const [k, v] of Object.entries(ctx)) {
      expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('字段值取自真实状态：赛季/试炼/章节/等级都能读回来', () => {
    const panel = new AdvisorPanel(fullGame());
    const ctx = panel._context();
    expect(ctx.season).toBe('ember');
    expect(ctx.season_day).toBe('4');
    expect(ctx.season_remaining).toBe('11');
    expect(ctx.trial_state).toBe('running');
    expect(ctx.trial_layer).toBe('3');
    expect(ctx.trial_progress).toBe('7/12');
    expect(ctx.chapter).toBe('2');
    expect(ctx.player_level).toBe('9');
  });

  it('试炼未运行：trial_progress/trial_layer 留空，被白名单自动过滤', () => {
    const g = fullGame();
    g.trial.getState = () => ({ state: 'idle', layer: 0, kills: 0, quota: 0 });
    const panel = new AdvisorPanel(g);
    const ctx = normalizeAdvisorContext(panel._context());
    expect(ctx.trial_state).toBe('idle');
    expect(ctx.trial_progress).toBeUndefined();
    expect(ctx.trial_layer).toBeUndefined();
    expect(Object.keys(ctx).length).toBeLessThanOrEqual(ADVISOR_LIMITS.contextMaxEntries);
  });

  it('子系统全缺失也不抛：返回空上下文，交给服务端用冻结前缀兜底', () => {
    const panel = new AdvisorPanel({});
    expect(() => panel._context()).not.toThrow();
    expect(normalizeAdvisorContext(panel._context())).toEqual({});
  });

  it('半初始化：getState 返回 null 时不抛', () => {
    const panel = new AdvisorPanel({
      seasons: { getState: () => null },
      trial: { getState: () => null },
      quests: {},
      stats: {},
    });
    expect(() => panel._context()).not.toThrow();
    expect(normalizeAdvisorContext(panel._context())).toEqual({});
  });
});
