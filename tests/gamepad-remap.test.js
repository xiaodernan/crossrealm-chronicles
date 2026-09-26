/**
 * 手柄侧改绑（W-A7 切片9）。
 *
 * 三件事各自要证的东西不一样：
 * 1. **覆盖表**（`resolveGamepadBindings`）：只认枚举按钮名、移动那四格不给改单键、
 *    而且**一枚按钮只许一个动作认领**（B51 —— 出厂表恰好互不重复，所以这条以前没人踩得到；
 *    有了改绑界面它就是点两下的事，与 B47 同族）。
 * 2. **换表**（`GamepadInput.useBindings`）：按动作名结转边沿与借键账本 —— 按住期间改绑
 *    既不许漏放键（"永远朝前走"那一类），也不许在换表后第一帧凭空补发一次动作。
 * 3. **捕获**：报出按钮名之前先等松手。若按下即报，面板改完表之后同一帧的"还按着"
 *    会被新表当成一次新的按下 —— 把 `start` 那一格改绑时就会顺手开一次暂停菜单。
 *
 * 用例尽量走**真帧轮询**（假 `navigator.getGamepads()` + 真 `GamepadInput`），
 * 断言的是 `keys` 哪一格在哪一帧为真、回调被叫了几次，而不是"函数存在"。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GAMEPAD_BINDINGS, KEY_BINDINGS, PAD_ACTIONS, PAD_BUTTON, PAD_BUTTON_BY_INDEX, PAD_BUTTON_COUNT,
  UI_GAMEPAD_BINDINGS,
  assertKeybinds, assertUiPadBindings, assertPadScopesDisjoint, buildBindingTables,
  factoryGamepadBindings, padScopeOf, resolveGamepadBindings,
} from '../src/content/keybinds.js';
import { UI_HOTKEYS } from '../src/content/hotkeys.js';
import { PAD_BUTTON_LABELS, padButtonLabel, padStickLabel } from '../src/content/keyLabels.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { SettingsManager } from '../src/core/SettingsManager.js';

const STORAGE_KEY = 'crossrealm_settings';

/** 真机 `navigator.getGamepads()` 返回的形状（标准映射、16 键 4 轴） */
const makePad = () => ({
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),   // 第 17 格是多余键，桥不该认
});

const press = (pad, name, down = true) => {
  const b = pad.buttons[PAD_BUTTON[name]];
  b.pressed = down;
  b.value = down ? 1 : 0;
};

const stick = (pad, x, y) => { pad.axes[0] = x; pad.axes[1] = y; };
const lookStick = (pad, x, y) => { pad.axes[2] = x; pad.axes[3] = y; };

const realNavigator = globalThis.navigator;
let pads = [];
const setPads = (...list) => { pads = list; };

beforeAll(() => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => pads },
  });
});

afterAll(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});

afterEach(() => {
  pads = [];
  delete globalThis.localStorage;
  delete globalThis.document;
  delete globalThis.window;
});

/** 与 `Game.resolvePadBinding` 同一分工：热键冒充问热键表，游戏键问生效键位表 */
const resolveSlot = (slot) => {
  if (slot.hotkey) {
    const code = UI_HOTKEYS.find((e) => e.action === slot.hotkey)?.code;
    return code ? { code } : null;
  }
  return KEY_BINDINGS[slot.action] ?? null;
};

describe('手柄覆盖表：一枚按钮只许一个动作认领', () => {
  it('空覆盖与出厂表逐条等值，且返回的是新表（改它不污染常量）', () => {
    const t = resolveGamepadBindings(GAMEPAD_BINDINGS, {});
    expect(t).toEqual(GAMEPAD_BINDINGS);
    expect(t).not.toBe(GAMEPAD_BINDINGS);
    t.jump.button = 'b';
    expect(GAMEPAD_BINDINGS.jump.button).toBe('a');
  });

  it('改一格只动那一格，`mode` 与 `hotkey` 原样留着', () => {
    // 合法形状是"跳与滚互换"：单改成 B 会撞上翻滚，那正是下面 B51 那一条要拦的
    const t = resolveGamepadBindings(GAMEPAD_BINDINGS, { jump: 'b', roll: 'a' });
    expect(t.jump).toEqual({ action: 'jump', mode: 'edge', button: 'b' });
    expect(t.parry.button).toBe('x');           // 别的格子没动
    expect(t.pauseMenu.hotkey).toBe('escape');  // 冒充热键那一格的身份不因改绑而丢
  });

  it('非法按钮名一律抛：HTML、数字、未登记的名字、非字符串', () => {
    for (const bad of ['', null, 7, '<img src=x onerror=alert(1)>', 'circle', 'A']) {
      expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { jump: bad }), String(bad)).toThrow(/不合法/);
    }
  });

  it('未知动作名抛（表里没有这一格，就不许凭空造一格）', () => {
    expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { guildRaid: 'a' })).toThrow(/未知的手柄动作/);
  });

  it('移动那四格不给改成单键：那是要扔掉摇杆或十字键的减法', () => {
    for (const action of ['moveUp', 'moveDown', 'moveLeft', 'moveRight']) {
      expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { [action]: 'a' }), action).toThrow(/左摇杆 \+ 十字键/);
    }
  });

  it('B51：两个动作抢同一枚按钮要在应用那一刻抛，而不是按一次办两件事', () => {
    // `roll` 出厂占着 B；把 `jump` 也改到 B —— 两格各自看都完全合法
    expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { jump: 'b' })).toThrow(/按钮 b已被动作 "jump" 认领/);
    // 反过来把 `roll` 改到 A 同样要拦
    expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { roll: 'a' })).toThrow(/按钮 a已被动作 "jump" 认领/);
  });

  it('抢十字键同样拦：移动那四格顺带认领了四个方向', () => {
    // 报错点名"后动手的那一格"与"先占着的那个动作"；十字键那四格由移动顺带认领
    expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { jump: 'dpadUp' })).toThrow(/dpadUp已被动作 "moveUp" 认领/);
    expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { jump: 'dpadLeft' })).toThrow(/dpadLeft已被动作 "moveLeft" 认领/);
  });

  it('换到一枚空着的键仍然可以（认领校验不是"什么都别改"）', () => {
    const t = resolveGamepadBindings(GAMEPAD_BINDINGS, { parry: 'rightStick' });
    expect(() => assertKeybinds(t)).not.toThrow();
    expect(t.parry.button).toBe('rightStick');
  });

  it('出厂表本身 16 格里被认领的那 15 枚互不重复（新校验上线即绿的底）', () => {
    const claimed = [];
    for (const e of Object.values(GAMEPAD_BINDINGS)) {
      if (e.button !== undefined) claimed.push(PAD_BUTTON[e.button]);
      if (e.dir !== undefined) claimed.push(PAD_BUTTON[`dpad${e.dir[0].toUpperCase()}${e.dir.slice(1)}`]);
    }
    expect(claimed).toHaveLength(PAD_ACTIONS.length);
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it('`buildBindingTables` 第三参一起建三张表：手柄改坏同样整体抛', () => {
    const { padTable, keyTable, hotkeyTable } = buildBindingTables({ parry: 'KeyY' }, UI_HOTKEYS, { jump: 'rightStick' });
    expect(padTable.jump.button).toBe('rightStick');
    expect(keyTable.parry.code).toBe('KeyY');
    expect(hotkeyTable).toHaveLength(UI_HOTKEYS.length);
    expect(() => buildBindingTables({}, UI_HOTKEYS, { jump: 'b' })).toThrow(/按钮 b已被动作 "jump" 认领/);
  });

  it('`factoryGamepadBindings` 每次给新对象（复位不能改到常量本身）', () => {
    const a = factoryGamepadBindings();
    a.jump.button = 'b';
    expect(factoryGamepadBindings().jump.button).toBe('a');
    expect(GAMEPAD_BINDINGS.jump.button).toBe('a');
  });
});

