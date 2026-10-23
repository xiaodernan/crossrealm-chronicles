import { refreshKeyText, keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

/** [J] 营火记忆 Tab */
export class CampfireMemoryJournalTab {
  constructor(game) {
    this.game = game;
    this.filter = 'all';
  }

  render(panelEl) {
    const mem = this.game.campfireMemory;
    if (!mem) return;
    const stats = mem.getStats();
    // 营火的名字只有一份（`content/restPointNames.js` → 世界里的营火 → `nameOf(id)`），这里不抄表。
    // 这句话曾经只是愿望：对话树自己抄过一份，于是枢纽那座在提示里叫"世界之锚休息点"、
    // 在对话标题里叫"世界之锚营火"（W-B4 切片2 把抄本删掉，四处界面从此问同一个源）
    const restPoints = this.game.restPoints;
    const nameOf = (id) => restPoints?.nameOf(id) ?? id;
    const zones = ['all', ...(restPoints?.ids() ?? Object.keys(mem.restCount))];
    const filterBtns = zones.map((z) =>
      `<button type="button" class="cf-filter-btn${this.filter === z ? ' active' : ''}" data-z="${z}">${z === 'all' ? t('cg_zone_all') : nameOf(z)}</button>`
    ).join('');

    const rests = Object.entries(mem.restCount).map(([id, n]) =>
      `<div class="cf-stat-row"><span>${nameOf(id)}</span><span>${t('journal_stat_count_fmt', { n })}</span></div>`
    ).join('') || '<p class="cf-empty">' + t('journal_campfire_empty') + '</p>';

    const nodes = mem.getMemories(this.filter).slice(0, 24).map((m) =>
      `<li class="cf-node"><span class="cf-node-meta">Ch${m.chapter} · ${nameOf(m.restId)}</span>
       <strong>${m.speaker} · ${m.nodeId}</strong>
       <span>${m.preview || '…'}</span></li>`
    ).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_campfire_memory'))}</h2>
      <p class="cf-stats">${t('journal_campfire_stats_fmt', { total: stats.total, zones: stats.zones, nodes: stats.nodeCount })}</p>
      <div class="cf-section"><h3>${t('journal_campfire_rests_title')}</h3>${rests}</div>
      <div class="cf-filter">${filterBtns}</div>
      <ul class="cf-node-list">${nodes || '<li class="empty">' + t('journal_campfire_nodes_empty') + '</li>'}</ul>
      <button type="button" class="journal-back-btn" data-tab="campfire">${t('journal_campfire_back')}</button>
    `;

    refreshKeyText(panelEl);
    panelEl.querySelectorAll('.cf-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.z;
        this.render(panelEl);
      });
    });
    panelEl.querySelector('[data-tab="campfire"]')?.addEventListener('click', () => {
      this.game.hud.journalTab = 'campfire';
      this.game.hud.updateJournal();
    });
  }
}
