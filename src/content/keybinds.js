/**
 * 输入绑定表（W-A7 切片1 手柄桥 / 切片5 键位出口唯一真源）。
 *
 * ## 为什么合成成"键盘码"而不是先做一套动作枚举层
 *
 * 现有消费者（`PlayerController.readMoveDir`、`CombatController.update`、`SpellSystem.update`、
 * `WeaponSystem.update`）读的都是 `keys['KeyW']` 这种 `KeyboardEvent.code` 形态。
 * 桥只做"手柄 → 这同一个形状"，键盘路径可以逐字不动、所有现有用例继续有效。
 *
 * ## 两张表的分工（切片5 收口的关键）
 *
 * - `KEY_BINDINGS`：**动作 → 键盘/鼠标出口**，唯一真源。消费者的硬编码键位
 *   （`keys['KeyF']` 之类）一律改问 `codeFor(action)`。
 * - `GAMEPAD_BINDINGS`：**动作 → 手柄来源**（哪个按钮 / 哪根轴），只此一事。
 *
 * 切片5 之前手柄表自己也抄了一份 `code: 'KeyF'`，于是同一条动作有两个真源 ——
 * 把弹反改绑到 G 键只会改到键盘那一半，手柄仍按 F，而且**不会报错**。
 * 这与 B36（中文显示名判定）、B45（POI id 回退）是同一类病灶：稳定身份靠人肉复制。
 * 现在手柄表不再声明出口，桥在按下那一刻问 `codeFor(action)`。
 *
 * ## 唯一还带出口的手柄格子：`pauseMenu`
 *
 * 暂停菜单不是游戏键，它归 UI 热键表（`content/hotkeys.js` 的 `escape`），
 * 而那一格也是可重映射的。所以这一格声明 `hotkey: 'escape'`（逻辑动作名）而不是键码，
 * 由 `Game` 注入的解析器去问当前生效的热键表 —— 玩家把返回键改绑之后，手柄的 Start 跟着走。
 *
 * ## `mode` 不是装饰，是这条链上唯一的安全阀
 *
 * - `level` —— 按住即真（移动、冲刺：要的就是"一直按着就一直生效"）；
 * - `edge` —— 只在按下那一帧给 true（锁定、翻滚、施法：这些消费者里有一部分是
 *   "读完就把键清成 false"的老写法，若给电平，按住 LB 会变成每帧切换一次锁定 ——
 *   正是 W-A4 修掉的"按住 Ctrl 每帧请求一次翻滚"那一类）。
 */
import { UI_HOTKEYS, applyHotkeyOverrides } from './hotkeys.js';

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
  /** ↓ 这三格是**出厂值**，玩家可在设置面板里拧走（见 `PAD_TUNING`）；桥认的是 `this.tuning` */
  lookDeadzone: 0.15,
  lookPixelsPerSecond: 1300,
  /**
   * 摇杆的**外圈量程**（切片8）：模长到 0.92 就算推到底。模拟摇杆的物理行程常常有 2~8%
   * 到不了 1.0（外壳与拇指垫的摩擦），拿 1.0 当满舵的后果是"推到底只有 0.8 速"，
   * 而靠满舵触发的冲刺永远够不着。死区与量程一起决定重映射：
   * `t = (mag - dz) / (range - dz)`，再夹进 0~1。
   */
  analogRange: 0.92,
  /**
   * 左摇杆 → 移动。切片1 只把它量化成八向码（推一点与推到底一样快），切片8 起
   * 另外给出**模拟量**：`GamepadInput.move` 是死区重映射后的 `{x, y, mag}`（x 右、y 前）。
   * 八向码仍然照写 —— 十字键与键盘走的是那条路，且它是"满速"的语义来源。
   */
  moveAxes: [0, 1],
  /** 重映射模长到 0.9 才算"想跑"：留出最后一点行程，免得擦到量程边就误触发冲刺 */
  moveSprintThreshold: 0.9,
  /**
   * 走焦那几格（`cardinal`）的**回中迟滞系数**（切片19）：推出 `deadzone` 才点亮，
   * 要退到 `deadzone × 0.6` 以下才算松手。
   *
   * 为什么是系数而不是又一个绝对数值：扳机那对门限（`pressThreshold` / `releaseThreshold`）
   * 吃的是 0~1 的绝对刻度，摇杆这一档吃的却是**玩家自己拧的** `deadzone`（可到 0）——
   * 给一个固定下沿，在低死区档会高于进入门限，迟滞就反过来变成"一点亮就松不开"。
   * 为什么这条链要有迟滞：切片18 已经证明松手会把连发账清零（`HotkeyRouter` 里那一笔 `_held = 0`），
   * 摇杆停在死区边上抖一抖，玩家看到的就是"每抖一下重新等 0.42 秒" —— 焦点原地不动，
   * 而"没反应"比"慢半拍"难查得多。
   */
  navStickReleaseFactor: 0.6,
  /**
   * 右摇杆响应曲线：舵量 = `t ** lookCurve`。1.6 意味着半推只有约 33% 舵量（线性是 50%），
   * 中低段更细腻（微调准星不会一推就过头），满推端点与线性一致。
   * 移动**不吃这条曲线**：走路的"半推"要的就是半速，弯了它会变成"轻推不动、再推突然窜出去"。
   */
  lookCurve: 1.6,
};

