import { keyText, refreshKeyText } from './keyHints.js';
import { getLanguage, t } from '../engine/i18n.js';

/**
 * [J] 典籍馆 · Canon — 游戏内直接可读全书（W-Z109 升级：W-Z116 阅读器模式）
 *
 * ## W-Z109 落地了什么
 *
 * 两个语言包各自一个模块（`content/novella/zh.js` / `en.js`），打开 tab 才按当前语言
 * `import()` ——Vite 把它们切成两个独立 chunk，首屏与 `:html ~8KB aside` 都从来不会吃这笔字。
 * 无论玩家在什么 `savedLanguage()` 下，正文 body 跟随 `getLanguage()` 走完整段落。
 *
 * ## W-Z116 升级了什么（阅读体验是"说明书"的一部分，不是装饰）
 *
 * 用户点名："说明书就要嵌入游戏本体，让用户能打开就直接看到怎么用。"
 * 典籍馆就是游戏内嵌说明书的核心：把它做成**真正的口袋阅读器**——
 *
 * 1. **上一章 / 下一章** —— 不再回退到章节芯片列表；
 * 2. **字号 4 档**（A- / A+）—— 存 localStorage（`crossrealm_canon_reader_v1`）；
 * 3. **衬线体切换**（默认开）—— 深色背景下衬线 CJK 更有"纸感"，sans 更有"界面"，玩家自己选；
 * 4. **收藏夹** —— 任意一章可以点亮书签，书签列表挂在顶部可直接跳转（每次重渲染就地更新）；
 * 5. **已读追踪** —— 章节首次渲染即标记为已读，顶部进度条显示 X/17；
 * 6. **全部状态持久化** —— 字体档位 / 衬线开关 / 书签 / 已读 / 上次读到的章。
 */
const READER_LS = 'crossrealm_canon_reader_v1';
const DEFAULT_READER = Object.freeze({
  fontStep: 0,
  serif: true,
  bookmarks: [],
  read: [],
  lastRead: '00',
});
const FONT_STEP_REM = ['0.78rem', '0.84rem', '0.92rem', '1rem'];
const FONT_STEP_LABEL = ['S', 'M', 'L', 'XL'];

/** 读出本地阅读偏好（localStorage 不可用 / 损坏 → 出厂默认） */
export function loadCanonReader() {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_READER };
  try {
    const raw = JSON.parse(localStorage.getItem(READER_LS) ?? '{}');
    return { ...DEFAULT_READER, ...raw };
  } catch {
    return { ...DEFAULT_READER };
  }
}
/** 写回干净状态（字段顺序固定） */
export function saveCanonReader(state) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(READER_LS, JSON.stringify({
      fontStep: state.fontStep ?? 0,
      serif: state.serif !== false,
      bookmarks: [...(state.bookmarks ?? [])],
      read: [...(state.read ?? [])],
      lastRead: state.lastRead ?? '00',
    }));
  } catch { /* 隐 private/配额满 → 静默，读偏好只是点缀 */ }
}

