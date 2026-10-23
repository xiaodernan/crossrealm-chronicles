/**
 * "玩家现在用的是哪一侧输入"只有一个记处（W-A7 切片29）。
 *
 * ## 为什么要它
 *
 * 键名提示自切片6 起按生效表渲染，但它反映的是**绑定**，不是**手头**：一个玩家可能同时插着
 * 手柄、用键盘走路，屏幕上没有任何一处告诉他"我这一下被当成哪套输入"。手柄侧尤其难查 ——
 * 没有指针锁、没有光标，按下去没反应时连"我到底在控制什么"都看不见。
 *
 * ## 三条形状，各自只有一处
 *
 * - **这里**记"最近一次被按动的一侧"（`note`）。没按动过就是 `null` —— 不许拿"插着没插手柄"
 *   来猜：插着手柄放着不动，玩家可能正在用键盘走路，那是**在场**，不是**在用**。
 * - 手柄那一侧的判断住在桥里（`GamepadInput.touched`）：与 `move` / `look` 同一趟轮询顺手算，
 *   不在这里每帧翻一遍 `navigator.getGamepads()`（那会是第二个读手柄的地方，切片1 的立片理由）。
 * - 键鼠两侧注在既有的 `keydown` / canvas `mousedown` 里（`core/Game.js`），不新增监听器 ——
 *   多挂一条同事件的监听就是"这一下有几处知道"的第二个答案。
 *
 * 显示文案也在这里：HUD 那一格只问 `inputDeviceLabel()`，不抄第二份"键盘 / 鼠标 / 手柄"。
 * W-D2 切片36：这三个名字进双表（`input_device_*`）—— 改前是裸中文，英文玩家的输入
 * 指示格从开机起就显示「键盘 / 鼠标 / 手柄」。
 */
import { t } from './i18n.js';
export const INPUT_DEVICE_KINDS = ['keyboard', 'mouse', 'gamepad'];

/** 一侧的名字 → 文案键（W-D2 切片36）；换语言由 HUD.refreshLabels 重算那一格 */
const INPUT_DEVICE_KEYS = {
  keyboard: 'input_device_keyboard',
  mouse: 'input_device_mouse',
  gamepad: 'input_device_gamepad',
};

/** 一侧的名字；没按动过（`null`）就是空串 —— 留白比"猜一个"诚实 */
export function inputDeviceLabel(kind) {
  const key = INPUT_DEVICE_KEYS[kind];
  return key ? t(key) : '';
}

export class InputDevice {
  constructor() {
    /** @type {string|null} 最近一次被**按动**的一侧；`null` = 玩家还没动过 */
    this._kind = null;
    /** 变化次数：给测试与读数看的"这件事发生过"，不参与任何判定 */
    this.changes = 0;
  }

  /** @returns {string} 记下来的那一侧（未知的一侧要抛：拼错一个名字不会报错，只会永远显示上一侧） */
  note(kind) {
    if (!INPUT_DEVICE_KINDS.includes(kind)) {
      throw new Error(`未知的输入侧 "${kind}"：名单只有 ${INPUT_DEVICE_KINDS.join(' / ')}`);
    }
    if (kind !== this._kind) this.changes += 1;
    this._kind = kind;
    return this._kind;
  }

  /** @returns {string|null} 现在按着的是哪一侧（没按动过时为 `null`） */
  current() { return this._kind; }

  /** 只清空"按动过"这件事（换场景 / 玩家重开一局时不该假装知道他用哪套） */
  reset() { this._kind = null; }
}