/**
 * 玩家可以拧的那几根手感旋钮（切片15 起三根，切片21 再加三根）：**范围与出厂值都只写在这里**。
 *
 * 为什么不各写各的：`deadzone` 同时管着八向量化与模拟量两条路，`analogRange` 与它一起
 * 决定同一条重映射式，`lookCurve` 又只作用于镜头 —— 一旦"设置面板上的 min/max"与
 * "桥认的范围"是两份，就会出现"滑杆拖到头、桥却把那个值当脏数据回落出厂"那种玩家看不懂的现象。
 *
 * 键名**必须**与 `PAD` 里那一格同名：`padTuning()` 的出厂值就是 `PAD[key]`，面板的滑杆 id
 * 也是从键名推出来的（`set-` + 连字符写法）。一处改名而另两处没跟上，表现不是报错而是
 * 那一格从此拖不动 —— 所以 `tests/pad-tuning.test.js` 把"每一格都在 `PAD` 里有出厂值、
 * 出厂值落在自己的范围内、壳页里恰有一根同名滑杆"钉成了门禁。
 */
export const PAD_TUNING = {
  /** 摇杆径向死区：0 就是"完全不留漂移余量"（允许，但会自己承担抖动的后果） */
  deadzone: { min: 0, max: 0.4, step: 0.02 },
  /** 外圈量程：低于 0.6 就等于把半程当满舵，手感会疯掉，所以下限给得很高 */
  analogRange: { min: 0.6, max: 1, step: 0.02 },
  /** 镜头响应曲线：0.6 = 低段极灵敏，3 = 中低段几乎不动 */
  lookCurve: { min: 0.6, max: 3, step: 0.1 },
  /**
   * 右摇杆（镜头）那一档死区：与移动分开，因为镜头对漂移比走路显眼得多。
   * `step` 是 0.01 而不是照抄移动那格的 0.02：出厂值 0.15 要**正落在格子上** ——
   * `type=range` 会把值吸到 `min + n×step`，0.02 的格子上没有 0.15，玩家看到的会是 0.14。
   */
  lookDeadzone: { min: 0, max: 0.4, step: 0.01 },
  /** 满推时镜头的转速，单位是"每秒相当于推多少鼠标点"（`addCameraInput` 吃的就是点） */
  lookPixelsPerSecond: { min: 400, max: 2600, step: 100 },
  /**
   * 左摇杆推到多少（**重映射之后**的行程，不是物理行程）才算"想跑"：
   * 下限 0.3 是给"轻推就冲"的人，上限 1 = 出厂那句"推到底才跑"。
   * 拿重映射后的行程当刻度，是为了让它与 `deadzone` / `analogRange` 拧完之后仍然自洽。
   */
  moveSprintThreshold: { min: 0.3, max: 1, step: 0.05 },
};

/**
 * 出厂 + 玩家档 → 桥用的那一组值。存储里是玩家可控的数据：
 * 越界 / `NaN` / 字符串一律**逐项**回落出厂（不是整包作废 —— 玩家只把曲线拖坏不该连死区也没了），
 * 且不回写 `PAD` 本身：改了出厂对象就等于把全仓的默认值改了，"恢复默认"再也回不来。
 */
export function padTuning(raw = {}) {
  const out = {};
  for (const [key, spec] of Object.entries(PAD_TUNING)) {
    const v = Number(raw?.[key]);
    out[key] = Number.isFinite(v) && v >= spec.min && v <= spec.max ? v : PAD[key];
  }
  return out;
}

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

/**
 * 序号 → 按钮名（捕获口用它把"刚按下的是第几号"说回名字）。
 * 从 `PAD_BUTTON` 派生，不另抄一份 —— 两张表各写一遍正是切片5 消灭的那个病根。
 */
export const PAD_BUTTON_BY_INDEX = (() => {
  const list = new Array(Math.max(...Object.values(PAD_BUTTON)) + 1).fill(null);
  for (const [name, index] of Object.entries(PAD_BUTTON)) list[index] = name;
  return list;
})();

/** 标准映射里的按钮格数（`pad.buttons` 只扫这一段，多出来的格子不认） */
export const PAD_BUTTON_COUNT = Object.keys(PAD_BUTTON).length;

/** 逻辑动作名：UI 提示与重映射界面拿它当标识，不用 `code` 也不用序号 */
export const PAD_ACTIONS = [
  'moveUp', 'moveDown', 'moveLeft', 'moveRight',
  'sprint', 'jump', 'roll', 'parry', 'skill', 'lockOn',
  'attackLight', 'attackHeavy', 'spell1', 'swapWeapon', 'pauseMenu',
];

