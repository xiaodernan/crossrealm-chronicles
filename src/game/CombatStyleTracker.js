const STYLE_RANKS = [
  { min: 0, label: '—', color: '#888' },
  { min: 50, label: 'C', color: '#aaa' },
  { min: 120, label: 'B', color: '#88ccff' },
  { min: 250, label: 'A', color: '#c9a962' },
  { min: 450, label: 'S', color: '#ff8866' },
  { min: 700, label: 'SS', color: '#ffdd44' },
];

import { on, offAll } from '../engine/EventBus.js';

const GAME_COMBATSTYLETRACKER = 'game/CombatStyleTracker';
const styleOn = (name, handler) => on(name, handler, GAME_COMBATSTYLETRACKER);
/** 战斗风格积分 — 弹反/连击/处决/Boss */
export class CombatStyleTracker {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_COMBATSTYLETRACKER);
  }

  constructor(game) {
    this.game = game;
    this.score = 0;
    this.sessionBest = 0;
    this.comboChain = 0;
    /* 这里曾经有一格 `this.lastEvent = performance.now()`：全仓没有任何读者（写两处、读零处），
     * 而连招窗口真正的账是 `decayTimer`，它由 `update(dt)` 的世界时推进。
     * 留着那格就是留一个"看起来像时钟、其实没人看"的墙钟（W-A1 切片8 / B118②）。 */
    this.decayTimer = 0;
    this.setupListeners();
  }

  setupListeners() {
    styleOn('parry-success', () => this.add(35, '弹反'));
    styleOn('combo-finisher', () => this.add(80, '终结'));
    styleOn('combat-execution', () => this.add(120, '处决'));
    styleOn('enemy-defeated', (e) => {
      if (e.detail?.type === 'boss') this.add(200, 'Boss');
      else this.add(8, '击杀');
    });
    styleOn('boss-defeated', () => this.add(300, '击破'));
  }

  add(pts, label) {
    this.score += pts;
    this.comboChain += 1;
    this.decayTimer = 8;
    if (this.score > this.sessionBest) this.sessionBest = this.score;
    const rank = this.getRank();
    window.dispatchEvent(new CustomEvent('combat-style-changed', {
      detail: { score: this.score, rank: rank.label, color: rank.color, label, chain: this.comboChain },
    }));
  }

  getRank() {
    let r = STYLE_RANKS[0];
    for (const s of STYLE_RANKS) {
      if (this.score >= s.min) r = s;
    }
    return r;
  }

  update(dt) {
    if (this.decayTimer <= 0) return;
    this.decayTimer -= dt;
    if (this.decayTimer <= 0) {
      this.score = Math.max(0, this.score - 40);
      this.comboChain = 0;
      window.dispatchEvent(new CustomEvent('combat-style-changed', {
        detail: { score: this.score, rank: this.getRank().label, color: this.getRank().color, label: '', chain: 0 },
      }));
    }
  }

  toJSON() {
    return { sessionBest: this.sessionBest };
  }

  fromJSON(data) {
    if (data) this.sessionBest = data.sessionBest ?? 0;
  }
}
