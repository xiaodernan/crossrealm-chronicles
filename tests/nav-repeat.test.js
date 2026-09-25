/**
 * 面板内导航的自动重复（W-A7 切片18）—— 按住方向键要能连着走格、连着推滑杆。
 *
 * 切片3 立的规矩是"按住不放只触发一次"（改前跟浏览器重发 `keydown`，按住 Tab 把区域面板抖成
 * 筛子），那条规矩对**开关类**动作是对的，对"走一格"是错的：没有哪个界面的方向键不连发。
 * 所以这一片只开一道口子，而且把口子的三个零件各放在一处：
 * - **谁能连发**：`hotkeys.js` 的 `UI_NAV_ACTIONS`（一份名单，测试不许另抄）
 * - **多快**：`tuning.js` 的 `NAV_REPEAT`（两个秒数，吃 `rawDt`）
 * - **谁数帧**：`HotkeyRouter.poll(keys, dt)`（键盘与手柄共用这一只定时器）
 *
 * 桥（`GamepadInput`）在这道口子里只改了一件事：走焦那四格从 `edge` 变 `level` ——
 * 电平本身不是连发，它只是"按着就把借来的那一格键留在 `keys` 里"，派发方才看得到"还按着"。
 *
 * 用例因此分四层：名单与节奏（含"名单外一律不连发"这条回归门禁）、计时的形状（松手/阻塞/长帧/
 * 脏 dt）、两张表与桥的声明（level 与 edge 各归谁）、端到端（按住十字键，假 DOM 里的焦点连着走）。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UI_HOTKEYS, UI_ACTIONS, UI_NAV_ACTIONS } from '../src/content/hotkeys.js';
import { NAV_REPEAT } from '../src/content/tuning.js';
import {
  UI_GAMEPAD_BINDINGS, PAD_BUTTON, bindingFor, assertUiPadBindings,
} from '../src/content/keybinds.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { TimeController } from '../src/engine/Time.js';
import { HotkeyRouter } from '../src/ui/HotkeyRouter.js';
import { moveFocusWithin } from '../src/ui/FocusNav.js';
import { fakeDoc, fakePanel } from './helpers/fakePanelDom.js';

const DT = 1 / 60;                            // 60 Hz 的那把尺子：节奏按秒算，用例按帧推进

const codeOf = (action) => UI_HOTKEYS.find((e) => e.action === action).code;
const isNav = (a) => UI_NAV_ACTIONS.includes(a);

/** 一帧一帧推的时钟：`poll` 先读到本帧，再把钟面推上去（按下那一帧记为 0 秒） */
function mk(table = UI_HOTKEYS, blocked = () => false) {
  const calls = [];
  let clock = 0;
  const router = new HotkeyRouter({
    table,
    isBlocked: blocked,
    onAction: (action) => calls.push({ action, at: clock }),
  });
  const frame = (keys, dt = DT) => {
    router.poll(keys, dt);
    clock += dt;
  };
  const at = (action) => calls.filter((c) => c.action === action).map((c) => c.at);
  return { router, calls, frame, at, clock: () => clock };
}

/** 按住 `frames` 帧之后每次派发之间的间隔（首尾差值） */
function gaps(times) {
  return times.slice(1).map((t, i) => t - times[i]);
}

/* -------------------------------------------------------------- 假手柄 */

const realNavigator = globalThis.navigator;
const setPads = (...pads) => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { getGamepads: () => pads },
  });
};
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
/** 与 `Game.resolvePadBinding` 同一分工：热键冒充问生效热键表，游戏键问生效键位表 */
const resolve = (slot) => (slot.hotkey
  ? { code: UI_HOTKEYS.find((e) => e.action === slot.hotkey)?.code ?? null }
  : bindingFor(slot.action));

beforeAll(() => setPads());
afterAll(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});
afterEach(() => setPads());

/* ------------------------------------------------------ 名单与节奏（正半区） */