/**
 * 游戏逻辑动作名（键盘侧）。与 `PAD_ACTIONS` 有重叠但不相等 ——
 * 手柄只绑了法术 1，键盘有 1~4；手柄没有"交互/快速旅行"，键盘有。
 * 两者共用同一批动作名，所以一次重映射同时改到键盘与手柄。
 *
 * 动作名与 `MoveTable` 的**招式名**、输入缓冲的**动作名**是同一套字
 * （`light` / `heavy` / `roll` / `skill` / `parry`）：同一个东西只有一个名字。
 * 修前这一格叫 `weaponArt`，而缓冲与招式状态叫 `skill` —— 两个名字指同一件事，
 * 正是本切片要消灭的那类漂移（改绑时得先想清楚"我该写哪个名字"）。
 */
export const KEY_ACTIONS = [
  'moveUp', 'moveDown', 'moveLeft', 'moveRight',
  'sprint', 'jump', 'roll', 'parry', 'skill', 'lockOn',
  'attackLight', 'attackHeavy',
  'spell1', 'spell2', 'spell3', 'spell4',
  'swapWeapon', 'interact', 'fastTravel',
];

/**
 * 出厂键盘 / 鼠标绑定 —— **出口的唯一真源**。
 *
 * 每格恰好声明 `code`（`KeyboardEvent.code`）或 `mouse`（`'left' | 'right'`）之一。
 * `aliases` 是同一动作的**等价物理键**（左右 Ctrl / 左右 Shift）：
 * 它们不是"第二个真源"，而是同一条动作的多个入口，所以一起参与撞键校验，
 * 也一起被 `anyDown` / `codesFor` 看见 —— 修前那两个"或"是散在消费者里的硬编码。
 */
export const KEY_BINDINGS = {
  moveUp: { code: 'KeyW' },
  moveDown: { code: 'KeyS' },
  moveLeft: { code: 'KeyA' },
  moveRight: { code: 'KeyD' },
  sprint: { code: 'ShiftLeft', aliases: ['ShiftRight'] },
  jump: { code: 'Space' },
  roll: { code: 'ControlLeft', aliases: ['ControlRight'] },
  parry: { code: 'KeyF' },
  skill: { code: 'KeyR' },
  lockOn: { code: 'KeyQ' },
  attackLight: { mouse: 'left' },
  attackHeavy: { mouse: 'right' },
  spell1: { code: 'Digit1' },
  spell2: { code: 'Digit2' },
  spell3: { code: 'Digit3' },
  spell4: { code: 'Digit4' },
  swapWeapon: { code: 'KeyX' },
  interact: { code: 'KeyE' },
  fastTravel: { code: 'KeyT' },
};

/**
 * 一张表一个动作。字段：
 * - `action`：逻辑动作名（必须在 `PAD_ACTIONS` 里，且必须在 `KEY_BINDINGS` 里
 *   —— 除非这一格声明了 `hotkey`）
 * - `mode`：`'level' | 'edge'`
 * - `hotkey`：这一格冒充的是**某个 UI 热键**而不是游戏键（目前只有 `pauseMenu`）。
 *   写逻辑动作名，出口由当前生效的热键表给，不在这里抄键码。
 * - 来源：按钮动作写 `button`（`PAD_BUTTON` 的键名）；移动动作写 `axes`（`[横轴, 纵轴]`）
 *   加 `dir`（这一格管哪个方向），十字键由 `dir` 自动带上 —— 摇杆与十字键同时生效，
 *   不必各绑一遍，也不会出现"只绑了摇杆、用十字键的人动不了"。
 */
export const GAMEPAD_BINDINGS = {
  moveUp: { action: 'moveUp', mode: 'level', axes: [0, 1], dir: 'up' },
  moveDown: { action: 'moveDown', mode: 'level', axes: [0, 1], dir: 'down' },
  moveLeft: { action: 'moveLeft', mode: 'level', axes: [0, 1], dir: 'left' },
  moveRight: { action: 'moveRight', mode: 'level', axes: [0, 1], dir: 'right' },
  sprint: { action: 'sprint', mode: 'level', button: 'leftStick' },
  jump: { action: 'jump', mode: 'edge', button: 'a' },
  roll: { action: 'roll', mode: 'edge', button: 'b' },
  parry: { action: 'parry', mode: 'edge', button: 'x' },
  skill: { action: 'skill', mode: 'edge', button: 'y' },
  lockOn: { action: 'lockOn', mode: 'edge', button: 'leftBumper' },
  attackLight: { action: 'attackLight', mode: 'edge', button: 'rightBumper' },
  attackHeavy: { action: 'attackHeavy', mode: 'edge', button: 'rightTrigger' },
  spell1: { action: 'spell1', mode: 'edge', button: 'leftTrigger' },
  swapWeapon: { action: 'swapWeapon', mode: 'edge', button: 'select' },
  // 暂停菜单归 UI 热键表（`escape`），那一格可重映射，所以这里只写逻辑动作名
  pauseMenu: { action: 'pauseMenu', mode: 'edge', button: 'start', hotkey: 'escape' },
};

