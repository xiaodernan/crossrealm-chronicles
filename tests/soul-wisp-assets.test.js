/**
 * 魂火层的资源账（W-C1 切片3a）—— 十二枚魂火共用**两份几何**，且有销毁路径。
 *
 * ## 这一片修的是什么
 *
 * ① **几何各造各的**：`build()` 在循环里 `new THREE.SphereGeometry(...)` 两次 ⇒
 * 十二枚魂火 = **24 份几何**，而它们**长得一模一样**（本体 / 光晕），也永远不会被改
 * （变的只有颜色与透明度 —— 那两样在**材质**上）。共享之后全局只有**两份**。
 *
 * ② **从不销毁**：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
 * 而这一层此前没有 `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
 * 它造的那 24 份几何与 24 份材质**一份都不还**。
 *
 * ## 三条判据各有一种死法
 *
 * 1. **只造两份几何** —— 改回各造各的 ⇒ 24 份，门禁当场红。
 * 2. **材质逐枚一份** —— 追逐时本体要转金色、光晕要脉动；共用一份材质就是
 *    "一枚转金色，全场都转"（所以**不能**共享材质）。
 * 3. **`dispose()` 真的释放** —— 场景清空、几何与材质都 `dispose` 过。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SoulWispManager } from '../src/world/SoulWispManager.js';
import { WISP_SPOTS } from '../src/content/wispSpots.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const 读 = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

/** 记下"进了场景图"的东西：几何与材质各一份 uuid 集 */
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

function 造魂火层() {
  const scene = new THREE.Scene();
  const world = { getGroundHeight: () => 0 };
  const stats = { addSouls: () => {} };
  const dialog = { toast: () => {} };
  const mgr = new SoulWispManager(scene, world, stats, dialog, {});
  return { mgr, scene };
}

beforeEach(() => installWindowShim());
afterEach(() => vi.restoreAllMocks());

describe('① 十二枚魂火共用两份几何', () => {
  it('全场只造两份几何（改前是十二枚 × 两份 = 24 份）', () => {
    const { seen, 还原 } = 开监视器();
    const { mgr } = 造魂火层();
    还原();
    expect(WISP_SPOTS.length, '出生点表空了 —— 这一条会空转').toBeGreaterThan(8);
    expect(seen.geometries.size, `几何造了 ${seen.geometries.size} 份 —— 十二枚魂火应当只共用两份`).toBe(2);
    expect(mgr.wisps.length).toBe(WISP_SPOTS.length);
  });

  it('材质逐枚一份（追逐时各自变色，共用就是"一枚转金色，全场都转"）', () => {
    const { seen, 还原 } = 开监视器();
    const { mgr } = 造魂火层();
    还原();
    // 每枚魂火两份材质（本体 + 光晕）—— 两份都要**逐枚独立**
    expect(seen.materials.size, `材质造了 ${seen.materials.size} 份`).toBe(WISP_SPOTS.length * 2);
    // 反面证据：它们**确实不共用** —— 两枚魂火的本体材质不是同一份
    const 本体材质 = mgr.wisps.map((w) => w.mesh.children[1].material);
    expect(new Set(本体材质).size, '本体材质被共用了 —— 追逐时一枚转金色会带着全场').toBe(本体材质.length);
  });
});

describe('② 销毁路径真的释放', () => {
  it('`dispose()` 把场景清空，几何与材质都释放过', () => {
    const { disposes, 还原 } = 开监视器();
    const { mgr, scene } = 造魂火层();
    const 造完 = { 几何: disposes.geometries, 材质: disposes.materials };
    expect(造完.几何, '造的时候就不该释放').toBe(0);
    mgr.dispose();
    还原();
    expect(scene.children.length, 'dispose 之后场景里还留着魂火').toBe(0);
    expect(disposes.geometries, '共享几何没释放').toBe(2);
    expect(disposes.materials, '逐枚材质没释放').toBe(WISP_SPOTS.length * 2);
  });

  it('它有 `dispose()`（`Game._adopt` 拒绝没有销毁路径的子系统 —— 这一条是那道防线的前提）', () => {
    const { mgr } = 造魂火层();
    expect(typeof mgr.dispose, '魂火层没有 dispose() ⇒ Game 不敢收编它 ⇒ 它造的资源永远不还').toBe('function');
  });
});

describe('③ 它在拆卸登记表里', () => {
  it('`Game` 收编了它（收编了，`Game.dispose()` 才会走它）', () => {
    const src = 读('src/core/Game.js');
    expect(src, 'Game 没有收编魂火层').toContain("_adopt('world/SoulWispManager'");
  });
});
