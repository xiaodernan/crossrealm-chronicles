/**
 * 键码 / 鼠标出口 → 玩家看得懂的字样（W-A7 切片6）。
 *
 * 这份映射从前只住在一个地方 —— 设置面板（切片4/5），别的界面想显示键名就各自抄，
 * 于是 HUD 写 "F"、说明书写 "F 弹反"、提示条写 "[E]"，同一枚键在三个界面三种写法。
 * 挪到这里之后它是**显示名的唯一真源**；至于"这个动作现在绑的是哪枚键"，问 `keyHints.js`。
 */
import { t } from '../engine/i18n.js';

/**
 * 只绑鼠标的动作在界面上的字样（W-D2 切片18：值全是文案键，`mouseLabel` 展开）。
 * 与 `KEY_LABELS` 同一条纪律：表里存的是"这句话住在哪一格"，不是那句话本身。
 */
export const MOUSE_LABELS = { left: 'mouse_label_left', right: 'mouse_label_right' };

/**
 * `KeyboardEvent.code` → 看得懂的字样。没列到的原样显示（`Numpad5` 之类），
 * 因为"原样的键码"仍然可读，而"空白"不可读。
 */
export const KEY_LABELS = {
  Escape: 'key_label_escape',
  Tab: 'key_label_tab',
  Space: 'key_label_space',
  Backquote: 'key_label_backquote',
  ControlLeft: 'key_label_control_left',
  ControlRight: 'key_label_control_right',
  ShiftLeft: 'key_label_shift_left',
  ShiftRight: 'key_label_shift_right',
  ArrowUp: 'key_label_arrow_up',
  ArrowDown: 'key_label_arrow_down',
  ArrowLeft: 'key_label_arrow_left',
  ArrowRight: 'key_label_arrow_right',
};

/**
 * 一枚键码的显示名。
 *
 * 这里的输入已经过两张表的校验（`/^[A-Za-z][A-Za-z0-9]*$/`），所以拼进 DOM 之前
 * 不需要再 escape 一次 —— 那是切片4 就立好的界碑，别在这里放宽。
 */
export function keyLabel(code) {
  if (KEY_LABELS[code]) return t(KEY_LABELS[code]);
  const m = /^(?:Key|Digit)([A-Z0-9])$/.exec(code);
  return m ? m[1] : code;
}

/** 鼠标出口的显示名；未知字样原样返回（校验层已经拦过非法值） */
export function mouseLabel(which) {
  return MOUSE_LABELS[which] ? t(MOUSE_LABELS[which]) : String(which);
}

/**
 * 手柄按钮名 → 看得懂的字样（切片9：手柄侧改绑界面要显示"这一格现在绑哪个键"）。
 *
 * 用 Xbox 布局的字母/缩写，因为标准映射（`mapping === 'standard'`）里玩家看到的就是这套；
 * PlayStation 的十字/方块只是同一序号的不同丝印，桥读到的是序号，所以标签只能按标准映射说话。
 * 与键码标签同一纪律：**没列到的原样显示**，因为"原样的按钮名"仍可读而"空白"不可读。
 */
export const PAD_BUTTON_LABELS = {
  a: 'pad_button_label_a', b: 'pad_button_label_b', x: 'pad_button_label_x', y: 'pad_button_label_y',
  leftBumper: 'pad_button_label_left_bumper', rightBumper: 'pad_button_label_right_bumper',
  leftTrigger: 'pad_button_label_left_trigger', rightTrigger: 'pad_button_label_right_trigger',
  select: 'upgrade_back', start: 'pad_button_label_start',
  leftStick: 'pad_button_label_left_stick', rightStick: 'pad_button_label_right_stick',
  dpadUp: 'pad_button_label_dpad_up', dpadDown: 'pad_button_label_dpad_down',
  dpadLeft: 'pad_button_label_dpad_left', dpadRight: 'pad_button_label_dpad_right',
};

/** 一枚手柄按钮的显示名 */
export function padButtonLabel(name) {
  return PAD_BUTTON_LABELS[name] ? t(PAD_BUTTON_LABELS[name]) : String(name);
}

/**
 * 移动那四格在界面上的说法：摇杆方向 + 顺带同绑的十字键。
 * 它们**不给捕获按钮** —— 改绑成单键等于扔掉两个入口之一，那是减法不是改绑。
 */
export function padStickLabel(direction) {
  const arrow = { up: '↑', down: '↓', left: '←', right: '→' }[direction] ?? '?';
  // 句式也进双表（切片18）：英文不是"左摇杆 + 十字键"这两个词能拼出来的
  return t('pad_stick_label', { arrow });
}

/**
 * 一格手柄出口的**物理来源** → 字样（W-A7 切片33）。
 *
 * 来源的形状由 `keybinds.js` 的 `padCellSource` 给（按钮 / 摇杆方向两种），
 * 这里只负责把它说成人话 —— 两件事分开写，是因为"这格是什么"与"它叫什么"各有各的真源：
 * 前者在表里，后者就这一处。形状认不出来返回 null（说不出口的格子不许编一个名字）。
 */
export function padSourceLabel(source) {
  if (!source) return null;
  if (source.kind === 'button') return padButtonLabel(source.name);
  if (source.kind === 'stick') return padStickLabel(source.dir);
  return null;
}
