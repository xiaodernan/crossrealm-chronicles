// JournalTabRegistry 的覆盖 —— 这个模块此前全仓无测试，而 HUD 直接依赖它
// （`HUD.js:577` `mergeJournalCategories(JOURNAL_CATEGORIES)`），且对**每一个**扩展页签键
// 都写了一条专属计数分支（`HUD.js:579-588`：cg/achievements/codex/memory/dungeons/skills/
// side/echoes 各一条，其余走 `getCounts()` 兜底）。于是"加一个页签却忘了加 HUD 计数分支"
// 会静默丢掉那个数字 —— 第三条用例把键集合钉住，逼改的人至少看见这层契约。
import { describe, it, expect } from 'vitest';
import { JOURNAL_EXTRA_TABS, mergeJournalCategories } from '../src/ui/JournalTabRegistry.js';
import { JOURNAL_CATEGORIES } from '../src/game/StoryJournal.js';

describe('日志页签合并（JournalTabRegistry）', () => {
  it('合并结果 = 基础 ∪ 扩展，两边页签一个都不少', () => {
    const cats = mergeJournalCategories(JOURNAL_CATEGORIES);
    for (const [k, label] of Object.entries(JOURNAL_EXTRA_TABS)) expect(cats[k]).toBe(label);
    for (const [k, label] of Object.entries(JOURNAL_CATEGORIES)) expect(cats[k]).toBe(label);
  });

  it('纯函数：不改动入参 base', () => {
    const base = { all: '全部' };
    const snapshot = JSON.stringify(base);
    mergeJournalCategories(base);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('扩展页签的键集合是 HUD 计数分支认得的那 8 个（加/改页签时这里会红，提醒同步 HUD）', () => {
    expect(Object.keys(JOURNAL_EXTRA_TABS).sort()).toEqual(
      ['achievements', 'cg', 'codex', 'dungeons', 'echoes', 'memory', 'side', 'skills'],
    );
  });
});
