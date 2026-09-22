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
  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'end-credits';
    this.el.className = 'end-credits hidden';
    this.el.innerHTML = '<div class="end-credits-scroll"></div><button type="button" class="end-credits-skip">Esc 跳过</button>';
    document.body.appendChild(this.el);
    this.active = false;
    this.el.querySelector('.end-credits-skip').addEventListener('click', () => this.hide());
    window.addEventListener('game-completed', () => this.play());
  }

  play() {
    if (this.active) return;
    this.active = true;
    const scroll = this.el.querySelector('.end-credits-scroll');
    scroll.innerHTML = CREDITS.map((l) => `<p>${l}</p>`).join('');
    this.el.classList.remove('hidden');
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
