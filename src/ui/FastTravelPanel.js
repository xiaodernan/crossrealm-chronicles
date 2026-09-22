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
    if (!list) return;
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

  hide() {
    this.open = false;
    this.panel?.classList.add('hidden');
  }
}
