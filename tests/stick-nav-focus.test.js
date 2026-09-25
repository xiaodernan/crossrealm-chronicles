/**
 * 面板内用**左摇杆**走格与调值（W-A7 切片19）。
 *
 * 切片18 让"按住"能连着走，但只有十字键与键盘按得住 —— 摇杆没有"按住"这件事，
 * 它一直在那儿。这一片把左摇杆接到同一条路上，三条规矩各自挡住一类事故：
 *
 * 1. **一格两个入口，不是一个入口一格**：走焦那四格现在是 `axes` + `dir`（摇杆给方向、
 *    十字键由 `dir` 顺带带上），与移动那四格同一条机制。分成两格就是同一把 ↑ 两个主人，
 *    两本 `claimedCode` 账互相抹键 —— 表现随表里的先后次序变，最难查的那一类。
 * 2. **斜推只亮一格**（`cardinal`）：走路推到 45° 是想斜着走，走焦推到 45° 只想走一格 ——
 *    一次亮两格会把"移一行"和"把这行的值调一格"同时办掉，后者是玩家没打算要的副作用。
 * 3. **回中带迟滞**：切片18 已经证明松手会把连发账清零，摇杆停在死区边上抖一抖，玩家看到的
 *    就是"每抖一下重新等 0.42 秒"。下沿乘在**玩家自己那档** `deadzone` 上，不写绝对数值 ——
 *    固定下沿在低死区档会高于进入门限，迟滞就反过来变成"一点亮就松不开"。
 *
 * 桥在这里仍然只写电平（推住为真、回中立刻为假）。**节奏不在这张表里**：许不许连发、多快
 * 一步，全在 `Hotkeys` 的 `UI_NAV_ACTIONS` 与 `tuning.js` 的 `NAV_REPEAT`（见 nav-repeat.test.js）。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GAMEPAD_BINDINGS, UI_GAMEPAD_BINDINGS, PAD, PAD_BUTTON, bindingFor,
  assertKeybinds, assertUiPadBindings, resolveGamepadBindings,
} from '../src/content/keybinds.js';
import { UI_HOTKEYS, applyHotkeyOverrides } from '../src/content/hotkeys.js';
import { NAV_REPEAT } from '../src/content/tuning.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { HotkeyRouter } from '../src/ui/HotkeyRouter.js';
import { moveFocusWithin } from '../src/ui/FocusNav.js';
import { fakeDoc, fakePanel } from './helpers/fakePanelDom.js';

const read = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');
const DT = 1 / 60;
const NAV = ['navUp', 'navDown', 'navLeft', 'navRight'];
const CODE_OF = { navUp: 'ArrowUp', navDown: 'ArrowDown', navLeft: 'ArrowLeft', navRight: 'ArrowRight' };

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
/** 推左摇杆：`dir` 是方向名，`mag` 是模长（手柄 y 轴向下为正，"前"取负） */
const stick = (pad, dir, mag = 0.7) => {
  const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  pad.axes[0] = v[0] * mag;
  pad.axes[1] = v[1] * mag;
};
/** 斜推：给两个分量，谁大听谁（用例靠这个差别说"只亮一格"） */
const tilt = (pad, x, y) => {
  pad.axes[0] = x;
  pad.axes[1] = y;
};
const center = (pad) => tilt(pad, 0, 0);

/** 与 `Game.resolvePadBinding` 同一分工：热键冒充问生效热键表，游戏键问生效键位表 */
const resolve = (slot) => (slot.hotkey
  ? { code: UI_HOTKEYS.find((e) => e.action === slot.hotkey)?.code ?? null }
  : bindingFor(slot.action));

const mkBridge = (table = UI_GAMEPAD_BINDINGS, resolver = resolve) => {
  const keys = {};
  const pad = makePad();
  setPads(pad);
  return { bridge: new GamepadInput({ keys }, table, undefined, resolver), keys, pad };
};

/** 四把方向键里此刻为真的是哪几把（"只亮一格"与"一个主人"都靠它说话） */
const arrowsDown = (keys) => Object.values(CODE_OF).filter((c) => keys[c] === true);