describe('名单：只有面板内导航那四格许连发，而且四格共用同一份节奏', () => {
  it('名单就是 ↑↓←→ 四格，且四格都声明了 `preventDefault`', () => {
    // `preventDefault` 是"接管"的声明：原生滑杆/原生滚动若同时步进，按一次会走两档。
    // 连发把这件事放大了十倍 —— 一次按下两步长，玩家只会以为按键坏了。
    expect([...UI_NAV_ACTIONS].sort()).toEqual(['uiDown', 'uiLeft', 'uiRight', 'uiUp']);
    expect(UI_NAV_ACTIONS.every((a) => UI_ACTIONS.includes(a))).toBe(true);
    for (const action of UI_NAV_ACTIONS) {
      expect(codeOf(action), action).toMatch(/^Arrow/);
      expect(UI_HOTKEYS.find((e) => e.action === action).preventDefault, action).toBe(true);
    }
  });

  it('四格各自按住两秒：按下先走一次，等满 delay 才连发，之后每 interval 一步', () => {
    for (const action of UI_NAV_ACTIONS) {
      const { frame, at } = mk();
      const keys = { [codeOf(action)]: true };
      for (let i = 0; i < 120; i += 1) frame(keys);
      const times = at(action);
      expect(times[0], action).toBe(0);                    // 按下那一帧照旧立刻派发
      const g = gaps(times);
      expect(g.length, action).toBeGreaterThan(8);         // 两秒里没连发出的话，这一片等于没做
      // 上界给两帧的余量：连发落在"跨过零点的那一帧"，浮点累加与按整帧推进之间差一步是正常的
      expect(g[0], action).toBeGreaterThanOrEqual(NAV_REPEAT.delay - 1e-9);
      expect(g[0], action).toBeLessThan(NAV_REPEAT.delay + 2 * DT);
      for (const step of g.slice(1)) {
        expect(step, `${action} 的第若干次连发`).toBeGreaterThanOrEqual(NAV_REPEAT.interval - 1e-9);
        expect(step).toBeLessThan(NAV_REPEAT.interval + 2 * DT);
      }
    }
  });

  it('名单外的动作整表逐个按住三秒：只此一次（切片3 那条规矩一格都没松）', () => {
    const rest = UI_HOTKEYS.map((e) => e.action).filter((a) => !isNav(a));
    expect(rest.length).toBeGreaterThan(10);               // 空转也算过：名单不许把整张表吃掉
    for (const action of rest) {
      const { frame, calls } = mk();
      const keys = { [codeOf(action)]: true };
      for (let i = 0; i < 180; i += 1) frame(keys);        // 三秒 = 30 个 interval
      expect(calls.map((c) => c.action), action).toEqual([action]);
    }
  });
});

/* -------------------------------------------------------- 计时的形状（四角） */

