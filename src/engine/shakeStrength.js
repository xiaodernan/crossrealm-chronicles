/**
 * 震屏强度三档（W-E3 切片58）—— 与 `vibration` 同一族，但管的是**画面**那一半。
 *
 * ## 为什么要这一格
 * `vibration` 的注释里写着"打击反馈有两路输出，玩家只想关其中一路" —— 可当时能关的只有手柄马达，
 * 相机抖动没有任何开关（只有 `autoPlayMode` 会把它静音，那是给演示截图用的）。
 * 对"看晃动会晕"的玩家来说，关不掉的恰恰是**画面**这一路。
 *
 * ## 三档的数值
 * - `full` = **1**：出厂值，逐帧数值与"没有这一格"完全相同（机制片不夹带手感变更）；
 * - `reduced` = **0.45**：不到半档。再低就只剩"像卡了一下"，不如干脆关；
 * - `off` = **0**：相机偏移恒为 0，且在换档当场 `reset()` 清掉残留 trauma（不会"关了还在晃两秒"）。
 *
 * 这一格**只乘相机**：手柄马达吃的是原始 intensity（关画面抖动不等于关触感）。
 */
export const SHAKE_STRENGTHS = Object.freeze({ full: 1, reduced: 0.45, off: 0 });

/** 档位名册，按面板里的显示顺序 */
export const SHAKE_STRENGTH_IDS = Object.freeze(Object.keys(SHAKE_STRENGTHS));

export const DEFAULT_SHAKE_STRENGTH = 'full';

/** 脏值回落出厂，不抛（存储是玩家可写的，与 `normalizeShadowQuality` 同口径） */
export function normalizeShakeStrength(value) {
  return Object.hasOwn(SHAKE_STRENGTHS, value) ? value : DEFAULT_SHAKE_STRENGTH;
}

/** 档位 → 倍率。认不出的档按出厂算 */
export const shakeScaleOf = (value) => SHAKE_STRENGTHS[normalizeShakeStrength(value)];

/**
 * 面板用的选项：只给档位 id。
 *
 * 文案键刻意**在 `t()` 的现场**拼（`src/ui/SettingsPanel.js` 里 `t(\`settings_shake_${id}\`)`），
 * 而不是在这里先拼好、外面再 `t(label)` —— 后者在 i18n 的字面量/拼键两把尺子下都是盲区，
 * 死键账本只能靠手写登记兜着；前者能被 `扫描拼键模板` 直接量到（W-E3 切片58）。
 */
export const shakeStrengthOptions = () => [...SHAKE_STRENGTH_IDS];