describe('桥换表：按住期间改绑不丢键、不补发', () => {
  const bridge = () => new GamepadInput({ keys: {}, mouseDown: { left: false, right: false } }, GAMEPAD_BINDINGS, null, resolveSlot);

  it('改绑之后新按钮说话、旧按钮从此没反应', () => {
    const pad = makePad();
    setPads(pad);
    const b = bridge();
    const keys = b.keys;
    b.useBindings(resolveGamepadBindings(GAMEPAD_BINDINGS, { jump: 'y', skill: 'a' }));
    press(pad, 'a');
    b.poll();
    expect(keys.Space).toBeFalsy();        // 出厂那枚 A 已经不当跳跃了
    press(pad, 'a', false);
    press(pad, 'y');
    b.poll();
    expect(keys.Space).toBe(true);
  });

  it('按住期间换表：借走的键会被还掉，不漏放在旧那一格里', () => {
    const pad = makePad();
    setPads(pad);
    const b = bridge();
    press(pad, 'leftBumper');              // 锁定：KeyQ
    b.poll();
    expect(b.keys.KeyQ).toBe(true);
    b.useBindings(resolveGamepadBindings(GAMEPAD_BINDINGS, { lockOn: 'rightStick', parry: 'leftBumper' }));
    b.poll();                             // 新按钮（右摇杆按下）没被按着 → 放还当初借走的那一格
    expect(b.keys.KeyQ).toBe(false);
  });

  it('换表不许在下一帧凭空补发一次"刚按下"（边沿账本按动作名结转）', () => {
    const pad = makePad();
    setPads(pad);
    const b = bridge();
    press(pad, 'a');
    b.poll();
    expect(b.keys.Space).toBe(true);
    b.keys.Space = false;                  // 模拟消费者"读完清一格"
    b.useBindings(GAMEPAD_BINDINGS);       // 同一张表重建一次
    b.poll();
    expect(b.keys.Space).toBe(false);      // 还按着不等于又按了一次
  });

  it('电平格子跨换表仍维持借用（按住冲刺不会因换表断一下）', () => {
    const pad = makePad();
    setPads(pad);
    const b = bridge();
    press(pad, 'leftStick');
    b.poll();
    expect(b.keys.ShiftLeft).toBe(true);
    b.keys.ShiftLeft = false;
    b.useBindings(resolveGamepadBindings(GAMEPAD_BINDINGS, { parry: 'rightStick' }));
    b.poll();
    expect(b.keys.ShiftLeft).toBe(true);   // 还按着 → 这一帧照样是"冲刺按着"
  });

  it('被这次改表删掉的格子把借走的键还回去', () => {
    const pad = makePad();
    setPads(pad);
    const b = bridge();
    press(pad, 'a');
    b.poll();
    expect(b.keys.Space).toBe(true);
    b.useBindings({ jump: { action: 'jump', mode: 'edge', button: 'y' } });   // 只剩一格
    b.poll();
    expect(b.keys.Space).toBe(false);
    expect(b._slots).toHaveLength(1);
  });

  it('被删掉的那格正按着时也要还键：存活格的账本替不了它', () => {
    const pad = makePad();
    setPads(pad);
    const b = bridge();
    press(pad, 'a');
    press(pad, 'b');            // 同时按着两枚：jump 与 roll 各借走一个键
    b.poll();
    expect(b.keys.Space).toBe(true);
    expect(b.keys.ControlLeft).toBe(true);
    // 换成的这张表里 jump 搬去 Y、roll 整格没了 —— 那枚按着的 B 键从此无人认领
    b.useBindings({ jump: { action: 'jump', mode: 'edge', button: 'y' } });
    b.poll();
    expect(b.keys.Space).toBe(false);        // 这条靠结转来的 `claimed`
    expect(b.keys.ControlLeft).toBe(false);  // 这条只能靠"删掉的格子"那条归还路径
  });

  it('八向码照写：改绑只动按钮格子，摇杆与十字键那条路不换', () => {
    const pad = makePad();
    setPads(pad);
    const b = bridge();
    b.useBindings(resolveGamepadBindings(GAMEPAD_BINDINGS, { jump: 'y', skill: 'a' }));
    stick(pad, 0, -1);
    b.poll();
    expect(b.keys.KeyW).toBe(true);
    expect(b.move.mag).toBeGreaterThan(0.9);
  });

  it('换表不影响镜头与移动的复用槽身份（同一个对象被写回）', () => {
    const b = bridge();
    const look = b.look;
    const move = b.move;
    b.useBindings(GAMEPAD_BINDINGS);
    expect(b.look).toBe(look);
    expect(b.move).toBe(move);
  });
});

