/** 统一叙事日志 — 探索/碎片/NPC/Boss/地牢，可存档 */
import { isDungeonBossId } from '../content/bossRoster.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_STORYJOURNAL = 'game/StoryJournal';
const journalOn = (name, handler) => on(name, handler, GAME_STORYJOURNAL);
export const JOURNAL_CATEGORIES = {
  all: '全部',
  quest: '任务',
  fragment: '碎片',
  poi: '探索',
  npc: '人物',
  campfire: '营火',
  boss: 'Boss',
  dungeon: '地下城',
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
      const names = {
        'shadow-warden': '影界守护者',
        archmagus: '大奥术师',
        'singularity-herald': '奇点领主',
        'void-chronarch': '时线执政官',
        'chaos-overlord': '混沌裂隙领主',
      };
      const title = names[e.detail.bossId] ?? e.detail.name;
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
        title: q.title,
        text: q.desc ?? q.hint ?? '新的位面使命已展开。',
        chapter: e.detail.chapter,
      });
    });
  }
}
