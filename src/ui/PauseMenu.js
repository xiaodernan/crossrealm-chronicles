import { SaveSystem } from '../game/SaveSystem.js';
import { focusFirstItem } from './FocusNav.js';

export class PauseMenu {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('pause-menu');
    this.open = false;
    document.getElementById('pause-resume')?.addEventListener('click', () => this.hide());
    document.getElementById('pause-save')?.addEventListener('click', () => SaveSystem.save(this.game));
    document.getElementById('pause-export')?.addEventListener('click', () => SaveSystem.exportFile(this.game));
    const fileInput = document.getElementById('pause-import-file');
    document.getElementById('pause-import')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) SaveSystem.importFile(this.game, file);
      fileInput.value = '';
    });
    document.getElementById('pause-settings')?.addEventListener('click', () => {
      this.hide();
      this.game.settingsPanel.show();
    });
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.open = true;
    this.game.paused = true;
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    // 一开面板就有"现在选中的是谁"：↑↓ 走出得来，Enter 立刻按得响（切片11）
    focusFirstItem(this.panel);
  }

  hide() {
    this.open = false;
    this.game.paused = false;
    this.panel?.classList.add('hidden');
  }
}
