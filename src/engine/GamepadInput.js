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
 *
 * ## 出口在按下那一刻才解析（W-A7 切片5）
 *
 * 表里不再抄键码，`_grab` 当场问注入的解析器（`Game` 给的是"游戏键 → `codeFor`，
 * 热键冒充 → 当前生效的热键表"）。两个后果都是想要的：改绑立刻生效、不必重建桥；
 * 而 `_release` 用的是**当初真正置过的那一格**（`s.claimedCode`），
 * 所以"按住时改绑"不会漏放一个键 —— 漏放就是玩家永远朝前走。
 */
import {
  GAMEPAD_BINDINGS, PAD, PAD_BUTTON_BY_INDEX, PAD_BUTTON_COUNT,
  bindingFor, padButtonIndex, padDpadIndex,
} from '../content/keybinds.js';

/**
 * 缺省解析器：只认游戏键。声明了 `hotkey` 的格子（暂停菜单冒充 UI 热键）
 * 需要调用方注入解析器 —— 桥不认识热键表，也不该认识。
 */
const defaultResolve = (slot) => (slot.hotkey ? null : bindingFor(slot.action));

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
   * @param {(slot: {action: string, hotkey: string|null}) => ({code?: string, mouse?: string}|null)} [resolve]
   *        出口解析器；缺省只认游戏键（`bindingFor`）
   */
  constructor(target, bindings = GAMEPAD_BINDINGS, getPads = null, resolve = null) {
    this.keys = target.keys;
    this.mouseDown = target.mouseDown ?? null;
    this.getPads = getPads ?? (() => (navigator.getGamepads ? navigator.getGamepads() : []));
    this._resolve = resolve ?? defaultResolve;
    /** 格子形状只在一处推导（`useBindings`）—— 构造与改绑走同一条，抄两份就是第二真源 */
    this._slots = [];
    /** 界面态边沿的复用槽（切片14）：必须先于 `useBindings` 存在，换表要清它 */
    this.ui = {};
    this.useBindings(bindings);
    /**
     * 改绑捕获态（切片9）：`_capture` 是"找到之后交给谁"，`_captureBtn` 是已按下、
     * 正等松手的那一格按钮序号。分两帧的原因是**报出按钮名的那一刻它还被按着** ——
     * 若按下就报，面板改完表之后下一帧会把这同一个按下当成新动作触发一次（改绑跳到
     * `start` 的那一格会立刻开一次暂停菜单）。等松手再报，就没有这一次幽灵输入。
     */
    this._capture = null;
    this._captureBtn = -1;
    this._capPrev = new Array(PAD_BUTTON_COUNT).fill(false);
    /** 记住手柄插在第几号口：换口或多只手柄时不该中途换目标 */
    this._padIndex = -1;
    this.active = false;
    /**
     * 本帧的镜头输入，单位"相当于每秒推多少鼠标点"（时间倍率由调用方乘，见 `Game.update`）。
     * 复用槽，热路径不分配。
     */
    this.look = { x: 0, y: 0 };
    /**
     * 本帧左摇杆的**模拟量**（切片8）：`{x, y, mag}`，x 向右、y 向前、`mag` 是死区重映射
     * 之后的 0~1 模长（所以 `mag` 就是"想走多快"，`x/mag, y/mag` 是方向）。
     * 与 `look` 同为复用槽：`readMoveDir` 每帧读一次，绝不在热路径上新建对象。
     */
    this.move = { x: 0, y: 0, mag: 0 };
    /**
     * 界面态那几格的边沿（切片14）：与 `look` / `move` 同为复用槽，热路径不分配。
     *
     * 为什么不把它们也合成成 `keys` 里的某个键码：`confirm` 在热键表里没有对应格 ——
     * 浏览器已经用原生 Enter 处理"激活聚焦的那一格"，我们再冒充一次就是"同一下按键两个消费者"
     * （切片10 抓到的 B52）。所以这条只报"这一帧 A 被按下了"，由 `Game` 交给
     * `FocusNav.activateFocused` 去点那一下。
     */
    Object.assign(this.ui, { confirm: false });
  }

  /**
   * 换一张绑定表（切片9：玩家在面板里改了手柄键位、或按了"恢复默认"）。
   *
   * 按**动作名**认领旧格子的边沿与借键账本：按住期间改绑不该漏放键（`claimedCode` 记的是
   * 当初真正置过的那一格），也不该在换表后的第一帧凭空补发一次"刚按下"。
   * 被这次改表删掉的格子（换表结构而不是换按钮）仍然把借走的键还回去 —— 漏还就是"永远朝前走"那一类。
   */
  useBindings(bindings = GAMEPAD_BINDINGS) {
    const prev = new Map(this._slots.map((s) => [s.action, s]));
    /** 展开成一条一格：轮询时不再查表名、也不在热路径分配对象 */
    this._slots = Object.values(bindings).map((e) => {
      const slot = {
        action: e.action,
        hotkey: e.hotkey ?? null,
        /** 界面态那一格报边沿而不写键（切片14）；信号名就是动作名，见 `UI_PAD_SIGNALS` */
        ui: e.ui === true,
        mode: e.mode,
        button: e.button === undefined ? -1 : padButtonIndex(e.button),
        axisX: e.axes ? e.axes[0] : -1,
        axisY: e.axes ? e.axes[1] : -1,
        dirName: e.dir ?? null,
        dpad: e.dir === undefined ? -1 : padDpadIndex(e.dir),
        down: false,
        claimed: false,
        /** 当初真正置过的那一格：改绑之后仍要能原样放回去 */
        claimedCode: null,
        claimedMouse: null,
      };
      const old = prev.get(e.action);
      if (old) {
        slot.down = old.down;
        slot.claimed = old.claimed;
        slot.claimedCode = old.claimedCode;
        slot.claimedMouse = old.claimedMouse;
        prev.delete(e.action);
      }
      return slot;
    });
    for (const stale of prev.values()) this._release(stale);
    // 界面那几格的边沿也一起清：换表之后那次按下已经不属于任何一张表，留着它就会被下一帧消费到
    for (const k of Object.keys(this.ui)) this.ui[k] = false;
    return this;
  }

  /**
   * 开始捕获"下一次按下并松开的手柄键"（面板进入等待态时调用）。一次性：报出一个按钮名就自动解除。
   *
   * 进入之前先把桥借走的键全还回去：捕获期间不派发任何动作，若玩家正按着 LB 点进等待态，
   * 那一格就会永远停在"按着"状态（切片1 立的规矩是"只还自己借走的那一格"，这里是它的另一面）。
   */
  startCapture(onFound) {
    this._capture = typeof onFound === 'function' ? onFound : null;
    this._captureBtn = -1;
    this._capPrev.fill(false);
    if (this._capture) this.releaseAll();
    return this;
  }

  /** 取消捕获（面板关闭、或玩家再点一次那一行） */
  stopCapture() {
    this._capture = null;
    this._captureBtn = -1;
    return this;
  }

  /** 是否正在等玩家按手柄（面板用它决定还要不要摘监听） */
  get capturing() {
    return this._capture !== null;
  }

  /** @returns {string|null} 这一帧捕获完成时的按钮名；还在等就 null */
  _captureFrame(buttons) {
    for (let i = 0; i < this._capPrev.length; i++) {
      const on = _pressed(buttons[i], this._capPrev[i]);
      // 只认**第一个**按下的格子：玩家手快连按两枚时，报第二枚会让界面显示的与他按的不是同一键
      if (!on && this._capPrev[i] && this._captureBtn === i) {
        this._capPrev[i] = false;
        return PAD_BUTTON_BY_INDEX[i] ?? null;
      }
      this._capPrev[i] = on;
      if (on && this._captureBtn < 0 && PAD_BUTTON_BY_INDEX[i]) this._captureBtn = i;
    }
    return null;
  }

  /** 捕获结束那一刻按当前物理状态补边沿账：还按着的不算"刚按下"，松手才算下一次 */
  _primeEdges(buttons) {
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      if (s.button >= 0) s.down = _pressed(buttons[s.button], true);
      else if (s.dpad >= 0) s.down = _pressed(buttons[s.dpad], true);
    }
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
    // 边沿只有一帧宽：与 `look` / `move` 一样在帧首归零，消费方（`Game.update`）在本帧内读
    this.ui.confirm = false;
    // 捕获期：这一帧只用于"看玩家按了哪一枚"，不派发任何动作、也不更新摇杆复用槽
    // （面板里改绑时手是放在摇杆上的，让它顺手把镜头转半圈是 bug 不是手感）
    if (this._capture) {
      const found = this._captureFrame(buttons);
      if (!found) return true;
      const done = this._capture;
      this._capture = null;
      this._captureBtn = -1;
      done(found);                 // 面板在这一步写设置 → 重建三张表 → `useBindings`
      this._primeEdges(buttons);   // 之后：仍按着的格子记成"已按下"，不许补发一次动作
      return true;
    }
    this._pollLook(axes);
    this._pollMove(axes);
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      let on = s.button >= 0 && _pressed(buttons[s.button], s.down);
      if (!on && s.dirName !== null) on = _stickHeld(axes, s) || _pressed(buttons[s.dpad], s.down);
      const fire = s.mode === 'level' ? on : (on && !s.down);
      s.down = on;
      // 脉冲只有一帧宽：主循环里 `poll()` 排在 `player.update` 之前，所以这一帧必然被
      // `CombatController` 读到（读走后它自己会缓冲 0.18 秒的动作意图），桥不越权替它留着
      if (!fire) { if (s.claimed) this._release(s); continue; }
      // 界面那几格只报边沿：它们既不占 `keys`、也不参与"只还自己借走的那一格"那本账
      if (s.ui) this.ui[s.action] = true;
      else this._grab(s);
    }
    return true;
  }

  /**
   * 右摇杆 → 镜头速率：径向死区之内算没碰；出死区按**模拟量**给出（推一半转半速），
   * 并把死区到量程那一段重映射回 0~1，免得"离开死区的一瞬间就已经是满舵"，
   * 也免得"推到行程尽头才勉强算满舵"（`analogRange`）。再走一次响应曲线（`lookCurve`）
   * 把中低段压下来 —— 准星微调不该一推就过头。
   */
  _pollLook(axes) {
    const lx = axes[PAD.lookAxes[0]] ?? 0;
    const ly = axes[PAD.lookAxes[1]] ?? 0;
    const mag = Math.hypot(lx, ly);
    const t = _analogMagnitude(mag, PAD.lookDeadzone);
    const out = this.look;
    if (t <= 0) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    // 方向取原始轴值（曲线只改快慢，不改朝哪儿）
    const scale = (t ** PAD.lookCurve) * PAD.lookPixelsPerSecond;
    out.x = (lx / mag) * scale;
    out.y = (ly / mag) * scale;
    return out;
  }

  /**
   * 左摇杆 → 模拟量移动（切片8）。与八向码**并存**：码管"往哪儿、算不算被按下"
   * （十字键与键盘都只有满速一档的语义），`move` 管"推了多少"。
   * 消费方（`readMoveDir`）只在 `mag > 0` 时才用它，所以十字键那一推不会被清零成慢速。
   */
  _pollMove(axes) {
    const lx = axes[PAD.moveAxes[0]] ?? 0;
    const ly = axes[PAD.moveAxes[1]] ?? 0;
    const mag = Math.hypot(lx, ly);
    const out = this.move;
    const t = _analogMagnitude(mag, PAD.deadzone);
    out.mag = t;
    // 手柄的 y 轴向下为正，"前"是 -y：这里就把符号翻掉，消费方不必知道手柄的坐标系
    if (t <= 0) {
      out.x = 0;
      out.y = 0;
      return out;
    }
    out.x = (lx / mag) * t;
    out.y = (-ly / mag) * t;
    return out;
  }

  /** 拔手 / 主动停用：把置过的键全部还回去 */
  releaseAll() {
    for (let i = 0; i < this._slots.length; i++) {
      const s = this._slots[i];
      if (s.claimed) this._release(s);
      s.down = false;
    }
    this.look.x = 0;
    this.look.y = 0;
    this.move.x = 0;
    this.move.y = 0;
    this.move.mag = 0;
    this.ui.confirm = false;
    this.active = false;
  }

  _grab(s) {
    const b = this._resolve(s);
    s.claimedCode = b?.code ?? null;
    s.claimedMouse = b?.mouse ?? null;
    if (s.claimedCode) this.keys[s.claimedCode] = true;
    else if (s.claimedMouse && this.mouseDown) this.mouseDown[s.claimedMouse] = true;
    s.claimed = true;
  }

  _release(s) {
    // 用当初置过的那一格，而不是"现在解析出来的" —— 按住期间改绑不该漏放一个键
    if (s.claimedCode) { if (this.keys[s.claimedCode]) this.keys[s.claimedCode] = false; }
    else if (s.claimedMouse && this.mouseDown) this.mouseDown[s.claimedMouse] = false;
    s.claimedCode = null;
    s.claimedMouse = null;
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

/**
 * 摇杆模长 → 0~1 的有效行程：死区以内算 0，死区到 `analogRange` 之间线性铺开，量程之外
 * 夹住。两端都要收口：不夹上限则"推到 1.0"会超出满速，不铺下限则刚离开死区那一格会是
 * 一串 0 速的抖动。
 */
function _analogMagnitude(mag, deadzone) {
  const range = PAD.analogRange;
  if (!(mag > deadzone) || !(range > deadzone)) return 0;
  return Math.min(1, (mag - deadzone) / (range - deadzone));
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