/**
 * **UI 态**的手柄表（切片14）：面板开着时，同一批物理按钮归界面而不是归战斗。
 *
 * 为什么要有第二张表而不是给每个动作加一个"面板里改成干什么"的字段：一枚按钮在两个
 * 上下文里各有一个主人，这是**事实**；把它塞进一张表就得给每格加一列上下文，
 * 而"现在算哪个上下文"仍然要在别处判 —— 那才是第二个真源。现在判据只有一处
 * （`Game.padUiMode()`：层表说"有一个收焦点的面板开着"），换的两样东西是同一件事：
 * 这张表与游戏表整表互换，走的是切片9 那条 `useBindings`（按动作名结转边沿与借键账本，
 * 所以进 UI 态那一刻，战斗侧借走的键会被原样还掉 —— 不退菜单就永远朝前走那一类）。
 *
 * 前六格复用切片5 那条 `hotkey` 机制：出口是**当前生效的热键表**给的键码，
 * 于是"把 ↑↓ 改绑到别的键"之后手柄也跟着搬，不必在这里再记一遍（← → 那两格是切片16 加的，
 * 走的是同一条：十字键左/右冒充 ← / →，于是"调值"这件事键盘与手柄是同一个派发口）。
 * 最后一格 `confirm` 特殊：它不冒充任何键盘键（浏览器已经用原生 Enter 处理激活，
 * 我们再冒充一次就是 B52），而是让桥报一个边沿，由 `Game` 交给 `FocusNav.activateFocused`。
 */
/** 界面态里"报边沿而不冒充键盘"的信号名（桥的 `ui` 复用槽就是按这张名单建的格子） */
export const UI_PAD_SIGNALS = ['confirm'];

export const UI_PAD_ACTIONS = ['navUp', 'navDown', 'navLeft', 'navRight', 'back', 'menu', ...UI_PAD_SIGNALS];

export const UI_GAMEPAD_BINDINGS = {
  /* 走焦与调值那四格是 **level**（切片18）：按住十字键要把借来的那一格键一直留在 `keys` 里，
   * 派发方（`HotkeyRouter`）才知道"还按着"，才谈得上自动重复。
   * 电平本身不等于连发 —— 许不许连发、多快，全在 `hotkeys.js` 的 `UI_NAV_ACTIONS` 与
   * `tuning.js` 的 `NAV_REPEAT` 那一处说；桥只负责"按着就把键留着"。
   * 切片19 起这四格**同时**收左摇杆（`axes` + `dir`，十字键由 `dir` 自动带上，与移动那四格同一条机制）：
   * 玩家推住摇杆与按住十字键要得到同一份电平，所以它们必须是**同一格**而不是两格 —— 两格就是
   * 同一个借来的键两个主人，松手时谁都不知道自己该不该还（切片1 的 `claimedCode` 那本账会记乱）。
   * `cardinal` 是这四格与移动那四格唯一的判据差别：移动推到 45° 想斜着走（八向量为它而设），
   * 走焦推到 45° 只想走一格 —— 一次亮两格会把"移一行"和"调这行的值"同时办掉。
   * 下面 B / Start / A 三格仍是 edge：返回与确认按一次就够，按住连发是把面板开开关关。 */
  navUp: { action: 'navUp', mode: 'level', axes: [0, 1], dir: 'up', cardinal: true, hotkey: 'uiUp' },
  navDown: { action: 'navDown', mode: 'level', axes: [0, 1], dir: 'down', cardinal: true, hotkey: 'uiDown' },
  navLeft: { action: 'navLeft', mode: 'level', axes: [0, 1], dir: 'left', cardinal: true, hotkey: 'uiLeft' },
  navRight: { action: 'navRight', mode: 'level', axes: [0, 1], dir: 'right', cardinal: true, hotkey: 'uiRight' },
  // 返回与开合菜单在界面里是同一件事（都走 `escape` 那条级联），但保留两格是因为
  // 玩家手里的习惯不一样：有人按 B，有人按 Start —— 一枚按钮一个主人，这里仍然成立。
  back: { action: 'back', mode: 'edge', button: 'b', hotkey: 'escape' },
  menu: { action: 'menu', mode: 'edge', button: 'start', hotkey: 'escape' },
  confirm: { action: 'confirm', mode: 'edge', button: 'a', ui: true },
};

/** 十字键在标准映射里的方向 → 按钮序号（移动动作的 `dir` 用它顺带带上十字键） */
const DPAD_BUTTON = {
  up: PAD_BUTTON.dpadUp, down: PAD_BUTTON.dpadDown,
  left: PAD_BUTTON.dpadLeft, right: PAD_BUTTON.dpadRight,
};

const MODES = ['level', 'edge'];

/**
 * `KeyboardEvent.code` 的合法形状（`KeyA` / `Digit1` / `F5` / `Backquote` / `Numpad0`…）。
 * 与 `hotkeys.js` 同一把尺子：过了这条正则就没有别处需要再 escape 一次。
 */
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

function fail(at, why) {
  throw new Error(`手柄绑定 ${at} ${why}`);
}

