import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PerformanceManager } from '../src/core/PerformanceManager.js';
import { installWindowShim, duel, NEVER_LEAVES } from './helpers/enemyHarness.js';

installWindowShim();

/**
 * 只记账的敌人替身：这一帧有没有被推进、身体有没有被收起 —— 两件事各记一处。
 * 本文件要验的正是"这两件事必须同进同退"，所以不能只记其中一处。
 */
const stub = (dist, alive = true) => ({
  alive,
  position: { x: dist, y: 0, z: 0 },
  visible: null,
  setBodyVisible(visible) { this.visible = visible; },
});

/** 玩家永远站在原点：替身的 x 就是距离 */
const PLAYER = { x: 0, y: 0, z: 0 };

const decide = (dist, over = {}) => {
  const perf = Object.assign(new PerformanceManager(), over);
  const enemy = stub(dist);
  return { perf, enemy, updated: perf.shouldUpdateEnemy(enemy, PLAYER) };
};

describe('PerformanceManager 的距离分档（B40：看得见的敌人必须真的在动）', () => {
  it('近处：身体亮着，逻辑照跑', () => {
    const { enemy, updated } = decide(84);
    expect(updated).toBe(true);
    expect(enemy.visible).toBe(true);
  });

  it('刚好卡在更新距离上不算出界', () => {
    const { enemy, updated } = decide(85);
    expect(updated).toBe(true);
    expect(enemy.visible).toBe(true);
  });

  it('85–120 米这一段不再"看得见但冻住"：要么在动，要么看不见', () => {
    const { enemy, updated } = decide(100);
    expect(updated).toBe(false);
    // 关键回归：不推进的那一帧必须同时把身体收掉，否则就是 B40 记的"定格敌人"
    expect(enemy.visible).toBe(false);
  });

  it('出界与 LOD 挡是同一种收场：收身体 + 不推进', () => {
    const { enemy, updated } = decide(121);
    expect(updated).toBe(false);
    expect(enemy.visible).toBe(false);
  });

  it('不变量：任何一档上"在动"与"看得见"都同进同退', () => {
    for (const dist of [0, 40, 84, 85, 86, 100, 119, 120, 121, 300]) {
      const { enemy, updated } = decide(dist);
      expect(`距离 ${dist}: ${updated}`).toBe(`距离 ${dist}: ${enemy.visible}`);
    }
  });

  it('只看水平距离：挂到天上的敌人不算更远', () => {
    const perf = new PerformanceManager();
    const enemy = stub(30);
    enemy.position.y = 900;
    expect(perf.shouldUpdateEnemy(enemy, PLAYER)).toBe(true);
    expect(enemy.visible).toBe(true);
  });

  it('设置面板的滑杆往大里调，也顶不穿休眠硬上限', () => {
    const far = decide(121, { enemyLodDistance: 150 });
    expect(far.updated).toBe(false);
    expect(far.enemy.visible).toBe(false);

    const near = decide(119, { enemyLodDistance: 150 });
    expect(near.updated).toBe(true);
    expect(near.enemy.visible).toBe(true);
  });

  it('滑杆往小里调是真的少算', () => {
    const { enemy, updated } = decide(41, { enemyLodDistance: 40 });
    expect(updated).toBe(false);
    expect(enemy.visible).toBe(false);
  });

  it('死掉的敌人不受 LOD 管：重生计时要在远处照常走完', () => {
    const perf = new PerformanceManager();
    const enemy = stub(500, false);
    expect(perf.shouldUpdateEnemy(enemy, PLAYER)).toBe(true);
    // 不该去碰它的可见性：死者的收场归 die()/respawnEnemy() 管
    expect(enemy.visible).toBeNull();
  });

  it('源码里不再留 frameSkip 这种没人读的节流字段', () => {
    const src = readFileSync('src/core/PerformanceManager.js', 'utf8');
    expect(src).not.toMatch(/frameSkip/);
  });
});

describe('真管理器 + 真 LOD（B40 端到端）', () => {
  it('100 米外的敌人整只收掉，不是"看得见却不更新"', () => {
    const { m, player, ref, e } = duel({ x: 100, z: 0, ai: NEVER_LEAVES });
    const game = { performance: new PerformanceManager() };
    let updated = 0;
    const real = e.update.bind(e);
    e.update = (...args) => { updated += 1; return real(...args); };

    for (let i = 0; i < 30; i++) m.update(1 / 60, player, ref, null, game);
    expect(updated).toBe(0);                 // 隐身的敌人不推进逻辑
    expect(e.mesh.visible).toBe(false);      // 也不该留在场上定格
    expect(e.hpBar.visible).toBe(false);     // 血条跟身体同一个出口（W-A3）

    // 玩家走到跟前：同一只敌人必须当场重新亮起，并且真的开始动
    const before = e.position.clone();
    player.x = 96;
    for (let i = 0; i < 30; i++) m.update(1 / 60, player, ref, null, game);
    expect(updated).toBeGreaterThan(0);
    expect(e.mesh.visible).toBe(true);
    expect(e.position.distanceTo(before)).toBeGreaterThan(0);
  });
});
