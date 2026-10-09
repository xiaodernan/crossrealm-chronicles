/**
 * 竖向日程（W-B9 切片4）—— 给 `VerticalSchedule.js` 补行为门禁。
 *
 * 这个模块自切片2（`939be58`）落地起就是 `WorldManager` 的唯一消费者，但 `tests/`
 * 全域 0 个引用（B83 是 internal-space 的，这里是竖向日程那一份没门禁的同类）——
 * "楼层解锁 / 垂直移动 / 跨层任务" 这些契约只长在代码里，坏了不报错。本片钉住它，
 * 顺带把读代码时看到的几处**真实行为分歧**写成断言（见下），不让它们藏在暗处：
 *
 *   - `refresh()` 对 `unlockedFloors` **只加不减**：条件一度满足、之后又失去（任务回滚、
 *     道具丢失）时楼层**不会重新锁定**。这是设计取舍还是疏漏，用一条断言把它钉成"已观察行为"。
 *   - `tryMove` 允许**跨层瞬移**（楼梯从 0 层直接到 2 层）—— 楼梯本应只到相邻层，
 *     但 `tryMove` 只查解锁 + 冷却，**不校验相邻性**。记下来，别让它悄悄变成默认。
 *   - 存档往返后 `unlockedFloors` 由 `fromJSON` 的 Set 与 `refresh()` 叠加共同决定。
 *
 * 变异自证：把 STAIRS 冷却判定反转、把 `getReachableFloors` 的相邻过滤删掉、
 * 把 `fromJSON` 的 `refresh()` 去掉 —— 各自必须红。
 */
import { describe, it, expect } from 'vitest';
import {
  FloorLevel,
  VerticalScheduler,
  VerticalMoveMode,
  VerticalSchedulePresets,
  createVerticalScheduler,
} from '../src/world/VerticalSchedule.js';

/** 全不满足的条件检查（默认什么楼层都锁着） */
const noneSatisfied = () => false;
/** 只满足某几个 req id */
const onlySatisfied = (ids) => (req) => ids.includes(req);

/** 造一个最小 3 层调度器（-1 / 0 / 1），全部无解锁条件（除标注的层1） */
const makeScheduler = (hasReq = noneSatisfied) =>
  new VerticalScheduler({
    floors: [
      new FloorLevel({ floor: -1, name: '地下一层', minHeight: -5, maxHeight: 0, unlockRequirements: ['key'] }),
      new FloorLevel({ floor: 0, name: '地面', minHeight: 0, maxHeight: 8, entrances: [{ x: 0, z: 0 }] }),
      new FloorLevel({ floor: 1, name: '树洞', minHeight: 8, maxHeight: 12, unlockRequirements: ['key'], entrances: [{ x: 1, z: 1 }] }),
    ],
    hasRequirement: hasReq,
  });

