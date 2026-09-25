/**
 * 面板内焦点导航（W-A7 切片11 / W-D1「焦点管理」第一格）。
 *
 * 这一片要防的三件事，各有各的打法：
 * 1. **清单只有一处生产者**：`navItems` 决定"这一格里能停在谁身上"以及顺序。别处再数一遍按钮，
 *    玩家走出来的路就和别人以为的路不一样（B47 那一族）。
 * 2. **落焦只有一个出口**：全仓只有 `ui/FocusNav.js` 碰 `.focus()` / `activeElement`。
 *    面板各自 `focus()` 一次 = "现在选中的是谁"有两套账（切片10 的 B46 同形）。
 * 3. **激活不留第二个消费者**：Enter / 空格 归浏览器（原生 `focus()` 之后按钮本来就吃这两个键），
 *    所以这一片**不登记** `uiConfirm`。登记了就是 B52 复发：同一下按键、两次 click。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  UI_HOTKEYS, UI_NAV_ACTIONS, UI_ACTIONS, hotkeyCodeFor, applyHotkeyOverrides, setHotkeyTable,
} from '../src/content/hotkeys.js';
import {
  navItems, stepFocusIndex, nextFocusedItem, moveFocusWithin, focusFirstItem,
} from '../src/ui/FocusNav.js';
import { OVERLAY_LAYERS, topNavLayer } from '../src/ui/OverlayStack.js';
import { HotkeyRouter, hotkeyBlockedBy } from '../src/ui/HotkeyRouter.js';
import { Game } from '../src/core/Game.js';
import { FastTravelPanel } from '../src/ui/FastTravelPanel.js';
import { HelpManual } from '../src/ui/HelpManual.js';
import { fakeDoc, fakePanel, fakeItem, fakeBox } from './helpers/fakePanelDom.js';

const SRC = join(process.cwd(), 'src');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.js$/.test(n) ? [full] : [];
});

const FILES = walk(SRC).map((f) => ({
  name: f.slice(SRC.length + 1).replace(/\\/g, '/'),
  source: readFileSync(f, 'utf8'),
}));

const sourceOf = (name) => {
  const found = FILES.find((f) => f.name === name);
  expect(found, `${name} 不在了`).toBeTruthy();
  return found.source;
};

/* ------------------------------------------------------ 假 DOM：一格清单 */

// 桩本体在 `tests/helpers/fakePanelDom.js`（与 `modal-trail` 那片共用一份）：
// 一份桩、两片用，改桩时两边一起红 —— 各写一份就是切片11 变异验证抓到的那种漂移。

/* ------------------------------------------------------------ 纯算式 */

describe('stepFocusIndex：从这一格走一格到哪', () => {
  it('空清单谁都没有：-1（调用方据此什么都不做，而不是"落到第 0 格"）', () => {
    expect(stepFocusIndex({ length: 0, active: -1, delta: 1 })).toBe(-1);
    expect(stepFocusIndex({ length: 0, active: 0, delta: -1 })).toBe(-1);
  });

  it('焦点不在清单里（刚打开面板，焦点还在 body）：往下落第一格，往上落最后一格', () => {
    expect(stepFocusIndex({ length: 5, active: -1, delta: 1 })).toBe(0);
    expect(stepFocusIndex({ length: 5, active: -1, delta: -1 })).toBe(4);
  });

  it('中间逐格走：下 +1、上 -1', () => {
    expect(stepFocusIndex({ length: 5, active: 2, delta: 1 })).toBe(3);
    expect(stepFocusIndex({ length: 5, active: 2, delta: -1 })).toBe(1);
  });

  it('两端环绕：最后一格再往下回第一格，第一格再往上到底（二十来格的设置面板不该按到顶就卡住）', () => {
    expect(stepFocusIndex({ length: 5, active: 4, delta: 1 })).toBe(0);
    expect(stepFocusIndex({ length: 5, active: 0, delta: -1 })).toBe(4);
  });

  it('关掉环绕就夹在两端', () => {
    expect(stepFocusIndex({ length: 5, active: 4, delta: 1, wrap: false })).toBe(4);
    expect(stepFocusIndex({ length: 5, active: 0, delta: -1, wrap: false })).toBe(0);
  });

  it('`delta` 只认方向不认幅度：±2 与 ±1 同格（导航一步就是一格）', () => {
    expect(stepFocusIndex({ length: 5, active: 1, delta: 2 })).toBe(2);
    expect(stepFocusIndex({ length: 5, active: 1, delta: -2 })).toBe(0);
  });
});

