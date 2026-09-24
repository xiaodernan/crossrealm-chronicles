import { scheduler } from '../engine/Scheduler.js';

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

  show(title, text) {
    this.titleEl.textContent = title;
    this.textEl.textContent = text;
    this._hideCg();
    if (this.speakerEl) this.speakerEl.classList.add('hidden');
    if (this.choicesEl) {
      this.choicesEl.innerHTML = '';
      this.choicesEl.classList.add('hidden');
    }
    this.overlay.classList.remove('hidden');
    this.open = true;
    document.exitPointerLock?.();
  }

  showChoices(title, text, choices, meta = {}) {
    this._meta = meta;
    this.titleEl.textContent = title;
    if (this.speakerEl) {
      if (meta.speaker) {
        this.speakerEl.classList.remove('hidden');
        this.speakerEl.innerHTML = `<span class="dialog-speaker-name" style="color:${meta.accent ?? '#c9a962'}">${meta.speaker}</span>${meta.speakerTitle ? `<span class="dialog-speaker-title">${meta.speakerTitle}</span>` : ''}`;
        this.speakerEl.dataset.mood = meta.mood ?? 'calm';
      } else {
        this.speakerEl.classList.add('hidden');
      }
    }
    this.textEl.innerHTML = text ?? '';
    this.overlay.dataset.restId = meta.restId ?? '';
    this.overlay.classList.toggle('dialog-mood-warn', meta.mood === 'warn');
    this._showCg(meta.restId, meta.nodeId, meta.accent, meta.mood);
    if (!this.choicesEl) {
      this.show(title, text);
      return;
    }
    this.choicesEl.classList.remove('hidden');
    this.choicesEl.innerHTML = choices.map((c, i) =>
      `<button type="button" class="dialog-choice" data-idx="${i}">${c.label}</button>`
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
  }

  _showCg(restId, nodeId, accent, mood) {
    if (!this.cgEl || !this.cgImg || !this.cgRenderer || !restId || !nodeId) {
      this._hideCg();
      return;
    }
    const url = this.cgRenderer.render(restId, nodeId, accent ?? '#c9a962', mood ?? 'calm');
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
    el.textContent = message;
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
