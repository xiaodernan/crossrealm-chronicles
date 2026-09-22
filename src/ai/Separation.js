/**
 * 分离转向 —— 敌人之间、敌人与玩家之间互相推开。
 *
 * 旧实现里敌人的位移是"朝玩家方向走 `speed * dt`"，没有任何彼此避让：
 * 一群怪会精确重叠成一坨（看起来只有一只），也会直接钻进玩家身体。
 * 这里给每个敌人一个"别贴这么近"的速度增量，由 `EnemyFSM` 叠在追击方向上。
 *
 * 只做水平分离：悬浮单位与地面单位共用同一套半径，宁可略微挤一点也不引入第三轴。
 */
import { AI } from '../content/tuning.js';

/** 玩家身体的分离体：只带位置与半径，不把玩家对象交给 AI 乱读 */
export function bodyOf(position, radius, seed = 0) {
  return { position, separationRadius: () => radius, separationSeed: () => seed };
}

/** 两个身体完全重合时用的散开方向：按身份差取黄金角，成对的反向，不会同进同退 */
function degeneratePush(self, other) {
  const d = (self.separationSeed?.() ?? 0) - (other.separationSeed?.() ?? 0);
  const a = d * 2.399963229;
  return { x: Math.sin(a) * 2, z: Math.cos(a) * 2 };
}

/** 单个邻居对 self 的排斥贡献（未归一化）；不在挤压范围内返回 null */
function repel(self, other, ai) {
  const dx = self.position.x - other.position.x;
  const dz = self.position.z - other.position.z;
  const want = self.separationRadius() + other.separationRadius() + ai.separationPad;
  const dist = Math.hypot(dx, dz);
  if (dist >= want) return null;
  if (dist < 1e-4) return degeneratePush(self, other);
  const w = (want - dist) / want;
  return { x: (dx / dist) * w, z: (dz / dist) * w };
}

/**
 * 汇总所有邻居的排斥，得到一个速度增量（米/秒）。
 * 权重按"挤得越深推得越狠"线性放大，上限为一档力，避免互相推开时抖成一团。
 */
export function separationPush(self, others, ai = AI) {
  let sx = 0;
  let sz = 0;
  let weight = 0;
  for (const o of others) {
    if (o === self || !o?.position) continue;
    const r = repel(self, o, ai);
    if (!r) continue;
    sx += r.x;
    sz += r.z;
    weight = Math.min(1, weight + Math.hypot(r.x, r.z));
  }
  const len = Math.hypot(sx, sz);
  if (len < 1e-4) return null;
  const k = ai.separationForce * Math.min(1, weight);
  return { x: (sx / len) * k, z: (sz / len) * k };
}
