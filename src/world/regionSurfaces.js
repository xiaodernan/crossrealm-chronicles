import * as THREE from 'three';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { SURFACE_SPECS, SURFACE_NAMES } from '../content/materialSurfaces.js';

/**
 * 区域表面的**两段式上贴**（W-C5 切片6 立，切片10 起按表面名泛化）。
 *
 * ## 为什么单独一个模块
 * 宿主有好几种：BaseZone 子类（经 `addSurfaceMaterial` 登记）、`WorldManager` 的枢纽石柱
 * （不继承 BaseZone）、各区的外野散石（同样是 BaseZone 子类但表面不同）。共用的只有
 * "两段式上贴"这一件事 —— 世界构建不等贴图（`WorldManager.build` 同步跑完，
 * `TextureLibrary.load()` 的 `.then` 才回来），所以：构建时调
 * `makeRegionSurfaceMaterial` 拿默认材质（库没就绪就保持旧读数），库就绪后由
 * `WorldManager` 既有的 `load().then` 调 `applySurfaceTextures` 挨个补挂。
 * 与切片的剑同一条机制（`PlayerController._applySteelSurface`），只是重挂点是世界管理器。
 *
 * ## 契约
 * - `makeRegionSurfaceMaterial(params, surface = 'drum')`：给 `MeshStandardMaterial` 的
 *   构造参数 + 表面名，返回挂好（或留待补挂）的材质。params 里的 `roughness` 是
 *   **退路读数** —— 烘焙贴图就位后由 `applyRegionSurface` 接管（roughness = 1，
 *   法线与粗糙度都走贴图）。颜色仍归各材料。
 * - `applyRegionSurface(mat, lib = TextureLibrary.loaded(), surface = 'drum')`：把该表面
 *   的变体贴到材质上（`uvVariant(surface, 铺, 铺)`，铺 = 1 / tileMeters，与 MANIFEST 的
 *   repeat 同一算口径）。幂等：同缓存键的变体是同一份壳，重挂只是重赋同样的引用；
 *   每次都置 `needsUpdate`（材质可能已编译，新贴图要重收程序 —— 与剑同一口径）。
 *   库没就绪 / 取不到变体 / 没给材质时返回 false 且**不碰材质**（退路读数继续生效）。
 *   表面名不在规格表里**当场抛** —— 那是接线错误（抄错了名字），不是"这次没贴图"：
 *   静默返回 false 会让一整片世界安静地停在退路读数上，而账面上看不出差别。
 */
export function makeRegionSurfaceMaterial(params, surface = 'drum') {
  const mat = new THREE.MeshStandardMaterial(params);
  applyRegionSurface(mat, undefined, surface);
  return mat;
}

export function applyRegionSurface(mat, lib = TextureLibrary.loaded(), surface = 'drum') {
  if (!mat || !lib) return false;
  const spec = SURFACE_SPECS[surface];
  if (!spec) {
    throw new Error(`regionSurfaces: 未知的表面 "${surface}"（规格表里只有 ${SURFACE_NAMES.join(' / ')}）`);
  }
  const 铺 = 1 / spec.tileMeters;
  const v = lib.uvVariant(surface, 铺, 铺);
  if (!v) return false;
  if (v.normalMap) mat.normalMap = v.normalMap;
  if (v.roughnessMap) mat.roughnessMap = v.roughnessMap;
  mat.normalScale = new THREE.Vector2(0.8, 0.8);
  mat.roughness = 1;
  mat.needsUpdate = true;
  return true;
}
