import { LORE_CODEX } from './LoreCodexRegistry.js';

/** 位面秘典解锁追踪 */
export class LoreCodexSystem {
  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('journal-entry', (e) => {
      const id = e.detail?.id;
      if (id) this.tryUnlock(`journal:${id}`);
    });
    window.addEventListener('cg-unlocked', (e) => {
      const id = e.detail?.id;
      if (id) this.tryUnlock(`cg:${id}`);
    });
    window.addEventListener('combo-finisher', () => this.tryUnlock('finisher'));
    window.addEventListener('combat-execution', () => this.tryUnlock('execution'));
    window.addEventListener('dungeon-cleared', () => this.tryUnlock('dungeon-clear'));
    window.addEventListener('boss-defeated', (e) => {
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
