import { CG_ZONE_LABELS } from '../game/CgGallerySystem.js';
import { refreshKeyText } from '../content/keyHints.js';

/** [J] 日志 — CG 画廊 Tab 渲染 */
export class CgJournalTab {
  constructor(game) {
    this.game = game;
    this.filterZone = 'all';
    this.lightbox = null;
    this._buildLightbox();
  }

  _buildLightbox() {
    this.lightbox = document.createElement('div');
    this.lightbox.id = 'cg-lightbox';
    this.lightbox.className = 'cg-lightbox hidden';
    this.lightbox.innerHTML = `
      <div class="cg-lightbox-backdrop"></div>
      <div class="cg-lightbox-inner">
        <button type="button" class="cg-lightbox-close">×</button>
        <img class="cg-lightbox-img" alt="" />
        <div class="cg-lightbox-caption"></div>
        <div class="cg-lightbox-meta"></div>
      </div>
    `;
    document.body.appendChild(this.lightbox);
    this.lightbox.querySelector('.cg-lightbox-close').addEventListener('click', () => this.hideLightbox());
    this.lightbox.querySelector('.cg-lightbox-backdrop').addEventListener('click', () => this.hideLightbox());
  }

  hideLightbox() {
    this.lightbox?.classList.add('hidden');
  }

  showLightbox(entry) {
    const cg = this.game.cgGallery;
    const renderer = this.game.dialogCg;
    if (!entry || !renderer) return;

    let url;
    if (entry.restId && entry.nodeId) {
      url = renderer.render(entry.restId, entry.nodeId, entry.accent, entry.mood);
    } else {
      url = renderer.render(entry.zone === 'combat' ? 'void' : entry.zone, entry.nodeId ?? 'exec', entry.accent, entry.mood);
    }

    this.lightbox.querySelector('.cg-lightbox-img').src = url;
    this.lightbox.querySelector('.cg-lightbox-caption').textContent = entry.caption ?? entry.id;
    this.lightbox.querySelector('.cg-lightbox-meta').textContent =
      `${entry.speaker ?? ''} · ${CG_ZONE_LABELS[entry.zone] ?? entry.zone} · 观看 ${(cg.viewCounts[entry.id] ?? 0) + 1} 次`;
    this.lightbox.classList.remove('hidden');
    cg.recordView(entry.id);
  }

  render(panelEl) {
    const cg = this.game.cgGallery;
    const stats = cg.getStats();
    const zones = Object.entries(CG_ZONE_LABELS).map(([k, label]) =>
      `<button type="button" class="cg-zone-btn${this.filterZone === k ? ' active' : ''}" data-zone="${k}">${label}</button>`
    ).join('');

    const unlocked = cg.getEntries(this.filterZone, true);
    const locked = cg.getLockedPreview(this.filterZone);

    const grid = unlocked.map((e) => {
      const fav = cg.favorites.has(e.id) ? '★' : '☆';
      return `<div class="cg-card" data-id="${e.id}">
        <div class="cg-card-thumb" data-id="${e.id}"></div>
        <div class="cg-card-cap">${e.caption}</div>
        <div class="cg-card-sub">${e.speaker}</div>
        <button type="button" class="cg-fav-btn" data-id="${e.id}">${fav}</button>
      </div>`;
    }).join('');

    const lockedHtml = locked.slice(0, 8).map((e) =>
      `<div class="cg-card cg-card-locked"><div class="cg-card-cap">???</div><div class="cg-card-sub">${CG_ZONE_LABELS[e.zone] ?? e.zone}</div></div>`
    ).join('');

    panelEl.innerHTML = `
      <h2 data-ktext="CG 画廊 · {journal} 关闭"></h2>
      <p class="cg-stats">已解锁 ${stats.unlocked} / ${stats.total}（${stats.percent}%）· 收藏 ${stats.favorites}</p>
      <div class="cg-zone-filter">${zones}</div>
      <div class="cg-grid">${grid || '<p class="cg-empty">此区域暂无已解锁 CG — 去营火对话或击败 Boss</p>'}</div>
      ${locked.length ? `<h3 class="cg-locked-title">未解锁</h3><div class="cg-grid cg-grid-locked">${lockedHtml}</div>` : ''}
      <p class="hint">营火分支对话解锁插画 · Boss 击破解锁战斗 CG · 连击/处决解锁战斗记忆</p>
      <button type="button" class="journal-back-btn" id="journal-back-all">← 返回日志</button>
    `;

    refreshKeyText(panelEl);
    panelEl.querySelectorAll('.cg-zone-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filterZone = btn.dataset.zone;
        this.render(panelEl);
      });
    });

    panelEl.querySelector('#journal-back-all')?.addEventListener('click', () => {
      this.game.hud.journalTab = 'all';
      this.game.hud.updateJournal();
    });

    panelEl.querySelectorAll('.cg-card-thumb').forEach((el) => {
      const entry = unlocked.find((e) => e.id === el.dataset.id);
      if (!entry) return;
      const renderer = this.game.dialogCg;
      let url;
      if (entry.restId && entry.nodeId) url = renderer.render(entry.restId, entry.nodeId, entry.accent, entry.mood);
      else url = renderer.render('void', 'exec', entry.accent, entry.mood);
      el.style.backgroundImage = `url(${url})`;
      el.addEventListener('click', () => this.showLightbox(entry));
    });

    panelEl.querySelectorAll('.cg-fav-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        cg.toggleFavorite(btn.dataset.id);
        this.render(panelEl);
      });
    });
  }
}
