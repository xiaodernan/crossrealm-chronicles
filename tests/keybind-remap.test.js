/**
 * 键位重映射与设置持久化（W-A7 切片4）。
 *
 * 三件事各自要证的东西不一样：
 * 1. **叠表**（`applyHotkeyOverrides`）：返回新表、常量不动、坏输入在应用那一刻就抛 ——
 *    尤其"非法 code"那条正则同时是设置面板唯一的注入面（键名会被拼进 DOM）。
 * 2. **存储版本**：v1 是"整包扁平、没有版本字段"，迁移只搬认识的键、其余丢掉；
 *    往返必须一致，损坏的 JSON 不许把游戏带走。
 * 3. **面板**：等待按键的那段时间才挂监听、离开必摘；捕获用 capture 阶段 + 停 propagation，
 *    所以这一下只用于绑定，不会被记成一次真实按下（否则"重映射成保存键"会当场存一次盘）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UI_HOTKEYS, UI_HOTKEY_LABELS, UI_ACTIONS, assertHotkeys, assertHotkeyLabels,
  applyHotkeyOverrides, hotkeyCodes,
} from '../src/content/hotkeys.js';
import { HotkeyRouter } from '../src/ui/HotkeyRouter.js';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { SettingsManager, migrateLegacySettings } from '../src/core/SettingsManager.js';

const KEY = 'crossrealm_settings';

/** 最小 DOM：localStorage + 可数的 window 监听 */
function withDom(initial = {}) {
  const store = new Map(Object.entries(initial));
  const listeners = { added: 0, removed: 0 };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  });
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.window = {
    addEventListener: () => { listeners.added++; },
    removeEventListener: () => { listeners.removed++; },
    dispatchEvent: () => true,
    exitPointerLock: () => {},
    devicePixelRatio: 1,
  };
  globalThis.document = { getElementById: () => null };      // 面板的所有 DOM 绑定都走"没有这个节点"分支
  return { store, listeners };
}

describe('叠表：坏输入在应用那一刻就抛', () => {
  it('空覆盖与出厂表逐条等值，且返回的是新表（改它不污染常量）', () => {
    const t = applyHotkeyOverrides(UI_HOTKEYS, {});
    expect(t).toEqual(UI_HOTKEYS);
    expect(t).not.toBe(UI_HOTKEYS);
    t[0].code = 'KeyQ';
    expect(UI_HOTKEYS[0].code).toBe('KeyH');
  });

  it('改一格只动那一格', () => {
    const t = applyHotkeyOverrides(UI_HOTKEYS, { journal: 'KeyB' });
    expect(t.find((e) => e.action === 'journal').code).toBe('KeyB');
    expect(t.find((e) => e.action === 'minimap').code).toBe('KeyM');
    expect(t).toHaveLength(UI_HOTKEYS.length);
  });

  it('未知动作名抛（表里没有这一格，就不许凭空造一格）', () => {
    expect(() => applyHotkeyOverrides(UI_HOTKEYS, { guildRaid: 'KeyK' })).toThrow(/未知的热键动作/);
  });

  it('非法键名抛：空串、非字符串、带 HTML 的、数字开头的都不算一枚键', () => {
    for (const bad of ['', null, 7, '<img src=x onerror=alert(1)>', '1Key', 'Key A']) {
      expect(() => applyHotkeyOverrides(UI_HOTKEYS, { save: bad }), String(bad)).toThrow(/键位不合法/);
    }
  });

  it('撞键抛：把"保存"改成"读取"的键，等于一个键办两件事', () => {
    expect(() => applyHotkeyOverrides(UI_HOTKEYS, { save: 'KeyL' })).toThrow(/code 已被前面的条目占用/);
  });

  it('覆盖之后仍然是一张合法表（校验不是只针对出厂数据）', () => {
    const t = applyHotkeyOverrides(UI_HOTKEYS, { help: 'KeyB', journal: 'KeyH' });
    expect(() => assertHotkeys(t)).not.toThrow();
    expect(hotkeyCodes(t)).toMatchObject({ help: 'KeyB', journal: 'KeyH' });
  });

  it('每个动作都有中文名，且名单里不多出没绑定的动作', () => {
    expect(() => assertHotkeyLabels()).not.toThrow();
    expect(() => assertHotkeyLabels({ ...UI_HOTKEY_LABELS, save: undefined }, UI_HOTKEYS)).toThrow(/没有显示名/);
    expect(() => assertHotkeyLabels({ ...UI_HOTKEY_LABELS, guildRaid: '公会突袭' }, UI_HOTKEYS)).toThrow(/不存在的动作/);
  });
});

