import { scheduler } from '../engine/Scheduler.js';
import { keyText } from '../content/keyHints.js';
import { on, offAll } from '../engine/EventBus.js';

/** 首次提示的计时分组（与演出时长无关，只负责"演出进行中才提示"） */
const HINT_TAG = 'combat-skip-hint';
/** 监听分组：`dispose()` 按它整体注销 */
const LISTEN_TAG = 'combat-cinematic-skip';

/**
 * 处决/慢镜头演出 — Esc 跳过
 *
 * ## 注销（W-A1 的注销半区，逐系统迁移中的一处）
 * 两条监听从裸 `window.addEventListener` 迁到 `EventBus.on(…, tag)`，并补上 `dispose()`
 * —— 改前这个类**没有生命周期终点**，那两条监听挂上就再也拿不回来（`event-bus` 的
 * 逐文件台账记着这一笔：`cinematic/CombatCinematicSkip.js: 2`）。
 *
 * **谁调 `dispose()`**：目前只有测试与将来的 teardown 链。`Game` 本身还没有
 * "把所有子系统收干净"的那个出口（它自己台账上也有 13 处裸监听），所以这一片交付的是
 * **注销路径本身**，不是"已经有人在注销"。这一步的价值在于：下一个接 teardown 的人
 * 只需要调用它，而不必先回头给每个系统补一遍。
 */
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
    on('combo-finisher', () => this._maybeHint(), LISTEN_TAG);
    on('combat-execution', () => this._maybeHint(), LISTEN_TAG);
  }

  /**
   * 注销：两条监听 + 那条待办计时。
   * 计时也要清 —— 只解监听不清计时，`_maybeHint` 已经排下的那一次仍会跑，
   * 于是"注销之后还弹了一次提示"。
   */
  dispose() {
    offAll(LISTEN_TAG);
    scheduler.clear(HINT_TAG);
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
