/**
 * Boss 阶段史诗演出的纯逻辑层（W-V2 切片1）
 *
 * 为什么单独成模块：`BossPhaseDirector` 只有浏览器环境能构造（它直接摸 `document.body`），
 * 而"第几阶段走电影化演出 + 舞台号牌写几"是纯函数——把它抽出来，Vitest 钉住，
 * 免得哪天有人"顺手"把 phase 1 也放进演出（门槛阶段不该惊动观众），或者把
 * 表里没有的数字直接插进 DOM。
 *
 * 符号说明：罗马数字（I/II/III…）是**装饰性字形**，不是文案——没有语言归属，
 * 不进 i18n 字符串表；它和 Boss 血条上的百分比一样属于"画出来的布景"。
 */

/** 只对 phase ≥ 2 走史诗演出（1 = 门槛阶段，转进去只换数值，不换舞台） */
export const CINE_PHASES = Object.freeze([2, 3]);

/** 舞台号牌字形表（装饰用；8 格足够覆盖本游戏最深的 3 阶段 Boss） */
const ROMAN_TABLE = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII']);

/**
 * 把阶段号映射为罗马数字。防御式：非有限数 / 越界一律回空串，
 * 让调用方渲染"什么都不显示"而不是渲染一个 `NaN` 或 `IX`。
 */
export function romanNumeral(phase) {
  const n = Number(phase);
  if (!Number.isFinite(n)) return '';
  const i = Math.trunc(n);
  if (i < 1 || i >= ROMAN_TABLE.length) return '';
  return ROMAN_TABLE[i];
}

/** 这一格值不值得拉上黑边（phase 2/3 = 值得） */
export function isCinePhase(phase) {
  const n = Number(phase);
  return Number.isFinite(n) && CINE_PHASES.includes(Math.trunc(n));
}
