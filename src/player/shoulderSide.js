/**
 * 越肩左右换边（W-A5 切片4 —— "越肩左右换边"，A4 欠账里暂缓得最久的一格）
 *
 * 锁定目标在相机坐标系的哪一侧，第三人称过肩镜头往**背对**那侧挪一档：
 * 目标始终落在"空出来"的一侧画面上，不被自己的头挡住。非锁定态不换（行为与此前逐字一致）。
 *
 * 只管两件事，不知道 DOM、不知道 PlayerController、不碰渲染：
 * - 迟滞（±0.6 米）：贴身目标横向抄身时不来回翻；
 * - 按秒逼近（`t = min(1, dt * λ)`）：换边是一段"过中线"的过程，不做一帧 0.7 米瞬移。
 */

export const SHOULDER_SIDE_HYSTERESIS = 0.6;
export const SHOULDER_SIDE_LAMBDA = 5;

/**
 * 侧向偏移 < 迟滞 ⇒ 保持原边；否则新边 = `-sign(lateral)`
 * （目标在右 ⇒ 左肩 -1，目标在左 ⇒ 右肩 +1）。非有限数 ⇒ 保持原边。
 */
export function nextShoulderSide(prev, lateral) {
  if (!Number.isFinite(lateral)) return prev;
  if (Math.abs(lateral) <= SHOULDER_SIDE_HYSTERESIS) return prev;
  return lateral > 0 ? -1 : 1;
}

/**
 * 朝目标边按秒逼近：`k = min(1, max(0, dt) * λ)`。
 * `current` 不是有限数（首次落点 / undefined / NaN）⇒ 直接落到 `target`。
 */
export function dampShoulderSide(current, target, dt) {
  if (!Number.isFinite(current)) return target;
  const k = Math.min(1, Math.max(0, Number.isFinite(dt) ? dt : 0) * SHOULDER_SIDE_LAMBDA);
  return current + (target - current) * k;
}
