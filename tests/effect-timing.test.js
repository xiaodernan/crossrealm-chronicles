/**
 * 特效计时必须走主循环 dt —— 修 B43。
 *
 * 症状长这样：`ExecutionEffects` 的三条动画与天气的雨滴涟漪自己 `requestAnimationFrame` 递归，
 * 并把每帧时长**写死成 0.016**。寿命因此是按**帧数**算的：
 * 144Hz 的机器上一片血雾碎片约 0.15 秒就消失（设计值 0.35~0.6 秒），30Hz 下拖到 0.7 秒；
 * 更糟的是暂停与 hitstop 期间它们照常跑完 —— 那正是"打击感"最需要的 0.3 秒。
 *
 * 所以这里钉三件事：**帧率无关**（144Hz 与 30Hz 跑出的寿命一致）、
 * **dt=0 时冻结**（hitstop 期间寿命一秒都不推进）、**到期即释放**（网格与 dispose 一一对应）。
 * 最后一条是规范第 2 条的硬要求：创建者与销毁者必须都在场，副本/重生路径同样要释放。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { ExecutionEffects } from '../src/effects/ExecutionEffects.js';
import { WeatherSystem } from '../src/world/WeatherSystem.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const SRC = join(process.cwd(), 'src');

/** 固定序列的随机源：让两次 burst 生成完全相同的碎片寿命，帧率对比才有意义 */
function seededRandom(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const ORIGINAL_RANDOM = Math.random;
beforeEach(() => { installWindowShim(); });
afterEach(() => {
  Math.random = ORIGINAL_RANDOM;
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

/** 跑到全部条目了结，返回用掉的**真实秒数** */
function runUntilIdle(fx, frameDt) {
  let elapsed = 0;
  for (let i = 0; i < 2000; i++) {
    fx.update(frameDt);
    elapsed += frameDt;
    if (fx.live.length === 0) return elapsed;
  }
  return Number.NaN; // 没跑完：让断言直接炸在"卡住"上，而不是返回一个大数
}

describe('ExecutionEffects 走主循环 dt（修 B43）', () => {
  const makeFx = () => {
    const scene = new THREE.Group();
    const fx = new ExecutionEffects(scene, { player: { position: new THREE.Vector3(0, 0, 0) } });
    return { fx, scene };
  };

  it('burst 之后不再自己开 rAF，而是等主循环推进', () => {
    // node 环境本来就没有 rAF —— 显式装一个"一被调用就失败"的假桩，才能证明代码真没调它
    globalThis.requestAnimationFrame = () => 0;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => {
      throw new Error('ExecutionEffects 不得自己开 rAF 循环（B43）');
    });
    const { fx } = makeFx();
    Math.random = seededRandom(7);
    expect(() => fx.burst(new THREE.Vector3(1, 0, 1), 'execution')).not.toThrow();
    expect(fx.live.length).toBeGreaterThan(0);
    raf.mockRestore();
    delete globalThis.requestAnimationFrame;
  });

  it('144Hz 与 30Hz 跑出的寿命一致（修前差约 4.5 倍）', () => {
    const fast = makeFx(); const slow = makeFx();
    Math.random = seededRandom(42);
    fast.fx.burst(new THREE.Vector3(0, 0, 0), 'execution');
    Math.random = seededRandom(42);
    slow.fx.burst(new THREE.Vector3(0, 0, 0), 'execution');

    const tFast = runUntilIdle(fast.fx, 1 / 144);
    const tSlow = runUntilIdle(slow.fx, 1 / 30);
    // 同一条寿命：差距不应超过一帧的量化误差
    expect(Math.abs(tFast - tSlow)).toBeLessThan(1 / 30);
    // 而且确实落在设计区间内（最长的是 bossKill 的 0.55 秒，这里用 execution：环 0.38）
    expect(tFast).toBeGreaterThan(0.3);
    expect(tFast).toBeLessThan(0.7);
  });

  it('dt=0（hitstop / 暂停）时寿命一秒都不推进', () => {
    const { fx } = makeFx();
    Math.random = seededRandom(3);
    fx.burst(new THREE.Vector3(0, 0, 0), 'execution');
    const n = fx.live.length;
    for (let i = 0; i < 600; i++) fx.update(0);
    expect(fx.live.length).toBe(n);
  });

  it('每条网格都有对应的 dispose，跑完场景里不留残骸', () => {
    const { fx } = makeFx();
    const meshes = [];
    const geos = [];
    const mats = [];
    fx._add = (mesh, onTick) => {
      meshes.push(mesh);
      geos.push(vi.spyOn(mesh.geometry, 'dispose'));
      mats.push(vi.spyOn(mesh.material, 'dispose'));
      fx.group.add(mesh);
      fx.live.push({ mesh, onTick });
    };
    Math.random = seededRandom(11);
    fx.burst(new THREE.Vector3(0, 0, 0), 'bossKill');
    expect(meshes.length).toBeGreaterThan(0);
    runUntilIdle(fx, 1 / 60);

    expect(fx.live).toHaveLength(0);
    expect(fx.group.children).toHaveLength(0);
    expect(geos.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(mats.every((s) => s.mock.calls.length === 1)).toBe(true);
  });

  it('冲击环在一秒内长到最大半径后消失（数值仍按设计值走）', () => {
    const { fx } = makeFx();
    Math.random = seededRandom(5);
    fx._spawnRing(new THREE.Vector3(0, 0, 0), 0xff0000, 5.5, 0.5);
    const ring = fx.live[0].mesh;
    fx.update(0.25);
    expect(ring.scale.x).toBeCloseTo(1 + 0.5 * 5.5 * 2, 3);
    expect(ring.material.opacity).toBeCloseTo(0.85 * 0.5, 3);
    fx.update(0.26);
    expect(fx.live).toHaveLength(0);
  });
});

describe('天气涟漪走主循环 dt（修 B43）', () => {
  const makeWeather = () => {
    const scene = new THREE.Group();
    const world = { getGroundHeight: () => 0 };
    return new WeatherSystem(scene, world);
  };

  it('144Hz 与 30Hz 的涟漪寿命一致，且不超过约 0.25 秒的设计值', () => {
    const fast = makeWeather(); const slow = makeWeather();
    fast._spawnSplash(1, 1, 0);
    slow._spawnSplash(1, 1, 0);
    const drain = (w, dt) => {
      let t = 0;
      for (let i = 0; i < 2000 && w.splashes.length > 0; i++) { w._updateSplashes(dt); t += dt; }
      return t;
    };
    const tFast = drain(fast, 1 / 144);
    const tSlow = drain(slow, 1 / 30);
    expect(tFast).toBeGreaterThan(0.2);
    expect(Math.abs(tFast - tSlow)).toBeLessThan(1 / 30);
    expect(fast.splashGroup.children).toHaveLength(0);
    expect(slow.splashGroup.children).toHaveLength(0);
  });

  it('超过上限时回收最老的一条，且数组与场景同时缩（不留幽灵条目）', () => {
    const w = makeWeather();
    for (let i = 0; i < 45; i++) w._spawnSplash(i, i, 0);
    expect(w.splashes.length).toBeLessThanOrEqual(41);
    expect(w.splashGroup.children.length).toBe(w.splashes.length);
  });

  it('涟漪推进不依赖粒子系统存在（粒子缺位时也要把寿命走完）', () => {
    const w = makeWeather();
    w.particles = null;
    w.velocities = null;
    w._spawnSplash(0, 0, 0);
    w.update(1 / 60, new THREE.Vector3(0, 0, 0));
    expect(w.splashes[0].life).toBeCloseTo(0.25 - 1 / 60, 6);
  });
});

/*
 * 上面那组只证明"这些类能被 dt 推进"。真正让 B43 不再复发的，是它们**确实被主循环推进**：
 * 少了这一行接线，代码看起来完全正常（`update(dt)` 写得很漂亮），只是没人调用 ——
 * 症状是特效一帧都不动，而且没有任何报错。与 `scheduler.update(rawDt)` 同一类风险，
 * 所以照 `tests/timing-boundary.test.js` 的办法在源码上钉住。
 */
describe('主循环接线（B43 的落地处）', () => {
  const game = readFileSync(join(SRC, 'core/Game.js'), 'utf8');

  it('Game.update() 每帧推进处决特效', () => {
    expect(game).toMatch(/this\.executionFx\.update\(dt\)/);
  });

  it('天气自己推进涟漪，Game 只需按帧调用它', () => {
    const weather = readFileSync(join(SRC, 'world/WeatherSystem.js'), 'utf8');
    expect(weather).toMatch(/this\._updateSplashes\(dt\)/);
    expect(game).toMatch(/this\.weather\.update\(dt/);
  });
});
