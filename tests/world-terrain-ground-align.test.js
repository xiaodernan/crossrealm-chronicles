/**
 * 主地面网格与「可行走地面」对齐的门禁。
 *
 * ## 修前是什么样子
 *
 * `WorldTerrain._buildMainGround` 用一张 `PlaneGeometry` 摊平当地面，顶点高度按**局部**坐标
 * `(lx, lz)` 采样 `heightAt`。但 `mesh.rotation.x = -Math.PI / 2` 把顶点局部 `(lx, lz, h)`
 * 映射到世界 `(lx, h, -lz)` —— 世界 z = -局部 y。于是可见地面在 z 上被**镜像**了。
 *
 * 物理侧从来不是镜像的：玩家走 `world.getGroundHeight(x, z)`（= `sampleGlobalHeightSmooth`）、
 * 区域落点、蜿蜒路径带全用世界 `(x, z)`。结果玩家 / 建筑相对可见地面整体陷进去或浮出来
 * （探针 `.tmp-scan/probe-terrain-mirror-real.mjs` 实测平均错位 **5.5 米**、最坏 **19 米**）。
 * 玩家的说法是「人走路会走到地里面去」。
 *
 * ## 门禁怎么钉
 *
 * 用真 `WorldTerrain` 造出那张地面，向下打射线取**可见地面高度**，与玩家脚下的
 * `sampleGlobalHeightSmooth` 逐点比对：平均错位必须小（修后 ≈ 0.17 米）。
 * 反面对照：复刻改前那份镜像采样造一张地面，同一把尺必须判它**大错位** ——
 * 证明这条门禁真能咬住镜像，而不是恰好对齐。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldTerrain } from '../src/world/WorldTerrain.js';
import { sampleGlobalHeight, sampleGlobalHeightSmooth } from '../src/world/TerrainHeight.js';

const W = 520;
const D = 620;
const SEGW = 96;
const SEGD = 112;

/** 向下打射线，取可见地面在该世界点的 y */
function groundAt(mesh, X, Z) {
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(X, 2000, Z), new THREE.Vector3(0, -1, 0));
  const hits = ray.intersectObject(mesh, false);
  return hits.length ? hits[0].point.y : null;
}

/** 采样点：铺满可玩区，避开网格边角。点少但足够让镜像错位暴露（射线是 O(三角面)） */
const PROBES = [];
for (const X of [-150, -50, 50, 150]) {
  for (const Z of [-200, -100, 0, 100, 200]) PROBES.push([X, Z]);
}

/** 可见地面 vs 玩家脚下地面的错位统计 */
function discrepancy(mesh) {
  let sum = 0;
  let n = 0;
  let max = 0;
  for (const [X, Z] of PROBES) {
    const y = groundAt(mesh, X, Z);
    if (y === null) continue;
    const walk = sampleGlobalHeightSmooth(X, Z, []);
    const d = Math.abs(y - walk);
    sum += d;
    n++;
    if (d > max) max = d;
  }
  return { avg: sum / n, max, n };
}

/** 复刻改前的镜像采样，造一张「错位地面」当反面对照 */
function buildMirroredGround() {
  const geo = new THREE.PlaneGeometry(W, D, SEGW, SEGD);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getY(i);
    pos.setZ(i, sampleGlobalHeight(lx, lz, [])); // 旧：按局部坐标（镜像）
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.rotation.x = -Math.PI / 2;
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('主地面网格对齐（WorldTerrain._buildMainGround）', () => {
  it('可见地面高度与玩家脚下地面高度对齐（平均错位 < 1 米）', () => {
    const scene = new THREE.Scene();
    const terrain = new WorldTerrain(scene, { zones: [] });
    terrain._buildMainGround(null);
    terrain.group.updateMatrixWorld(true);
    const mesh = terrain._meshes.ground;
    expect(mesh, '没造出主地面网格？').toBeTruthy();

    const { avg, max, n } = discrepancy(mesh);
    expect(n, '采样点太少').toBeGreaterThan(15);
    expect(avg, `可见地面与可行走地面平均错位 ${avg.toFixed(3)} 米（应 < 1）`).toBeLessThan(1);
    expect(max, `最坏错位 ${max.toFixed(3)} 米（应 < 4）`).toBeLessThan(4);
  });

  it('反面对照：改前的镜像采样必须被同一把尺判为大错位', () => {
    const mirrored = buildMirroredGround();
    const { avg } = discrepancy(mirrored);
    // 镜像版平均错位 ≈ 5.5 米 —— 这条尺若咬不住它，上面那条绿就是假绿
    expect(avg, `镜像版平均错位只有 ${avg.toFixed(3)} 米？这把尺咬不住镜像`).toBeGreaterThan(3);
  });
});
