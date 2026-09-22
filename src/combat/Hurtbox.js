/**
 * 受击盒 —— 把「打到了哪个部位」从 2D 圆+锥的投影里解出来。
 *
 * 一个目标 = 若干条**竖直分段**（头/躯干/下盘），分段高度来自 `content/tuning.js` 的体型表，
 * 以目标网格原点（脚底）为基准；悬浮单位与地形高差由 `hurtBaseY()` 提供，不写死在分段里。
 *
 * 判定方式：出手是一条相对出手者脚底的垂直打击带（`MoveTable` 的 `band`、敌人招式的 `band`），
 * 换算到目标局部高度后与分段比较 —— **重叠最多的那段**被打中；
 * 完全没有重叠时，若与最近分段的间隙不超过容差（`HURTBOX.snap`，可按体型方案覆盖）仍算打中最近段，
 * 否则这一刀在垂直方向落空（打头顶上方、或目标在高台上）。
 *
 * 受击方不只是敌人：玩家自己也在 `BODY_PLANS` 里有一档，
 * 否则"跳起来躲横扫"这件事在竖直方向上根本不存在。
 */
import { BODY_PLANS, HURTBOX, PARTS } from '../content/tuning.js';

const FALLBACK_PLAN = 'soldier';

/** 按体型名构造受击盒；`scale` 是单体微调（同名敌人也可有大小只） */
export function createHurtbox(type, scale = 1) {
  const plan = BODY_PLANS[type] ?? BODY_PLANS[FALLBACK_PLAN];
  const s = plan.scale * (scale ?? 1);
  return {
    type,
    scale: s,
    /** 逐类容差：体型方案可收紧或放宽"擦边也算打到"，缺省落在 `HURTBOX.snap` */
    snap: plan.snap ?? HURTBOX.snap,
    segments: plan.parts.map((id) => {
      const p = PARTS[id];
      return {
        id,
        label: p.label,
        mult: p.mult,
        posture: p.posture,
        y0: p.y0 * s,
        y1: p.y1 * s,
        center: ((p.y0 + p.y1) / 2) * s,
      };
    }),
  };
}

/**
 * 在受击盒的局部高度上选出被打中的部位。
 * 返回 null 表示垂直方向完全落空。
 */
export function selectPart(hurtbox, lo, hi, snap = HURTBOX.snap) {
  let best = null;
  let bestOverlap = 0;
  let nearest = null;
  let nearestGap = Infinity;
  for (const seg of hurtbox.segments) {
    const overlap = Math.min(seg.y1, hi) - Math.max(seg.y0, lo);
    if (overlap > bestOverlap) {
      best = seg;
      bestOverlap = overlap;
    }
    const gap = seg.y1 < lo ? lo - seg.y1 : seg.y0 > hi ? seg.y0 - hi : 0;
    if (gap < nearestGap) {
      nearest = seg;
      nearestGap = gap;
    }
  }
  if (best) return best;
  return nearestGap <= snap ? nearest : null;
}

/**
 * 把出手者脚底为基准的打击带套到某个目标上。
 * `attackerBase` / `target.hurtBaseY()` 都是世界高度，落差在这里折进局部区间。
 * 容差缺省取目标自己那一档（`BODY_PLANS[*].snap`）；显式传 0 表示"不许擦边"。
 */
export function pickPart(target, attackerBase, band, snap = null) {
  const box = target?.hurtbox;
  if (!box || !band) return null;
  const base = target.hurtBaseY();
  return selectPart(
    box,
    band[0] + attackerBase - base,
    band[1] + attackerBase - base,
    snap ?? box.snap ?? HURTBOX.snap
  );
}
