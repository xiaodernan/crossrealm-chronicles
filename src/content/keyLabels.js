/**
 * 键码 / 鼠标出口 → 玩家看得懂的字样（W-A7 切片6）。
 *
 * 这份映射从前只住在一个地方 —— 设置面板（切片4/5），别的界面想显示键名就各自抄，
 * 于是 HUD 写 "F"、说明书写 "F 弹反"、提示条写 "[E]"，同一枚键在三个界面三种写法。
 * 挪到这里之后它是**显示名的唯一真源**；至于"这个动作现在绑的是哪枚键"，问 `keyHints.js`。
 */

/** 只绑鼠标的动作在界面上的字样 */
export const MOUSE_LABELS = { left: '鼠标左键', right: '鼠标右键' };

/**
 * `KeyboardEvent.code` → 看得懂的字样。没列到的原样显示（`Numpad5` 之类），
 * 因为"原样的键码"仍然可读，而"空白"不可读。
 */
export const KEY_LABELS = {
  Escape: 'Esc',
  Tab: 'Tab',
  Space: '空格',
  Backquote: '`',
  ControlLeft: '左 Ctrl',
  ControlRight: '右 Ctrl',
  ShiftLeft: '左 Shift',
  ShiftRight: '右 Shift',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/**
 * 一枚键码的显示名。
 *
 * 这里的输入已经过两张表的校验（`/^[A-Za-z][A-Za-z0-9]*$/`），所以拼进 DOM 之前
 * 不需要再 escape 一次 —— 那是切片4 就立好的界碑，别在这里放宽。
 */
export function keyLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  const m = /^(?:Key|Digit)([A-Z0-9])$/.exec(code);
  return m ? m[1] : code;
}

/** 鼠标出口的显示名；未知字样原样返回（校验层已经拦过非法值） */
export function mouseLabel(which) {
  return MOUSE_LABELS[which] ?? String(which);
}
