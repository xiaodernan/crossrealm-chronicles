/**
 * 暂停菜单的槽位面板 —— W-D3 切片3（多存档槽的玩家半边）。
 *
 * 数据层（切片2）只有账没有脸：玩家还是只能存主槽。这一片把"选了哪格"接到四个入口上 ——
 * 选择器选项从 `SaveSystem.listSlots()` 现推（不抄第二份名单），存 / 读 / 导出 / 导入
 * 都作用于它，缺省槽0 = 快捷键与老玩家的旧路。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { SaveSystem } from '../src/game/SaveSystem.js';
import { SAVE_KEYS, CURRENT_VERSION } from '../src/game/SaveMigrations.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { PauseMenu } from '../src/ui/PauseMenu.js';

beforeAll(() => {
  const store = new Map();
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() { return true; },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
});

beforeEach(() => localStorage._store.clear());
afterEach(() => delete globalThis.document);

/** 记下"哪个 id 挂了什么监听"的元素桩：click() 走真路径（构造函数挂的那条监听） */
function el(id, spec = {}) {
  const handlers = {};
  return {
    id,
    tag: spec.tag ?? 'button',
    value: spec.value ?? '',
    files: null,
    classList: { remove() {}, add() {} },
    listeners: handlers,
    options: [],
    appendChild(opt) { this.options.push(opt); },
    addEventListener(type, fn) { handlers[type] = fn; },
    click() { handlers.click?.(); },
    querySelectorAll: () => [],
  };
}

function buildDom(存了槽1 = false) {
  const elements = {
    'pause-menu': el('pause-menu'),
    'pause-resume': el('pause-resume'),
    'pause-slot': el('pause-slot', { tag: 'select', value: '0' }),
    'pause-save': el('pause-save'),
    'pause-load-slot': el('pause-load-slot'),
    'pause-export': el('pause-export'),
    'pause-import': el('pause-import'),
    'pause-import-file': el('pause-import-file', { tag: 'input', type: 'file' }),
    'pause-settings': el('pause-settings'),
  };
  globalThis.document = {
    getElementById: (id) => elements[id] ?? null,
    createElement: () => ({ value: '', textContent: '' }),
    exitPointerLock: undefined,
  };
  const game = {
    paused: false,
    dialog: { toast() {} },
    settingsPanel: { show() {} },
    player: { position: { x: 1, y: 2, z: 3 }, yaw: 0, pitch: 0, combat: { hp: 100, stamina: 50 }, teleport() {} },
    stats: {
      data: { bag: [], level: 1, souls: 10 },
      toJSON() { return { ...this.data }; },
      fromJSON(d) { this.data = { ...this.data, ...d }; },
      pushToConsumers() {},
    },
    quests: new QuestSystem({ toast() {} }),
    spells: { mana: 100 },
    settings: { data: {}, applyToGame() {} },
    weaponSkills: { unlocked: new Set(), toJSON: () => ({ unlocked: [] }), fromJSON() {} },
    restPointEnhancer: {
      discovered: new Set(),
      toJSON() { return { discovered: [...this.discovered] }; },
      fromJSON(d) { this.discovered = new Set(d?.discovered ?? []); },
    },
  };
  if (存了槽1) {
    SaveSystem.save(game, 1);
  }
  return { elements, game };
}

describe('槽位面板（W-D3 切片3）', () => {
  it('打开菜单时选项从 listSlots 现推：三格、空槽有名字、存过的带版本', () => {
    const { elements, game } = buildDom(true);
    const menu = new PauseMenu(game);
    menu.show();
    const opts = elements['pause-slot'].options;
    expect(opts.map((o) => o.value)).toEqual(['0', '1', '2']);
    expect(opts[1].textContent).toContain('槽2');
    expect(opts[1].textContent).toContain(`v${CURRENT_VERSION}`);
    expect(opts[2].textContent).toContain('空槽');
  });

  it('选中槽3再按"保存进度"：落盘到 _slot2 键、toast 带槽号、选项刷新后仍停在槽3', () => {
    const { elements, game } = buildDom();
    const menu = new PauseMenu(game);
    menu.show();
    elements['pause-slot'].value = '2';
    elements['pause-save'].click();
    expect(localStorage.getItem(`${SAVE_KEYS[0].key}_slot2`), '没落到所选槽的键上').toBeTruthy();
    expect(localStorage.getItem(`${SAVE_KEYS[0].key}_slot1`)).toBeNull();
    expect(elements['pause-slot'].value).toBe('2');
  });

  it('"读取所选槽"读的是那一格：槽2 的魂火数回到游戏里', () => {
    const { elements, game } = buildDom();
    const menu = new PauseMenu(game);
    menu.show();
    game.stats.data.souls = 321;
    elements['pause-slot'].value = '2';
    elements['pause-save'].click();
    game.stats.data.souls = 0;
    elements['pause-load-slot'].click();
    expect(game.stats.data.souls).toBe(321);
  });

  it('选择器缺位（老 DOM / 面板坏了）时保存仍走主槽 —— 面板坏不能连"保存"一起坏', () => {
    const { elements, game } = buildDom();
    const menu = new PauseMenu(game);
    elements['pause-slot'] = null;
    expect(menu.selectedSlot()).toBe(0);
    elements['pause-save'].click();
    expect(localStorage.getItem(SAVE_KEYS[0].key)).toBeTruthy();
  });
});
