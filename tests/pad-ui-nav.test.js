/**
 * 面板内的手柄导航（W-A7 切片14 / W-D1：让手柄玩家也能走界面）。
 *
 * 这一片只解决一个问题：**同一批物理按钮在两个上下文里各有主人**。
 * 三条纪律决定了用例长什么样：
 * 1. 上下文只有一处判（`Game.padUiMode()` 问层表），两张表整表互换 —— 给每格按钮加一列
 *    "面板里改成干什么"就是把这个判断抄十几遍，那才是第二个真源；
 * 2. 换表只走 `useBindings` 那一条结转路径（切片9）：进界面那一刻战斗侧借走的键必须还掉，
 *    否则"不退菜单就永远朝前走"；
 * 3. A **不冒充键盘**：浏览器已经用原生 Enter 激活聚焦元素，再登记一条 `uiConfirm` 热键
 *    就是切片10 抓到的 B52。所以 A 只报一个边沿，激活交回 `FocusNav.activateFocused`。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  GAMEPAD_BINDINGS, UI_GAMEPAD_BINDINGS, UI_PAD_ACTIONS, UI_PAD_SIGNALS, PAD_BUTTON,
  assertKeybinds, assertUiPadBindings, bindingFor, resolveGamepadBindings,
} from '../src/content/keybinds.js';
import { UI_HOTKEYS, applyHotkeyOverrides, setHotkeyTable } from '../src/content/hotkeys.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { Game } from '../src/core/Game.js';
import { moveFocusWithin, focusFirstItem, activateFocused } from '../src/ui/FocusNav.js';
import { HotkeyRouter } from '../src/ui/HotkeyRouter.js';
import { fakeDoc, fakeItem, fakePanel } from './helpers/fakePanelDom.js';
// 界面态的名单从层表现取（切片24）：测试里再抄一份"哪几层收焦点"就是第二份真源
import { OVERLAY_LAYERS } from '../src/ui/OverlayStack.js';

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

/* -------------------------------------------------------------- 假手柄 */

const makePad = () => ({
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
});

const press = (pad, name, down = true) => {
  const b = pad.buttons[PAD_BUTTON[name]];
  b.pressed = down;
  b.value = down ? 1 : 0;
};

const realNavigator = globalThis.navigator;
const setPads = (...pads) => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { getGamepads: () => pads },
  });
};

beforeAll(() => setPads());
afterAll(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});
afterEach(() => {
  setHotkeyTable(UI_HOTKEYS);
  delete globalThis.document;                 // 调值那条路用的是默认文档（`adjustFocused` 的缺省参）
});

/** 与 `Game.resolvePadBinding` 同一分工：热键冒充问生效热键表，游戏键问生效键位表 */
const resolve = (slot) => (slot.hotkey
  ? { code: UI_HOTKEYS.find((e) => e.action === slot.hotkey)?.code ?? null }
  : bindingFor(slot.action));

const mkBridge = (bindings) => {
  const keys = {};
  const pad = makePad();
  setPads(pad);
  const bridge = new GamepadInput({ keys }, bindings, undefined, resolve);
  return { bridge, keys, pad };
};

/* --------------------------------------------------------- 两张表的形状 */

