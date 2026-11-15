/**
 * 炉边快速上手（W-Z91）— 新玩家 30 秒入门。
 *
 * - 首屏（start screen）第一次看见会自动打开，关闭即记住（localStorage: crossrealm_quickstart_seen）
 * - 任意时刻：暂停菜单最下面那行按钮、或「快速上手」幽灵按钮，都能再次打开
 * - Esc 关闭（同一条事件循环，避免抢暂停菜单的 Esc 消费权——只在快档开着时才拦）
 *
 * 不读存档、不碰游戏逻辑：纯 UI 层。i18n 走 t()，{动作} 占位由 keyText 走表渲染。
 */
import { t } from '../engine/i18n.js';
import { keyText } from './keyHints.js';
import { focusFirstItem, parkFocus, restoreParkedFocus } from './FocusNav.js';

const STORAGE_KEY = 'crossrealm_quickstart_seen';

export class Quickstart {
  constructor(game) {
    this.game = game;
    this.open = false;

    this.panel = document.getElementById('quickstart-overlay');
    this.closeBtn = document.getElementById('quickstart-close');
    this.startBtn = document.getElementById('quickstart-start');
    this.laterBtn = document.getElementById('quickstart-later');
    this.startEntry = document.getElementById('start-quickstart');
    this.pauseEntry = document.getElementById('pause-quickstart');

    this._onKey = (e) => {
      if (!this.open) return;
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      this.close();
    };

    this.closeBtn?.addEventListener('click', () => this.close());
    this.startBtn?.addEventListener('click', () => this.close());
    this.laterBtn?.addEventListener('click', () => this.close());
    this.startEntry?.addEventListener('click', () => this.toggle());
    this.pauseEntry?.addEventListener('click', () => {
      // 下层让位但不关，焦点归还给 pause 菜单原来的格（与 pause-manual 同一条路）
      parkFocus(this.game?.pauseMenu?.panel);
      this.show();
    });
    this.applyTexts();
  }

  /** 用与说明书同一套口径重写所有 [data-i18n]：把 `{动作}` 占位展开成玩家当前语言/键位 */
  applyTexts() {
    if (!this.panel) return;
    const els = this.panel.querySelectorAll ? this.panel.querySelectorAll('[data-i18n]') : [];
    for (const el of els) {
      const key = el.getAttribute?.('data-i18n');
      if (!key) continue;
      el.textContent = keyText(t(key));
    }
  }

  seenBefore() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return true; }
  }

  markSeen() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* 私密页存不下：下次再弹一次是可以接受的 */ }
  }

  /** 出场页专用：首次进入且从未关闭过才弹——之后一律不再自动 */
  maybeShowOnBoot() {
    if (this.seenBefore()) return false;
    this.markSeen();                       // 看到=已看过
    this.show();
    return true;
  }

  toggle() {
    if (this.open) this.close();
    else this.show();
  }

  show() {
    if (!this.panel) return;
    if (this.open) return; // 已经开着——哪儿来这一句都算重播，不折腾
    this.applyTexts();         // 确保 {动作} 展开用的是当前语言/键位
    this.open = true;
    this.panel.classList.remove('hidden');
    document.exitPointerLock?.();
    this.panel.setAttribute('aria-hidden', 'false');
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', this._onKey, true);
    }
    focusFirstItem(this.panel);
  }

  hide() {
    if (!this.panel) return;
    if (!this.open) return;
    this.open = false;
    this.panel.classList.add('hidden');
    this.panel.setAttribute('aria-hidden', 'true');
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', this._onKey, true);
    }
    restoreParkedFocus();
  }

  close() {
    this.markSeen();
    this.hide();
  }
}

/**
 * 一些在运行期才需要展开/校验的静态键（测试硬性钉住，不许丢键）。
 */
export const QUICKSTART_STATIC_KEYS = Object.freeze([
  'quickstart_title', 'quickstart_aria', 'quickstart_tagline',
  'quickstart_you_title', 'quickstart_you_body',
  'quickstart_play_title', 'quickstart_play_body',
  'quickstart_where_title', 'quickstart_where_body',
  'quickstart_advisor_title', 'quickstart_advisor_body',
  'quickstart_goal_title', 'quickstart_goal_body',
  'quickstart_again_title', 'quickstart_again_body',
  'quickstart_begin', 'quickstart_later', 'quickstart_footnote',
  'quickstart_start_btn', 'quickstart_pause_btn',
]);
