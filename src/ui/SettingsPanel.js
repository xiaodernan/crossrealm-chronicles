export class SettingsPanel {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('settings-panel');
    this.open = false;
    document.getElementById('settings-close')?.addEventListener('click', () => this.hide());
    this.bindControls();
  }

  bindControls() {
    const s = this.game.settings;
    const bind = (id, key, parse = Number) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        s.set(key, parse(el.value));
        s.applyToGame(this.game);
      });
    };
    bind('set-master-vol', 'masterVolume', Number);
    bind('set-sfx-vol', 'sfxVolume', Number);
    bind('set-bloom', 'bloomStrength', Number);
    bind('set-pixel', 'pixelRatio', Number);
    bind('set-lod', 'enemyLodDistance', Number);
    const sh = document.getElementById('set-shadows');
    sh?.addEventListener('change', () => {
      s.set('shadows', sh.checked);
      s.applyToGame(this.game);
    });
  }

  show() {
    this.open = true;
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    this.refresh();
  }

  hide() {
    this.open = false;
    this.panel?.classList.add('hidden');
  }

  refresh() {
    const d = this.game.settings.data;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('set-master-vol', d.masterVolume);
    set('set-sfx-vol', d.sfxVolume);
    set('set-bloom', d.bloomStrength);
    set('set-pixel', d.pixelRatio);
    set('set-lod', d.enemyLodDistance);
    const sh = document.getElementById('set-shadows');
    if (sh) sh.checked = d.shadows;
  }
}