/**
 * 整表校验，加载期跑一次（与 `assertArenaScript` 同一条纪律：错表要在**接上手柄之前**就红，
 * 而不是玩家插上手柄、按了一下发现"没反应"却不知道为什么）。
 *
 * 两张表共用这一把尺子（切片14）：差别只有"认得哪些动作名"与"允不允许 `ui` 那种报边沿的格子"。
 * 走的是摇杆还是按钮**不查动作名名单**，只看那一格自己声明了 `axes` 还是 `button`（切片19）——
 * 从前这里抄了一份 `STICK_ACTIONS`，多加一格摇杆就得同步一次名单，漏一次就是那一格的形状没人校验，
 * 而"形状没被校验"这件事不会报错，只会在玩家推杆时表现为"没反应"。
 * 规则本身一条都不分叉 ——
 * 尤其"一枚物理按钮只许一个动作认领"是**表内**规则：上下文之间允许重叠
 * （战斗里 A 是跳，界面里 A 是确认），因为同一帧只有一张表在被轮询（切换判据只有一处，
 * 见 `Game.padUiMode()`），所以"按一次办两件事"在这两张表上都成立不了。
 */
export function assertKeybinds(table = GAMEPAD_BINDINGS,
  { actions = PAD_ACTIONS, allowSignal = false } = {}) {
  /**
   * 一枚物理按钮只许一个动作认领（切片9 起的必修项）。
   *
   * 单格形状合法不等于整表合法：出厂表恰好 16 格里 11 按钮互不重复，所以这条以前
   * 没人踩过；而手柄侧改绑界面一旦出现，"把跳跃与翻滚都绑到 A"就能通过全部单格校验，
   * 按一次 A 却办两件事（B47 在手柄轴上的重演，记为 **B51**）。
   * 摇杆方向算不算认领？算 —— 移动那四格顺带绑了十字键，所以十字键也是被占用的资源。
   */
  const owner = new Map();
  const claimPad = (index, who, what) => {
    if (index === undefined) return;
    const prev = owner.get(index);
    if (prev) fail(who, `的${what}已被动作 "${prev}" 认领：按一次办两件事`);
    owner.set(index, who);
  };
  for (const [name, e] of Object.entries(table)) {
    if (name !== e.action) fail(name, '的键名与 `action` 字段不一致');
    if (!actions.includes(e.action)) fail(name, '未登记于这张表的动作名单（游戏表 PAD_ACTIONS / 界面表 UI_PAD_ACTIONS）');
    if (!MODES.includes(e.mode)) fail(name, '的 mode 必须是 level / edge');
    // 出口的唯一真源是 `KEY_BINDINGS`（或 `hotkey` 指向的热键表），手柄表自己不许再抄一份
    if (e.code !== undefined || e.mouse !== undefined) {
      fail(name, '不许自己声明 code / mouse —— 出口只有 KEY_BINDINGS 一个真源');
    }
    if (e.ui === true) {
      // 界面态那一格既不冒充键盘键、也不写 `keys`：它只报一个边沿（见 `GamepadInput.ui`）。
      // 为什么不走 `hotkey`：`confirm` 在热键表里没有对应格 —— 浏览器已经用原生 Enter 处理激活，
      // 我们再登记一条就是"同一下按键两个消费者"（B52），所以这条路故意给它留着边沿而不是键。
      if (!allowSignal) fail(name, '不许声明 ui 边沿：只有界面态那张表有这种格子');
      if (e.hotkey !== undefined) fail(name, '报边沿的格子不该再冒充某个热键，出口就有两个说法了');
      if (!UI_PAD_SIGNALS.includes(e.action)) fail(name, '的信号名未登记于 UI_PAD_SIGNALS（桥的复用槽不认这个名字）');
      // 信号槽是"这一帧发生过一次"的电平，不是"正按着"：写成 level 就是每帧都点亮，
      // 按住 A 会把焦点那一格反复激活（连点同一个按钮），而它没有任何一份节奏可以拦。
      if (e.mode !== 'edge') fail(name, '报边沿的格子必须是 edge：电平会让确认每帧都点亮');
    } else if (e.hotkey !== undefined) {
      if (typeof e.hotkey !== 'string' || !e.hotkey) fail(name, '的 hotkey 必须是非空动作名');
      if (KEY_ACTIONS.includes(e.action)) fail(name, '同时是游戏键与热键冒充，说不清该问谁');
    } else if (!KEY_ACTIONS.includes(e.action)) {
      fail(name, '既不在 KEY_ACTIONS 里，也没声明 hotkey —— 桥不知道该冒充哪个键');
    }
    if (e.button !== undefined && !(e.button in PAD_BUTTON)) fail(name, `的按钮 "${e.button}" 未登记`);
    /* 摇杆格子还是按钮格子，看**这一格自己声明了什么**（切片19 起这是唯一的判据）。
     * 以前这里查一份外部名单（`STICK_ACTIONS`），只有游戏表用得上；界面表今天也有了摇杆格
     * （走焦那四格），名单就得再抄一份 —— 而"哪些格子是摇杆"这件事表本身就知道。 */
    if (e.axes !== undefined) {
      if (e.button !== undefined) fail(name, '是摇杆 + 十字键动作，不该绑按钮（十字键由 `dir` 自动带上）');
      if (!Array.isArray(e.axes) || e.axes.length !== 2
        || !e.axes.every((a) => Number.isInteger(a) && a >= 0)) {
        fail(name, '的 axes 必须是两个非负整数下标');
      }
      if (!DPAD_BUTTON[e.dir]) fail(name, '的 dir 必须是 up / down / left / right');
      // 判定形状只许摇杆格有：按钮格子没有"两个入口"，带这个字段就是忘了自己在改哪张表
      if (e.cardinal !== undefined && e.cardinal !== true) fail(name, '的 cardinal 只许是 true');
    } else {
      if (e.cardinal === true) fail(name, '是按钮格子，`cardinal` 只对摇杆方向有意义');
      if (e.dir !== undefined) fail(name, '的 `dir` 只在摇杆格子里有意义（没有 axes，方向无处可查）');
      if (e.button === undefined) fail(name, '必须声明一个 `button` 来源');
    }
    if (e.button !== undefined) claimPad(PAD_BUTTON[e.button], name, `按钮 ${e.button}`);
    if (e.dir !== undefined) claimPad(DPAD_BUTTON[e.dir], name, `十字键 ${e.dir}`);
  }
  return table;
}