/** 迟滞带当中（还算按着）与下沿之下（算松手）：数值全从常量推，不写死 */
const MID_BAND = () => (PAD.deadzone + PAD.deadzone * PAD.navStickReleaseFactor) / 2;
const BELOW_BAND = () => (PAD.deadzone * PAD.navStickReleaseFactor) / 2;

beforeAll(() => setPads());
afterAll(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});
afterEach(() => setPads());

/* ---------------------------------------------------- 表形状：一格两个入口 */

describe('走焦那四格：摇杆 + 十字键共用一格，`cardinal` 是与移动那四格唯一的判据差别', () => {
  it('四格都声明 axes + dir + cardinal，且**没有** button（十字键由 `dir` 顺带带上）', () => {
    for (const name of NAV) {
      const e = UI_GAMEPAD_BINDINGS[name];
      expect(e.button, `${name} 不该再占一枚按钮`).toBeUndefined();
      expect(e.axes, name).toEqual([0, 1]);
      expect(e.dir, name).toBe(name.slice(3).toLowerCase());
      expect(e.cardinal, name).toBe(true);
      expect(e.mode, name).toBe('level');              // 电平是连发的前提（切片18）
      expect(e.hotkey, name).toBe(`ui${e.dir[0].toUpperCase()}${e.dir.slice(1)}`);
    }
  });

  it('出厂界面表里的摇杆格就是那四格（判据看格子自己声明的 `axes`，没有外部名单）', () => {
    expect(Object.keys(UI_GAMEPAD_BINDINGS).filter((n) => UI_GAMEPAD_BINDINGS[n].axes !== undefined))
      .toEqual(NAV);
    // 移动那四格是摇杆格但不带 `cardinal`：斜推要斜着走，八向量为它而设
    expect(Object.values(GAMEPAD_BINDINGS).some((e) => e.cardinal === true)).toBe(false);
  });

  it('把"摇杆 + 十字键"拆成两格就会被拒：同一方向两个主人 = 松手时互相抹键', () => {
    expect(() => assertUiPadBindings({
      navUp: { action: 'navUp', mode: 'level', axes: [0, 1], dir: 'up', cardinal: true, hotkey: 'uiUp' },
      navDown: { action: 'navDown', mode: 'level', axes: [0, 1], dir: 'up', cardinal: true, hotkey: 'uiDown' },
    })).toThrow(/认领/);
    // 一格之内也不许再叠一枚按钮：那正是"两个入口两本账"的写法
    expect(() => assertUiPadBindings({
      navUp: { action: 'navUp', mode: 'level', axes: [0, 1], dir: 'up', cardinal: true, button: 'dpadUp', hotkey: 'uiUp' },
    })).toThrow(/不该绑按钮/);
  });

  it('`cardinal` 只许摇杆格有、只许是 true：按钮格子带它就是忘了自己在改哪张表', () => {
    expect(() => assertUiPadBindings({
      confirm: { action: 'confirm', mode: 'edge', button: 'a', ui: true, cardinal: true },
    })).toThrow(/只对摇杆方向/);
    expect(() => assertKeybinds({
      jump: { action: 'jump', mode: 'edge', button: 'a', cardinal: true },
    })).toThrow(/只对摇杆方向/);
    expect(() => assertUiPadBindings({
      navUp: { action: 'navUp', mode: 'level', axes: [0, 1], dir: 'up', cardinal: false, hotkey: 'uiUp' },
    })).toThrow(/只许是 true/);
  });

  it('摇杆格不许改绑成单枚按钮，判据是**这一格自己声明了 `axes`**（不在任何名单里也一样）', () => {
    for (const name of ['moveUp', 'moveDown', 'moveLeft', 'moveRight']) {
      expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { [name]: 'a' }), name)
        .toThrow(/左摇杆 \+ 十字键/);
    }
    // 这张假表里的摇杆格叫 `jump`：任何"按动作名抄的名单"都护不到它，presence 才护得到
    const base = { ...GAMEPAD_BINDINGS };
    delete base.moveUp;                              // 让出十字键 ↑ 的认领，免得先撞在另一条规则上
    base.jump = { action: 'jump', mode: 'edge', axes: [0, 1], dir: 'up' };
    expect(() => resolveGamepadBindings(base, { jump: 'a' })).toThrow(/左摇杆 \+ 十字键/);
  });
});

