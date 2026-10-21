/**
 * 营火 NPC 一族与两个特效的销毁路径（W-C1 切片3i）。
 *
 * ## 这一片补的是什么
 *
 * `Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线）——
 * 而这一族里**三处**没有：
 *
 * ① `RestCampfireAmbient`（营火边的环境粒子）
 * ② `VoidEcho`（破碎时线的残影）
 * ③ `ChaosLightning`（混沌边境的闪雷）
 *
 * 另有两处**有** `dispose()` 但**只解绑监听**、不管资源：
 * `RestNpcManager`（每个 NPC 的模型）与 `RestNpcAnimDirector`（程序化手势）。
 *
 * ## 归属的那条口径：**容器释放里面的东西**
 *
 * NPC 的网格与营火的环境粒子都**挂在营火那一组上** ⇒ 它们的几何与材质归**容器**
 * （`RestPointManager`）释放；拆卸登记表按**登记的反序**执行 ⇒ 装饰层先拆（东西还挂在
 * 营火上），容器后拆（那时才轮到那些资源）。**在装饰层释放一遍就是释放两遍** ⇒
 * 那一族的 `dispose()` 只做"该自己做的"（解绑监听 / 混放器 `uncacheRoot` / 放下引用）✓。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VoidEcho } from '../src/effects/VoidEcho.js';
import { ChaosLightning } from '../src/effects/ChaosLightning.js';
import { RestCampfireAmbient } from '../src/world/RestCampfireAmbient.js';

const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

beforeEach(() => {
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
});
afterEach(() => vi.restoreAllMocks());

describe('① 残影与闪雷：自己造的资源自己还', () => {
  it('`VoidEcho.dispose()` 摘掉那一组，逐道释放材质，释放那份共享胶囊', () => {
    const disposes = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { disposes.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { disposes.mat += 1; });
    const scene = new THREE.Scene();
    const echo = new VoidEcho(scene);
    echo.spawn(new THREE.Vector3(0, 0, 0), 0);
    expect(scene.children.length, '残影没上场').toBeGreaterThan(0);
    echo.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着残影').toBe(0);
    expect(disposes.geo, '那份共享胶囊没释放').toBe(1);
    expect(disposes.mat, '材质没释放').toBeGreaterThan(0);
  });

  it('`ChaosLightning.dispose()` 摘掉闪灯与雷，释放那条线的几何与材质', () => {
    const disposes = { geo: 0, mat: 0 };
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { disposes.geo += 1; });
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { disposes.mat += 1; });
    const scene = new THREE.Scene();
    const lightning = new ChaosLightning(scene, new THREE.PerspectiveCamera());
    lightning.dispose();
    expect(scene.children.length, 'dispose 之后场景里还留着闪雷').toBe(0);
    expect(disposes.geo, '那条线的几何没释放').toBe(1);
    expect(disposes.mat, '那条线的材质没释放').toBe(1);
  });
});

describe('② 营火环境粒子：归容器释放，自己只放下引用', () => {
  it('它有 `dispose()`（`_adopt` 拒绝没有销毁路径的子系统）', () => {
    const 点 = { id: 'hub', mesh: new THREE.Group() };
    const ambient = new RestCampfireAmbient({ points: [点] });
    expect(typeof ambient.dispose, '营火环境粒子没有 dispose()').toBe('function');
    // 粒子挂在**营火那一组**上 ⇒ 归容器释放
    expect(点.mesh.children.length, '粒子没挂到营火上').toBe(1);
    ambient.dispose();
    expect(ambient.systems.length, 'dispose 之后还留着那些系统的引用').toBe(0);
  });
});

describe('③ NPC 那一族：模型与手势各自拆自己那份', () => {
  it('`RestNpcModel.dispose()` 把混放器从缓存里摘掉', () => {
    const 源 = 读('src/world/RestNpcModel.js');
    expect(源, '模型没有 dispose()').toMatch(/^\s{2}dispose\s*\(/m);
    expect(源, '模型没有 uncacheRoot —— 混放器会一直抓着那一棵根').toContain('uncacheRoot');
  });

  it('`RestNpcManager.dispose()` 会拆每一个模型（不只是解绑监听）', () => {
    const 源 = 读('src/world/RestNpcManager.js');
    expect(源, 'NPC 管理器没有拆模型').toContain('n.model?.dispose?.()');
  });

  it('`RestNpcAnimDirector.dispose()` 会拆每一层的手势', () => {
    const 源 = 读('src/world/RestNpcAnimDirector.js');
    expect(源, '动画导演没有拆手势').toContain('layer.proc?.dispose?.()');
  });

  it('手势与模型**不释放**网格资源（那是容器的事 —— 释放两遍就错了）', () => {
    const 手势源 = 读('src/world/RestNpcProceduralGestures.js');
    const 断 = 手势源.slice(手势源.indexOf('  dispose() {'));
    expect(断, '手势的 dispose 里不该出现 dispose() 调用 —— 网格归容器释放').not.toContain('.dispose?.()');
    const 模型源 = 读('src/world/RestNpcModel.js');
    const 断2 = 模型源.slice(模型源.indexOf('  dispose() {'));
    expect(断2, '模型的 dispose 里不该释放网格资源 —— 归容器释放').not.toContain('material?.dispose');
  });
});

describe('④ 三处都在拆卸登记表里', () => {
  it('`Game` 收编了它们（收编了，`Game.dispose()` 才会走它们）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编营火环境粒子').toContain("_adopt('world/RestCampfireAmbient'");
    expect(src, 'Game 没有收编残影').toContain("_adopt('effects/VoidEcho'");
    expect(src, 'Game 没有收编闪雷').toContain("_adopt('effects/ChaosLightning'");
  });
});
