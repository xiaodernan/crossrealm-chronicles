import { ACHIEVEMENTS } from '../game/AchievementSystem.js';
import { refreshKeyText } from '../content/keyHints.js';

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
      const progress = ok ? '已解锁' : this._hint(a, ach?.stats ?? {});
      return `<div class="ach-card${ok ? ' ach-unlocked' : ''}">
        <div class="ach-icon">${ok ? '🏆' : '🔒'}</div>
        <div class="ach-title">${a.title}</div>
        <div class="ach-desc">${a.desc}</div>
        <div class="ach-progress">${progress}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2 data-ktext="成就墙 · {journal} 关闭"></h2>
      <p class="ach-stats">已解锁 ${done} / ${total}（${pct}%）</p>
      <div class="ach-grid">${cards}</div>
      <p class="hint">弹反、连击终结、Boss 击破、探索发现都会推进成就</p>
    `;

    refreshKeyText(panelEl);
  }

  _hint(a, stats) {
    if (a.id === 'first-blood') return `击杀 ${stats.kills ?? 0}/1`;
    if (a.id === 'parry-master') return `弹反 ${stats.parries ?? 0}/5`;
    if (a.id === 'combo-6') return `终结 ${stats.comboFinishers ?? 0}/1`;
    if (a.id === 'explorer') return `发现 ${stats.discoveries ?? 0}/12`;
    if (a.id === 'journal-keeper') return `日志 ${stats.journalEntries ?? 0}/20`;
    if (a.id === 'skill-master') return `技能 ${stats.skills ?? 0}/4`;
    if (a.id === 'dungeon-clear') return `地下城 ${stats.dungeons ?? 0}/3`;
    if (a.id === 'lore-scholar') return `碎片 ${stats.loreFragments ?? 0}/6`;
    return '进行中…';
  }
}
