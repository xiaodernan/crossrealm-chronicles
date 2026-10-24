import { SIDE_QUESTS_ALL } from '../content/sideQuests.js';
import { ZONE_NAMES } from '../content/ZoneIdentity.js';
import { keyText, refreshKeyText } from './keyHints.js';
import { t } from '../engine/i18n.js';

/**
 * 位面徽标：这条支线绑在哪座位面（W-B12 切片6）。
 *
 * 为什么需要它：分区支线（`side-zone-<区>` / `side-wisp-<区>`）与单系列致敬支线
 * （`side-<系列>-tour`）都**绑在某一座位面**上，而页签上 31 张卡排在一起时，
 * 玩家分不出"这条是那边的" —— 于是"去那座区做这件事"这件事在纸面上没有着落。
 *
 * `global` 的那些**不挂徽标**：它们不属于任何一座区，挂了等于说谎。
 */
function 位面徽标(zone) {
  const 键 = zone && zone !== 'global' ? ZONE_NAMES[zone] : null;
  if (!键) return '';
  return `<span class="sq-zone">${t('side_quest_zone_badge', { zone: t(键) })}</span>`;
}

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
        <div class="sq-head">
          <div class="sq-title">${ok ? '✓ ' : ''}${t(q.title)}</div>
          ${位面徽标(q.zone)}
        </div>
        <div class="sq-desc">${keyText(t(q.desc))}</div>
        <div class="sq-reward">${t('side_quest_reward', { reward: q.reward })}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_side_quests'))}</h2>
      <p class="sq-stats">${t('side_quest_progress', { done: prog.done, total: prog.total })}</p>
      <div class="sq-grid">${cards}</div>
      <p class="hint">${t('side_quest_hint')}</p>
    `;

    refreshKeyText(panelEl);
  }
}
