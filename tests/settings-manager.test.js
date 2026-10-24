import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SettingsManager, migrateLegacySettings } from '../src/core/SettingsManager.js';

const KEY = 'crossrealm_settings';

/**
 * 构造期引用隔离（W-D3 / W-D6 那几格对象型默认值）。
 *
 * `SettingsManager` 把 `keybinds / gamepadBinds / gamepadUiBinds / padTuning` 四格做成
 * "与出厂 `DEFAULTS` 不共享引用" 的独立对象 —— 否则玩家一改键（`set()` 就地写
 * `this.data.keybinds`），就会把出厂设定也改掉，下一个 `new SettingsManager()` 读到的是
 * 被污染过的默认值。这是"共享引用污染出厂数据"那一族 bug，跑测试发现不了，只有钉住
 * "实例字段 !== 出厂字段" 才防得住。
 *
 * 真正的代码路径都走 `new SettingsManager()` 真构造，不抄那一行。
 */
describe('SettingsManager · 构造期对象型默认值引用隔离', () => {
  const real = globalThis.localStorage;
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
  });
  afterEach(() => { globalThis.localStorage = real; });

  const FIELDS = ['keybinds', 'gamepadBinds', 'gamepadUiBinds', 'padTuning'];

  it('四格对象型默认值各自独立、且不共享出厂 DEFAULTS 引用', () => {
    const m = new SettingsManager();
    for (const f of FIELDS) {
      expect(m.data[f]).not.toBe(m.defaults[f]);
    }
    // 四格彼此也不共享同一对象
    expect(m.data.keybinds).not.toBe(m.data.gamepadBinds);
    expect(m.data.keybinds).not.toBe(m.data.gamepadUiBinds);
    expect(m.data.keybinds).not.toBe(m.data.padTuning);
    expect(m.data.gamepadBinds).not.toBe(m.data.gamepadUiBinds);
    expect(m.data.gamepadBinds).not.toBe(m.data.padTuning);
    expect(m.data.gamepadUiBinds).not.toBe(m.data.padTuning);
  });

  it('就地改 keybinds 不污染出厂 DEFAULTS（共享引用会污染）', () => {
    const m = new SettingsManager();
    const snapshot = JSON.stringify(m.defaults.keybinds);
    m.data.keybinds['Jump'] = 'KeyX';
    expect(JSON.stringify(m.defaults.keybinds)).toBe(snapshot);
  });

  it('就地改 gamepadBinds 不污染出厂 DEFAULTS', () => {
    const m = new SettingsManager();
    const snapshot = JSON.stringify(m.defaults.gamepadBinds);
    m.data.gamepadBinds['Roll'] = 'b';
    expect(JSON.stringify(m.defaults.gamepadBinds)).toBe(snapshot);
  });

  it('就地改 gamepadUiBinds 不污染出厂 DEFAULTS', () => {
    const m = new SettingsManager();
    const snapshot = JSON.stringify(m.defaults.gamepadUiBinds);
    m.data.gamepadUiBinds['Confirm'] = 'a';
    expect(JSON.stringify(m.defaults.gamepadUiBinds)).toBe(snapshot);
  });
});

describe('SettingsManager · get / set / load / migrate', () => {
  const real = globalThis.localStorage;
  let store;
  beforeEach(() => {
    store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
  });
  afterEach(() => { globalThis.localStorage = real; });

  it('get 优先返回存储值，缺省回落出厂默认值', () => {
    const m = new SettingsManager();
    expect(m.get('shadows')).toBe(true); // 出厂默认
    expect(m.get('captions')).toBe(false); // 出厂默认
    m.set('shadows', false);
    expect(m.get('shadows')).toBe(false); // 存储值优先
  });

  it('set 写入并派发 settings-changed、持久化到 localStorage', () => {
    const events = [];
    const handler = (e) => events.push(e.detail);
    window.addEventListener('settings-changed', handler);
    try {
      const m = new SettingsManager();
      m.set('showFps', false);
      expect(events).toHaveLength(1);
      expect(events[0].showFps).toBe(false);
      const raw = JSON.parse(store.get(KEY));
      expect(raw.version).toBe(2);
      expect(raw.values.showFps).toBe(false);
    } finally {
      window.removeEventListener('settings-changed', handler);
    }
  });

  it('load 认 v2 {version, values}，其余格回落默认', () => {
    store.set(KEY, JSON.stringify({ version: 2, values: { shadows: false } }));
    const m = new SettingsManager();
    expect(m.get('shadows')).toBe(false);
    expect(m.get('showFps')).toBe(true);
  });

  it('load 认 v1 扁平并只搬认识的键（丢未知键）', () => {
    store.set(KEY, JSON.stringify({ shadows: false, someFutureKey: 123 }));
    const m = new SettingsManager();
    expect(m.get('shadows')).toBe(false);
    expect(m.data).not.toHaveProperty('someFutureKey');
  });

  it('load 遇损坏 JSON 回落空（不抛）', () => {
    store.set(KEY, '{not json');
    expect(() => new SettingsManager()).not.toThrow();
  });

  it('migrateLegacySettings 只保留 DEFAULTS 认识的键，且不为缺失键填 undefined', () => {
    const out = migrateLegacySettings({ shadows: false, bogus: 1, captions: true });
    expect(out).toEqual({ shadows: false, captions: true });
    expect(out).not.toHaveProperty('bogus');
    // 缺的键绝不能以 undefined 形式混入 —— 否则 `{…DEFAULTS, …loaded}` 会用 undefined
    // 覆盖出厂值（hasOwnProperty 守卫存在的真正理由；丢未知键是顺带的）
    expect(Object.keys(out).sort()).toEqual(['captions', 'shadows']);
  });
});
