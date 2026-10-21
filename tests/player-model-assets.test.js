/**
 * 玩家那一具模型与控制器的销毁路径（W-C1 切片3j）。
 *
 * ## 这一片补的是什么
 *
 * `Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），而这一族**两处**没有：
 *
 * - `CharacterModel`（玩家的模型 + 动画混放器）
 * - `PlayerController`（玩家控制器）
 *
 * ⇒ `Game.dispose()` 走完，玩家造的资源（模型 / 剑 / 混放器）**一份都不还**。
 *
 * ## 归属的那条口径
 *
 * **剑挂在模型的视觉根上** ⇒ 剑的几何与材质在 `CharacterModel` 那一组里
 * ⇒ 由 `CharacterModel.dispose()` 释放，控制器**不重复一遍** ✓。
 *
 * ## 为什么收编控制器是安全的
 *
 * 它**自己没有监听**（它读输入设备，不订阅事件）⇒ 收编它不会漏掉解绑 ✓
 * —— 这一条由门禁按源码核对（不是"应该没有"）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CharacterModel } from '../src/player/CharacterModel.js';

const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 模型自己拆自己那份', () => {
  it('`dispose()` 释放那一组的几何与材质', () => {
    const 计数 = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { 计数.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { 计数.mat += 1; });
    const model = new CharacterModel();
    // 造一件挂上去的东西（真模型要 GLB，合成场景里造一件同形的）
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 8, 16), new THREE.MeshStandardMaterial());
    model.group.add(mesh);
    expect(计数.geo, '造的时候就不该释放').toBe(0);
    model.dispose();
    expect(计数.geo, '几何没释放').toBe(1);
    expect(计数.mat, '材质没释放').toBe(1);
    expect(model.group.children.length, 'dispose 之后那一组还挂着节点').toBe(0);
  });

  it('它把混放器的根从缓存里摘掉（混放器不会一直抓着那一棵根）', () => {
    const model = new CharacterModel();
    const 根 = new THREE.Group();
    const mixer = new THREE.AnimationMixer(根);
    model.mixer = mixer;
    model.modelRoot = 根;
    model.dispose();
    expect(model.mixer, '混放器还留着').toBe(null);
    expect(model.modelRoot, '模型根还留着').toBe(null);
  });
});

describe('② 控制器：拆适配器与模型，剑归模型那一组', () => {
  it('`PlayerController` 有 `dispose()`，且它拆掉适配器与模型', () => {
    const 源 = 读('src/player/PlayerController.js');
    expect(源, '控制器没有 dispose()').toMatch(/^\s{2}dispose\s*\(/m);
    expect(源, '控制器没有拆动画适配器').toContain('this.animAdapter?.dispose?.()');
    expect(源, '控制器没有拆那具模型').toContain('this.characterModel?.dispose?.()');
  });

  it('它**没有释放**剑的几何与材质（剑在模型那一组里 —— 释放两遍就错了）', () => {
    const 源 = 读('src/player/PlayerController.js');
    const 断 = 源.slice(源.indexOf('  dispose() {'));
    expect(断, '控制器的 dispose 里不该释放几何与材质 —— 归模型那一组释放').not.toContain('material?.dispose');
    expect(断, '控制器的 dispose 里不该释放几何 —— 归模型那一组释放').not.toContain('geometry?.dispose');
  });

  it('它**自己没有监听**（收编它不会漏掉解绑）', () => {
    const 源 = 读('src/player/PlayerController.js');
    expect(源, '控制器订阅了事件 —— 收编它就得有一份解绑清单').not.toMatch(/addEventListener\(/);
    expect(源, '控制器走了事件总线 —— 收编它就得有一份解绑清单').not.toMatch(/\bgameOn\(/);
  });
});

describe('③ 两处都在拆卸登记表里', () => {
  it('`Game` 收编了它们（收编了，`Game.dispose()` 才会走它们）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编玩家控制器').toContain("_adopt('player/PlayerController'");
  });
});
