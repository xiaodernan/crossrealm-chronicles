import { SIDE_QUESTS } from '../game/SideQuestRegistry.js';
import { keyText, refreshKeyText } from '../content/keyHints.js';

/** [J] 支线 Tab */
export class SideQuestJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const sq = this.game.sideQuests;
    const done = sq?.completed ?? new Set();
    const prog = sq?.getProgress?.() ?? { done: 0, total: SIDE_QUESTS.length };

    const cards = SIDE_QUESTS.map((q) => {
      const ok = done.has(q.id);
      return `<div class="sq-card${ok ? ' sq-done' : ''}">
        <div class="sq-title">${ok ? '✓ ' : ''}${q.title}</div>
        <div class="sq-desc">${keyText(q.desc)}</div>
        <div class="sq-reward">奖励 ${q.reward} 魂火</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2 data-ktext="支线任务 · {journal} 关闭"></h2>
      <p class="sq-stats">完成 ${prog.done} / ${prog.total}</p>
      <div class="sq-grid">${cards}</div>
      <p class="hint">支线自动检测 — 连杀、CG、营火、再战、拍照等</p>
    `;

    refreshKeyText(panelEl);
  }
}
