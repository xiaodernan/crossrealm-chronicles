/**
 * 掉落层的资源账（W-C1 切片3b）—— 三份共享几何 + 每格三份材质，且有销毁路径。
 *
 * ## 这一片修的是什么
 *
 * `Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），而掉落层此前
 * **没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，它造的那些几何与材质
 * **一份都不还**。
 *
 * ## 三条判据各有一种死法
 *
 * 1. **`dispose()` 把场景清空** —— 材质与三份共享几何都 `dispose` 过（池子里的也算）。
 * 2. **材质逐格释放**（每格三份：本体 / 环 / 柱 —— 档位色写在材质上，共用会串色）。
 * 3. **它在拆卸登记表里** —— `Game` 收编了它（收编了，`Game.dispose()` 才会走它）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LootSystem } from '../src/game/LootSystem.js';

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

function 造掉落层() {
  const scene = new THREE.Scene();
  const stats = { addSouls: () => {} };
  // rng 恒返回 1 ⇒ 那一掷永不命中 ⇒ 只掉魂，不掉装备（装备那一份要真实例，另测）
  const loot = new LootSystem(scene, stats, { rng: () => 1 });
  return { loot, scene };
}

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 掉落层的几何账没变（切片3b 只补销毁路径）', () => {
  it('三份共享几何：本体 / 地面环 / 高亮光柱', () => {
    const { seen, 还原 } = 开监视器();
    const { loot } = 造掉落层();
    for (let i = 0; i < 5; i++) loot.spawnKill({ x: i, y: 0, z: 0 }, 3, 'normal', 'fantasy');
    还原();
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 应当只有三份共享`).toBe(3);
  });

  it('材质逐格三份（档位色写在材质上，共用会串色）', () => {
    const { seen, 还原 } = 开监视器();
    const { loot } = 造掉落层();
    for (let i = 0; i < 5; i++) loot.spawnKill({ x: i, y: 0, z: 0 }, 3, 'normal', 'fantasy');
    还原();
    expect(seen.materials.size, `材质造了 ${seen.materials.size} 份 —— 五格应当十五份`).toBe(15);
  });
});

describe('② 销毁路径真的释放', () => {
  it('`dispose()` 把场景清空，三份几何与每格三份材质都释放过', () => {
    const { disposes, 还原 } = 开监视器();
    const { loot, scene } = 造掉落层();
    for (let i = 0; i < 4; i++) loot.spawnKill({ x: i, y: 0, z: 0 }, 3, 'normal', 'fantasy');
    expect(disposes.geometries, '造的时候就不该释放').toBe(0);
    loot.dispose();
    还原();
    expect(scene.children.length, 'dispose 之后场景里还留着掉落物').toBe(0);
    expect(disposes.geometries, '三份共享几何没释放').toBe(3);
    expect(disposes.materials, '每格三份材质没释放').toBe(4 * 3);
  });

  it('它有 `dispose()`（`Game._adopt` 拒绝没有销毁路径的子系统 —— 这一条是那道防线的前提）', () => {
    const { loot } = 造掉落层();
    expect(typeof loot.dispose, '掉落层没有 dispose() ⇒ Game 不敢收编它 ⇒ 它造的资源永远不还').toBe('function');
  });
});

describe('③ 它在拆卸登记表里', () => {
  it('`Game` 收编了它（收编了，`Game.dispose()` 才会走它）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编掉落层').toContain("_adopt('game/LootSystem'");
  });
});
