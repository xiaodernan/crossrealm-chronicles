/**
 * 落地的迸发（W-B8 切片7）—— 装备落在地上那一下的碎片。
 *
 * ## 这一片补的是什么
 *
 * 掉落物此前只有**静态**的三件套（本体 + 地面环 + 高亮光柱）—— 装备落在地上是"啪"地一声
 * 出现，没有"落地"那一下。W-B8 的余项写着"掉落表现的粒子"。
 *
 * ## 三条判据各有一种死法
 *
 * 1. **碎片确实迸发**（只给装备；魂落地不闪 —— 一次普通击杀都闪一下，画面会一直在闪，
 *    闪到最后没人看见"那件是史诗的"）
 * 2. **碎片不新增几何** —— 复用本体那份八面体 ⇒ 资源账里"三份共享几何"那句话仍然成立
 * 3. **资源数不随掉落数增长** —— 碎片池是**固定大小**的（并发时重开最老的那一片），
 *    所以"跑 200 件与跑 500 件见过同样多的资源"那条依然成立
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { LootSystem } from '../src/game/LootSystem.js';
import { rollGear } from '../src/content/gear.js';

const 造掉落层 = (rng = () => 1) => {
  const scene = new THREE.Scene();
  const stats = { addSouls: () => {}, gear: null };
  const loot = new LootSystem(scene, stats, { rng });
  return { loot, scene, stats };
};

/** 真造一件装备（走内容层那份名册，不手搓一个假对象） */
const 一件装备 = () => {
  const g = rollGear(() => 0.01, 'fantasy');
  expect(g, '名册没抽出装备来').toBeTruthy();
  return g;
};

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 装备落地会迸发，魂落地不闪', () => {
  it('装备落地 ⇒ 碎片散出来（场景里多了碎片）', () => {
    const { loot, scene } = 造掉落层();
    loot.spawnGear({ x: 1, y: 0, z: 2 }, 一件装备());
    // 一件掉落 = 本体 + 环 + 柱（本体是环与柱的父节点，场景里只挂一个） + 迸发的碎片
    expect(scene.children.length, '装备落地没有碎片').toBeGreaterThan(1);
    const 碎片 = scene.children.filter((c) => c.isMesh && c.material?.transparent && c.material?.opacity <= 1);
    expect(碎片.length, '迸发的碎片一片都没有').toBeGreaterThan(0);
  });

  it('魂落地**不**迸发（普通击杀都闪一下的话，画面会一直在闪）', () => {
    const { loot, scene } = 造掉落层();
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 3, 'normal', 'fantasy');
    expect(scene.children.length, '魂落地不该有碎片').toBe(1);   // 只有本体（环与柱是它的孩子）
  });

  it('碎片会散开、落下、淡出，最后回池（不是一次性的新资源）', () => {
    const { loot, scene } = 造掉落层();
    loot.spawnGear({ x: 0, y: 0, z: 0 }, 一件装备());
    const 起初 = scene.children.length;
    expect(起初).toBeGreaterThan(1);
    // 走够碎片的一生（0.45 秒）⇒ 碎片全回池，场景回到"只有那件掉落"
    for (let i = 0; i < 40; i++) loot.update(1 / 60, { x: 999, y: 0, z: 999 });
    expect(scene.children.length, '碎片活完了还在场景里').toBe(1);
  });
});

describe('② 碎片不新增几何', () => {
  it('全场还是那三份共享几何（本体 / 环 / 柱）—— 碎片复用本体那份', () => {
    const seen = { geometries: new Set(), materials: new Set() };
    const origAdd = THREE.Object3D.prototype.add;
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (...children) {
      for (const c of children) {
        if (c.geometry) seen.geometries.add(c.geometry.uuid);
        const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
        for (const m of mats) seen.materials.add(m.uuid);
      }
      return origAdd.apply(this, children);
    });
    const { loot } = 造掉落层();
    loot.spawnGear({ x: 0, y: 0, z: 0 }, 一件装备());
    vi.restoreAllMocks();
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 碎片应当复用本体那份`).toBe(3);
  });
});

describe('③ 资源数不随掉落数增长', () => {
  it('碎片总数封顶在池的大小（200 件与 500 件见过同样多的碎片）', () => {
    const 数 = (总) => {
      const { loot } = 造掉落层();
      const 装备 = 一件装备();
      for (let i = 0; i < 总; i++) {
        loot.spawnGear({ x: i, y: 0, z: 0 }, 装备);
        // 走够碎片的一生 ⇒ 碎片回池，下一次迸发从池里取（而不是临时再造）
        loot.update(1, { x: 999, y: 0, z: 999 });
      }
      const 碎片 = new Set([...loot._碎片活, ...loot._碎片池].map((片) => 片.mesh.material.uuid));
      return { 碎片数: 碎片.size, 总数: loot._碎片总数 };
    };
    const 少 = 数(200);
    const 多 = 数(500);
    expect(多.碎片数, `碎片数随掉落数长了（${少.碎片数} → ${多.碎片数}）`).toBe(少.碎片数);
    expect(少.总数, '碎片总数没有封顶').toBeLessThanOrEqual(16);
    expect(少.总数, '碎片一片都没造出来').toBeGreaterThan(0);
    expect(多.总数, '碎片总数随掉落数长了').toBe(少.总数);
  });
});