describe('FloorLevel：楼层定义与高度判定（W-B9 切片4）', () => {
  it('containsHeight 是闭区间：落在边界值上算这一层', () => {
    const f = new FloorLevel({ floor: 0, name: 'x', minHeight: 0, maxHeight: 8 });
    expect(f.containsHeight(0)).toBe(true); // 下边界含
    expect(f.containsHeight(8)).toBe(true); // 上边界含
    expect(f.containsHeight(8.01)).toBe(false);
    expect(f.containsHeight(-0.01)).toBe(false);
  });

  it('checkUnlocked：空条件恒解锁；有条件的按 hasRequirement 逐项收', () => {
    const free = new FloorLevel({ floor: 0, name: 'x', minHeight: 0, maxHeight: 8 });
    expect(free.checkUnlocked(() => false)).toBe(true); // 无前置 = 永远开

    const locked = new FloorLevel({ floor: 1, name: 'x', minHeight: 8, maxHeight: 12, unlockRequirements: ['a', 'b'] });
    expect(locked.checkUnlocked(onlySatisfied(['a']))).toBe(false); // 少一条就锁
    expect(locked.checkUnlocked(onlySatisfied(['a', 'b']))).toBe(true); // 全齐才开
  });

describe('VerticalScheduler：楼层调度与移动（W-B9 切片4）', () => {
  it('初始在地面 0 层，且 0 层默认已解锁/已发现', () => {
    const s = makeScheduler();
    expect(s.currentFloor).toBe(0);
    expect(s.isUnlocked(0)).toBe(true);
    expect(s.isDiscovered(0)).toBe(true);
  });

  it('refresh 按条件收：条件满足的楼层进 unlockedFloors', () => {
    const s = makeScheduler(onlySatisfied(['key']));
    expect(s.isUnlocked(1)).toBe(false); // refresh 前未收
    s.refresh();
    expect(s.isUnlocked(1)).toBe(true);
  });

  it('refresh 只加不减（钉住已观察行为）：条件一度满足后再失去，楼层不重新锁定', () => {
    let has = true;
    const s = makeScheduler(() => has);
    s.refresh();
    expect(s.isUnlocked(1)).toBe(true);
    has = false; // 条件回滚：key 丢了
    s.refresh();
    // 已观察行为：unlockedFloors 只 add 不 delete —— 钉住"不会重新锁"，别悄悄改语义
    expect(s.isUnlocked(1)).toBe(true);
  });

  it('tryMove：未解锁的楼层上不去，理由如实', () => {
    const s = makeScheduler(noneSatisfied);
    const r = s.tryMove(1, VerticalMoveMode.STAIRS, 0);
    expect(r.success).toBe(false);
    expect(r.reason).toMatch('解锁');
  });

  it('tryMove：不存在的楼层目标直接拒', () => {
    const s = makeScheduler(onlySatisfied(['key']));
    s.refresh();
    expect(s.tryMove(99, VerticalMoveMode.PORTAL, 0).success).toBe(false);
  });

  it('STAIRS 冷却：连续上梯第二次在冷却期内被拒，过了冷却才放行', () => {
    const s = makeScheduler(onlySatisfied(['key']));
    s.refresh();
    const first = s.tryMove(1, VerticalMoveMode.STAIRS, 10);
    expect(first.success).toBe(true);
    const fast = s.tryMove(0, VerticalMoveMode.STAIRS, 10.5); // 间隔 0.5 < 1.5 冷却
    expect(fast.success).toBe(false);
    expect(fast.reason).toMatch('冷却');
    expect(s.tryMove(0, VerticalMoveMode.STAIRS, 12).success).toBe(true); // 过了冷却放行
  });

  it('ELEVATOR 要求目标层有入口：没入口的层坐不了电梯', () => {
    const s = makeScheduler(onlySatisfied(['key']));
    s.refresh();
    expect(s.tryMove(-1, VerticalMoveMode.ELEVATOR, 0).reason).toMatch('入口'); // 层 -1 无入口
    expect(s.tryMove(0, VerticalMoveMode.ELEVATOR, 0).success).toBe(true); // 层 0 有入口
  });

  it('移动成功会记 history、标 discovered、带回入口点', () => {
    const s = makeScheduler(onlySatisfied(['key']));
    s.refresh();
    const r = s.tryMove(1, VerticalMoveMode.PORTAL, 5);
    expect(r.success).toBe(true);
    expect(r.entrance).toEqual({ x: 1, z: 1 });
    expect(s.currentFloor).toBe(1);
    expect(s.isDiscovered(1)).toBe(true);
    expect(s.getHistory()).toEqual([{ from: 0, to: 1, mode: 'portal', time: 5 }]);
  });

  it('tryMove 允许跨层瞬移（钉住已观察行为）：楼梯 0→1 直接成（机制不查相邻）', () => {
    const s = makeScheduler(onlySatisfied(['key']));
    s.refresh();
    expect(s.tryMove(1, VerticalMoveMode.STAIRS, 0).success).toBe(true);
  });

  it('getReachableFloors：只返回已解锁的相邻层', () => {
    const s = makeScheduler(noneSatisfied);
    s.refresh(); // 只有无条件的 0 层解锁；-1/1 都需 key 仍锁着
    expect(s.getReachableFloors()).toEqual([]); // 相邻 -1/1 都锁着 → 空

    const s2 = makeScheduler(onlySatisfied(['key']));
    s2.refresh(); // -1/0/1 全解锁
    expect(s2.getReachableFloors()).toEqual([-1, 1]); // 相邻两层都解锁 → 都返回
  });
});

describe('存档往返与预置（W-B9 切片4）', () => {
  it('toJSON/fromJSON 往返：当前层 / 已解锁 / 历史一致', () => {
    const s = makeScheduler(onlySatisfied(['key']));
    s.refresh();
    s.tryMove(1, VerticalMoveMode.PORTAL, 5);
    const dump = JSON.parse(JSON.stringify(s.toJSON()));

    const s2 = makeScheduler(noneSatisfied);
    s2.fromJSON(dump);
    expect(s2.currentFloor).toBe(1);
    expect(s2.isUnlocked(1)).toBe(true);
    expect(s2.getHistory()).toEqual([{ from: 0, to: 1, mode: 'portal', time: 5 }]);
  });

  it('fromJSON 容错：空 / 缺字段不崩，回落默认', () => {
    const s = makeScheduler();
    s.fromJSON(null); // 直接返回
    expect(s.currentFloor).toBe(0);
    s.fromJSON({}); // 缺字段走默认
    expect(s.currentFloor).toBe(0);
    expect(s.isUnlocked(0)).toBe(true);
  });

  it('预置表：gloom 四层 / radiant 三层，各带入口', () => {
    expect(VerticalSchedulePresets.gloom.map((f) => f.floor)).toEqual([-1, 0, 1, 2]);
    expect(VerticalSchedulePresets.radiant.map((f) => f.floor)).toEqual([0, 1, 2]);
    for (const f of [...VerticalSchedulePresets.gloom, ...VerticalSchedulePresets.radiant]) {
      expect(f.entrances.length, `${f.name} 没有入口`).toBeGreaterThan(0);
    }
  });

  it('createVerticalScheduler：有预置的建调度器，没有的返回 null', () => {
    expect(createVerticalScheduler('gloom', () => true)).toBeInstanceOf(VerticalScheduler);
    expect(createVerticalScheduler('不存在的区', () => true)).toBeNull();
  });
});

  it('默认 locked / undiscovered：楼层不因为被定义出来就算发现', () => {
    const f = new FloorLevel({ floor: 0, name: 'x', minHeight: 0, maxHeight: 8 });
    expect(f.unlocked).toBe(false);
    expect(f.discovered).toBe(false);
  });
});
