/** 逆相界视觉 — 破碎时线红色孢子 overlay（怪奇物语气质） */
export class UpsideDownVisualPass {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'upside-down-fx';
    this.el.className = 'upside-down-fx hidden';
    document.body.appendChild(this.el);
    this.active = false;
    this.pulse = 0;
    window.addEventListener('zone-changed', (e) => this.onZone(e));
  }

  onZone(e) {
    const name = e.detail.zone?.name ?? '';
    if (name.includes('时线') || name.includes('破碎')) this.enable();
    else this.disable();
  }

  enable() {
    this.active = true;
    this.el.classList.remove('hidden');
  }

  disable() {
    this.active = false;
    this.el.classList.add('hidden');
  }

  update(dt) {
    if (!this.active) return;
    this.pulse += dt;
    const o = 0.08 + Math.sin(this.pulse * 1.2) * 0.04;
    this.el.style.opacity = String(o);
  }
}
