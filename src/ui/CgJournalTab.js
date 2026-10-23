import { CG_ZONE_LABELS } from '../game/CgGallerySystem.js';
import { refreshKeyText, keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

/**
 * 目录里的 `caption` 是**文案键**（W-D2 切片13），界面上的三处（卡片字幕 / `aria-label` /
 * 灯箱字幕）都在这里展开一次。目录自己不再展开 —— 它导入期展开过一次的话，换语言
 * 就再也跟不上（那张表是模块加载时建的），而 `_paint` 那条路也会把它当键再展开一次。
 */
const captionOf = (entry) => (entry.caption ? t(entry.caption) : entry.id);

/**
 * 说话人与区域名也是键（W-D2 切片15），同一条口径：**界面**是唯一的展开点。
 * 营火行的说话人取自 `REST_NPC_DEFS[zone].name`（那边存键），bonus 行取自
 * `cg_speaker_*` —— 两处都是键，所以这一层不需要知道"这一行是哪一类"。
 */
const speakerOf = (entry) => (entry.speaker ? t(entry.speaker) : '');
const zoneLabelOf = (zone) => (zone && CG_ZONE_LABELS[zone] ? t(CG_ZONE_LABELS[zone]) : (zone ?? ''));

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

  /**
   * 目录里的每一行按**自己写的**东西去画（W-B4 切片1）。
   *
   * 营火对话那批行有 `restId:nodeId`，走对话渲染器（与玩家在营火边看到的同一张）。
   * 其余行（Boss 击破、连击记忆、迷宫清空）不属于任何营火，改前是拿 `entry.zone` 去冒充一个营火节点
   * —— `bonus:boss-shadow` 的 `scene` 明明写着 boss_shadow，画出来却是灰林那顶帐篷，
   * 而 `bonus:dungeon-clear` 的 zone 压根不是营火，画出来是世界之锚的火。现在按 scene 直接画。
   */
  _urlFor(entry) {
    const renderer = this.game.dialogCg;
    if (!renderer) return null;
    return entry.restId && entry.nodeId
      ? renderer.render(entry.restId, entry.nodeId, entry.accent, entry.mood)
      : renderer.renderScene(entry.scene, entry.caption, entry.accent, entry.mood);
  }

  showLightbox(entry) {
    const cg = this.game.cgGallery;
    if (!entry) return;
    const url = this._urlFor(entry);
    if (!url) return;   // 画不出来就不开灯 —— 开一盏写着别的画面的灯比不开更糟

    this.lightbox.querySelector('.cg-lightbox-img').src = url;
    this.lightbox.querySelector('.cg-lightbox-caption').textContent = captionOf(entry);
    this.lightbox.querySelector('.cg-lightbox-meta').textContent =
      `${speakerOf(entry)} · ${zoneLabelOf(entry.zone)} · 观看 ${(cg.viewCounts[entry.id] ?? 0) + 1} 次`;
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
        <button type="button" class="cg-card-thumb" data-id="${e.id}" aria-label="${captionOf(e)}"></button>
        <div class="cg-card-cap">${captionOf(e)}</div>
        <div class="cg-card-sub">${e.speaker}</div>
        <button type="button" class="cg-fav-btn" data-id="${e.id}">${fav}</button>
      </div>`;
    }).join('');

    const lockedHtml = locked.slice(0, 8).map((e) =>
      `<div class="cg-card cg-card-locked"><div class="cg-card-cap">???</div><div class="cg-card-sub">${CG_ZONE_LABELS[e.zone] ?? e.zone}</div></div>`
    ).join('');

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_cg_gallery'))}</h2>
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

    // W-D6 切片11：缩略图是 `button`（改前是 `div`）—— 于是它进得了 `navItems` 的清单，
    // ↑↓ 走得到、Enter/空格由浏览器激活、焦点环也自动有（切片9 那条按标签写的规则）。
    panelEl.querySelectorAll('.cg-card-thumb').forEach((el) => {
      const entry = unlocked.find((e) => e.id === el.dataset.id);
      if (!entry) return;
      const url = this._urlFor(entry);
      if (!url) return;
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
