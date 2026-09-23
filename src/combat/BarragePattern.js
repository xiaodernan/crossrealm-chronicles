/**
 * 落点圈阵列（B5 的"弹幕"档）—— 一次施法铺出多枚错时落下的危险区。
 *
 * 这里只有几何，没有随机数：同一份输入永远铺出同一张图，所以整表可断言，
 * 手感调试改的是 `content/tuning.js` 里 `GROUND_HAZARD.barrage` 的数，不是这段代码。
 *
 * 散开用**黄金角 + 面积均匀**（与 `EnemyManager._summon` 的召唤落点同一套：每枚圈分到
 * 一样大的地盘，谁也不跟谁重叠成一坨），并且**由内向外排落地顺序**：越靠圈心的落点越早
 * 落下，越往外越晚。于是"站定不动"必吃内圈那几枚，而立刻外跑的人能在第一枚落地前脱身 ——
 * 场地机制的意义就在这：躲法来自移动本身，而不是来自数值减免。
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 以 `(cx, cz)` 为心铺开 `spec.count` 枚落点，返回 `{ x, z, telegraph }` 列表。
 * `spec` 用 `GROUND_HAZARD.barrage` 的同名字段（count / spread / telegraph / stagger）。
 */
export function barrageLayout(cx, cz, spec) {
  const n = Math.max(0, spec.count | 0);
  const pts = [];
  for (let i = 0; i < n; i++) {
    // sqrt 让每枚圈分到的面积相等；i + 0.5 免得第一枚贴在圆心上
    const r = spec.spread * Math.sqrt((i + 0.5) / n);
    const a = i * GOLDEN_ANGLE;
    pts.push({
      x: cx + Math.cos(a) * r,
      z: cz + Math.sin(a) * r,
      telegraph: spec.telegraph + i * spec.stagger,
    });
  }
  return pts;
}
