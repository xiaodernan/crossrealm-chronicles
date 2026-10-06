import * as THREE from 'three';

/**
 * 地下城的几何与材质共享库（W-B10 切片4d，修 B76）
 *
 * ## 为什么要有这一层
 * 改前 `buildGeometry` 每建一个网格就 `new` 一份几何、并 `.clone()` 一份材质。
 * 七座副本在 `DungeonManager` **构造时**就各 `build()` 一遍，于是开机付
 * **1804 份几何 + 1804 份材质**（`.tmp-20261003/wb10s4c-census.mjs`），
 * 而它们的尺寸签名全域只有 **16 种**、材质按副本配色只有 **7×5 + 1** 份。
 * "每间房不一样"从来不来自几何 —— 它来自随机摆的道具与文献碎片（切片1 的 M4 读数）。
 *
 * ## 所有者：共享的东西由这里拥有，副本只借用
 * 这是本层唯一要紧的约定。改前 `DungeonManager.disposeSubtree` 对子树里每个网格
 * 无差别调 `geometry.dispose()` / `material.dispose()`；一旦几何被多座副本共用，
 * 那样做会让**离开一座副本毁掉另外六座的地面**。所以释放权一并收在这里：
 * `disposeDungeonSubtree` 只释放**不属于本库**的资源。
 *
 * 认领用 `Set` 而不是给对象打 `userData.shared` 标记：标记是约定、能被别处照抄或抹掉，
 * 而这个 `Set` 只有本模块能写。
 *
 * ## 为什么不提供"清空缓存"
 * 那会是一个没人调用的出口（本仓对这种死出口的口径：不加）。共享的几何是有限集合
 * （十几种），页面生命周期内一直在用，没有"释放了更好"的时刻；
 * 真正要防的是"反复进出副本让资源单调增长"，那由 `dungeonAssetStats()` 读数 + 门禁钉住。
 */

/** 共享几何：key → geometry */
const geoCache = new Map();
/** 共享材质：key → material */
const matCache = new Map();
/** 本库拥有的资源 —— `disposeDungeonSubtree` 见到的、在这里面的，一律不释放 */
const owned = new Set();

/** 按"类型 + 构造参数"取一份共享几何 */
function sharedGeo(key, make) {
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = make();
  g.userData.shared = true; // 供人读；机器判归属只看 owned
  geoCache.set(key, g);
  owned.add(g);
  return g;
}

/** 按 key 取一份共享材质 */
function sharedMat(key, make) {
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = make();
  m.userData.shared = true;
  matCache.set(key, m);
  owned.add(m);
  return m;
}

const n = (v) => (typeof v === 'number' ? v.toFixed(6) : String(v));

export const sharedBox = (w, h, d) =>
  sharedGeo(`box:${n(w)},${n(h)},${n(d)}`, () => new THREE.BoxGeometry(w, h, d));

export const sharedPlane = (w, h) =>
  sharedGeo(`plane:${n(w)},${n(h)}`, () => new THREE.PlaneGeometry(w, h));

export const sharedCircle = (r, seg) =>
  sharedGeo(`circle:${n(r)},${n(seg)}`, () => new THREE.CircleGeometry(r, seg));

export const sharedCylinder = (rt, rb, h, rs) =>
  sharedGeo(`cyl:${n(rt)},${n(rb)},${n(h)},${n(rs)}`, () => new THREE.CylinderGeometry(rt, rb, h, rs));

export const sharedTorus = (r, tube, rs, ts) =>
  sharedGeo(`torus:${n(r)},${n(tube)},${n(rs)},${n(ts)}`, () => new THREE.TorusGeometry(r, tube, rs, ts));

