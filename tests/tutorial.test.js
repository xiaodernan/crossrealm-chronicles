/**
 * 首次引导链门禁 —— 钉 `ui/Tutorial.js`。
 *
 * 由 `scheduler`（主循环驱动的延时器，非 setTimeout）串起 7 步 toast，末尾再同步任务/
 * 刷新指南/收尾提示。此前零直接测试。几条"写错不抛、只静默错序"的不变量：
 * - **重开引导先撤销上一条链（B39）**：`start()` 开头 `scheduler.clear(TUTORIAL_TAG)`；
 *   否则两轮提示交错弹（上一轮的 step1 会在这一轮的 step0 之后冒出来）。
 * - 7 步各 toast 一次；全部走完再同步 quests、刷新 gameGuide、发收尾提示。
 * - 步骤存的是**文案键**（不是文案），延迟按 (delay+400)ms 续下一步。
 *
 * 用 `scheduler.update(dt)` 固定步长驱动（这正是调度器取代 setTimeout 的原因：可复现）。
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scheduler } from '../src/engine/Scheduler.js';
import { Tutorial } from '../src/ui/Tutorial.js';

function makeDialog() {
  return { toast: vi.fn() };
}
function makeGame() {
  return { quests: { syncProgress: vi.fn() }, gameGuide: { refresh: vi.fn() } };
}
/** 固定步长推进，直到没有待办任务 */
function driveToDone(step = 0.5, guardMax = 500) {
  let g = 0;
  while (scheduler.pending > 0 && g++ < guardMax) scheduler.update(step);
}

beforeEach(() => scheduler.clearAll());

describe('Tutorial 结构', () => {
  it('7 步，每步都有文案键与延迟', () => {
    const t = new Tutorial(makeDialog(), null, makeGame());
    expect(t.steps).toHaveLength(7);
    for (const s of t.steps) {
      expect(typeof s.text).toBe('string');
      expect(s.text.length).toBeGreaterThan(0);
      expect(typeof s.delay).toBe('number');
      expect(s.delay).toBeGreaterThan(0);
    }
  });

  it('构造即开跑：调度器上挂着一条待办', () => {
    new Tutorial(makeDialog(), null, makeGame());
    expect(scheduler.pending).toBe(1); // 1.5s 后的第一步
  });
});

describe('Tutorial 整条链', () => {
  it('7 步各 toast 一次，末尾同步 quests + 刷新 gameGuide + 收尾提示', () => {
    const dialog = makeDialog();
    const game = makeGame();
    new Tutorial(dialog, null, game);
    driveToDone();
    expect(dialog.toast).toHaveBeenCalledTimes(8); // 7 步 + 1 收尾
    expect(game.quests.syncProgress).toHaveBeenCalledTimes(1);
    expect(game.gameGuide.refresh).toHaveBeenCalledTimes(1);
    expect(scheduler.pending).toBe(0); // 链已跑干净
  });
});

describe('Tutorial 重开不交错（B39）', () => {
  it('开第二轮前撤销第一轮未走完的链：上一轮不再冒 step1', () => {
    const a = makeDialog();
    new Tutorial(a, null, makeGame());
    scheduler.update(1.5);              // 第一轮 step0 播出，下一步排在 3.6s 后
    expect(a.toast).toHaveBeenCalledTimes(1);

    const b = makeDialog();
    new Tutorial(b, null, makeGame()); // start() 应 clear 掉第一轮的下一步
    scheduler.update(3.6);             // 第二轮 step0 播出；第一轮的下一步若没清会在此冒 step1
    expect(b.toast).toHaveBeenCalledTimes(1);
    expect(a.toast).toHaveBeenCalledTimes(1); // 关键：第一轮没有 step1 混进来
  });
});
