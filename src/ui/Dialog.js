import { scheduler } from '../engine/Scheduler.js';
import { focusFirstItem } from './FocusNav.js';
import { keyText } from '../content/keyHints.js';

/** toast 计时分组：toast 是最频繁的 UI 反馈，统一走主循环 dt（B39） */
const TOAST_TAG = 'dialog-toast';

export class Dialog {
  constructor() {
    this.overlay = document.getElementById('dialog-overlay');
    this.titleEl = document.getElementById('dialog-title');
    this.speakerEl = document.getElementById('dialog-speaker');
    this.cgEl = document.getElementById('dialog-cg');
    this.cgImg = document.getElementById('dialog-cg-img');
    this.textEl = document.getElementById('dialog-text');
    this.choicesEl = document.getElementById('dialog-choices');
    this.toastContainer = document.getElementById('toast-container');
    this.open = false;
    this._choiceHandler = null;
    this._meta = null;
    this.cgRenderer = null;

    document.getElementById('dialog-close').addEventListener('click', () => this.hide());
    // 关对话的键不在这里挂监听（B52）：那一下归 `Game.runEscape()` 的级联，
    // 它按 `OVERLAY_LAYERS` 决定"这 Escape 归谁"，键盘与手柄 Start 走同一条路。
  }

  setCgRenderer(renderer) {
    this.cgRenderer = renderer;
  }

  /**
   * 正文在这里过一遍 `keyText`（`show` / `showChoices` / `toast` 是同一处口径，W-B2 切片5）。
   *
   * 为什么放在这一处而不是每一个调用方：内容表里的 `{动作}` 占位要有人展开，而调用方有二十几处
   * （区域介绍、迷宫进入、过场字幕、氛围低语、任务提示…）。逐处包一遍就是"每一处都可能忘"——
   * 忘了的表现不是报错，是玩家看到一句字面的"按 {interact} 离开"。
   * 已经自己展开过的调用方（`game/RestDialogue.js`：它的文本还要进日志与事件，必须先落定稿）
   * 再过来也无妨：展开后的串里没有占位，`keyText` 命中的是同一条缓存的空操作。
   */
  show(title, text) {
    this.titleEl.textContent = keyText(title);
    this.textEl.textContent = keyText(text);
    this._hideCg();
    if (this.speakerEl) this.speakerEl.classList.add('hidden');
    if (this.choicesEl) {
      this.choicesEl.innerHTML = '';
      this.choicesEl.classList.add('hidden');
    }
    this.overlay.classList.remove('hidden');
    this.open = true;
    document.exitPointerLock?.();
    // W-D6 切片10：落焦第一格（纯对话里就是「继续探索」那一格）。对话框是模态，
    // 开的那一刻焦点必须落在它里面 —— 否则走焦在面板外面落空，玩家也看不出现在选中的是谁。
    focusFirstItem(this.overlay);
  }

  showChoices(title, text, choices, meta = {}) {
    this._meta = meta;
    this.titleEl.textContent = keyText(title);
    if (this.speakerEl) {
      if (meta.speaker) {
        this.speakerEl.classList.remove('hidden');
        // 配色由说话人那一座带来（`REST_NPC_DEFS`）；没有就不写内联样式，让 CSS 那条规则说话
        // —— 改前这里是 `meta.accent ?? '#c9a962'`，即"认不出就戴锚火看守的金边"
        const accentStyle = meta.accent ? ` style="color:${meta.accent}"` : '';
        this.speakerEl.innerHTML = `<span class="dialog-speaker-name"${accentStyle}>${meta.speaker}</span>${meta.speakerTitle ? `<span class="dialog-speaker-title">${meta.speakerTitle}</span>` : ''}`;
        this.speakerEl.dataset.mood = meta.mood ?? 'calm';
      } else {
        this.speakerEl.classList.add('hidden');
      }
    }
    this.textEl.innerHTML = keyText(text ?? '');
    this.overlay.dataset.restId = meta.restId ?? '';
    this.overlay.classList.toggle('dialog-mood-warn', meta.mood === 'warn');
    this._showCg(meta.restId, meta.nodeId, meta.accent, meta.mood);
    if (!this.choicesEl) {
      this.show(title, text);
      return;
    }
    this.choicesEl.classList.remove('hidden');
    this.choicesEl.innerHTML = choices.map((c, i) =>
      `<button type="button" class="dialog-choice" data-idx="${i}">${keyText(c.label)}</button>`
    ).join('');
    this._choiceHandler = choices;
    this.choicesEl.querySelectorAll('.dialog-choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pick = this._choiceHandler[Number(btn.dataset.idx)];
        pick?.onPick?.();
      });
    });
    this.overlay.classList.remove('hidden');
    this.open = true;
    document.exitPointerLock?.();
    // 同上：选项是玩法决策，第一格（第一个选项）要能被走到、被 Enter 激活。
    focusFirstItem(this.overlay);
  }

  _showCg(restId, nodeId, accent, mood) {
    if (!this.cgEl || !this.cgImg || !this.cgRenderer || !restId || !nodeId) {
      this._hideCg();
      return;
    }
    const url = this.cgRenderer.render(restId, nodeId, accent, mood);
    // 渲染器说"这一座没有 CG"就收起图位：宁可没图，不画别人家的火
    if (!url) {
      this._hideCg();
      return;
    }
    this.cgImg.src = url;
    this.cgEl.classList.remove('hidden');
    this.cgEl.classList.toggle('cg-warn', mood === 'warn');
  }

  _hideCg() {
    this.cgEl?.classList.add('hidden');
    if (this.cgImg) this.cgImg.src = '';
  }

  hide() {
    this.overlay.classList.add('hidden');
    this.overlay.classList.remove('dialog-mood-warn');
    this._hideCg();
    if (this.choicesEl) {
      this.choicesEl.innerHTML = '';
      this.choicesEl.classList.add('hidden');
    }
    if (this._meta?.restId) {
      window.dispatchEvent(new CustomEvent('rest-dialogue-close', { detail: { restId: this._meta.restId } }));
    }
    window.dispatchEvent(new CustomEvent('dialog-overlay-hidden'));
    this.open = false;
    this._choiceHandler = null;
    this._meta = null;
  }

  toast(message, duration = 2800) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = keyText(message);
    this.toastContainer.appendChild(el);
    // rAF-EXCEPTION：给 CSS 过渡制造一次绘制间隔，量的是浏览器的一次绘制，不是游戏时间
    requestAnimationFrame(() => el.classList.add('show'));

    // 走主循环（B39）：暂停/后台时不推进，恢复后继续走完，不会一次性堆出满屏 toast
    scheduler.after(duration / 1000, () => {
      el.classList.remove('show');
      scheduler.after(0.4, () => el.remove(), TOAST_TAG);
    }, TOAST_TAG);
  }
}
