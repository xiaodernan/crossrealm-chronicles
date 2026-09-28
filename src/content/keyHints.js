/**
 * 提示文案的按键出口（W-A7 切片6）。
 *
 * 切片5 之后"哪个动作按哪枚键"只有 `KEY_BINDINGS` + 生效热键表两个真源，但**显示**这一侧
 * 仍是各写各的：HUD 写 `F`、说明书写"F 弹反"、交互提示写 `[E]` —— 于是玩家把弹反改绑到
 * `KeyY` 之后，游戏里所有告诉他人该按什么键的地方同时变成假话。
 *
 * 这里只有一件事：把一个**动作名**换成当前生效的可读键名。
 * 文案本体仍写在各界面里，只是键名那一段变成 `{action}` 占位。
 *
 * 两张表都不认识的动作 → 直接抛。这不是防御，是门禁：占位写错字（`{pray}`）
 * 会在渲染那一刻红，而不是让玩家看到一句"按 {pray} 弹反"。
 */
import { bindingFor, keybindEpoch, padCellSource } from './keybinds.js';
import { hotkeyCodeFor, hotkeyEpoch } from './hotkeys.js';
import { keyLabel, mouseLabel, padSourceLabel } from './keyLabels.js';
import { INPUT_DEVICE_KINDS } from '../engine/InputDevice.js';

/**
 * 提示文案要说"哪只手"（W-A7 切片33）。
 *
 * 切片6 让键名只剩一个出口，但那个出口只知道**绑定**、不知道**手头**：手柄玩家走到营火前，
 * 屏幕上写着"按 E"。切片29 把"最近一次被按动的是哪一侧"记进了 `InputDevice`，这一片
 * 把它接到提示出口上 —— 纯手柄玩家的提示改说"右摇杆按下"。
 *
 * 三条形状：
 * - 状态仍只住在 `InputDevice` 里，这里收的是 `Game` 转来的一份**读数**（不另记账）；
 * - 出口由 `Game` 注入（生效手柄表在它手里），没接线时退回键盘那一套；
 * - 只有**手柄侧真有出口**的动作才改口。没有出口的动作照旧说键盘键名 ——
 *   手柄玩家未必没有键盘，而"什么都不说"比"说一个别的"更糟。
 */
let HINT_DEVICE = null;

/** 一个动作在生效手柄表里的全部出口 → 给 `keyHint` 用；由 `Game` 注入 */
let HINT_PAD_OUTLETS = null;

/** 记下"现在这一手是哪套输入"。名字拼错要抛 —— 拼错的后果是永远退回键盘那一套（静默） */
export function setHintDevice(kind) {
  if (kind !== null && !INPUT_DEVICE_KINDS.includes(kind)) {
    throw new Error(`未知的输入侧 "${kind}"：名单只有 ${INPUT_DEVICE_KINDS.join(' / ')}`);
  }
  HINT_DEVICE = kind;
  return HINT_DEVICE;
}

/** 现在这一手是哪一侧（`null` = 还没动过）；读数与测试用 */
export function hintDevice() { return HINT_DEVICE; }

/** 注入"这个动作在生效手柄表里有哪几个出口"；传空退回"手柄没有出口" */
export function setHintPadOutlets(fn) {
  if (fn !== null && typeof fn !== 'function') throw new Error('setHintPadOutlets 要一个函数');
  HINT_PAD_OUTLETS = fn;
}

/** 手柄那一侧的出口字样：一格一条，多格并列（`escape` 今天有三个主人）；没有出口返回 null */
function padHint(action) {
  if (!HINT_PAD_OUTLETS) return null;
  const words = [];
  for (const cell of HINT_PAD_OUTLETS(action) ?? []) {
    const label = padSourceLabel(padCellSource(cell));
    if (label && !words.includes(label)) words.push(label);
  }
  return words.length ? words.join(' / ') : null;
}

/** 动作当前该按什么（人话）；两张表里都没有这个动作返回 null */
export function keyHint(action) {
  if (HINT_DEVICE === 'gamepad') {
    const pad = padHint(action);
    if (pad !== null) return pad;
  }
  const b = bindingFor(action);
  if (b) return b.code ? keyLabel(b.code) : (b.mouse ? mouseLabel(b.mouse) : null);
  const code = hotkeyCodeFor(action);
  return code ? keyLabel(code) : null;
}

/**
 * 提示里的键名占位撑不过一次改绑 —— 但逐帧拼字符串又是热路径（交互提示每帧重算），
 * 所以按"模板 + 两张表各自的轮次"缓存：改绑之后自动重算，之前命中缓存零分配。
 *
 * 缓存必须有上界：文案里混了动态内容（迷宫提示带房间数、Boss 名）的模板每次都不重样，
 * 只进不出的 Map 会变成一条缓慢泄漏。撞到上界就整片丢掉重来 —— 这里存的是可重算的
 * 显示文本，丢掉最多是重算一遍，不影响正确性。
 */
const CACHE = new Map();
const CACHE_MAX = 128;
const TOKEN = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

/**
 * 生效表今天的"轮次"戳（W-B2 切片5）。
 *
 * 给**自己造缓存**的消费方用：画布上的 CG 图是一张 dataURL，缓存键里没有键名，
 * 改绑之后它会把旧键名的那张图一直交出来。把这一戳并进键、或者戳一变就清缓存，
 * 都不必让每个消费方去 import 两个 epoch 再自己拼字符串（那正是"两处各算一次"的写法）。
 */
export function keyStamp() {
  return `${keybindEpoch()}:${hotkeyEpoch()}:${HINT_DEVICE ?? '-'}`;
}

export function keyText(template) {
  const stamp = keyStamp();
  const hit = CACHE.get(template);
  if (hit && hit.stamp === stamp) return hit.text;
  const text = String(template).replace(TOKEN, (whole, action) => {
    const hint = keyHint(action);
    if (hint === null) throw new Error(`提示文案里的 ${whole} 不是任何已登记的动作：两张键位表都不认识它`);
    return hint;
  });
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(template, { stamp, text });
  return text;
}

/** 缓存里现在有多少条：只给门禁用例盯"上界有没有被拿掉"用 */
export function keyTextCacheSize() {
  return CACHE.size;
}

/**
 * 整片容器重算（W-A7 切片6）—— DOM 常常只在构造时建一次，改绑之后必须有人再刷一遍。
 *
 * 两种声明，都是"DOM 里只留动作名，键名现问生效表"：
 * - `data-keys="spell1 spell2"`：键位格子，多枚键以 ` / ` 相连，分隔符只有这一处；
 * - `data-ktext="按 {interact} 拾取"`：整句文案，`{动作}` 就地展开。
 *
 * 两者都只走 `textContent`，所以模板里不许出现 HTML 标签 —— 要换行就拆成两个元素。
 */
export function refreshKeyText(root) {
  for (const el of root.querySelectorAll('[data-keys]')) {
    const template = el.dataset.keys.trim().split(/\s+/).map((a) => `{${a}}`).join(' / ');
    el.textContent = keyText(template);
  }
  for (const el of root.querySelectorAll('[data-ktext]')) {
    el.textContent = keyText(el.dataset.ktext);
  }
}
