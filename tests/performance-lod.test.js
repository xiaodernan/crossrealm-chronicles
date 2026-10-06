import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
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

/**
 * W-C3 切片2：`updateSunShadow` 的跟随半区。
 *
 * 改前那一版写的是 `sun.shadow.camera.position.copy(playerPos)` —— 死代码：
 * three 每次阴影渲染前从 `light.matrixWorld` 重设阴影相机位置，手写的值必被覆盖
 * （见证用例在 `shadow-policy.test.js` ⑦ 层）。后果是阴影框焊死在原点附近，而地形
 * 520×620 —— 玩家走出原点 ±140 米整片无影。现在跟随走 `applySunFollow`：
 * 挪光本体与 target，方向恒定只平移。这一层钉的是管理器自己的接线。
 */
describe('updateSunShadow：阴影框跟着玩家走（W-C3 切片2）', () => {
  /** 真 light：跟随写的是 `position.set(...)`，假对象没有这一手就不像它要伺候的那个类型 */
  const sun = () => {
    const s = new THREE.DirectionalLight();
    s.castShadow = true;
    return s;
  };

  it('开着时：target 到玩家脚下、光位跟着玩家走', () => {
    const perf = new PerformanceManager();
    const s = sun();
    perf.updateSunShadow(s, { x: 220, y: 4, z: -60 }, true);
    expect(s.castShadow).toBe(true);
    expect(s.target.position.x).toBe(220);
    expect(s.target.position.z).toBe(-60);
    expect(s.position.x).toBe(220 + 80);
    expect(s.position.y).toBe(4 + 120);
    expect(s.position.z).toBe(-60 + 60);
  });

  it('关掉时：总开关落 false（跟随挪不挪无所谓，深度图那一趟都不跑了）', () => {
    const perf = new PerformanceManager();
    const s = sun();
    perf.updateSunShadow(s, { x: 220, y: 0, z: -60 }, false);
    expect(s.castShadow).toBe(false);
  });

  it('null 不炸：设置里 shadows 关着且光还没建的那几帧照走', () => {
    const perf = new PerformanceManager();
    expect(() => perf.updateSunShadow(null, { x: 0, y: 0, z: 0 }, true)).not.toThrow();
  });
});
