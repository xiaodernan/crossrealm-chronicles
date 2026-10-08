import { LORE_CODEX } from './LoreCodexRegistry.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_LORECODEXSYSTEM = 'game/LoreCodexSystem';
const codexOn = (name, handler) => on(name, handler, GAME_LORECODEXSYSTEM);

/** 位面秘典解锁追踪 */
export class LoreCodexSystem {
  /** 秘典解锁监听（六条）都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第六处） */
  dispose() {
    offAll(GAME_LORECODEXSYSTEM);
  }

  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this.setupListeners();
  }

  setupListeners() {
    codexOn('journal-entry', (e) => {
      const id = e.detail?.id;
      if (id) this.tryUnlock(`journal:${id}`);
    });
    codexOn('cg-unlocked', (e) => {
      const id = e.detail?.id;
      if (id) this.tryUnlock(`cg:${id}`);
    });
    codexOn('combo-finisher', () => this.tryUnlock('finisher'));
    codexOn('combat-execution', () => this.tryUnlock('execution'));
    codexOn('dungeon-cleared', () => this.tryUnlock('dungeon-clear'));
    codexOn('boss-defeated', (e) => {
      const id = e.detail?.bossId;
      if (id) this.tryUnlock(`boss:${id}`);
    });
  }

  tryUnlock(key) {
    for (const entry of LORE_CODEX) {
      if (entry.unlock !== key || this.unlocked.has(entry.id)) continue;
      this.unlocked.add(entry.id);
      this.game.dialog?.toast(`📜 秘典：${entry.title}`, 3200);
      window.dispatchEvent(new CustomEvent('codex-unlocked', { detail: entry }));
    }
  }

  getEntries(zone = 'all') {
    return LORE_CODEX.filter((e) => zone === 'all' || e.zone === zone);
  }

  getStats() {
    const total = LORE_CODEX.length;
    const n = this.unlocked.size;
    return { unlocked: n, total, percent: total ? Math.round((n / total) * 100) : 0 };
  }

  toJSON() {
    return { unlocked: [...this.unlocked] };
  }

  fromJSON(data) {
    if (data?.unlocked) this.unlocked = new Set(data.unlocked);
  }
}