describe('两张表：各表内部一枚按钮一个主人，跨上下文允许重叠', () => {
  it('出厂两张表都过校验（同一把尺子，只是动作名单不同）', () => {
    expect(() => assertKeybinds()).not.toThrow();
    expect(() => assertUiPadBindings()).not.toThrow();
    expect(UI_PAD_ACTIONS.sort()).toEqual(Object.keys(UI_GAMEPAD_BINDINGS).sort());
  });

  it('重叠是设计而非漏洞：A 在战斗里是跳、在界面里是确认 —— 同一帧只有一张表在被轮询', () => {
    const gameButtons = Object.values(GAMEPAD_BINDINGS).map((e) => e.button).filter(Boolean);
    const uiButtons = Object.values(UI_GAMEPAD_BINDINGS).map((e) => e.button);
    expect(uiButtons).toContain('a');
    expect(gameButtons).toContain('a');
  });

  it('界面表里两格抢同一枚按钮照样被拒（表内规则一条都不放宽）', () => {
    expect(() => assertUiPadBindings({
      navUp: { action: 'navUp', mode: 'edge', button: 'dpadUp', hotkey: 'uiUp' },
      navDown: { action: 'navDown', mode: 'edge', button: 'dpadUp', hotkey: 'uiDown' },
    })).toThrow(/认领/);
  });

  it('边沿格子的动作名必须是登记过的信号名（`navUp` 那种"有出口"的名字不算）', () => {
    // 少这一笔的话，桥会把边沿写到一个不存在的槽上：`this.ui['back'] = true` 谁也不读
    expect(() => assertUiPadBindings({
      back: { action: 'back', mode: 'edge', button: 'b', ui: true },
    })).toThrow(/UI_PAD_SIGNALS/);
  });

  it('`ui` 边沿只许界面表用、只许登记过的信号名，且不许同时冒充热键', () => {
    expect(() => assertKeybinds({
      jump: { action: 'jump', mode: 'edge', button: 'a', ui: true },
    })).toThrow(/只有界面态那张表/);
    expect(() => assertUiPadBindings({
      ghost: { action: 'ghost', mode: 'edge', button: 'x' },
    })).toThrow(/未登记/);
    expect(() => assertUiPadBindings({
      confirm: { action: 'confirm', mode: 'edge', button: 'a', ui: true, hotkey: 'escape' },
    })).toThrow(/两个说法/);
  });

  it('边沿格子的名字必须登记在 `UI_PAD_SIGNALS` 里（桥的复用槽按这张名单建）', () => {
    const signalSlots = Object.values(UI_GAMEPAD_BINDINGS).filter((e) => e.ui === true);
    expect(signalSlots.map((e) => e.action).sort()).toEqual([...UI_PAD_SIGNALS].sort());
    // 桥那个复用槽的键集合必须与名单一致：多一格就是没人消费、少一格就是写了个不存在的槽
    const { bridge } = mkBridge(UI_GAMEPAD_BINDINGS);
    expect(Object.keys(bridge.ui).sort()).toEqual([...UI_PAD_SIGNALS].sort());
  });

  it('界面表前三格的出口都来自热键表（改绑之后手柄跟着搬，不在这张表里抄键码）', () => {
    for (const e of Object.values(UI_GAMEPAD_BINDINGS)) {
      if (!e.hotkey) continue;
      expect(UI_HOTKEYS.some((h) => h.action === e.hotkey), e.action).toBe(true);
      expect(e.code, '手柄表不许自己声明出口').toBeUndefined();
    }
  });
});

/* ------------------------------------------------------------ 桥的行为 */

