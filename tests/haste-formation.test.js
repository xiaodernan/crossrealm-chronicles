/**
 * W-Z335 · formation 急速落地的定向证据。
 *
 * 背景：`applyHasteToAllies` 旧实现走 `scene.traverse(...)`——场景里只有敌人 mesh 的
 * group 节点，`alive` / `type` / `hasteTimer` 三格全在 Enemy 实例上，不在任何图节点上。
 * 于是那条急速通道**永远匹配不到任何人**，formation 招的「半径内同类得急速」一生没生效过。
 *
 * 现在走调用方递进来的 `ctx.neighbors`（EnemyManager 每帧重建的 活着的敌人 + 玩家身体 候选池），
 * 同类、活着、半径内才入账。这组用例钉住这条新路径，并钉住「半径外 / 不同类 / 自己」不入账。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { installWindowShim, makeManager, spawn, v } from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

describe('W-Z335 · applyHasteToAllies（formation 急速）', () => {
  const neighborsOf = (m) => m.enemies.filter((e) => e.alive);

  it('半径内同类入账：hasteTimer 被顶到 durationMs，hasteMult 被顶到 mult', () => {
    const m = makeManager();
    const a = spawn(m, { x: 0, z: 0 });
    const b = spawn(m, { x: 1.5, z: 0 });
    const far = spawn(m, { x: 30, z: 0 });
    const brute = spawn(m, { x: 0.5, z: 0.5, type: 'brute' });

    a.applyHasteToAllies(4.0, 3000, 1.4, { neighbors: neighborsOf(m) });

    expect(b.hasteTimer).toBe(3000);
    expect(b.hasteMult).toBe(1.4);

    // 半径外：不受影响
    expect(far.hasteTimer).toBe(0);
    // 不同类：不受影响
    expect(brute.hasteTimer).toBe(0);
    // 自己：不给自己吃
    expect(a.hasteTimer).toBe(0);
  });

  it('hasteTimer 取 max（不回落），hasteMult 取 max（不回落）', () => {
    const m = makeManager();
    const a = spawn(m, { x: 0, z: 0 });
    const b = spawn(m, { x: 1, z: 0 });
    b.hasteTimer = 5000;
    b.hasteMult = 1.9;

    a.applyHasteToAllies(4.0, 3000, 1.4, { neighbors: neighborsOf(m) });

    expect(b.hasteTimer).toBe(5000);   // 已有更长的，不被压低
    expect(b.hasteMult).toBe(1.9);     // 已有更高的，不被压低
  });

  it('候选池含玩家身体分离体时静默跳过（它没有 alive/type/hasteTimer）', () => {
    const m = makeManager();
    const a = spawn(m, { x: 0, z: 0 });
    const b = spawn(m, { x: 1, z: 0 });
    const playerBody = { position: v(0, 0), separationRadius: () => 0.7, separationSeed: () => 0 };

    // 不抛、不误伤、急速照常入账
    a.applyHasteToAllies(4.0, 3000, 1.4, { neighbors: [a, b, playerBody] });
    expect(b.hasteTimer).toBe(3000);
  });

  it('缺 ctx.neighbors 时回落到 scene.traverse（不抛错、老语义）', () => {
    const m = makeManager();
    const a = spawn(m, { x: 0, z: 0 });
    expect(() => a.applyHasteToAllies(4.0, 3000, 1.4, null)).not.toThrow();
  });

  it('死亡的同类不入账（alive=false 出列）', () => {
    const m = makeManager();
    const a = spawn(m, { x: 0, z: 0 });
    const b = spawn(m, { x: 1, z: 0 });
    b.alive = false;
    const pool = m.enemies.filter((e) => e.alive); // 活着才进池子——与 EnemyManager 的口径一致
    a.applyHasteToAllies(4.0, 3000, 1.4, { neighbors: pool });
    expect(b.hasteTimer).toBe(0);
  });
});
