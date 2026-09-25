import { focusFirstItem } from './FocusNav.js';

export class FastTravelPanel {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('fast-travel-panel');
    this.open = false;
    document.getElementById('fast-travel-close')?.addEventListener('click', () => this.hide());
  }

  /** @param {string|null} currentId 玩家正站着的那座营火 id（不是显示名） */
  show(currentId = null) {
    this.open = true;
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    const list = document.getElementById('fast-travel-list');
    if (list) {
      list.innerHTML = this.game.fastTravel.destinationsForPanel(currentId).map((d) => `
        <button type="button" class="ft-btn" data-id="${d.id}" ${d.here ? 'disabled' : ''}>${d.name}</button>
      `).join('');
      list.querySelectorAll('.ft-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.game.fastTravel.travel(btn.dataset.id);
          this.hide();
        });
      });
    }
    // 目的地那几格是这一刻现拼的：先拼再落焦（早一步清单还是上一座营火的）。
    // 站着的那座营火那格是 `disabled`，`navItems` 本来就不收它 —— 第一下 ↑↓ 落在真正能去的地方。
    focusFirstItem(this.panel);
  }

  hide() {
    this.open = false;
    this.panel?.classList.add('hidden');
  }
}
