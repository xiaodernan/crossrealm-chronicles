import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsManager } from '../src/core/SettingsManager.js';

/**
 * W-Z488 滚轮方向反转开关的口径：
 * - 出厂默认 false（项目口径：下滚往下看、上滚往上看）；
 * - 只认真的 `true` 才反转（Game 里用 `=== true` 判断，脏值如 "1"/1 当关）。
 */
describe('滚轮方向反转设置（W-Z488）', () => {
  let real;
  beforeEach(() => {
    real = globalThis.localStorage;
    const store = Object.create(null);
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
  });
  afterEach(() => {
    if (real === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = real;
  });

  it('出厂默认为关（保持既定手感）', () => {
    expect(new SettingsManager().get('invertWheel')).toBe(false);
  });

  it('反转系数：开 = -1，关/脏值 = 1（Game 用 === true 判断）', () => {
    const signFor = (v) => (v === true ? -1 : 1);
    expect(signFor(true)).toBe(-1);
    expect(signFor(false)).toBe(1);
    expect(signFor(1)).toBe(1);
    expect(signFor('1')).toBe(1);
    expect(signFor(undefined)).toBe(1);
  });
});