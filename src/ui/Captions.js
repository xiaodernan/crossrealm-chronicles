/**
 * 字幕条（W-D6 切片8）—— 把"只靠声音传递的信息"写到屏幕上。
 *
 * ## 它是什么
 * 本仓音频全是合成音、没有一句语音，所以这里的"字幕"不是给台词配文字，而是给
 * **只靠声音传递的线索**配一个视觉出口。对听障与重听玩家，那些声音等于不存在：
 * 掉落了一件稀有装备、处决成功、开了个箱子 —— 屏幕上一个字都不多。
 *
 * ## 它只听一条事件
 * `game-cue`。派发咽喉是 `engine/cues.js` 的 `emitCue`，名册是
 * `content/captions.js` 的 `CUE_CATALOG`。这里不判断"该不该显示"，
 * 只负责"给了就画、到期就收"—— 判据在名册那一边，加一条线索不用改这个文件。
 *
 * ## 三条设计约束
 * 1. **同一条线索重复到达只续期、不叠行**。拾取魂/装备时一帧内可能连来好几声
 *    `pickup`（`LootSystem.update` 那个倒序循环一次能收好几个），叠起来字幕条会抖成一片。
 * 2. **同屏最多三条**。字幕条是稀缺的注意力资源，不是声音日志 —— 堆高了只会盖住屏幕，
 *    并把真正重要的那条挤下去。超了丢最旧的一条。
 * 3. **设置关掉时整条静默**，但**不影响声音**：开关只挡这一层，`game-cue` 照旧派发、
 *    `AudioManager` 照旧播。把音频静音的玩家也看得到字幕（这正是它存在的理由）。
 *
 * ## 可访问性
 * 容器带 `role="status"` + `aria-live="polite"`：字幕是**状态播报**，不是警告，
 * 所以用 polite 而不是 assertive（后者会打断读屏正在念的东西）。
 */
import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';
import { cueOf, cueTtlOf } from '../content/captions.js';

const UI_CAPTIONS = 'ui/Captions';
const captionsOn = (name, handler) => on(name, handler, UI_CAPTIONS);

/** 同屏最多几条。超了丢最旧的一条 —— 见文件头约束 2 */
const MAX_LINES = 3;

export class Captions {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移同一族） */
  dispose() {
    offAll(UI_CAPTIONS);
    this.el?.remove();
    this.el = null;
  }

  constructor(game) {
    this.game = game;
    this.el = document.createElement('div');
    this.el.id = 'captions';
    // 状态播报而非警告：polite 不会打断读屏正在念的内容
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.el);
    /** 在场上的字幕行：`{ id, ttl }`，按出现顺序（老的在前面） */
    this.lines = [];
    this.enabled = game?.settings?.get?.('captions') === true;
    captionsOn('game-cue', (e) => this.show(e.detail?.cue, e.detail?.data));
  }

  /**
   * 开关（设置项 `captions`）。只挡这一层：`game-cue` 照旧派发、声音照旧播，
   * 关掉的只是"写不写到屏幕上"。
   * @param {boolean} on
   */
  setEnabled(on) {
    this.enabled = on === true;
    if (!this.enabled) this.clear();
    return this.enabled;
  }

  /** 清掉场上所有行（关开关与读档重放时用） */
  clear() {
    for (const line of this.lines) line.el?.remove();
    this.lines.length = 0;
  }

  /**
   * 画一条字幕。
   *
   * 表外线索 id 由 `cueOf()` 当场抛（与 `AudioManager._playCue` 同一道校验，
   * 两边都不许静默）—— 但**在 `enabled` 为假时直接返回，不校验**：
   * 关着字幕的玩家不该因为一条坏线索被炸掉，那道校验该由 `AudioManager` 那一侧兜住
   * （它永远在听，与开关无关）。
   *
   * @param {string} id   `CUE_CATALOG` 里的线索 id
   * @param {object} [data] 这条线索带的数（喂给 `t()` 做插值）
   */
  show(id, data) {
    if (!this.enabled) return null;
    const cue = cueOf(id);
    // 同一条线索已在场上：收掉旧的再画新的 —— 既续了期，也让入场动画重新走一遍
    const dup = this.lines.find((l) => l.id === id);
    if (dup) this._drop(dup);
    const el = document.createElement('div');
    el.className = `caption caption-${cue.kind}`;
    el.textContent = t(cue.key, data ?? {});
    this.el.appendChild(el);
    const line = { id, el, ttl: cueTtlOf(id) };
    this.lines.push(line);
    while (this.lines.length > MAX_LINES) this._drop(this.lines[0]);
    return line;
  }

  /** @param {{ id: string, el: HTMLElement }} line */
  _drop(line) {
    line.el?.remove();
    const i = this.lines.indexOf(line);
    if (i >= 0) this.lines.splice(i, 1);
  }

  /** 主循环驱动：到期的行退场。与 `CombatStyleOverlay` 同一族，不另起定时器（B38） */
  update(dt) {
    if (!this.lines.length) return;
    for (const line of [...this.lines]) {
      line.ttl -= dt;
      if (line.ttl <= 0) this._drop(line);
    }
  }
}
