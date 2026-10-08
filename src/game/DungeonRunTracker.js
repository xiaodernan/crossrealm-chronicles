/** 地下城通关记录 — 次数 / 最近用时 / 最佳探索 */
import { on, offAll } from '../engine/EventBus.js';

const GAME_DUNGEONRUNTRACKER = 'game/DungeonRunTracker';
const runTrackerOn = (name, handler) => on(name, handler, GAME_DUNGEONRUNTRACKER);

export class DungeonRunTracker {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_DUNGEONRUNTRACKER);
  }

  constructor(game) {
    this.game = game;
    this.clears = {};
    this.runs = [];
    this.activeRun = null;
    this.setupListeners();
  }

  setupListeners() {
    runTrackerOn('dungeon-enter', (e) => {
      const id = e.detail?.id ?? e.detail?.dungeonId;
      this.activeRun = { id, start: performance.now(), rooms: 0, entered: Date.now() };
    });
    runTrackerOn('dungeon-room-enter', () => {
      if (this.activeRun) this.activeRun.rooms += 1;
    });
    runTrackerOn('dungeon-cleared', (e) => {
      const id = e.detail?.id;
      if (!id) return;
      const elapsed = this.activeRun?.id === id
        ? (performance.now() - this.activeRun.start) / 1000
        : 0;
      this.clears[id] = (this.clears[id] ?? 0) + 1;
      const entry = {
        id,
        name: this._name(id),
        elapsed: Math.round(elapsed),
        rooms: this.activeRun?.rooms ?? 0,
        chapter: this.game.quests?.chapter ?? 1,
        time: Date.now(),
      };
      this.runs.unshift(entry);
      if (this.runs.length > 40) this.runs.pop();
      this.activeRun = null;
      window.dispatchEvent(new CustomEvent('dungeon-run-logged', { detail: entry }));
    });
  }

  _name(id) {
    const d = this.game.dungeons?.dungeons?.get?.(id);
    return d?.def?.name ?? id;
  }

  getStats() {
    const total = Object.values(this.clears).reduce((s, n) => s + n, 0);
    return { totalClears: total, dungeons: Object.keys(this.clears).length, runs: this.runs.length };
  }

  toJSON() {
    return { clears: { ...this.clears }, runs: this.runs.slice(0, 40) };
  }

  fromJSON(data) {
    if (!data) return;
    this.clears = { ...(data.clears ?? {}) };
    this.runs = data.runs ?? [];
  }
}
