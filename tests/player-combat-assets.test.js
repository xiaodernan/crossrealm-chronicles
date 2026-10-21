/**
 * 玩家侧那三件的资源账（W-C1 切片3h）—— 弹体 / 法术特效 / 武器：几何收成共享，且有销毁路径。
 *
 * ## 这一片补的是什么
 *
 * ① **弹体各造各的**：`ProjectileManager.spawn()` 每发造一份 `SphereGeometry` ⇒
 *    一次齐射就是 N 份几何（一场战斗下来成百上千份），而它们**一模一样**。
 * ② **法术弹各造各的**：`SpellSystem.castBolt()` 每次施法造一份 ⇒ 同样成百上千份，
 *    而它们只有**蓄力 / 不蓄力两种形状**。
 * ③ **三处都从不被销毁**：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
 *    它们没有 ⇒ 从不被收编 ⇒ `Game.dispose()` 走完，造的那些几何与材质**一份都不还**。
 *
 * ## 哪一份不能共享
 *
 * **材质逐份一份** —— 弹体的颜色按法术走、法术弹的颜色也按法术走 ⇒ 共用会串色。
 * **领域环的几何**按半径走（每次都不一样）⇒ 那一族仍逐个造、也逐个释放 ✓。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectileManager } from '../src/combat/ProjectileManager.js';
import { SpellSystem } from '../src/combat/SpellSystem.js';

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

const 目标 = () => new THREE.Vector3(0, 0, 10);

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 弹体：一份共享几何', () => {
  it('二十发弹只造一份几何（改前是二十份）', () => {
    const { seen, 还原 } = 开监视器();
    const scene = new THREE.Scene();
    const proj = new ProjectileManager(scene, {});
    for (let i = 0; i < 20; i++) proj.spawn(new THREE.Vector3(0, 0, 0), 目标(), 1);
    还原();
    expect(proj.count(), '弹没生出来').toBe(20);
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 二十发弹应当只共用一份`).toBe(1);
    expect(seen.materials.size, '材质逐发一份（颜色按法术走）—— 这一条钉住它没被合并').toBe(20);
  });

  it('回收时不释放那份共享几何（释放了，下一发弹就没形状了）', () => {
    const disposes = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { disposes.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { disposes.mat += 1; });
    const scene = new THREE.Scene();
    const proj = new ProjectileManager(scene, {});
    proj.spawn(new THREE.Vector3(0, 0, 0), 目标(), 1);
    proj._recycle(0);
    expect(disposes.geo, '回收把共享几何释放了 —— 下一发弹就没形状了').toBe(0);
    expect(disposes.mat, '材质没释放').toBe(1);
  });

  it('`dispose()` 把在场的弹都摘掉，逐发释放材质，再释放那份共享几何', () => {
    const disposes = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { disposes.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { disposes.mat += 1; });
    const scene = new THREE.Scene();
    const proj = new ProjectileManager(scene, {});
    for (let i = 0; i < 3; i++) proj.spawn(new THREE.Vector3(0, 0, 0), 目标(), 1);
    proj.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着弹').toBe(0);
    expect(disposes.mat, '三份材质没释放').toBe(3);
    expect(disposes.geo, '那份共享几何没释放').toBe(1);
  });
});

describe('② 法术特效：两份共享几何', () => {
  const 造法术 = () => {
    const scene = new THREE.Scene();
    const player = { position: new THREE.Vector3(0, 0, 0), getCombatForwardXZ: () => ({ x: 0, z: 1 }) };
    const spells = new SpellSystem(scene, player, null, null, null, {}, {});
    return { scene, spells };
  };
  const 法术 = { id: 'bolt', color: 0xaa66ff, damage: 10, chargeDamage: 20, radius: 3, chargeRadius: 5, posture: 1, chargePosture: 2 };

  it('普通弹与蓄力弹各一份几何（改前是每次施法一份）', () => {
    const { seen, 还原 } = 开监视器();
    const { spells } = 造法术();
    for (let i = 0; i < 5; i++) spells.castBolt(法术, false);
    for (let i = 0; i < 5; i++) spells.castBolt(法术, true);
    还原();
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 十次施法应当只有两份`).toBe(2);
  });

  it('`dispose()` 把在场的那一组摘掉，释放那两份共享几何', () => {
    const disposes = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { disposes.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { disposes.mat += 1; });
    const { scene, spells } = 造法术();
    spells.castBolt(法术, false);
    spells.castBolt(法术, true);
    spells.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着法术特效').toBe(0);
    expect(disposes.geo, '那两份共享几何没释放').toBe(2);
    expect(disposes.mat, '逐发材质没释放').toBe(2);
  });
});

describe('③ 三处都在拆卸登记表里', () => {
  it('`Game` 收编了它们（收编了，`Game.dispose()` 才会走它们）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编弹体层').toContain("_adopt('combat/ProjectileManager'");
    expect(src, 'Game 没有收编法术层').toContain("_adopt('combat/SpellSystem'");
    expect(src, 'Game 没有收编武器层').toContain("_adopt('combat/WeaponSystem'");
  });

  it('三处都有 `dispose()`（`Game._adopt` 拒绝没有销毁路径的子系统 —— 这是那道防线的前提）', () => {
    const scene = new THREE.Scene();
    const proj = new ProjectileManager(scene, {});
    const player = { position: new THREE.Vector3(0, 0, 0), getCombatForwardXZ: () => ({ x: 0, z: 1 }) };
    const spells = new SpellSystem(scene, player, null, null, null, {}, {});
    expect(typeof proj.dispose, '弹体层没有 dispose()').toBe('function');
    expect(typeof spells.dispose, '法术层没有 dispose()').toBe('function');
    const 武器源 = 读('src/combat/WeaponSystem.js');
    expect(武器源, '武器层没有 dispose()').toMatch(/^\s{2}dispose\s*\(/m);
  });
});
