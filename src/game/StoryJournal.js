/** 统一叙事日志 — 探索/碎片/NPC/Boss/地牢，可存档 */
import { isDungeonBossId, bossById } from '../content/bossRoster.js';

import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';
import { objectiveDesc } from '../content/objectives.js';

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
        title: `${def?.name ?? '地下城'}已征服`,
        text: '迷宫守钥者倒下，位面之门再次闭合。你带走的不只是战利品，还有被埋藏的记忆。',
        chapter: this.game.quests.chapter,
        meta: { dungeonId: e.detail.id },
      });
    });

    journalOn('enemy-defeated', (e) => {
      if (e.detail.type !== 'boss' || isDungeonBossId(e.detail.bossId)) return;
      // 显示名从名册读（短名优先）—— 修前这里内联抄了一份 `id → 名` 表，与名册/过场各说各话
      const known = bossById(e.detail.bossId);
      const title = known?.shortName ?? known?.name ?? e.detail.name;
      this.add({
        id: `boss-${e.detail.bossId}`,
        category: 'boss',
        title: `击败 ${title}`,
        text: '又一道位面枷锁被斩断。锚点的脉动在你胸口回响。',
        chapter: this.game.quests.chapter,
      });
    });

    journalOn('quest-updated', (e) => {
      const idx = e.detail.index;
      if (idx === this._lastQuestIndex) return;
      this._lastQuestIndex = idx;
      const q = e.detail.current;
      if (!q) return;
      this.addSilent({
        id: `quest-active-${idx}`,
        category: 'quest',
        title: t(q.title),
        // W-E3 切片22：日志的正文也问那处算式（抉择那一步之后的真结局会按选中的那条走）
        text: t(objectiveDesc(q, this.game?.quests?.stats) ?? q.hint ?? 'quest_journal_default_text'),
        chapter: e.detail.chapter,
      });
    });
  }
}
