/**
 * Boss 场的资源账（W-C1 切片3g）—— 五座场共用两份几何，且有销毁路径。
 *
 * ## 这一片补的是什么
 *
 * ① **五座场各造各的**：`EnemyManager.buildBossArena()` 里八根柱子各造一份
 *    `CylinderGeometry`、一个圆盘各造一份 ⇒ **五座场 = 5 个圆盘 + 40 根柱子 = 45 份几何**，
 *    而它们**一模一样**（半径 22 的圆盘 / 0.4→0.5×4 的柱子）。现在全场共用**两份**。
 * ② **从不被销毁**：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
 *    而 `EnemyManager` 与 `GroundHazards` 此前**没有** `dispose()` ⇒ 它们从不被收编 ⇒
 *    `Game.dispose()` 走完，它们造的那些几何与材质**一份都不还**。
 *
 * ## 哪一份材质不能共享
 *
 * **场的地面材质逐场一份** —— 颜色不同（那是它认哪一只 Boss 的标记）；
 * **柱子的材质全场一份**（颜色一样）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EnemyManager } from '../src/combat/EnemyManager.js';

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

const 造管理器 = () => {
  const scene = new THREE.Scene();
  const mgr = new EnemyManager(scene, { getGroundHeight: () => 0 }, null);
  return { mgr, scene };
};

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 五座场共用两份几何', () => {
  it('五座场只造两份几何（改前是 5 个圆盘 + 40 根柱子 = 45 份）', () => {
    const { seen, 还原 } = 开监视器();
    const { mgr } = 造管理器();
    for (let i = 0; i < 5; i++) mgr.buildBossArena({ x: i * 100, z: 0 }, 0x442244 + i);
    还原();
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 五座场应当只共用两份`).toBe(2);
  });

  it('材质六份：地面逐场一份（五座）+ 柱子全场一份', () => {
    const { seen, 还原 } = 开监视器();
    const { mgr } = 造管理器();
    for (let i = 0; i < 5; i++) mgr.buildBossArena({ x: i * 100, z: 0 }, 0x442244 + i);
    还原();
    expect(seen.materials.size, `材质造了 ${seen.materials.size} 份 —— 应当是 5 + 1 = 6`).toBe(6);
  });

  it('那三份共用资源带共享标记（它们不属于任何**一棵**子树 ⇒ 由管理器自己释放一次）', () => {
    const { mgr } = 造管理器();
    expect(mgr._场圆盘几何.userData.shared, '圆盘几何没标共享 ⇒ 五座场的子树释放器会各释放一次').toBe(true);
    expect(mgr._场柱几何.userData.shared, '柱子几何没标共享').toBe(true);
    expect(mgr._场柱材质.userData.shared, '柱子材质没标共享').toBe(true);
  });
});

describe('② 销毁路径真的释放', () => {
  it('`dispose()` 把五座场与危险区都摘了，场景里什么都不剩', () => {
    const { mgr, scene } = 造管理器();
    for (let i = 0; i < 5; i++) mgr.buildBossArena({ x: i * 100, z: 0 }, 0x442244 + i);
    expect(scene.children.length, '场没建起来').toBeGreaterThan(5);
    mgr.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着场与危险区').toBe(0);
  });

  it('几何与材质都释放过（不是"摘掉了就当释放了"）', () => {
    const { disposes, 还原 } = 开监视器();
    const { mgr } = 造管理器();
    for (let i = 0; i < 5; i++) mgr.buildBossArena({ x: i * 100, z: 0 }, 0x442244 + i);
    expect(disposes.geometries, '造的时候就不该释放').toBe(0);
    mgr.dispose();
    还原();
    expect(disposes.geometries, '几何没释放').toBeGreaterThan(0);
    expect(disposes.materials, '材质没释放').toBeGreaterThan(0);
  });

  it('危险区（圈）是另一个属主，它自己拆', () => {
    const { mgr } = 造管理器();
    expect(typeof mgr.hazards.dispose, '危险区没有 dispose()').toBe('function');
    expect(typeof mgr.dispose, '管理器没有 dispose()').toBe('function');
  });
});

describe('③ 它在拆卸登记表里', () => {
  it('`Game` 收编了它（收编了，`Game.dispose()` 才会走它）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编敌人管理器').toContain("_adopt('combat/EnemyManager'");
  });
});
