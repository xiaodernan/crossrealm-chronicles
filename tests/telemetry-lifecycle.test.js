import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { localTelemetry, installSessionLifecycle } from '../src/game/LocalTelemetry.js';

/**
 * W-Z500 会话边界：切标签不该永久掐死留存信号，同一次离开不该双记。
 */
describe('会话边界生命周期（W-Z500）', () => {
  const KEY = 'crossrealm_telemetry_v1';
  let real;
  let store;
  let listeners;

  beforeEach(() => {
    real = globalThis.localStorage;
    store = Object.create(null);
    globalThis.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
    listeners = {};
    const now = Date.now();
    store[KEY] = JSON.stringify([{ t: now - 60_000, event: 'game_start' }]);
  });
  afterEach(() => {
    if (real === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = real;
  });

  function makeDom(state = 'visible') {
    const doc = {
      visibilityState: state,
      addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
      removeEventListener: vi.fn(),
    };
    const win = {
      addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
      removeEventListener: vi.fn(),
    };
    return { win, doc, fire: (name) => (listeners[name] || []).forEach((fn) => fn()) };
  }

  it('切后台记一次 session_end，回到前台再切走还能再记（不永久掐死）', () => {
    const { win, doc, fire } = makeDom('hidden');
    installSessionLifecycle(win, doc);
    fire('visibilitychange');
    let arr = JSON.parse(store[KEY]);
    expect(arr.filter((e) => e.event === 'session_end').length).toBe(1);

    doc.visibilityState = 'visible';
    fire('visibilitychange'); // 回前台重新武装
    doc.visibilityState = 'hidden';
    fire('visibilitychange'); // 再切走
    arr = JSON.parse(store[KEY]);
    expect(arr.filter((e) => e.event === 'session_end').length).toBe(2);
  });

  it('hidden 之后紧接 pagehide 不双记（防同一次离开两条）', () => {
    const { win, doc, fire } = makeDom('hidden');
    installSessionLifecycle(win, doc);
    fire('visibilitychange'); // hidden -> 记
    fire('pagehide');          // 同一次离开 -> 不该再记
    const arr = JSON.parse(store[KEY]);
    expect(arr.filter((e) => e.event === 'session_end').length).toBe(1);
  });

  it('只有 pagehide（桌面直接关页）也能记', () => {
    const { win, doc, fire } = makeDom('visible');
    installSessionLifecycle(win, doc);
    fire('pagehide');
    const arr = JSON.parse(store[KEY]);
    expect(arr.filter((e) => e.event === 'session_end').length).toBe(1);
  });
});