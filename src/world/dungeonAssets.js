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
