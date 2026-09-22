/** 连杀魂火 — 短时间多杀奖励 */
export class SoulStreakSystem {
  constructor(game) {
    this.game = game;
    this.streak = 0;
    this.timer = 0;
    this.best = 0;
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('enemy-defeated', (e) => {
      if (e.detail?.type === 'dummy') return;
      this.streak += 1;
      this.timer = 4.5;
      if (this.streak >= 3) {
        const bonus = Math.min(this.streak, 8);
        this.game.stats.addSouls(bonus);
        this.game.dialog.toast(`连杀 ×${this.streak} · +${bonus} 魂火`, 1800);
        window.dispatchEvent(new CustomEvent('soul-streak', { detail: { streak: this.streak, bonus } }));
      }
      if (this.streak > this.best) this.best = this.streak;
    });
    window.addEventListener('player-respawn', () => {
      this.streak = 0;
      this.timer = 0;
    });
  }

  update(dt) {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) this.streak = 0;
  }

  toJSON() {
    return { best: this.best };
  }

  fromJSON(data) {
    if (data) this.best = data.best ?? 0;
  }
}
