/** [J] 地下城 Tab — 通关记录 */
import { keyText } from '../content/keyHints.js';

export class DungeonJournalTab {
  constructor(game) {
    this.game = game;
  }

  render(panelEl) {
    const tracker = this.game.dungeonRuns;
    const stats = tracker?.getStats() ?? { totalClears: 0, dungeons: 0, runs: 0 };
    const runs = tracker?.runs ?? [];

    const summary = Object.entries(tracker?.clears ?? {}).map(([id, n]) =>
      `<div class="dg-stat-row"><span>${tracker._name?.(id) ?? id}</span><span>${n} 次</span></div>`
    ).join('') || '<p class="dg-empty">尚未清空任何地下城</p>';

    const list = runs.slice(0, 16).map((r) =>
      `<li class="dg-run"><span class="dg-run-meta">Ch${r.chapter} · ${r.elapsed}s · ${r.rooms} 房</span>
       <strong>${r.name}</strong></li>`
    ).join('');

    panelEl.innerHTML = `
      <h2>${keyText('地下城纪事 · {journal} 关闭')}</h2>
      <p class="dg-stats">总清空 ${stats.totalClears} 次 · ${stats.dungeons} 座迷宫有记录</p>
      <div class="dg-section"><h3>累计</h3>${summary}</div>
      <h3>最近通关</h3>
      <ul class="dg-run-list">${list || `<li class="empty">${keyText('进入紫色传送环按 {interact} 开始探索')}</li>`}</ul>
      <p class="hint">Ch5 后部分迷宫可重复挑战 · 小地图在迷宫内显示房间进度</p>
    `;
  }
}
