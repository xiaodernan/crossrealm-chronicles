import { LORE_CODEX } from './LoreCodexRegistry.js';

import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';

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
    let 有新 = false;
    for (const entry of LORE_CODEX) {
      if (entry.unlock !== key || this.unlocked.has(entry.id)) continue;
      this.unlocked.add(entry.id);
      有新 = true;
      this.game.dialog?.toast(t('lore_codex_unlocked_toast', { title: t(entry.title) }), 3200);
      window.dispatchEvent(new CustomEvent('codex-unlocked', { detail: entry }));
    }
    // W-D2 切片51：读罢虚空编年史 —— 十二条全解锁那一刻落一次剧情旗标
    // （r-archivist 的锁因读的就是这一格；落点去重靠 `_编年史已读`，读档后没有新解锁就不会再落）
    if (有新 && !this._编年史已读 && this.getStats().percent >= 100) {
      this._编年史已读 = true;
      this.game?.stats?.onStoryFlag('void-chronicle-read');
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
