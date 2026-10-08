/**
 * 鼠标镜头灵敏度：全仓只有一个文件说了算（W-D6 切片7）
 *
 * ## 改前是什么样
 * `PlayerController` 的构造器里两行硬编码：`cameraSensitivity = 0.002`、
 * `cameraSensitivityY = 0.0017`，`addCameraInput` 直接拿它们乘鼠标位移。于是
 * "鼠标转得多快"这件事**没有任何调节入口** —— 而它恰是可访问性里最常被提到的一格：
 * 高 DPI 鼠标在桌面上轻轻一推就转过九十度，手腕有伤或用触控板的玩家则需要更小的舵量。
 * 设置面板此前有画质、音量、手柄手感，唯独没有镜头灵敏度。
 *
 * ## 为什么是一个倍率，而不是两个绝对值
 * 横竖两轴的出厂比例（0.002 : 0.0017 ≈ 1.18 : 1）是**手感决定**的：竖轴比横轴钝一点，
 * 因为玩家对俯仰的容忍度低于平移。给两根独立滑杆，等于把"我想慢一点"变成
 * "我要同时猜对两根的比例"。所以只暴露一个倍率，轴间比例恒定 —— 这也意味着
 * 将来加第三根轴（视角滚转）时不需要再问玩家一次。
 *
 * ## 为什么在 engine/ 而不在 content/tuning.js
 * 这一格带"清洗 + 落地"两件事（`normalizeLookSensitivity` / `applyLookSensitivity`），
 * 与 `shadowPolicy.js` / `aaPolicy.js` / `ssaoSettings.js` 同一族。`content/tuning.js`
 * 是纯数据表，塞函数进去会让"表在哪、策略在哪"重新糊成一片。
 *
 * ## 脏值口径
 * 倍率是玩家可写的 localStorage 里的一个数：NaN、越界、字符串一律夹回量程，**不抛** ——
 * 与 `normalizeShadowQuality` / `padTuning` 同一先例（一行手改的存档不该把开机炸了）。
 */

/** 出厂倍率与滑杆量程。`x` / `y` 是改前 `PlayerController` 里那两枚，逐字不动 */
export const LOOK_SENSITIVITY = Object.freeze({
  /** 横轴出厂倍率 */
  x: 0.002,
  /** 竖轴出厂倍率（比横轴钝 —— 见文件头"为什么是一个倍率"） */
  y: 0.0017,
  /** 滑杆量程。上限 3 约是"一推转过小半圈"，再高就没有可用的精细控制了 */
  scaleMin: 0.25,
  scaleMax: 3,
  scaleStep: 0.05,
  /** 出厂倍率 1 = 与硬编码时代逐帧相同 */
  scaleDefault: 1,
});

/** 出厂倍率。单独导出一个名字，`SettingsManager` 的 DEFAULTS 要引它 */
export const DEFAULT_LOOK_SENSITIVITY = LOOK_SENSITIVITY.scaleDefault;

/**
 * 存储侧的清洗：认得出返回数值，认不出回落出厂倍率（`normalizeShadowQuality` 的同一先例）。
 * 只夹不抛：调用方拿到的永远是一个能直接乘进 `addCameraInput` 的有限数。
 *
 * 只认**数与数字串**两种形状。`null` / `undefined` / 空串是"这一格没存过"，
 * 该回落出厂而不是被 `Number()` 变成 0 再夹到量程下限 —— 那一下玩家会觉得
 * "我没调过灵敏度，怎么突然慢了四倍"。`{}` / `[]` / `true` 同理：不是数就不是数。
 */
export function normalizeLookSensitivity(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')
    ? Number(v)
    : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LOOK_SENSITIVITY;
  return Math.min(LOOK_SENSITIVITY.scaleMax, Math.max(LOOK_SENSITIVITY.scaleMin, n));
}

/**
 * 落地：把倍率推给玩家。`PlayerController.setLookSensitivity` 是唯一写入口 ——
 * 面板、存档、开机三条路都汇到 `SettingsManager.applyToGame` 再到这一处，
 * 别处不许再写 `player.cameraSensitivity =`（那就是 B36 那一族）。
 * @returns 传进去的那个 player（方便链式调用与测试断言）
 */
export function applyLookSensitivity(player, scale = DEFAULT_LOOK_SENSITIVITY) {
  if (!player) return player;
  player.setLookSensitivity(scale);
  return player;
}