/**
 * 界面态那张表的校验：同一把尺子，只是动作名单换成 `UI_PAD_ACTIONS`，
 * 并且允许 `ui` 那种报边沿的格子。切片19 起这张表里也有了摇杆格（走焦那四格：摇杆与十字键
 * 两路都要能走，而且是 level —— 按住要连着走，见上面 `UI_GAMEPAD_BINDINGS`），
 * 所以"哪些格子是摇杆格"完全由表里的 `axes` 说话，这张表不必再给一份名单。
 */
export function assertUiPadBindings(table = UI_GAMEPAD_BINDINGS) {
  return assertKeybinds(table, { actions: UI_PAD_ACTIONS, allowSignal: true });
}

/** 按钮名 → 序号（给轮询层用，避免各处自己查 `PAD_BUTTON`） */
export function padButtonIndex(name) {
  return PAD_BUTTON[name];
}

export function padDpadIndex(direction) {
  return DPAD_BUTTON[direction];
}

/* ------------------------------------------------------------------ *
 * 出口的唯一真源：KEY_BINDINGS + 活动表
 * ------------------------------------------------------------------ */

/**
 * 把玩家的重映射叠到出厂键位上，返回**新表**（常量是全仓的"出厂设定"，
 * 复位只要 `{}`）。校验在应用这一刻跑，而不是等到按下才发现：
 * 未知动作、非法键名、撞键都直接抛。
 */
export function resolveKeybindings(base = KEY_BINDINGS, overrides = {}) {
  const out = {};
  for (const [action, e] of Object.entries(base)) out[action] = { ...e };
  for (const [action, code] of Object.entries(overrides ?? {})) {
    const target = out[action];
    if (!target) throw new Error(`未知的游戏键位动作 "${action}"：表里没有这一格`);
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
      throw new Error(`动作 "${action}" 的键位不合法：${JSON.stringify(code)}`);
    }
    target.code = code;
    delete target.mouse;
  }
  assertKeybindings(out);
  return out;
}

/** 键盘侧的整表校验：一个键两个动作 = 按一次办两件事 */
export function assertKeybindings(table = KEY_BINDINGS) {
  const codes = new Set();
  for (const [action, e] of Object.entries(table)) {
    const at = `键位表 ${action}`;
    if (!KEY_ACTIONS.includes(action)) throw new Error(`${at}：未登记于 KEY_ACTIONS`);
    const hasCode = e.code !== undefined;
    const hasMouse = e.mouse !== undefined;
    if (hasCode === hasMouse) throw new Error(`${at}：必须恰好声明 code 或 mouse 之一`);
    if (hasMouse && e.mouse !== 'left' && e.mouse !== 'right') {
      throw new Error(`${at}：mouse 只能是 left / right`);
    }
    if (hasCode) {
      const all = [e.code, ...(e.aliases ?? [])];
      for (const c of all) {
        if (!CODE_PATTERN.test(c)) throw new Error(`${at}：键名不合法 ${JSON.stringify(c)}`);
        if (codes.has(c)) throw new Error(`${at}：键 ${c} 已被前面的动作占用`);
        codes.add(c);
      }
    } else if (e.aliases) {
      throw new Error(`${at}：只绑鼠标的动作不该声明 aliases`);
    }
  }
  return table;
}

/** 当前生效的键位表。`setKeybindTable` 是唯一写入口（与 `HotkeyRouter.useTable` 同一分工） */
let ACTIVE = assertKeybindings({ ...Object.fromEntries(Object.entries(KEY_BINDINGS).map(([k, v]) => [k, { ...v }])) });
let KEY_EPOCH = 0;