/**
 * UV 以**米**为单位的几何（W-C5）。
 *
 * ## 为什么要有这一族
 * three 的几何 UV 都是"每个面 0..1"，贴图挂在材质上就只有一个 `repeat` ——
 * 一面 18 米的整墙和一段 7 米的墙段（门洞旁边那截）要的铺数不同，同一份材质满足不了两个。
 * 把 UV 先乘上自己的真实尺寸（"米"），贴图端就只剩**一个**铺数：`1 / 一砖两米`。
 * 于是墙段、地面、柱子无论多大，砖都是 2 米一块 —— 而材质照样是每座副本一份（B76）。
 *
 * ## 与 `sharedBox` 等的关系
 * 同一套缓存、同一份 `owned`（`isSharedAsset` 认它们），只是 UV 不同 ——
 * `parameters` 原样保留（B75/B80 那批门禁在 `geometry.parameters` 上与它们对齐）。
 * 门板 / 门框 / 饰品这些**不换贴图**的消费者继续走 `sharedBox`：UV 没人读，不欠它。
 *
 * ## 各面的 UV 对应
 * - 盒：three 的六面顺序 px/nx/py/ny/pz/nz，每面 4 个顶点；UV 的 u/v 各对应哪两个尺寸
 *   由 `BoxGeometry` 的 `buildPlane` 实参决定（下表），照抄即对。
 * - 平面：u ↔ 宽，v ↔ 高。
 * - 圆柱：躯干（group 0）u 绕周长、v 沿高；上下盖是平面投影，保持原样不缩放。
 */
const 盒面尺寸 = (w, h, d) => [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];

export const uvBox = (w, h, d) =>
  sharedGeo(`uvbox:${n(w)},${n(h)},${n(d)}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    // 只对 1 段/面的盒成立：每面 4 个顶点，面序即顶点序。带分段的盒 UV 是网格状，这套换算不适用。
    if (uv.count !== 24) throw new Error(`uvBox 只接受不分段的盒（顶点 ${uv.count} ≠ 24）`);
    const dims = 盒面尺寸(w, h, d);
    for (let f = 0; f < 6; f++) {
      for (let vi = f * 4; vi < f * 4 + 4; vi++) {
        uv.setXY(vi, uv.getX(vi) * dims[f][0], uv.getY(vi) * dims[f][1]);
      }
    }
    uv.needsUpdate = true;
    return g;
  });

export const uvPlane = (w, h) =>
  sharedGeo(`uvplane:${n(w)},${n(h)}`, () => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
    uv.needsUpdate = true;
    return g;
  });

export const uvCylinder = (rt, rb, h, rs) =>
  sharedGeo(`uvcyl:${n(rt)},${n(rb)},${n(h)},${n(rs)}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, h, rs);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    const { start, count } = g.groups[0]; // group 0 = 躯干（1/2 是上下盖）
    const seen = new Set();
    for (let i = start; i < start + count; i++) {
      const vi = g.index.getX(i);
      if (seen.has(vi)) continue;
      seen.add(vi);
      // 每行自己的半径：锥形柱（上细下粗）绕一圈的米数逐行不同，按行算才是真的米。
      const v = (h / 2 - pos.getY(vi)) / h;
      const r = v * (rb - rt) + rt;
      uv.setXY(vi, uv.getX(vi) * 2 * Math.PI * r, uv.getY(vi) * h);
    }
    uv.needsUpdate = true;
    return g;
  });

/**
 * 取一份共享材质。`key` 必须把"决定这份材质长什么样"的东西全写进去 ——
 * 地下城的材质由副本配色（`theme` / `accent`）决定，所以 key 里带副本 id。
 */
export function dungeonMaterial(key, make) {
  return sharedMat(key, make);
}

/**
 * 释放一棵子树，**跳过本库拥有的资源**。
 * 这是 `DungeonManager` 里那个 `disposeSubtree` 的替身：形状一致，只多了"归属"这一问。
 */
export function disposeDungeonSubtree(root) {
  for (const child of [...root.children]) {
    root.remove(child);
    child.traverse((o) => {
      if (o.geometry && !owned.has(o.geometry)) o.geometry.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => { if (x && !owned.has(x)) x.dispose?.(); });
      else if (m && !owned.has(m)) m.dispose?.();
    });
  }
}

/** 给门禁用的读数：共享库现在持有几份几何、几份材质 */
export function dungeonAssetStats() {
  return { geometries: geoCache.size, materials: matCache.size };
}

/** 这个对象是不是本库的（测试用，也供 dispose 自查） */
export const isSharedAsset = (x) => owned.has(x);
