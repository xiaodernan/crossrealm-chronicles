/**
 * 子树释放器（W-C1 切片3e）—— 一棵子树拆干净，**共享库的资源不碰**。
 *
 * ## 这一片补的是什么
 *
 * 「谁造的资源谁释放」这条纪律在动手前只能靠**逐个子系统手写** `dispose()` 兑现 ——
 * 而手写就会写出四十几份形状各异的遍历。这里收成**一个**释放器
 * （`engine/releaseSubtree.js`），三个世界系统先用它。
 *
 * ## 最要紧的一条：共享库的资源不许被释放
 *
 * **共享库造出来的资源是进程生命周期的** —— 它们在别的系统里也用着，
 * 释放了就等于把别人的东西砸了（症状是"某个还在用的模型忽然没了纹理"）。
 *
 * 归属的判据是 `userData.shared` 这个**标记**（不是一个库私有的集合）——
 * 这样新增共享库时只要照这个标记走，释放器就认得它，不必再改释放器。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { releaseSubtree, isSharedResource } from '../src/engine/releaseSubtree.js';
import { WeatherSystem } from '../src/world/WeatherSystem.js';
import { BossBeacons } from '../src/world/BossBeacons.js';
import { WorldEffects } from '../src/world/WorldEffects.js';

const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  // 信标标签是 `CSS2DObject`（HTML 标签）—— 它需要一个能造元素的 document
  globalThis.document = {
    createElement: () => ({
      className: '', innerHTML: '', style: {},
      setAttribute: () => {}, removeAttribute: () => {}, appendChild: () => {},
      // 信标标签要把语言键存下来（W-D2 切片33），于是要能问出里面那个 <span>。
      // 真 DOM 元素本来就有这一族方法；这里测的是释放器，标签解析不在本题里，
      // 给一个"没有 span"的诚实答案就够 —— 返回 null 时重算入口会跳过它。
      querySelector: () => null, querySelectorAll: () => [],
    }),
  };
});
afterEach(() => vi.restoreAllMocks());

describe('① 释放器本身', () => {
  it('一棵子树拆干净：几何与材质都释放了，节点也摘下来了', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    const group = new THREE.Group();
    group.add(mesh);

    const 释放计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (...a) {
      释放计数.geo += 1;
    });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (...a) {
      释放计数.mat += 1;
    });

    const 账 = releaseSubtree(group);
    expect(释放计数.geo, '几何没释放').toBe(1);
    expect(释放计数.mat, '材质没释放').toBe(1);
    expect(账.geometries).toBe(1);
    expect(账.materials).toBe(1);
    expect(group.children.length, '子树摘下来了却还挂着节点').toBe(0);
  });

  it('**带共享标记的资源不许被释放**（共享库是进程生命周期的 —— 释放了就砸了别人的东西）', () => {
    const 共享几何 = new THREE.BoxGeometry(1, 1, 1);
    共享几何.userData.shared = true;
    const 共享材质 = new THREE.MeshStandardMaterial();
    共享材质.userData.shared = true;
    const 自己的几何 = new THREE.BoxGeometry(1, 1, 1);
    const 自己的材质 = new THREE.MeshStandardMaterial();
    const group = new THREE.Group();
    group.add(new THREE.Mesh(共享几何, 共享材质));
    group.add(new THREE.Mesh(自己的几何, 自己的材质));

    const 释放计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (...a) {
      释放计数.geo += 1;
    });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (...a) {
      释放计数.mat += 1;
    });

    const 账 = releaseSubtree(group);
    expect(释放计数.geo, `几何释放了 ${释放计数.geo} 次 —— 共享的那一份被砸了`).toBe(1);
    expect(释放计数.mat, `材质释放了 ${释放计数.mat} 次 —— 共享的那一份被砸了`).toBe(1);
    expect(账.geometries).toBe(1);
    expect(账.materials).toBe(1);
    expect(isSharedResource(共享几何), '共享几何没被认出来').toBe(true);
    expect(isSharedResource(自己的几何), '自己的几何被误认成共享的').toBe(false);
  });

  it('共享库都带上这个标记（不然释放器认不出它们）', () => {
    // 副本共享库（早就是这么标的）
    const 副本源 = 读('src/world/dungeonAssets.js');
    expect(副本源).toContain('userData.shared = true');
    // 贴图库（W-C1 切片3e 起跟上同一口径）
    const 贴图源 = 读('src/assets/TextureLibrary.js');
    expect(贴图源, 'TextureLibrary.sharedMaterial 没有标共享 —— 释放器会把它砸了').toContain('userData.shared = true');
  });
});

describe('② 三个世界系统都拆得干净', () => {
  it('天气层：场景清空，粒子与涟漪的几何材质都释放过', () => {
    const 释放计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { 释放计数.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { 释放计数.mat += 1; });
    const scene = new THREE.Scene();
    const weather = new WeatherSystem(scene, { getGroundHeight: () => 0 }, null);
    weather._spawnSplash(0, 0, 0);
    expect(释放计数.geo, '造的时候就不该释放').toBe(0);
    weather.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着天气').toBe(0);
    expect(释放计数.geo, '雨雪粒子与涟漪的几何没释放').toBeGreaterThan(0);
    expect(释放计数.mat, '雨雪粒子与涟漪的材质没释放').toBeGreaterThan(0);
  });

  it('Boss 信标：场景清空，五种信标的资源都释放过', () => {
    const 释放计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { 释放计数.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { 释放计数.mat += 1; });
    const scene = new THREE.Scene();
    const beacons = new BossBeacons(scene, { getGroundHeight: () => 0 });
    beacons.build();   // 信标是**按需建**的（构造时一个都没有）—— 不先建一座，拆的时候没东西可拆
    beacons.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着信标').toBe(0);
    expect(释放计数.geo, '信标的几何没释放').toBeGreaterThan(0);
    expect(释放计数.mat, '信标的材质没释放').toBeGreaterThan(0);
  });

  it('世界特效：场景清空，六个特效族的资源都释放过', () => {
    const 释放计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { 释放计数.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { 释放计数.mat += 1; });
    const scene = new THREE.Scene();
    const fx = new WorldEffects(scene);
    fx.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着特效').toBe(0);
    expect(释放计数.geo, '特效的几何没释放').toBeGreaterThan(0);
    expect(释放计数.mat, '特效的材质没释放').toBeGreaterThan(0);
  });

  it('三处都有 `dispose()`（`Game._adopt` 拒绝没有销毁路径的子系统 —— 这是那道防线的前提）', () => {
    const scene = new THREE.Scene();
    const world = { getGroundHeight: () => 0 };
    expect(typeof new WeatherSystem(scene, world, null).dispose, '天气层没有 dispose()').toBe('function');
    expect(typeof new BossBeacons(scene, world).dispose, '信标层没有 dispose()').toBe('function');
    expect(typeof new WorldEffects(scene).dispose, '特效层没有 dispose()').toBe('function');
  });
});

describe('③ 三处都在拆卸登记表里', () => {
  it('`Game` 收编了它们（收编了，`Game.dispose()` 才会走它们）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编天气层').toContain("_adopt('world/WeatherSystem'");
    expect(src, 'Game 没有收编信标层').toContain("_adopt('world/BossBeacons'");
    expect(src, 'Game 没有收编特效层').toContain("_adopt('world/WorldEffects'");
  });
});
