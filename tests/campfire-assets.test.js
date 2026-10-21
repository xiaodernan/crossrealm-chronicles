/**
 * 营火一家的资源账（W-C1 切片3c）—— 八座营火共用几何与材质，且两条销毁路径都真的释放。
 *
 * ## 这一片修的是什么
 *
 * 营火有营火有两个属主：`RestPointManager`（底座 / 石圈 / 火苗 / 光环）与 `RestPointEnhancer`
 * （木牌柱 / 牌面 / 地标光柱）。改前两边都**各造各的** —— 每一座营火各造一份 ⇒
 * 八座就是 **56 份几何 + 56 份材质**，而它们**长得一模一样**。
 *
 * 而且两层都**从不被销毁**：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
 * （"假装收编"的防线），它们没有 ⇒ 从不被收编 ⇒ `Game.dispose()` 走完，
 * 那些几何与材质**一份都不还**。
 *
 * ## 哪一份材质**不能**共享（这一条最要紧）
 *
 * - **火苗**：`update` 里每座各自脉动（`p.flame.material.emissiveIntensity = …`）——
 *   共用一份就是"一座在跳，全场在跳"；
 * - **地标光柱**：`update` 里每座按**自己的距离**调透明度 —— 共用一份就是"一座靠近，八座一起亮"。
 *
 * 这两样**逐座一份**，其余（底座 / 石圈 / 光环 / 木牌柱 / 牌面）共用。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { RestPointEnhancer } from '../src/world/RestPointEnhancer.js';

const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

/** 记下"进了场景图"的东西：几何与材质各一份 uuid 集；并数 dispose 次数 */
function 开监视器() {
  const seen = { geometries: new Set(), materials: new Set() };
  const disposes = { geometries: 0, materials: 0 };
  const origAdd = THREE.Object3D.prototype.add;
  const origGeo = THREE.BufferGeometry.prototype.dispose;
  const origMat = THREE.Material.prototype.dispose;
  vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (...children) {
    for (const c of children) {
      if (c.geometry) seen.geometries.add(c.geometry.uuid);
      const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
      for (const m of mats) seen.materials.add(m.uuid);
    }
    return origAdd.apply(this, children);
  });
  vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (...a) {
    disposes.geometries += 1;
    return origGeo.apply(this, a);
  });
  vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (...a) {
    disposes.materials += 1;
    return origMat.apply(this, a);
  });
  return { seen, disposes, 还原: () => vi.restoreAllMocks() };
}

/** 真造一套营火（八座：枢纽 + 七座真实位面） */
function 造营火() {
  const scene = new THREE.Scene();
  const world = { getGroundHeight: () => 0 };
  const restPoints = new RestPointManager(scene, world);
  restPoints.buildDefaults();
  const game = { restPoints, dialog: { toast: () => {} } };
  const enhancer = new RestPointEnhancer(restPoints, game);
  return { scene, world, restPoints, enhancer, game };
}

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 八座营火共用几何与材质', () => {
  it('全场只造七份几何（营火本体四份 + 装饰三份；改前是五十六份）', () => {
    const { seen, 还原 } = 开监视器();
    const { restPoints } = 造营火();
    还原();
    expect(restPoints.points.length, '营火不是八座 —— 这一条会空转').toBe(8);
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 八座营火应当只共用七份`).toBe(7);
  });

  it('全场只造二十一份材质（三份共享 + 火苗逐座八份 + 两份共享 + 光柱逐座八份）', () => {
    const { seen, 还原 } = 开监视器();
    造营火();
    还原();
    expect(seen.materials.size, `材质造了 ${seen.materials.size} 份 —— 应当是 3 + 8 + 2 + 8 = 21`).toBe(21);
  });

  it('火苗的材质逐座一份（共用就是"一座在跳，全场在跳"）', () => {
    const { restPoints } = 造营火();
    const 火苗材质 = restPoints.points.map((p) => p.flame.material);
    expect(new Set(火苗材质).size, '火苗材质被共用了 —— 一座脉动会带着全场').toBe(火苗材质.length);
    expect(火苗材质.length).toBe(8);
  });

  it('地标光柱的材质逐座一份（共用就是"一座靠近，八座一起亮"）', () => {
    const { restPoints } = 造营火();
    const 光柱材质 = restPoints.points.map((p) => p.landmarkBeam.material);
    expect(new Set(光柱材质).size, '光柱材质被共用了 —— 一座靠近，八座一起亮').toBe(光柱材质.length);
    expect(光柱材质.length).toBe(8);
  });
});

describe('② 两条销毁路径真的释放', () => {
  it('`RestPointManager.dispose()` 把场景清空，共享的那七份都释放过', () => {
    const { disposes, 还原 } = 开监视器();
    const { restPoints, scene } = 造营火();
    expect(disposes.geometries, '造的时候就不该释放').toBe(0);
    restPoints.dispose();
    还原();
    expect(scene.children.length, 'dispose 之后场景里还留着营火').toBe(0);
    // 四份共享几何 + 逐座八份火苗材质 + 三份共享材质
    expect(disposes.geometries, '共享几何没释放').toBe(4);
    expect(disposes.materials, '材质没释放').toBe(11);
  });

  it('`RestPointEnhancer.dispose()` 摘掉装饰、释放它自己的那三份几何与十份材质', () => {
    const { disposes, 还原 } = 开监视器();
    const { restPoints, enhancer } = 造营火();
    enhancer.dispose();
    还原();
    // 三份共享几何 + 两份共享材质 + 逐座八份光柱材质
    expect(disposes.geometries, '装饰的共享几何没释放').toBe(3);
    expect(disposes.materials, '装饰的材质没释放').toBe(10);
    // 装饰摘掉了，营火本体那四件还在（那是另一个属主的）
    for (const p of restPoints.points) {
      expect(p.mesh.children.length, '装饰还挂在营火上').toBe(4);
    }
  });

  it('两处都有 `dispose()`（`Game._adopt` 拒绝没有销毁路径的子系统 —— 这是那道防线的前提）', () => {
    const { restPoints, enhancer } = 造营火();
    expect(typeof restPoints.dispose, '营火本体没有 dispose()').toBe('function');
    expect(typeof enhancer.dispose, '装饰层没有 dispose()').toBe('function');
  });
});

describe('③ 两处都在拆卸登记表里', () => {
  it('`Game` 收编了它们（收编了，`Game.dispose()` 才会走它们）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编营火本体').toContain("_adopt('world/RestPointManager'");
    expect(src, 'Game 没有收编营火装饰层').toContain("_adopt('world/RestPointEnhancer'");
  });
});
