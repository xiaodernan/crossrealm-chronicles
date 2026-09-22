/** 拍照模式 — F2 隐藏 HUD 截屏 */
export class PhotoModeDirector {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.el = document.createElement('div');
    this.el.id = 'photo-mode-hint';
    this.el.className = 'photo-mode-hint hidden';
    this.el.textContent = '拍照模式 · F2 退出 · 滚轮缩放';
    document.body.appendChild(this.el);
  }

  toggle() {
    this.active = !this.active;
    const hud = document.getElementById('hud');
    const journal = document.getElementById('journal-panel');
    const dialog = document.getElementById('dialog-overlay');
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