/* -------------------------------------------------------- 桥的摇杆判定 */

describe('推摇杆 = 按住十字键：同一格电平、一次一格、回中带迟滞', () => {
  it('推上 → `keys.ArrowUp` 为真；回中那一帧立刻归零（借来的键不留残余）', () => {
    const { bridge, keys, pad } = mkBridge();
    stick(pad, 'up');
    bridge.poll();
    expect(keys.ArrowUp).toBe(true);
    center(pad);
    bridge.poll();
    expect(keys.ArrowUp).toBe(false);
  });

  it('四根方向逐个推：每次都恰好一把方向键为真', () => {
    for (const [dir, code] of [['up', 'ArrowUp'], ['down', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']]) {
      const { bridge, keys, pad } = mkBridge();
      stick(pad, dir);
      bridge.poll();
      expect(arrowsDown(keys), dir).toEqual([code]);
    }
  });

  it('斜推只亮一格：竖的分量大切"上"、横的分量大切"右"，正斜分则算竖的', () => {
    const cases = [
      [[0.6, -0.8], ['ArrowUp']],
      [[0.8, -0.6], ['ArrowRight']],
      [[-0.9, 0.2], ['ArrowLeft']],
      [[0.7, 0.7], ['ArrowDown']],       // 恰好 45°：规则写死算竖的，不靠浮点运气
    ];
    for (const [[x, y], want] of cases) {
      const { bridge, keys, pad } = mkBridge();
      tilt(pad, x, y);
      bridge.poll();
      expect(arrowsDown(keys), `axes=[${x},${y}]`).toEqual(want);
    }
  });

  it('同一根摇杆、两张表、两种语义：移动斜推亮两格（八向量），走焦斜推亮一格', () => {
    const mv = mkBridge(GAMEPAD_BINDINGS);
    tilt(mv.pad, 0.7, -0.7);
    mv.bridge.poll();
    expect([mv.keys.KeyW, mv.keys.KeyD]).toEqual([true, true]);   // 斜着走是要的

    const ui = mkBridge();
    tilt(ui.pad, 0.7, -0.7);
    ui.bridge.poll();
    expect(arrowsDown(ui.keys)).toEqual(['ArrowUp']);
    // 八向量那一套没有偷偷被改掉：走的还是 `_stickHeld`，走焦走的才是 `_stickCardinal`
    expect(read('engine/GamepadInput.js')).toMatch(/s\.cardinal\s*\?/);
  });

  it('迟滞：退到死区内一点点仍算按着，退到下沿以下才还键', () => {
    const { bridge, keys, pad } = mkBridge();
    stick(pad, 'up');
    bridge.poll();
    expect(keys.ArrowUp).toBe(true);
    stick(pad, 'up', MID_BAND());                    // 死区与下沿之间：还在按着
    bridge.poll();
    expect(keys.ArrowUp, '停在死区边上抖一抖不该算松手').toBe(true);
    stick(pad, 'up', BELOW_BAND());
    bridge.poll();
    expect(keys.ArrowUp).toBe(false);
  });

  it('迟滞不许反着用：从回中起步必须越过**进入**门限才算按下', () => {
    const { bridge, keys, pad } = mkBridge();
    stick(pad, 'up', MID_BAND());                    // 迟滞带里的数值，但这一轮没进入过
    bridge.poll();
    expect(keys.ArrowUp, '把下沿当门限用 = 轻碰摇杆就走一格').toBeFalsy();
    stick(pad, 'up');
    bridge.poll();
    expect(keys.ArrowUp).toBe(true);
  });

  it('门限跟着玩家那一档 `deadzone` 走：下沿是乘出来的，不是又一个绝对数值', () => {
    const { bridge, keys, pad } = mkBridge();
    bridge.setTuning({ deadzone: 0.4 });
    stick(pad, 'up', 0.3);                           // 出厂档算推出了死区，这一档不算
    bridge.poll();
    expect(keys.ArrowUp).toBeFalsy();
    stick(pad, 'up', 0.45);
    bridge.poll();
    expect(keys.ArrowUp).toBe(true);
    stick(pad, 'up', 0.3);                           // 0.4 × 0.6 = 0.24 之下才算松手
    bridge.poll();
    expect(keys.ArrowUp, '低档把下沿抬到进入门限之上，就会"一点亮就松不开"').toBe(true);
  });

  it('死区拧到 0（面板允许的下限）：完全回中的摇杆不算"一直推着"', () => {
    const { bridge, keys, pad } = mkBridge();
    bridge.setTuning({ deadzone: 0 });
    center(pad);
    bridge.poll();
    expect(arrowsDown(keys), '回中时不该有任何一格在连发').toEqual([]);
  });

  it('摇杆与十字键同按同一方向：那一把键始终只有一个主人', () => {
    const { bridge, keys, pad } = mkBridge();
    stick(pad, 'down');
    press(pad, 'dpadDown', true);
    bridge.poll();
    expect(keys.ArrowDown).toBe(true);
    // 全表只有这一格声称借走了 `ArrowDown` —— 拆成两格就是这一笔先红
    expect(bridge._slots.filter((s) => s.claimedCode === 'ArrowDown')).toHaveLength(1);
    center(pad);
    bridge.poll();
    expect(keys.ArrowDown, '摇杆回中、十字键还按着：键该留下').toBe(true);
    press(pad, 'dpadDown', false);
    bridge.poll();
    expect(keys.ArrowDown, '两路都松了才该还键').toBe(false);
    press(pad, 'dpadDown', true);                    // 只剩十字键：仍然走格
    bridge.poll();
    expect(keys.ArrowDown).toBe(true);
    press(pad, 'dpadDown', false);
    bridge.poll();
    expect(keys.ArrowDown).toBe(false);
  });

  it('摇杆那一格仍然只有热键表一个出口真源：改绑 ↑ 之后手柄的摇杆跟着搬', () => {
    const table = applyHotkeyOverrides(UI_HOTKEYS, { uiUp: 'KeyI' });
    const { bridge, keys, pad } = mkBridge(UI_GAMEPAD_BINDINGS, (slot) => (slot.hotkey
      ? { code: table.find((e) => e.action === slot.hotkey)?.code ?? null }
      : bindingFor(slot.action)));
    stick(pad, 'up');
    bridge.poll();
    expect(keys.KeyI).toBe(true);
    expect(keys.ArrowUp, '出口抄了两份 = 切片5 那个 B47 重演').toBeFalsy();
  });
});

/* -------------------------------------------------- 端到端：与键盘同一套节奏 */

describe('端到端：推住摇杆走面板，步数与"按住十字键 / 按住方向键"逐次相等', () => {
  /** 假面板 30 格，焦点从第 1 格起；返回走过的格子序列（一帧一帧推，桥在前派发在后） */
  function walk(drive, frames, extraFrames = 0) {
    const doc = fakeDoc();
    const panel = fakePanel(Array.from({ length: 30 }, (_, i) => `s${i}`), doc, 'settings-host');
    panel.items[0].focus();
    const steps = [];
    const { bridge, keys, pad } = mkBridge();
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: () => false,
      onAction: (action) => {
        if (action !== 'uiDown') return false;
        moveFocusWithin(panel.host, 1, doc);
        steps.push(doc.activeElement?.id);
        return true;
      },
    });
    drive(pad);
    const frame = () => { bridge.poll(); router.poll(keys, DT); };
    for (let i = 0; i < frames; i += 1) frame();
    const mark = steps.length;
    for (let i = 0; i < extraFrames; i += 1) frame();
    return { steps, mark, pad, frame };
  }
  /** 焦点从当前这一帧起再走 n 帧，返回新增的格数 */
  const more = (ctx, n) => { const before = ctx.steps.length; for (let i = 0; i < n; i += 1) ctx.frame(); return ctx.steps.length - before; };

  const pushDown = (pad) => stick(pad, 'down');
  const holdDpad = (pad) => press(pad, 'dpadDown', true);

  it('推住 100 帧 = 按住十字键 100 帧 = 按住键盘方向键 100 帧', () => {
    const byStick = walk(pushDown, 100).steps;
    const byDpad = walk(holdDpad, 100).steps;
    expect(byStick.length).toBeGreaterThan(5);        // 走不出来就等于没做
    expect(byStick).toEqual(byDpad);
    const kbdKeys = { ArrowDown: true };
    const kbd = [];
    const router = new HotkeyRouter({
      table: UI_HOTKEYS, isBlocked: () => false, onAction: (a) => a === 'uiDown' && kbd.push(a),
    });
    for (let i = 0; i < 100; i += 1) router.poll(kbdKeys, DT);
    expect(kbd).toHaveLength(byStick.length);
  });

  it('回中那一帧就停：再推是新一轮，第一下立刻有、第二下要等满 delay', () => {
    const ctx = walk(pushDown, 40);                   // 0.67 秒：按下沿 + 已经在连发
    expect(ctx.steps.length).toBeGreaterThan(1);
    center(ctx.pad);
    expect(more(ctx, 20), '回中之后不许接着走').toBe(0);
    stick(ctx.pad, 'down');                           // 再推：这一帧算新一轮按下沿
    expect(more(ctx, 1)).toBe(1);
    expect(more(ctx, 24), '不许继承上一轮剩下的零头').toBe(0);
    expect(more(ctx, 2)).toBe(1);
  });

  it('推到一半停在死区边上抖：焦点连着走，不会"每抖一下重新等 0.42 秒"', () => {
    const steady = walk((pad) => stick(pad, 'down'), 60).steps.length;
    const jitter = walk((pad) => stick(pad, 'down'), 1);
    for (let i = 0; i < 60; i += 1) {                 // 一直在死区与下沿之间晃
      stick(jitter.pad, 'down', MID_BAND());
      jitter.frame();
    }
    // 抖的那一段一步都不许丢：稳推 60 帧已经过了 delay 前夜，抖着推也要在同一帧跨过零点
    expect(jitter.steps.length, '迟滞失效就会看到"走一格停一下"').toBeGreaterThan(0);
    expect(jitter.steps.length).toBeLessThanOrEqual(steady);
  });
});