describe('nextFocusedItem：清单 + 当前焦点 → 下一个元素', () => {
  it('空清单给 null，而不是 undefined 或假元素', () => {
    expect(nextFocusedItem([], null, 1)).toBe(null);
  });

  it('焦点在清单外面（body / 已被 innerHTML 换掉的按钮）时按方向落进第一格或最后一格', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(nextFocusedItem(items, { id: 'ghost' }, 1)).toBe(items[0]);
    expect(nextFocusedItem(items, null, -1)).toBe(items[2]);
  });

  it('焦点在清单里时按 DOM 顺序走，越界环绕', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(nextFocusedItem(items, items[1], 1)).toBe(items[2]);
    expect(nextFocusedItem(items, items[2], 1)).toBe(items[0]);
  });
});

/* ------------------------------------------------------------ 清单生产者 */

describe('navItems：能停在哪几格只在这里说一次', () => {
  it('问宿主一次选择器，交出的是一份**新数组**（DOM 顺序 = 玩家走出来的顺序）', () => {
    const doc = fakeDoc();
    const { host, items } = fakePanel(['a', 'b', 'c'], doc);
    const list = navItems(host);
    expect(host.selectorAsked, '没有通过 querySelectorAll 拿清单').toBeTruthy();
    // 生产承诺的是"数组"，而浏览器给的是 NodeList（没有 indexOf/map/sort）：
    // 派发口按 `items.indexOf(activeEl)` 算"走到哪儿了"，那一层拷贝不是洁癖，是它能跑起来的前提。
    expect(Array.isArray(list), 'navItems 必须把 NodeList 拷成数组再交出').toBe(true);
    expect(list.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(list).not.toBe(items);
  });

  it('调用方就地乱序（sort）改不动下一次问的清单', () => {
    const doc = fakeDoc();
    const { host } = fakePanel(['a', 'b', 'c'], doc);
    navItems(host).sort(() => -1);
    expect(navItems(host).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('宿主不在（面板还没渲染 / 层表 id 写错）给空表而不是抛', () => {
    expect(navItems(null)).toEqual([]);
    expect(navItems({})).toEqual([]);
  });

  it('选择器真的在筛：禁用格、隐藏格、文件框、隐藏 input 一律进不了清单', () => {
    // 这条必须是行为断言，不许只看选择器字符串：上一版写成 `toContain('[disabled]')`，
    // 于是"button 那一半的 :not 全删掉"这种改法照样全绿（变异 N7）—— 字符串里还剩 input 那一半呢。
    const doc = fakeDoc();
    const { host } = fakePanel([
      'plain',
      { id: 'off', disabled: true },
      { id: 'shut', hidden: true },
      { id: 'file', tag: 'input', type: 'file' },
      { id: 'secret', tag: 'input', type: 'hidden' },
      { id: 'vol', tag: 'input', type: 'range' },
      { id: 'check', tag: 'input', type: 'checkbox' },
    ], doc);
    expect(navItems(host).map((e) => e.id)).toEqual(['plain', 'vol', 'check']);
  });

  it('清单里一格都没有（整面板都是禁用格）时不算"有落点"', () => {
    const doc = fakeDoc();
    const { host, items } = fakePanel([{ id: 'off', disabled: true }], doc);
    expect(navItems(host)).toEqual([]);
    expect(moveFocusWithin(host, 1, doc)).toBe(false);
    expect(focusFirstItem(host, doc)).toBe(false);
    expect(items[0].focusCount).toBe(0);
  });
});

/* ------------------------------------------------------------ 真的落焦 */

describe('moveFocusWithin / focusFirstItem：只在这里动 `focus()`', () => {
  it('开面板：焦点落在第一格，且它真的被 focus 过一次', () => {
    const doc = fakeDoc();
    const { host, items, active } = fakePanel(['a', 'b', 'c'], doc);
    expect(focusFirstItem(host, doc)).toBe(true);
    expect(active()).toBe('a');
    expect(items[0].focusCount).toBe(1);
  });

  it('焦点已经在这格里就别动它（从别的界面退回同一个面板时保留玩家选的那一格）', () => {
    const doc = fakeDoc();
    const { host, items, active } = fakePanel(['a', 'b', 'c'], doc);
    items[1].focus();
    expect(focusFirstItem(host, doc)).toBe(true);
    expect(active()).toBe('b');
    expect(items[0].focusCount).toBe(0);
  });

  it('↑↓ 一格一格走：走到的那格被 focus，没走到的不动', () => {
    const doc = fakeDoc();
    const { host, items, active } = fakePanel(['a', 'b', 'c'], doc);
    focusFirstItem(host, doc);
    expect(moveFocusWithin(host, 1, doc)).toBe(true);
    expect(active()).toBe('b');
    expect(moveFocusWithin(host, 1, doc)).toBe(true);
    expect(active()).toBe('c');
    expect(moveFocusWithin(host, 1, doc)).toBe(true);          // 环绕回第一格
    expect(active()).toBe('a');
    expect(items.map((e) => e.focusCount)).toEqual([2, 1, 1]);
  });

  it('空面板：没人可落，返回 false 且不抛', () => {
    const doc = fakeDoc();
    const host = { querySelectorAll: () => [] };
    expect(moveFocusWithin(host, 1, doc)).toBe(false);
    expect(focusFirstItem(host, doc)).toBe(false);
    expect(moveFocusWithin(null, 1, doc)).toBe(false);
  });
});

/* -------------------------------------- 层表 + 现状 → 焦点落进哪个面板 */

/** 只给 `overlayState()` 真读到的那些字段，形状与生产一致（被测的是 `Game.prototype` 那几个方法） */
const navGame = () => {
  const g = {
    worldMapPanel: { open: false },
    playerAutoPlay: { active: false },
    helpManual: { open: false },
    cinematicActive: false,
    settingsPanel: { open: false },
    fastTravelPanel: { open: false },
    pauseMenu: { open: false },
    dialog: { open: false },
    upgrade: { open: false },
  };
  g.overlayState = () => Game.prototype.overlayState.call(g);
  g.movePanelFocus = (delta) => Game.prototype.movePanelFocus.call(g, delta);
  return g;
};

describe('Game.movePanelFocus：收焦点的面板由层表说', () => {
  afterEach(() => {
    delete globalThis.document;
    setHotkeyTable(UI_HOTKEYS);
  });

  it('暂停菜单开着、设置没开：↑↓ 走的是菜单那份清单（默认 doc 就是全局那一份）', () => {
    const g = navGame();
    g.pauseMenu.open = true;
    const doc = fakeDoc();
    const menu = fakePanel(['resume', 'save', 'settings-btn'], doc);
    doc.hosts['pause-menu'] = menu.host;
    globalThis.document = doc;
    expect(g.movePanelFocus(1)).toBe(true);
    expect(menu.active()).toBe('resume');           // 从外面进来落第一格
    expect(g.movePanelFocus(1)).toBe(true);
    expect(menu.active()).toBe('save');
    expect(g.movePanelFocus(-1)).toBe(true);
    expect(menu.active()).toBe('resume');
  });

  it('设置压着菜单：焦点归设置，且与 `topBackLayer` 说的是同一个面板（两条路不分叉）', () => {
    const g = navGame();
    g.pauseMenu.open = true;
    g.settingsPanel.open = true;
    const doc = fakeDoc();
    const menu = fakePanel(['resume'], doc);
    const settings = fakePanel(['master-vol', 'close'], doc);
    doc.hosts['pause-menu'] = menu.host;
    doc.hosts['settings-panel'] = settings.host;
    globalThis.document = doc;
    expect(topNavLayer(g.overlayState()).layer).toBe('settings');
    expect(g.movePanelFocus(1)).toBe(true);
    expect(settings.active()).toBe('master-vol');
    // 焦点现状只有一份，所以"菜单没被碰"要看那一格的 focus 次数，而不是看菜单自己以为谁在前
    expect(menu.items.map((e) => e.focusCount)).toEqual([0]);
  });

  it('野外（没有面板收焦点）：这一格没人接，返回 false 且焦点不动', () => {
    const g = navGame();
    const doc = fakeDoc();
    const menu = fakePanel(['resume'], doc);
    doc.hosts['pause-menu'] = menu.host;            // 连宿主都给全，只是层表说不收
    globalThis.document = doc;
    expect(g.movePanelFocus(1)).toBe(false);
    expect(doc.activeElement).toBe(null);
  });

  it('端到端：菜单开着按 ↓ 经路由器派发 `uiDown` 并真的移焦，按住不重发', () => {
    const g = navGame();
    g.pauseMenu.open = true;
    const doc = fakeDoc();
    const menu = fakePanel(['resume', 'save'], doc);
    doc.hosts['pause-menu'] = menu.host;
    globalThis.document = doc;
    focusFirstItem(menu.host, doc);
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: (code) => hotkeyBlockedBy(g.overlayState(), code),
      onAction: (action) => Game.prototype.runHotkey.call({ ...g, runEscape: () => false }, action),
    });
    router.poll({ ArrowDown: true });
    expect(menu.active()).toBe('save');
    router.poll({ ArrowDown: true });                // 同一下按住不再来一次
    expect(menu.active()).toBe('save');
  });
});

/* ---------------------------------------------------- 面板侧：认领之后真的落焦 */

describe('现拼的清单必须先拼再落焦（快速旅行与说明书）', () => {
  const ORIGINAL_DOC = globalThis.document;

  const mountDoc = (registry) => {
    globalThis.document = {
      getElementById: (id) => registry[id] ?? null,
      exitPointerLock: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  };
  const unmount = () => { globalThis.document = ORIGINAL_DOC; };

  it('快速旅行：站着的那座营火是 `disabled`，所以第一下落在你真正能去的地方', () => {
    const doc = fakeDoc();
    const dests = [
      { id: 'ashen', here: true },
      { id: 'forest' },
      { id: 'void' },
    ].map((d) => {
      const el = fakeItem(`ft-${d.id}`, { disabled: d.here });
      el.dataset = { id: d.id };
      return el;
    });
    const cancel = fakeItem('fast-travel-close');
    const listItems = [...dests, cancel];
    // 生产里这些格子是 `list.innerHTML = …` 现拼出来的，再被 `list.querySelectorAll('.ft-btn')` 取回；
    // 桩给的是同一批对象，所以"面板清单"与"列表"指的是同一件事，不是两份账
    const list = { innerHTML: '', querySelectorAll: () => listItems.slice(0, dests.length) };
    const panel = fakePanel(listItems, doc, 'fast-travel-panel');
    const registry = {
      'fast-travel-panel': panel.host,
      'fast-travel-list': list,
      'fast-travel-close': cancel,
    };
    for (const el of dests) registry[el.id] = el;
    mountDoc(registry);
    try {
      const travelled = [];
      const game = { fastTravel: { destinationsForPanel: () => dests.map((d) => ({ id: d.id, name: d.id, here: d.disabled })), travel: (id) => travelled.push(id) } };
      const panelUnderTest = new FastTravelPanel(game);
      panelUnderTest.show('ft-here');
      expect(doc.activeElement).toBe(dests[1]);                 // 跳过"此地"那一格
      dests[2].click();                                         // 走到第二处并按回车（原生 click）
      expect(travelled).toEqual(['void']);                      // 交给 `travel` 的是营火 id，不是显示名
    } finally {
      unmount();
    }
  });

  it('说明书：show() 落焦，而清单第一格是"关闭"（DOM 顺序说了算，不另排一套）', () => {
    const doc = fakeDoc();
    const close = fakeItem('help-close');
    const navButtons = [fakeItem('sec-1'), fakeItem('sec-2')];
    const panel = fakePanel([close, ...navButtons], doc, 'help-manual');
    [close, ...navButtons].forEach((el) => { el.doc = doc; });
    const nav = fakeBox('help-nav');
    nav.querySelectorAll = () => navButtons;
    const registry = {
      'help-manual': panel.host,
      'help-nav': nav,
      'help-body': fakeBox('help-body'),
      'help-close': close,
      'pause-manual': fakeItem('pause-manual'),
    };
    mountDoc(registry);
    try {
      const game = { pauseMenu: { panel: null } };
      const manual = new HelpManual(game);
      manual.show();
      expect(doc.activeElement).toBe(close);
      // 章节按钮也在清单里：↑ 一次就该走到它们
      expect(navItems(panel.host).map((el) => el.id)).toEqual(['help-close', 'sec-1', 'sec-2']);
    } finally {
      unmount();
    }
  });

  it('列表那一格不在（营火数据没喂进来 / DOM 缺块）也要有落点：取消按钮就是那一格', () => {
    const doc = fakeDoc();
    const cancel = fakeItem('fast-travel-close');
    const panel = fakePanel([cancel], doc, 'fast-travel-panel');
    const registry = { 'fast-travel-panel': panel.host, 'fast-travel-close': cancel };
    mountDoc(registry);
    try {
      const game = { fastTravel: { destinationsForPanel: () => { throw new Error('列表宿主都不该被读'); } } };
      const panelUnderTest = new FastTravelPanel(game);
      expect(() => panelUnderTest.show(null)).not.toThrow();
      expect(doc.activeElement).toBe(cancel);                   // 早退路径不能把玩家留在没有落点的面板里
    } finally {
      unmount();
    }
  });

  it('静态：`FastTravelPanel.show()` 里落焦必须排在 `list.innerHTML` 之后（早一步拼的还是上一座营火的格子）', () => {
    const body = sourceOf('ui/FastTravelPanel.js').match(/\n {2}show\([^)]*\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 FastTravelPanel.show 的方法体').toBeTruthy();
    const built = body[0].indexOf('list.innerHTML');
    const focus = body[0].indexOf('focusFirstItem(');
    expect(built).toBeGreaterThanOrEqual(0);
    expect(focus, '开面板时没落焦').toBeGreaterThanOrEqual(0);
    expect(focus, '落焦跑在重绘之前：清单是上一轮的').toBeGreaterThan(built);
  });
});

/* -------------------------------------------------------- 静态门禁 */

describe('静态门禁：焦点只有一个出口，激活只有浏览器一个消费者', () => {
  it('全仓只有 `ui/FocusNav.js` 碰 `.focus()` 与 `activeElement`（面板各自落焦 = 第二套焦点账）', () => {
    const touching = FILES
      .filter(({ name, source }) => name !== 'ui/FocusNav.js' && /\.(?:focus\(\)|activeElement)/.test(source))
      .map(({ name }) => name);
    expect(touching).toEqual([]);
  });

  it('这条扫描咬得住：面板里补一句自己落焦，立刻被抓住（防空跑门禁）', () => {
    const original = sourceOf('ui/PauseMenu.js');
    const smuggled = original.replace(
      'focusFirstItem(this.panel);',
      "this.panel?.querySelector('button')?.focus();",
    );
    expect(smuggled, '锚点没命中：开面板那一行改了写法').not.toBe(original);
    expect(/\.(?:focus\(\)|activeElement)/.test(original)).toBe(false);
    expect(/\.(?:focus\(\)|activeElement)/.test(smuggled)).toBe(true);
  });

  it('每一格 `nav` 宿主 id 恰好有一个面板类抓住（写了没人认领 = 焦点永远进不去）', () => {
    const withNav = OVERLAY_LAYERS.filter((x) => x.nav);
    expect(withNav.length, '一层都不认领焦点：这一片就是空跑').toBeGreaterThan(0);
    for (const l of withNav) {
      const claimants = FILES.filter(({ source }) => source.includes(`getElementById('${l.nav}')`));
      expect(claimants, `没有面板认领宿主 "${l.nav}"（层表 ${l.layer} 那一格是死的）`).toHaveLength(1);
      // 认领者还得真的会开：`show()` 是落焦的时机，而且它必须真的落（不落 = 玩家开完面板第一眼没有落点）
      // 带参数的 `show(currentId)` 也算：这一片要钉的是"开面板那一刻落焦"，不是"show 必须无参"
      const body = claimants[0].source.match(/\n {2}show\([^)]*\)\s*\{[\s\S]*?\n {2}\}/);
      expect(body, `${claimants[0].name} 没有 show() 方法体`).toBeTruthy();
      expect(body[0], `${claimants[0].name} 开面板时没落焦`).toContain('focusFirstItem(');
    }
  });

  it('设置面板先 `refresh()` 再落焦：键位那几十格是现拼的，早一步清单还是旧的', () => {
    const body = sourceOf('ui/SettingsPanel.js').match(/\n {2}show\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 SettingsPanel.show 的方法体').toBeTruthy();
    expect(body[0].indexOf('this.refresh();')).toBeGreaterThanOrEqual(0);
    expect(body[0].indexOf('this.refresh();'), '落焦跑在重绘之前：清单是上一轮的').toBeLessThan(body[0].indexOf('focusFirstItem('));
  });

  it('地图那一层刻意没认领：`WorldMapPanel` 里不许出现落焦调用（要改必须先给层表加一格）', () => {
    // 读数 Q6：地图面板里可停的格子只有一个"关闭"，认领它只是给自己加一个假落点；
    // 地图真正缺的是平移/缩放的键盘入口，那是另一件事（要新登记动作，不是新落一个焦点）
    expect(OVERLAY_LAYERS.find((l) => l.layer === 'worldMap').nav, '层表已经认领了地图，这条要跟着改').toBeFalsy();
    expect(sourceOf('ui/WorldMapPanel.js')).not.toContain('focusFirstItem(');
  });

  it('导航动作在 `runHotkey` 里全部落到 `movePanelFocus`，且没有多余的导航 case', () => {
    const body = sourceOf('core/Game.js').match(/runHotkey\(action\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 runHotkey 的函数体').toBeTruthy();
    const toNav = [...body[0].matchAll(/case '([a-zA-Z]+)':\s*return this\.movePanelFocus\((-?\d)\);/g)];
    expect(toNav.map((m) => m[1]).sort()).toEqual([...UI_NAV_ACTIONS].sort());
    expect(toNav.map((m) => m[2])).toEqual(['-1', '1']);        // 上 = -1、下 = +1，方向不许反
    for (const a of UI_NAV_ACTIONS) expect(UI_ACTIONS, `${a} 不在热键表里`).toContain(a);
  });

  it('↑↓ 之外不设导航键，也不设"确认"热键：← → 与 Enter / 空格 全部留给浏览器原生', () => {
    expect(UI_NAV_ACTIONS).toEqual(['uiUp', 'uiDown']);
    const second = UI_ACTIONS.filter((a) => /confirm|activate|uiLeft|uiRight|navLeft|navRight/i.test(a));
    expect(second, '登记了第二条激活/横向通路：与浏览器原生抢同一下按键（B52）').toEqual([]);
  });

  it('导航路径不许自己点按钮，也不许抄物理键码（清单生产者只交清单）', () => {
    const src = sourceOf('ui/FocusNav.js');
    expect(src).not.toMatch(/\.click\(|dispatchEvent/);
    expect(src).not.toMatch(/'(?:Arrow[A-Za-z]+|Enter|Escape|Key[A-Z])'/);
  });

  it('移焦键改绑之后仍然放行：层表问的是动作，不是出厂那两枚箭头', () => {
    setHotkeyTable(applyHotkeyOverrides(UI_HOTKEYS, { uiUp: 'KeyI', uiDown: 'KeyK' }));
    expect(hotkeyCodeFor('uiUp')).toBe('KeyI');
    const open = { settingsOpen: true };
    for (const l of OVERLAY_LAYERS) if (!(l.state in open)) open[l.state] = false;
    expect(hotkeyBlockedBy(open, 'KeyI')).toBe(false);
    expect(hotkeyBlockedBy(open, 'ArrowUp')).toBe(true);
  });
});
