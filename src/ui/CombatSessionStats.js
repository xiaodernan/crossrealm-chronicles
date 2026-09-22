/** 本局战斗统计浮层 — Backquote 切换 */
export class CombatSessionStats {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'session-stats';
    this.el.className = 'session-stats hidden';
    document.body.appendChild(this.el);
    this.visible = false;
    this.kills = 0;
    this.parries = 0;
    this.finishers = 0;
    this.executions = 0;
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('enemy-defeated', (e) => {
      if (e.detail?.type !== 'dummy') this.kills += 1;
      this.refresh();
    });
    window.addEventListener('parry-success', () => { this.parries += 1; this.refresh(); });
    window.addEventListener('combo-finisher', () => { this.finishers += 1; this.refresh(); });
    window.addEventListener('combat-execution', () => { this.executions += 1; this.refresh(); });
    window.addEventListener('player-respawn', () => this.reset());
  }

  toggle() {
    this.visible = !this.visible;
    this.el.classList.toggle('hidden', !this.visible);
    this.refresh();
  }

  reset() {
    this.kills = 0;
    this.parries = 0;
    this.finishers = 0;
    this.executions = 0;
    this.refresh();
  }

  refresh() {
    if (!this.visible) return;
    const style = this.game.combatStyle?.getRank?.() ?? { label: '—' };
    const streak = this.game.soulStreak?.best ?? 0;
    this.el.innerHTML = `
      <div class="ss-title">本局统计 · ~ 关闭</div>
      <div>击杀 ${this.kills} · 弹反 ${this.parries}</div>
      <div>终结 ${this.finishers} · 处决 ${this.executions}</div>
      <div>风格 ${style.label} · 连杀最佳 ×${streak}</div>
    `;
  }
}
