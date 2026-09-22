import { CG_GALLERY_CATALOG, CG_ZONE_LABELS } from './CgGalleryRegistry.js';

/** CG 解锁追踪 — 对话/Boss/战斗演出 */
export class CgGallerySystem {
  constructor(game) {
    this.game = game;
    this.unlocked = new Set();
    this.favorites = new Set();
    this.viewCounts = {};
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('rest-dialogue-node', (e) => {
      const id = `${e.detail.restId}:${e.detail.nodeId}`;
      this.unlock(id, 'dialogue');
    });
    window.addEventListener('combo-finisher', () => this.unlock('bonus:finisher', 'finisher'));
    window.addEventListener('combat-riposte', () => this.unlock('bonus:riposte', 'riposte'));
    window.addEventListener('combat-execution', (e) => {
      if (e.detail?.boss) {
        this.unlock('bonus:execution', 'execution');
        const map = {
          'shadow-warden': 'bonus:boss-shadow',
          archmagus: 'bonus:boss-mage',
          'singularity-herald': 'bonus:boss-singularity',
          'void-chronarch': 'bonus:boss-void',
          'chaos-overlord': 'bonus:boss-chaos',
        };
        const bid = e.detail.bossId;
        if (map[bid]) this.unlock(map[bid], 'boss');
      } else {
        this.unlock('bonus:execution', 'execution');
      }
    });
    window.addEventListener('boss-defeated', (e) => {
      const map = {
        'shadow-warden': 'bonus:boss-shadow',
        archmagus: 'bonus:boss-mage',
        'singularity-herald': 'bonus:boss-singularity',
        'void-chronarch': 'bonus:boss-void',
        'chaos-overlord': 'bonus:boss-chaos',
      };
      const cg = map[e.detail?.bossId];
      if (cg) this.unlock(cg, 'boss');
    });
    window.addEventListener('dungeon-room-cleared', () => this.unlock('bonus:dungeon-clear', 'dungeon'));
    window.addEventListener('chapter-changed', (e) => {
      if ((e.detail?.chapter ?? 1) >= 1) this.unlock('bonus:world-anchor', 'quest');
    });
  }

  unlock(id, source = 'unknown') {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    const entry = CG_GALLERY_CATALOG.find((c) => c.id === id);
    window.dispatchEvent(new CustomEvent('cg-unlocked', {
      detail: { id, caption: entry?.caption ?? id, source },
    }));
    this.game.dialog?.toast?.(`CG 解锁：${entry?.caption ?? id}`, 2600);
    return true;
  }

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  getEntries(filterZone = 'all', onlyUnlocked = true) {
    return CG_GALLERY_CATALOG.filter((e) => {
      if (onlyUnlocked && !this.unlocked.has(e.id)) return false;
      if (filterZone !== 'all' && e.zone !== filterZone) return false;
      return true;
    }).sort((a, b) => a.sort - b.sort);
  }

  getLockedPreview(filterZone = 'all') {
    return CG_GALLERY_CATALOG.filter((e) => {
      if (this.unlocked.has(e.id)) return false;
      if (filterZone !== 'all' && e.zone !== filterZone) return false;
      return true;
    });
  }

  recordView(id) {
    this.viewCounts[id] = (this.viewCounts[id] ?? 0) + 1;
  }

  toggleFavorite(id) {
    if (this.favorites.has(id)) this.favorites.delete(id);
    else this.favorites.add(id);
  }

  getStats() {
    const total = CG_GALLERY_CATALOG.length;
    return {
      unlocked: this.unlocked.size,
      total,
      percent: Math.round((this.unlocked.size / total) * 100),
      favorites: this.favorites.size,
    };
  }

  toJSON() {
    return {
      unlocked: [...this.unlocked],
      favorites: [...this.favorites],
      viewCounts: this.viewCounts,
    };
  }

  fromJSON(data) {
    if (!data) return;
    this.unlocked = new Set(data.unlocked ?? []);
    this.favorites = new Set(data.favorites ?? []);
    this.viewCounts = data.viewCounts ?? {};
  }
}

export { CG_ZONE_LABELS };
