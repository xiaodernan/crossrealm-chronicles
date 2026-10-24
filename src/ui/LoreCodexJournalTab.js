import { CODEX_ZONE_LABELS } from '../game/LoreCodexRegistry.js';
import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';

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
      `<button type="button" class="codex-zone-btn${this.filter === k ? ' active' : ''}" data-z="${k}">${t(label)}</button>`
    ).join('');

    const entries = codex.getEntries(this.filter).map((e) => {
      const ok = codex.unlocked.has(e.id);
      return `<div class="codex-card${ok ? '' : ' codex-locked'}">
        <div class="codex-title">${ok ? t(e.title) : '???'}</div>
        <div class="codex-text">${ok ? keyText(t(e.text)) : t('codex_locked_hint')}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_lore_codex'))}</h2>
      <p class="codex-stats">${t('codex_stats', { unlocked: stats.unlocked, total: stats.total, percent: stats.percent })}</p>
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
