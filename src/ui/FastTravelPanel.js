export class FastTravelPanel {
  constructor(game) {
    this.game = game;
    this.panel = document.getElementById('fast-travel-panel');
    this.open = false;
    document.getElementById('fast-travel-close')?.addEventListener('click', () => this.hide());
  }

  show(fromName) {
    this.open = true;
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    const list = document.getElementById('fast-travel-list');
    if (!list) return;
    list.innerHTML = this.game.fastTravel.getDestinations().map((d) => `
      <button type="button" class="ft-btn" data-name="${d.name}" ${d.name === fromName ? 'disabled' : ''}>${d.name}</button>
    `).join('');
    list.querySelectorAll('.ft-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.game.fastTravel.travel(btn.dataset.name);
        this.hide();
      });
    });
  }

  hide() {
    this.open = false;
    this.panel?.classList.add('hidden');
  }
}
