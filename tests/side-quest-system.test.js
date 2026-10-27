/**
 * 支线任务系统门禁 —— 钉 `game/SideQuestSystem.js`（自动检测完成）。
 *
 * 用 `vi.mock` 把支线名单换成 3 条可控判据，聚焦逻辑。几条"写错不抛、只静默算错/漏报"的不变量：
 * - **分母与页签同一份名单**：`getProgress().total` 就是遍历用的 `SIDE_QUESTS_ALL.length`
 *   （改前 21 条能完成、分母却数 7 条 → HUD 能显示 "(12/7)"）。
 * - **轮询节流**：`update` 累计到 2s 才 checkAll，不是每帧都问。
 * - **判据抛错隔离且只喊一次**：一条判据抛错不打断这一帧的其余判据，且同一条只 console.error 一次。
 * - **完成副作用**：加魂、toast、写日志、广播 `side-quest-complete`、`stats.onQuestCompleted`。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/content/sideQuests.js', () => ({
  SIDE_QUESTS_ALL: [
    { id: 'q1', title: 't1', reward: 10, journal: 'j1', check: (g) => g.flags.q1 === true },
    { id: 'q2', title: 't2', reward: 20, desc: 'd2', check: (g) => g.flags.q2 === true },
    { id: 'q3', title: 't3', reward: 30, journal: 'j3', check: (g) => { if (g.flags.q3Throw) throw new Error('boom'); return g.flags.q3 === true; } },
  ],
}));

const { SideQuestSystem } = await import('../src/game/SideQuestSystem.js');

let game, sys, completedEvents, capture;

beforeEach(() => {
  completedEvents = [];
  capture = (e) => { completedEvents.push(e.detail); };
  globalThis.window.addEventListener('side-quest-complete', capture);
  game = {
    flags: {},
    stats: { addSouls: vi.fn(), onQuestCompleted: vi.fn() },
    dialog: { toast: vi.fn() },
    storyJournal: { add: vi.fn() },
    quests: { chapter: 3 },
  };
  sys = new SideQuestSystem(game);
});
afterEach(() => {
  globalThis.window.removeEventListener('side-quest-complete', capture);
  sys = null;
});

describe('SideQuestSystem 轮询节流', () => {
  it('update 累计到 2s 才 checkAll（1s 不动）', () => {
    game.flags.q1 = true;
    sys.update(1);
    expect(sys.completed.has('q1')).toBe(false);
    sys.update(1); // 累计 2s
    expect(sys.completed.has('q1')).toBe(true);
  });
});

describe('SideQuestSystem checkAll 完成判定', () => {
  it('判据为真的支线被标完成', () => {
    game.flags.q1 = true;
    game.flags.q2 = true;
    sys.checkAll();
    expect(sys.completed.has('q1')).toBe(true);
    expect(sys.completed.has('q2')).toBe(true);
    expect(sys.completed.has('q3')).toBe(false);
  });

  it('判据抛错隔离且只喊一次（不打断同帧其余判据）', () => {
    game.flags.q3Throw = true;
    game.flags.q1 = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      sys.checkAll();
      expect(sys.completed.has('q1')).toBe(true); // 抛错不拖垮其余
      sys.checkAll(); // 第二次：q3 仍抛，但不该再喊
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('SideQuestSystem complete 副作用', () => {
  it('加魂 / toast / 写日志 / 广播 / onQuestCompleted', () => {
    const q = { id: 'x', title: 't', reward: 50, journal: 'j' };
    sys.complete(q);
    expect(sys.completed.has('x')).toBe(true);
    expect(game.stats.addSouls).toHaveBeenCalledWith(50);
    expect(game.dialog.toast).toHaveBeenCalled();
    expect(game.storyJournal.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'x', category: 'quest', chapter: 3 }));
    expect(completedEvents).toEqual([q]);
    expect(game.stats.onQuestCompleted).toHaveBeenCalledWith('x');
  });
});

describe('SideQuestSystem 分母与存档', () => {
  it('getProgress 的 total = 遍历名单长度（同一份，不是另抄一个数）', () => {
    sys.completed = new Set(['a', 'b']);
    expect(sys.getProgress()).toEqual({ done: 2, total: 3 });
  });

  it('toJSON/fromJSON 存读 completed；null 安全 no-op', () => {
    sys.completed = new Set(['a']);
    expect(sys.toJSON()).toEqual({ completed: ['a'] });
    sys.fromJSON({ completed: ['b', 'c'] });
    expect([...sys.completed].sort()).toEqual(['b', 'c']);
    sys.fromJSON(null);
    expect(sys.completed.size).toBe(2);
  });
});
