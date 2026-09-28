/**
 * 输入侧指示（W-A7 切片29）。
 *
 * 三件事各自要证的东西：
 * 1. `InputDevice` 只记"最近被**按动**的一侧"，没按动过是 `null`（不许拿"插着"当"在用"），
 *    名字拼错要抛 —— 未知的一侧不会报错的话，指示器就永远停在上一侧，那是最难查的那种假；
 * 2. 桥的 `touched` 与 `move` / `look` 同趟轮询算出：手柄在场但一动不动必须是假；
 * 3. 显示侧只问模块（标签只有一份），注记只挂在既有监听器上（不新增第二个消费者）。
 *
 * 用例尽量走真帧轮询（假 `navigator.getGamepads()` + 真 `GamepadInput`）。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { GAMEPAD_BINDINGS } from '../src/content/keybinds.js';
import { InputDevice, INPUT_DEVICE_KINDS, inputDeviceLabel } from '../src/engine/InputDevice.js';

const SRC = join(process.cwd(), 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const readShell = () => readFileSync(join(process.cwd(), 'index.html'), 'utf8');

const makePad = () => ({
  connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
});
const realNavigator = globalThis.navigator;
const setPads = (...pads) => {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
};
beforeAll(() => setPads());
afterAll(() => {
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
});
afterEach(() => setPads());

const mkBridge = () => {
  const pad = makePad();
  setPads(pad);
  const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
  return { bridge, pad };
};
const pressBtn = (pad, index, down = true) => {
  const b = pad.buttons[index];
  b.pressed = down;
  b.value = down ? 1 : 0;
};

/* ------------------------------------------------------------ InputDevice */

describe('InputDevice：只记"最近被按动的一侧"', () => {
  it('没按动过就是 null（不拿"插着没插手柄"猜答案）', () => {
    expect(new InputDevice().current()).toBe(null);
  });

  it('按动哪一侧就记哪一侧，标签只有一份（HUD 不再抄一遍中文字样）', () => {
    const d = new InputDevice();
    expect(INPUT_DEVICE_KINDS.map((k) => inputDeviceLabel(k))).toEqual(['键盘', '鼠标', '手柄']);
    for (const k of INPUT_DEVICE_KINDS) {
      expect(d.note(k)).toBe(k);
      expect(d.current()).toBe(k);
      expect(inputDeviceLabel(k)).toBeTruthy();
    }
  });

  it('名字拼错要抛：静默收下 = 指示器永远停在上一侧', () => {
    const d = new InputDevice();
    d.note('keyboard');
    expect(() => d.note('Keybaord')).toThrow(/未知的输入侧/);
    expect(() => d.note(undefined)).toThrow(/未知的输入侧/);
    expect(d.current(), '抛错那次不许把状态改坏').toBe('keyboard');
  });

  it('changes 只在真的换侧时加一（给测试与读数看，不参与判定）；reset 之后回到 null', () => {
    const d = new InputDevice();
    d.note('gamepad');
    d.note('gamepad');
    expect(d.changes).toBe(1);
    d.note('keyboard');
    expect(d.changes).toBe(2);
    d.reset();
    expect(d.current()).toBe(null);
  });
});

/**
 * 变化广播（W-A7 切片33）：提示文案要知道"这一手换人了"。
 *
 * 订阅挂在这本账上（而不是让键 / 鼠标 / 手柄三个通知点各自再喊一声）：那三处今天都只调
 * `note()`，各喊一声就等于"这一下算谁"多出三个说法 —— 切片29 挡掉的正是这个。
 */
describe('InputDevice 的变化广播：只在真的变了那一次喊', () => {
  it('换侧喊一次、同一侧重复注记不吵、`reset` 也算一次变化', () => {
    const d = new InputDevice();
    const heard = [];
    d.onChange((kind) => heard.push(kind));
    d.note('keyboard');
    d.note('keyboard');
    d.note('gamepad');
    d.reset();
    d.reset();
    expect(heard).toEqual(['keyboard', 'gamepad', null]);
  });

  it('订阅者收到的是**变过之后**的那一侧，与 `current()` 一致', () => {
    const d = new InputDevice();
    let seen = 'x';
    d.onChange(() => { seen = d.current(); });
    d.note('mouse');
    expect(seen).toBe('mouse');
  });

  it('拼错那一侧要抛，而抛错那次既不换侧也不广播', () => {
    const d = new InputDevice();
    const heard = [];
    d.note('keyboard');
    d.onChange((kind) => heard.push(kind));
    expect(() => d.note('Keybaord')).toThrow(/未知的输入侧/);
    expect(heard).toEqual([]);
    expect(d.current()).toBe('keyboard');
  });

  it('退订函数是唯一出口：摘掉之后不再收；传进来的不是函数当场抛', () => {
    const d = new InputDevice();
    const heard = [];
    const off = d.onChange((kind) => heard.push(kind));
    d.note('keyboard');
    off();
    d.note('mouse');
    expect(heard).toEqual(['keyboard']);
    expect(() => d.onChange('不是函数')).toThrow(/要一个函数/);
  });
});

