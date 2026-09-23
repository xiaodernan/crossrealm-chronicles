/**
 * 手柄轮询桥与绑定表（W-A7 切片1）。
 *
 * 这一片的风险不在"能不能读到 `getGamepads()`"，而在三条边界上：
 * 1. **不许动键盘**：没有手柄、或手柄没按过的那一格，`keys` 必须与今天一模一样；
 *    共用同一格（都写 `KeyW`）时，手柄松手不许把键盘按着的 W 抹掉。
 * 2. **不许连发**：一批老消费者是"读完把键清成 false"的写法，给电平就会按住每帧触发。
 * 3. **拔手必须还键**：热拔那一帧不清，玩家会永远朝前走。
 * 所以用例的重点是"按了几帧、第几帧为真"，而不是"读得到值"。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import {
  GAMEPAD_BINDINGS, PAD_ACTIONS, PAD_BUTTON, PAD, assertKeybinds,
} from '../src/content/keybinds.js';
import { CAMERA_FOV } from '../src/content/tuning.js';
import { UI_HOTKEYS } from '../src/content/hotkeys.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { installWindowShim, makeWorld } from './helpers/enemyHarness.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

/** 真机 `navigator.getGamepads()` 返回的形状（标准映射、16 键 4 轴） */
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

/** 扳机：标准映射里它既是模拟轴也报按钮，`pressed` 只在过半时为真 */
const analog = (pad, name, value) => {
  const b = pad.buttons[PAD_BUTTON[name]];
  b.pressed = value >= 0.5;
  b.value = value;
};

const stick = (pad, x, y) => { pad.axes[0] = x; pad.axes[1] = y; };
const lookStick = (pad, x, y) => { pad.axes[2] = x; pad.axes[3] = y; };

const realNavigator = globalThis.navigator;
const setPads = (...pads) => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => pads },
  });
};

beforeAll(() => {
  installWindowShim();
});

afterAll(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});

/** 桥 + 输入出口：`keys` 与 `mouseDown` 就是 `Game.keys` / `CombatController.mouseDown` 的形状 */
function rig(...pads) {
  setPads(...pads);
  const keys = {};
  const mouseDown = { left: false, right: false };
  const pad = new GamepadInput({ keys, mouseDown });
  return { keys, mouseDown, pad, frames: (n) => { for (let i = 0; i < n; i++) pad.poll(); } };
}