describe('捕获：按下并松手才算一次改绑', () => {
  const wire = () => {
    const pad = makePad();
    setPads(pad);
    const found = [];
    const b = new GamepadInput({ keys: {}, mouseDown: { left: false, right: false } }, GAMEPAD_BINDINGS, null, resolveSlot);
    b.startCapture((name) => found.push(name));
    return { pad, b, found };
  };

  it('进入捕获会把桥借走的键全还回去（否则那一格永远停在"按着"）', () => {
    const pad = makePad();
    setPads(pad);
    const b = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, null, resolveSlot);
    press(pad, 'leftBumper');
    b.poll();
    expect(b.keys.KeyQ).toBe(true);
    b.startCapture(() => {});
    expect(b.keys.KeyQ).toBe(false);
  });

  it('按下那一帧只记账不报，松手那一帧才报，且只报一次', () => {
    const { pad, b, found } = wire();
    press(pad, 'x');
    b.poll();
    expect(found).toEqual([]);
    press(pad, 'x', false);
    b.poll();
    expect(found).toEqual(['x']);
    press(pad, 'x');
    b.poll();
    press(pad, 'x', false);
    b.poll();
    expect(found).toEqual(['x']);          // 一次性：报完就解除
  });

  it('捕获期间那一枚按下不许变成一次真动作（跳跃不许顺手跳一下）', () => {
    const { pad, b } = wire();
    press(pad, 'a');
    b.poll();
    expect(b.keys.Space).toBeFalsy();
    press(pad, 'a', false);
    b.poll();
    expect(b.keys.Space).toBeFalsy();
  });

  it('松手之后仍按着的别的格子不许补发边沿，但松开再按就恢复正常', () => {
    const pad = makePad();
    setPads(pad);
    const b = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, null, resolveSlot);
    b.startCapture(() => {});
    press(pad, 'b');                       // 捕获用的那一枚
    b.poll();
    press(pad, 'a', true);                 // 另一枚一直按着
    press(pad, 'b', false);
    b.poll();                              // 报出 b，捕获结束
    expect(b.keys.Space).toBeFalsy();      // 一直按着的 A 不算"刚按下"
    press(pad, 'a', false);
    b.poll();
    press(pad, 'a');
    b.poll();
    expect(b.keys.Space).toBe(true);       // 松过再按就是正常的一次跳跃
  });

  it('先按的那一枚说话：连按两枚时报第一个', () => {
    const { pad, b, found } = wire();
    press(pad, 'a');
    b.poll();
    press(pad, 'b');
    b.poll();
    press(pad, 'a', false);
    b.poll();
    expect(found).toEqual(['a']);
  });

  it('捕获期间摇杆既不转镜头也不走路（手放在摇杆上改键不该晃视野）', () => {
    const { pad, b } = wire();
    stick(pad, 1, 0);
    lookStick(pad, 1, 0);
    b.poll();
    expect(b.move.x).toBe(0);
    expect(b.move.mag).toBe(0);
    expect(b.look.x).toBe(0);
    expect(b.keys.KeyD).toBeFalsy();
  });

  it('扳机走迟滞：停在两档门限之间不算松手', () => {
    const { pad, b, found } = wire();
    const t = pad.buttons[PAD_BUTTON.rightTrigger];
    t.pressed = true;
    t.value = 0.8;
    b.poll();
    t.pressed = false;
    t.value = 0.4;                         // > 0.5×0.7 = 0.35 那条迟滞线：仍算按着（走的是模拟量，不是 `pressed`）
    b.poll();
    expect(found).toEqual([]);
    t.pressed = false;
    t.value = 0.2;
    b.poll();
    expect(found).toEqual(['rightTrigger']);
  });

  it('多余的第 17 格按钮不认（标准映射以外不发明按键）', () => {
    const { pad, b, found } = wire();
    pad.buttons[16] = { pressed: true, value: 1 };
    b.poll();
    press(pad, 'a');
    b.poll();
    press(pad, 'a', false);
    b.poll();
    expect(found).toEqual(['a']);
  });

  it('stopCapture 之后按下不报，也不吃掉动作', () => {
    const { pad, b, found } = wire();
    b.stopCapture();
    expect(b.capturing).toBe(false);
    press(pad, 'a');
    b.poll();
    expect(found).toEqual([]);
    expect(b.keys.Space).toBe(true);       // 回到正常派发
  });

  it('捕获中途拔手不许抛，也不许把回调留在桥里', () => {
    const { pad, b, found } = wire();
    press(pad, 'a');
    b.poll();
    pad.connected = false;
    expect(() => b.poll()).not.toThrow();
    expect(found).toEqual([]);
    b.stopCapture();
    expect(b.capturing).toBe(false);
  });

  it('没有手柄时 `startCapture` 不抛（键盘玩家点到手柄那一格也不该白屏）', () => {
    setPads();
    const b = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, null, resolveSlot);
    expect(() => b.startCapture(() => {})).not.toThrow();
    expect(() => b.poll()).not.toThrow();
    expect(b.capturing).toBe(true);
  });
});

