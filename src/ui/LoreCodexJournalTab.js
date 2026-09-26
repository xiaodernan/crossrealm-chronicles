import { CODEX_ZONE_LABELS } from '../game/LoreCodexRegistry.js';
import { keyText, refreshKeyText } from '../content/keyHints.js';

/** [J] 秘典 Tab */
export class LoreCodexJournalTab {
  constructor(game) {
    this.game = game;
    this.filter = 'all';
  }

  render(panelEl) {
    const codex = this.game.loreCodex;
    const stats = codex?.getStats() ?? { unlocked: 0, total: 0, percent: 0 };
    const zones = Object.entries(CODEX_ZONE_LABELS).map(([k, label]) =>
      `<button type="button" class="codex-zone-btn${this.filter === k ? ' active' : ''}" data-z="${k}">${label}</button>`
    ).join('');

    const entries = codex.getEntries(this.filter).map((e) => {
      const ok = codex.unlocked.has(e.id);
      return `<div class="codex-card${ok ? '' : ' codex-locked'}">
        <div class="codex-title">${ok ? e.title : '???'}</div>
        <div class="codex-text">${ok ? keyText(e.text) : '继续探索、对话营火、击败 Boss 以解锁'}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2 data-ktext="位面秘典 · {journal} 关闭"></h2>
      <p class="codex-stats">已收录 ${stats.unlocked} / ${stats.total}（${stats.percent}%）</p>
      <div class="codex-zone-filter">${zones}</div>
      <div class="codex-grid">${entries}</div>
    `;

    refreshKeyText(panelEl);
    panelEl.querySelectorAll('.codex-zone-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.z;
        this.render(panelEl);
      });
    });
  }
}