describe('绑定表：错表要在接上手柄之前红', () => {
  it('表与动作清单严格对齐：既不落下任何一个动作，也不允许多出无主动作', () => {
    expect(Object.keys(GAMEPAD_BINDINGS).sort()).toEqual([...PAD_ACTIONS].sort());
  });

  it('真表过校验（这一句本身就是"加载期跑过一次"的复证）', () => {
    expect(() => assertKeybinds()).not.toThrow();
  });

  it('mode 只认 level / edge：写成别的就在加载期抛', () => {
    const bad = structuredClone(GAMEPAD_BINDINGS);
    bad.jump.mode = 'hold';
    expect(() => assertKeybinds(bad)).toThrow(/mode/);
  });

  it('code 与 mouse 必须二选一：两个都不给、或都给，都是错表', () => {
    const none = structuredClone(GAMEPAD_BINDINGS);
    delete none.jump.code;
    expect(() => assertKeybinds(none)).toThrow(/code 或 mouse/);
    const both = structuredClone(GAMEPAD_BINDINGS);
    both.jump.mouse = 'left';
    expect(() => assertKeybinds(both)).toThrow(/code 或 mouse/);
  });

  it('两个动作抢同一个出口 = 一次按下办两件事，加载期就红', () => {
    const clash = structuredClone(GAMEPAD_BINDINGS);
    clash.roll.code = 'Space';
    expect(() => assertKeybinds(clash)).toThrow(/抢同一个出口/);
  });

  it('移动动作必须有摇杆轴与方向；给按钮反而是错（十字键由方向顺带带上）', () => {
    const noDir = structuredClone(GAMEPAD_BINDINGS);
    delete noDir.moveUp.dir;
    expect(() => assertKeybinds(noDir)).toThrow(/dir/);
    const withButton = structuredClone(GAMEPAD_BINDINGS);
    withButton.moveUp.button = 'a';
    expect(() => assertKeybinds(withButton)).toThrow(/不该绑按钮/);
  });

  it('未登记的按钮名与未知动作名都拦得住', () => {
    const badButton = structuredClone(GAMEPAD_BINDINGS);
    badButton.jump.button = 'triggers';
    expect(() => assertKeybinds(badButton)).toThrow(/未登记/);
    const badAction = structuredClone(GAMEPAD_BINDINGS);
    badAction.ghost = { action: 'ghost', mode: 'edge', button: 'rightStick', code: 'KeyZ' };
    expect(() => assertKeybinds(badAction)).toThrow(/PAD_ACTIONS/);
  });

  it('手柄能开暂停菜单：`start` 冒充 `Escape`，而这码从切片3 起真的有人轮询', () => {
    // 切片1 立这条时是"表里不许出现只被 keydown 事件消费的码"（绑了也不会响）。
    // UI 热键改成边沿轮询之后，`Escape` 变成了合法出口 —— 这条用例改为钉住那件事。
    const escape = Object.values(GAMEPAD_BINDINGS).find((e) => e.code === 'Escape');
    expect(escape).toBeTruthy();
    expect(UI_HOTKEYS.some((e) => e.code === 'Escape' && e.action === 'escape')).toBe(true);
    const pad0 = makePad();
    const r = rig(pad0);
    const seen = [];
    press(pad0, 'start');
    for (let i = 0; i < 4; i++) {
      r.pad.poll();
      seen.push(!!r.keys.Escape);
    }
    expect(seen).toEqual([true, false, false, false]);   // 按住不该反复开关菜单
  });
});

describe('轮询桥：没按手柄时，键盘路径逐字不变', () => {
  it('没有手柄：poll 返回 false，`keys` 一个字节都没被写过', () => {
    const r = rig();
    expect(r.pad.poll()).toBe(false);
    expect(r.keys).toEqual({});
  });

  it('手柄全程松着：`keys` 仍保持空对象（不许给每个动作塞一个 false）', () => {
    const r = rig(makePad());
    r.frames(10);
    expect(r.keys).toEqual({});
  });

  it('键盘按住的 W 不被手柄的回中抹掉：只还自己借走的那一份', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    r.keys.KeyW = true;                    // 玩家正按着键盘的 W
    r.frames(3);
    expect(r.keys.KeyW).toBe(true);        // 手柄没推杆：那一格还归键盘
    stick(pad0, 0, -1);
    r.frames(2);
    stick(pad0, 0, 0);
    r.frames(1);
    expect(r.keys.KeyW).toBe(false);       // 手柄按过又松开，才轮到它清这一格
  });
});