describe('设置面板：多出来的那一列', () => {
  /** 最小 DOM：localStorage + 记得到监听回调的 window + 记 innerHTML 的宿主 */
  function withDom() {
    const store = new Map();
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
    return { store, listeners };
  }

  const fakeHost = () => {
    const host = {
      innerHTML: '',
      handlers: [],
      addEventListener(type, fn) { if (type === 'click') host.handlers.push(fn); },
      click(el) { for (const fn of host.handlers) fn({ target: { closest: (sel) => (sel.includes(el.attr) ? el.node : null) } }); },
    };
    return host;
  };

  /** 一行手柄格：`{ attr: 'data-padbind', node: { dataset: { padbind: action } } }` */
  const padBtn = (action) => ({ attr: 'data-padbind', node: { dataset: { padbind: action }, id: '' } });
  const keyBtn = (action) => ({ attr: 'data-keybind', node: { dataset: { keybind: action }, id: '' } });
  const resetBtn = () => ({ attr: '#keybind-reset', node: { dataset: {}, id: 'keybind-reset' } });

  function mount(keyOverrides = {}, padOverrides = {}, uiPadOverrides = {}) {
    const dom = withDom();
    const host = fakeHost();
    globalThis.document = { getElementById: (id) => (id === 'set-keybinds' ? host : null) };
    const settings = new SettingsManager();
    settings.set('keybinds', keyOverrides);
    settings.set('gamepadBinds', padOverrides);
    settings.set('gamepadUiBinds', uiPadOverrides);
    const padInput = new GamepadInput({ keys: {}, mouseDown: { left: false, right: false } }, GAMEPAD_BINDINGS, null, resolveSlot);
    const toast = [];
    const game = {
      settings, padInput, hotkeyTable: null, keybindTable: null, padTable: null, uiPadTable: null, rebuilds: 0,
      dialog: { toast: (m) => toast.push(m) },
    };
    game.rebuildHotkeys = () => {
      // 与 `Game.rebuildHotkeys` 同一入口：一份键盘覆盖 + 两份手柄覆盖 → 四张生效表（切片23）。
      // 桩少建一张，面板就会拿着出厂界面表去显示玩家已经改过的那几格（B47 那一族）
      const built = buildBindingTables(game.settings.get('keybinds'), UI_HOTKEYS,
        game.settings.get('gamepadBinds'), game.settings.get('gamepadUiBinds'));
      game.hotkeyTable = built.hotkeyTable;
      game.keybindTable = built.keyTable;
      game.padTable = built.padTable;
      game.uiPadTable = built.uiPadTable;
      game.padInput.useBindings(built.padTable);
      game.rebuilds++;
    };
    game.rebuildHotkeys();
    return { dom, host, panel: new SettingsPanel(game), game, toast, padInput };
  }

  it('手柄那一列可改绑的格子都在，摇杆那四格只说明不给按钮', () => {
    const { host, panel } = mount();
    panel.refresh();
    // 期望的入口名单**从两张表推导**，而且键是**条目自己的动作名**（切片23 修 B54）：
    // 从前这里手写 11 个名字，还把 `pauseMenu` 那一格写成它冒充的热键名 `escape` ——
    // 于是"点它 → 覆盖包落成表里不认识的名字"这条死路一直绿着
    const rowActions = [...UI_HOTKEYS.map((e) => e.action), ...Object.keys(KEY_BINDINGS)];
    const entries = [...Object.values(GAMEPAD_BINDINGS).map((e) => ({ ...e, ui: false })),
      ...Object.values(UI_GAMEPAD_BINDINGS).map((e) => ({ ...e, ui: true }))];
    const onRow = (e) => rowActions.includes(e.hotkey ?? e.action);
    const want = entries.filter((e) => e.button !== undefined && onRow(e)).map((e) => e.action).sort();
    const got = [...host.innerHTML.matchAll(/data-padbind="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(got, '可点的那一格与两张表的按钮格不是一份名单（少了 = 玩家改不到，多了 = 点了必失败）').toEqual(want);
    expect(got, '同一个动作名出现两次：两张表共用了名字，`padScopeOf` 就不唯一了').toHaveLength(new Set(got).size);
    // 面板的行是按"键盘侧的动作名"排的，所以**只有手柄有、键盘没有**的那一格今天摆不下
    // （`confirm` 走的是桥自己的边沿出口，热键表与游戏键表里都没有这个名字）。
    // 这不是把入口塞进别的行的理由 —— 那正好是"一格的键有两个说法"（B54 的形状）。名单钉住它
    const homeless = entries.filter((e) => e.button !== undefined && !onRow(e)).map((e) => e.action);
    expect(homeless, '这些界面按钮格在面板里没有行：补的是"行"，不是把入口挂到邻近那一格上').toEqual(['confirm']);
    expect(host.innerHTML).toContain('左摇杆 ↑ + 十字键 ↑');
    for (const stick of ['moveUp', 'moveDown', 'moveLeft', 'moveRight', 'navUp', 'navDown', 'navLeft', 'navRight']) {
      expect(host.innerHTML, `${stick} 是摇杆格，不给单按钮入口`).not.toContain(`data-padbind="${stick}"`);
    }
    // `—` 的格子数**从两表推导**（切片20）：以前这里抄的是一个数，多加一格摇杆格就得回来改它，
    // 而"忘了改"表现为断言静默放宽 —— 该红的时候还是绿的
    const claimed = new Set(entries.map((e) => e.hotkey ?? e.action));
    const none = rowActions.filter((a) => !claimed.has(a));
    expect((host.innerHTML.match(/keybind-pad-none/g) ?? [])).toHaveLength(none.length);
    // 那一格**看得见**的是破折号：只留一个空 span 与"这一行手柄上没有"分不清（自动门禁扫不到，
    // 因为 class 还在 —— 计数会照样绿，所以这条单独数那个字符）
    expect((host.innerHTML.match(/keybind-pad-none">—<\/span>/g) ?? [])).toHaveLength(none.length);
    for (const action of none) {
      const row = host.innerHTML.split('<div class="keybind-row">').find((r) => new RegExp(`data-keybind="${action}"`).test(r));
      expect(row, `${action} 手柄上没有人，就该写着 —`).toContain('keybind-pad-none">—');
    }
  });

  it('界面表那四格从此有人显示（以前推得动而看板写 `—`，正是 B47 那一族的形状）', () => {
    const { host, panel } = mount();
    panel.refresh();
    for (const [action, arrow] of [['uiUp', '↑'], ['uiDown', '↓'], ['uiLeft', '←'], ['uiRight', '→']]) {
      const cell = new RegExp(`data-keybind="${action}"`);
      expect(host.innerHTML, `焦点行 ${action} 不见了`).toMatch(cell);
      // 那一行的手柄列是"界面 + 摇杆标签"，而且仍然不给可点按钮：走焦那四格是**摇杆格**，
      // 改绑要换的是"axis 对 + 方向"，与单键覆盖不是一个形状（切片23 给入口的是按钮格那三格）
      // 箭头写**字面量**而不是再算一遍 `padStickLabel`：标签算式坏了，两边一起变就是永不报警
      const row = host.innerHTML.split('<div class="keybind-row">').find((r) => cell.test(r));
      expect(row, `${action} 那行的手柄列没显示界面表`).toContain(`界面 左摇杆 ${arrow} + 十字键 ${arrow}`);
      expect(row).not.toContain(`data-padbind="${action}"`);
    }
  });

  it('一行两个上下文时三样都显示，而且各自的键是**条目自己**：`escape` 那行 = 战斗 Start + 界面 B + 界面 Start', () => {
    const { host, panel } = mount();
    panel.refresh();
    const row = host.innerHTML.split('<div class="keybind-row">').find((r) => /data-keybind="escape"/.test(r));
    expect(row).toContain('data-padbind="pauseMenu"');               // 战斗表：改绑写的是动作名，不是它冒充的热键名
    expect(row).not.toContain('data-padbind="escape"');              // B54：那个名字两张表都不认识，写了就是死入口
    expect(row).toContain('data-padbind="back"');                    // 界面表：切片23 起同样是真入口
    expect(row).toContain('data-padbind="menu"');
    expect(row).toContain('界面 B');
    expect(row).toContain('界面 Start');
    // 合成一格而不是多一列：多出来的第五个元素会把行尾的提示挤走，各行还互不对齐。
    // 这里钉的是**整格的形状**：外层一个 combo，里面三条，别的全都不许多
    expect(row).toMatch(/<span class="keybind-pad keybind-pad-combo"><button[^>]*data-padbind="pauseMenu">Start<\/button><button[^>]*data-padbind="back">界面 B<\/button><button[^>]*data-padbind="menu">界面 Start<\/button><\/span>/);
    expect((row.match(/<button/g) ?? [])).toHaveLength(4);          // 键盘那一格 + 手柄三条
  });

  it('每一行的手柄那一格都**站在列上**（切片20：真浏览器读数抓到界面那一格没带列类名）', () => {
    const { host, panel } = mount();
    panel.refresh();
    // 表头那一行不带 `data-keybind` 也不走 `padCell`，切分后落在第 0 段里，正好不要它
    const rows = host.innerHTML.split('<div class="keybind-row">').slice(1);
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      const action = row.match(/data-keybind="([^"]+)"/)?.[1] ?? '(无)';
      // 键盘那一格之后紧跟的那个元素才叫"手柄那一列"：列宽与居中挂在 `keybind-pad` 上。
      // 界面那一格头一版只给了 `keybind-pad-part`，于是在真 DOM 里那四行**压根没有手柄格**
      // （查询 `.keybind-pad` 查不到）—— 全仓没有任何单测读样式表，这条只能钉类名。
      expect(row, `${action} 那行的手柄格不在列上`)
        .toMatch(/<\/button>(<span class="keybind-pad |<button type="button" class="keybind-pad")/);
    }
    const upRow = rows.find((r) => /data-keybind="uiUp"/.test(r));
    expect(upRow).toContain('<span class="keybind-pad keybind-pad-part">界面 ');
  });

  it('显示的是**生效**的界面表而不是常量：换一张表那一行跟着改口', () => {
    const { host, panel, game } = mount();
    // 这一格不在任何名单上，只看表 —— 面板若还按"移动那四格"的老名单显示，这条就红
    game.uiPadTable = { navUp: { action: 'navUp', mode: 'level', axes: [0, 1], dir: 'up', cardinal: true, hotkey: 'journal' } };
    panel.refresh();
    const row = host.innerHTML.split('<div class="keybind-row">').find((r) => /data-keybind="journal"/.test(r));
    expect(row).toContain('界面 左摇杆 ↑ + 十字键 ↑');
    const upRow = host.innerHTML.split('<div class="keybind-row">').find((r) => /data-keybind="uiUp"/.test(r));
    expect(upRow).toContain('keybind-pad-none');                   // 表里没这一格了 → 老老实实写 `—`
  });

  it('格子显示的是生效表而不是常量：叠了覆盖之后那一格立刻改口', () => {
    const { host, panel } = mount({}, { jump: 'rightStick' });
    panel.refresh();
    expect(host.innerHTML).toMatch(/data-padbind="jump">右摇杆按下</);
    expect(host.innerHTML).not.toMatch(/data-padbind="jump">A</);
  });

  it('点一行进入等待态：桥开始捕获，同时退出键盘等待态', () => {
    const { host, panel, padInput } = mount();
    panel.setCapturing('journal');
    expect(panel.capturing).toBe('journal');
    host.click(padBtn('jump'));
    expect(panel.capturingPad).toBe('jump');
    expect(panel.capturing).toBe(null);              // 同一时刻只等一件事
    expect(padInput.capturing).toBe(true);
    host.click(padBtn('jump'));
    expect(panel.capturingPad).toBe(null);
    expect(padInput.capturing).toBe(false);          // 再点一次取消，桥那边也摘掉
  });

  it('走完一次捕获：写进 `gamepadBinds`、重建三张表、桥换表、等待态归零', () => {
    const pad = makePad();
    setPads(pad);
    const { host, panel, game, padInput } = mount();
    panel.refresh();
    host.click(padBtn('jump'));
    press(pad, 'rightStick');
    padInput.poll();
    press(pad, 'rightStick', false);
    padInput.poll();
    expect(game.settings.get('gamepadBinds')).toEqual({ jump: 'rightStick' });
    expect(game.rebuilds).toBe(2);
    expect(game.padTable.jump.button).toBe('rightStick');
    expect(panel.capturingPad).toBe(null);
    expect(host.innerHTML).toMatch(/data-padbind="jump">右摇杆按下</);
  });

  it('B54 回归：点"返回 / 暂停"那行的 Start，覆盖包里写的是 `pauseMenu` 而不是 `escape`', () => {
    // 切片9 起那一格挂在 `escape` 行上（它冒充那个热键），入口的键却也跟着写了行名 ——
    // `escape` 不在 `GAMEPAD_BINDINGS` 里，于是点它之后无论按哪一枚键都只得到"该手柄按键无效"。
    // 这条用例在修之前是**红**的（写进盘的键名不对 → 表叠不上 → toast 一次），不是"顺便绿"
    const pad = makePad();
    setPads(pad);
    const { host, panel, game, toast, padInput } = mount();
    panel.refresh();
    host.click(padBtn('pauseMenu'));
    expect(panel.capturingPad, '等待态的键也得是条目自己，否则提示亮在别的行上').toBe('pauseMenu');
    expect(host.innerHTML, '提示要亮在**点对的那一行**：按行的动作名判等待态，热键冒充格点了不亮')
      .toMatch(/data-keybind="escape">Esc<\/button>[\s\S]{0,400}?按下要绑定的手柄键/);
    press(pad, 'rightStick');
    padInput.poll();
    press(pad, 'rightStick', false);
    padInput.poll();
    expect(toast, '一枚没人认领的右摇杆按下，不该被判成"无效或已被占用"').toHaveLength(0);
    expect(game.settings.get('gamepadBinds')).toEqual({ pauseMenu: 'rightStick' });
    expect(game.settings.get('gamepadUiBinds'), '点的是战斗那一格，界面那格一个键都不该动').toEqual({});
    expect(game.padTable.pauseMenu.button).toBe('rightStick');
    expect(host.innerHTML).toMatch(/data-padbind="pauseMenu">右摇杆按下</);
  });

  it('界面那一格是真入口：改"返回"落到第三格，而战斗那格与同一行的"界面 Start"原样', () => {
    const { host, panel, game, toast } = mount();
    panel.refresh();
    host.click(padBtn('back'));
    expect(panel.capturingPad).toBe('back');
    panel.capturePadButton('rightStick');              // 桥那一段上一条已经真帧跑过，这里只验落点
    expect(toast).toHaveLength(0);
    expect(game.settings.get('gamepadUiBinds')).toEqual({ back: 'rightStick' });
    expect(game.settings.get('gamepadBinds'), '界面动作落进战斗那格 = 两格覆盖包互换').toEqual({});
    expect(game.uiPadTable.back.button).toBe('rightStick');
    expect(game.uiPadTable.menu.button, '同一行里的另一格不该被顺带着改').toBe('start');
    expect(game.padTable.pauseMenu.button, '界面里改了 Start，战斗里的 Start 不受影响').toBe('start');
    expect(host.innerHTML).toContain('data-padbind="back">界面 右摇杆按下<');
  });

  it('归属只问表：同一个动作名放错那格覆盖包，两边都被拒', () => {
    // 这一条是"两格覆盖包"这套存储形状的证明：分家不是排版偏好，放错了**建不出表**
    expect(() => buildBindingTables({}, UI_HOTKEYS, { back: 'rightStick' }, {}))
      .toThrow(/未知的手柄动作 "back"/);
    expect(() => buildBindingTables({}, UI_HOTKEYS, {}, { jump: 'rightStick' }))
      .toThrow(/未知的手柄动作 "jump"/);
    expect(padScopeOf('back')).toBe('ui');
    expect(padScopeOf('pauseMenu')).toBe('combat');
    expect(padScopeOf('navUp')).toBe('ui');
    // 两张表的动作名互不相交，`padScopeOf` 才有唯一答案
    expect(() => assertPadScopesDisjoint()).not.toThrow();
    expect(() => assertPadScopesDisjoint(
      { back: { ...UI_GAMEPAD_BINDINGS.back } }, UI_GAMEPAD_BINDINGS,
    )).toThrow(/共用了动作名 back/);
  });

  it('界面表用界面那把尺子：只报边沿的 `confirm` 合法，拿战斗尺子量同一格会红', () => {
    const t = resolveGamepadBindings(UI_GAMEPAD_BINDINGS, { confirm: 'x' }, { assert: assertUiPadBindings });
    expect(t.confirm.button).toBe('x');
    expect(t.confirm.ui, '改绑不许顺手把"报边沿"这半形状改掉').toBe(true);
    expect(() => resolveGamepadBindings(UI_GAMEPAD_BINDINGS, { confirm: 'x' }))
      .toThrow(/未登记于这张表的动作名单/);
    // 摇杆格那张表也一样拒：走焦那四格要换的是"axis 对 + 方向"
    expect(() => resolveGamepadBindings(UI_GAMEPAD_BINDINGS, { navUp: 'x' }, { assert: assertUiPadBindings }))
      .toThrow(/不能改绑成单个按钮/);
  });

  it('撞键的捕获不写盘：给一句 toast，那一格保持原样', () => {
    const pad = makePad();
    setPads(pad);
    const { panel, game, padInput, toast } = mount();
    panel.setPadCapturing('jump');
    press(pad, 'x');                       // X 出厂是弹反的
    padInput.poll();
    press(pad, 'x', false);
    padInput.poll();
    expect(game.settings.get('gamepadBinds')).toEqual({});
    expect(game.rebuilds).toBe(1);
    expect(toast).toHaveLength(1);
    expect(/占用|无效/.test(toast[0])).toBe(true);
    expect(panel.capturingPad).toBe(null);
  });

  it('改绑之后旧按钮真的不再触发：按下 A 不再跳', () => {
    const pad = makePad();
    setPads(pad);
    const { panel, game, padInput } = mount();
    panel.setPadCapturing('jump');
    press(pad, 'rightStick');
    padInput.poll();
    press(pad, 'rightStick', false);
    padInput.poll();
    expect(game.padTable.jump.button).toBe('rightStick');
    press(pad, 'a');
    padInput.poll();
    expect(padInput.keys.Space).toBeFalsy();      // 出厂那枚 A 从此不再跳跃
    press(pad, 'a', false);
    press(pad, 'rightStick');
    padInput.poll();
    expect(padInput.keys.Space).toBe(true);       // 新那一枚说话
  });

  it('关面板一定脱离等待态（桥里留回调 = 下一次按手柄被静默吃掉）', () => {
    const { panel, padInput, dom } = mount();
    panel.setPadCapturing('parry');
    expect(padInput.capturing).toBe(true);
    panel.hide();
    expect(panel.capturingPad).toBe(null);
    expect(padInput.capturing).toBe(false);
    expect(dom.listeners.added).toBe(0);          // 等手柄键不该挂任何键盘监听（那是另一条路）
  });

  it('点键盘那一行会把等待态从手柄切过去（同一时刻只等一件事）', () => {
    const { host, panel, padInput, dom } = mount();
    host.click(padBtn('jump'));
    expect(padInput.capturing).toBe(true);
    host.click(keyBtn('journal'));
    expect(padInput.capturing).toBe(false);
    expect(panel.capturingPad).toBe(null);
    expect(panel.capturing).toBe('journal');
    expect(dom.listeners.added).toBe(1);            // 只在这一刻才挂 keydown
  });

  it('恢复默认键位把三格覆盖一起清掉（少清一格就是半复位）', () => {
    const { host, game } = mount({ parry: 'KeyY' }, { jump: 'rightStick' }, { back: 'rightStick' });
    host.click(resetBtn());
    expect(game.settings.get('keybinds')).toEqual({});
    expect(game.settings.get('gamepadBinds')).toEqual({});
    expect(game.settings.get('gamepadUiBinds')).toEqual({});
    expect(game.padTable.jump.button).toBe('a');
    expect(game.uiPadTable.back.button).toBe('b');
    expect(game.padInput._slots.find((s) => s.action === 'jump').button).toBe(PAD_BUTTON.a);
    expect(game.keybindTable.parry.code).toBe('KeyF');
    expect(game.rebuilds).toBe(2);
  });

  it('手柄改绑与键盘改绑互不干扰：两格各存各的', () => {
    const { panel, game } = mount({ parry: 'KeyY' });
    panel.setPadCapturing('parry');
    panel.capturePadButton('rightStick');
    expect(game.settings.get('keybinds')).toEqual({ parry: 'KeyY' });
    expect(game.settings.get('gamepadBinds')).toEqual({ parry: 'rightStick' });
    panel.captureKey({ code: 'KeyB', preventDefault() {}, stopPropagation() {} });   // 没在等键盘 → 静默返回
    expect(game.settings.get('keybinds')).toEqual({ parry: 'KeyY' });
  });
});

describe('存储与回落', () => {
  function withStore(initial = {}) {
    const store = new Map(Object.entries(initial));
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
    globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true };
    return store;
  }

  it('`gamepadBinds` 不与出厂默认共用引用：就地改一次不许污染出厂值', () => {
    withStore();
    const a = new SettingsManager();
    a.data.gamepadBinds.jump = 'y';
    expect(new SettingsManager().data.gamepadBinds).toEqual({});
    expect(new SettingsManager().defaults.gamepadBinds).toEqual({});
  });

  it('写入 → 新实例读回；清成 `{}` 就是出厂手柄键位', () => {
    withStore();
    const a = new SettingsManager();
    a.set('gamepadBinds', { jump: 'y' });
    expect(new SettingsManager().get('gamepadBinds')).toEqual({ jump: 'y' });
    const b = new SettingsManager();
    b.set('gamepadBinds', {});
    expect(new SettingsManager().get('gamepadBinds')).toEqual({});
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).version).toBe(2);
  });

  it('第三格（`gamepadUiBinds`，切片23）也不与出厂共用引用；老档缺这一格时落到出厂', () => {
    withStore();
    const a = new SettingsManager();
    a.data.gamepadUiBinds.back = 'y';
    expect(new SettingsManager().data.gamepadUiBinds).toEqual({});
    expect(new SettingsManager().defaults.gamepadUiBinds).toEqual({});
    // 切片23 之前存的档没有这一格：读出来必须是出厂 `{}`，而不是 `undefined`
    // （`undefined` 会让 `rebuildHotkeys` 里那句 `?? {}` 变成唯一的挡箭牌 —— 而它一旦被删，
    //   表现是"老玩家的界面键位全没了"，不是报错）
    withStore({ [STORAGE_KEY]: JSON.stringify({ version: 2, values: { gamepadBinds: { jump: 'y' } } }) });
    const old = new SettingsManager();
    expect(old.get('gamepadUiBinds')).toEqual({});
    expect(old.get('gamepadBinds')).toEqual({ jump: 'y' });      // 玩家拧过的那几格原样在
  });

  it('脏数据（那一格不是对象）不许把游戏带走：认不出来就抛，由重建方回落', () => {
    withStore({ [STORAGE_KEY]: JSON.stringify({ version: 2, values: { gamepadBinds: 'jump=y' } }) });
    const s = new SettingsManager();
    // 字符串被当对象摊开 → 动作名不认识 → 抛。静默丢掉更糟：玩家改了却没生效，还没有任何提示
    expect(() => buildBindingTables({}, UI_HOTKEYS, s.get('gamepadBinds'))).toThrow(/未知的手柄动作/);
    const toast = [];
    let padTable;
    try {
      // 与 `Game.rebuildHotkeys` 同一 try/catch 形状：坏了就清覆盖 + 说一句话
      padTable = buildBindingTables({}, UI_HOTKEYS, s.get('gamepadBinds')).padTable;
    } catch {
      s.data.keybinds = {};
      s.data.gamepadBinds = {};
      s.data.gamepadUiBinds = {};
      s.save();
      toast.push('键位配置无效，已恢复默认键位');
    }
    expect(toast).toHaveLength(1);
    expect(padTable).toBeUndefined();
    expect(() => buildBindingTables({}, UI_HOTKEYS, new SettingsManager().get('gamepadBinds'))).not.toThrow();
    // 上面那段 catch 是**手抄**的 `Game.rebuildHotkeys` 形状，所以这里回头核一遍真源码：
    // 生产里少清一格 = 每次开机都"半复位 + 弹一句"，而这条用例照样绿
    const game = readFileSync(join(process.cwd(), 'src/core/Game.js'), 'utf8');
    const catchBlock = game.slice(game.indexOf('键位配置无效') - 600, game.indexOf('键位配置无效'));
    for (const key of ['keybinds', 'gamepadBinds', 'gamepadUiBinds']) {
      expect(catchBlock, `回落时没清 ${key}：那一格的脏值会留着，下次开机再弹一次`)
        .toMatch(new RegExp(`this\\.settings\\.data\\.${key} = \\{\\}`));
    }
  });
});

describe('显示与静态门禁', () => {
  const SRC = join(process.cwd(), 'src');
  const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

  it('每一枚按钮都有显示名：少一个界面就是一格空白', () => {
    for (const name of Object.keys(PAD_BUTTON)) {
      expect(PAD_BUTTON_LABELS[name], `${name} 没有显示名`).toBeTruthy();
    }
    expect(Object.keys(PAD_BUTTON_LABELS).sort()).toEqual(Object.keys(PAD_BUTTON).sort());
    expect(padButtonLabel('nope')).toBe('nope');            // 未列到的原样显示，不留空白
  });

  it('序号表与名字表互逆（捕获报回来的名字与轮询用的序号不许各说各话）', () => {
    expect(PAD_BUTTON_BY_INDEX).toHaveLength(PAD_BUTTON_COUNT);
    for (const [name, index] of Object.entries(PAD_BUTTON)) {
      expect(PAD_BUTTON_BY_INDEX[index], `${name} 的序号反查不对`).toBe(name);
    }
  });

  it('移动那四格的说明按方向现算，不抄四份文案', () => {
    expect(padStickLabel('up')).toBe('左摇杆 ↑ + 十字键 ↑');
    expect(padStickLabel('left')).toBe('左摇杆 ← + 十字键 ←');
    expect(padStickLabel('nonsense')).toContain('?');
  });

  it('格子形状只在一处推导：构造与换表走同一个 `useBindings`', () => {
    const src = read('engine/GamepadInput.js');
    expect((src.match(/padButtonIndex\(e\.button\)/g) ?? [])).toHaveLength(1);
    expect((src.match(/padDpadIndex\(e\.dir\)/g) ?? [])).toHaveLength(1);
    expect(src).toMatch(/this\.useBindings\(bindings\)/);
  });

  it('面板只走合并校验，不自己叠手柄表；标签也只问 `keyLabels`', () => {
    const src = read('ui/SettingsPanel.js');
    expect((src.match(/buildBindingTables\(/g) ?? [])).toHaveLength(2);        // 键盘与手柄两条捕获路径各一次
    expect(src).toMatch(/UI_HOTKEYS, this\._padOverrides\(\), this\._uiPadOverrides\(\)/);
    // 手柄那半：两份覆盖包都要递给同一个校验入口，只递一份就是"预览时把玩家改过的那几格当出厂"
    expect(src).toMatch(/ui \? this\._padOverrides\(\) : overrides,\s*ui \? overrides : this\._uiPadOverrides\(\)/);
    expect(src).not.toMatch(/resolveGamepadBindings\(/);                       // 绕过入口 = 第二真源
    expect(src).toMatch(/import \{ keyLabel, padButtonLabel, padStickLabel, MOUSE_LABELS \} from '..\/content\/keyLabels\.js'/);
    // 按钮序号/名字只能问表与标签，面板不许自己 import 进来拼字样
    expect(src).not.toMatch(/import[^;]*\bPAD_BUTTON\b[^;]*from/);
  });

  it('那一格的键是条目自己（B54）：面板不许再拿"行的动作名"当覆盖包的键', () => {
    const src = read('ui/SettingsPanel.js');
    expect(src).toMatch(/data-padbind="\$\{entry\.action\}"/);
    expect(src, '行的动作名与条目的动作名不是一回事：`pauseMenu` 冒充的热键叫 `escape`，'
      + '写进行名就是往表里塞一个它不认识的名字（点了必失败）').not.toMatch(/data-padbind="\$\{action\}"/);
    // "这一格归哪张表"只问表：面板里出现动作名名单 = 第二份归属判断
    expect(src).toMatch(/padScopeOf\(action\)/);
    expect(src).not.toMatch(/'back'|'menu'|'confirm'/);
    // 三格覆盖包一起复位：少清一格是"半复位"
    const reset = src.slice(src.indexOf("if (btn.id === 'keybind-reset')"), src.indexOf('if (btn.dataset.padbind)'));
    expect((reset.match(/settings\.set\('/g) ?? [])).toHaveLength(3);
  });

  it('手柄那一列问的是**两张表**（切片20）：显示不抄标签、也不按动作名列名单', () => {
    const src = read('ui/SettingsPanel.js');
    expect(src).toMatch(/this\.game\.padTable \?\? GAMEPAD_BINDINGS/);
    expect(src).toMatch(/this\.game\.uiPadTable \?\? UI_GAMEPAD_BINDINGS/);
    // 标签的第二份算式（扫**字符串常量**而不是扫散文：注释里提一句"十字键"是说明，抄进引号里就是第二真源。
    // 不跨行 —— 跨行的话两句注释之间的引号就能拼出一个假阳性，第一版就是这么红的）
    expect(src).not.toMatch(/['"`][^'"`\n]*(左摇杆|十字键)/);
    // 显示谁由表决定：这里出现动作名名单 = 以后加一格摇杆格要回来改面板，忘了就是那一格又是 `—`
    expect(src).not.toMatch(/'uiUp'|'uiDown'|'uiLeft'|'uiRight'/);
  });

  it('捕获在派发之前：等键的那一帧不更新摇杆、也不点亮任何动作格', () => {
    const src = read('engine/GamepadInput.js');
    const branch = src.slice(src.indexOf('if (this._capture) {'), src.indexOf('this._pollLook(axes);'));
    expect(branch.length).toBeGreaterThan(10);
    expect(branch).toMatch(/_captureFrame\(buttons\)/);
    expect(branch).toMatch(/done\(found\)/);
    expect(branch).toMatch(/_primeEdges\(buttons\)/);
  });

  it('`Game` 那边三张表一起重建，手柄桥拿的是叠过覆盖的那张', () => {
    const src = read('core/Game.js');
    // 切片14 起换表只有一条路：改绑也走它，否则"在面板里改了绑"会把战斗表装回去（A 又变成跳）
    expect(src).toMatch(/this\.applyPadBindings\(\);/);
    expect((src.match(/useBindings\(/g) || []).length).toBe(1);
    expect(src).toMatch(/padTable = factoryGamepadBindings\(\)/);
    expect(src).toMatch(/this\.settings\.data\.gamepadBinds = \{\}/);
  });

  it('出厂三张表在门禁上线之后仍然互不抢占', () => {
    expect(() => assertKeybinds(GAMEPAD_BINDINGS)).not.toThrow();
    expect(() => buildBindingTables({}, UI_HOTKEYS, {})).not.toThrow();
    expect(Object.keys(factoryGamepadBindings()).sort()).toEqual([...PAD_ACTIONS].sort());
    // 摇杆格由**格子自己声明的 `axes`** 说了算（切片19：以前这里查一份手抄名单）
    expect(Object.keys(GAMEPAD_BINDINGS).filter((n) => GAMEPAD_BINDINGS[n].axes !== undefined))
      .toEqual(['moveUp', 'moveDown', 'moveLeft', 'moveRight']);
  });
});
