/**
 * Boss 预警圈几何共享（W-E2 稳定性浸泡，2026-10-31）。
 *
 * `renderer.info.memory.geometries` 记的是**上传缓存**：五只 Boss 各建一份一模一样的
 * `RingGeometry(0.3, 1.2, 16)`，每只第一次预警都推 +1。校准10（2 分钟 / 两圈）里
 * 游玩段残留的正好是两只 Boss 的预警圈（+2）—— 有界但不为零，而验收线是"三项零增长"。
 *
 * 形状与个体无关 ⇒ 与敌人预警圈（`enemyGeo`）同一口径：几何共一份、`userData.shared`
 * 让 `Enemy.dispose` 跳过它；材质仍逐实例（各自的颜色/不透明度算各自的，拆的时候各释放各的）。
 */
import { describe, it, expect } from 'vitest';
import { installWindowShim, makeManager } from './helpers/enemyHarness.js';

installWindowShim();

const mkBoss = (m, spawn = 'spawnBoss', bossId = 'shadow-warden') => m[spawn]({ bossId, x: 0, z: 0, respawn: false });

describe('Boss 预警圈：几何共享，材质逐实例', () => {
  it('两只 Boss 的预警圈是同一份几何，且带 shared 标记', () => {
    const a = mkBoss(makeManager());
    const b = mkBoss(makeManager(), 'spawnMagicBoss', 'archmagus');
    a.showTelegraph();
    b.showTelegraph();
    expect(a.telegraphRing.geometry).toBe(b.telegraphRing.geometry);
    expect(a.telegraphRing.geometry.userData.shared, '共享几何必须带 shared 标记').toBe(true);
    // 材质不能共：Enemy.dispose 会逐实例 dispose 材质
    expect(a.telegraphRing.material).not.toBe(b.telegraphRing.material);
  });

  it('dispose 不拆共享的那份几何 —— 拆了别的 Boss 的预警圈一起坏', () => {
    const m = makeManager();
    const a = mkBoss(m);
    const b = mkBoss(m, 'spawnSpaceBoss', 'singularity-herald');
    a.showTelegraph();
    b.showTelegraph();
    const geo = a.telegraphRing.geometry;

    let 拆过 = 0;
    const 原 = geo.dispose.bind(geo);
    geo.dispose = () => { 拆过 += 1; 原(); };

    a.dispose();
    expect(拆过, 'dispose 拆了共享几何').toBe(0);
    expect(b.telegraphRing.geometry).toBe(geo);
    // 还活着的 Boss 重新预警仍然用这份几何（没有被换掉/拆掉）
    b.clearTelegraph();
    b.showTelegraph();
    expect(b.telegraphRing.geometry).toBe(geo);
  });
});
