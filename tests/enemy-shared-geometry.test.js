/**
 * 敌人共享几何的门禁（W-C2 切片2）。
 *
 * ## 修前是什么样子
 *
 * `createMesh` / `_buildHpBar` / `_buildLockMarker` / `_ensureTelegraph` 里的几何全部
 * 每实例新建：64 个敌人 × 每人 5~8 份 ≈ 数百份一模一样的 CapsuleGeometry / PlaneGeometry /
 * RingGeometry —— 真实页面 `renderer.info.memory.geometries` 读到 545 的主体就是它们。
 * 形状只由类型与构造参数决定，与个体无关，所以能共享：全场景每个形状一份。
 *
 * ## 两件必须同时钉住的事
 *
 * 1. **共享要真的发生** —— 两只同类敌人的身体是同一个几何对象，不是"参数相同的两份"；
 *    全类型建一遍，缓存规模有上界（防"共享失效退化回每实例一份"悄悄回归）。
 * 2. **dispose 不许拆共享的** —— 敌人死亡销毁、血条 Billboard 销毁见到 `userData.shared`
 *    必须跳过；否则第一只死掉的敌人会把全场同类敌人的几何拆掉，一起渲染坏。
 *    材质仍每实例一份（受击闪红改自家 emissive），照旧要拆。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Enemy, enemyGeoStats } from '../src/combat/Enemy.js';
import { makeScene, makeWorld, installWindowShim } from './helpers/enemyHarness.js';

installWindowShim();

const mk = (over = {}) => new Enemy(makeScene(), makeWorld(), {
  type: 'soldier', x: 0, z: 0, respawn: false, ...over,
});

/** 一个对象子树里所有用到的几何（去重） */
function geosOf(root) {
  const set = new Set();
  root.traverse((o) => {
    if (o.geometry) set.add(o.geometry);
  });
  return set;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('敌人共享几何（W-C2 切片2）', () => {
  it('两只同类敌人：身体几何是同一份；身体子树总共只有 2 份几何（胶囊 + 头盔）', () => {
    const a = mk();
    const b = mk();
    expect(a.mesh.getObjectByName('body').geometry).toBe(b.mesh.getObjectByName('body').geometry);
    const ga = geosOf(a.mesh);
    expect(ga.size).toBe(2);                          // soldier = 胶囊身体 + 方块头盔
    for (const g of ga) expect(geosOf(b.mesh).has(g), 'b 的几何没有全共享').toBe(true);
  });

  it('不同类型共享同一副身体，类型件各归各的 key（sentinel = 身体 + 炮管/肩甲/核心）', () => {
    const s = mk();
    const g = mk({ type: 'sentinel' });
    expect(s.mesh.getObjectByName('body').geometry).toBe(g.mesh.getObjectByName('body').geometry);
    expect(geosOf(g.mesh).size).toBe(4);              // sentinel 的类型件最多：3 件
    expect(geosOf(s.mesh).size).toBe(2);              // soldier 只有头盔
  });

  it('血条与锁定标记（Billboard 子树）的几何也是共享的', () => {
    const a = mk();
    const b = mk();
    const barA = geosOf(a.hpBar.object3D);
    const markA = geosOf(a.lockMarker.object3D);
    expect(barA.size).toBe(2);                        // 底板 + 血条填充
    expect(markA.size).toBe(2);                       // 地面环 + 头顶菱形
    for (const g of barA) expect(geosOf(b.hpBar.object3D).has(g)).toBe(true);
    for (const g of markA) expect(geosOf(b.lockMarker.object3D).has(g)).toBe(true);
    for (const g of [...barA, ...markA]) expect(g.userData.shared, '共享几何必须带 shared 标记').toBe(true);
  });

  it('预警三件套按需建一次也是共享的：两只敌人各 showTelegraph 只有 3 份几何', () => {
    const a = mk();
    const b = mk();
    a.showTelegraph();
    b.showTelegraph();
    expect(a.teleParts.ring.geometry).toBe(b.teleParts.ring.geometry);
    expect(geosOf(a.telegraph).size).toBe(3);
    for (const g of geosOf(a.telegraph)) expect(geosOf(b.telegraph).has(g)).toBe(true);
  });

  it('dispose 不拆共享几何 —— 拆了第一只死掉的敌人会把全场同类一起渲染坏', () => {
    const a = mk();
    const b = mk();
    const bodyGeo = a.mesh.getObjectByName('body').geometry;
    const barBgGeo = [...geosOf(a.hpBar.object3D)][0];
    const bodyGeoSpy = vi.spyOn(bodyGeo, 'dispose');
    const barBgSpy = vi.spyOn(barBgGeo, 'dispose');
    // 身体材质每实例一份，照旧要拆（soldier 的身体与头盔共用同一份材质，traverse 拆两次
    // —— three 的 dispose 幂等，无害；这里只钉"材质确实拆了、几何确实没拆"）
    const bodyMat = a.mesh.getObjectByName('body').material;
    const bodyMatSpy = vi.spyOn(bodyMat, 'dispose');
    a.dispose();
    expect(bodyGeoSpy).not.toHaveBeenCalled();
    expect(barBgSpy).not.toHaveBeenCalled();
    expect(bodyMatSpy).toHaveBeenCalled();
    // b 的身体还持有同一份活几何
    expect(b.mesh.getObjectByName('body').geometry).toBe(bodyGeo);
  });

  it('全类型敌人各建一只，共享缓存的规模有上界（共享失效会退化回数百份）', () => {
    const before = enemyGeoStats();
    const types = ['soldier', 'golem', 'drone', 'wraith', 'stalker', 'sentinel', 'hexer', 'juggernaut'];
    const enemies = types.map((t) => mk({ type: t }));
    // 全部类型件 + 血条 2 + 锁定标记 2 + 预警 3 ≈ 22 份封顶 —— 给 24 的上界留余量。
    // 共享若失效，这里会爆炸（8 类型 × 每只 5~8 份）；只钉上界就够，下界没有意义。
    expect(enemyGeoStats() - before).toBeLessThanOrEqual(24);
    for (const e of enemies) e.dispose();
  });
});
