/**
 * 试炼场地边界（W-F3 切片5）。
 *
 * 这一片要钉的是"那一圈光**真的有人造、也真的有人拆**"：
 * ① 构造即挂场景但默认不可见（开局才显形，别一进游戏就有个圈）；
 * ② `show` 把场心与半径摆对，八根柱子等角分布；
 * ③ `hide` 只藏不拆 —— 一局结束不等于这个对象该重建；
 * ④ `update` 是热路径，**不新建任何东西**；
 * ⑤ `dispose` 从场景摘掉并**每种共享资源只释放一次**（八根柱子共用一份几何，
 *    逐个 mesh 释放等于同一份释放八次），且重复调用幂等；
 * ⑥ `TrialSystem` 的接线：开局 show / 结束 hide / dispose 拆。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { TrialArena } from '../src/effects/TrialArena.js';
import { TrialSystem } from '../src/game/TrialSystem.js';
import { TRIAL_ARENA, TRIAL_LAYERS, TRIAL_ORIGIN } from '../src/content/trial.js';
import { emit } from '../src/engine/EventBus.js';

let fx = null;
let scene = null;
afterEach(() => {
  fx?.dispose();
  fx = null;
  scene = null;
});

describe('试炼场地边界 · 显与藏', () => {
  it('构造即挂到场景，但默认不可见（开局才显形）', () => {
    scene = new THREE.Scene();
    fx = new TrialArena(scene);
    expect(scene.children).toContain(fx.group);
    expect(fx.group.visible, '一造出来就可见 = 一进游戏地上就有个圈').toBe(false);
  });

  it('show 把场心摆到给定坐标、半径拉到给定值、八根柱子等角分布', () => {
    scene = new THREE.Scene();
    fx = new TrialArena(scene);
    fx.show({ x: 12, z: -7 }, 9);
    expect(fx.group.visible).toBe(true);
    expect(fx.group.position.x).toBe(12);
    expect(fx.group.position.z).toBe(-7);
    expect(fx.ring.scale.x).toBe(9);
    const 柱 = fx.pillars.children;
    expect(柱.length).toBe(8);
    for (const p of 柱) {
      expect(Math.hypot(p.position.x, p.position.z), '柱子不在半径上').toBeCloseTo(9, 6);
    }
    // 八个角度互不相同：同一角摆两根等于只有七根
    const 角度 = 柱.map((p) => Math.atan2(p.position.z, p.position.x).toFixed(4));
    expect(new Set(角度).size).toBe(柱.length);
  });

  it('hide 只藏不拆，再 show 还能用（同一份 GPU 资源跑很多局）', () => {
    scene = new THREE.Scene();
    fx = new TrialArena(scene);
    const 组 = fx.group;
    const 几何 = fx.ringGeo;
    fx.show({ x: 1, z: 2 }, 6);
    fx.hide();
    expect(fx.group.visible).toBe(false);
    fx.show({ x: -3, z: 4 }, 7);
    expect(fx.group.visible).toBe(true);
    expect(fx.group).toBe(组);
    expect(fx.ringGeo).toBe(几何);
    expect(fx.group.position.x).toBe(-3);
    expect(fx.ring.scale.x).toBe(7);
  });

  it('脏参数回落而不是抛（玩家位置还没就绪时也要能开局）', () => {
    scene = new THREE.Scene();
    fx = new TrialArena(scene);
    expect(() => fx.show(null, NaN)).not.toThrow();
    expect(fx.ring.scale.x).toBe(12);          // 默认半径
    expect(fx.group.position.x).toBe(0);
    fx.show({ x: 5, z: 5 }, -3);
    expect(fx.ring.scale.x).toBe(12);
  });

  it('update 只改透明度与旋转，不新建任何对象（热路径）', () => {
    scene = new THREE.Scene();
    fx = new TrialArena(scene);
    fx.show({ x: 0, z: 0 }, 9);
    const 子节点 = fx.group.children.length;
    const 柱数 = fx.pillars.children.length;
    const 初始透明度 = fx.ringMat.opacity;
    for (let i = 0; i < 120; i += 1) fx.update(1 / 60);
    expect(fx.group.children.length).toBe(子节点);
    expect(fx.pillars.children.length).toBe(柱数);
    expect(fx.ringMat.opacity, '两秒过去透明度一点没变 —— 呼吸没跑起来').not.toBe(初始透明度);
    expect(fx.pillars.rotation.y, '柱子没有转').toBeGreaterThan(0);
    // 藏起来之后 update 不该继续改东西（结束的场还在动 = 玩家看见一个不该存在的圈）
    fx.hide();
    const 停 = fx.ringMat.opacity;
    fx.update(1);
    expect(fx.ringMat.opacity).toBe(停);
  });

  it('update 的脏 dt 被忽略', () => {
    scene = new THREE.Scene();
    fx = new TrialArena(scene);
    fx.show({ x: 0, z: 0 }, 9);
    const 前 = fx.pillars.rotation.y;
    for (const bad of [NaN, -1, 0, Infinity, 'x']) fx.update(bad);
    expect(fx.pillars.rotation.y).toBe(前);
  });

  it('dispose 从场景摘掉、四种共享资源各释放一次、重复调用幂等', () => {
    scene = new THREE.Scene();
    fx = new TrialArena(scene);
    fx.show({ x: 0, z: 0 }, 9);
    const 组 = fx.group;
    const 资源 = [fx.ringGeo, fx.pillarGeo, fx.ringMat, fx.pillarMat];
    const 监视 = 资源.map((r) => vi.spyOn(r, 'dispose'));
    监视.forEach((s, i) => expect(s, `第 ${i} 份资源一开始就 dispose 过`).not.toHaveBeenCalled());
    fx.dispose();
    监视.forEach((s, i) => expect(s, `第 ${i} 份资源没被释放`).toHaveBeenCalledTimes(1));
    expect(scene.children).not.toContain(组);
    expect(fx.group).toBe(null);
    // 重开一局会再走到 dispose 一次：不许抛
    expect(() => fx.dispose()).not.toThrow();
    // 拆完再 show / update 也不许抛（防御性：顺序没人保证）
    expect(() => fx.show({ x: 0, z: 0 }, 5)).not.toThrow();
    expect(() => fx.update(0.1)).not.toThrow();
    fx = null;
  });
});

describe('试炼场地边界 · 与 TrialSystem 的接线', () => {
  const 假局 = (sceneRef) => ({
    scene: sceneRef,
    player: { position: { x: 3, z: 4 }, combat: { takeDamage() {} } },
    enemyManager: { spawnAt: () => null, despawn() {} },
  });

  it('开局显形、放弃之后藏起来、dispose 拆掉', () => {
    scene = new THREE.Scene();
    const sys = new TrialSystem(假局(scene));
    // 首次开局面才造：还没开局时场景里根本没有这一组
    expect(scene.children.filter((c) => c.type === 'Group')).toEqual([]);
    sys.start([]);
    const 组 = scene.children.find((c) => c.type === 'Group');
    expect(组?.visible, '开局之后没显形').toBe(true);
    expect(组.position.x).toBe(3);
    expect(组.position.z).toBe(4);
    expect(组.children.some((c) => c.type === 'Mesh'), '没有地面环').toBe(true);
    sys.abandon();
    expect(组.visible, '放弃之后场地边界还亮着').toBe(false);
    // 再来一局：同一个对象，不重建
    sys.start([]);
    expect(组.visible).toBe(true);
    expect(scene.children.filter((c) => c.type === 'Group')).toEqual([组]);
    sys.dispose();
    expect(scene.children).not.toContain(组);
  });

  it('通关也藏、超时也藏、死亡也藏（四条结束路都收场）', () => {
    for (const 结束 of ['finish', 'timeout', 'death']) {
      scene = new THREE.Scene();
      const sys = new TrialSystem(假局(scene));
      sys.start([]);
      const 组 = scene.children.find((c) => c.type === 'Group');
      expect(组.visible).toBe(true);
      if (结束 === 'finish') {
        // 五层全清（刷怪入口返回 null，所以只靠事件推进状态机 —— 配额从内容层读，不抄数）
        for (const row of TRIAL_LAYERS) {
          for (let i = 0; i < row.quota; i += 1) {
            emit('enemy-defeated', { type: 'soldier', origin: TRIAL_ORIGIN });
          }
        }
      } else if (结束 === 'timeout') {
        sys.update(1000);
      } else {
        emit('player-death-count', { count: 1 });
      }
      expect(组.visible, `${结束} 之后场地边界还亮着`).toBe(false);
      sys.dispose();
    }
  });

  it('没有场景时不造也不炸（单测 / 无渲染环境）', () => {
    const sys = new TrialSystem({ player: { position: { x: 0, z: 0 } } });
    expect(() => sys.start([])).not.toThrow();
    expect(sys._arenaFx).toBe(null);
    expect(() => sys.dispose()).not.toThrow();
  });

  it('场地半径与内容层那一格同源（不是抄一个数）', () => {
    scene = new THREE.Scene();
    const sys = new TrialSystem(假局(scene));
    sys.start([]);
    const 组 = scene.children.find((c) => c.type === 'Group');
    const 环 = 组.children.find((c) => c.type === 'Mesh');
    expect(环.scale.x).toBe(TRIAL_ARENA.radius);
    sys.dispose();
  });
});
