import * as THREE from 'three';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../content/materialSurfaces.js';

/**
 * 区域石构的 drum 表面（W-C5 切片6）：灰白森林废墟的 6 根断柱、世界之锚的中央石柱、
 * 虚空区尖碑的柱身。三处的地层是同一个"1 米见方的鼓形石段"（见 `materialSurfaces.js`
 * 的 drum 行），柱身几何都换成 `makeUvCylinderGeometry`（UV 以米计），所以粗柱细柱
 * 上的石块是同一个尺寸。
 *
 * ## 为什么单独一个模块
 * 三处宿主不同：两处在 BaseZone 子类里（`FantasyZone.buildRuins` / `VoidZone.buildLandmarks`，
 * 经 `BaseZone.addSurfaceMaterial` 登记），一处在 `WorldManager.buildHubLandmarks`
 * （不继承 BaseZone）。共用的只有"两段式上贴"这一件事 —— 世界构建不等贴图
 * （`WorldManager.build` 同步跑完，`TextureLibrary.load()` 的 `.then` 才回来），所以：
 * 构建时调 `makeRegionSurfaceMaterial` 拿默认材质（库没就绪就保持旧读数），库就绪后
 * 由 `WorldManager` 既有的 `load().then` 调 `applySurfaceTextures` 挨个补挂。
 * 与切片的剑同一条机制（`PlayerController._applySteelSurface`），只是重挂点是世界管理器。
 *
 * ## 契约
 * - `makeRegionSurfaceMaterial(params)`：给 `MeshStandardMaterial` 的构造参数，返回挂好
 *   （或留待补挂）的材质。params 里的 `roughness` 是**退路读数** —— 烘焙贴图就位后由
 *   `applyRegionSurface` 接管（roughness = 1，法线与粗糙度都走贴图）。颜色仍归各材料。
 * - `applyRegionSurface(mat, lib = TextureLibrary.loaded())`：把 drum 变体贴到材质上
 *   （`uvVariant('drum', 砖, 砖)`，砖 = 1 / tileMeters，与 MANIFEST 的 repeat 同一算口径）。
 *   幂等：同缓存键的变体是同一份壳，重挂只是重赋同样的引用；每次都置 `needsUpdate`
 *   （材质可能已编译，新贴图要重收程序 —— 与剑同一口径）。
 *   库没就绪 / 取不到变体 / 没给材质时返回 false 且**不碰材质**（退路读数继续生效）。
 */
export function makeRegionSurfaceMaterial(params) {
  const mat = new THREE.MeshStandardMaterial(params);
  applyRegionSurface(mat);
  return mat;
}

export function applyRegionSurface(mat, lib = TextureLibrary.loaded()) {
  if (!mat || !lib) return false;
  const 砖 = 1 / SURFACE_SPECS.drum.tileMeters;
  const v = lib.uvVariant('drum', 砖, 砖);
  if (!v) return false;
  if (v.normalMap) mat.normalMap = v.normalMap;
  if (v.roughnessMap) mat.roughnessMap = v.roughnessMap;
  mat.normalScale = new THREE.Vector2(0.8, 0.8);
  mat.roughness = 1;
  mat.needsUpdate = true;
  return true;
}
