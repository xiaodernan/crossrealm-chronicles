/** 统一叙事日志 — 探索/碎片/NPC/Boss/地牢，可存档 */
import { isDungeonBossId, bossById } from '../content/bossRoster.js';

import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';
import { objectiveDesc, objectiveJournalByChoice, objectiveTitle } from '../content/objectives.js';

const GAME_STORYJOURNAL = 'game/StoryJournal';
const journalOn = (name, handler) => on(name, handler, GAME_STORYJOURNAL);
/**
 * 日志页签（基础表）。值是**文案键**（W-D2 切片16b）—— 改前是裸中文，
 * 切到英文语言时页签条一半英文一半中文，而没有任何一处会报错。
 * 键在中英两表的登记由 `tests/content-i18n-keys.test.js` 的映射表逐值核；
 * 迁移时的中文原值由 `tests/journal-tab-registry.test.js` 一个不错地钉住。
 * 显示侧在 `HUD.js` 播出那一刻 `t()` 展开（与氛围台词同一纪律）。
 */
export const JOURNAL_CATEGORIES = {
  // 三格复用已有键而不是新开：门禁"同一份文案最多两个键"（tests/i18n.test.js）——
  // 这些词在别的功能里已有两把活键，再开一把就是第三个。仓库惯例是
  // "新增的那格指向已有格"（见 §9 W-D2 切片12）。代价写明：那几把键改名时
  // 本页签跟着变，tests/journal-tab-registry.test.js 的迁移原值钉住会发现。
  all: 'franchise_all_label',      // 全部（秘典/图鉴筛选片同词）
  boss: 'style_label_boss',        // Boss（战斗风格标签同词）
  campfire: 'cg_speaker_campfire', // 营火（CG 讲述者同词）
  quest: 'journal_tab_quest',
  fragment: 'journal_tab_fragment',
  poi: 'journal_tab_poi',
  npc: 'journal_tab_npc',
  dungeon: 'journal_tab_dungeon',
};

export const DISCOVERABLE_TOTAL = 28;

export class StoryJournal {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_STORYJOURNAL);
  }

  constructor(game) {
    this.game = game;
    this.entries = [];
    this.activeTab = 'all';
    this._seen = new Set();
    this._lastQuestIndex = -1;
  }

  has(id) {
    return this.entries.some((e) => e.id === id);
  }

  add({ id, category = 'poi', title, text, chapter, meta, silent = false }) {
    if (!id || this.has(id)) return false;
    const entry = {
      id,
      category,
      title,
      text,
      chapter: chapter ?? this.game?.quests?.chapter ?? 1,
      time: Date.now(),
      meta: meta ?? {},
    };
    this.entries.unshift(entry);
    this._seen.add(id);
    window.dispatchEvent(new CustomEvent('journal-entry', { detail: entry }));
    if (!silent) {
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id, title, text, category } }));
    }
    window.dispatchEvent(new CustomEvent('journal-updated'));
    return true;
  }

  addSilent(entry) {
    return this.add({ ...entry, silent: true });
  }

  getFiltered(tab = this.activeTab) {
    if (tab === 'all') return [...this.entries];
    return this.entries.filter((e) => e.category === tab);
  }

  getCounts() {
    const c = { total: this.entries.length, fragment: 0, poi: 0, npc: 0, boss: 0, dungeon: 0, quest: 0 };
    for (const e of this.entries) {
      if (c[e.category] !== undefined) c[e.category]++;
    }
    return c;
  }

  toJSON() {
    return { entries: this.entries, seen: [...this._seen] };
  }

  fromJSON(data) {
    if (!data) return;
    this.entries = data.entries ?? [];
    this._seen = new Set(data.seen ?? this.entries.map((e) => e.id));
  }

  setupListeners() {
    journalOn('discovery', (e) => {
      const { id, title, text, category } = e.detail;
      if (this.has(id)) return;
      this.addSilent({
        id,
        category: category ?? 'poi',
        title,
        text,
        chapter: this.game.quests.chapter,
      });
      window.dispatchEvent(new CustomEvent('journal-updated'));
    });

    journalOn('dungeon-cleared', (e) => {
      const def = [...(this.game.dungeons?.dungeons?.values() ?? [])].find((d) => d.def.id === e.detail.id)?.def;
      this.add({
        id: `dungeon-clear-${e.detail.id}`,
        category: 'dungeon',
        // W-D2 切片25：`def.name` 本来就是文案键（`content/dungeons.js`），查不到副本定义时
        // 退回 `journal_dungeon_generic_name`。**日志是快照出口**（`HUD.renderJournal` 直接把
        // `d.title` / `d.text` 插进 innerHTML，不过 `t()`），所以展开必须发生在写进去那一刻。
        title: t('journal_dungeon_cleared_fmt', { name: t(def?.name ?? 'journal_dungeon_generic_name') }),
        text: t('journal_dungeon_cleared_text'),
        chapter: this.game.quests.chapter,
        meta: { dungeonId: e.detail.id },
      });
    });

    journalOn('enemy-defeated', (e) => {
      if (e.detail.type !== 'boss' || isDungeonBossId(e.detail.bossId)) return;
      // 显示名从名册读（短名优先）—— 修前这里内联抄了一份 `id → 名` 表，与名册/过场各说各话
      const known = bossById(e.detail.bossId);
      // W-D2 切片24 起名册给的是**键**（`shortNameKey` / `nameKey`），所以这里取键再 `t()`；
      // 名册里没有的那一个（副本 Boss 已在上面被 `isDungeonBossId` 挡掉，剩下的是野生 Boss）
      // 退回事件负载里的 `name` —— 那一格在 `Boss` 构造时就已经展开过，是定稿不是键。
      const titleKey = known?.shortNameKey ?? known?.nameKey;
      const title = titleKey ? t(titleKey) : e.detail.name;
      this.add({
        id: `boss-${e.detail.bossId}`,
        category: 'boss',
        title: t('journal_boss_defeated_fmt', { name: title }),
        text: t('journal_boss_defeated_text'),
        chapter: this.game.quests.chapter,
      });
    });

    journalOn('quest-updated', (e) => {
      const idx = e.detail.index;
      if (idx === this._lastQuestIndex) return;
      this._lastQuestIndex = idx;
      const q = e.detail.current;
      if (!q) return;
      const stats = this.game?.quests?.stats;
      this.addSilent({
        id: `quest-active-${idx}`,
        category: 'quest',
        // W-E3 切片36：标题也问那处算式 —— 真结局的两个名字（封印 / 研习）在这里分开
        title: t(objectiveTitle(q, stats)),
        // W-E3 切片22：日志的正文也问那处算式（抉择那一步之后的真结局会按选中的那条走）
        // 切片36：写了 `journalByChoice` 的行（今天只有真结局）用**结局自己的那一句**简报，
        // 其余各行仍沿用进度句（主线 56 步的 `journal` 格归支线那套读者，不在这里回落）。
        text: t(objectiveJournalByChoice(q, stats) ?? objectiveDesc(q, stats) ?? q.hint ?? 'quest_journal_default_text'),
        chapter: e.detail.chapter,
      });
    });
  }
}
