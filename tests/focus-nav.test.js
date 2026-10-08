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
 *
 * 切片16 补第四条：**调值只有一条通路** —— ← → 登记成 `uiLeft`/`uiRight` 并 `preventDefault`，
 * 于是原生滑杆步进与我们的步进不会同时发生（同时发生 = 按一下走两档）。前提写成门禁：
 * 收焦点的面板里不许出现需要方向键移动光标的文本控件。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  UI_HOTKEYS, UI_NAV_ACTIONS, UI_ACTIONS, hotkeyCodeFor, applyHotkeyOverrides, setHotkeyTable,
} from '../src/content/hotkeys.js';
import {
  navItems, stepFocusIndex, nextFocusedItem, moveFocusWithin, focusFirstItem, adjustFocused, preserveFocus,
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

  it('选择器真的在筛：禁用格、隐藏格、文件框、隐藏 input 一律进不了清单；select 在清单里（W-D3 切片3）', () => {
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
      { id: 'slot', tag: 'select' },
      { id: 'shut-slot', tag: 'select', disabled: true },
    ], doc);
    expect(navItems(host).map((e) => e.id)).toEqual(['plain', 'vol', 'check', 'slot']);
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

/* ------------------------------------- 左右两下：推焦点那一格的数值（切片16） */

describe('preserveFocus：重绘换掉整批节点之后，玩家还站在原来那一格（切片28 / 修 B58）', () => {
  /** 重绘 = 同一份清单里换一批新对象（浏览器里旧节点被销毁，新的同位置新身份） */
  const redraw = (panel, doc, ids) => {
    panel.items.length = 0;
    panel.items.push(...ids.map((id) => { const el = fakeItem(id); el.doc = doc; return el; }));
  };

  it('焦点在清单里：重绘之后回到同一格，且拿到的是**新节点**', () => {
    const doc = fakeDoc({});
    const panel = fakePanel(['a', 'b', 'c'], doc);
    const 旧格 = panel.items[1];
    旧格.focus();
    expect(doc.activeElement.id).toBe('b');
    const 回到 = preserveFocus(panel.host, () => redraw(panel, doc, ['a', 'b', 'c']), doc);
    expect(回到, '返回值要问浏览器真的给了谁').toBe(true);
    expect(doc.activeElement?.id).toBe('b');
    expect(doc.activeElement).not.toBe(旧格);            // 拿到的必须是重绘后的那一个新节点
    expect(doc.activeElement).toBe(panel.items[1]);
  });

  it('清单变短了：钳到最后一格，而不是掉回 `body`', () => {
    const doc = fakeDoc({});
    const panel = fakePanel(['a', 'b', 'c'], doc);
    panel.items[2].focus();
    preserveFocus(panel.host, () => redraw(panel, doc, ['a']), doc);
    expect(doc.activeElement?.id).toBe('a');
  });

  it("焦点本来不在这一格里：不借重绘之名抢走玩家的焦点（也不碰 `body`）", () => {
    const doc = fakeDoc({});
    const panel = fakePanel(['a', 'b'], doc);
    const 外面 = fakeItem('别处的按钮');
    外面.doc = doc;
    外面.focus();
    expect(preserveFocus(panel.host, () => redraw(panel, doc, ['a', 'b']), doc)).toBe(false);
    expect(doc.activeElement?.id).toBe('别处的按钮');
  });

  it('重绘后清单空了：返回 false 而不抛（画一半的极端形状）', () => {
    const doc = fakeDoc({});
    const panel = fakePanel(['a'], doc);
    const 旧格 = panel.items[0];
    旧格.focus();
    expect(preserveFocus(panel.host, () => redraw(panel, doc, []), doc)).toBe(false);
    expect(doc.activeElement).toBe(旧格);                // 没地方可放：不乱抢焦点，也不假装成功
  });

  it('反面对照：不套这一层，重绘确实把焦点丢回 `body`（证明这条不是在演空戏）', () => {
    const doc = fakeDoc({});
    const panel = fakePanel(['a', 'b'], doc);
    panel.items[1].focus();
    redraw(panel, doc, ['a', 'b']);
    // 浏览器销毁节点后焦点归 `body`：这份桩用同一条形状表示 —— 原对象已不在清单里
    expect(panel.items.indexOf(doc.activeElement)).toBe(-1);
  });

  it('两个重绘点都真的走了它：日志抽屉与键位清单（漏一处就是那一处仍会掉焦点）', () => {
    const hud = sourceOf('ui/HUD.js');
    expect(hud).toMatch(/preserveFocus\(this\.journalPanel, \(\) => this\.renderJournal\(\)\)/);
    const panel = sourceOf('ui/SettingsPanel.js');
    expect(panel).toMatch(/preserveFocus\(host, \(\) => \{/);
    // 重绘本体仍然只有一个地方（`renderJournal`），护焦点那层不许自己也去画一遍
    expect((hud.match(/journalPanel\.innerHTML =/g) ?? [])).toHaveLength(1);
  });
});

describe('adjustFocused：走格问清单，这一段只问"焦点在哪一格"', () => {
  /** 一根滑杆 + 一份 `input` 账：写入方（`SettingsPanel.bindControls`）听的就是这个事件 */
  const slider = (doc, spec = {}) => {
    const el = fakeItem('vol', {
      tag: 'input', type: 'range', min: 0, max: 1, step: 0.05, value: 0.5, ...spec,
    });
    const seen = [];
    el.addEventListener('input', () => seen.push(el.value));
    fakePanel([el], doc);                    // 挂进面板 = `el.doc` 就位，`focus()` 才认文档那一份焦点账
    return { el, seen };
  };

  it('推一档：值动一格、`input` 恰好发一次（不发它 = 值动了而设置没动）', () => {
    const doc = fakeDoc();
    const { el, seen } = slider(doc);
    el.focus();
    expect(adjustFocused(1, doc)).toBe(true);
    expect(el.value).toBe('0.55');
    expect(seen).toEqual(['0.55']);
    expect(adjustFocused(-1, doc)).toBe(true);
    expect(el.value).toBe('0.5');
    expect(seen).toEqual(['0.55', '0.5']);
  });

  it('到头不越界：min / max 两侧夹住，已经在头上时这一下不被接住', () => {
    const doc = fakeDoc();
    const { el, seen } = slider(doc, { value: 0 });
    el.focus();
    expect(adjustFocused(-1, doc), 'min 上还往下走').toBe(false);
    expect(el.value).toBe('0');
    expect(seen).toEqual([]);
    expect(adjustFocused(1, doc)).toBe(true);
    el.value = '1';
    expect(adjustFocused(1, doc), 'max 上还往上走').toBe(false);
    expect(el.value).toBe('1');
    expect(seen).toEqual(['0.05']);
    // 靠近头但没到头（0.95 的下一档就是 1）：仍然走得动，不许"差一格就当到头"
    el.value = '0.95';
    expect(adjustFocused(1, doc)).toBe(true);
    expect(el.value).toBe('1');
  });

  it('浮点尾巴抹掉：1.6 − 0.1 得到 1.5（那串 1.5000000000000002 会被存进盘里给玩家看）', () => {
    const doc = fakeDoc();
    const { el } = slider(doc, { min: 0.6, max: 3, step: 0.1, value: 1.6 });
    el.focus();
    expect(adjustFocused(-1, doc)).toBe(true);
    expect(el.value).toBe('1.5');
    expect(adjustFocused(1, doc)).toBe(true);
    expect(el.value).toBe('1.6');
  });

  it('焦点不在滑杆上（按钮 / body / 没有 document）：不接这一下', () => {
    const doc = fakeDoc();
    const panel = fakePanel(['close-btn'], doc);
    panel.items[0].focus();
    expect(adjustFocused(1, doc)).toBe(false);
    expect(adjustFocused(1, fakeDoc())).toBe(false);       // 焦点还在 body 上
    expect(adjustFocused(1, undefined)).toBe(false);       // node / 单元调用
  });

  it('禁用的滑杆不吃（浏览器本来也不会给它焦点，这里同样不许我们代劳）', () => {
    const doc = fakeDoc();
    const { el } = slider(doc, { disabled: true });
    doc.setActive(el);
    expect(adjustFocused(1, doc)).toBe(false);
    expect(el.value).toBe('0.5');
  });

  it('脏 step（空 / 0 / 字符串）按缺省 1 档走，不把 NaN 写进值里', () => {
    const doc = fakeDoc();
    for (const step of ['', 0, 'abc']) {
      const { el } = slider(doc, { min: 0, max: 10, step, value: 1 });
      el.focus();
      expect(adjustFocused(1, doc), `step=${JSON.stringify(step)}`).toBe(true);
      expect(el.value).toBe('2');
    }
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

/* ------------------------------------ 键盘这条 ←：经同一个派发口推焦点那一格 */

describe('Game.runHotkey 的 uiLeft / uiRight：键盘这条路也要走得通（切片16）', () => {
  afterEach(() => {
    delete globalThis.document;
    setHotkeyTable(UI_HOTKEYS);
  });

  const mountSlider = (g, spec) => {
    const doc = fakeDoc();
    const el = fakeItem('set-deadzone', {
      tag: 'input', type: 'range', min: 0, max: 0.4, step: 0.02, value: 0.2, ...spec,
    });
    const panel = fakePanel([el], doc, 'settings-panel');
    doc.hosts['settings-panel'] = panel.host;
    globalThis.document = doc;
    el.focus();
    return { doc, el, panel };
  };

  it('设置开着、焦点在滑杆上：按 ← 推一档，且按住不连发', () => {
    const g = navGame();
    g.settingsPanel.open = true;
    const { el } = mountSlider(g);
    const fired = [];
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: (code) => hotkeyBlockedBy(g.overlayState(), code),
      onAction: (action) => {
        fired.push(action);
        return Game.prototype.runHotkey.call({ ...g, runEscape: () => false }, action);
      },
    });
    // 接管的证据：这一枚在面板开着时**不被拦**（层表放行移焦与调值），且挡下浏览器默认行为 ——
    // 不挡的话原生滑杆步进与我们各走一次，玩家按一下会走两档
    expect(router.onKeydown('ArrowLeft')).toBe(true);
    expect(hotkeyBlockedBy(g.overlayState(), 'ArrowLeft')).toBe(false);
    router.poll({ ArrowLeft: true });
    expect(fired).toEqual(['uiLeft']);
    expect(el.value).toBe('0.18');
    router.poll({ ArrowLeft: true });
    expect(el.value, '按住不连发').toBe('0.18');
    router.poll({ ArrowLeft: false });
    router.poll({ ArrowLeft: true });
    expect(el.value).toBe('0.16');
  });

  it('野外（没有面板收焦点）：这一下没人接，返回 false 也不抛', () => {
    const g = navGame();
    globalThis.document = fakeDoc();
    const run = (a) => Game.prototype.runHotkey.call({ ...g, runEscape: () => false }, a);
    expect(run('uiLeft')).toBe(false);
    expect(run('uiRight')).toBe(false);
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
      // 归属问的是"谁把焦点带进这一格"，不是"谁查过这个 id"：拍照导演也会去藏 #journal-panel，
      // 但那不是认领 —— 把查过 id 的都算成主人，等于禁止任何面板被别处复用（切片27 的日志抽屉就这么撞的）
      const claimants = FILES.filter(({ source }) => source.includes(`getElementById('${l.nav}')`)
        && source.includes('focusFirstItem('));
      expect(claimants, `没有面板认领宿主 "${l.nav}"（层表 ${l.layer} 那一格是死的）`).toHaveLength(1);
      // 认领者还得真的会在"打开那一刻"落焦：方法名各家不同（show / setJournal），落焦必须在里面
      const owner = claimants[0].source;
      const bodies = [...owner.matchAll(/\n {2}(?:show|open|setJournal|toggle)[A-Za-z]*\([^)]*\)\s*\{[\s\S]*?\n {2}\}/g)].map((m) => m[0]);
      expect(bodies.length, `${claimants[0].name} 找不到开面板的方法体`).toBeGreaterThan(0);
      expect(bodies.some((b) => b.includes('focusFirstItem(')),
        `${claimants[0].name} 开面板时没落焦（玩家开完第一眼没有落点）`).toBe(true);
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

  it('导航动作在 `runHotkey` 里全部有出口：↑↓ 走格、← → 调值，方向不许反也不许多一条', () => {
    const body = sourceOf('core/Game.js').match(/runHotkey\(action\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 runHotkey 的函数体').toBeTruthy();
    const toNav = [...body[0].matchAll(/case '([a-zA-Z]+)':\s*return this\.movePanelFocus\((-?\d)\);/g)];
    const toAdjust = [...body[0].matchAll(/case '([a-zA-Z]+)':\s*return adjustFocused\((-?\d)\);/g)];
    expect(toNav.map((m) => m[1]).sort()).toEqual(['uiDown', 'uiUp']);
    expect(toNav.map((m) => m[2])).toEqual(['-1', '1']);        // 上 = -1、下 = +1，方向不许反
    expect(toAdjust.map((m) => m[1]).sort()).toEqual(['uiLeft', 'uiRight']);
    expect(toAdjust.map((m) => m[2])).toEqual(['-1', '1']);      // ← = -1、→ = +1，同样不许反
    // 四个动作一个不多一个不少：漏一个 = 那枚键在面板里是死的，多一个 = 有人绕过这两条出口
    expect([...toNav, ...toAdjust].map((m) => m[1]).sort()).toEqual([...UI_NAV_ACTIONS].sort());
    for (const a of UI_NAV_ACTIONS) expect(UI_ACTIONS, `${a} 不在热键表里`).toContain(a);
  });

  it('导航只有这四个动作，仍然不设"确认"热键：Enter / 空格 归浏览器原生（B52）', () => {
    expect(UI_NAV_ACTIONS).toEqual(['uiUp', 'uiDown', 'uiLeft', 'uiRight']);
    const second = UI_ACTIONS.filter((a) => /confirm|activate/i.test(a));
    expect(second, '登记了第二条激活通路：与浏览器原生抢同一下按键（B52）').toEqual([]);
    // `navLeft` / `navRight` 是**手柄那张表**里的格子名，不是热键动作名 —— 两套名字混用就是第二真源
    expect(UI_ACTIONS.some((a) => /nav[A-Z]/.test(a)), '手柄动作名混进了热键表').toBe(false);
  });

  it('← → 归我们派发的前提：收焦点的面板里不许出现要靠方向键移动光标的文本控件', () => {
    // `preventDefault: true` 把原生滑杆步进一并挡下（不挡就是按一下走两档），代价是方向键不再归浏览器。
    // 今天这是安全的：面板里只有按钮 / 滑杆 / 复选框。哪天有人往面板里塞一个文本框，
    // 光标就再也移不动 —— 那时该改的是这条接管，而不是偷偷给文本框开例外。
    const TEXT_WIDGET = /<textarea\b|type\s*[:=]\s*['"](?:text|search|number|email|url|password)['"]/i;
    const shell = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const shellHit = shell.match(new RegExp(TEXT_WIDGET.source, 'gi')) ?? [];
    expect(shellHit, '壳页里出现了文本控件，方向键接管会吃掉它的光标移动').toEqual([]);
    const offenders = FILES
      .filter(({ source }) => TEXT_WIDGET.test(source))
      .map(({ name }) => name);
    expect(offenders, '源码里动态造了文本控件').toEqual([]);
  });

  it('导航路径只许造一个事件：`input` 那一次在 `adjustFocused` 里，点按钮只许在 `activateFocused` 里', () => {
    const src = sourceOf('ui/FocusNav.js');
    // 切片16：滑杆的写入方听的是 `input`，手柄没有键盘事件，只能由这里代发一次。
    // 与 `.click(` 同一条待遇 —— 只许这一处，多一处就是第二个"我们替浏览器做事"的出口。
    const adjust = src.match(/export function adjustFocused[\s\S]*?\n\}/);
    expect(adjust, '找不到 adjustFocused 的函数体').toBeTruthy();
    expect((src.match(/dispatchEvent\(/g) || []).length, '第二处在造事件').toBe(1);
    expect(adjust[0], '调值不发 `input` = 值动了而设置没动').toContain('dispatchEvent(');
    expect(src).not.toMatch(/'(?:Arrow[A-Za-z]+|Enter|Escape|Key[A-Z])'/);
    // 切片14：手柄的 A 没有"按下聚焦元素"这条原生通路，所以由这里代点一下。
    const fn = src.match(/export function activateFocused[\s\S]*?\n\}/);
    expect(fn, '找不到 activateFocused 的函数体').toBeTruthy();
    expect(fn[0]).toContain('.click(');
    expect((src.match(/\.click\(/g) || []).length, '第二处在点按钮').toBe(1);
  });

  it('移焦键与调值键改绑之后仍然放行：层表问的是动作，不是出厂那几枚箭头', () => {
    setHotkeyTable(applyHotkeyOverrides(UI_HOTKEYS, { uiUp: 'KeyI', uiDown: 'KeyK', uiLeft: 'KeyZ' }));
    expect(hotkeyCodeFor('uiUp')).toBe('KeyI');
    const open = { settingsOpen: true };
    for (const l of OVERLAY_LAYERS) if (!(l.state in open)) open[l.state] = false;
    expect(hotkeyBlockedBy(open, 'KeyI')).toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyZ')).toBe(false);
    expect(hotkeyBlockedBy(open, 'ArrowUp')).toBe(true);
    expect(hotkeyBlockedBy(open, 'ArrowLeft')).toBe(true);     // 改绑之后出厂 ← 反而被自己的面板拦下
  });
});

/* ------------------------------------------- 焦点环：走得到，也要看得见（W-D6 切片9） */

/**
 * 这一片防的是**静默的不可用**：↑↓ 把焦点搬到那一格上了，数据里一切正常，
 * 屏幕上却看不出来焦点在哪 —— 没有报错、没有 console，玩家只是"不知道选的是谁"。
 *
 * 普查（改前）实测：焦点环规则只认 `.panel-box button` 与 `.settings-box input`，
 * 于是日志抽屉（`#journal-panel`，八个页签是 `innerHTML` 动态建的）、升级面板
 * （`#upgrade-panel`）、对话框（`#dialog-overlay`）、世界地图（`#world-map-panel`）
 * 四处的按钮全都**键盘走得进去、却看不见落在哪**。前三格还都是 `OVERLAY_LAYERS`
 * 里登记了 `nav` 的宿主 —— 也就是说切片11 特意把焦点送进去的地方，恰好是最看不见的。
 *
 * 所以这里不按容器类点名（点名就是再抄一份"哪个面板套了哪个类"的账，迟早漂），
 * 而是**按标签**断言：天生可聚焦的标签一个不漏，外加 `[tabindex]` 兜住将来自造的聚焦格。
 */
describe('焦点环：落焦的那一格必须肉眼可见（W-D6 切片9）', () => {
  const CSS = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const SHELL = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
  /** 天生可聚焦的标签。漏一个，那一处的焦点就看不见 —— 且没有任何别处会报错 */
  const FOCUSABLE_TAGS = ['button', 'input', 'select', 'textarea', 'a'];

  /** 所有真的写了 `outline` 的 `:focus` 规则（先剥注释，否则注释里提一句 `:focus` 也算一条） */
  const focusOutlineRules = (css) => [...css.matchAll(/([^{}]*:focus[^{}]*)\{([^}]*)\}/g)]
    .map((m) => ({ selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean), body: m[2] }))
    .filter((r) => /outline\s*:/.test(r.body));

  it('焦点环只有一条，且按标签覆盖全部天生可聚焦的元素', () => {
    const rules = focusOutlineRules(CSS);
    expect(rules, '写了 outline 的 `:focus` 规则不是恰好一条').toHaveLength(1);
    for (const tag of FOCUSABLE_TAGS) {
      expect(rules[0].selectors, `${tag}:focus 没有焦点环 —— 键盘玩家看不见焦点落在哪`).toContain(`${tag}:focus`);
    }
    expect(rules[0].selectors, '自造聚焦格（tabindex）没有焦点环').toContain('[tabindex]:focus');
  });

  it('没有任何一处把焦点环关掉（outline:none 在这一片是死罪）', () => {
    expect(/outline\s*:\s*none/.test(CSS), '样式表里出现了 outline:none').toBe(false);
    expect(/outline\s*:\s*0(?![.\d])/.test(CSS), '样式表里出现了 outline:0').toBe(false);
  });

  it('壳页里出现的可聚焦标签，全都在那条规则的覆盖清单里', () => {
    const 覆盖 = new Set(focusOutlineRules(CSS)[0].selectors);
    const 出现 = FOCUSABLE_TAGS.filter((tag) => new RegExp(`<${tag}[\\s>/]`, 'i').test(SHELL));
    expect(出现.sort(), '壳页里一个可聚焦元素都没有：这条扫描是空跑').not.toEqual([]);
    for (const tag of 出现) {
      expect(覆盖, `壳页里用了 <${tag}>，但它没有焦点环`).toContain(`${tag}:focus`);
    }
  });

  it('JS 动态建出来的可聚焦元素同样被覆盖（日志页签、掉落提示都是这么来的）', () => {
    const 覆盖 = new Set(focusOutlineRules(CSS)[0].selectors);
    const 出现 = FOCUSABLE_TAGS.filter((tag) => new RegExp(
      `createElement\\(\\s*['"` + '`' + `]${tag}['"` + '`' + `]\\s*\\)`, 'i',
    ).test(FILES.map((f) => f.source).join('\n')));
    for (const tag of 出现) {
      expect(覆盖, `源码里 createElement('${tag}')，但它没有焦点环`).toContain(`${tag}:focus`);
    }
  });

  it('这条扫描咬得住：把规则收窄回"只认 .panel-box 的按钮"，立刻红（防空跑门禁）', () => {
    const 收窄 = CSS.replace('button:focus,', '.panel-box button:focus,');
    expect(收窄, '锚点没命中：焦点环那条规则换了写法').not.toBe(CSS);
    const rules = focusOutlineRules(收窄);
    expect(rules).toHaveLength(1);
    expect(rules[0].selectors).not.toContain('button:focus');
    expect(rules[0].selectors).toContain('.panel-box button:focus');
  });
});