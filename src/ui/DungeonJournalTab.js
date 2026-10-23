/** [J] 地下城 Tab — 通关记录 */
import { keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

export class DungeonJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const tracker = this.game.dungeonRuns;
    const stats = tracker?.getStats() ?? { totalClears: 0, dungeons: 0, runs: 0 };
    const runs = tracker?.runs ?? [];

    const summary = Object.entries(tracker?.clears ?? {}).map(([id, n]) =>
      `<div class="dg-stat-row"><span>${tracker._name?.(id) ?? id}</span><span>${t('journal_stat_count_fmt', { n })}</span></div>`
    ).join('') || '<p class="dg-empty">' + t('journal_dungeon_empty') + '</p>';

    const list = runs.slice(0, 16).map((r) =>
      `<li class="dg-run"><span class="dg-run-meta">${t('journal_dungeon_run_meta_fmt', { chapter: r.chapter, elapsed: r.elapsed, rooms: r.rooms })}</span>
       <strong>${r.name}</strong></li>`
    ).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_dungeon_runs'))}</h2>
      <p class="dg-stats">${t('journal_dungeon_stats_fmt', { clears: stats.totalClears, dungeons: stats.dungeons })}</p>
      <div class="dg-section"><h3>${t('journal_dungeon_summary_title')}</h3>${summary}</div>
      <h3>${t('journal_dungeon_recent_title')}</h3>
      <ul class="dg-run-list">${list || `<li class="empty">${keyText(t('journal_dungeon_empty_hint'))}</li>`}</ul>
      <p class="hint">${t('journal_dungeon_hint')}</p>
    `;
  }
}
