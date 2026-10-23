/** CG 画廊成就 — 全收集奖励 */
import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';

const GAME_CGGALLERYACHIEVEMENTS = 'game/CgGalleryAchievements';
const cgAchOn = (name, handler) => on(name, handler, GAME_CGGALLERYACHIEVEMENTS);

export class CgGalleryAchievements {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_CGGALLERYACHIEVEMENTS);
  }

  constructor(game) {
    this.game = game;
    this.claimed = new Set();
    cgAchOn('cg-unlocked', () => this.check());
  }
  check() {
    const cg = this.game.cgGallery;
    if (!cg) return;
    const s = cg.getStats();
    if (s.percent >= 50 && !this.claimed.has('half')) {
      this.claimed.add('half');
      this.game.stats.addSouls(10);
      this.game.dialog.toast(t('cg_achieve_half_fmt', { souls: 10 }), 3000);
    }
    if (s.percent >= 100 && !this.claimed.has('full')) {
      this.claimed.add('full');
      this.game.stats.addSouls(30);
      this.game.dialog.toast(t('cg_achieve_full_fmt', { souls: 30 }), 4000);
    }
  }

  toJSON() {
    return { claimed: [...this.claimed] };
  }

  fromJSON(data) {
    if (data?.claimed) this.claimed = new Set(data.claimed);
  }
}
