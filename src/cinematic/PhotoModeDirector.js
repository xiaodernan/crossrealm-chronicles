import { keyText } from '../content/keyHints.js';

/** 拍照模式 — 隐藏 HUD 截屏（退出键名在每次显示时现问生效表） */
export class PhotoModeDirector {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.el = document.createElement('div');
    this.el.id = 'photo-mode-hint';
    this.el.className = 'photo-mode-hint hidden';
    document.body.appendChild(this.el);
  }

  toggle() {
    this.active = !this.active;
    const hud = document.getElementById('hud');
    const journal = document.getElementById('journal-panel');
    const dialog = document.getElementById('dialog-overlay');
    this.el.textContent = keyText('拍照模式 · {photoMode} 退出 · 滚轮缩放');
    if (this.active) {
      hud?.classList.add('photo-hidden');
      journal?.classList.add('photo-hidden');
      this.el.classList.remove('hidden');
      this.game.dialog?.toast('拍照模式 — UI 已隐藏', 2200);
      document.exitPointerLock?.();
    } else {
      hud?.classList.remove('photo-hidden');
      journal?.classList.remove('photo-hidden');
      this.el.classList.add('hidden');
      this.game.dialog?.toast('已退出拍照模式');
    }
    window.dispatchEvent(new CustomEvent('photo-mode-changed', { detail: { active: this.active } }));
  }

  update(dt) {
    if (!this.active) return;
    this.game.player?.adjustZoom?.(0);
  }
}
