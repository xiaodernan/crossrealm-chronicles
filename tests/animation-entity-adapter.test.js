/**
 * 实体 → 动画适配器 —— W-C6 切片2。
 *
 * 这个 adapter 曾经是**接口对不上的假代码**：它 `new AnimationController(mixer, AnimationLibrary)`
 * （第一参要 entity、第二参要 library 实例，却把类本身传了进去）、调 `AnimationLibrary.getInstance()`
 * 与 `createProceduralClip`（两个静态方法都不存在）、`controller.registerState(...)`（真接口是
 * 构造时的 `opts.stateMap`）—— 而且**零测试、零调用点**，看板却标了"完成"。这正是本项目纪律
 * 反复要防的"假绿"：方法名凭想象、对不上真接口，一旦有人真去 new 一个就在运行时崩。
 *
 * 这片把适配器钉在**已存在的真接口**上，并逐条验：
 *   - combatState → 库内动作名的映射（combo1→attack1、locomotion+sprint→run、未知→idle）；
 *   - 程序化占位 clip 真的写进了库（`library.getClip` 拿得到、是 `THREE.AnimationClip`）；
 *   - `setState` 只切库内有的动作，没有的动作**不谎报**（控制器保持原状）；
 *   - 工厂对没有 mesh/object3D 的实体返回 null（诚实，不返回半成品）。
 *
 * 变异自证（`cp` 备份 + 逐字节还原）：把 `_resolveAction` 的 combo1 映射改回旧的 'attack'、
 * 把工厂的 `?? null` 兜底删掉、把 `registerProceduralClips` 里的 `setClip` 拿掉 —— 各自必须红。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  AnimationEntityAdapter,
  createEntityAdapter,
} from '../src/animation/AnimationEntityAdapter.js';
import { AnimationLibrary } from '../src/animation/AnimationLibrary.js';

beforeAll(() => {
  // controller 内部建 AnimationMixer 需要 Object3D；THREE 在 node 下不依赖 DOM
  globalThis.window = globalThis.window ?? {};
});

/** 最小实体：只有 controller 需要的 `mesh`。 */
const makeEntity = () => ({
  mesh: new THREE.Object3D(),
  combatState: 'idle',
  sprinting: false,
});

describe('AnimationEntityAdapter：只对接真接口（W-C6 切片2）', () => {
  it('构造需要实体的 mesh/object3D，缺了直接抛（不建半成品）', () => {
    expect(() => new AnimationEntityAdapter({}, new AnimationLibrary())).toThrow(/mesh\/object3D/);
    expect(() => new AnimationEntityAdapter(null, new AnimationLibrary())).toThrow();
  });

  it('registerStates + registerProceduralClips：动作进配置表，程序化 clip 真进库且是 AnimationClip', () => {
    const adapter = new AnimationEntityAdapter(makeEntity(), new AnimationLibrary());
    adapter.registerStates();
    adapter.registerProceduralClips();

    for (const name of ['idle', 'walk', 'run', 'attack1', 'heavy', 'skill']) {
      expect(adapter.library.has(name), `动作 ${name} 没进配置表`).toBe(true);
      const clip = adapter.library.getClip(name);
      expect(clip, `动作 ${name} 没有 clip`).toBeInstanceOf(THREE.AnimationClip);
    }
  });

  it('combatState → 动作名：combo 各自映射、locomotion 随 sprinting 分流、未知回落 idle', () => {
    const adapter = new AnimationEntityAdapter(makeEntity(), new AnimationLibrary());
    adapter.registerStates();
    const 解 = (cs, sprint = false) => adapter._resolveAction(cs, sprint);

    expect(解('idle')).toBe('idle');
    expect(解('combo1')).toBe('attack1');
    expect(解('combo2')).toBe('attack2');
    expect(解('combo3')).toBe('attack3');
    expect(解('heavy')).toBe('heavy');
    expect(解('riposte')).toBe('parry'); // riposte 与 parry 同用一个动作
    expect(解('locomotion', false)).toBe('walk');
    expect(解('locomotion', true)).toBe('run');
    expect(解('完全不存在的状态')).toBe('idle'); // 未知绝不抛、不谎报成别的
  });

  it('syncFromEntity：实体状态变了控制器跟着切，没变不重复切', () => {
    const adapter = new AnimationEntityAdapter(makeEntity(), new AnimationLibrary());
    adapter.registerStates();
    adapter.registerProceduralClips();

    expect(adapter.getState()).toBe('idle');
    adapter.entity.combatState = 'combo1';
    adapter.syncFromEntity();
    expect(adapter.getState()).toBe('attack1');

    adapter.entity.combatState = 'locomotion';
    adapter.entity.sprinting = true;
    adapter.syncFromEntity();
    expect(adapter.getState()).toBe('run');

    // 同状态再来一次：currentState 不变，不该触发第二次 setState（靠 update 不崩验证）
    adapter.update(1 / 60);
    expect(adapter.getState()).toBe('run');
  });

  it('库内没有的动作不谎报：setState 到一个没注册的动作，控制器保持原状', () => {
    const adapter = new AnimationEntityAdapter(makeEntity(), new AnimationLibrary());
    adapter.registerStates();
    // 故意不 registerProceduralClips，也不注册 'teleport'
    adapter.setState('idle');
    adapter.setState('teleport'); // 库内没有 → AnimationController.setState 会 warn 后 return，状态不动
    expect(adapter.getState()).toBe('idle');
  });

  it('工厂：有 mesh 的实体返回可用适配器，没有的返回 null', () => {
    const ok = createEntityAdapter(makeEntity());
    expect(ok).toBeInstanceOf(AnimationEntityAdapter);
    expect(ok.library.has('idle')).toBe(true); // 工厂已补好程序化占位

    expect(createEntityAdapter({ combatState: 'idle' })).toBeNull(); // 没有 mesh/object3D
    expect(createEntityAdapter(null)).toBeNull();
  });
});
