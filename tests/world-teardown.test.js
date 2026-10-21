/**
 * 世界的销毁路径（W-C1 切片3f）—— 地形 / 七座区 / 装饰层 / 枢纽组，一棵树一棵树拆干净。
 *
 * ## 这一片补的是什么
 *
 * `Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
 * 而 `WorldManager` 此前**没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
 * **整个世界**造的资源（地表 / 崖壁 / 七座区的树石桥塔 / 致敬层那四族增强器挂在区上的装饰）
 * **一份都不还**。
 *
 * ## 归属的两条
 *
 * - **致敬层那四个增强器**（`world/PopCultureZoneEnhancer*`）是**函数**，它们的网格挂在
 *   **区的那一组**上 ⇒ 位面的 `dispose()` 一并释放 ✓（`BaseZone.dispose()` 继承给七座区）；
 * - **四座内部空间**（神堂 / 树洞 / 大厅 / 星望塔）的网格同样挂在区的那一组上，
 *   它们自己的 `group` 是空的 ⇒ 不必单独拆。
 *
 * ## 共享库造的资源不碰
 *
 * 树皮的共享材质（`TextureLibrary.sharedMaterial`）带 `userData.shared` 标记 ⇒
 * 释放器跳过它（`engine/releaseSubtree.js`）—— 释放了就等于砸了别人的东西。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldManager } from '../src/world/WorldManager.js';
import { WorldDecorations } from '../src/world/WorldDecorations.js';

const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

beforeEach(() => {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

/** 造一个**真世界**（七座区 + 地形 + 枢纽） */
function 造世界() {
  const scene = new THREE.Scene();
  const world = new WorldManager(scene, { show() {}, toast() {} });
  world.build();
  return { scene, world };
}

describe('① 真世界拆得干净', () => {
  it('`dispose()` 之后场景里什么都不剩（地形 / 七座区 / 枢纽组都摘了）', () => {
    const { scene, world } = 造世界();
    expect(scene.children.length, '真世界都没往场景里放东西 —— 这一条会空转').toBeGreaterThan(5);
    world.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着世界的东西').toBe(0);
  });

  it('几何与材质都释放过（不是"摘掉了就当释放了"）', () => {
    const 计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { 计数.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { 计数.mat += 1; });
    const { world } = 造世界();
    const 造完 = { ...计数 };
    expect(造完.geo, '造的时候就不该释放').toBe(0);
    world.dispose();
    expect(计数.geo, '几何一份都没释放').toBeGreaterThan(10);
    expect(计数.mat, '材质一份都没释放').toBeGreaterThan(10);
  });

  it('七座区共用同一口径（`dispose()` 是继承来的，子类不各写一份）', () => {
    const { world } = 造世界();
    expect(world.zones.length, '不是七座区').toBe(7);
    for (const zone of world.zones) {
      expect(typeof zone.dispose, `${zone.id} 没有 dispose()`).toBe('function');
      // 子类**没有**自己的 dispose ⇒ 走的是基类那一份（一份口径）
      expect(Object.prototype.hasOwnProperty.call(zone.constructor.prototype, 'dispose'),
        `${zone.id} 自己写了一份 dispose() —— 七座区应当共用基类那一份`).toBe(false);
    }
  });
});

describe('② 装饰层也拆得干净', () => {
  it('装饰层的 `dispose()` 把那一组摘下来，材质释放过', () => {
    const { scene, world } = 造世界();
    const 装饰 = new WorldDecorations(scene, world);
    装饰.build();
    const 计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { 计数.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { 计数.mat += 1; });
    装饰.dispose();
    expect(计数.geo, '装饰的几何一份都没释放').toBeGreaterThan(0);
    expect(计数.mat, '装饰的材质一份都没释放').toBeGreaterThan(0);
    expect(装饰.group.children.length, '装饰组摘下来了却还挂着节点').toBe(0);
    expect(scene.children.includes(装饰.group), '装饰组还在场景里').toBe(false);
  });

  it('**共享库造的资源不碰** —— 这条在释放器那一层已有门禁（`tests/subtree-release.test.js`），此处只钉住它对真世界也成立', () => {
    // 树皮那份共享材质要贴图库**就绪**才换上（`applyTreeTextures` 里 `lib.ready` 的那道闸），
    // 合成场景做不到 ⇒ 真世界这一条不硬造。释放器的契约由 `subtree-release.test.js` 钉住：
    // **带 `userData.shared` 标记的资源一律不释放**。
    const src = 读('src/engine/releaseSubtree.js');
    expect(src).toContain('userData?.shared === true');
    expect(src, '释放器没有"跳过共享资源"这一支 —— 共享库的东西会被砸了').toContain('isSharedResource');
  });
});

describe('③ 两处都在拆卸登记表里', () => {
  it('`Game` 收编了它们（收编了，`Game.dispose()` 才会走它们）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编世界').toContain("_adopt('world/WorldManager'");
    expect(src, 'Game 没有收编装饰层').toContain("_adopt('world/WorldDecorations'");
  });
});
