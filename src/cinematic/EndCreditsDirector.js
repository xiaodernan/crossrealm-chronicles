import { refreshKeyText } from '../content/keyHints.js';

import { on, offAll } from '../engine/EventBus.js';

const CINEMATIC_ENDCREDITSDIRECTOR = 'cinematic/EndCreditsDirector';
const creditsOn = (name, handler) => on(name, handler, CINEMATIC_ENDCREDITSDIRECTOR);
/** 通关滚动字幕 */
const CREDITS = [
  '跨界纪元 · Crossrealm Chronicles',
  '',
  '浏览器 Demo — Vite + Three.js',
  '',
  '你斩裂混沌，成为位面行者。',
  '',
  '感谢游玩',
  'J 日志 · CG 画廊 · 秘典 · 成就',
  '营火 NPC · Boss 再战 · 战斗风格',
  '',
  '— fin —',
];

export class EndCreditsDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第七处） */
  dispose() {
    offAll(CINEMATIC_ENDCREDITSDIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'end-credits';
    this.el.className = 'end-credits hidden';
    this.el.innerHTML = '<div class="end-credits-scroll"></div><button type="button" class="end-credits-skip" data-ktext="{escape} 跳过"></button>';
    document.body.appendChild(this.el);
    this.active = false;
    this.el.querySelector('.end-credits-skip').addEventListener('click', () => this.hide());
    creditsOn('game-completed', () => this.play());
  }

  play() {
    if (this.active) return;
    this.active = true;
    const scroll = this.el.querySelector('.end-credits-scroll');
    scroll.innerHTML = CREDITS.map((l) => `<p>${l}</p>`).join('');
    this.el.classList.remove('hidden');
    // DOM 建一次、演出可能很久之后才放：键名到播放这一刻才问生效表
    refreshKeyText(this.el);
    this.game.dialog?.toast('Chapter 5 完成 — 滚动字幕', 3000);
  }

  hide() {
    this.active = false;
    this.el.classList.add('hidden');
  }

  trySkip() {
    if (!this.active) return false;
    this.hide();
    return true;
  }
}
