import { describe, it, expect, vi } from 'vitest';
import { Observable, ObservableBundle } from '../src/engine/Observable.js';

describe('Observable', () => {
  it('值变化时广播一次，并带上前后值', () => {
    const o = new Observable(0);
    const fn = vi.fn();
    o.subscribe(fn);
    o.set(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 0);
  });

  it('值相同时不广播 —— 这是替代"每帧派发事件"的关键（B41）', () => {
    const o = new Observable(100);
    const fn = vi.fn();
    o.subscribe(fn);
    for (let i = 0; i < 60; i++) o.set(100);
    expect(fn).not.toHaveBeenCalled();
    expect(o.emits).toBe(0);
    // 写入确实发生了 60 次，只是没有通知 —— 用来证明去重起作用而不是根本没写
    expect(o.writes).toBe(60);
    expect(o.value).toBe(100);
  });

  it('量化：同一档位内不广播，但读取方拿到的是最新精确值', () => {
    const o = new Observable(100, { quantize: 0.5 });
    const fn = vi.fn();
    o.subscribe(fn);
    // 100.00–100.24 都落在同一档（round(200.0..200.48) === 200）
    o.set(100.1);
    o.set(100.2);
    o.set(100.24);
    expect(fn).not.toHaveBeenCalled();
    expect(o.value).toBeCloseTo(100.24, 5); // 但值是最新的
    o.set(100.3);                           // round(200.6) === 201，跨档
    expect(fn).toHaveBeenCalledTimes(1);
    // 初值 100 本身就在 200 档，所以第一次 set 不该算变化
    expect(o.emits).toBe(1);
  });

  it('量化按档位比较而不是按"有没有写入"：来回微调不产生事件洪流', () => {
    const o = new Observable(100, { quantize: 0.5 });
    const fn = vi.fn();
    o.subscribe(fn);
    for (let i = 0; i < 30; i++) {
      o.set(100.0 + (i % 4) * 0.05); // 只在 100.00–100.15 之间抖
    }
    expect(fn).not.toHaveBeenCalled();
    expect(o.writes).toBe(30);
  });

  it('量化在"精力逐帧回复"这种连续量上仍然把 60 帧压成个位数次通知', () => {
    const o = new Observable(0, { quantize: 0.5 });
    const fn = vi.fn();
    o.subscribe(fn);
    // 每帧 +0.1，跑 60 帧（= 6 点精力）
    for (let i = 0; i < 60; i++) o.set((i + 1) * 0.1);
    // 不量化会是 60 次；量化 0.5 之后只该在跨档时通知
    expect(fn.mock.calls.length).toBeLessThanOrEqual(13);
    expect(fn.mock.calls.length).toBeGreaterThan(0);
  });

  it('量化步长为 0 / 未配置时不量化，逐帧变化逐帧通知', () => {
    const o = new Observable(0);
    const fn = vi.fn();
    o.subscribe(fn);
    o.set(0.0001);
    o.set(0.0002);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('subscribe 返回的退订函数真的摘掉订阅', () => {
    const o = new Observable(0);
    const fn = vi.fn();
    const off = o.subscribe(fn);
    expect(o.subscriberCount).toBe(1);
    o.set(1);
    off();
    o.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(o.subscriberCount).toBe(0);
  });

  it('逃逸中的异常不阻断后续订阅者（与 setTimeout 的隔离语义一致）', () => {
    const o = new Observable(0);
    const second = vi.fn();
    o.subscribe(() => { throw new Error('boom'); });
    o.subscribe(second);
    expect(() => o.set(1)).toThrow('boom');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('emit() 强制广播：值没变但要刷新 UI（读档 / 重生）', () => {
    const o = new Observable(50);
    const fn = vi.fn();
    o.subscribe(fn);
    o.set(50);
    expect(fn).not.toHaveBeenCalled();
    o.emit();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(50, 50);
  });

  it('set 返回是否变化，便于调用方按需做额外工作', () => {
    const o = new Observable(1);
    expect(o.set(1)).toBe(false);
    expect(o.set(2)).toBe(true);
  });

  it('对象值按引用比较（不深比较，避免热路径上意外昂贵）', () => {
    const o = new Observable({ a: 1 });
    const fn = vi.fn();
    o.subscribe(fn);
    const same = o.value;
    o.set(same);
    expect(fn).not.toHaveBeenCalled();
    o.set({ a: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ObservableBundle', () => {
  const build = () => new ObservableBundle({
    stamina: new Observable(100, { quantize: 0.5 }),
    hp: new Observable(100, { quantize: 1 }),
    combo: new Observable(0),
  });

  it('set 只广播真正变化的字段，并回传变化的字段名', () => {
    const b = build();
    const seen = [];
    b.subscribeAll((name, v) => seen.push([name, v]));
    const changed = b.set({ stamina: 100, hp: 88, combo: 0 });
    expect(changed).toEqual(['hp']);
    expect(seen).toEqual([['hp', 88]]);
  });

  it('subscribeAll 返回的退订函数摘掉全部字段', () => {
    const b = build();
    const fn = vi.fn();
    const off = b.subscribeAll(fn);
    b.set({ hp: 90 });
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    b.set({ hp: 80, combo: 3 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(b.get('hp').subscriberCount).toBe(0);
    expect(b.get('combo').subscriberCount).toBe(0);
  });

  it('get 对未知字段抛错而不是安静返回 undefined', () => {
    const b = build();
    expect(() => b.get('mana')).toThrow(/未知字段/);
  });

  it('set 对未知字段是安静跳过（载荷常由调用方拼装，不该因为多带一个键就炸）', () => {
    const b = build();
    expect(() => b.set({ mana: 30 })).not.toThrow();
  });
});
