/**
 * 手柄绑定表（W-A7）。
 *
 * 为什么合成成"键盘码"而不是先做一套动作枚举层：现有消费者（`PlayerController.readMoveDir`、
 * `CombatController.update`、`SpellSystem.update`、`WeaponSystem.update`）读的都是
 * `keys['KeyW']` 这种 `KeyboardEvent.code` 形态。桥只做"手柄 → 这同一个形状"，
 * 键盘路径可以逐字不动、所有现有用例继续有效；重映射因此天然只有一个真源（这张表）。
 *
 * `mode` 不是装饰，是这条链上唯一的安全阀：
 * - `level` —— 按住即真（移动、冲刺：要的就是"一直按着就一直生效"）；
 * - `edge` —— 只在按下那一帧给 true（锁定、翻滚、施法：这些消费者里有一部分是
 *   "读完就把键清成 false"的老写法，若给电平，按住 LB 会变成每帧切换一次锁定 ——
 *   正是 W-A4 修掉的"按住 Ctrl 每帧请求一次翻滚"那一类）。
 * 老写法本身归后续切片收口（`CombatController._pressed` 才是该走的路），这张表先把坑填上。
 */

/** 摇杆与扳机的取值口径（全是归一后的 0~1） */
export const PAD = {
  /** 摇杆径向死区：模长小于它就当没碰 —— 松手的手柄常有 0.05 左右的漂移。
   *  出了死区之后由八向量化决定点亮哪一格（正方向各占 ±22.5°、斜方向各占 45°），
   *  不再另设单轴门限：那会让"想纯向前却斜着走"变成常态。 */
  deadzone: 0.2,
  /** 扳机（LT/RT 在标准映射里既当轴又当键）按下的门限 */
  pressThreshold: 0.5,
  /** 迟滞下沿：按下后要退到这以下才算松开，免得扳机停在门限上反复触发 */
  releaseThreshold: 0.35,
  /**
   * 右摇杆 → 镜头。与移动那条**不是一回事**：镜头要的是模拟量（推一点转一点），
   * 所以它不走八向量、也不冒充 `keys`，而是交给 `PlayerController.addCameraInput`。
   *
   * `lookPixelsPerSecond` 的单位是"每秒相当于推多少鼠标点"，因为 `addCameraInput` 吃的就是点：
   * 满推 1300 点/秒 × `cameraSensitivity 0.002` ≈ 2.6 弧度/秒 ≈ 150°/秒 —— 既跟得上转身，
   * 也不至于满舵一秒就晕。死区比移动小一档：镜头对漂移比走路更显眼。
   */
  lookAxes: [2, 3],
  lookDeadzone: 0.15,
  lookPixelsPerSecond: 1300,
};

/**
 * 标准映射（`pad.mapping === 'standard'`）下的按钮序号，Chrome/Firefox 一致。
 * 表里写名字而不是数字，是为了让"这一格绑到哪个物理键"在读表时就成立。
 */
export const PAD_BUTTON = {
  a: 0, b: 1, x: 2, y: 3, leftBumper: 4, rightBumper: 5,
  leftTrigger: 6, rightTrigger: 7, select: 8, start: 9,
  leftStick: 10, rightStick: 11,
  dpadUp: 12, dpadDown: 13, dpadLeft: 14, dpadRight: 15,
};

/** 逻辑动作名：UI 提示与将来的重映射界面拿它当标识，不用 `code` 也不用序号 */
export const PAD_ACTIONS = [
  'moveUp', 'moveDown', 'moveLeft', 'moveRight',
  'sprint', 'jump', 'roll', 'parry', 'weaponArt', 'lockOn',
  'attackLight', 'attackHeavy', 'spellOne', 'swapWeapon',
];

/**
 * 一张表一个动作。字段：
 * - `action`：逻辑动作名（必须在 `PAD_ACTIONS` 里）
 * - `mode`：`'level' | 'edge'`
 * - `code`：冒充的 `KeyboardEvent.code`（与 `mouse` 二选一）
 * - `mouse`：`'left' | 'right'`，写进 `CombatController.mouseDown`（与 `code` 二选一）
 * - 来源：按钮动作写 `button`（`PAD_BUTTON` 的键名）；移动动作写 `axes`（`[横轴, 纵轴]`）
 *   加 `dir`（这一格管哪个方向），十字键由 `dir` 自动带上 —— 摇杆与十字键同时生效，
 *   不必各绑一遍，也不会出现"只绑了摇杆、用十字键的人动不了"。
 */