/* ---------------------------------------------------------------- 门禁 */

describe('门禁：这一片没有新增第二个节奏来源', () => {
  it('桥里没有任何一份连发数值：`NAV_REPEAT` / `_held` / delay / interval 都不许出现在这里', () => {
    const src = read('engine/GamepadInput.js');
    // `startDelay:` 那种字面量不算：词边界把它挡在外面，防的是"桥自己攒了一只定时器"
    expect(src).not.toMatch(/NAV_REPEAT|UI_NAV_ACTIONS|_held|\bdelay\b|\binterval\b/i);
    // 节奏的两个零件仍然各在一处
    expect(read('content/hotkeys.js')).toMatch(/UI_NAV_ACTIONS/);
    expect(NAV_REPEAT.delay).toBeGreaterThan(NAV_REPEAT.interval);
  });

  it('方向判定只有两条路，且各按格子的声明分流：`cardinal` 走主轴、其余走八向量', () => {
    const src = read('engine/GamepadInput.js');
    const cardinal = src.match(/function _stickCardinal[\s\S]*?\n\}/)?.[0];
    expect(cardinal, '找不到 _stickCardinal 的函数体').toBeTruthy();
    expect(cardinal).toMatch(/Math\.abs\(lx\) > Math\.abs\(ly\)/);   // 主轴，不是角度扇区
    expect(cardinal).toMatch(/>\s*\(wasDown \? release : engage\)/); // 进出分开
    expect(src).toMatch(/function _stickHeld/);                      // 移动那四格没被搬走
    const slot = src.match(/useBindings\(bindings[^\n]*\)\s*\{[\s\S]*?\n {2}\}/)?.[0];
    expect(slot, '找不到 useBindings 的方法体').toBeTruthy();
    expect(slot).toMatch(/cardinal:\s*e\.cardinal === true/);         // 形状在唯一那处推导
  });

  it('桥只写电平：`keys` 里的方向键在按住期间一直为真，派发方才看得到"还按着"', () => {
    const { bridge, keys, pad } = mkBridge();
    stick(pad, 'right');
    for (let i = 0; i < 5; i += 1) {
      bridge.poll();
      expect(keys.ArrowRight, `第 ${i} 帧`).toBe(true);
    }
    center(pad);
    bridge.poll();
    expect(keys.ArrowRight).toBe(false);
  });
});
