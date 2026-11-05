/**
 * 闪光强度三档（W-D6 切片68）—— 给光敏玩家一条"别闪我"的出口。
 *
 * ## 为什么要这一格
 * 本作的闪光不止一处：处决 / Boss 击杀的整屏白闪、Boss 转阶段的径向闪光、混沌边境的
 * 闪电点光、两位面致敬层的交互闪。它们各自写死在自己的模块里，玩家只能一起吞下。
 * 对光敏性癫痫或对强闪不适的玩家，这不是"效果重不重"，而是能不能玩。
 *
 * ## 三档的数值
 * - `full` = **1**：出厂，逐像素与"没有这一格"相同；
 * - `reduced` = **0.35**：闪光只剩三成多，仍看得见节奏；
 * - `off` = **0**：新增的闪光贡献为 0；**不关掉常驻氛围层**（那属于画面风格，不是闪光）。
 *
 * ## 为什么是模块级当前档
 * 消费者散在 cinematic / ui / effects 三棵子树，构造签名被几十条用例直接调用。
 * 与 `Difficulty` / `ColorVision` 同一条先例：整局一份、随设置落地的状态走模块级，
 * 唯一写入口是 `setFlashStrength`，调用者是 `SettingsManager.applyToGame`。
 *
 * ## 限度
 * 模块级状态在测试里共享：换档用例要自己 `resetFlashStrength()` 收尾。
 * 本片只乘"玩家看得见的闪光"，不碰敌人受击的自发光小闪（那是命中反馈的一部分）。
 */

/** 档位 → 倍率 */
export const FLASH_STRENGTHS = Object.freeze({ full: 1, reduced: 0.35, off: 0 });

/** 档位名册，按面板里的显示顺序 */
export const FLASH_STRENGTH_IDS = Object.freeze(Object.keys(FLASH_STRENGTHS));

export const DEFAULT_FLASH_STRENGTH = 'full';

/** 脏值回落出厂，不抛（存储是玩家可写的） */
export function normalizeFlashStrength(value) {
  return Object.hasOwn(FLASH_STRENGTHS, value) ? value : DEFAULT_FLASH_STRENGTH;
}

/** 档位 → 倍率。认不出的档按出厂算 */
export const flashScaleOf = (value) => FLASH_STRENGTHS[normalizeFlashStrength(value)];

/** 当前档（整局一份） */
let current = DEFAULT_FLASH_STRENGTH;

/** 换档；返回落地后的档位。唯一写入口 */
export function setFlashStrength(value) {
  current = normalizeFlashStrength(value);
  return current;
}

export function getFlashStrength() {
  return current;
}

/** 当前倍率 —— 消费者每次用时读它，不在构造期缓存（换档下一记闪光即生效） */
export const flashScale = () => FLASH_STRENGTHS[current];

/** 测试收尾用：回到出厂 */
export function resetFlashStrength() {
  current = DEFAULT_FLASH_STRENGTH;
}

/**
 * 整屏闪光的透明度：基准值乘当前倍率。
 * 处决 / Boss 击杀 / 转阶段三处都走这一条，避免各写各的乘法。
 */
export const screenFlashOpacity = (base) => base * flashScale();

/**
 * 致敬层（Triad）的底色：常驻 0.08 + 闪光额外 0.06。
 * 出厂 = 0.14，与改前逐位相同；off 只剩常驻氛围，不把整层关掉。
 */
export const triadFlashOpacity = (scale = flashScale()) => 0.08 + 0.06 * scale;

/**
 * Wave4 交互闪的透明度：出厂 = 0.1 + 正弦摆动；off = 0。
 * 这一层本来就只在 flashTimer 内出现，所以整层乘倍率即可。
 */
export const wave4FlashOpacity = (pulse, scale = flashScale()) =>
  (0.1 + Math.sin(pulse * 2) * 0.04) * scale;

/** 面板用的选项：只给档位 id；文案键由面板在 t() 现场拼 */
export const flashStrengthOptions = () => [...FLASH_STRENGTH_IDS];