/**
 * 换一张生效表（重映射后由 `Game` 调用）。传空回落出厂。
 * 不在这里做校验 —— `resolveKeybindings` 已经校验过，重复一遍只会掩盖调用方漏校验。
 */
export function setKeybindTable(table) {
  ACTIVE = table ?? KEY_BINDINGS;
  KEY_EPOCH++;
  return ACTIVE;
}

/** 生效表换过的次数：消费方（提示文案的缓存）判"手里这份是不是旧的"用 */
export function keybindEpoch() {
  return KEY_EPOCH;
}

/** 动作的键盘出口；该动作只绑了鼠标时返回 `null` */
export function codeFor(action) {
  return ACTIVE[action]?.code ?? null;
}

/** 动作的鼠标出口；该动作只绑了键盘时返回 `null` */
export function mouseFor(action) {
  return ACTIVE[action]?.mouse ?? null;
}

/**
 * 动作的全部键盘出口（主键 + 别名）。消费者做"任意一个按下就算"的判断时用它，
 * 别自己写 `keys[a] || keys[b]` —— 那正是修前散在消费者里的第二份。
 */
export function codesFor(action) {
  const e = ACTIVE[action];
  if (!e?.code) return [];
  return e.aliases?.length ? [e.code, ...e.aliases] : [e.code];
}

/** `keys` 里该动作的任意一个出口是否按着（电平判断；边沿判断见 `CombatController._pressedAny`） */
export function anyDown(keys, action) {
  const codes = codesFor(action);
  for (let i = 0; i < codes.length; i++) {
    if (keys[codes[i]]) return true;
  }
  return false;
}

/** 动作当前绑的是什么（重映射面板与提示文案问它，不各自抄一份） */
export function bindingFor(action) {
  return ACTIVE[action] ?? null;
}

/**
 * 面板上给人看的名字。缺一个就意味着有一行动作在界面上是空的 —— 校验器管这条。
 */
export const KEY_ACTION_LABELS = {
  moveUp: '前进', moveDown: '后退', moveLeft: '左移', moveRight: '右移',
  sprint: '冲刺', jump: '跳跃', roll: '翻滚', parry: '弹反',
  skill: '位面斩', lockOn: '锁定', attackLight: '轻击', attackHeavy: '重击',
  spell1: '法术一', spell2: '法术二', spell3: '法术三', spell4: '法术四',
  swapWeapon: '切换武器', interact: '交互', fastTravel: '快速旅行',
};

export function assertKeyActionLabels(labels = KEY_ACTION_LABELS, table = KEY_BINDINGS) {
  for (const action of Object.keys(table)) {
    if (!labels[action]) throw new Error(`游戏键动作 "${action}" 没有显示名`);
  }
  const extra = Object.keys(labels).filter((a) => !(a in table));
  if (extra.length) throw new Error(`显示名里有表里不存在的动作：${extra.join(', ')}`);
  return labels;
}

/**
 * 把一份覆盖包按"UI 热键 / 游戏键"分流。
 *
 * 存储里只有一格 `settings.keybinds`（玩家不必知道哪个动作归哪张表），
 * 所以重建时先分流，再由两张表各自校验。`stray` 是两张表都不认识的动作名 ——
 * 调用方拿它判"配置坏了"：**不静默丢掉**，丢掉意味着玩家改了却没生效、还没有任何提示。
 *
 * @param {Record<string, string>} overrides 动作名 → 键码
 * @param {string[]} hotkeyActions UI 热键的动作名表（`content/hotkeys.js` 的 `UI_ACTIONS`）
 */
export function partitionOverrides(overrides, hotkeyActions) {
  const hotkeys = {};
  const keys = {};
  const stray = [];
  for (const [action, code] of Object.entries(overrides ?? {})) {
    if (hotkeyActions.includes(action)) hotkeys[action] = code;
    else if (KEY_ACTIONS.includes(action)) keys[action] = code;
    else stray.push(action);
  }
  return { hotkeys, keys, stray };
}

/** 出厂键位表的浅拷贝（复位与"坏了回落"都要一份，不能把常量本身交出去） */
export function factoryKeybindings() {
  return Object.fromEntries(Object.entries(KEY_BINDINGS).map(([k, v]) => [k, { ...v }]));
}

/** 出厂手柄表的浅拷贝（同上：复位与回落都要一份新的，不能把常量本身交出去） */
export function factoryGamepadBindings() {
  return Object.fromEntries(Object.entries(GAMEPAD_BINDINGS).map(([k, v]) => [k, { ...v }]));
}

