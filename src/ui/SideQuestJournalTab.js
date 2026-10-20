import { SIDE_QUESTS_ALL } from '../content/sideQuests.js';
import { keyText, refreshKeyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

/** [J] 支线 Tab */
export class SideQuestJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const sq = this.game.sideQuests;
    const done = sq?.completed ?? new Set();
    const prog = sq?.getProgress?.() ?? { done: 0, total: SIDE_QUESTS_ALL.length };

    const cards = SIDE_QUESTS_ALL.map((q) => {
      const ok = done.has(q.id);
      // W-D2 切片16k：支线的 title / desc 都是**文案键** —— 展开在渲染这一刻。
      return `<div class="sq-card${ok ? ' sq-done' : ''}">
        <div class="sq-title">${ok ? '✓ ' : ''}${t(q.title)}</div>
        <div class="sq-desc">${keyText(t(q.desc))}</div>
        <div class="sq-reward">${t('side_quest_reward', { reward: q.reward })}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2 data-ktext="支线任务 · {journal} 关闭"></h2>
      <p class="sq-stats">${t('side_quest_progress', { done: prog.done, total: prog.total })}</p>
      <div class="sq-grid">${cards}</div>
      <p class="hint">${t('side_quest_hint')}</p>
    `;

    refreshKeyText(panelEl);
  }
}
