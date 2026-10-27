/**
 * 区域色彩分级表（W-C4 切片4）—— 与 zoneAtmosphere.js 同一套纪律。
 *
 * ## 这张表管什么
 * 每个区域一组 `{ saturation, contrast, warmth }`，由 `effects/ColorGrade.js`
 * 的 ColorGrade 控制器平滑落进 composer 链的分级 pass（站 OutputPass 之前，
 * 线性空间）。它是分级参数的唯一真源 —— pass 的 uniforms 只能由控制器写，
 * 本表只能由"美术调参"切片改。
 *
 * ## 为什么机制片出厂全中性、数值后到（W-C4 切片4 → 切片7）
 * 切片4 交付的是**机制**：表 -> 控制器 -> pass -> 门禁。分级数值是美术决策，
 * 必须一区一区地调、逐区过真页面验收 —— 机制片夹带数值就说不清"这一片改了
 * 什么视觉"。所以机制片出厂全中性（saturation=1 / contrast=1 / warmth=0：三个
 * 算式在数学上都是恒等），画面逐像素不变；**切片7** 就是那张后续的调参切片，
 * 按各区雾色与身份把三数落定（每格的为什么写在表上）。
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

/** 中性档：三个算式的恒等值 —— 枢纽与兜底身份保持它，也留作调参的基准锚 */
export const NEUTRAL_GRADE = Object.freeze({ saturation: 1, contrast: 1, warmth: 0 });

/**
 * 各区分级档（W-C4 切片7 调参落定）—— 数值跟着**雾色与身份**走：
 * - **交汇枢纽（hub）/ 兜底（unknown）**：中性。枢纽是玩家进游戏的第一屏与安全区，
 *   不做风格化；unknown 是身份没认出来的兜底，带风格会把"走错地方"画成"换了个滤镜"。
 * - **灰白森林（fantasy，雾 0x4a5a48 灰绿）**：苔绿要活不要死灰 —— 微提饱和、轻冷。
 * - **魔法遗境（magic，雾 0x2a2040 深紫）**：紫要紫、冷要冷，饱和幅度最大的一档。
 * - **米勒荒原（space，雾 0x0a1020 近黑蓝）**：星际的空旷靠对比说话 —— 对比与冷都是上限附近。
 * - **破碎时线（void，雾 0x1a1820 近黑）**：时间残响是"褪色"不是"浓艳" —— 全表唯一的降饱和 + 冷。
 * - **混沌边境（abyss，雾 0x1a0a18 暗紫红）**：混沌的暗红往暖推，与破碎时线的冷成对。
 * - **幽暗林地（gloom，雾 0x2a2a3a 蓝灰）**：迷雾森林压饱和、压暖。
 * - **辉煌圣域（radiant，雾 0xffd700 金）**：金辉是全表最暖的一档（warmth 到带上限），
 *   对比不动 —— 金雾本身亮度高，再拉对比容易把沙海推成剪影。
 * - **区际走廊（corridor，雾 0x7a8ea6 蓝灰）**：过渡地带，几乎中性、只带一丝冷。
 */
export const ZONE_GRADE = Object.freeze({
  [ZONE_IDS.HUB]: NEUTRAL_GRADE,
  [ZONE_IDS.FANTASY]: Object.freeze({ saturation: 1.05, contrast: 1.04, warmth: -0.15 }),
  [ZONE_IDS.MAGIC]: Object.freeze({ saturation: 1.15, contrast: 1.06, warmth: -0.3 }),
  [ZONE_IDS.SPACE]: Object.freeze({ saturation: 1.1, contrast: 1.12, warmth: -0.45 }),
  [ZONE_IDS.VOID]: Object.freeze({ saturation: 0.85, contrast: 1.05, warmth: -0.35 }),
  [ZONE_IDS.ABYSS]: Object.freeze({ saturation: 1.12, contrast: 1.1, warmth: 0.45 }),
  [ZONE_IDS.GLOOM]: Object.freeze({ saturation: 0.9, contrast: 1.03, warmth: -0.4 }),
  [ZONE_IDS.RADIANT]: Object.freeze({ saturation: 1.1, contrast: 1.0, warmth: 0.6 }),
  [ZONE_IDS.CORRIDOR]: Object.freeze({ saturation: 0.97, contrast: 1.0, warmth: -0.1 }),
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
