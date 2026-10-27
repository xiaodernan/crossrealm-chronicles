/**
 * 常驻游戏指引门禁 —— 钉 `ui/GameGuidePanel.js` 的 `refresh()` **优先级链**。
 *
 * 指引面板按优先级决定"现在该干什么"：**自动游玩 > 副本探索 > 无任务(通关) > 主线任务**。
 * 这是"写错不抛、只静默指错方向"的一族：优先级一乱，玩家看到的是错的下一步。
 * 此前零直接测试。构造期的拖拽/折叠（`DraggablePanel`）mock 成 no-op，把用例聚焦在 refresh。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t } from '../src/engine/i18n.js';
import { keyText } from '../src/ui/keyHints.js';

vi.mock('../src/ui/DraggablePanel.js', () => ({
  attachDraggable: vi.fn(),
  attachCollapsible: vi.fn(),
}));

const { GameGuidePanel } = await import('../src/ui/GameGuidePanel.js');

function makeEl() {
  const title = { textContent: '' };
  const step = { textContent: '' };
  const hint = { textContent: '' };
  const syncBtn = { addEventListener: vi.fn() };
  const autoBtn = { addEventListener: vi.fn() };
  const el = {
    id: 'game-guide',
    querySelector: vi.fn((sel) => ({
      '#guide-title': title,
      '#guide-step': step,
      '#guide-hint': hint,
      '#guide-sync': syncBtn,
      '#guide-autoplay': autoBtn,
    }[sel] ?? null)),
  };
  return { el, title, step, hint };
}

let realDoc, parts;

function makeQuests(over = {}) {
  return {
    current: null,
    chapter: 1,
    getProgressText: () => '进度',
    getQuestWaypoint: () => null,
    getAssistantHint: () => 'assistant',
    ...over,
  };
}

beforeEach(() => {
  parts = makeEl();
  realDoc = globalThis.document;
  globalThis.document = { getElementById: vi.fn((id) => (id === 'game-guide' ? parts.el : null)) };
});
afterEach(() => { globalThis.document = realDoc; });

describe('GameGuidePanel 优先级：自动游玩最高', () => {
  it('自动游玩时压过副本与主线，显示自动游玩三行', () => {
    const game = {
      playerAutoPlay: { active: true, statusEl: { textContent: '自动跑图中' } },
      dungeons: { getExplorationHint: () => ({ name: 'X', visited: 1, total: 3, cleared: 0, bossAlive: false, enemies: 0, isExit: false }) },
      quests: makeQuests({ current: { title: 'main_q' } }),
      dialog: { toast: vi.fn() }, questAssistant: { startAutoPlay: vi.fn() },
    };
    const p = new GameGuidePanel(game);
    p.refresh();
    expect(parts.title.textContent).toBe(t('guide_title_auto'));
    expect(parts.step.textContent).toBe('自动跑图中'); // 用 statusEl 的读数
    expect(parts.hint.textContent).toBe(keyText(t('guide_hint_auto')));
  });
});

describe('GameGuidePanel 优先级：副本探索压过主线', () => {
  const dgBase = { name: '幽暗地城', visited: 2, total: 5, cleared: 1 };

  it('Boss 未死 → 提示打 Boss（并压过主线）', () => {
    const game = {
      dungeons: { getExplorationHint: () => ({ ...dgBase, bossAlive: true, enemies: 3, isExit: false }) },
      quests: makeQuests({ current: { title: 'main_q' } }),
    };
    const p = new GameGuidePanel(game);
    p.refresh();
    expect(parts.title.textContent).toBe(t('guide_title_dungeon_prefix') + '幽暗地城');
    expect(parts.step.textContent).toBe(t('guide_step_dungeon', { visited: 2, total: 5, cleared: 1 }));
    expect(parts.hint.textContent).toBe(t('guide_hint_dungeon_boss'));
  });

  it('Boss 死但有敌人 → 提示清怪', () => {
    const game = { dungeons: { getExplorationHint: () => ({ ...dgBase, bossAlive: false, enemies: 4, isExit: false }) }, quests: makeQuests() };
    new GameGuidePanel(game).refresh();
    expect(parts.hint.textContent).toBe(t('guide_hint_dungeon_enemies', { enemies: 4 }));
  });

  it('清空且是出口 → 提示离开', () => {
    const game = { dungeons: { getExplorationHint: () => ({ ...dgBase, bossAlive: false, enemies: 0, isExit: true }) }, quests: makeQuests() };
    new GameGuidePanel(game).refresh();
    expect(parts.hint.textContent).toBe(keyText(t('guide_hint_dungeon_exit')));
  });

  it('清空且非出口 → 提示继续探索', () => {
    const game = { dungeons: { getExplorationHint: () => ({ ...dgBase, bossAlive: false, enemies: 0, isExit: false }) }, quests: makeQuests() };
    new GameGuidePanel(game).refresh();
    expect(parts.hint.textContent).toBe(keyText(t('guide_hint_dungeon_explore')));
  });
});

describe('GameGuidePanel 优先级：无任务 → 通关；有任务 → 主线', () => {
  it('无副本、无任务 → 通关文案', () => {
    const game = { quests: makeQuests({ current: null }) };
    new GameGuidePanel(game).refresh();
    expect(parts.title.textContent).toBe(t('guide_title_complete'));
    expect(parts.step.textContent).toBe(keyText(t('guide_step_complete')));
    expect(parts.hint.textContent).toBe(keyText(t('guide_hint_complete')));
  });

  it('有任务 + 有航点 → 章节标题 + 进度 + 航点提示', () => {
    const wp = { label: 'quest_label_go', hint: '往东' };
    const game = {
      quests: makeQuests({
        current: { title: 'main_q' },
        chapter: 3,
        getProgressText: () => '2/5',
        getQuestWaypoint: () => wp,
      }),
    };
    new GameGuidePanel(game).refresh();
    expect(parts.title.textContent).toBe(t('guide_title_chapter_prefix', { chapter: 3 }) + t('main_q'));
    expect(parts.step.textContent).toBe('2/5');
    expect(parts.hint.textContent).toBe(t('guide_hint_waypoint', { label: t('quest_label_go'), hint: '（往东）' }));
  });

  it('有任务但无航点 → 助手提示', () => {
    const game = { quests: makeQuests({ current: { title: 'main_q' }, getQuestWaypoint: () => null, getAssistantHint: () => '按 J 看日志' }) };
    new GameGuidePanel(game).refresh();
    expect(parts.hint.textContent).toBe(t('guide_hint_assistant', { hint: '按 J 看日志' }));
  });
});