describe('装载界面表之后：十字键走格、B 返回、A 只报边沿不写键', () => {
  it('十字键上 → `keys.ArrowUp`（出口是生效热键表给的），松手立刻归零', () => {
    const { bridge, keys, pad } = mkBridge(UI_GAMEPAD_BINDINGS);
    press(pad, 'dpadUp', true);
    bridge.poll();
    expect(keys.ArrowUp).toBe(true);
    press(pad, 'dpadUp', false);
    bridge.poll();
    expect(keys.ArrowUp).toBe(false);
  });

  it('B 与 Start 都走同一条返回（各自主人不同，出口同一个）', () => {
    for (const button of ['b', 'start']) {
      const { bridge, keys, pad } = mkBridge(UI_GAMEPAD_BINDINGS);
      press(pad, button, true);
      bridge.poll();
      expect(keys.Escape, button).toBe(true);
    }
  });

  it('切片25："界面确认"改绑之后报边沿的是新那一枚，出厂那枚 A 从此不报（仍然只报边沿、不写键）', () => {
    const table = resolveGamepadBindings(UI_GAMEPAD_BINDINGS, { confirm: 'leftStick' }, { assert: assertUiPadBindings });
    const { bridge, keys, pad } = mkBridge(table);
    press(pad, 'a');
    bridge.poll();
    expect(bridge.ui.confirm, '出厂那枚 A 已经不是这一格的主人了').toBe(false);
    press(pad, 'leftStick');
    bridge.poll();
    expect(bridge.ui.confirm, '新那一枚该报一次边沿').toBe(true);
    expect(Object.values(keys).some(Boolean), '这一格永远不冒充键盘键（B52 的纪律不因改绑而破）').toBe(false);
    bridge.poll();
    expect(bridge.ui.confirm, '边沿只有一帧宽，按住不连发').toBe(false);
  });
  it('界面表也能改绑（切片23）：把"返回"挪走之后，出厂那枚 B 不再返回、新那一枚才返回', () => {
    // 这一条要钉的是"生效表进桥"这半：面板写的是 `settings.gamepadUiBinds`，桥装的必须是
    // **叠过那一份**的表 —— 装常量就是"改了设定要重启才生效"那一族（B47 换了轴）
    const table = resolveGamepadBindings(UI_GAMEPAD_BINDINGS, { back: 'rightStick' }, { assert: assertUiPadBindings });
    const { bridge, keys, pad } = mkBridge(table);
    press(pad, 'b');
    bridge.poll();
    expect(keys.Escape, '出厂那枚 B 已经不是这一格的主人了').toBeFalsy();
    press(pad, 'b', false);
    bridge.poll();
    press(pad, 'rightStick');
    bridge.poll();
    expect(keys.Escape, '新那一枚该冒充热键表给的 Escape').toBe(true);
    press(pad, 'rightStick', false);
    bridge.poll();
    expect(keys.Escape, 'edge 格子只亮一帧').toBeFalsy();
    press(pad, 'start');
    bridge.poll();
    expect(keys.Escape, '同一张表里的"界面 Start"不该被顺带改掉').toBe(true);
  });

  it('A 不写任何键，只把 `ui.confirm` 点亮一帧（按住不连发）', () => {
    const { bridge, keys, pad } = mkBridge(UI_GAMEPAD_BINDINGS);
    press(pad, 'a', true);
    bridge.poll();
    const first = bridge.ui.confirm;
    bridge.poll();
    const second = bridge.ui.confirm;
    expect(first).toBe(true);
    expect(second).toBe(false);
    // 一个键都没被冒用过：Space/Enter 一旦写进去，玩家就会一边确认一边跳
    expect(Object.values(keys).some(Boolean)).toBe(false);
    press(pad, 'a', false);
    bridge.poll();
    expect(bridge.ui.confirm).toBe(false);
  });

  it('改绑 ↑ 之后手柄的十字键跟着搬：出口仍然只有热键表这一个真源', () => {
    setHotkeyTable(applyHotkeyOverrides(UI_HOTKEYS, { uiUp: 'KeyI' }));
    const table = UI_HOTKEYS.map((e) => ({ ...applyHotkeyOverrides(UI_HOTKEYS, { uiUp: 'KeyI' }).find((x) => x.action === e.action) }));
    const { bridge, keys, pad } = mkBridge(UI_GAMEPAD_BINDINGS);
    // 用改绑后的表重新解析一次（桥每帧才解析，所以这里换 resolver 等价于换表）
    bridge._resolve = (slot) => (slot.hotkey
      ? { code: table.find((e) => e.action === slot.hotkey)?.code ?? null }
      : bindingFor(slot.action));
    press(pad, 'dpadUp', true);
    bridge.poll();
    expect(keys.KeyI).toBe(true);
    expect(keys.ArrowUp).toBeFalsy();
  });

  it('十字键左右 → 冒充 ← →（切片16：调值与 ↑↓ 同一个出口），松手立刻归零', () => {
    for (const [button, code] of [['dpadLeft', 'ArrowLeft'], ['dpadRight', 'ArrowRight']]) {
      const { bridge, keys, pad } = mkBridge(UI_GAMEPAD_BINDINGS);
      press(pad, button, true);
      bridge.poll();
      expect(keys[code], button).toBe(true);
      press(pad, button, false);
      bridge.poll();
      expect(keys[code], button).toBe(false);
    }
    // 手柄那两格不写信号槽：`navLeft`/`navRight` 是"冒充某一格键"的格子名，
    // 真正的信号槽（`UI_PAD_SIGNALS`）仍然只有 B 那一个 —— 见上面那条名单门禁
    expect(Object.keys(UI_GAMEPAD_BINDINGS).sort())
      .toEqual(['back', 'menu', 'confirm', 'navUp', 'navDown', 'navLeft', 'navRight'].sort());
    expect(UI_PAD_SIGNALS).toEqual(['confirm']);
  });

  it('改绑 ← 之后手柄的十字键左跟着搬：调值出口同样只有热键表这一个真源', () => {
    setHotkeyTable(applyHotkeyOverrides(UI_HOTKEYS, { uiLeft: 'KeyZ' }));
    const table = applyHotkeyOverrides(UI_HOTKEYS, { uiLeft: 'KeyZ' });
    const { bridge, keys, pad } = mkBridge(UI_GAMEPAD_BINDINGS);
    bridge._resolve = (slot) => (slot.hotkey
      ? { code: table.find((e) => e.action === slot.hotkey)?.code ?? null }
      : bindingFor(slot.action));
    press(pad, 'dpadLeft', true);
    bridge.poll();
    expect(keys.KeyZ).toBe(true);
    expect(keys.ArrowLeft).toBeFalsy();
  });

  it('进界面那一刻把战斗侧借走的键还掉：不会"不退菜单就永远朝前走"', () => {
    const keys = {};
    const pad = makePad();
    setPads(pad);
    const bridge = new GamepadInput({ keys }, GAMEPAD_BINDINGS, undefined, resolve);
    press(pad, 'dpadUp', true);                 // 十字键上 = moveUp（借走 KeyW）
    bridge.poll();
    expect(keys.KeyW).toBe(true);
    bridge.useBindings(UI_GAMEPAD_BINDINGS);    // 上下文切换走的就是这一条
    expect(keys.KeyW).toBe(false);
    expect(bridge.ui.confirm).toBe(false);
  });

  it('回战斗那一刻界面侧的边沿也不残留', () => {
    const { bridge, pad } = mkBridge(UI_GAMEPAD_BINDINGS);
    press(pad, 'a', true);
    bridge.poll();
    expect(bridge.ui.confirm).toBe(true);
    bridge.useBindings(GAMEPAD_BINDINGS);
    expect(bridge.ui.confirm).toBe(false);
  });
});

