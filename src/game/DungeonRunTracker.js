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
      /* `秒` 是**世界时**：只在本系统被 `update(dt)` 驱动时前进（`Game` 只在"在玩的那些帧"喂）。
       *  改前这里存的是 `start: performance.now()`，于是日志那一行「Ch1 · 70s · 1 房」里
       *  有 60 秒是玩家开着暂停菜单的时间（探针 `.tmp-20261015/probe-b118-2.mjs` P2 实测）。 */
      this.activeRun = { id, 秒: 0, rooms: 0 };
    });
    runTrackerOn('dungeon-room-enter', () => {
      if (this.activeRun) this.activeRun.rooms += 1;
    });
    runTrackerOn('dungeon-cleared', (e) => {
      const id = e.detail?.id;
      if (!id) return;
      const elapsed = this.activeRun?.id === id ? this.activeRun.秒 : 0;
      this.clears[id] = (this.clears[id] ?? 0) + 1;
      const entry = {
        id,
        name: this._name(id),
        elapsed: Math.round(elapsed),
        rooms: this.activeRun?.rooms ?? 0,
        chapter: this.game.quests?.chapter ?? 1,
        /** 记录发生的真实时刻 —— 这一格本来就该是墙钟（存档里的时间戳，不是"跑了多久"） */
        time: Date.now(),
      };
      this.runs.unshift(entry);
      if (this.runs.length > 40) this.runs.pop();
      this.activeRun = null;
      window.dispatchEvent(new CustomEvent('dungeon-run-logged', { detail: entry }));
    });
  }

  /** 世界时的推进口：`Game` 只在"在玩的那些帧"喂这里，暂停/过场期间一帧都不加。
   *  这就是这一片要的东西 —— 日志里的「用时」是玩家在副本里走了多久，不是他开着菜单多久。 */
  update(dt) {
    if (this.activeRun) this.activeRun.秒 += dt;
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
