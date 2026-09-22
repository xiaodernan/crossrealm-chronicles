/** 三巨头视觉 Pass — 西部尘雾 / 黑帮 noir / 深空扫描线 */
export class PopCultureTriadVisualPass {
  constructor(game) {
    this.game = game;
    this.mode = null;
    this.flashTimer = 0;
    this.pulse = 0;

    this.layers = {
      western: this._mk('triad-fx triad-western hidden'),
      noir: this._mk('triad-fx triad-noir hidden'),
      scifi: this._mk('triad-fx triad-scifi hidden'),
    };

    window.addEventListener('zone-changed', (e) => this.onZone(e));
  }

  _mk(cls) {
    const el = document.createElement('div');
    el.className = cls;
    document.body.appendChild(el);
    return el;
  }

  onZone(e) {
    const name = e.detail?.zone?.name ?? '';
    if (name.includes('灰白')) this.setMode('western');
    else if (name.includes('混沌')) this.setMode('noir');
    else if (name.includes('米勒')) this.setMode('scifi');
    else this.setMode(null);
  }

  setMode(mode) {
    this.mode = mode;
    for (const [k, el] of Object.entries(this.layers)) {
      el.classList.toggle('hidden', k !== mode);
    }
  }

  flash(mode) {
    this.flashTimer = 1.2;
    if (mode) this.setMode(mode);
  }

  update(dt) {
    if (!this.mode) return;
    this.pulse += dt;
    const el = this.layers[this.mode];
    if (!el) return;
    const base = this.flashTimer > 0 ? 0.14 : 0.08;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    el.style.opacity = String(base + Math.sin(this.pulse * 1.5) * 0.03);
  }
}
