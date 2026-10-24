/**
 * 面板 title 与暂停菜单槽位标签进双表（W-D2 切片39）。
 *
 * ## 这一片解决什么
 *
 * `DraggablePanel` 的两处 title（拖动把手的 `拖动移动面板` / 折叠钮的 `折叠/展开`）
 * 与 `PauseMenu` 槽位选项的两句标签（`槽N · v18 · 时刻` / `槽N · 空槽`）都是裸中文
 * 字面量。title 属性与 `<option>` 文本都在 `applyTranslations` 的 `data-i18n` 文档
 * 走查射程之外，英文玩家看到的是中文 tooltip 与中文槽位名。
 *
 * ## 机制
 *
 * 四处全部改 `t(键, 参数)` 在渲染那一刻展开；`DraggablePanel` 另建两份登记册
 * （拖动把手 / 折叠钮），导出 `refreshPanelTitles()`，由 `SettingsManager.applyToGame`
 * 在 `applyTranslations()` 之后调用 —— 换语言即重算，与切片33 的世界层刷新同一形状。
 * `PauseMenu.refreshSlotOptions()` 开面板时本来就跑，语言切换时再跑一次即可。
 *
 * ## 用例分六层
 * ① 钉文案腿：4 个新键的中英原值逐字钉死；
 * ② 键登记腿：4 键两表都在场，键数 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，不孤儿、同文案最多两键；
 * ③ 静态腿：DraggablePanel.js 与 PauseMenu.js 的中文字面量清零；
 * ④ 行为腿（zh）：title 落位 / 预置 title 不碰 / 槽位选项中文原句；
 * ⑤ 行为腿（en）：换语言重算后 title 与槽位选项整句英文；
 * ⑥ 反面证据：尺子自证 + 插值双腿 + 无参时模板原样返回。
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attachDraggable, attachCollapsible, refreshPanelTitles } from '../src/ui/DraggablePanel.js';
import { SaveSystem } from '../src/game/SaveSystem.js';
import { CURRENT_VERSION } from '../src/game/SaveMigrations.js';
import { QuestSystem } from '../src/game/QuestSystem.js';
import { PauseMenu } from '../src/ui/PauseMenu.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage, t } from '../src/engine/i18n.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 4 个新键：键 → [中文原值, 英文原值] */
const NEW_KEYS = {
  panel_drag_handle_title: ['拖动移动面板', 'Drag to move panel'],
  panel_collapse_toggle_title: ['折叠/展开', 'Collapse/Expand'],
  pause_slot_filled_fmt: ['槽${slot} · v${version} · ${time}', 'Slot ${slot} · v${version} · ${time}'],
  pause_slot_empty_fmt: ['槽${slot} · 空槽', 'Slot ${slot} · Empty'],
};

/** 极简词法扫描：只取字符串/模板字面量的区间（标识符里的中文是仓库惯例，不当文案） */
function 字符串字面量(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const nx = src[i + 1];
    if (c === '/' && nx === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && nx === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; const start = i; i += 1;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i += 1; break; } if (src[i] === '\n') break; i += 1; }
      out.push({ start, end: i, tpl: false }); continue;
    }
    if (c === '`') {
      const start = i; i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i += 1; break; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; continue; }
        i += 1;
      }
      out.push({ start, end: i, tpl: true }); continue;
    }
    i += 1;
  }
  return out;
}

const 文案部分 = (src, s) => (s.tpl ? src.slice(s.start, s.end).replace(/\$\{[^}]*\}/g, '') : src.slice(s.start, s.end));

const 中文字面量 = (src) => 字符串字面量(src)
  .map((s) => 文案部分(src, s))
  .filter((text) => /[\u4e00-\u9fff]/.test(text));

/* ------------------------------------------------------------------ *
 * 环境桩（与 draggable-panel.test.js / save-slot-panel.test.js 同款）
 * ------------------------------------------------------------------ */

const createdButtons = [];

