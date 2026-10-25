/**
 * 感知门禁 —— 钉 `ai/Perception.js` 的 `Sense` 契约。
 *
 * `Sense` 是敌人"看得见 / 看见了多久 / 追不追得动"的判定核心，被 `EnemyFSM` 只读消费。
 * 此前零直接测试：只有 `Enemy`/`EnemyFSM` 顺带构造，肉眼调参发现的回归全靠人工。
 *
 * 用一个最小 enemy stub（只暴露 `Sense` 实际读到的字段）驱动，避免耦合真实 `Enemy` 的
 * 整条构造链。两枚变异探针走真 `update()` 代码路径，预言命中后原字节还原。
 */
import { describe, it, expect, vi } from 'vitest';
import { Sense } from '../src/ai/Perception.js';

function makeEnemy(overrides = {}) {
  const ai = { eyeHeight: 1.5, memory: 3, leashScale: 3 };
  const enemy = {
    position: { x: 0, z: 0, y: 0 },
    spawnPoint: { x: 0, z: 0 },
    aggroRange: 40,
    threatRange: 3.5,
    ai,
    world: null,
    distanceTo(target) {
      const dx = this.position.x - target.x;
      const dz = this.position.z - target.z;
      return Math.hypot(dx, dz);
    },
    ...overrides,
  };
  return enemy;
}

function makeWorld(blocked) {
  // 只暴露 Sense 读到的两个方法
  return {
    getGroundHeight: vi.fn(() => 0),
    blocked: vi.fn(() => !!blocked),
  };
}

describe('Sense 基础', () => {
  it('构造期字段归零', () => {
    const s = new Sense(makeEnemy());
    expect(s.alerted).toBe(false);
    expect(s.seen).toBe(false);
    expect(s.lost).toBe(0);
    expect(s.dist).toBe(Infinity);
    expect(s.returning).toBe(false);
    expect(s.target).toBeNull();
  });

  it('noteHostile 立刻仇恨并清归位承诺', () => {
    const s = new Sense(makeEnemy({ position: { x: 100, z: 0 } }));
    s.returning = true;
    s.lost = 5;
    s.noteHostile();
    expect(s.alerted).toBe(true);
    expect(s.returning).toBe(false);
    expect(s.lost).toBe(0);
  });

  it('clear 把所有可见/仇恨态归零', () => {
    const s = new Sense(makeEnemy());
    s.alerted = true;
    s.seen = true;
    s.lost = 2;
    s.clear();
    expect(s.alerted).toBe(false);
    expect(s.seen).toBe(false);
    expect(s.lost).toBe(0);
  });
});

describe('Sense.update 视距与遮挡', () => {
  it('视距内且无 world（无遮挡）→ 看见 + 仇恨 + 记录目标', () => {
    const e = makeEnemy();
    const s = new Sense(e);
    const target = { x: 5, z: 5, y: 1.7 };
    const r = s.update(0.1, target, null);
    expect(r).toBe(s); // 返回 this，便于链式
    expect(s.seen).toBe(true);
    expect(s.alerted).toBe(true);
    expect(s.target).toBe(target);
    expect(s.dist).toBeCloseTo(Math.hypot(5, 5));
  });

  it('视距外 → 看不见也不仇恨（未惊动时）', () => {
    const e = makeEnemy();
    const s = new Sense(e);
    s.update(0.1, { x: 100, z: 0, y: 1.7 }, null);
    expect(s.seen).toBe(false);
    expect(s.alerted).toBe(false);
  });

  it('视距内但视线被遮挡 → 看不见', () => {
    const e = makeEnemy();
    const s = new Sense(e);
    const world = makeWorld(true); // blocked() === true
    s.update(0.1, { x: 10, z: 0, y: 1.7 }, world);
    expect(s.seen).toBe(false);
    expect(world.blocked).toHaveBeenCalled();
  });

  it('eyeY 用站立面而非绝对 0（高台不会被脚下石头全判遮挡，B125-B）', () => {
    const e = makeEnemy({
      position: { x: 0, z: 0 },
      world: { getGroundHeight: (x, z) => 10 }, // 站在 10m 台地上
    });
    const s = new Sense(e);
    // 本站 10 + max(10, 目标y=1.7) + eyeHeight 1.5 = 11.5
    // 若用绝对 0（旧 bug）会得到 max(0,1.7)+1.5 = 3.2，落地埋进坡里
    expect(s.eyeY({ x: 5, z: 5, y: 1.7 })).toBeCloseTo(11.5);
  });

  it('eyeY 取两端站立面与目标 y 的较高者', () => {
    const e = makeEnemy({
      position: { x: 0, z: 0 },
      world: { getGroundHeight: (x, z) => 10 },
    });
    const s = new Sense(e);
    // 目标在更高处（y=20 > 本站 10）：max(10,20)+1.5 = 21.5
    expect(s.eyeY({ x: 5, z: 5, y: 20 })).toBeCloseTo(21.5);
  });
});

describe('Sense.update 记忆与归位', () => {
  it('惊动后丢失视野超过 memory 且离贴身远 → 脱战', () => {
    const e = makeEnemy();
    const s = new Sense(e);
    // 先看见一次，建立 alerted
    s.update(0.1, { x: 5, z: 0, y: 1.7 }, null);
    expect(s.alerted).toBe(true);
    // 之后玩家远远离开（dist 100 > threatRange 3.5），丢失视野累计 > memory(3)
    s.update(2, { x: 100, z: 0, y: 1.7 }, null); // 2s 未见
    s.update(2, { x: 100, z: 0, y: 1.7 }, null); // 再 2s，累计 4 > 3
    expect(s.alerted).toBe(false);
    expect(s.seen).toBe(false);
    expect(s.lost).toBe(0); // clear 后归零
  });

  it('贴身时丢失视野不脱战（dist <= threatRange 守卫）', () => {
    const e = makeEnemy();
    const s = new Sense(e);
    s.update(0.1, { x: 5, z: 0, y: 1.7 }, null); // alerted
    // 玩家仍贴身（dist 2 < threatRange 3.5），即便丢失视野超 memory 也不脱战
    s.update(10, { x: 2, z: 0, y: 1.7 }, null);
    expect(s.alerted).toBe(true);
  });

  it('拉出 leash 距离 → 脱战并承诺归位', () => {
    const e = makeEnemy({
      position: { x: 200, z: 0 }, // 离出生点 200 > aggroRange(40)*leashScale(3)=120
    });
    const s = new Sense(e);
    s.alerted = true; // 已是追击态
    s.update(0.1, { x: 200, z: 0, y: 1.7 }, null);
    expect(s.alerted).toBe(false);
    expect(s.returning).toBe(true);
  });
});
