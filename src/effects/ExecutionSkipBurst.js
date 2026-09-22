import { scheduler } from '../engine/Scheduler.js';

/** 跳过反馈的收尾计时分组（连按 Esc 时先撤旧的） */
const BURST_TAG = 'exec-skip-burst';

/** Esc 跳过处决时的视觉反馈 */
export class ExecutionSkipBurst {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'exec-skip-burst hidden';
    document.body.appendChild(this.el);
  }

  burst() {
    this.el.classList.remove('hidden');
    this.el.style.opacity = '0.7';
    /* rAF-EXCEPTION：这里必须留一次 rAF —— 目的是制造一个绘制间隔，让浏览器看到 0.7 这个起始值，
     * 否则赋值与过渡同帧，淡出根本不会发生。这不是游戏逻辑计时，是 B39 的例外情形。 */
    requestAnimationFrame(() => {
      this.el.style.opacity = '0';
      scheduler.clear(BURST_TAG);
      scheduler.after(0.28, () => this.el.classList.add('hidden'), BURST_TAG);
    });
  }
}