/* ------------------------------------------------------------------ 桥 */

describe('桥的 touched：手柄在场不等于在手', () => {
  it('没有手柄：poll 之后 touched 为假（连 active 都该是假）', () => {
    setPads();
    const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => []);
    bridge.poll();
    expect(bridge.active).toBe(false);
    expect(bridge.touched).toBe(false);
  });

  it('插着不动：active 为真而 touched 必须为假 —— 玩家可能正在用键盘走路', () => {
    const { bridge } = mkBridge();
    bridge.poll();
    bridge.poll();
    expect(bridge.active).toBe(true);
    expect(bridge.touched, '把"在场"读成"在用"，指示器就永远跟着手柄跑').toBe(false);
  });

  it('按下一枚按钮那一帧为真，松手之后回到假（每帧重算，不留存）', () => {
    const { bridge, pad } = mkBridge();
    pressBtn(pad, 0);                       // A
    bridge.poll();
    expect(bridge.touched).toBe(true);
    pressBtn(pad, 0, false);
    bridge.poll();
    expect(bridge.touched).toBe(false);
  });

  it('摇杆：离开死区算按动，压在死区里抖一抖不算', () => {
    const { bridge, pad } = mkBridge();
    pad.axes[0] = 0.05;                     // 出厂死区 0.2 之内
    bridge.poll();
    expect(bridge.touched, '死区里的漂移不该把玩家标成"在用手柄"').toBe(false);
    pad.axes[0] = 0.8;
    bridge.poll();
    expect(bridge.touched).toBe(true);
    pad.axes[0] = 0;
    bridge.poll();
    expect(bridge.touched).toBe(false);
  });

  it('捕获期也算：等玩家按键的那几帧，他确实在按手柄', () => {
    const { bridge, pad } = mkBridge();
    bridge.startCapture(() => {});
    pressBtn(pad, 1);                       // B
    bridge.poll();
    expect(bridge.touched).toBe(true);
  });
});

/* -------------------------------------------------------------- 接线形状 */

describe('接线：注记只挂在既有监听器上，文案只问模块', () => {
  const game = read('core/Game.js');
  const hud = read('ui/HUD.js');

  it('三处注记各一次，且都不新增监听器', () => {
    expect((game.match(/inputDevice\.note\(/g) ?? [])).toHaveLength(3);
    expect(game).toMatch(/this\.keys\[e\.code\] = true;\r?\n\s*this\.inputDevice\.note\('keyboard'\)/);
    // 鼠标那条在守卫之前：玩家点第一下（求指针锁）那一瞬间就该换指示，不是"打出去才算"
    const mouseAt = game.indexOf("note('mouse')");
    expect(mouseAt).toBeGreaterThan(-1);
    expect(game.slice(mouseAt, mouseAt + 220)).toContain('!this.pointerLocked');
    expect(game).toMatch(/if \(this\.padInput\?\.touched\) this\.inputDevice\.note\('gamepad'\)/);
    // 手柄那条挂在 `poll()` 之后：判断在桥里算，这里只是转述
    expect(game.indexOf("this.padInput?.poll();")).toBeLessThan(game.indexOf("note('gamepad')"));
    expect((game.match(/addEventListener\('keydown'/g) ?? [])).toHaveLength(1);
  });

  it('HUD 那一格：格子在 HUD 自己的模板里、文案只问标签函数、并且不做每帧重写', () => {
    // HUD 的主体是 `buildHUD()` 现拼的（FPS / 视角那一列都在里面），壳页里只有一个空 #hud
    expect(readShell()).toMatch(/<div id="hud"><\/div>/);
    expect(hud).toMatch(/<div id="input-device-display">/);
    expect(hud).toMatch(/this\.updateInputDevice\(\);/);
    expect(hud).toMatch(/const kind = this\.game\.inputDevice\?\.current\(\) \?\? null;/);
    expect(hud).toMatch(/if \(kind === this\._inputDeviceShown\) return;/);
    expect(hud).toMatch(/inputDeviceLabel\(kind\)/);
    // 中文字样只住在模块里：HUD 再抄一份，改天两边就各说各话（B47 那一族）
    expect(hud).not.toMatch(/['"]键盘['"]|['"]鼠标['"]|['"]手柄['"]/);
  });

  it('这本账的转述只有一处：`Game` 把变化交给提示出口，别处不许再记第二份（切片33）', () => {
    expect((game.match(/setHintDevice\(/g) ?? []), '设备变化要喂给提示出口，且只有这一处').toHaveLength(1);
    expect(game).toMatch(/this\.inputDevice\.onChange\(\(kind\) => setHintDevice\(kind\)\)/);
    // 提示出口自己不许去读 `navigator.getGamepads()`：读手柄只有桥那一处（切片1 的立片理由）
    expect(read('content/keyHints.js')).not.toMatch(/getGamepads/);
  });
});