const stripBody = (body) => String(body ?? '')
  .replace(/^#\s.*$/m, '')
  .trim()
  .replace(/^---\s*$/gm, '<hr class="canon-hr">')
  .replace(/^##\s+(.+)$/gm, '<h3 class="canon-h3">$1</h3>')
  .split(/\n{2,}/)
  .map((para) => {
    const t = para.trim();
    if (!t) return '';
    if (t.startsWith('<hr') || t.startsWith('<h3')) return t;
    return `<p>${t.replace(/\n/g, '<br>')}</p>`;
  })
  .join('');

export class CanonJournalTab {
  constructor(game) {
    this.game = game;
    this.loading = false;
    this.error = null;
    this.entries = null;
    /* 章节 id 由 build-novella.cjs 从文件顺序**按位置**分配（00..16）——位置顺序与展示顺序一致 */
    this.order = null;
    this.reader = loadCanonReader();
    /* 上一次展示的字体档位整数，在 render 中被换到 slider 上 */
    this.fancyBounce = 0;
    this.activeId = this.reader.lastRead || '00';
  }

  _persist() { saveCanonReader(this.reader); }

  _markRead(id) {
    if (!this.reader.read.includes(id)) {
      this.reader = { ...this.reader, read: [...this.reader.read, id] };
      this._persist();
    }
  }

  _toggleBookmark(id) {
    const has = !this.reader.bookmarks.includes(id)
      ? [...this.reader.bookmarks, id]
      : this.reader.bookmarks.filter((b) => b !== id);
    this.reader = { ...this.reader, bookmarks: has };
    this._persist();
  }

  _serifClass() { return this.reader.serif === false ? ' sans' : ''; }

  async render(panelEl) {
    /* 语言切换后：缓存按语言分包，改语言 = 重新懒 import 另一端 */
    try { (window.__crossrealmTelemetry)?.record?.('canon_open'); } catch { /* ignore */ }
    const currentLang = getLanguage() === 'en' ? 'en' : 'zh';
    if (this.entries && this.loadedLang !== currentLang) {
      this.entries = null;
      this.order = null;
    }
    if (!this.entries) {
      this.loading = true;
      this.error = null;
      panelEl.innerHTML = `<p class="canon-loading">${t('canon_loading')}</p>`;
      try {
        const { NOVELLA_EN, NOVELLA_ZH } = currentLang === 'en'
          ? await import('../content/novella/en.js')
          : await import('../content/novella/zh.js');
        this.entries = (currentLang === 'en' ? NOVELLA_EN : NOVELLA_ZH) ?? {};
        this.loadedLang = currentLang;
      } catch (e) {
        this.error = e;
        this.loading = false;
        this.entries = null;
        panelEl.innerHTML = `<p class="canon-error">${t('canon_load_failed')}</p>`;
        return;
      }
      this.loading = false;
    }

    const entries = this.entries;
    if (!this.order) this.order = Object.keys(entries).sort();
    const activeEntry = entries[this.activeId] ?? entries[this.order[0]] ?? Object.values(entries)[0];
    if (!activeEntry) {
      panelEl.innerHTML = `<p class="canon-error">${t('canon_empty')}</p>`;
      return;
    }
    this._markRead(activeEntry.id);
    this.reader = { ...this.reader, lastRead: activeEntry.id };
    this._persist();

    const idx = this.order.indexOf(activeEntry.id);
    const prevId = idx > 0 ? this.order[idx - 1] : null;
    const nextId = idx >= 0 && idx < this.order.length - 1 ? this.order[idx + 1] : null;

    const fontStep = Math.max(0, Math.min(FONT_STEP_REM.length - 1, Math.trunc(Number(this.reader.fontStep ?? 0) || 0)));
    const fontSize = FONT_STEP_REM[fontStep];
    const readCount = Math.min(this.reader.read.length, this.order.length);
    const isMarked = this.reader.bookmarks.includes(activeEntry.id);

    const chips = this.order.map((id) => {
      const e = entries[id];
      if (!e) return '';
      const isActive = id === activeEntry.id;
      const readMark = this.reader.read.includes(id) ? ' <span class="canon-check" aria-hidden="true">✓</span>' : '';
      return `<button type="button" class="canon-chip${isActive ? ' is-active' : ''}" data-id="${id}">${keyText(e.title)}${readMark}</button>`;
    }).join('');

    const bookmarks = this.reader.bookmarks.map((id) => {
      const e = entries[id];
      if (!e) return '';
      return `<button type="button" class="canon-bookmark-chip" data-id="${id}">${keyText(e.title)}</button>`;
    }).join('');

    panelEl.innerHTML = `
      <div class="canon-reader-header">
        <h2>${keyText(t('journal_tab_canon'))}</h2>
        <div class="canon-toolbar" role="toolbar" aria-label="Canon reader toolbar">
          <button type="button" class="canon-tbtn${prevId ? '' : ' is-disabled'}" data-dir="prev" aria-label="${t('canon_reader_prev')}">‹</button>
          <button type="button" class="canon-tbtn" data-reading="fontsize-down" aria-label="${t('canon_reader_font_down')}">A−</button>
          <span class="canon-font-step" aria-hidden="true">${FONT_STEP_LABEL[fontStep]}</span>
          <button type="button" class="canon-tbtn" data-reading="fontsize-up" aria-label="${t('canon_reader_font_up')}">A+</button>
          <button type="button" class="canon-tbtn canon-tbtn-serif${this._serifClass()}" data-reading="serif" aria-pressed="${this.reader.serif === false ? 'false' : 'true'}" title="${t('canon_reader_serif')}">${this.reader.serif === false ? t('canon_reader_sans_label') : t('canon_reader_serif')}</button>
          <button type="button" class="canon-tbtn canon-tbtn-bookmark${isMarked ? ' is-on' : ''}" data-reading="bookmark" aria-pressed="${isMarked ? 'true' : 'false'}" title="${isMarked ? t('canon_reader_bookmark_remove') : t('canon_reader_bookmark_add')}">${isMarked ? '★' : '☆'}</button>
          <button type="button" class="canon-tbtn${nextId ? '' : ' is-disabled'}" data-dir="next" aria-label="${t('canon_reader_next')}">›</button>
        </div>
      </div>
      <p class="canon-intro">${t('canon_intro')}</p>
      <p class="canon-progress" aria-hidden="true">${t('canon_reader_progress_fmt', { n: readCount, total: this.order.length })}</p>
      ${bookmarks ? `<div class="canon-bookmarks" aria-label="${t('canon_reader_bookmarks')}">${bookmarks}</div>` : ''}
      <nav class="canon-nav" aria-label="Canon chapters">${chips}</nav>
      <article class="canon-body${this._serifClass()}" style="font-size:${fontSize}">${stripBody(activeEntry.body)}</article>
    `;

    refreshKeyText(panelEl);

    const go = (id) => { if (id == null) return; this.activeId = id; this.render(panelEl); };

    panelEl.querySelectorAll('.canon-chip, .canon-bookmark-chip').forEach((btn) => {
      btn.addEventListener('click', () => go(btn.dataset.id));
    });

    const [prevBtn, fontDown, fontUp, serifBtn, markBtn, nextBtn] = [
      panelEl.querySelector('[data-dir="prev"]'),
      panelEl.querySelector('[data-reading="fontsize-down"]'),
      panelEl.querySelector('[data-reading="fontsize-up"]'),
      panelEl.querySelector('[data-reading="serif"]'),
      panelEl.querySelector('[data-reading="bookmark"]'),
      panelEl.querySelector('[data-dir="next"]'),
    ];
    const applyRead = (d) => go(d === 'prev' ? prevId : nextId);
    prevBtn?.addEventListener('click', () => applyRead('prev'));
    nextBtn?.addEventListener('click', () => applyRead('next'));
    fontDown?.addEventListener('click', () => { this.reader = { ...this.reader, fontStep: Math.max(0, fontStep - 1) }; this._persist(); this.render(panelEl); });
    fontUp?.addEventListener('click', () => { this.reader = { ...this.reader, fontStep: Math.min(FONT_STEP_REM.length - 1, fontStep + 1) }; this._persist(); this.render(panelEl); });
    serifBtn?.addEventListener('click', () => { this.reader = { ...this.reader, serif: !(this.reader.serif ?? true) }; this._persist(); this.render(panelEl); });
    markBtn?.addEventListener('click', () => { this._toggleBookmark(activeEntry.id); this.render(panelEl); });

  }
}
