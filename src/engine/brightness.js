/**
 * 画面亮度（W-E3 切片61）—— 曝光倍率，出厂 1 = 与"没有这一格"逐帧相同。
 *
 * ## 为什么要这一格
 * 设置面板有音量、画质、镜头灵敏度、震屏与字幕，唯独**画面本身多亮**没有入口。
 * 显示器亮度是系统级的，而游戏里的曝光是另一件事：暗环境里玩、投影仪偏灰、
 * 或者单纯看不清暗部细节的玩家，需要的是一条**游戏内**的亮度滑杆。
 *
 * ## 为什么是倍率而不是绝对值
 * `core/Game.js` 每帧按昼夜算曝光基线（`1.08 + daylight * 0.38`）。若这里存绝对值，
 * 玩家一拖滑杆就把昼夜曲线整条抹平（夜里和正午一样亮）—— 那不是"调亮度"，是改光照。
 * 所以这一格只存**倍率**，乘在基线上：昼夜仍然走它自己的曲线，玩家只改整体明暗。
 *
 * ## 量程
 * 0.7 ~ 1.4，步长 0.05（面板显示 70% ~ 140%）。下限再低，暗部会先糊成一片黑；
 * 上限再高，ACES 的高光压缩会让画面发灰而不是变亮 —— 1.4 是"还看得出层次"的上限。
 *
 * ## 脏值口径
 * 存储是玩家可写的：NaN / 越界 / 字符串一律夹回量程、不抛（与 `normalizeShadowQuality`
 * 同一条先例）。数值吸到步长上，避免 0.7000000000000001 这种显示成 70% 却存成脏值的漂移。
 */
export const BRIGHTNESS = Object.freeze({
  min: 0.7,
  max: 1.4,
  step: 0.05,
  /** 出厂倍率 1 = 逐帧与改前相同 */
  default: 1,
});

export const DEFAULT_BRIGHTNESS = BRIGHTNESS.default;

/** 存储侧清洗：只认数与数字串；认不出回落出厂，越界夹回量程，并吸到步长上 */
export function normalizeBrightness(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')
    ? Number(v)
    : NaN;
  if (!Number.isFinite(n)) return DEFAULT_BRIGHTNESS;
  const 夹 = Math.min(BRIGHTNESS.max, Math.max(BRIGHTNESS.min, n));
  return Number((Math.round(夹 / BRIGHTNESS.step) * BRIGHTNESS.step).toFixed(2));
}

/** 面板显示的百分比（100% = 出厂） */
export const brightnessPercent = (v) => `${Math.round(normalizeBrightness(v) * 100)}%`;
