/**
 * 地下城通关记录门禁 —— 钉 `game/DungeonRunTracker.js`。
 *
 * 通过真实 `EventBus`（原生 window 事件）驱动。几条"写错不抛、只静默记错"的不变量：
 * - **用时是世界时（B118）**：`dungeon-enter` 起表，`update(dt)` 才推进 —— 玩家开着暂停菜单
 *   的时间不算进"副本用时"（改前存 `performance.now()`，日志里 60s 全是菜单时间）。
 * - **房间数**：`dungeon-room-enter` 累加；`dungeon-cleared` 落一条记录并广播 `dungeon-run-logged`。
 * - **无 id 的 cleared 是 no-op**；没有 activeRun 时 cleared → 用时 0、房间 0。
 * - 记录上限 40 条；`getStats` 汇总；`toJSON/fromJSON` 存读 clears/runs。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { DungeonRunTracker } from '../src/game/DungeonRunTracker.js';

let logged, tracker, capture, game;

beforeEach(() => {
  logged = [];
  capture = (e) => { logged.push(e.detail); };
  globalThis.window.addEventListener('dungeon-run-logged', capture);
  game = { quests: { chapter: 2 } };
  tracker = new DungeonRunTracker(game);
});
afterEach(() => {
  tracker?.dispose();
  globalThis.window.removeEventListener('dungeon-run-logged', capture);
  tracker = null;
});

describe('DungeonRunTracker 用时是世界时（B118）', () => {
  it('enter → update(10)+update(5) → cleared：用时 = 15（不是墙钟）', () => {
    emit('dungeon-enter', { id: 'd1' });
    tracker.update(10);
    tracker.update(5);
    emit('dungeon-cleared', { id: 'd1' });
    expect(tracker.runs[0].elapsed).toBe(15);
    expect(logged.at(-1)).toMatchObject({ id: 'd1', elapsed: 15, chapter: 2 });
  });

  it('没有 activeRun 时 cleared：用时 0、房间 0（不崩）', () => {
    emit('dungeon-cleared', { id: 'd9' });
    expect(tracker.runs[0]).toMatchObject({ id: 'd9', elapsed: 0, rooms: 0 });
  });
});

describe('DungeonRunTracker 房间数与清除计数', () => {
  it('dungeon-room-enter 累加房间数', () => {
    emit('dungeon-enter', { id: 'd1' });
    emit('dungeon-room-enter');
    emit('dungeon-room-enter');
    emit('dungeon-room-enter');
    emit('dungeon-cleared', { id: 'd1' });
    expect(tracker.runs[0].rooms).toBe(3);
  });

  it('多次清除同一副本：clears 累加、getStats 汇总', () => {
    emit('dungeon-cleared', { id: 'd1' });
    emit('dungeon-cleared', { id: 'd1' });
    emit('dungeon-cleared', { id: 'd2' });
    expect(tracker.clears.d1).toBe(2);
    expect(tracker.getStats()).toEqual({ totalClears: 3, dungeons: 2, runs: 3 });
  });

  it('无 id 的 cleared 是 no-op', () => {
    emit('dungeon-cleared', {});
    expect(tracker.runs).toHaveLength(0);
    expect(Object.keys(tracker.clears)).toHaveLength(0);
  });
});

describe('DungeonRunTracker 上限与存档', () => {
  it('记录上限 40 条（unshift + pop）', () => {
    for (let i = 0; i < 41; i += 1) {
      emit('dungeon-enter', { id: 'd' });
      emit('dungeon-cleared', { id: 'd' });
    }
    expect(tracker.runs).toHaveLength(40);
    expect(tracker.clears.d).toBe(41); // 计数不封顶，只有 runs 列表封顶
  });

  it('toJSON/fromJSON 存读 clears 与 runs', () => {
    emit('dungeon-cleared', { id: 'd1' });
    const json = tracker.toJSON();
    expect(json.clears).toEqual({ d1: 1 });
    expect(json.runs).toHaveLength(1);

    tracker.clears = {};
    tracker.runs = [];
    tracker.fromJSON(json);
    expect(tracker.clears.d1).toBe(1);
    expect(tracker.runs).toHaveLength(1);
    tracker.fromJSON(null); // 空档 → 安全 no-op
    expect(tracker.clears.d1).toBe(1);
  });
});
