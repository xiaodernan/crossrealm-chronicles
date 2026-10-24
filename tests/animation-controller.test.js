// AnimationController 的覆盖 —— 实体级动画状态机（W-C6 切片2），被 `AnimationEntityAdapter`
// 使用（:111 `new AnimationController(...)`），此前零直接测试。它的状态机逻辑有真行为值得钉住：
// ① 构造时播默认动作；② 同状态 setState 是 no-op；③ stateMap 解析动作名；④ 缺动作只 warn 不炸、
// 状态不变；⑤ force 强制重播；⑥ stateChange 回调的形状 {from, to}。
// 用真 THREE（Object3D + 空 AnimationClip），不 mock three。
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AnimationController } from '../src/animation/AnimationController.js';

/** 假动画库：has / getConfig / getClip 三件；clip 用真 THREE.AnimationClip（空轨道够用） */
function makeLib(names) {
  const set = new Set(names);
  return {
    has: (n) => set.has(n),
    getConfig: () => ({ fadeIn: 0.2, fadeOut: 0.2 }),
    getClip: (n) => (set.has(n) ? new THREE.AnimationClip(n, 1, []) : null),
  };
}
const makeEntity = () => ({ object3D: new THREE.Object3D() });

describe('AnimationController（实体级动画状态机）', () => {
  it('构造时若库里有默认动作就播它', () => {
    const c = new AnimationController(makeEntity(), makeLib(['idle']));
    expect(c.getState()).toBe('idle');
    expect(c.getCurrentAction()).toBe('idle');
  });

  it('同状态 setState 是 no-op（不触发 stateChange）', () => {
    const c = new AnimationController(makeEntity(), makeLib(['idle']));
    const seen = [];
    c.onStateChange((d) => seen.push(d));
    c.setState('idle');
    expect(seen).toEqual([]);
    expect(c.getState()).toBe('idle');
  });

  it('setState 走 stateMap 解析动作名，并回调 {from, to}', () => {
    const c = new AnimationController(makeEntity(), makeLib(['idle', 'runAction']), {
      stateMap: { run: 'runAction' },
    });
    const seen = [];
    c.onStateChange((d) => seen.push(d));
    c.setState('run');
    expect(c.getState()).toBe('run');
    expect(c.getCurrentAction()).toBe('runAction');
    expect(seen).toEqual([{ from: 'idle', to: 'run' }]);
  });

  it('setState 到库里没有的动作：只 warn，状态不变', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = new AnimationController(makeEntity(), makeLib(['idle']));
    c.setState('fly');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(c.getState()).toBe('idle');
    warn.mockRestore();
  });

  it('force 强制重播同一状态（再触发一次 stateChange）', () => {
    const c = new AnimationController(makeEntity(), makeLib(['idle', 'run']));
    c.setState('run');
    const seen = [];
    c.onStateChange((d) => seen.push(d));
    c.setState('run', { force: true });
    expect(seen).toEqual([{ from: 'run', to: 'run' }]);
  });
});