describe('轮询桥：电平与按下沿分得清', () => {
  it('左摇杆推上是电平：按住几帧就几帧为真，回中那一帧立刻假', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    stick(pad0, 0, -0.9);
    r.pad.poll();
    expect(r.keys.KeyW).toBe(true);
    r.frames(4);
    expect(r.keys.KeyW).toBe(true);
    stick(pad0, 0, 0);
    r.pad.poll();
    expect(r.keys.KeyW).toBe(false);
  });

  it('径向死区之内不算推：0.15 的漂移不该让人起步', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    stick(pad0, 0.12, -0.12);
    r.frames(3);
    expect(r.keys).toEqual({});
    stick(pad0, 0, -0.9);
    r.pad.poll();
    expect(r.keys.KeyW).toBe(true);
  });

  it('出了死区也按八向量走：与正右偏 20° 是"向右"，不是"右前"', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    stick(pad0, 0.94, -0.34);              // 与 +x 轴约 20°：落在"右"那一格（±22.5°）
    r.pad.poll();
    expect(r.keys.KeyD).toBe(true);
    expect(r.keys.KeyW).toBeUndefined();
  });

  it('对角推就是对角：两向同时为真，位移由 `readMoveDir` 归一', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    stick(pad0, 0.8, -0.8);
    r.pad.poll();
    expect([r.keys.KeyW, r.keys.KeyD]).toEqual([true, true]);
    const p = makePlayer();
    p.teleport(0, 0, 0);
    p.yaw = p.targetYaw = 0;               // yaw=0 时 forward 是 +Z，right 是 +X
    let moved = null;
    for (let i = 0; i < 32; i++) {
      r.pad.poll();
      p.update(1 / 64, r.keys);
      if (i === 31) moved = { x: p.position.x, z: p.position.z };
    }
    expect(Math.abs(moved.x)).toBeGreaterThan(1);
    expect(moved.x).toBeLessThan(0);       // KeyD 取 -right
    expect(moved.z).toBeGreaterThan(1);
  });

  it('十字键顺带同一条：只推十字键也能走，不必另绑一遍', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    press(pad0, 'dpadRight');
    r.pad.poll();
    expect(r.keys.KeyD).toBe(true);
    expect(r.keys.KeyW).toBeFalsy();
  });

  it('edge 动作按住不连发：五帧里只有第一帧为真', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    const seen = [];
    press(pad0, 'a');
    for (let i = 0; i < 5; i++) {
      r.pad.poll();
      seen.push(!!r.keys.Space);
    }
    expect(seen).toEqual([true, false, false, false, false]);
  });

  it('edge 动作松开再按才算第二次', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    press(pad0, 'b');
    r.pad.poll();
    expect(r.keys.ControlLeft).toBe(true);
    press(pad0, 'b', false);
    r.frames(3);
    press(pad0, 'b');
    r.pad.poll();
    expect(r.keys.ControlLeft).toBe(true);
  });

  it('轻击走 mouseDown 出口：按下那一帧置真，下一帧就交出去（不排队成两刀）', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    press(pad0, 'rightBumper');
    r.pad.poll();
    expect(r.mouseDown.left).toBe(true);
    r.frames(2);
    expect(r.mouseDown.left).toBe(false);
    press(pad0, 'rightBumper', false);
    r.frames(2);
    expect(r.mouseDown.left).toBe(false);
  });

  it('扳机按模拟量算：没过半不触发，过了半只算一次按下', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    analog(pad0, 'rightTrigger', 0.4);
    r.frames(2);
    expect(r.mouseDown.right).toBe(false);
    analog(pad0, 'rightTrigger', 0.95);
    r.pad.poll();
    expect(r.mouseDown.right).toBe(true);
    r.frames(2);
    expect(r.mouseDown.right).toBe(false);   // 按住不放不该一直喂缓冲
  });

  it('迟滞：电平动作停在门限与迟滞线之间算"还按着"，退到线下才松', () => {
    const pad0 = makePad();
    setPads(pad0);
    const keys = {};
    const pad = new GamepadInput({ keys }, {
      hold: { action: 'hold', mode: 'level', button: 'leftTrigger', code: 'ShiftLeft' },
    });
    analog(pad0, 'leftTrigger', 0.6);
    pad.poll();
    expect(keys.ShiftLeft).toBe(true);
    analog(pad0, 'leftTrigger', 0.42);       // 已低于 pressThreshold、仍高于 releaseThreshold
    pad.poll();
    expect(keys.ShiftLeft).toBe(true);
    analog(pad0, 'leftTrigger', 0.2);
    pad.poll();
    expect(keys.ShiftLeft).toBe(false);
  });
});