/* ------------------------------------------------ 焦点：A 激活那一格 */

describe('activateFocused：把"激活聚焦那一格"交回浏览器', () => {
  const doc = () => {
    const d = fakeDoc();
    const { host, items } = fakePanel(['pause-resume', 'pause-save'], d, 'pause-menu');
    d.hosts['pause-menu'] = host;
    return { d, items };
  };

  it('焦点在某一格上：点它就是一次（委托监听收到、账本只加一）', () => {
    const { d, items } = doc();
    items[1].focus();
    expect(activateFocused(d)).toBe(true);
    expect(items[1].clicks).toBe(1);
    expect(items[0].clicks ?? 0).toBe(0);
  });

  it('焦点还在 body（野外面按了 A）：什么都不做，也不报错', () => {
    const d = fakeDoc({});
    expect(activateFocused(d)).toBe(false);
  });

  it('禁用格不吃激活（浏览器本来也不会给它焦点，这里是不许我们代劳）', () => {
    const { d, items } = doc();
    items[0].disabled = true;
    d.setActive(items[0]);
    expect(activateFocused(d)).toBe(false);
    expect(items[0].clicks ?? 0).toBe(0);
  });

  it('没有 document（node 环境/单元调用）也不炸', () => {
    expect(activateFocused(undefined)).toBe(false);
  });

  it('焦点还在 body 上时不许点 body（那会演化成"按 A 点了一下页面"）', () => {
    const body = { tagName: 'BODY', clicks: 0 };
    body.click = () => { body.clicks += 1; };
    expect(activateFocused({ activeElement: body, body })).toBe(false);
    expect(body.clicks).toBe(0);
  });
});

