/**
 * 分离转向 —— 敌人之间、敌人与玩家之间互相推开。
 *
 * 旧实现里敌人的位移是"朝玩家方向走 `speed * dt`"，没有任何彼此避让：
 * 一群怪会精确重叠成一坨（看起来只有一只），也会直接钻进玩家身体。
 * 这里给每个敌人一个"别贴这么近"的速度增量，由 `EnemyFSM` 叠在追击方向上。
 *
 * 只做水平分离：悬浮单位与地面单位共用同一套半径，宁可略微挤一点也不引入第三轴。
 *
 * ## 性能约定（W-Z335）
 * `separationPush` 在战斗热路径每帧 × 每只敌人 × 每候选调用——这里不再为
 * 每个邻居分配临时对象（旧实现 `repel`/`degeneratePush` 每个邻居各造 1-2 个
 * 短命 `{x, z}`，一场 30 只敌人 × 8 邻域就是每帧 ~500 个垃圾小物件）。
 * 算法与权重口径**逐位等价**：权重按「挤得越深推得越狠」线性放大，上限为一档力。
 */
import { AI } from '../content/tuning.js';

/** 玩家身体的分离体：只带位置与半径，不把玩家对象交给 AI 乱读 */
export function bodyOf(position, radius, seed = 0) {
  return { position, separationRadius: () => radius, separationSeed: () => seed };
}

/**
 * 汇总所有邻居的排斥，得到一个速度增量（米/秒）。
 * 权重按"挤得越深推得越狠"线性放大，上限为一档力，避免互相推开时抖成一团。
 * `null` 表示没有挤压（调用方按"不偏转"处理）。
 */
export function separationPush(self, others, ai = AI) {
  let sx = 0;
  let sz = 0;
  let weight = 0;
  const sp = self.position;
  const selfRadius = self.separationRadius();
  const pad = ai.separationPad;
  const force = ai.separationForce;
  for (const o of others) {
    if (o === self || !o?.position) continue;
    const dx = sp.x - o.position.x;
    const dz = sp.z - o.position.z;
    const want = selfRadius + o.separationRadius() + pad;
    const dist = Math.hypot(dx, dz);
    if (dist >= want) continue;
    if (dist < 1e-4) {
      // 完全重合：按身份差取黄金角，成对反向散开
      const d = (self.separationSeed?.() ?? 0) - (o.separationSeed?.() ?? 0);
      const a = d * 2.399963229;
      const px = Math.sin(a) * 2;
      const pz = Math.cos(a) * 2;
      sx += px;
      sz += pz;
      weight = Math.min(1, weight + Math.hypot(px, pz));
      continue;
    }
    const w = (want - dist) / want;
    const rx = (dx / dist) * w;
    const rz = (dz / dist) * w;
    sx += rx;
    sz += rz;
    weight = Math.min(1, weight + Math.hypot(rx, rz));
  }
  const len = Math.hypot(sx, sz);
  if (len < 1e-4) return null;
  const k = force * Math.min(1, weight);
  return { x: (sx / len) * k, z: (sz / len) * k };
}
