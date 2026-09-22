/** CG 画廊成就 — 全收集奖励 */
export class CgGalleryAchievements {
  constructor(game) {
    this.game = game;
    this.claimed = new Set();
    window.addEventListener('cg-unlocked', () => this.check());
  }

  check() {
    const cg = this.game.cgGallery;
    if (!cg) return;
    const s = cg.getStats();
    if (s.percent >= 50 && !this.claimed.has('half')) {
      this.claimed.add('half');
      this.game.stats.addSouls(10);
      this.game.dialog.toast('CG 收集过半 · +10 魂火', 3000);
    }
    if (s.percent >= 100 && !this.claimed.has('full')) {
      this.claimed.add('full');
      this.game.stats.addSouls(30);
      this.game.dialog.toast('CG 全收集！· +30 魂火', 4000);
    }
  }

  toJSON() {
    return { claimed: [...this.claimed] };
  }

  fromJSON(data) {
    if (data?.claimed) this.claimed = new Set(data.claimed);
  }
}
