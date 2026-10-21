/**
 * 世界道具的资源账（W-C1 切片3d）—— 宝箱与 NPC 共用几何，且两条销毁路径都真的释放。
 *
 * ## 这一片修的是什么
 *
 * ① **宝箱各造各的**：`CollectibleManager.build()` 在循环里 `new THREE.BoxGeometry(...)` 两次
 *    ⇒ **八个宝箱 = 16 份几何**，而它们**长得一模一样**（箱体 / 箱盖）。
 * ② **NPC 各造各的**：`NPCManager.build()` 同样在循环里造两份几何 ⇒ **三个 NPC = 6 份几何**，
 *    连标记球那枚人人一样的材质也是各造一份。
 * ③ **两处都从不被销毁**：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
 *    （"假装收编"的防线），它们没有 ⇒ 从不被收编 ⇒ `Game.dispose()` 走完，
 *    那些几何与材质**一份都不还**。
 *
 * ## 哪一份材质**不能**共享
 *
 * **NPC 的身体材质** —— 颜色是每个人的身份（`data.color`），逐个一份；
 * 标记球那份（`0x44ffaa`）人人一样 ⇒ 共用。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CollectibleManager } from '../src/world/CollectibleManager.js';
import { NPCManager } from '../src/world/NPCManager.js';

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

const 造宝箱 = () => {
  const scene = new THREE.Scene();
  const stats = { chestsOpened: new Set(), addSouls: () => {} };
  const mgr = new CollectibleManager(scene, { getGroundHeight: () => 0 }, stats, { toast: () => {} });
  return { mgr, scene };
};

const 造NPC = () => {
  const scene = new THREE.Scene();
  const mgr = new NPCManager(scene, { getGroundHeight: () => 0 }, { show: () => {} }, null);
  return { mgr, scene };
};

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 宝箱：八个共用两份几何与两份材质', () => {
  it('几何只造两份（改前是八个 × 两份 = 16 份）', () => {
    const { seen, 还原 } = 开监视器();
    const { mgr } = 造宝箱();
    还原();
    expect(mgr.chests.length, '宝箱不是八个 —— 这一条会空转').toBe(8);
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 八个宝箱应当只共用两份`).toBe(2);
  });

  it('材质两份（改前就已经是共用的 —— 这一条钉住它没退回去）', () => {
    const { seen, 还原 } = 开监视器();
    造宝箱();
    还原();
    expect(seen.materials.size, `材质造了 ${seen.materials.size} 份`).toBe(2);
  });

  it('`dispose()` 把场景清空，四份资源都释放过', () => {
    const { disposes, 还原 } = 开监视器();
    const { mgr, scene } = 造宝箱();
    expect(disposes.geometries, '造的时候就不该释放').toBe(0);
    mgr.dispose();
    还原();
    expect(scene.children.length, 'dispose 之后场景里还留着宝箱').toBe(0);
    expect(disposes.geometries, '两份几何没释放').toBe(2);
    expect(disposes.materials, '两份材质没释放').toBe(2);
  });
});

describe('② NPC：三个共用两份几何，材质逐人一份 + 标记共用', () => {
  it('几何只造两份（改前是三个 × 两份 = 6 份）', () => {
    const { seen, 还原 } = 开监视器();
    const { mgr } = 造NPC();
    还原();
    expect(mgr.npcs.length, 'NPC 不是三个 —— 这一条会空转').toBe(3);
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 三个 NPC 应当只共用两份`).toBe(2);
  });

  it('材质四份（三份身体逐人一份 + 一份标记共用）', () => {
    const { seen, 还原 } = 开监视器();
    造NPC();
    还原();
    expect(seen.materials.size, `材质造了 ${seen.materials.size} 份 —— 应当是 3 + 1 = 4`).toBe(4);
  });

  it('身体的材质逐人一份（颜色是每个人的身份 —— 共用就串色了）', () => {
    const { mgr } = 造NPC();
    const 身体材质 = mgr.npcs.map((n) => n.material);
    expect(new Set(身体材质).size, '身体材质被共用了 —— 三个人会穿同一身颜色').toBe(身体材质.length);
  });

  it('`dispose()` 把场景清空，五份资源都释放过', () => {
    const { disposes, 还原 } = 开监视器();
    const { mgr, scene } = 造NPC();
    mgr.dispose();
    还原();
    expect(scene.children.length, 'dispose 之后场景里还留着 NPC').toBe(0);
    expect(disposes.geometries, '两份几何没释放').toBe(2);
    expect(disposes.materials, '四份材质没释放').toBe(4);
  });
});

describe('③ 两处都在拆卸登记表里', () => {
  it('`Game` 收编了它们（收编了，`Game.dispose()` 才会走它们）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编宝箱层').toContain("_adopt('world/CollectibleManager'");
    expect(src, 'Game 没有收编 NPC 层').toContain("_adopt('world/NPCManager'");
  });

  it('两处都有 `dispose()`（`Game._adopt` 拒绝没有销毁路径的子系统 —— 这是那道防线的前提）', () => {
    const { mgr: 宝箱 } = 造宝箱();
    const { mgr: NPC } = 造NPC();
    expect(typeof 宝箱.dispose, '宝箱层没有 dispose()').toBe('function');
    expect(typeof NPC.dispose, 'NPC 层没有 dispose()').toBe('function');
  });
});