describe('轮询桥：热插拔不许留残键', () => {
  it('拔手那一帧把按住的键全部还掉（不还会永远朝前走）', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    stick(pad0, 0, -0.9);
    press(pad0, 'leftStick');                // 冲刺：电平
    r.frames(2);
    expect(r.keys.KeyW).toBe(true);
    expect(r.keys.ShiftLeft).toBe(true);
    pad0.connected = false;
    expect(r.pad.poll()).toBe(false);
    expect(r.keys.KeyW).toBe(false);
    expect(r.keys.ShiftLeft).toBe(false);
    expect(r.pad.active).toBe(false);
  });

  it('两只手柄时认住第一只：另一只插进来不改变目标', () => {
    const a = makePad();
    const b = makePad();
    const r = rig(a, b);
    stick(a, 0, -0.9);
    r.pad.poll();
    expect(r.keys.KeyW).toBe(true);
    stick(b, 0.9, 0);
    r.pad.poll();
    expect(r.keys.KeyD).toBeFalsy();         // 第二只手柄不该抢走输入
    expect(r.keys.KeyW).toBe(true);
  });

  it('拔了又插回来还能用', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    stick(pad0, 0.9, 0);
    r.pad.poll();
    expect(r.keys.KeyD).toBe(true);
    pad0.connected = false;
    r.frames(2);
    expect(r.keys.KeyD).toBe(false);
    pad0.connected = true;
    r.pad.poll();
    expect(r.pad.poll()).toBe(true);
  });
});

describe('接线：桥真的挂在主循环上，且是全仓唯一读手柄的地方', () => {
  const gameSrc = () => readFileSync(join(__dirname, '../src/core/Game.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('`setupInput` 构造桥，`update` 每帧轮询一次', () => {
    const src = gameSrc();
    expect(src).toMatch(/new GamepadInput\(\{[\s\S]*?keys: this\.keys/);
    expect(src.match(/this\.padInput\?\.poll\(\)/g)).toHaveLength(1);
  });

  it('`getGamepads` 只出现在桥里：别处再开一条读手柄的路就是第二个输入真源', () => {
    const bridge = readFileSync(join(__dirname, '../src/engine/GamepadInput.js'), 'utf8');
    expect(bridge).toMatch(/getGamepads/);
    const offenders = [];
    const walk = (dir) => {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) { walk(p); continue; }
        if (!p.endsWith('.js') || p === join(__dirname, '..', 'src', 'engine', 'GamepadInput.js')) continue;
        const src = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
        if (src.includes('getGamepads')) offenders.push(p);
      }
    };
    walk(join(__dirname, '..', 'src'));
    expect(offenders).toEqual([]);
  });

  it('端到端：推杆 → 桥 → 真 `PlayerController` 真的走动', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    const p = makePlayer();
    p.teleport(0, 0, 0);
    p.yaw = p.targetYaw = 0;
    stick(pad0, 0, -1);
    for (let i = 0; i < 32; i++) {
      r.pad.poll();
      p.update(1 / 64, r.keys);
    }
    expect(p.position.z).toBeGreaterThan(3);
    stick(pad0, 0, 0);
    const before = p.position.z;
    r.pad.poll();
    runFrames(p, 0.2, 1 / 64, r.keys);
    const glide = p.position.z - before;
    expect(glide).toBeLessThan(1.5);                 // 满速松手仍有一小段滑步（既有手感，不归本片）
    runFrames(p, 0.2, 1 / 64, r.keys);
    expect(p.position.z - before - glide).toBeLessThan(glide / 3);   // 但它在收敛，不是"松手还一直漂"
  });
});