beforeAll(() => {
  const store = new Map();
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() { return true; },
    innerWidth: 1000,
    innerHeight: 800,
  };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
  globalThis.document = {
    createElement: () => {
      const b = { type: '', className: '', title: '', textContent: '', addEventListener() {} };
      createdButtons.push(b);
      return b;
    },
    exitPointerLock: undefined,
  };
});

beforeEach(() => {
  localStorage._store.clear();
  createdButtons.length = 0;
  setLanguage('zh');
});

/** 最小假把手 / 假面板：够 attachDraggable 与 attachCollapsible 用 */
function fakeHandle(title = '') {
  return {
    title,
    classList: { add() {}, remove() {}, contains: () => false },
    setPointerCapture() {},
    releasePointerCapture() {},
    addEventListener() {},
    appendChild() {},
  };
}

function fakePanel(handle) {
  return {
    id: 'panel',
    style: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle: () => false },
    querySelector: () => handle ?? null,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    offsetWidth: 10,
    offsetHeight: 10,
    addEventListener() {},
    appendChild() {},
  };
}
/** 暂停菜单最小宿主（save-slot-panel.test.js 同款形状） */
function makeHost() {
  return {
    paused: false,
    dialog: { toast() {} },
    settingsPanel: { show() {} },
    player: { position: { x: 1, y: 2, z: 3 }, yaw: 0, pitch: 0, combat: { hp: 100, stamina: 50 }, teleport() {}, setLookSensitivity() {} },
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
}

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
    _text: '',
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; if (v === '') this.options.length = 0; },
    appendChild(opt) { this.options.push(opt); },
    addEventListener(type, fn) { handlers[type] = fn; },
    click() { handlers.click?.(); },
    querySelectorAll: () => [],
  };
}

/** 装好暂停菜单 DOM 桩并返回 { menu, slotSelect } */
function buildPauseMenu() {
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
    createElement: () => {
      const b = { value: '', textContent: '', addEventListener() {} };
      createdButtons.push(b);
      return b;
    },
    exitPointerLock: undefined,
  };
  const game = makeHost();
  const menu = new PauseMenu(game);
  return { menu, game, slotSelect: elements['pause-slot'] };
}

/* ------------------------------------------------------------------ *
 * ① 钉文案腿
 * ------------------------------------------------------------------ */

