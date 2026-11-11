/**
 * 处决/金迸特效（ExecutionEffects）——W-V8 大成就迸金的运行期门禁。
 *
 * 桩形状：真 THREE.Scene（不造假）+ poi-identity 同款的最小 window 模拟
 * （记录 addEventListener → dispatchEvent 真的唤起处理器；EventBus 的 on() 就挂在 window 上）。
 * 断言四条：
 *   1. 大成就（master）解锁 → fx.group 里多了金环 + 金碎片（金迸真的发生了）；
 *   2. 普通成就解锁 → fx.group 不动（普通成就只给 W-V4 的鎏金收束，不迸）；
 *   3. 碎片有寿命、会散会落、到期还干净（跑够一生后 group 回到迸前的件数）；
 *   4. dispose 之后大成就事件再派发也不进 group（注销完整）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { emit, offAll } from '../src/engine/EventBus.js';
import { ExecutionEffects } from '../src/effects/ExecutionEffects.js';

const FX_TAG = 'effects/ExecutionEffects';

/** 最小可用 window：addEventListener 登记 → dispatchEvent 逐个唤起（EventBus 走的就是这条路） */
const handlers = new Map();
function installWindow() {
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      handlers.get(type)?.delete(fn);
    },
    dispatchEvent(event) {
      handlers.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
}
function uninstallWindow() {
  handlers.clear();
  delete globalThis.window;
  delete globalThis.CustomEvent;
}

function boot() {
  const scene = new THREE.Scene();
  const game = { player: { position: new THREE.Vector3(3, 0, 7) } };
  const fx = new ExecutionEffects(scene, game);
  return { scene, fx };
}

describe('ExecutionEffects · W-V8 大成就迸金', () => {
  beforeEach(() => {
    offAll(FX_TAG);
    installWindow();
  });

  afterEach(() => {
    offAll(FX_TAG);
    uninstallWindow();
  });

  it('大成就解锁：ring + shards 进 group（数量远大于 bossKill 默认）', () => {
    const { fx } = boot();
    const baseline = fx.group.children.length;
    emit('achievement-unlocked', { id: 'echo-homecoming-master' });
    expect(fx.group.children.length, '大成就解锁没有迸').toBeGreaterThan(baseline + 10);
  });

  it('普通成就解锁：group 不动（master 名册之外一律不迸）', () => {
    const { fx } = boot();
    const baseline = fx.group.children.length;
    emit('achievement-unlocked', { id: 'echo-homecoming' });
    expect(fx.group.children.length).toBe(baseline);
  });

  it('碎片会散会落、到期还干净（跑够一生后 group 回到迸前的件数）', () => {
    const { fx } = boot();
    const baseline = fx.group.children.length;
    emit('achievement-unlocked', { id: 'echo-triad' });
    expect(fx.group.children.length).toBeGreaterThan(baseline);
    // 金迸寿命 ≈ 0.6–0.8s；按 1/60 步进 3 秒，所有碎片应全部还完
    for (let i = 0; i < 180; i++) fx.update(1 / 60);
    expect(fx.group.children.length).toBe(baseline);
  });

  it('dispose 之后大成就事件再派发也不进 group（注销完整）', () => {
    const { fx } = boot();
    fx.dispose();
    const baseline = fx.group.children.length;
    emit('achievement-unlocked', { id: 'echo-original' });
    expect(fx.group.children.length).toBe(baseline);
  });
});
