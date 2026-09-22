import { describe, it, expect, vi } from 'vitest';
import { Scheduler, scheduler } from '../src/engine/Scheduler.js';

/** 用固定步长把一个调度器推进 seconds 秒，返回实际推进的帧数 */
function run(s, seconds, step) {
  let frames = 0;
  let elapsed = 0;
  while (elapsed < seconds - 1e-9) {
    s.update(step);
    elapsed += step;
    frames += 1;
    if (frames > 100000) throw new Error('run() 未收敛');
  }
  return frames;
}

describe('Scheduler', () => {
  it('到期触发一次，且只触发一次', () => {
    const s = new Scheduler();
    const fn = vi.fn();
    s.after(0.5, fn);
    run(s, 1, 0.1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.pending).toBe(0);
  });

  it('未到期不触发，且 pending 如实反映', () => {
    const s = new Scheduler();
    const fn = vi.fn();
    s.after(1, fn);
    s.update(0.4);
    expect(fn).not.toHaveBeenCalled();
    expect(s.pending).toBe(1);
  });

  it('按秒计时，与帧率无关：30 / 60 / 144Hz 在同一个时间点触发', () => {
    const results = [];
    for (const step of [1 / 30, 1 / 60, 1 / 144]) {
      const s = new Scheduler();
      let firedAt = -1;
      let elapsed = 0;
      s.after(0.5, () => { firedAt = elapsed; });
      for (let i = 0; i < 600 && firedAt < 0; i++) {
        s.update(step);
        elapsed += step;
      }
      results.push(firedAt);
    }
    // 三档帧率都落在 0.5 秒之后的第一个整帧上（浮点累加留 1e-9 容差），
    // 且彼此相差不超过一个最大步长
    for (const t of results) expect(t).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(Math.max(...results) - Math.min(...results)).toBeLessThan(1 / 30);
  });

  it('先摘出再执行：回调里 after(0) 不会在同一帧被同步递归', () => {
    const s = new Scheduler();
    const order = [];
    s.after(0, () => {
      order.push('a');
      s.after(0, () => order.push('b'));
    });
    s.update(0.016);
    expect(order).toEqual(['a']);   // b 留到下一帧
    s.update(0.016);
    expect(order).toEqual(['a', 'b']);
  });

  it('0 与负数延时都按"下一帧"处理，不丢任务', () => {
    const s = new Scheduler();
    const a = vi.fn();
    const b = vi.fn();
    s.after(0, a);
    s.after(-5, b);
    expect(s.pending).toBe(2);
    s.update(0.016);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('同帧到期的多个任务按登记顺序执行', () => {
    const s = new Scheduler();
    const order = [];
    s.after(0.1, () => order.push(1));
    s.after(0.1, () => order.push(2));
    s.after(0.1, () => order.push(3));
    run(s, 0.2, 0.05);
    expect(order).toEqual([1, 2, 3]);
  });

  it('clear(tag) 只撤销该分组，其余分组照常', () => {
    const s = new Scheduler();
    const a = vi.fn();
    const b = vi.fn();
    s.after(0.2, a, 'panel');
    s.after(0.2, b, 'hud');
    s.clear('panel');
    expect(s.pending).toBe(1);
    run(s, 0.5, 0.05);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('cancel(id) 精确撤销单个任务', () => {
    const s = new Scheduler();
    const a = vi.fn();
    const b = vi.fn();
    const idA = s.after(0.2, a);
    s.after(0.2, b);
    s.cancel(idA);
    run(s, 0.5, 0.05);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clearAll 清空且不触发', () => {
    const s = new Scheduler();
    const a = vi.fn();
    s.after(0.2, a);
    s.clearAll();
    run(s, 0.5, 0.05);
    expect(a).not.toHaveBeenCalled();
    expect(s.pending).toBe(0);
  });

  it('wait() 返回的 Promise 由主循环兑现（暂停时不偷偷跑完）', async () => {
    const s = new Scheduler();
    let done = false;
    const p = s.wait(0.3).then(() => { done = true; });
    s.update(0.1);
    expect(done).toBe(false);      // 只推进了 0.1 秒
    await Promise.resolve();
    expect(done).toBe(false);
    run(s, 0.3, 0.1);
    await p;
    expect(done).toBe(true);
  });

  it('一个回调抛错不连累同帧到期的其他任务，但异常仍然抛出（不静默）', () => {
    const s = new Scheduler();
    const after = vi.fn();
    s.after(0.1, () => { throw new Error('boom'); });
    s.after(0.1, after);
    expect(() => run(s, 0.2, 0.05)).toThrow('boom');
    expect(after).toHaveBeenCalledTimes(1);
    expect(s.pending).toBe(0);
  });

  it('抛错之后调度器仍可继续使用', () => {
    const s = new Scheduler();
    s.after(0.1, () => { throw new Error('boom'); });
    try { run(s, 0.2, 0.05); } catch { /* 预期 */ }
    const ok = vi.fn();
    s.after(0.1, ok);
    run(s, 0.2, 0.05);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('空表时 update 是纯 no-op（主循环每帧都会调它）', () => {
    const s = new Scheduler();
    expect(() => s.update(0.016)).not.toThrow();
    expect(s.pending).toBe(0);
  });

  it('导出的是模块级单例（与 engine/Shake.js 同一约定）', () => {
    expect(scheduler).toBeInstanceOf(Scheduler);
    const fn = vi.fn();
    scheduler.after(0.05, fn);
    run(scheduler, 0.2, 0.05);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
