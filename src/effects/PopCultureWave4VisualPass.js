/** Wave4 视觉 — POI 交互时 flash overlay（不与 Triad 位面 overlay 冲突） */
import { shouldUpdate as frameShouldUpdate } from '../engine/FrameBudget.js';
export class PopCultureWave4VisualPass {
  constructor(game) {
    this.game = game;
    this.mode = null;
    this.flashTimer = 0;
    this.pulse = 0;
    this.layers = {
      cyber: this._mk('wave4-fx wave4-cyber hidden'),
      samurai: this._mk('wave4-fx wave4-samurai hidden'),
      cosmic: this._mk('wave4-fx wave4-cosmic hidden'),
      starport: this._mk('wave4-fx wave4-starport hidden'),
    };
  }

  _mk(cls) {
    const el = document.createElement('div');
    el.className = cls;
    document.body.appendChild(el);
    return el;
  }

  setMode(mode) {
    this.mode = mode;
    for (const [k, el] of Object.entries(this.layers)) {
      el.classList.toggle('hidden', k !== mode);
    }
  }

  flash(mode) {
    this.flashTimer = 1.4;
    if (mode) this.setMode(mode);
  }

  update(dt) {
    if (!this.mode) return;
    // 远距离视觉 LOD：1/4 帧率更新
    if (!frameShouldUpdate(4)) return;
    this.pulse += dt;
    const el = this.layers[this.mode];
    if (!el) return;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    else {
      this.setMode(null);
      return;
    }
    const o = 0.1 + Math.sin(this.pulse * 2) * 0.04;
    el.style.opacity = String(o);
  }
}
