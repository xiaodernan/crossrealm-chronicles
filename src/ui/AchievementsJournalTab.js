import { ACHIEVEMENTS } from '../game/AchievementSystem.js';
import { refreshKeyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

/** [J] 成就墙 Tab */
export class AchievementsJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const ach = this.game.achievements;
    const unlocked = ach?.unlocked ?? new Set();
    const total = ACHIEVEMENTS.length;
    const done = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    const cards = ACHIEVEMENTS.map((a) => {
      const ok = unlocked.has(a.id);
      const progress = ok ? t('achievement_unlocked_label') : this._hint(a, ach?.stats ?? {});
      return `<div class="ach-card${ok ? ' ach-unlocked' : ''}">
        <div class="ach-icon">${ok ? '🏆' : '🔒'}</div>
        <div class="ach-title">${t(a.title)}</div>
        <div class="ach-desc">${t(a.desc)}</div>
        <div class="ach-progress">${progress}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2 data-ktext="成就墙 · {journal} 关闭"></h2>
      <p class="ach-stats">${t('achievement_stats', { done, total, pct })}</p>
      <div class="ach-grid">${cards}</div>
      <p class="hint">${t('achievement_hint')}</p>
    `;

    refreshKeyText(panelEl);
  }

  _hint(a, stats) {
    if (a.id === 'first-blood') return t('achievement_progress_kills', { n: stats.kills ?? 0, max: 1 });
    if (a.id === 'parry-master') return t('achievement_progress_parries', { n: stats.parries ?? 0, max: 5 });
    if (a.id === 'combo-6') return t('achievement_progress_finishers', { n: stats.comboFinishers ?? 0, max: 1 });
    if (a.id === 'explorer') return t('achievement_progress_discoveries', { n: stats.discoveries ?? 0, max: 12 });
    if (a.id === 'journal-keeper') return t('achievement_progress_journal', { n: stats.journalEntries ?? 0, max: 20 });
    if (a.id === 'skill-master') return t('achievement_progress_skills', { n: stats.skills ?? 0, max: 4 });
    if (a.id === 'dungeon-clear') return t('achievement_progress_dungeons', { n: stats.dungeons ?? 0, max: 3 });
    if (a.id === 'lore-scholar') return t('achievement_progress_fragments', { n: stats.loreFragments ?? 0, max: 6 });
    return t('achievement_progress_in_progress');
  }
}