describe('节奏的形状：松手、被挡、长帧、脏 dt', () => {
  it('松手再按才算新一轮：delay 从头等满，不继承上一轮剩下的零头', () => {
    const { frame, at } = mk();
    const code = codeOf('uiDown');
    const held = { [code]: true };
    frame(held);                                     // 按下：立刻走一格
    for (let i = 0; i < 30; i += 1) frame(held);      // 连发已经跑起来（第 26 帧发过一格）
    expect(at('uiDown')).toHaveLength(2);
    frame({ [code]: false });                         // 松手：节奏清零
    frame(held);                                      // 再按：这一帧只算新一轮的按下沿
    expect(at('uiDown')).toHaveLength(3);
    const before = at('uiDown').length;
    /* 关键在这一段：上一轮只剩下"跨过零点那一点"的零头，若清零只看松手那一帧、
     * 或干脆不清零，第 4 下会在几帧之内冒出来 —— 松手重按就成了"再快一档"。 */
    for (let i = 0; i < 25; i += 1) frame(held);
    expect(at('uiDown')).toHaveLength(before);
    frame(held);
    expect(at('uiDown')).toHaveLength(before + 1);
  });

  it('按住期间被挡下就停下：解锁那一帧不补发，要松手重按', () => {
    let blocked = false;
    const { frame, calls } = mk(UI_HOTKEYS, (code) => blocked && code === codeOf('uiDown'));
    const keys = { [codeOf('uiDown')]: true };
    frame(keys);
    blocked = true;
    for (let i = 0; i < 60; i += 1) frame(keys);           // 挡了一整秒
    blocked = false;
    for (let i = 0; i < 30; i += 1) frame(keys);           // 解锁后仍然按着
    expect(calls.map((c) => c.action)).toEqual(['uiDown']); // 只有最开头那一下
    frame({ [codeOf('uiDown')]: false });
    frame(keys);                                           // 松手重按才重新开始
    expect(calls.map((c) => c.action)).toEqual(['uiDown', 'uiDown']);
  });

  it('一帧再长也只走一步：dt 大于 interval 不会攒出一串补发', () => {
    const { frame, at } = mk();
    const code = codeOf('uiDown');
    frame({ [code]: true }, DT);                           // 按下
    frame({ [code]: true }, 0.5);                          // 半秒的掉帧：够连发五步
    expect(at('uiDown')).toHaveLength(2);
    const step = new TimeController();                     // 真上限：主循环把 rawDt 夹在这里
    expect(step.maxDelta).toBeLessThanOrEqual(NAV_REPEAT.interval);
  });

  it('不传 dt 与脏 dt 一律退回纯边沿：宁可"按住不连发"，也不许把移焦打成机关枪', () => {
    // 这里绕开 `frame`：它的缺省值是 1/60，传 `undefined` 进去会被它兜底成"有钟"，
    // 而这一条要演的就是**调用方压根没给钟**（切片3 那种老写法）
    for (const dt of [undefined, 0, -1, NaN, '1']) {
      const { router, calls } = mk();
      const keys = { [codeOf('uiDown')]: true };
      for (let i = 0; i < 121; i += 1) router.poll(keys, dt);
      expect(calls.map((c) => c.action), String(dt)).toEqual(['uiDown']);
    }
  });

  it('负 dt 当"这一帧没走时间"：不许把等待反着加回去', () => {
    // 生产里给不出负数（`TimeController.tick` 先把 `rawDt` 夹到 `>= 0`），这一条守的是调用方写错。
    // 写错的方向决定了难不难查：当成 0 只让节奏变慢，反着加账则让"按住越久越走不动"，
    // 看起来像手感差而不是像 bug —— 所以判据不能只看"有没有连发"，要看连发落在第几个好帧上。
    const { router, calls } = mk();
    const keys = { [codeOf('uiDown')]: true };
    router.poll(keys, DT);                                    // 按下：第一格
    for (let i = 0; i < 12; i += 1) router.poll(keys, -1);    // 十二个坏帧：每个都该当成没走时间
    for (let i = 0; i < 25; i += 1) router.poll(keys, DT);    // 好帧攒到 delay 的前一刻
    expect(calls).toHaveLength(1);
    router.poll(keys, DT);                                    // 第 26 个好帧：跨过零点
    expect(calls).toHaveLength(2);
  });

  it('换表（改绑之后）不继承旧表的等待：新表那一格重新等满 delay', () => {
    const { frame, router, at } = mk();
    const code = codeOf('uiDown');
    const held = { [code]: true };
    frame(held);                                          // 按下：第一下
    for (let i = 0; i < 25; i += 1) frame(held);          // 只差一点点就要连发
    expect(at('uiDown')).toHaveLength(1);
    /* `useTable` 把边沿账一起清零（切片3 的规矩：不清就是"换表后第一次按下被当成已经按着"），
     * 所以换表后那一帧必然算新一轮按下 —— 要防的是另一半：节奏账跟着旧表留下零头。 */
    router.useTable(UI_HOTKEYS.map((e) => ({ ...e })));
    frame(held);                                          // 新一轮按下
    expect(at('uiDown')).toHaveLength(2);
    const before = at('uiDown').length;
    for (let i = 0; i < 25; i += 1) frame(held);
    expect(at('uiDown')).toHaveLength(before);
    frame(held);
    expect(at('uiDown')).toHaveLength(before + 1);
  });
});

