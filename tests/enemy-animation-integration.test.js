/**
 * 敌人 + 动画适配器集成测试（W-C6 切片4）。
 *
 * 验证：
 * - Enemy 实例化后可挂载适配器（`_attachEnemyAnimAdapters`）
 * - 适配器随实体 `combatState` 切换动画状态
 * - 程序化占位 clip 在库中可用
 * - dispose 时清理适配器
 *
 * 变异自证：
 * - 把 `_attachEnemyAnimAdapters` 调用删掉 → 适配器为 null，update 不崩、不报错
 * - 把 `animationAdapter?.update(dt)` 删掉 → 适配器不推进，但实体不崩
 * - 把 `animationAdapter?.dispose()` 删掉 → 销毁时不清理 adapter
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Enemy } from '../src/combat/Enemy.js';
import { createEntityAdapter } from '../src/animation/AnimationEntityAdapter.js';
// World 类型仅用于类型提示，运行时用 mock

beforeAll(() => {
  globalThis.window = globalThis.window ?? {};
});

/** 最小 World mock：提供 getGroundHeight */
const makeWorld = () => ({
  getGroundHeight: () => 0,
  zoneId: 'hub',
});

/** 最小 Scene mock */
const makeScene = () => new THREE.Scene();

describe('Enemy + AnimationAdapter 集成（W-C6 切片4）', () => {
  let scene, world;

  beforeEach(() => {
    scene = makeScene();
    world = makeWorld();
  });

  it('Enemy 实例化 + 挂载适配器：update 不崩、动作映射正确', () => {
    const enemy = new Enemy(scene, world, { x: 0, z: 0, type: 'soldier' });
    const adapter = createEntityAdapter(enemy);
    expect(adapter).not.toBeNull();
    enemy.animationAdapter = adapter;

    // 初始状态 idle
    expect(enemy.state).toBe('idle');
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('idle');

    // 追击状态 → run
    enemy.state = 'pursue';
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('pursue');
    expect(adapter.getCurrentAction()).toBe('run');

    // 攻击前摇 → attack
    enemy.state = 'windup';
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('windup');
    expect(adapter.getCurrentAction()).toBe('attack');

    // 命中段 → attack1
    enemy.state = 'strike';
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('strike');
    expect(adapter.getCurrentAction()).toBe('attack1');

    // 硬直 → hit
    enemy.state = 'stagger';
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('stagger');
    expect(adapter.getCurrentAction()).toBe('hit');

    // 死亡 → death
    enemy.state = 'dead';
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('dead');
    expect(adapter.getCurrentAction()).toBe('death');

    // 回落 idle
    enemy.state = 'idle';
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('idle');
    expect(adapter.getCurrentAction()).toBe('idle');
  });

  it('程序化占位 clip 在库中注册且可用', () => {
    const enemy = new Enemy(scene, world, { x: 0, z: 0, type: 'soldier' });
    const adapter = createEntityAdapter(enemy);
    enemy.animationAdapter = adapter;

    for (const name of ['idle', 'walk', 'run', 'attack1', 'attack2', 'attack3', 'hit', 'death']) {
      expect(adapter.library.has(name), `动作 ${name} 未在库中`).toBe(true);
      const clip = adapter.library.getClip(name);
      expect(clip, `动作 ${name} 无 clip`).toBeInstanceOf(THREE.AnimationClip);
    }
  });

  it('dispose 清理适配器不崩', () => {
    const enemy = new Enemy(scene, world, { x: 0, z: 0, type: 'soldier' });
    const adapter = createEntityAdapter(enemy);
    enemy.animationAdapter = adapter;

    expect(() => enemy.dispose()).not.toThrow();
    expect(enemy.animationAdapter).toBeNull();
  });

  it('无适配器时 update 不崩（防御性：entry chunk 未挂载也能跑）', () => {
    const enemy = new Enemy(scene, world, { x: 0, z: 0, type: 'soldier' });
    // 故意不挂 adapter，提供完整的 mock（含 squad.claim）
    const mockSquad = { claim: () => false, release: () => {} };
    enemy.squad = mockSquad;
    expect(() => enemy.update(1 / 60, new THREE.Vector3(), { 
      combat: { isInvulnerable: () => false, takeDamage: () => {} } 
    }, {
      target: new THREE.Vector3(),
      playerRef: { combat: { isInvulnerable: () => false, takeDamage: () => {} } },
      neighbors: [],
      collision: null,
      camera: null,
    })).not.toThrow();
  });
});