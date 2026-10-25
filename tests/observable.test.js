/**
 * 可变观测量门禁 —— 钉 `engine/Observable.js`（B41：取代每帧派发 CustomEvent）。
 *
 * `Observable` / `ObservableBundle` 是纯净反应式原语（不碰 DOM/THREE），被
 * CombatController（精力）/ SpellSystem（法力）等持有，但 refs=1、行为覆盖薄。
 * 这批不变量都"写错不抛、只静默改变表现"，正是跑测试发现不了的一族：
 * - **去重**：同量化档位内 set 不广播，但**值仍写为最新精确值**（读取方拿最新）；
 * - **quantize**：按步长量化后比较，跨档才广播；
 * - **-0/0**：归零不算变化（`-0 === 0`）；
 * - **错误隔离**：一个订阅者抛错不连累其余，全部跑完后把**第一个**异常原样抛出；
 * - **emit**：强制广播（值没变也通知）；
 * - **退订**：subscribe 返回退订函数；Bundle.subscribeAll 一次性退订全部。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi } from 'vitest';
import { Observable, ObservableBundle } from '../src/engine/Observable.js';

describe('Observable 去重广播', () => {
  it('初值可读', () => {
    expect(new Observable(5).value).toBe(5);
  });

  it('值变化 → 返回 true、emits++、订阅者收到 (next, prev)', () => {
    const o = new Observable(1);
    const fn = vi.fn();
    o.subscribe(fn);
    expect(o.set(2)).toBe(true);
    expect(o.emits).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(2, 1);
    expect(o.value).toBe(2);
  });

  it('值未变化（无 quantize 同值）→ 返回 false、不广播，但 writes++', () => {
    const o = new Observable(1);
    const fn = vi.fn();
    o.subscribe(fn);
    expect(o.set(1)).toBe(false);
    expect(o.emits).toBe(0);
    expect(o.writes).toBe(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('同量化档位内：不广播，但值写为最新精确值；跨档才广播', () => {
    const o = new Observable(1.0, { quantize: 1 });
    const fn = vi.fn();
    o.subscribe(fn);
    expect(o.set(1.4)).toBe(false); // round(1.4)=1 == round(1.0)=1
    expect(o.emits).toBe(0);
    expect(o.value).toBe(1.4); // 读取方必须拿到最新精确值
    expect(o.set(1.6)).toBe(true); // round(1.6)=2 != 1
    expect(o.emits).toBe(1);
    expect(o.value).toBe(1.6);
  });

  it('writes 累计所有写入（含未变化），emits 只算真广播', () => {
    const o = new Observable(0);
    o.set(0); o.set(0); o.set(1); o.set(1); o.set(2);
    expect(o.writes).toBe(5);
    expect(o.emits).toBe(2); // 0→1、1→2
  });
});

describe('Observable -0/0 与 emit', () => {
  it('-0 与 0 不算变化（归零不误报）', () => {
    const o = new Observable(0);
    const fn = vi.fn();
    o.subscribe(fn);
    expect(o.set(-0)).toBe(false);
    expect(fn).not.toHaveBeenCalled();
    expect(o.emits).toBe(0);
  });

  it('emit() 强制广播一次（无值变化也通知），订阅者收到 (value, value)', () => {
    const o = new Observable(7);
    const fn = vi.fn();
    o.subscribe(fn);
    o.emit();
    expect(o.emits).toBe(1);
    expect(fn).toHaveBeenCalledWith(7, 7);
  });
});

describe('Observable 订阅者错误隔离', () => {
  it('一个订阅者抛错不连累其他，且把第一个异常原样抛出', () => {
    const o = new Observable(1);
    const second = vi.fn();
    o.subscribe(() => { throw new Error('boom'); });
    o.subscribe(second);
    expect(() => o.set(2)).toThrow('boom');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('多个抛错时抛出的是第一个', () => {
    const o = new Observable(1);
    o.subscribe(() => { throw new Error('first'); });
    o.subscribe(() => { throw new Error('second'); });
    expect(() => o.set(2)).toThrow('first');
  });
});

describe('Observable 退订', () => {
  it('subscribe 返回退订函数，退订后 subscriberCount 降、不再收到通知', () => {
    const o = new Observable(1);
    const fn = vi.fn();
    const off = o.subscribe(fn);
    expect(o.subscriberCount).toBe(1);
    o.set(2);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    expect(o.subscriberCount).toBe(0);
    o.set(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ObservableBundle', () => {
  const makeBundle = () => new ObservableBundle({
    hp: new Observable(100),
    mp: new Observable(50, { quantize: 1 }),
  });

  it('get 未知字段抛错', () => {
    expect(() => makeBundle().get('nope')).toThrow();
  });

  it('set 只返回实际变化的字段名（恒等未变不入列）', () => {
    const b = makeBundle();
    const changed = b.set({ hp: 90, mp: 50 }); // hp 100→90 变；mp 50→50 恒等不变
    expect(changed).toEqual(['hp']);
    expect(b.get('hp').value).toBe(90);
  });

  it('subscribeAll 订阅全部字段、回调带 name；off 一次性退订全部', () => {
    const b = makeBundle();
    const fn = vi.fn();
    const off = b.subscribeAll(fn);
    b.set({ hp: 80 }); // 只有 hp 变
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('hp', 80, 100);
    off();
    b.set({ hp: 70 });
    expect(fn).toHaveBeenCalledTimes(1); // 退订后不再调用
  });
});
