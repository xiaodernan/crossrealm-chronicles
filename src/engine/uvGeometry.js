import * as THREE from 'three';

/**
 * 以**米**为单位的 UV 几何构造（W-C5）。
 *
 * ## 为什么要有这一族
 * three 的几何 UV 都是"每个面 0..1"，贴图挂在材质上就只有一个 `repeat` ——
 * 一面 18 米的整墙和一段 7 米的墙段（门洞旁边那截）要的铺数不同，同一份材质满足不了两个。
 * 把 UV 先乘上自己的真实尺寸（"米"），贴图端就只剩**一个**铺数：`1 / 一砖两米`。
 * 于是墙段、地面、柱子、敌人身体无论多大，砖都是同一个尺寸 —— 而材质照样各归各的域。
 *
 * ## 为什么构造在这里而不是 dungeonAssets
 * 切片4 起敌人（`combat/Enemy.js`）也贴装甲板面，走的是同一个"米制 UV + uvVariant 铺数"
 * 机制。但 `combat` 不能 import `world/` —— chunk 图里 `world → combat` 本就有一条边
 * （`DungeonManager` 引 `DungeonBoss`），反向再来一条就是环（`tests/chunk-graph.test.js`）。
 * 所以"怎么算"外提到 chunk-core 的本模块（**纯构造、无缓存、无所有权**）；
 * 缓存与归属留在各自的域 —— `dungeonAssets` 的 `geoCache`/`owned`（副本可进出）、
 * `Enemy` 的 `ENEMY_GEO`（敌人可增删）：生命周期不同，共用的只有这套换算。
 *
 * ## 各面的 UV 对应
 * - 盒：three 的六面顺序 px/nx/py/ny/pz/nz，每面 4 个顶点；UV 的 u/v 各对应哪两个尺寸
 *   由 `BoxGeometry` 的 `buildPlane` 实参决定（下表），照抄即对。
 * - 平面：u ↔ 宽，v ↔ 高。
 * - 圆柱 / 圆锥：躯干（group 0）u 绕周长、v 沿高；上下盖是平面投影，保持原样不缩放。
 * - 胶囊：u 绕该行半径的周长、v 沿剖面弧长（`LatheGeometry` 的 v 是索引均分，
 *   直接乘总长会在圆柱段错 15 倍，必须按位置算 —— 见 `makeUvCapsuleGeometry`）。
 * - 多面体：**按面投影**（三角形自己的法线取最大分量轴），不是球面 —— 球面/圆柱的
 *   经线缝会切在石头的劈裂面上，见 `makeUvFacetGeometry`。
 */

/** 不分段盒的六面 UV 尺寸表（面序 px/nx/py/ny/pz/nz，每面 4 顶点） */
const 盒面尺寸 = (w, h, d) => [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];

