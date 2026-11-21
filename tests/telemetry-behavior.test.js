import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { localTelemetry } from '../src/game/LocalTelemetry.js';

/**
 * W-Z487 真·行为信号 —— 本机遥测的事件序列读出「在场状态」。
 * jsdom 提供 localStorage；用固定时间避免对真实时钟的依赖。
 */
describe('LocalTelemetry.behaviorSnapshot（W-Z487）', () => {
  const KEY = 'crossrealm_telemetry_v1';
  let real;
  let store;

  beforeEach(() => {
    real = globalThis.localStorage;
    store = Object.create(null);
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    vi.useRealTimers();
  });

  afterEach(() => {
    if (real === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = real;
  });

  it('空缓冲：全部返回保守零值，不编造行为', () => {
    const s = localTelemetry.behaviorSnapshot();
    expect(s).toEqual({ idleSeconds: 0, recentActions: 0, sessionMs: 0, lastEvent: null, total: 0 });
  });

  it('发呆时长 = 距最后一次事件的秒数（上限 86400）', () => {
    const now = Date.now();
    localStorage.setItem(KEY, JSON.stringify([
      { t: now - 90_000, event: 'game_start' },
      { t: now - 30_000, event: 'boss_kill' },
    ]));
    const s = localTelemetry.behaviorSnapshot();
    expect(s.lastEvent).toBe('boss_kill');
    expect(s.idleSeconds).toBeGreaterThanOrEqual(29);
    expect(s.idleSeconds).toBeLessThanOrEqual(31);
    expect(s.total).toBe(2);
  });

  it('recentActions 只数最近 10 秒内的事件（瞎点密度信号）', () => {
    const now = Date.now();
    localStorage.setItem(KEY, JSON.stringify([
      { t: now - 60_000, event: 'game_start' },
      { t: now - 5_000, event: 'help_open' },
      { t: now - 3_000, event: 'journal_open' },
      { t: now - 1_000, event: 'worldmap_open' },
    ]));
    const s = localTelemetry.behaviorSnapshot();
    expect(s.recentActions).toBe(3);
  });

  it('sessionMs 从最近一次 game_start 算起', () => {
    const now = Date.now();
    localStorage.setItem(KEY, JSON.stringify([
      { t: now - 120_000, event: 'game_start' },
      { t: now - 10_000, event: 'boss_kill' },
    ]));
    const s = localTelemetry.behaviorSnapshot();
    expect(s.sessionMs).toBeGreaterThanOrEqual(119_000);
  });

  it('recordSessionEnd 记一条带时长与事件数的 session_end（没耐心就关掉）', () => {
    const now = Date.now();
    localStorage.setItem(KEY, JSON.stringify([
      { t: now - 8_000, event: 'game_start' },
      { t: now - 2_000, event: 'help_open' },
    ]));
    localTelemetry.recordSessionEnd();
    const arr = JSON.parse(localStorage.getItem(KEY));
    const end = arr[arr.length - 1];
    expect(end.event).toBe('session_end');
    expect(end.meta.sessionMs).toBeGreaterThanOrEqual(7_000);
    expect(end.meta.totalEvents).toBe(2);
  });

  it('被污染的 localStorage 不抛异常', () => {
    localStorage.setItem(KEY, '{bad json');
    expect(() => localTelemetry.behaviorSnapshot()).not.toThrow();
  });
});