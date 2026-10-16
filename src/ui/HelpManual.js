/** 游戏内说明书 — 由 UI 热键表的 `help` 动作打开（F12 是浏览器控制台，不是这里的键） */
import { HELP_SECTIONS_EXTRA } from '../content/helpManual.js';
import { keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';
import { focusFirstItem, parkFocus, restoreParkedFocus } from './FocusNav.js';

/** 扩写章节追加在主目录之后（W-B2：章节本体在 content/helpManual.js） */
const mergeHelpSections = (base) => [...base, ...HELP_SECTIONS_EXTRA];

/**
 * 章节标题与正文都是文案键（W-D2 切片15）：中文/英文住在 `content/strings.zh.js` / `.en.js`
 * （hm_title_* / hm_body_*），播出那一刻由 `keyText(t(key))` 展开 —— 正文里的 `{动作}` 占位
 * 由 `keyText` 换当前键名，改语言由 `t()` 换当前语言，两者都只在这一处发生。
 */
export const SECTIONS = mergeHelpSections([
  { id: 'start', title: 'hm_title_start', body: 'hm_body_start' },
  { id: 'combat', title: 'hm_title_combat', body: 'hm_body_combat' },
  { id: 'world', title: 'hm_title_world', body: 'hm_body_world' },
  { id: 'dungeons', title: 'hm_title_dungeons', body: 'hm_body_dungeons' },
  { id: 'bosses', title: 'hm_title_bosses', body: 'hm_body_bosses' },
  { id: 'autoplay', title: 'hm_title_autoplay', body: 'hm_body_autoplay' },
  { id: 'perf-hud', title: 'hm_title_perf_hud', body: 'hm_body_perf_hud' },
]);

export class HelpManual {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.activeSection = 'start';
    this.panel = document.getElementById('help-manual');
    this.nav = document.getElementById('help-nav');
    this.body = document.getElementById('help-body');
    this.closeBtn = document.getElementById('help-close');

    this.buildNav();
    this.closeBtn?.addEventListener('click', () => this.hide());
    this.nav?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-section]');
      if (!btn) return;
      this.showSection(btn.dataset.section);
    });
    document.getElementById('pause-manual')?.addEventListener('click', () => {
      // 与暂停菜单进设置同一条路（切片12）：下层让位但不关，退回来才落得回原来那一格
      parkFocus(this.game.pauseMenu.panel);
      this.show();
    });
  }

  buildNav() {
    if (!this.nav) return;
    this.nav.innerHTML = SECTIONS.map(
      (s) => `<button type="button" data-section="${s.id}">${keyText(t(s.title))}</button>`
    ).join('');
  }

  /**
   * 说明书的正文与标题都带 `{动作}` 占位（W-B2 切片4），所以**每一个显示出口**都要过 `keyText`：
   * 章节清单与正文是两处渲染，漏一处玩家就看到字面的 `{parry}`。
   */
  showSection(id) {
    this.activeSection = id;
    const sec = SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
    this.nav?.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.section === id);
    });
    if (this.body) {
      this.body.innerHTML = `<h3>${keyText(t(sec.title))}</h3><pre class="help-text">${keyText(t(sec.body))}</pre>`;
    }
  }

  /**
   * 改绑之后重刷（`Game.rebuildHotkeys()` 调）。
   *
   * 关着的时候什么都不用做：`show()` 每次打开都会用生效表重渲正文 —— 这也是把展开
   * 放在渲染而不是放在数据里的原因，抄一份"已经展开好的字符串"就是第二份真源。
   */
  refreshKeyHints() {
    if (!this.open) return;
    this.buildNav();
    this.showSection(this.activeSection);
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    this.open = true;
    this.showSection(this.activeSection);
    this.panel?.classList.remove('hidden');
    document.exitPointerLock?.();
    // 第一格是"关闭"，↓ 才进章节列表 —— 清单顺序就是 DOM 顺序，这里不另排一套
    focusFirstItem(this.panel);
  }

  hide() {
    this.open = false;
    this.panel?.classList.add('hidden');
    // 先摘掉自己再还焦点：压在下面那一层此刻才重新可见（`style.css` 那条压暗让位规则）
    restoreParkedFocus();
  }
}
