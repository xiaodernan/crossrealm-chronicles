/**
 * 帧计数出口门禁（W-E2 切片1）。
 *
 * `src/engine/FrameBudget.js` 只管一件事：本帧是第几帧。主循环每帧
 * `tick()` 一下，别处只读不写。这条门禁钉住：
 *   - 从 1 开始递增（不是从 0，首帧可分辨）；
 *   - `shouldUpdate(interval)` 按 `frameCount % interval === 0`，统一分母；
 *   - interval 必须是正整数，非法值当场抛；
 *   - `resetForTest()` 只供测试/重置用（生产不许调，源码扫描一眼认出名字）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  tick,
  currentFrame,
  shouldUpdate,
  resetForTest,
} from '../src/engine/FrameBudget.js';
import {
  tick as tickB,
  currentFrame as currentFrameB,
} from '../src/engine/FrameBudget.js';

describe('FrameBudget：帧计数出口', () => {
  beforeEach(() => {
    // 模块级单例，测试间不得带账；resetForTest 是本模块唯一归零出口，测试里用它。
    resetForTest();
  });

  it('首帧 tick() 返回 1，之后逐帧递增', () => {
    expect(tick()).toBe(1);
    expect(tick()).toBe(2);
    expect(tick()).toBe(3);
    expect(currentFrame()).toBe(3);
  });

  it('currentFrame() 只读，不改变计数', () => {
    tick(); tick(); tick();
    expect(currentFrame()).toBe(3);
    expect(currentFrame()).toBe(3); // 读两次不累加
    expect(tick()).toBe(4);
  });

  it('shouldUpdate 按帧求余：interval 为 2 时每两帧真一次', () => {
    const 结果 = [];
    for (let i = 0; i < 6; i += 1) {
      tick();
      结果.push(shouldUpdate(2));
    }
    expect(结果).toEqual([false, true, false, true, false, true]);
  });

  it('interval 为 1 时每帧都真，interval 为 60 时每 60 帧一真', () => {
    for (let i = 0; i < 3; i += 1) {
      tick();
      expect(shouldUpdate(1)).toBe(true);
    }
    resetForTest();
    const 命中 = [];
    for (let i = 0; i < 121; i += 1) {
      tick();
      if (shouldUpdate(60)) 命中.push(currentFrame());
    }
    expect(命中).toEqual([60, 120]);
  });

  it('interval 非正整数当场抛（不静默放行）', () => {
    tick();
    expect(() => shouldUpdate(0)).toThrow();
    expect(() => shouldUpdate(-1)).toThrow();
    expect(() => shouldUpdate(1.5)).toThrow();
    expect(() => shouldUpdate(NaN)).toThrow();
    // 合法值不抛，计数继续递增（异常被 toThrow 捕获，不污染帧计数）
    expect(tick()).toBe(2);      // 帧 2：是 2 的倍数
    expect(shouldUpdate(2)).toBe(true);
    expect(tick()).toBe(3);      // 帧 3：不是 2 的倍数
    expect(shouldUpdate(2)).toBe(false);
  });

  it('多处 import 拿到同一份计数（模块级单例，不是每份副本各自计数）', () => {
    expect(tickB).toBe(tick);
    expect(currentFrameB).toBe(currentFrame);
    expect(tick()).toBe(1);
    expect(tickB()).toBe(2);
    expect(currentFrameB()).toBe(2);
  });

  it('resetForTest 归零后重新从 1 开始', () => {
    tick(); tick(); tick();
    resetForTest();
    expect(currentFrame()).toBe(0);
    expect(tick()).toBe(1);
    expect(tick()).toBe(2);
  });
});
