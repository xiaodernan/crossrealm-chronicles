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
    // 跳过演出不再自己听 keydown（切片10 / 修 B52）：那一下归层表的 combatCinematic 层，
    // 由 `Game.runEscape()` 动手。原来那三行"见对话/菜单/升级/过场就让路"的守卫，
    // 现在就是 `OVERLAY_LAYERS` 里的顺序 —— 手写名单少一处，"事件里跳完、派发口再拿同一下开菜单"的重影也少一处。
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