export function makeUvBoxGeometry(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // 只对 1 段/面的盒成立：每面 4 个顶点，面序即顶点序。带分段的盒 UV 是网格状，这套换算不适用。
  if (uv.count !== 24) throw new Error(`uv 盒只接受不分段的盒（顶点 ${uv.count} ≠ 24）`);
  const dims = 盒面尺寸(w, h, d);
  for (let f = 0; f < 6; f++) {
    for (let vi = f * 4; vi < f * 4 + 4; vi++) {
      uv.setXY(vi, uv.getX(vi) * dims[f][0], uv.getY(vi) * dims[f][1]);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export function makeUvPlaneGeometry(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  uv.needsUpdate = true;
  return g;
}

/** 圆柱/圆锥躯干的共同换算：u 乘"该行自己的周长"、v 乘高。锥形柱（上细下粗）逐行半径不同，按行算才是真的米 */
function metricCylinderRows(g, rt, rb, h) {
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const { start, count } = g.groups[0]; // group 0 = 躯干（1/2 是上下盖）
  const seen = new Set();
  for (let i = start; i < start + count; i++) {
    const vi = g.index.getX(i);
    if (seen.has(vi)) continue;
    seen.add(vi);
    const v = (h / 2 - pos.getY(vi)) / h;
    const r = v * (rb - rt) + rt;
    uv.setXY(vi, uv.getX(vi) * 2 * Math.PI * r, uv.getY(vi) * h);
  }
  uv.needsUpdate = true;
  return g;
}

export const makeUvCylinderGeometry = (rt, rb, h, rs) =>
  metricCylinderRows(new THREE.CylinderGeometry(rt, rb, h, rs), rt, rb, h);

/** 圆锥 = radiusTop 0 的圆柱（`ConeGeometry` 就是这么继承的），类型与 parameters 保持原样 —— 别处按 `type` 认锥体 */
export const makeUvConeGeometry = (r, h, rs) =>
  metricCylinderRows(new THREE.ConeGeometry(r, h, rs), 0, r, h);

/**
 * 胶囊（W-C5 切片4）：剖面是"下半圆帽 + 圆柱段 + 上半圆帽"，UV 按**位置**算米。
 *
 * ## 为什么不能直接缩放 `CapsuleGeometry` 的 v
 * `CapsuleGeometry` 继承 `LatheGeometry`：`uv.y = j / (点数-1)` 是**索引均分**，
 * 不是弧长 —— capSegments=8 时剖面 34 个点均分总弧长 2.2566 米，圆柱段那**一格**
 * 实际跨 1.0 米却只摊到 0.068 米（15 倍错），砖在帽盖上会挤成一团。所以 v 从顶点
 * 位置反推：|y| 在圆柱段内 ⇒ 半圈弧长 + (y + len/2)；两个帽盖 ⇒ 由 acos 得圆心角
 * 再乘半径。u 与圆柱同口径：乘该顶点所在行的周长 2πρ。
 *
 * ## 读数（r=0.4, len=1.0, cs=8, rs=16，探针 `.tmp-20261007/wc5s4-capsule-probe.mjs`）
 * uMax = 2πr = 2.513274（精确）；v 从 ≈0 到 ≈2.2565（= len+πr = 2.256637 减去
 * float32 位置量化：y=±0.9 存成 ±0.89999997，两端的 v 各差 ≈1.4e-4 —— 断言按 3 位小数）。
 */
export function makeUvCapsuleGeometry(radius, length, capSegments, radialSegments) {
  const g = new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const half = length / 2;
  const total = length + Math.PI * radius;
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rho = Math.hypot(x, z);
    let v;
    if (y <= -half) v = radius * Math.acos(clamp((-y - half) / radius));
    else if (y >= half) v = total - radius * Math.acos(clamp((y - half) / radius));
    else v = (Math.PI / 2) * radius + (y + half);
    uv.setXY(i, uv.getX(i) * 2 * Math.PI * rho, v);
  }
  uv.needsUpdate = true;
  return g;
}

/**
 * 多面体（十二面体散石）的**按面投影**米制 UV（W-C5 切片10）。
 *
 * ## 为什么球面投影不行
 * 球面/圆柱投影要把 u 绕一圈（0..2πR），于是必然有一条**经线缝**：缝两边 u 从
 * 2πR 跳到 0，除非 2πR 恰好是 tileMeters 的整数倍，否则贴图在缝上错开一格。
 * 圆柱（`makeUvCylinderGeometry`）天然带这条缝，柱身是光滑曲面看不出来；**石头是
 * 多面体，缝会正好切在某块劈裂面上**，比不贴还难看。
 *
 * ## 按面投影为什么行
 * 取每个三角形自己的法线，按**最大的那个分量轴**投影 —— 同一平面的几个三角片法线
 * 相同，因此用同一个投影，整个面内 u/v 连续，且就是**米**。相邻面各自投影，接缝处
 * 仍连续（共享边的两个顶点在两边的 (u,v) 不同，但差值只是投影方向的视角差，
 * 不是贴图错位）。这是石头 / 地形这一类"硬表面"的常规做法。
 *
 * ## 为什么要先 `toNonIndexed()`
 * 一个顶点只能有一组 UV，所以"按面给投影"要求每个顶点只属于一个面。three 的
 * `PolyhedronGeometry`（十二/二十/八面体）**本来就是非索引的**（detail 0 的十二面体
 * 108 顶点 = 12 个五边形面 × 3 三角片 × 3），所以对它们这步是空转。
 * 但入口不能假设这件事：传进来的是**索引**几何（`BoxGeometry` / `CylinderGeometry`
 * / 合并过的缓冲区）时按面投影会静默错到别的面上去，所以先拆。`toNonIndexed()`
 * 自己会在已非索引时原样返回，代价由那条支自己付。
 *
 * ## 保住的三个字段
 * `type` / `parameters` 由 `toNonIndexed()` 丢掉，而调用方按 `geometry.parameters.radius`
 * 算碰撞体（`GloomZone` / `SpaceZone` 的散石）—— 所以原样搬过来。这与
 * `makeUvConeGeometry` "类型与 parameters 保持原样"是同一条纪律。
 */
export function makeUvFacetGeometry(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (geometry.index) {
    g.type = geometry.type;
    g.parameters = geometry.parameters;
  }
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    // 法线最大的那个轴：这一族三角片沿该轴投影，投影面是另外两维（单位即米）
    const 投z = ax >= ay && ax >= az;      // 法线近 ±X ⇒ 用 (z, y)
    const 投y = !投z && ay >= az;          // 法线近 ±Y ⇒ 用 (x, z)
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      if (投z) uv.setXY(vi, pos.getZ(vi), pos.getY(vi));
      else if (投y) uv.setXY(vi, pos.getX(vi), pos.getZ(vi));
      else uv.setXY(vi, pos.getX(vi), pos.getY(vi));
    }
  }
  uv.needsUpdate = true;
  return g;
}
