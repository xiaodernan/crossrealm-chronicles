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

/** 十字键在标准映射里的方向 → 按钮序号（移动动作的 `dir` 用它顺带带上十字键） */
const DPAD_BUTTON = {
  up: PAD_BUTTON.dpadUp, down: PAD_BUTTON.dpadDown,
  left: PAD_BUTTON.dpadLeft, right: PAD_BUTTON.dpadRight,
};

const MODES = ['level', 'edge'];

/** 左摇杆推动要影响的四个动作（其余动作不许声明 `axes`） */
const STICK_ACTIONS = ['moveUp', 'moveDown', 'moveLeft', 'moveRight'];

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
 */
export function assertKeybinds(table = GAMEPAD_BINDINGS) {
  for (const [name, e] of Object.entries(table)) {
    if (name !== e.action) fail(name, '的键名与 `action` 字段不一致');
    if (!PAD_ACTIONS.includes(e.action)) fail(name, '未登记于 PAD_ACTIONS');
    if (!MODES.includes(e.mode)) fail(name, '的 mode 必须是 level / edge');
    // 出口的唯一真源是 `KEY_BINDINGS`（或 `hotkey` 指向的热键表），手柄表自己不许再抄一份
    if (e.code !== undefined || e.mouse !== undefined) {
      fail(name, '不许自己声明 code / mouse —— 出口只有 KEY_BINDINGS 一个真源');
    }
    if (e.hotkey !== undefined) {
      if (typeof e.hotkey !== 'string' || !e.hotkey) fail(name, '的 hotkey 必须是非空动作名');
      if (KEY_ACTIONS.includes(e.action)) fail(name, '同时是游戏键与热键冒充，说不清该问谁');
    } else if (!KEY_ACTIONS.includes(e.action)) {
      fail(name, '既不在 KEY_ACTIONS 里，也没声明 hotkey —— 桥不知道该冒充哪个键');
    }
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
  return table;
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

/**
 * 换一张生效表（重映射后由 `Game` 调用）。传空回落出厂。
 * 不在这里做校验 —— `resolveKeybindings` 已经校验过，重复一遍只会掩盖调用方漏校验。
 */
export function setKeybindTable(table) {
  ACTIVE = table ?? KEY_BINDINGS;
  return ACTIVE;
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
 * 一份覆盖包 → 两张生效表，唯一校验入口。
 *
 * `Game.rebuildHotkeys`（加载与改配置）与设置面板的"这次改动能不能要"必须走同一条判断：
 * 面板放过而游戏拒绝，玩家就是点完确定才被告知失败；反过来则面板能写出坏配置。
 * 任一格不合法都当场抛，由调用方决定回落还是提示。
 *
 * @param {Record<string, string>} overrides 动作名 → 键码（两张表混在一起，玩家不需要分清）
 * @param {Array<{code: string, action: string}>} uiTable 生效中的 UI 热键出厂表
 */
export function buildBindingTables(overrides = {}, uiTable = UI_HOTKEYS) {
  const { hotkeys, keys, stray } = partitionOverrides(overrides, uiTable.map((e) => e.action));
  if (stray.length) throw new Error(`未知的键位动作：${stray.join(', ')} —— 两张表都不认识`);
  const hotkeyTable = applyHotkeyOverrides(uiTable, hotkeys);
  const keyTable = resolveKeybindings(KEY_BINDINGS, keys);
  assertCodesDisjoint(hotkeyTable, keyTable);
  return { hotkeyTable, keyTable };
}

assertKeybinds();
assertKeybindings();
assertKeyActionLabels();
assertCodesDisjoint(UI_HOTKEYS, ACTIVE);   // 出厂两张表必须互不抢占，否则加载即红
