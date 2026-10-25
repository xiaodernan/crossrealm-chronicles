/**
 * 动画状态机门禁 —— 钉 `animation/AnimationMixer.js`（W-C6 切片1 的统一出口）。
 *
 * 被 Enemy/Boss/玩家动画统一走这一类，但此前**零直接测试**。用**真 THREE**
 * （AnimationMixer/Action/Clip 是纯数学、无需 WebGL）+ 一个最小 library stub 驱动，
 * 不 mock three 本身。重点钉几条"写错不抛、只静默表现错"的不变量：
 * - **crossFade 必须让目标真的跑起来**：three 的 `crossFadeTo` 内部只 fadeOut+fadeIn、
 *   **不 play()**，目标不进 mixer 激活表 → "切过去了但场上一帧都没动"（切片踩过的坑）。
 *   判据用 `isRunning()` 与"驱动轨道是否真的推动了 root"双重钉死。
 * - **循环口径优先级**：`opts.loop ?? library 配置 ?? 默认 true`，且 `clampWhenFinished = !loop`
 *   （一次性动作要停在末帧，`death` 躺平那段）。
 * - 同层级播放要停掉该层其它动作；未知动作抛错；onEvent 未知动作抛错、finished 真触发；
 *   stop/stopAll/dispose 清账。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AnimationMixer } from '../src/animation/AnimationMixer.js';

/** 驱动 root.position.x 从 0 到 10 的轨道（用于"目标是否真的在放"） */
function movingClip(name) {
  return new THREE.AnimationClip(name, 1, [
    new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 10, 0, 0]),
  ]);
}
/** 静止片段（空轨道）：放着但不推动 root */
function stillClip(name) {
  return new THREE.AnimationClip(name, 1, []);
}

const CLIPS = {
  idle: stillClip('idle'),
  run: movingClip('run'),
  walk: movingClip('walk'),
  death: movingClip('death'),
  wave: movingClip('wave'),
  a: movingClip('a'),
  b: movingClip('b'),
};

function makeLibrary(configs = {}) {
  return {
    has: (n) => Object.prototype.hasOwnProperty.call(configs, n),
    getConfig: (n) => configs[n],
    getClip: (n) => CLIPS[n] ?? null,
  };
}

const makeMixer = (configs = {}) => new AnimationMixer(new THREE.Group(), makeLibrary(configs));

describe('AnimationMixer 未知动作与循环口径', () => {
  it('play / crossFade / addLayer 未知动作都抛错', () => {
    const m = makeMixer();
    expect(() => m.play('nope')).toThrow(/未知动作/);
    expect(() => m.crossFade('nope', 0.2)).toThrow(/未知动作/);
    expect(() => m.addLayer('nope', 0.5)).toThrow(/未知动作/);
  });

  it('无配置无 opts → 默认循环（LoopRepeat, clampWhenFinished=false）', () => {
    const m = makeMixer();
    const a = m.play('run');
    expect(a.loop).toBe(THREE.LoopRepeat);
    expect(a.clampWhenFinished).toBe(false);
  });

  it('library 配置 loop:false → 一次性（LoopOnce, clampWhenFinished=true，停在末帧）', () => {
    const m = makeMixer({ death: { loop: false } });
    const a = m.play('death');
    expect(a.loop).toBe(THREE.LoopOnce);
    expect(a.clampWhenFinished).toBe(true);
  });

  it('opts.loop 显式覆盖 library 配置（两个方向）', () => {
    const m1 = makeMixer({ run: { loop: false } });
    expect(m1.play('run', { loop: true }).loop).toBe(THREE.LoopRepeat); // opts 赢
    const m2 = makeMixer({ walk: { loop: true } });
    expect(m2.play('walk', { loop: false }).loop).toBe(THREE.LoopOnce); // opts 赢
  });
});

describe('AnimationMixer 状态切换', () => {
  it('play 记录 currentAction，getCurrentActionName 可读回', () => {
    const m = makeMixer();
    m.play('run');
    expect(m.getCurrentActionName()).toBe('run');
    m.play('walk');
    expect(m.getCurrentActionName()).toBe('walk');
  });

  it('同层级播放停掉该层其它动作（只有一个在跑）', () => {
    const m = makeMixer();
    const a = m.play('a');
    expect(a.isRunning()).toBe(true);
    m.play('b');
    expect(a.isRunning()).toBe(false); // 被停
    expect(m.getCurrentActionName()).toBe('b');
  });

  it('crossFade 切换且目标真的跑起来（three crossFadeTo 不 play 的坑）', () => {
    const m = makeMixer();
    const root = m.root;
    m.play('idle');
    m.update(0.1);
    expect(root.position.x).toBe(0); // idle 静止
    const run = m.crossFade('run', 0.2);
    expect(m.getCurrentActionName()).toBe('run');
    expect(run.isRunning()).toBe(true); // 目标必须进激活表（修复点）
    m.update(0.3);
    expect(root.position.x).toBeGreaterThan(0); // run 的轨道真的推动了 root
  });

  it('addLayer 叠加层设权重、且不抢占主动作', () => {
    const m = makeMixer();
    m.play('run');
    const layer = m.addLayer('wave', 0.5);
    expect(layer.weight).toBe(0.5);
    expect(m.getCurrentActionName()).toBe('run'); // 主动作不变
  });

  it('setWeight 改权重', () => {
    const m = makeMixer();
    m.play('run');
    m.setWeight('run', 0.3);
    expect(m.actions.get('run').weight).toBe(0.3);
  });
});

describe('AnimationMixer 停止 / 事件 / 释放', () => {
  it('stop(name) 移除并清 currentAction（若停的是当前）', () => {
    const m = makeMixer();
    m.play('run');
    m.stop('run');
    expect(m.getCurrentActionName()).toBeNull();
    expect(m.actions.has('run')).toBe(false);
  });

  it('stopAll 清空所有动作与 currentAction', () => {
    const m = makeMixer();
    m.play('run');
    m.addLayer('wave', 0.5);
    m.stopAll();
    expect(m.actions.size).toBe(0);
    expect(m.currentAction).toBeNull();
  });

  it('onEvent 对未知动作抛错', () => {
    const m = makeMixer();
    expect(() => m.onEvent('nope', 'finished', () => {})).toThrow(/不存在/);
  });

  it('onEvent finished：一次性动作跑到结尾真的触发回调', () => {
    const m = makeMixer({ death: { loop: false } });
    m.play('death'); // LoopOnce
    let fired = 0;
    m.onEvent('death', 'finished', () => { fired += 1; });
    m.update(2); // 越过 1s 时长
    expect(fired).toBe(1);
  });

  it('dispose 清空且不抛', () => {
    const m = makeMixer();
    m.play('run');
    expect(() => m.dispose()).not.toThrow();
    expect(m.actions.size).toBe(0);
    expect(m.currentAction).toBeNull();
  });
});
