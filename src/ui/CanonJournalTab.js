import { keyText, refreshKeyText } from './keyHints.js';
import { getLanguage, t } from '../engine/i18n.js';

/**
 * [J] 典籍馆 · Canon — 游戏内直接可读全书（W-Z109）
 *
 * ## 为什么是「游戏内嵌阅读」而不是「链去GitHub」
 *
 * 玩家的意志 / 耐心 / 心智都和纸质书完全不一样：
 * 打开浏览器再找到 creative/novel/ 目录是太多摩擦。
 * 《跨界纪事》的核心分量（16 卷）**就是玩家在这个游戏里走完一整趟路**，
 * 而所见的本就是这个世界里的灵魂原典——把原著直接放进 [J] 日志，
 * 让玩家在打 Boss 间隙、在炉火旁坐下时重读一行字，而不是跳出去读。
 *
 * ## 实现口径：**懒加载**两端分片
 *
 * 两个语言包各自一个模块（`content/novella/zh.js` / `en.js`），
 * 打开 tab 才按当前语言 `import()` ——Vite 把它们切成两个独立 chunk，
 * 首屏与 `:html ~8KB aside` 都从来不会吃这笔字。
 *
 * 无论玩家在什么 `savedLanguage()` 下，tab 头部始终是双语标题；
 * 正文 body 跟随 `getLanguage()` 走完整段落。
 */
export class CanonJournalTab {
  constructor(game) {
    this.game = game;
    this.loading = false;
    this.error = null;
    this.entries = null;
    /* 章节 id 由 build-novella.cjs 从文件顺序**按位置**分配（00..15）——
     * 磁盘上 `16-番外八` 的位置编号是 15，所以绝不能手写固定 id 表，
     * 否则永远漏掉漏灯记。改为懒加载后直接从表里取键并排序（键就是零填充序号）。 */
    this.order = null;
    this.activeId = '00';
  }

  async render(panelEl) {
    /* 语言切换后：缓存按语言分包，改语言 = 重新懒 import 另一端 */
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

    const items = this.order.map((id) => {
      const e = entries[id];
      if (!e) return '';
      const isActive = id === activeEntry.id;
      return `<button type="button" class="canon-chip${isActive ? ' is-active' : ''}" data-id="${id}">${keyText(e.title)}</button>`;
    }).join('');

    const bodyHtml = String(activeEntry.body ?? '')
      // 去掉文件最顶端的 `# ... ` 文件头（已在 panel h2 + 选择器中呈现）
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

    panelEl.innerHTML = `
      <h2>${keyText(t('journal_tab_canon'))}</h2>
      <p class="canon-intro">${t('canon_intro')}</p>
      <nav class="canon-nav" aria-label="Canon chapters">${items}</nav>
      <article class="canon-body">${bodyHtml}</article>
    `;

    refreshKeyText(panelEl);
    panelEl.querySelectorAll('.canon-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeId = btn.dataset.id;
        // 不入异常路径，直接重写 innerHTML
        this.render(panelEl);
      });
    });
  }
}