describe('① 钉文案腿：4 个新键的中英原值逐字钉死', () => {
  it('4 个新键', () => {
    for (const [key, [zh, en]] of Object.entries(NEW_KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('fmt 键中英占位符一致（slot / version / time）', () => {
    for (const key of Object.keys(NEW_KEYS)) {
      const 占位 = (s) => [...s.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(占位(STRINGS_EN[key]), `${key} 中英占位符不一致`).toEqual(占位(STRINGS_ZH[key]));
    }
  });
});

/* ------------------------------------------------------------------ *
 * ② 键登记腿
 * ------------------------------------------------------------------ */

describe('② 键登记：4 个新键两表都在场，键数 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415', () => {
  it('4 个新键中英两表一个不缺', () => {
    const zh = new Set(ZH_KEYS);
    const en = new Set(EN_KEYS);
    for (const key of Object.keys(NEW_KEYS)) {
      expect(zh.has(key), `中文表缺 ${key}`).toBe(true);
      expect(en.has(key), `英文表缺 ${key}`).toBe(true);
    }
  });

  it('键数 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409 → 2411 → 2414 → 2415，两表逐键对齐', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(ZH_KEYS.length, '键数不是 2415 —— 双表被别处改过').toBe(2415);
  });

  it('新键不孤儿：panel_* 在 DraggablePanel.js、pause_slot_* 在 PauseMenu.js 被引用', () => {
    const dp = 读('src/ui/DraggablePanel.js');
    const pm = 读('src/ui/PauseMenu.js');
    for (const key of Object.keys(NEW_KEYS)) {
      const home = key.startsWith('pause_slot_') ? pm : dp;
      expect(home.includes(key), `${key} 建了却没人引用（死键）`).toBe(true);
    }
  });

  it('新键文案在两表里都最多两个键（同文案写三遍就是命名族失控）', () => {
    for (const [名, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      const 计数 = new Map();
      for (const v of Object.values(table)) 计数.set(v, (计数.get(v) ?? 0) + 1);
      for (const 键 of Object.keys(NEW_KEYS)) {
        expect(计数.get(table[键]) ?? 0, `${名} 表里 "${键}" 的文案出现了 ${计数.get(table[键])} 次`).toBeLessThanOrEqual(2);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：两个 UI 源文件的中文字面量清零', () => {
  it('DraggablePanel.js 中文字面量清零', () => {
    expect(中文字面量(读('src/ui/DraggablePanel.js'))).toEqual([]);
  });

  it('PauseMenu.js 中文字面量清零（残留只有「时刻 / 之前」等标识符）', () => {
    expect(中文字面量(读('src/ui/PauseMenu.js'))).toEqual([]);
  });

  it('SettingsManager 接上了两处刷新（换语言重算的接线在册）', () => {
    const sm = 读('src/core/SettingsManager.js');
    expect(sm).toContain('game?.pauseMenu?.refreshSlotOptions?.();');
    expect(sm).toContain('refreshPanelTitles();');
  });
});
/* ------------------------------------------------------------------ *
 * ④ 行为腿（中文）
 * ------------------------------------------------------------------ */

describe('④ 行为腿（zh）：title 落位、预置不碰、槽位选项中文原句', () => {
  it('拖动把手没有 title 时写上中文 tooltip', () => {
    const handle = fakeHandle('');
    attachDraggable(fakePanel(handle));
    expect(handle.title).toBe('拖动移动面板');
  });

  it('HTML 自带 title 的面板不被覆盖（"没有才写"语义保持）', () => {
    const handle = fakeHandle('自定义标题');
    attachDraggable(fakePanel(handle));
    expect(handle.title).toBe('自定义标题');
  });

  it('折叠钮的 title 是中文 tooltip', () => {
    attachCollapsible(fakePanel(null));
    expect(createdButtons[0].title).toBe('折叠/展开');
  });

  it('槽位选项：存过的槽带版本与时刻，空槽有名字', () => {
    const { menu, game, slotSelect } = buildPauseMenu();
    expect(SaveSystem.save(game, 1)).toBe(true);
    menu.show();
    expect(slotSelect.options[1].textContent).toMatch(new RegExp('^槽2 · v' + CURRENT_VERSION + ' · \\d{1,2}/\\d{1,2} \\d{2}:\\d{2}$'));
    expect(slotSelect.options[0].textContent).toBe('槽1 · 空槽');
    expect(slotSelect.options[2].textContent).toBe('槽3 · 空槽');
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 行为腿（英文）
 * ------------------------------------------------------------------ */

describe('⑤ 行为腿（en）：换语言重算后 title 与槽位选项整句英文', () => {
  it('refreshPanelTitles 把两个 title 翻成英文，再切回来也翻回去', () => {
    const handle = fakeHandle('');
    attachDraggable(fakePanel(handle));
    attachCollapsible(fakePanel(null));
    const btn = createdButtons[createdButtons.length - 1];
    setLanguage('en');
    refreshPanelTitles();
    expect(handle.title).toBe('Drag to move panel');
    expect(btn.title).toBe('Collapse/Expand');
    setLanguage('zh');
    refreshPanelTitles();
    expect(handle.title).toBe('拖动移动面板');
    expect(btn.title).toBe('折叠/展开');
  });

  it('refreshSlotOptions 重算后槽位选项整句英文（SettingsManager 换语言走的就是这条）', () => {
    const { menu, game, slotSelect } = buildPauseMenu();
    expect(SaveSystem.save(game, 1)).toBe(true);
    menu.show();
    setLanguage('en');
    menu.refreshSlotOptions();
    expect(slotSelect.options[1].textContent).toMatch(new RegExp('^Slot 2 · v' + CURRENT_VERSION + ' · \\d{1,2}/\\d{1,2} \\d{2}:\\d{2}$'));
    expect(slotSelect.options[0].textContent).toBe('Slot 1 · Empty');
    expect(slotSelect.options[2].textContent).toBe('Slot 3 · Empty');
    for (const opt of slotSelect.options) {
      expect(opt.textContent).not.toContain('[MISSING:');
      expect(opt.textContent).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
});

/* ------------------------------------------------------------------ *
 * ⑤b 集成腿：SettingsManager.applyToGame 的换语言接线
 * ------------------------------------------------------------------ */

describe('⑤b 集成腿：applyToGame 把面板 title 与槽位标签一起换语言', () => {
  const 假设置 = (language) => {
    const mgr = new SettingsManager();
    mgr.data = { ...mgr.data, language };
    mgr.save = () => {};
    return mgr;
  };

  it('切英文：拖动把手 title 与槽位选项一起改口（接不上线就是这片白做）', () => {
    const handle = fakeHandle('');
    attachDraggable(fakePanel(handle));
    const { menu, game, slotSelect } = buildPauseMenu();
    expect(SaveSystem.save(game, 1)).toBe(true);
    menu.show();
    假设置('en').applyToGame({ ...game, pauseMenu: menu });
    expect(handle.title).toBe('Drag to move panel');
    expect(slotSelect.options[1].textContent).toMatch(new RegExp('^Slot 2 · v' + CURRENT_VERSION + ' · '));
    expect(slotSelect.options[2].textContent).toBe('Slot 3 · Empty');
  });

  it('再切回中文也一路改回来（来回各一次，不是一次性的）', () => {
    const handle = fakeHandle('');
    attachDraggable(fakePanel(handle));
    const { menu, game, slotSelect } = buildPauseMenu();
    expect(SaveSystem.save(game, 1)).toBe(true);
    menu.show();
    假设置('en').applyToGame({ ...game, pauseMenu: menu });
    假设置('zh').applyToGame({ ...game, pauseMenu: menu });
    expect(handle.title).toBe('拖动移动面板');
    expect(slotSelect.options[1].textContent).toMatch(new RegExp('^槽2 · v' + CURRENT_VERSION + ' · '));
    expect(slotSelect.options[2].textContent).toBe('槽3 · 空槽');
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 反面证据
 * ------------------------------------------------------------------ */

describe('⑥ 反面证据：尺子自证与插值双腿', () => {
  it('尺子自证：喂一段假源码 —— 认字符串、剔注释、剔插值、不认标识符', () => {
    const 假源码 = [
      "const a = '真火咒';",
      '// 行注释里的玄冰刺不算',
      '/* 块注释里的引力坍缩也不算 */',
      'const b = `模板 ${x} 结尾`;',
      'const 标识符中文 = 1;',
    ].join('\n');
    expect(中文字面量(假源码)).toEqual(["'真火咒'", '`模板  结尾`']);
  });

  it('插值双腿：槽位三格中英两语落位', () => {
    setLanguage('zh');
    expect(t('pause_slot_filled_fmt', { slot: 2, version: 18, time: '10/24 06:00' })).toBe('槽2 · v18 · 10/24 06:00');
    expect(t('pause_slot_empty_fmt', { slot: 3 })).toBe('槽3 · 空槽');
    setLanguage('en');
    expect(t('pause_slot_filled_fmt', { slot: 2, version: 18, time: '10/24 06:00' })).toBe('Slot 2 · v18 · 10/24 06:00');
    expect(t('pause_slot_empty_fmt', { slot: 3 })).toBe('Slot 3 · Empty');
    setLanguage('zh');
  });

  it('无参时模板原样返回（t 的既定行为：漏传参数会原样漏出 ${...}，所以调用点必须带参）', () => {
    setLanguage('zh');
    expect(t('pause_slot_filled_fmt')).toBe('槽${slot} · v${version} · ${time}');
    setLanguage('en');
    expect(t('pause_slot_empty_fmt')).toBe('Slot ${slot} · Empty');
    setLanguage('zh');
  });
});