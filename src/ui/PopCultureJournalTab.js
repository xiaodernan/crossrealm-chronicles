import { FRANCHISE_LABELS, franchiseLabel } from '../content/franchises.js';
import { keyText, refreshKeyText } from './keyHints.js';
import { t, getLanguage } from '../engine/i18n.js';

/** [J] 次元回声 Tab — HP / 星际 / 怪奇等致敬图鉴 */
export class PopCultureJournalTab {
  constructor(game) {
    this.game = game;
    this.filter = 'all';
  }

  render(panelEl) {
    const sys = this.game.popCulture;
    const stats = sys?.getStats() ?? { unlocked: 0, total: 0, percent: 0 };
    const filters = Object.entries(FRANCHISE_LABELS).map(([k, label]) =>
      `<button type="button" class="pc-filter-btn${this.filter === k ? ' active' : ''}" data-f="${k}">${label}</button>`
    ).join('');

    const cards = sys.getEntries(this.filter).map((e) => {
      const ok = sys.unlocked.has(e.id);
      return `<div class="pc-card${ok ? '' : ' pc-locked'}">
        <span class="pc-franchise">${franchiseLabel(e.franchise, getLanguage())}</span>
        <div class="pc-title">${ok ? t(e.title) : '???'}</div>
        <div class="pc-desc">${ok ? keyText(t(e.desc)) : t('pop_culture_echo_locked_hint')}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_dimension_echoes'))}</h2>
      <p class="pc-stats">${t('pop_culture_stats', { unlocked: stats.unlocked, total: stats.total, percent: stats.percent })}</p>
      <p class="pc-note">${t('pop_culture_note')}</p>
      <div class="pc-filter">${filters}</div>
      <div class="pc-grid">${cards}</div>
    `;

    refreshKeyText(panelEl);
    panelEl.querySelectorAll('.pc-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.f;
        this.render(panelEl);
      });
    });
  }
}