/**
 * 出厂手柄表 + 玩家的按钮覆盖 → 生效手柄表（切片9）。
 *
 * 覆盖包的形状是 `动作名 → 按钮名`（`{ jump: 'circle' }` 这种），按钮名必须是
 * `PAD_BUTTON` 里登记过的 —— 这不是吹毛求疵，而是这一格的值会被拼进设置面板的 DOM。
 * 键盘那边靠 `CODE_PATTERN` 正则拦注入，这边更严：**只许枚举值**，所以玩家输入的
 * 字符串永远进不了界面，界面上显示的只有标签表里那十来个固定字样。
 *
 * 凡是**声明了 `axes`** 的格子直接拒绝（切片19 起判据看这一格自己有什么）：它们要的是
 * "摇杆方向 + 十字键"两个入口，改成单按钮等于把其中一个扔掉 —— 那是减法，不是改绑。
 * 以前这里查一份手抄的名单（`STICK_ACTIONS`，只有移动那四格），界面表今天也有了摇杆格
 * （走焦那四格），名单就得再抄一遍；而"哪些格子是摇杆格"这件事表本身就知道。
 */
export function resolveGamepadBindings(base = GAMEPAD_BINDINGS, overrides = {}) {
  const out = {};
  for (const [name, e] of Object.entries(base)) out[name] = { ...e };
  for (const [name, button] of Object.entries(overrides ?? {})) {
    const target = out[name];
    if (!target) throw new Error(`未知的手柄动作 "${name}"：表里没有这一格`);
    if (typeof button !== 'string' || !(button in PAD_BUTTON)) {
      throw new Error(`动作 "${name}" 的手柄按键不合法：${JSON.stringify(button)}`);
    }
    if (target.axes !== undefined) {
      throw new Error(`动作 "${name}" 是左摇杆 + 十字键，不能改绑成单个按钮`);
    }
    target.button = button;
  }
  assertKeybinds(out);
  return out;
}

/**
 * 跨表撞键校验。两张表各自内部不撞还不够：同一把物理键被一个 UI 热键和一个游戏键
 * 同时认领时，按下会办两件事，而**两张表各自看都合法**。
 *
 * 这不是假想。设置面板能改的是热键那一侧，游戏键出厂占着 `KeyF`/`KeyT`/`KeyE` 一批 ——
 * 玩家把"日志"改绑到 `F` 就能通过面板校验，然后 F 既开日志又弹反。
 * 所以校验的对象是"生效输入的并集"，不是"某一张表"。
 */
export function assertCodesDisjoint(hotkeyTable, keyTable = ACTIVE) {
  const owner = new Map();
  const claim = (code, who) => {
    const prev = owner.get(code);
    if (prev) throw new Error(`键 ${code} 同时被 ${prev} 与 ${who} 认领：一次按下会办两件事`);
    owner.set(code, who);
  };
  for (const e of hotkeyTable ?? []) if (e.code) claim(e.code, `热键 ${e.action}`);
  for (const [action, e] of Object.entries(keyTable)) {
    // 别名一起认领：等价键按下去办的就是同一个动作，抢键的语义与主键完全相同
    for (const c of [e.code, ...(e.aliases ?? [])]) if (c) claim(c, `游戏键 ${action}`);
  }
  return true;
}

/**
 * 一份覆盖包 → 三张生效表，唯一校验入口。
 *
 * `Game.rebuildHotkeys`（加载与改配置）与设置面板的"这次改动能不能要"必须走同一条判断：
 * 面板放过而游戏拒绝，玩家就是点完确定才被告知失败；反过来则面板能写出坏配置。
 * 任一格不合法都当场抛，由调用方决定回落还是提示。
 *
 * 手柄覆盖包走**独立的一格存储**（`settings.gamepadBinds`），不能塞进 `keybinds` 那个包：
 * 那里的值是键码（`KeyW`），这里的值是按钮名（`a`），而 `a` 恰好也是合法的键码形状 ——
 * 混在一格里，`partitionOverrides` 分不清"把 jump 改成 a 键"还是"把 jump 改成 A 按钮"。
 * 校验仍然只有这一个入口：三张表一次建齐，谁都不许单独预览。
 *
 * @param {Record<string, string>} overrides 动作名 → 键码（两张键盘表混在一起，玩家不需要分清）
 * @param {Array<{code: string, action: string}>} uiTable 生效中的 UI 热键出厂表
 * @param {Record<string, string>} [padOverrides] 手柄动作名 → 按钮名
 */
export function buildBindingTables(overrides = {}, uiTable = UI_HOTKEYS, padOverrides = {}) {
  const { hotkeys, keys, stray } = partitionOverrides(overrides, uiTable.map((e) => e.action));
  if (stray.length) throw new Error(`未知的键位动作：${stray.join(', ')} —— 两张表都不认识`);
  const hotkeyTable = applyHotkeyOverrides(uiTable, hotkeys);
  const keyTable = resolveKeybindings(KEY_BINDINGS, keys);
  const padTable = resolveGamepadBindings(GAMEPAD_BINDINGS, padOverrides);
  assertCodesDisjoint(hotkeyTable, keyTable);
  return { hotkeyTable, keyTable, padTable };
}

assertKeybinds();
assertUiPadBindings();
assertKeyActionLabels();
assertCodesDisjoint(UI_HOTKEYS, ACTIVE);   // 出厂两张表必须互不抢占，否则加载即红