/* ------------------------------------------------- 两张表与桥：level 归谁 */

describe('桥的声明：走焦四格是 level（按着就把键留下），返回与确认仍是 edge', () => {
  const mkBridge = () => {
    const keys = {};
    const pad = makePad();
    setPads(pad);
    return { bridge: new GamepadInput({ keys }, UI_GAMEPAD_BINDINGS, undefined, resolve), keys, pad };
  };

  it('按住十字键下三帧：`keys.ArrowDown` 一直为真，松手立刻归零', () => {
    const { bridge, keys, pad } = mkBridge();
    press(pad, 'dpadDown', true);
    for (let i = 0; i < 3; i += 1) {
      bridge.poll();
      expect(keys.ArrowDown, `第 ${i} 帧`).toBe(true);
    }
    press(pad, 'dpadDown', false);
    bridge.poll();
    expect(keys.ArrowDown).toBe(false);
  });

  it('← → 两格同样按住不放（调值与走焦同一条路），B / Start / A 三格仍只亮一帧', () => {
    for (const [button, code] of [['dpadLeft', 'ArrowLeft'], ['dpadRight', 'ArrowRight']]) {
      const { bridge, keys, pad } = mkBridge();
      press(pad, button, true);
      bridge.poll();
      bridge.poll();
      expect(keys[code], button).toBe(true);
    }
    for (const button of ['b', 'start']) {
      const { bridge, keys, pad } = mkBridge();
      press(pad, button, true);
      bridge.poll();
      expect(keys.Escape, button).toBe(true);
      bridge.poll();
      expect(keys.Escape, button).toBe(false);             // edge：返回不许按住连发
    }
    const { bridge, pad } = mkBridge();
    press(pad, 'a', true);
    bridge.poll();
    expect(bridge.ui.confirm).toBe(true);
    bridge.poll();
    expect(bridge.ui.confirm).toBe(false);                 // 确认连点会把同一格反复激活
  });

  it('信号格写成 level 就在加载期抛：桥每帧点亮它，而它没有任何一份节奏可拦', () => {
    expect(() => assertUiPadBindings({
      confirm: { action: 'confirm', mode: 'level', button: 'a', ui: true },
    })).toThrow(/必须是 edge/);
    // 同一把尺子对界面表的其余格子不管：那几格走 `keys`，节奏由派发方管
    expect(() => assertUiPadBindings()).not.toThrow();
  });

  it('出厂表就把四格导航记成 level、三格返回/确认记成 edge（谁负责"按住"写在表里）', () => {
    const modes = Object.fromEntries(
      Object.values(UI_GAMEPAD_BINDINGS).map((e) => [e.action, e.mode]),
    );
    expect(modes).toEqual({
      navUp: 'level', navDown: 'level', navLeft: 'level', navRight: 'level',
      back: 'edge', menu: 'edge', confirm: 'edge',
    });
  });
});

/* ---------------------------------------------------- 端到端：键盘与手柄同速 */

