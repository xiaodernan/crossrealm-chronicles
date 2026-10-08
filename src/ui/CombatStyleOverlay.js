/** 战斗风格 HUD 浮层 */
import { on, offAll } from '../engine/EventBus.js';

const UI_COMBATSTYLEOVERLAY = 'ui/CombatStyleOverlay';
const styleOverlayOn = (name, handler) => on(name, handler, UI_COMBATSTYLEOVERLAY);

export class CombatStyleOverlay {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第九处） */
  dispose() {
    offAll(UI_COMBATSTYLEOVERLAY);
  }

  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'combat-style-overlay';
    this.el.className = 'combat-style-overlay hidden';
    this.el.innerHTML = '<span class="css-rank">—</span><span class="css-label"></span>';
    document.body.appendChild(this.el);
    this.hideTimer = 0;
    this.setupListeners();
  }

  setupListeners() {
    styleOverlayOn('combat-style-changed', (e) => {
      const { rank, color, label, score } = e.detail ?? {};
      if (!label && score <= 0) {
        this.el.classList.add('hidden');
        return;
      }
      this.el.querySelector('.css-rank').textContent = rank ?? '—';
      this.el.querySelector('.css-rank').style.color = color ?? '#c9a962';
      this.el.querySelector('.css-label').textContent = label ? `${label} +${score}` : `${score}`;
      this.el.classList.remove('hidden');
      this.hideTimer = 2.2;
    });
  }

  update(dt) {
    if (this.hideTimer <= 0) return;
    this.hideTimer -= dt;
    if (this.hideTimer <= 0 && !this.game.player?.combat?.lockedTarget) {
      this.el.classList.add('hidden');
    }
  }
}
