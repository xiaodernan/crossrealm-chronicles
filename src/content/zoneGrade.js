/**
 * 区域色彩分级表（W-C4 切片4）—— 与 zoneAtmosphere.js 同一套纪律。
 *
 * ## 这张表管什么
 * 每个区域一组 `{ saturation, contrast, warmth }`，由 `effects/ColorGrade.js`
 * 的 ColorGrade 控制器平滑落进 composer 链的分级 pass（站 OutputPass 之前，
 * 线性空间）。它是分级参数的唯一真源 —— pass 的 uniforms 只能由控制器写，
 * 本表只能由"美术调参"切片改。
 *
 * ## 为什么出厂全中性（机制片不夹带美术变更）
 * 切片4 交付的是**机制**：表 -> 控制器 -> pass -> 门禁。分级数值是美术决策，
 * 必须一片一区地调、逐区过真页面验收 —— 机制片夹带数值就说不清"这一片改了
 * 什么视觉"。所以出厂全中性（saturation=1 / contrast=1 / warmth=0：三个
 * 算式在数学上都是恒等），画面逐像素不变；后续美术切片只改这张表。
 *
 * ## 算式口径（与 ColorGrade.js 的 shader 一一对应）
 * - `warmth`：-1（冷）~ +1（暖），红蓝反向增益 ±WARMTH_GAIN；
 * - `saturation`：亮度加权的线性插值（luma 权重 0.2126/0.7152/0.0722），1 = 不变；
 * - `contrast`：绕中灰 0.5 拉伸，1 = 不变。
 */
import { ZONE_IDS } from './ZoneIdentity.js';

/** warmth 的红蓝增益幅度：warmth=1 时红 ×1.08、蓝 ×0.92 */
export const WARMTH_GAIN = 0.08;

/** luma 权重（Rec.709）：saturation 的亮度基准 */
export const LUMA_WEIGHTS = Object.freeze([0.2126, 0.7152, 0.0722]);

/** 中性档：三个算式的恒等值 —— 机制片的出厂，画面逐像素不变 */
export const NEUTRAL_GRADE = Object.freeze({ saturation: 1, contrast: 1, warmth: 0 });

export const ZONE_GRADE = Object.freeze({
  [ZONE_IDS.HUB]: NEUTRAL_GRADE,
  [ZONE_IDS.FANTASY]: NEUTRAL_GRADE,
  [ZONE_IDS.MAGIC]: NEUTRAL_GRADE,
  [ZONE_IDS.SPACE]: NEUTRAL_GRADE,
  [ZONE_IDS.VOID]: NEUTRAL_GRADE,
  [ZONE_IDS.ABYSS]: NEUTRAL_GRADE,
  [ZONE_IDS.GLOOM]: NEUTRAL_GRADE,
  [ZONE_IDS.RADIANT]: NEUTRAL_GRADE,
  [ZONE_IDS.CORRIDOR]: NEUTRAL_GRADE,
  [ZONE_IDS.UNKNOWN]: NEUTRAL_GRADE,
});

/**
 * 按区域取分级档。认不出当场抛（zoneAtmosphereOf 同口径）——
 * 键抄错从"画面静默用错档"变成当场炸出来。
 */
export function zoneGradeOf(zoneId) {
  const grade = ZONE_GRADE[zoneId];
  if (!grade) {
    throw new Error(`zoneGradeOf: 未登记的区域 "${zoneId}"，可用：${Object.keys(ZONE_GRADE).join(' / ')}`);
  }
  return grade;
}

/**
 * 分级混合：三通道各自向目标走 k 比例，**返回浮点不取整**。
 * 中途取整会让指数平滑的收敛末段卡死（zoneAtmosphere.blendAtmosphere 的同一条教训：
 * 目标与当前差值 < 0.5 时取整后不再变化，80 刻度过渡实测停在 ~20 刻度处）。
 */
export function blendGrade(current, target, k) {
  return {
    saturation: current.saturation + (target.saturation - current.saturation) * k,
    contrast: current.contrast + (target.contrast - current.contrast) * k,
    warmth: current.warmth + (target.warmth - current.warmth) * k,
  };
}