/* ----------------------------------------- 端到端：桥 → 派发口 → 焦点 → A */

describe('一条路走到底：十字键经同一个派发口移焦，A 激活聚焦那一格', () => {
  it('手柄按过的格子里，键盘路径与所有消费者不必认识手柄（切片3 的立论在这一片仍然成立）', () => {
    const doc = fakeDoc();
    const menu = fakePanel(['pause-resume', 'pause-save', 'pause-settings'], doc, 'pause-menu');
    doc.hosts['pause-menu'] = menu.host;
    const pad = makePad();
    setPads(pad);
    const keys = {};
    const bridge = new GamepadInput({ keys }, UI_GAMEPAD_BINDINGS, undefined, resolve);
    const fired = [];
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: () => false,
      onAction: (action) => {
        fired.push(action);
        if (action === 'uiDown') return moveFocusWithin(menu.host, 1, doc);
        if (action === 'uiUp') return moveFocusWithin(menu.host, -1, doc);
        return false;
      },
    });
    // 菜单刚开：落焦由生产那条 `focusFirstItem` 决定（第一格），↓ 才走到第二格
    focusFirstItem(menu.host, doc);
    expect(doc.activeElement).toBe(menu.items[0]);
    // 一帧：桥先写键，再由派发口读边沿 —— 与 `Game.update` 的次序一致
    press(pad, 'dpadDown', true);
    bridge.poll();
    router.poll(keys);
    expect(doc.activeElement).toBe(menu.items[1]);
    press(pad, 'dpadDown', false);
    bridge.poll();
    router.poll(keys);
    expect(fired).toEqual(['uiDown']);
    // A：不写键、由 `activateFocused` 点当前那一格
    press(pad, 'a', true);
    bridge.poll();
    router.poll(keys);
    expect(bridge.ui.confirm).toBe(true);
    expect(activateFocused(doc)).toBe(true);
    expect(menu.items[1].clicks).toBe(1);
    expect(fired, 'A 也被登记成了一条热键 = 第二个激活消费者').toEqual(['uiDown']);
  });

  it('同一根路推滑杆：十字键左 → 冒充 ← → 同一个派发口 → 值真的动一档（切片16）', () => {
    // 这条钉的是"手柄没有键盘事件"那句话本身：原生滑杆听的是 `keydown`，
    // 没有下面这条派发链，十字键左对滑杆就是零效果
    const doc = fakeDoc();
    const el = fakeItem('set-vol', {
      tag: 'input', type: 'range', min: 0, max: 1, step: 0.1, value: 0.6,
    });
    const panel = fakePanel([el], doc, 'settings-panel');
    doc.hosts['settings-panel'] = panel.host;
    globalThis.document = doc;
    el.focus();
    const pad = makePad();
    setPads(pad);
    const keys = {};
    const bridge = new GamepadInput({ keys }, UI_GAMEPAD_BINDINGS, undefined, resolve);
    const fired = [];
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: () => false,
      onAction: (action) => {
        fired.push(action);
        // 假 game 要满足 runHotkey 的依赖：切片13 起 uiLeft/uiRight 也走 panelNav，
        // 而 panelNav 要问层表（overlayState）与地图开没开（worldMapPanel）
        const fake = {
          runEscape: () => false,
          worldMapPanel: { open: false },
          overlayState: () => ({ settingsOpen: true }),
          panelNav: (dir) => Game.prototype.panelNav.call(fake, dir),
        };
        return Game.prototype.runHotkey.call(fake, action);
      },
    });
    press(pad, 'dpadLeft', true);
    bridge.poll();
    router.poll(keys);
    expect(fired).toEqual(['uiLeft']);
    expect(el.value).toBe('0.5');
    // 切片18 之后这条仍然成立，但理由换了：不连发不是因为格子是边沿（那四格现在是 level），
    // 而是因为这里**没给 `dt`** —— 连发要有时钟，`poll(keys)` 只派发边沿
    router.poll(keys);
    expect(el.value).toBe('0.5');
    press(pad, 'dpadLeft', false);
    bridge.poll();
    router.poll(keys);
    press(pad, 'dpadLeft', true);
    bridge.poll();
    router.poll(keys);
    expect(el.value).toBe('0.4');
    // 右一下回去：同一格按钮在"上下文"里换了主人，出口仍是热键表那一个
    press(pad, 'dpadLeft', false);
    press(pad, 'dpadRight', true);
    bridge.poll();
    router.poll(keys);
    expect(fired).toEqual(['uiLeft', 'uiLeft', 'uiRight']);
    expect(el.value).toBe('0.5');
  });
});