describe('设置存储：v1 扁平 → v2 带版本', () => {
  beforeEach(() => withDom());

  it('迁移只搬认识的键，其余丢掉（没有主人的配置比少一个配置更糟）', () => {
    const out = migrateLegacySettings({ masterVolume: 0.9, showFps: false, savedAt: 17000, importVersion: 'v3' });
    expect(out).toEqual({ masterVolume: 0.9, showFps: false });
  });

  it('读 v1 存储：旧值生效、缺的键补默认、脏键不进来', () => {
    localStorage.setItem(KEY, JSON.stringify({ masterVolume: 0.1, bogus: 'x' }));
    const s = new SettingsManager();
    expect(s.get('masterVolume')).toBe(0.1);
    expect(s.get('shadows')).toBe(true);
    expect(s.data.bogus).toBeUndefined();
  });

  it('存出去的形状带版本号，且读回来的值一致（往返）', () => {
    const a = new SettingsManager();
    a.set('bloomStrength', 0.8);
    const written = JSON.parse(localStorage.getItem(KEY));
    expect(written.version).toBe(2);
    expect(written.values.bloomStrength).toBe(0.8);
    const b = new SettingsManager();
    expect(b.get('bloomStrength')).toBe(0.8);
  });

  it('损坏的 JSON 走默认值，不抛（配置读不出来不该让游戏起不来）', () => {
    localStorage.setItem(KEY, '{ 这不是 JSON');
    const s = new SettingsManager();
    expect(s.get('sfxVolume')).toBe(0.5);
  });

  it('`keybinds` 不与出厂默认共用同一个对象：改一次不污染出厂表', () => {
    const a = new SettingsManager();
    a.data.keybinds.save = 'KeyK';
    const b = new SettingsManager();
    expect(b.data.keybinds).toEqual({});
    expect(new SettingsManager().defaults.keybinds).toEqual({});
  });

  it('重映射写进去再读回来；清成 `{}` 就是出厂键位', () => {
    const a = new SettingsManager();
    a.set('keybinds', { save: 'KeyK' });
    const b = new SettingsManager();
    expect(applyHotkeyOverrides(UI_HOTKEYS, b.get('keybinds')).find((e) => e.action === 'save').code).toBe('KeyK');
    b.set('keybinds', {});
    const c = new SettingsManager();
    expect(c.get('keybinds')).toEqual({});
  });
});