export const GAMEPAD_BINDINGS = {
  moveUp: { action: 'moveUp', mode: 'level', code: 'KeyW', axes: [0, 1], dir: 'up' },
  moveDown: { action: 'moveDown', mode: 'level', code: 'KeyS', axes: [0, 1], dir: 'down' },
  moveLeft: { action: 'moveLeft', mode: 'level', code: 'KeyA', axes: [0, 1], dir: 'left' },
  moveRight: { action: 'moveRight', mode: 'level', code: 'KeyD', axes: [0, 1], dir: 'right' },
  sprint: { action: 'sprint', mode: 'level', button: 'leftStick', code: 'ShiftLeft' },
  jump: { action: 'jump', mode: 'edge', button: 'a', code: 'Space' },
  roll: { action: 'roll', mode: 'edge', button: 'b', code: 'ControlLeft' },
  parry: { action: 'parry', mode: 'edge', button: 'x', code: 'KeyF' },
  weaponArt: { action: 'weaponArt', mode: 'edge', button: 'y', code: 'KeyR' },
  lockOn: { action: 'lockOn', mode: 'edge', button: 'leftBumper', code: 'KeyQ' },
  attackLight: { action: 'attackLight', mode: 'edge', button: 'rightBumper', mouse: 'left' },
  attackHeavy: { action: 'attackHeavy', mode: 'edge', button: 'rightTrigger', mouse: 'right' },
  spellOne: { action: 'spellOne', mode: 'edge', button: 'leftTrigger', code: 'Digit1' },
  swapWeapon: { action: 'swapWeapon', mode: 'edge', button: 'select', code: 'KeyX' },
};

/** 十字键在标准映射里的方向 → 按钮序号（移动动作的 `dir` 用它顺带带上十字键） */
const DPAD_BUTTON = {
  up: PAD_BUTTON.dpadUp, down: PAD_BUTTON.dpadDown,
  left: PAD_BUTTON.dpadLeft, right: PAD_BUTTON.dpadRight,
};

const MODES = ['level', 'edge'];

/** 左摇杆推动要影响的四个动作（其余动作不许声明 `axes`） */
const STICK_ACTIONS = ['moveUp', 'moveDown', 'moveLeft', 'moveRight'];

function fail(at, why) {
  throw new Error(`手柄绑定 ${at} ${why}`);
}

/**
 * 整表校验，加载期跑一次（与 `assertArenaScript` 同一条纪律：错表要在**接上手柄之前**就红，
 * 而不是玩家插上手柄、按了一下发现"没反应"却不知道为什么）。
 */
export function assertKeybinds(table = GAMEPAD_BINDINGS) {
  for (const [name, e] of Object.entries(table)) {
    if (name !== e.action) fail(name, '的键名与 `action` 字段不一致');
    if (!PAD_ACTIONS.includes(e.action)) fail(name, '未登记于 PAD_ACTIONS');
    if (!MODES.includes(e.mode)) fail(name, '的 mode 必须是 level / edge');
    if (Boolean(e.code) === Boolean(e.mouse)) fail(name, '必须恰好声明 code 或 mouse 之一');
    if (e.mouse && e.mouse !== 'left' && e.mouse !== 'right') fail(name, '的 mouse 只能是 left / right');
    if (e.button !== undefined && !(e.button in PAD_BUTTON)) fail(name, `的按钮 "${e.button}" 未登记`);
    if (STICK_ACTIONS.includes(e.action)) {
      if (e.button !== undefined) fail(name, '是移动动作，不该绑按钮（要的是摇杆 + 十字键）');
      if (!Array.isArray(e.axes) || e.axes.length !== 2
        || !e.axes.every((a) => Number.isInteger(a) && a >= 0)) {
        fail(name, '的 axes 必须是两个非负整数下标');
      }
      if (!DPAD_BUTTON[e.dir]) fail(name, '的 dir 必须是 up / down / left / right');
    } else if (e.button === undefined || e.axes !== undefined || e.dir !== undefined) {
      fail(name, '必须且只能声明一个 `button` 来源');
    }
  }
  // 同一个键盘码被两个动作抢用 = 一次按下触发两件事；这是表级错误，当场红
  const taken = new Map();
  for (const [name, e] of Object.entries(table)) {
    const sink = e.code ?? `mouse.${e.mouse}`;
    if (taken.has(sink)) fail(name, `与 ${taken.get(sink)} 抢同一个出口 ${sink}`);
    taken.set(sink, name);
  }
  return table;
}

/** 按钮名 → 序号（给轮询层用，避免各处自己查 `PAD_BUTTON`） */
export function padButtonIndex(name) {
  return PAD_BUTTON[name];
}

export function padDpadIndex(direction) {
  return DPAD_BUTTON[direction];
}

assertKeybinds();
