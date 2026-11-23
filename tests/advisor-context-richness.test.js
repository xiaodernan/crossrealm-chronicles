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
import { describe, it, expect, vi } from 'vitest';
import { AdvisorPanel } from '../src/ui/AdvisorPanel.js';
import { QuestAssistant } from '../src/ui/QuestAssistant.js';
import { t } from '../src/engine/i18n.js';
import { buildAdvisorContext, normalizeAdvisorContext, ADVISOR_LIMITS } from '../src/content/advisor.js';

const EXPECTED_KEYS = [
  'zone', 'objective', 'health', 'chapter',
  'player_level', 'souls', 'season', 'trial',
];

const fullGame = () => ({
  world: { zoneId: 'fantasy' },
  seasons: { getState: () => ({ id: 'ember', dayInCycle: 4, daysRemaining: 11 }) },
  trial: { getState: () => ({ state: 'running', layer: 3, kills: 7, quota: 12 }) },
  quests: { chapter: 2, current: { title: 'obj_anchor_title' }, stats: {} },
  stats: { level: 9, souls: 240 },
  player: { combat: { hp: 63, maxHp: 90 } },
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
    expect(normalized).toEqual(ctx);
    for (const [k, v] of Object.entries(ctx)) {
      expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('字段值取自真实状态：位置/目标/生命/资源/赛季/试炼都能读回来', () => {
    const ctx = buildAdvisorContext(fullGame(), (key) => `译:${key}`);
    expect(ctx.zone).toBe('fantasy');
    expect(ctx.objective).toBe('译:obj_anchor_title');
    expect(ctx.health).toBe('63/90');
    expect(ctx.chapter).toBe('2');
    expect(ctx.player_level).toBe('9');
    expect(ctx.souls).toBe('240');
    expect(ctx.season).toBe('ember · day 4 · remaining 11');
    expect(ctx.trial).toBe('running · layer 3 · 7/12');
  });

  it('试炼未运行：只保留状态，不把旧层数和进度伪装成当前状态', () => {
    const g = fullGame();
    g.trial.getState = () => ({ state: 'idle', layer: 3, kills: 7, quota: 12 });
    const ctx = buildAdvisorContext(g);
    expect(ctx.trial).toBe('idle');
  });

  it('子系统全缺失也不抛：返回空上下文，交给服务端用冻结前缀兜底', () => {
    expect(() => new AdvisorPanel({})._context()).not.toThrow();
    expect(normalizeAdvisorContext(buildAdvisorContext({}))).toEqual({});
  });

  it('半初始化：getState 返回 null、生命上限为零或数值非法时不抛也不产 NaN', () => {
    const g = fullGame();
    g.seasons.getState = () => ({ id: 'ember', dayInCycle: NaN, daysRemaining: 11 });
    g.trial.getState = () => null;
    g.quests = {};
    g.stats = { level: NaN, souls: Infinity };
    g.player.combat = { hp: 10, maxHp: 0 };
    const ctx = buildAdvisorContext(g);
    expect(() => ctx).not.toThrow();
    expect(Object.values(ctx).join(' ')).not.toMatch(/NaN|Infinity/);
    expect(ctx.health).toBeUndefined();
    expect(ctx.player_level).toBeUndefined();
    expect(ctx.souls).toBeUndefined();
    expect(ctx.season).toBe('ember · remaining 11');
  });

  it('守夜人指路也从同一构建器取真实状态，并保留行为遥测字段', async () => {
    const game = fullGame();
    const askGuide = vi.fn().mockResolvedValue({ ok: true, data: { nudge: '火还在。', mood: 'lost' } });
    game.onlineServices = { askGuide };
    const assistant = Object.create(QuestAssistant.prototype);
    assistant.game = game;
    assistant._panel = { querySelector: () => ({ classList: { remove() {}, add() {} }, textContent: '' }) };
    assistant._estimateIdleSeconds = () => 45;
    assistant._estimateRecentActions = () => 7;

    await assistant.askKeeperGuide();

    expect(askGuide).toHaveBeenCalledWith(expect.objectContaining({
      zone: 'fantasy', objective: t('obj_anchor_title'), idleSeconds: 45, recentActions: 7,
      context: buildAdvisorContext(game, t),
    }));
    expect(askGuide.mock.calls[0][0].context.health).toBe('63/90');
    expect(askGuide.mock.calls[0][0].context.souls).toBe('240');
  });

  it('目标来自当前抉择对应的真标题，且长目标在构建时已经封顶', () => {
    const g = fullGame();
    g.quests.current = { title: 'obj_choice_title', titleByChoice: { keep: '长'.repeat(200) } };
    g.quests.stats = { decisions: new Set(['keep']) };
    const ctx = buildAdvisorContext(g);
    expect(ctx.objective).toHaveLength(ADVISOR_LIMITS.contextValueMax);
  });
});