describe('Game：上下文判定与换表都只有一条路', () => {
  // `Game.prototype.overlayState` 读的是各面板对象上的布尔，所以假 game 要按生产者那形状搭
  const FIELD = {
    worldMapOpen: ['worldMapPanel', 'open'], autoPlayActive: ['playerAutoPlay', 'active'],
    helpOpen: ['helpManual', 'open'], settingsOpen: ['settingsPanel', 'open'],
    fastTravelOpen: ['fastTravelPanel', 'open'], pauseMenuOpen: ['pauseMenu', 'open'],
    dialogOpen: ['dialog', 'open'], upgradeOpen: ['upgrade', 'open'],
    journalOpen: ['hud', 'journalOpen'],   // 切片27：日志抽屉今天也是收焦点的一层
  };
  const gameWith = (over) => {
    const g = { overlayState: Game.prototype.overlayState, cinematicActive: false };
    for (const [key, [obj, prop]] of Object.entries(FIELD)) {
      g[obj] = g[obj] ?? {};
      g[obj][prop] = Boolean(over[key]);
    }
    return g;
  };

  it('收焦点的那几层开着 = 界面态；地图 / 自动演示不算', () => {
    const probe = (over) => Game.prototype.padUiMode.call(gameWith(over));
    // 判据是"有没有一层收了焦点"（`topNavLayer`），名单从层表现取 —— 测试里不抄第二份
    const navs = OVERLAY_LAYERS.filter((l) => l.nav).map((l) => l.state);
    // 切片10 给对话框也认领了宿主（选项是玩法决策），它从此也是界面态；
    // 那一版没同步这里，于是这条期望从切片10 起就是红的（HEAD 上即红）。
    expect(navs.sort()).toEqual(['dialogOpen', 'fastTravelOpen', 'helpOpen', 'journalOpen',
      'pauseMenuOpen', 'settingsOpen', 'upgradeOpen'].sort());
    for (const k of navs) {
      expect(probe({ [k]: true }), k).toBe(true);
    }
    // 升级面板今天在里面（切片24 / B55）：它收焦点，所以那九格手柄走得到
    for (const k of ['worldMapOpen', 'autoPlayActive']) {
      expect(probe({ [k]: true }), k).toBe(false);   // 那些面板今天不收焦点 → 手柄仍归战斗
    }
    expect(probe({})).toBe(false);
  });

  it('判据与"↑↓ 走进哪个面板"同源：都是 `topNavLayer`，别处不许另判一次', () => {
    const game = sourceOf('core/Game.js');
    // 四处，全是同一个函数：手柄界面态（padUiMode）、指针锁释放、↑↓←→ 落点（panelNav）、
    // 以及模态开着时那一指 Tab 归谁（trapFocusKey，切片14）。数字钉的是"没有第五种问法"——
    // 哪一边加了"自己看面板布尔"的判断，这条就红。
    expect((game.match(/topNavLayer\(/g) || []).length, '第五处上下文判定').toBe(4);
    // 用面板布尔直接判"是不是界面态"就是抄了第二份判据
    expect(game).not.toMatch(/padUi\s*=\s*.*(pauseMenu|settingsPanel|helpManual)\.open/);
  });

  it('换表只许出现在 `applyPadBindings` 里：改绑与上下文切换共用同一条路', () => {
    const game = sourceOf('core/Game.js');
    expect((game.match(/useBindings\(/g) || []).length).toBe(1);
    const body = game.match(/applyPadBindings\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 applyPadBindings 的方法体').toBeTruthy();
    expect(body[0]).toContain('UI_GAMEPAD_BINDINGS');
    expect(body[0]).toContain('this.padTable');
    expect((game.match(/applyPadBindings\(\);/g) || []).length, '换表的调用点').toBe(2);
  });

  it('界面态换的是**生效**那张界面表（切片23）：改过"返回"之后不必重启，出厂那枚 B 就不再返回', () => {
    // 只看 `applyPadBindings` 的源码会漏掉一件事：它挑对了表名、却喂了常量。
    // 所以这里走真方法 + 真桥：装表之后按新那枚才关得掉，按出厂那枚什么都不该发生
    const { bridge, keys, pad } = mkBridge(GAMEPAD_BINDINGS);
    const g = gameWith({ settingsOpen: true });
    g.padUiMode = Game.prototype.padUiMode;
    g.padInput = bridge;
    g.padTable = GAMEPAD_BINDINGS;
    g.uiPadTable = resolveGamepadBindings(UI_GAMEPAD_BINDINGS, { back: 'rightStick' }, { assert: assertUiPadBindings });
    Game.prototype.applyPadBindings.call(g);
    expect(bridge._slots.find((s) => s.action === 'back').button).toBe(PAD_BUTTON.rightStick);
    press(pad, 'b');
    bridge.poll();
    expect(keys.Escape, '出厂那枚 B 已经不是这一格的主人了').toBeFalsy();
    press(pad, 'b', false);
    bridge.poll();
    press(pad, 'rightStick');
    bridge.poll();
    expect(keys.Escape, '改绑之后动的是桥在用那张表').toBe(true);
  });

  it('A 那一下只有一个消费者：`activateFocused` 在 Game 里被调用一次，热键表里也没有 confirm 动作', () => {
    const game = sourceOf('core/Game.js');
    expect((game.match(/activateFocused\(/g) || []).length).toBe(1);
    expect(UI_HOTKEYS.some((e) => /confirm|activate/i.test(e.action)), '登记了第二条激活路径')
      .toBe(false);
  });

  it('`update` 里的次序就是这一片的机制本体：先换表、再轮询、最后消费 A', () => {
    const body = sourceOf('core/Game.js').match(/\n {2}update\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 update 的方法体').toBeTruthy();
    const at = (needle) => body[0].indexOf(needle);
    expect(/padUi\s*=\s*this\.padUiMode\(\)/.test(body[0]),
      '每帧没真的问层表：换了上下文也看不出来').toBe(true);
    const switchAt = at('this.applyPadBindings();');
    const pollAt = at('this.padInput?.poll();');
    const confirmAt = at('activateFocused(document)');
    expect(switchAt, '帧首没换表：这一帧的按下会用上一帧的表').toBeGreaterThanOrEqual(0);
    expect(pollAt).toBeGreaterThanOrEqual(0);
    expect(confirmAt, '没人消费 A 那个边沿').toBeGreaterThanOrEqual(0);
    expect(switchAt, '换表必须发生在轮询之前').toBeLessThan(pollAt);
    expect(confirmAt, '消费边沿必须在看得到本帧状态之后').toBeGreaterThan(pollAt);
  });

  it('这条也咬得住：把上下文判定改成"看某格面板开没开"立刻红（自证）', () => {
    const original = sourceOf('core/Game.js');
    const smuggled = original.replace(
      '    return !!topNavLayer(this.overlayState());',
      '    return this.pauseMenu.open || this.settingsPanel.open;',
    );
    expect(smuggled, '锚点没命中：判据写法变了，请把这条自证一起改').not.toBe(original);
    const asksLayerTable = (src) => {
      const body = src.match(/padUiMode\(\)\s*\{[\s\S]*?\n {2}\}/);
      return Boolean(body) && body[0].includes('topNavLayer(this.overlayState())');
    };
    expect(asksLayerTable(original), '现写法本来就该问层表').toBe(true);
    expect(asksLayerTable(smuggled), '第二处判定没被抓到').toBe(false);
  });
});
