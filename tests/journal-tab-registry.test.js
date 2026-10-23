// JournalTabRegistry 的覆盖 —— 这个模块此前全仓无测试，而 HUD 直接依赖它
// （`HUD.js` `mergeJournalCategories(JOURNAL_CATEGORIES)`），且对**每一个**扩展页签键
// 都写了一条专属计数分支（cg/achievements/codex/memory/dungeons/skills/side/echoes
// 各一条，其余走 `getCounts()` 兜底）。于是"加一个页签却忘了加 HUD 计数分支"
// 会静默丢掉那个数字 —— 键集合那条把键钉住，逼改的人至少看见这层契约。
//
// W-D2 切片16b 起两张表的值是**文案键**（改前是裸中文，切英文时页签条半英半中而
// 不报错）。于是本文件多盯两件事：
// ① 迁移原值钉死 —— 十六个键展开后必须逐字等于迁移前的中文（一个都没换）；
// ② 消歧仍在 —— `journal_tab_dungeon`（地下城）与 `journal_tab_dungeons`（地下城通关）
//    展开后必须不同（`8c0f330` 修的那个"两个同名页签"不许回来）。
// 键在中英两表的登记由 `tests/content-i18n-keys.test.js` 的映射表逐值核。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOURNAL_EXTRA_TABS, mergeJournalCategories } from '../src/ui/JournalTabRegistry.js';
import { JOURNAL_CATEGORIES } from '../src/game/StoryJournal.js';
import { t } from '../src/engine/i18n.js';

/** 迁移前（2026-10-23 之前）两张表里的裸中文 —— 一个不错地钉在这 */
const 迁移前中文 = {
  all: '全部', quest: '任务', fragment: '碎片', poi: '探索', npc: '人物',
  campfire: '营火', boss: 'Boss', dungeon: '地下城',
  cg: 'CG画廊', achievements: '成就', codex: '秘典', memory: '营火记忆',
  dungeons: '地下城通关', skills: '流派', side: '支线', echoes: '次元回声',
};

describe('日志页签合并（JournalTabRegistry）', () => {
  it('合并结果 = 基础 ∪ 扩展，两边页签一个都不少', () => {
    const cats = mergeJournalCategories(JOURNAL_CATEGORIES);
    for (const [k, label] of Object.entries(JOURNAL_EXTRA_TABS)) expect(cats[k]).toBe(label);
    for (const [k, label] of Object.entries(JOURNAL_CATEGORIES)) expect(cats[k]).toBe(label);
  });

  it('纯函数：不改动入参 base', () => {
    const base = { all: 'journal_tab_all' };
    const snapshot = JSON.stringify(base);
    mergeJournalCategories(base);
    expect(JSON.stringify(base)).toBe(snapshot);
  });

  it('扩展页签的键集合是 HUD 计数分支认得的那 8 个（加/改页签时这里会红，提醒同步 HUD）', () => {
    expect(Object.keys(JOURNAL_EXTRA_TABS).sort()).toEqual(
      ['achievements', 'cg', 'codex', 'dungeons', 'echoes', 'memory', 'side', 'skills'],
    );
  });

  it('合并后的页签标签不重复（两个同名页签玩家分不出谁是谁）', () => {
    // 值是文案键 ⇒ 唯一性要落在**展开后**的标签上（键唯一不等于话说出来不重名，
    // 而玩家看见的是话）。默认语言即 zh。
    const cats = mergeJournalCategories(JOURNAL_CATEGORIES);
    const labels = Object.values(cats).map((k) => t(k));
    const dup = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect([...new Set(dup)], `重复的页签标签: ${[...new Set(dup)].join(' / ')}`).toEqual([]);
  });

  it('迁移原值钉死：十六个键展开后逐字等于迁移前的中文（一个都没换）', () => {
    const cats = mergeJournalCategories(JOURNAL_CATEGORIES);
    expect(Object.keys(cats).sort()).toEqual(Object.keys(迁移前中文).sort());
    for (const [k, 原值] of Object.entries(迁移前中文)) {
      expect(t(cats[k]), `页签 "${k}" 的文案变了`).toBe(原值);
    }
  });

  it('消歧仍在：地下城（清空记录）与地下城通关（通关统计）展开后必须不同', () => {
    expect(t(JOURNAL_CATEGORIES.dungeon)).toBe('地下城');
    expect(t(JOURNAL_EXTRA_TABS.dungeons)).toBe('地下城通关');
    expect(t(JOURNAL_CATEGORIES.dungeon)).not.toBe(t(JOURNAL_EXTRA_TABS.dungeons));
  });

  it('HUD 渲染走 t() 展开，不再把裸标签插进 innerHTML', () => {
    // 静态腿：数据层存键之后，显示侧必须真的展开。这两处漏一圈，
    // 页签条上出现的就是 `journal_tab_xxx` 这串键本身。
    const 源 = readFileSync(join(process.cwd(), 'src', 'ui', 'HUD.js'), 'utf8');
    expect(源, '页签按钮没有 t(label) 展开').toMatch(/data-tab="\$\{k\}">\$\{t\(label\)\}/);
    expect(源, '页签按钮还在插裸 label').not.toMatch(/\$\{label\}\$\{suffix\}/);
    expect(源, '条目分类角标没有展开').toMatch(/journal-cat">\$\{cats\[d\.category\] \? t\(cats\[d\.category\]\) : d\.category\}/);
    expect(源, '角标还在用 ?? 短路插裸键').not.toMatch(/cats\[d\.category\] \?\? d\.category/);
  });
});