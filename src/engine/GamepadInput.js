/**
 * 手柄 → 现有 `keys` 形状的轮询桥（W-A7 切片1）。
 *
 * 主循环每帧 `poll()` 一次（这是全仓唯一读 `navigator.getGamepads()` 的地方）：
 * 手柄不产生 `keydown` 事件，所以"谁来构造 keys"必须有一个明确的时刻，否则同一帧里
 * 先后读到的输入会来自两个不同的瞬间。
 *
 * 三条不显眼、但决定"能不能用"的规则：
 * 1. **只还自己借走的那一份**（`claimed`）：键盘与手柄共用同一个 `keys['KeyW']`，
 *    若每帧无条件写 `false`，插着手柄时键盘按的 W 会被手柄抹掉。手柄按下才置真，
 *    松手只清自己置过的那一格。
 * 2. **`edge` 动作只在按下那一帧给 true**：一批老消费者是"读完把键清成 false"的写法
 *    （`KeyQ` / `KeyX` / `Digit4` / `KeyE`），给电平就会按住连发。
 * 3. **拔手必须还键**：热拔插那一帧不清，玩家就会永远朝前走 —— 比"没反应"糟得多。
 */
import { GAMEPAD_BINDINGS, PAD, padButtonIndex, padDpadIndex } from '../content/keybinds.js';

/**
 * 摇杆八向量化：octant i 亮起的两个方向。
 *
 * 为什么不"每根轴各自过门限"：那样推到 70° 时两根轴都算按着，玩家想纯向前却斜着走。
 * 这里正方向各占 ±22.5°、斜方向各占 45°，与"手想干什么"对得上。
 */
const OCTANT_PRIMARY = ['right', 'right', 'up', 'up', 'left', 'left', 'down', 'down'];
const OCTANT_SECOND = [null, 'up', null, 'left', null, 'down', null, 'right'];
const OCTANT = Math.PI / 4;

export class GamepadInput {
  /**
   * @param {{ keys: object, mouseDown?: object }} target 现有输入出口（`Game.keys` 等）
   * @param {object} bindings 动作表（用例给子集就行，不必碰全局）
   * @param {()=>any[]} [getPads] 手柄来源，缺省读 `navigator.getGamepads()`
   */
  constructor(target, bindings = GAMEPAD_BINDINGS, getPads = null) {
    this.keys = target.keys;
    this.mouseDown = target.mouseDown ?? null;
    this.getPads = getPads ?? (() => (navigator.getGamepads ? navigator.getGamepads() : []));
    /** 展开成一条一格：轮询时不再查表名、也不在热路径分配对象 */
    this._slots = Object.values(bindings).map((e) => ({
      mode: e.mode,
      code: e.code ?? null,
      mouse: e.mouse ?? null,
      button: e.button === undefined ? -1 : padButtonIndex(e.button),
      axisX: e.axes ? e.axes[0] : -1,
      axisY: e.axes ? e.axes[1] : -1,
      dirName: e.dir ?? null,
      dpad: e.dir === undefined ? -1 : padDpadIndex(e.dir),
      down: false,
      claimed: false,
    }));
    /** 记住手柄插在第几号口：换口或多只手柄时不该中途换目标 */
    this._padIndex = -1;
    this.active = false;
  }

  /** @returns {boolean} 这一帧是否读到了手柄 */
  poll() {
    const pad = this._pickPad();
    if (!pad) {
      if (this.active) this.releaseAll();
      return false;
    }
    this.active = true;
    const buttons = pad.buttons ?? [];
    const axes = pad.axes ?? [];
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      let on = s.button >= 0 && _pressed(buttons[s.button], s.down);
      if (!on && s.dirName !== null) on = _stickHeld(axes, s) || _pressed(buttons[s.dpad], s.down);
      const fire = s.mode === 'level' ? on : (on && !s.down);
      s.down = on;
      if (fire) this._grab(s);
      else if (s.claimed) this._release(s);
    }
    return true;
  }

  /** 拔手 / 主动停用：把置过的键全部还回去 */
  releaseAll() {
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      if (s.claimed) this._release(s);
      s.down = false;
    }
    this.active = false;
  }

  _grab(s) {
    if (s.code) this.keys[s.code] = true;
    else if (this.mouseDown) this.mouseDown[s.mouse] = true;
    s.claimed = true;
  }

  _release(s) {
    if (s.code) { if (this.keys[s.code]) this.keys[s.code] = false; }
    else if (this.mouseDown) this.mouseDown[s.mouse] = false;
    s.claimed = false;
  }

  /** 优先沿用上次那只；它拔了才认第一只在线的 —— 中途换目标会让手感跳变 */
  _pickPad() {
    const pads = this.getPads() ?? [];
    if (this._padIndex >= 0 && pads[this._padIndex]?.connected) return pads[this._padIndex];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]?.connected) {
        this._padIndex = i;
        return pads[i];
      }
    }
    this._padIndex = -1;
    return null;
  }
}

/** 扳机既报 `pressed` 又报模拟量：按下用 `pressThreshold`，松开用更低一档做迟滞 */
function _pressed(btn, wasDown) {
  if (!btn) return false;
  const value = btn.pressed ? 1 : (typeof btn.value === 'number' ? btn.value : 0);
  return value >= (wasDown ? PAD.releaseThreshold : PAD.pressThreshold);
}

/** 摇杆：先在径向死区之外，再看这一格管的方向落在八向量的哪一格里 */
function _stickHeld(axes, s) {
  const lx = axes[s.axisX] ?? 0;
  const ly = axes[s.axisY] ?? 0;
  if (Math.hypot(lx, ly) < PAD.deadzone) return false;
  const n = Math.round(Math.atan2(-ly, lx) / OCTANT);
  const i = ((n % 8) + 8) % 8;
  return s.dirName === OCTANT_PRIMARY[i] || (s.dirName !== null && s.dirName === OCTANT_SECOND[i]);
}
