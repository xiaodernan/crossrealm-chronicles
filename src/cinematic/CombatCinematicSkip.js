import { scheduler } from '../engine/Scheduler.js';
import { keyText } from '../content/keyHints.js';

/** 首次提示的计时分组（与演出时长无关，只负责"演出进行中才提示"） */
const HINT_TAG = 'combat-skip-hint';

/** 处决/慢镜头演出 — Esc 跳过 */
export class CombatCinematicSkip {
  constructor(game) {
    this.game = game;
    this.skipped = 0;
    this._hintShown = false;
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (!this.canSkip()) return;
      if (this.game.dialog?.open || this.game.pauseMenu?.open || this.game.upgrade?.open) return;
      if (this.game.cinematicActive || this.game.cinematics?.active) return;
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    }, true);

    window.addEventListener('combo-finisher', () => this._maybeHint());
    window.addEventListener('combat-execution', () => this._maybeHint());
  }

  canSkip() {
    return this.game.combatCamera?.active
      || this.game.combatInputLock?.locked
      || performance.now() < (this.game.combatCamera?.blocksInputUntil ?? 0);
  }

  skip() {
    this.skipped += 1;
    this.game.combatCamera?.skip?.();
    this.game.combatInputLock?.release?.();
    if (this.game.player) this.game.player.timeSlow = 1;
    this.game.dialog?.toast?.('演出已跳过', 1400);
    window.dispatchEvent(new CustomEvent('combat-cinematic-skipped', { detail: { count: this.skipped } }));
    this.game.executionSkipFx?.burst?.();
  }

  _maybeHint() {
    if (this._hintShown) return;
    this._hintShown = true;
    scheduler.after(0.4, () => {
      if (this.canSkip()) {
        this.game.dialog?.toast?.(keyText('按 {escape} 可跳过战斗演出'), 3200);
      }
    }, HINT_TAG);
  }

  toJSON() {
    return { skipped: this.skipped, hintShown: this._hintShown };
  }

  fromJSON(data) {
    if (!data) return;
    this.skipped = data.skipped ?? 0;
    this._hintShown = data.hintShown ?? false;
  }
}