describe('端到端：同一段时间里，键盘与手柄走过的格数一模一样', () => {
  const run = (viaPad, frames, dt = DT) => {
    const { frame, calls } = mk();
    const keys = {};
    let bridge = null;
    let pad = null;
    if (viaPad) {
      bridge = new GamepadInput({ keys }, UI_GAMEPAD_BINDINGS, undefined, resolve);
      pad = makePad();
      setPads(pad);
      press(pad, 'dpadDown', true);
    } else {
      keys.ArrowDown = true;
    }
    for (let i = 0; i < frames; i += 1) {
      if (bridge) bridge.poll();                           // 与 `Game.update` 同序：桥在前、派发在后
      frame(keys, dt);
    }
    return calls.length;
  };

  it('按住 100 帧（键盘）与按住 100 帧（十字键）：派发次数逐次相等且不止一次', () => {
    const pad = run(true, 100);
    const kbd = run(false, 100);
    expect(kbd).toBe(pad);
    expect(kbd).toBeGreaterThan(5);
    expect(kbd).toBeLessThan(20);                          // 1.67 秒：一手能数得过来的格数
  });

  it('焦点真的连着走：假面板 20 格，按住的帧里每一步都落在下一格上', () => {
    const doc = fakeDoc();
    const panel = fakePanel(
      Array.from({ length: 20 }, (_, i) => `i${i}`), doc, 'settings-host',
    );
    panel.items[0].focus();                                // 面板打开时落在第一格（切片11）
    const calls = [];
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: () => false,
      onAction: (action) => {
        if (action !== 'uiDown') return;
        moveFocusWithin(panel.host, 1, doc);
        calls.push(doc.activeElement?.id);
      },
    });
    const keys = {};
    const pad = makePad();
    setPads(pad);
    const bridge = new GamepadInput({ keys }, UI_GAMEPAD_BINDINGS, undefined, resolve);
    press(pad, 'dpadDown', true);
    for (let i = 0; i < 90; i += 1) {
      bridge.poll();
      router.poll(keys, DT);
    }
    expect(calls.length).toBeGreaterThan(5);
    // 没有跳步、没有回头：第 n 次派发就落在第 n 格（20 格用不完，一圈都走不满）
    expect(calls).toEqual(calls.map((_, n) => `i${n + 1}`));
  });
});

/* ---------------------------------------------------------------- 门禁 */

describe('门禁：线上必须把这一帧的时长递给派发方', () => {
  it('`Game.update` 用 `rawDt` 调 `hotkeys.poll`（少了它，真游戏里永远不连发）', () => {
    const game = readFileSync(join(process.cwd(), 'src/core/Game.js'), 'utf8');
    expect(game).toMatch(/this\.hotkeys\.poll\(this\.keys,\s*rawDt\)/);
  });

  it('两个秒数本身合法：delay 比 interval 长，interval 不比一帧的上限小', () => {
    // `interval >= maxDelta` 是"一帧最多走一步"的结构前提（上面那条长帧用例靠它才成立）
    expect(NAV_REPEAT.delay).toBeGreaterThan(NAV_REPEAT.interval);
    expect(NAV_REPEAT.interval).toBeGreaterThanOrEqual(new TimeController().maxDelta);
  });

  it('节奏账的清零点写死在源码里：松手与被挡各一处，换表整份重来', () => {
    /* 这一条是**静态**门禁，不是断言漏了 —— 那两处清零今天拿不出行为证据：
     * 派发循环只在 `down` 为真的帧读账，而松过手之后的第一个 `down` 帧必然是按下沿
     * （`was` 就是上一帧的 `down`），按下沿又把账重新挂满 `delay`，零头永远读不到。
     * 变异验证里"松手不清零"与"换表不重挂账"因此都是等价变异（全绿），如实记在 ADR。
     * 它们今天只是卫生：一旦哪天按下沿不再重新挂账、或 `useTable` 不再清边沿账，
     * 零头立刻变成可观察的"松手重按等于再快一档"，这份静态约束就是唯一的守门人。 */
    const src = readFileSync(join(process.cwd(), 'src/ui/HotkeyRouter.js'), 'utf8');
    const poll = src.match(/poll\(keys, dt[^{]*\)\s*\{[\s\S]*?\n {2}\}/)?.[0];
    expect(poll, '找不到 poll 的方法体').toBeTruthy();
    expect((poll.match(/this\._held\[i\] = 0;/g) || []).length, '松手与被挡各一处清零').toBe(2);
    const swap = src.match(/useTable\(table\)\s*\{[\s\S]*?\n {2}\}/)?.[0];
    expect(swap, '找不到 useTable 的方法体').toBeTruthy();
    expect(swap).toContain('this._held = new Array(table.length).fill(0);');
    expect(swap).toContain('this._down = new Array(table.length).fill(false);');
  });
});
