/**
 * W-E2 性能回归：装饰性视觉降频到 1/2 帧门禁
 *
 * 验证 WeatherSystem 粒子 / WorldEffects 魔法球与余烬的位置推进
 * 仅在几何帧（frameShouldUpdate(2) 为真，即偶数帧）执行；
 * 奇数帧（非几何帧）位置数组逐字节不变。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { WeatherSystem } from '../src/world/WeatherSystem.js';
import { WorldEffects } from '../src/world/WorldEffects.js';
import { tick, resetForTest } from '../src/engine/FrameBudget.js';

/** 构造一个最小的 world 对象，供 WeatherSystem 使用 */
const makeWorld = () => ({
  getGroundHeight: () => 0,
  dungeonManager: { isInside: () => false },
});

describe('W-E2 性能回归：装饰性视觉降频到 1/2 帧', () => {
  beforeEach(() => {
    resetForTest();
  });

  it('WeatherSystem 粒子位置仅在几何帧更新', () => {
    const scene = new THREE.Scene();
    const weather = new WeatherSystem(scene, makeWorld());
    const initial = [...weather.particles.geometry.attributes.position.array];

    // 帧 1（奇数，非几何帧）：位置数组逐字节不变
    tick();
    weather.update(1 / 60, { x: 0, z: 0 });
    expect([...weather.particles.geometry.attributes.position.array]).toEqual(initial);

    // 帧 2（偶数，几何帧）：位置数组发生变化（有速度积分）
    tick();
    weather.update(1 / 60, { x: 0, z: 0 });
    expect([...weather.particles.geometry.attributes.position.array]).not.toEqual(initial);
  });

  it('WorldEffects 魔法球位置仅在几何帧更新', () => {
    const scene = new THREE.Scene();
    const effects = new WorldEffects(scene);
    effects.magicOrbs.visible = true;
    const initial = [...effects.magicOrbs.geometry.attributes.position.array];

    // 帧 1（奇数，非几何帧）：位置数组逐字节不变
    tick();
    effects.update(1 / 60, { x: 0, z: 0 });
    expect([...effects.magicOrbs.geometry.attributes.position.array]).toEqual(initial);

    // 帧 2（偶数，几何帧）：位置数组发生变化（浮动 sin 项推进）
    tick();
    effects.update(1 / 60, { x: 0, z: 0 });
    expect([...effects.magicOrbs.geometry.attributes.position.array]).not.toEqual(initial);
  });

  it('WorldEffects 余烬位置仅在几何帧更新', () => {
    const scene = new THREE.Scene();
    const effects = new WorldEffects(scene);
    effects.chaosEmbers.visible = true;
    const initial = [...effects.chaosEmbers.geometry.attributes.position.array];

    // 帧 1（奇数，非几何帧）：位置数组逐字节不变
    tick();
    effects.update(1 / 60, { x: 0, z: 0 });
    expect([...effects.chaosEmbers.geometry.attributes.position.array]).toEqual(initial);

    // 帧 2（偶数，几何帧）：位置数组发生变化（浮动 sin 项推进）
    tick();
    effects.update(1 / 60, { x: 0, z: 0 });
    expect([...effects.chaosEmbers.geometry.attributes.position.array]).not.toEqual(initial);
  });

  it('WorldEffects 流星推进仅在几何帧执行', () => {
    const scene = new THREE.Scene();
    const effects = new WorldEffects(scene);
    effects.starField.visible = true;
    // 强制生成一枚流星并钉住它
    effects.spawnMeteor();
    const meteor = effects.meteorStreaks.find((m) => m.life > 0);
    expect(meteor).toBeTruthy();
    const lifeBefore = meteor.life;

    // 帧 1（奇数，非几何帧）：流星寿命不递减
    tick();
    effects.updateMeteors(1 / 60);
    expect(meteor.life).toBe(lifeBefore);

    // 帧 2（偶数，几何帧）：流星寿命递减
    tick();
    effects.updateMeteors(1 / 60);
    expect(meteor.life).toBeLessThan(lifeBefore);
  });
});
