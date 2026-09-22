import { FRANCHISE_LABELS } from '../game/PopCultureHomageRegistry.js';

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
        <span class="pc-franchise">${e.franchise}</span>
        <div class="pc-title">${ok ? e.title : '???'}</div>
        <div class="pc-desc">${ok ? e.desc : '探索各位面 POI、营火对话与致敬点'}</div>
      </div>`;
    }).join('');

    panelEl.innerHTML = `
      <h2>次元回声 · J 关闭</h2>
      <p class="pc-stats">已共鸣 ${stats.unlocked} / ${stats.total}（${stats.percent}%）</p>
      <p class="pc-note">致敬独立游戏常见做法：借母题与氛围，名称已做区分处理</p>
      <div class="pc-filter">${filters}</div>
      <div class="pc-grid">${cards}</div>
    `;

    panelEl.querySelectorAll('.pc-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.f;
        this.render(panelEl);
      });
    });
  }
}