describe('右摇杆镜头：模拟量，不冒充按键', () => {
  const full = PAD.lookPixelsPerSecond;
  const mkPlayer = () => {
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV.third, 1.6, 0.1, 100);
    const game = { paused: false, cinematicActive: false, autoPlayMode: false, combatCamera: null, restScene: null };
    const p = new PlayerController({ add() {}, remove() {} }, camera, makeWorld(), game);
    p.teleport(0, 0, 0);
    return p;
  };

  it('满推一格就是满舵速率，而 `keys` 一个字节都不写（镜头不该冒充按键）', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    lookStick(pad0, 1, 0);
    r.pad.poll();
    expect(r.pad.look.x).toBeCloseTo(full, 6);
    expect(r.pad.look.y).toBe(0);
    expect(r.keys).toEqual({});
  });

  it('死区之内算没碰：0.1 的漂移不该让镜头自己转', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    lookStick(pad0, 0.1, -0.05);
    r.pad.poll();
    expect(r.pad.look.x).toBe(0);
    expect(r.pad.look.y).toBe(0);
  });

  it('模拟量：推一半是半速（死区重映射回 0~1，不是"一出死区就满舵"）', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    lookStick(pad0, 0.5, 0);
    r.pad.poll();
    expect(r.pad.look.x).toBeCloseTo(((0.5 - PAD.lookDeadzone) / (1 - PAD.lookDeadzone)) * full, 6);
    expect(r.pad.look.x).toBeGreaterThan(0);
    expect(r.pad.look.x).toBeLessThan(full);
  });

  it('对角推保持方向：合成向量的模长就是那一档的舵量', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    lookStick(pad0, 0.6, -0.8);            // 模长正好 1.0 → 满舵
    r.pad.poll();
    expect(Math.hypot(r.pad.look.x, r.pad.look.y)).toBeCloseTo(full, 6);
    expect(r.pad.look.x / -r.pad.look.y).toBeCloseTo(0.6 / 0.8, 6);
  });

  it('左杆走路、右杆看：两件事互不串门', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    stick(pad0, 0, -1);
    lookStick(pad0, 1, 0);
    r.pad.poll();
    expect(r.keys.KeyW).toBe(true);
    expect(r.pad.look.x).toBeCloseTo(full, 6);
    expect(r.pad.look.y).toBe(0);          // 左杆的推量没漏进右杆
    lookStick(pad0, 0, 0);
    r.pad.poll();
    expect(r.pad.look.x).toBe(0);
    expect(r.keys.KeyW).toBe(true);        // 反过来也一样
  });

  it('拔手那一帧舵量归零（不清镜头就会一直转下去）', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    lookStick(pad0, 0, 1);
    r.frames(2);
    expect(r.pad.look.y).toBeGreaterThan(0);
    pad0.connected = false;
    r.pad.poll();
    expect(r.pad.look.y).toBe(0);
  });

  it('接到真玩家：满舵一秒转过的弧度 = 舵量 × `cameraSensitivity`，且与帧率无关', () => {
    const turn = (h) => {
      const p = mkPlayer();
      const yaw0 = p.yaw;
      for (let i = 0; i < Math.round(1 / h); i++) p.addCameraInput(full * h, 0);
      return { turned: yaw0 - p.yaw, k: p.cameraSensitivity };
    };
    const slow = turn(1 / 64);
    expect(slow.turned).toBeCloseTo(full * slow.k, 6);
    expect(turn(1 / 128).turned).toBeCloseTo(slow.turned, 10);
  });

  it('静态门禁：鼠标与手柄共用同一个镜头守卫（改守卫不许只改一半）', () => {
    const src = readFileSync(join(__dirname, '../src/core/Game.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(src.match(/cameraInputAllowed\(/g)).toHaveLength(3);   // 定义 1 + 鼠标 1 + 手柄 1
    expect(src).toMatch(/cameraInputAllowed\(true\)/);             // 鼠标要指针锁
    expect(src).toMatch(/cameraInputAllowed\(false\)/);            // 手柄没有指针锁这回事
    expect(src).toMatch(/addCameraInput\(padLook\.x \* rawDt/);    // 手柄与鼠标同为"玩家的物理输入"，吃墙钟
  });
});