describe('面板：等键的监听只在等的时候存在', () => {
  function mount(overrides = {}) {
    const dom = withDom();
    const settings = new SettingsManager();
    settings.set('keybinds', overrides);
    const toast = [];
    const game = { settings, hotkeyTable: null, dialog: { toast: (m) => toast.push(m) }, rebuilds: 0 };
    game.rebuildHotkeys = () => {
      game.hotkeyTable = applyHotkeyOverrides(UI_HOTKEYS, game.settings.get('keybinds'));
      game.rebuilds++;
    };
    game.rebuildHotkeys();
    return { dom, panel: new SettingsPanel(game), game, toast };
  }

  it('开始等待按键挂一次监听，取消时摘掉（面板开合不留僵尸）', () => {
    const { panel, dom } = mount();
    panel.setCapturing('save');
    expect(dom.listeners.added).toBe(1);
    panel.setCapturing(null);
    expect(dom.listeners.removed).toBe(1);
  });

  it('捕获到按键：写进设置、重建表，并摘掉监听', () => {
    const { panel, game, dom } = mount();
    let prevented = 0;
    panel.setCapturing('journal');
    panel.captureKey({ code: 'KeyB', preventDefault: () => prevented++, stopPropagation: () => prevented++ });
    expect(game.settings.get('keybinds')).toEqual({ journal: 'KeyB' });
    expect(game.hotkeyTable.find((e) => e.action === 'journal').code).toBe('KeyB');
    expect(game.rebuilds).toBe(2);
    expect(dom.listeners.removed).toBe(1);
    expect(prevented).toBe(2);              // preventDefault + stopPropagation 都做了
    expect(panel.capturing).toBe(null);
  });

  it('撞上别的动作：不写设置、给一句 toast、界面回到未捕获态', () => {
    const { panel, game, toast } = mount();
    panel.setCapturing('journal');
    panel.captureKey({ code: 'KeyM', preventDefault() {}, stopPropagation() {} });   // KeyM 是小地图
    expect(game.settings.get('keybinds')).toEqual({});
    expect(game.rebuilds).toBe(1);
    expect(toast).toHaveLength(1);
    expect(/无效|占用/.test(toast[0])).toBe(true);
    expect(panel.capturing).toBe(null);
  });

  it('取消（再点同一行）不写任何东西', () => {
    const { panel, game } = mount();
    panel.setCapturing('journal');
    panel.setCapturing(null);
    panel.captureKey({ code: 'KeyB', preventDefault() {}, stopPropagation() {} });
    expect(game.settings.get('keybinds')).toEqual({});
  });

  it('关面板一定脱离等待态（否则监听会一直挂着吃掉下一次按键）', () => {
    const { panel, dom } = mount();
    panel.setCapturing('journal');
    panel.hide();
    expect(panel.capturing).toBe(null);
    expect(dom.listeners.removed).toBe(1);
  });

  it('出厂表已叠上玩家键位：面板显示的是生效中的那张表，不是常量', () => {
    const { panel, game } = mount({ save: 'KeyK' });
    expect(game.hotkeyTable.find((e) => e.action === 'save').code).toBe('KeyK');
    expect(() => panel.refreshKeybinds()).not.toThrow();   // 没有 DOM 节点时安静返回
  });
});

describe('换表与接线', () => {
  it('路由换表之后重置边沿：新表里第一格键按下去就要响', () => {
    const calls = [];
    const router = new HotkeyRouter({ table: UI_HOTKEYS, isBlocked: () => false, onAction: (a) => calls.push(a) });
    router.poll({ KeyH: true });                 // 旧表里 KeyH 已经"按着了"
    router.useTable(applyHotkeyOverrides(UI_HOTKEYS, { help: 'KeyB' }));
    router.poll({ KeyB: true });
    expect(calls).toEqual(['help', 'help']);     // 换表前那次是 help（KeyH），换表后这次也是 help（KeyB）
  });

  it('静态门禁：`Game` 喂给路由的是叠过玩家键位的表，且改完设置会换表', () => {
    const src = readFileSync(join(__dirname, '../src/core/Game.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(src).toMatch(/this\.hotkeys\?\.useTable\(table\)/);
    expect(src).toMatch(/this\.rebuildHotkeys\(\)/);
    expect(src).toMatch(/applyHotkeyOverrides\(UI_HOTKEYS, this\.settings\.get\(.keybinds.\)/);
    // 键位配置坏了不许把游戏带走：回落出厂表 + 清覆盖 + 说一句话
    expect(src).toMatch(/catch \{[\s\S]*?UI_HOTKEYS\.map[\s\S]*?keybinds = \{\}/);
  });

  it('动作清单与显示名一一对应（面板上不会有一格空白，也不会多出一格没人绑）', () => {
    expect(Object.keys(UI_HOTKEY_LABELS).sort()).toEqual([...UI_ACTIONS].sort());
  });
});
