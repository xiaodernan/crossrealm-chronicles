/**
 * 模拟量输入：左摇杆走路、右摇杆镜头曲线（W-A7 切片8）。
 *
 * 切片1 把左摇杆量化成八向码，代价是"推一点与推到底一样快" —— 手柄走路从此没有
 * 潜行与疾走的区别，而这正是玩家拿摇杆想表达的东西。切片2 给右摇杆做了模拟量，
 * 但重映射的公式是就地手写的，于是"死区外一格的斜率"与"推不到 1.0 的行程尽头"
 * 两处各自妥协了一次（B36 族：同一条算式抄在两个地方）。
 *
 * 这片要守住三件事：
 * 1. **键盘与十字键逐字不变** —— 模拟量只在 `move.mag > 0` 时才说话，八向码照写；
 * 2. **幅度真的是幅度** —— 半推半速是可测的位移比，不是常量表里的一句注释；
 * 3. **重映射与曲线只有一处算式** —— 两根摇杆共用 `_analogMagnitude`，
 *    所以将来调死区只调一个地方，不会调了一根杆、另一根杆还在用旧公式。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  GAMEPAD_BINDINGS, PAD, bindingFor,
} from '../src/content/keybinds.js';
import { UI_HOTKEYS } from '../src/content/hotkeys.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

const MOVE_DZ = PAD.deadzone;
const RANGE = PAD.analogRange;
const LOOK_DZ = PAD.lookDeadzone;
const FULL = PAD.lookPixelsPerSecond;

/** 桥那一侧的公式（与实现同式，但只在这里出现一次：用例不给每个数字各抄一份） */
const moveT = (mag) => Math.min(1, Math.max(0, (mag - MOVE_DZ) / (RANGE - MOVE_DZ)));
const lookT = (mag) => Math.min(1, Math.max(0, (mag - LOOK_DZ) / (RANGE - LOOK_DZ)));

const makePad = () => ({
  connected: true,
  mapping: 'standard',
  axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
});

const realNavigator = globalThis.navigator;
const setPads = (...pads) => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => pads },
  });
};

const resolveSlot = (slot) => {
  if (slot.hotkey) {
    const code = UI_HOTKEYS.find((e) => e.action === slot.hotkey)?.code;
    return code ? { code } : null;
  }
  return bindingFor(slot.action);
};

function rig(...pads) {
  setPads(...pads);
  const keys = {};
  const pad = new GamepadInput({ keys, mouseDown: {} }, GAMEPAD_BINDINGS, null, resolveSlot);
  return { keys, pad, poll: (n = 1) => { for (let i = 0; i < n; i++) pad.poll(); } };
}

/** 推左摇杆：`angle` 用数学角（0=右，90=上），手柄 y 轴向下为正所以这里取负 */
const pushMove = (p, mag, angleDeg = 90) => {
  const a = (angleDeg * Math.PI) / 180;
  p.axes[0] = Math.cos(a) * mag;
  p.axes[1] = -Math.sin(a) * mag;
};
const pushLook = (p, mag, angleDeg = 0) => {
  const a = (angleDeg * Math.PI) / 180;
  p.axes[2] = Math.cos(a) * mag;
  p.axes[3] = -Math.sin(a) * mag;
};

beforeAll(() => installWindowShim());
afterAll(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});

describe('左摇杆 → 模拟量：桥说得出"推了多少"', () => {
  it('半推是半推：模长按死区到量程铺开，方向按原始轴值', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.5, 90);                      // 正前，行程 0.5
    r.poll();
    expect(r.pad.move.mag).toBeCloseTo(moveT(0.5), 6);
    expect(r.pad.move.mag).toBeGreaterThan(0);
    expect(r.pad.move.mag).toBeLessThan(1);
    expect(r.pad.move.x).toBeCloseTo(0, 6);
    expect(r.pad.move.y).toBeCloseTo(moveT(0.5), 6);
  });

  it('死区以内是全零：漂移不许变成走路', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, MOVE_DZ - 0.01, 45);
    r.poll();
    expect(r.pad.move.mag).toBe(0);
    expect(r.pad.move.x).toBe(0);
    expect(r.pad.move.y).toBe(0);
  });

  it('外圈量程是产品决定：推到 0.92 就已经是满的，推到 1.0 也不溢出', () => {
    // 这里刻意写死 0.92 而不是 `PAD.analogRange`：这条断言钉的就是这个数 ——
    // 全部用例都按表算，就没有一条能发现"有人把量程改回 1.0 了"
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.92, 90);
    r.poll();
    const atRange = r.pad.move.mag;
    pushMove(pad0, 1.0, 90);
    r.poll();
    expect(atRange).toBeCloseTo(1, 6);
    expect(r.pad.move.mag).toBeCloseTo(1, 6);
    expect(r.pad.move.mag).toBeGreaterThanOrEqual(PAD.moveSprintThreshold);
  });

  it('符号归桥：手柄的 -y 是"前"，消费方拿到的是向前为正', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.8, 90);            // 前推
    r.poll();
    const fwd = r.pad.move.y;
    pushMove(pad0, 0.8, -90);           // 后拉
    r.poll();
    const back = r.pad.move.y;
    pushMove(pad0, 0.8, 0);             // 右推
    r.poll();
    expect(fwd).toBeGreaterThan(0);
    expect(back).toBeCloseTo(-fwd, 6);
    expect(r.pad.move.x).toBeCloseTo(moveT(0.8), 6);
  });

  it('对角不溢出：模长还是那一档幅度，方向不改', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.7, 30);
    r.poll();
    const m = r.pad.move;
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(m.mag, 6);
    expect(Math.atan2(m.y, m.x) * 180 / Math.PI).toBeCloseTo(30, 4);
  });

  it('推回死区里也要清干净：残留的 x/y 是给下一个消费者埋的雷', () => {
    // 只测 `mag` 归零不够：消费方今天靠 `mag > 0` 这一道闸忽略 x/y，
    // 明天多一个读 `move.x` 的地方就会拿到上一帧的方向 —— 所以三个字段一起断言
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.9, 45);
    r.poll();
    expect(r.pad.move.mag).toBeGreaterThan(0);
    pushMove(pad0, MOVE_DZ - 0.05, 45);
    r.poll();
    expect(r.pad.move.mag).toBe(0);
    expect(r.pad.move.x).toBe(0);
    expect(r.pad.move.y).toBe(0);
  });

  it('拔手那一帧全部归零：不清就是永远朝前走', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.9, 90);
    r.poll();
    expect(r.pad.move.mag).toBeGreaterThan(0);
    setPads();                          // 拔手
    r.poll();
    expect(r.pad.move.mag).toBe(0);
    expect(r.pad.move.x).toBe(0);
    expect(r.pad.move.y).toBe(0);
  });

  it('复用槽：跨帧是同一枚对象，热路径不新建', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.6, 90);
    r.poll();
    const first = r.pad.move;
    r.poll(5);
    expect(r.pad.move).toBe(first);
  });

  it('八向码照写：模拟量不顶替 keys，键盘那套消费者不用认识手柄', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.9, 90);
    r.poll();
    expect(r.keys.KeyW).toBe(true);
  });
});

describe('右摇杆 → 响应曲线：中低段细得下来，端点不撒谎', () => {
  it('端点：死区以内 0，推到量程正好是 `lookPixelsPerSecond`', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushLook(pad0, LOOK_DZ - 0.01);
    r.poll();
    expect(r.pad.look.x).toBe(0);
    pushLook(pad0, 0.92);            // 同上：钉的是数，不是常量名
    r.poll();
    expect(Math.hypot(r.pad.look.x, r.pad.look.y)).toBeCloseTo(FULL, 3);
    pushLook(pad0, 1.0);
    r.poll();
    expect(Math.hypot(r.pad.look.x, r.pad.look.y)).toBeCloseTo(FULL, 3);
  });

  it('曲线在中低段低于线性，且严格单调（推得更多一定转得更快）', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    const mags = [0.2, 0.35, 0.5, 0.65, 0.8, RANGE];
    const speeds = mags.map((m) => {
      pushLook(pad0, m);
      r.poll();
      return Math.hypot(r.pad.look.x, r.pad.look.y);
    });
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    const half = speeds[2];
    expect(half).toBeLessThan(lookT(mags[2]) * FULL);      // 低于线性
    expect(half).toBeCloseTo(lookT(mags[2]) ** PAD.lookCurve * FULL, 3);
  });

  it('曲线只改快慢，不改朝哪儿', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushLook(pad0, 0.6, 37);
    r.poll();
    expect(Math.atan2(-r.pad.look.y, r.pad.look.x) * 180 / Math.PI).toBeCloseTo(37, 4);
  });

  it('左杆走路不串右杆：只有 `look` 变，`move` 不动', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 0.7, 90);
    pushLook(pad0, 0.5, 0);
    r.poll();
    const moveMag = r.pad.move.mag;
    pushLook(pad0, 0.9, 0);
    r.poll();
    expect(r.pad.move.mag).toBeCloseTo(moveMag, 9);
    expect(r.pad.look.x).toBeGreaterThan(0);
  });
});

describe('玩家吃到幅度：半推半速是可测的位移比', () => {
  const analogAt = (mag) => ({ x: 0, y: mag, mag });

  it('满推的方向与键盘同一条：半推不改变朝哪儿', () => {
    const p = makePlayer();
    const keysUp = { [bindingFor('moveUp').code]: true };
    // 两枚独立的 out：默认槽是复用的，两次调用都读它就会拿到同一个向量
    const fromKeys = p.readMoveDir(keysUp, false, new THREE.Vector3());
    const a = analogAt(moveT(0.6));
    const fromStick = p.readMoveDir({}, false, new THREE.Vector3(), a);
    expect(Math.hypot(fromStick.x, fromStick.z)).toBeCloseTo(a.mag, 6);
    expect(fromStick.x).toBeCloseTo(fromKeys.x * a.mag, 6);
    expect(fromStick.z).toBeCloseTo(fromKeys.z * a.mag, 6);
  });

  it('半推的位移正好是满推的一半比例（真跑帧，不是常量表）', () => {
    const dt = 1 / 120;
    // 两档都压在冲刺阈值之下：否则比较里混进了疾走倍率，比出来的就不是"幅度"了
    const hi = PAD.moveSprintThreshold - 0.05;
    const fast = runFrames(makePlayer(), 0.5, dt, {}, { x: 0, y: hi, mag: hi });
    const half = runFrames(makePlayer(), 0.5, dt, {}, { x: 0, y: hi / 2, mag: hi / 2 });
    expect(fast.length()).toBeGreaterThan(1);
    expect(half.length()).toBeCloseTo(fast.length() * 0.5, 6);
  });

  it('推到冲刺阈值才算疾走：阈值以下满推也只是走路', () => {
    const dt = 1 / 120;
    const p = makePlayer({ stamina: 100 });
    runFrames(p, 0.3, dt, {}, analogAt(PAD.moveSprintThreshold - 0.05));
    const walkSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    const q = makePlayer({ stamina: 100 });
    runFrames(q, 0.3, dt, {}, analogAt(1));
    const sprintSpeed = Math.hypot(q.velocity.x, q.velocity.z);
    expect(sprintSpeed).toBeGreaterThan(walkSpeed * 1.3);
    expect(sprintSpeed).toBeCloseTo(p.moveSpeed * p.sprintMultiplier, 2);
  });

  it('行程尽头够得着冲刺：这是 `analogRange` 存在的全部理由', () => {
    const pad0 = makePad();
    const r = rig(pad0);
    pushMove(pad0, 1.0, 90);                 // 玩家把杆推到底
    r.poll();
    expect(r.pad.move.mag).toBeGreaterThanOrEqual(PAD.moveSprintThreshold);
  });

  it('不给模拟量时逐字不变：键盘仍是归一化的满速方向', () => {
    const p = makePlayer();
    const keysUp = { [bindingFor('moveUp').code]: true };
    const d = p.readMoveDir(keysUp, false, undefined, null);
    expect(d.length()).toBeCloseTo(1, 6);
    const d2 = p.readMoveDir(keysUp, false);
    expect(d2.length()).toBeCloseTo(1, 6);
  });

  it('十字键走路是满速：轴全 0 时模拟量闭嘴，八向码路径接管', () => {
    const p = makePlayer();
    const dt = 1 / 120;
    const keysUp = { [bindingFor('moveUp').code]: true };
    const dist = runFrames(p, 0.5, dt, keysUp, { x: 0, y: 0, mag: 0 });
    expect(dist.length()).toBeCloseTo(p.moveSpeed * 0.5, 1);
  });

  it('键盘与半推同时存在时摇杆说话：不会叠成 1+ t 的超速', () => {
    const p = makePlayer();
    const keysUp = { [bindingFor('moveUp').code]: true };
    const a = analogAt(moveT(0.5));
    const d = p.readMoveDir(keysUp, false, undefined, a);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(a.mag, 6);
    expect(a.mag).toBeLessThan(1);
  });

  it('readMoveDir 带模拟量也不分配：返回的还是那枚复用槽', () => {
    const p = makePlayer();
    const first = p.readMoveDir({}, false, undefined, analogAt(0.5));
    const second = p.readMoveDir({}, false, undefined, analogAt(0.9));
    expect(second).toBe(first);
  });
});

describe('静态门禁：一处算式、一条接线', () => {
  const bridge = readFileSync(new URL('../src/engine/GamepadInput.js', import.meta.url), 'utf8');
  const game = readFileSync(new URL('../src/core/Game.js', import.meta.url), 'utf8');
  const binds = readFileSync(new URL('../src/content/keybinds.js', import.meta.url), 'utf8');

  it('死区重映射全仓只有一处定义、两处调用（两根杆共用一条算式）', () => {
    const n = (bridge.match(/_analogMagnitude\(/g) ?? []).length;
    expect(n).toBe(3);
    expect(bridge).not.toMatch(/1\s*-\s*PAD\.lookDeadzone/);   // 旧的"以 1.0 为满舵"写法不许回来
  });

  it('模拟量真的接到了玩家：`player.update` 第三参是桥的那枚复用槽', () => {
    expect(game).toMatch(/this\.player\.update\([\s\S]{0,160}?this\.padInput\?\.move/s);
    expect(binds).toMatch(/moveAxes:\s*\[0,\s*1\]/);
  });

  it('调参表自洽：量程必须真的在死区之外，否则整段行程都被夹成 0', () => {
    expect(RANGE).toBeGreaterThan(PAD.deadzone);
    expect(RANGE).toBeGreaterThan(PAD.lookDeadzone);
    expect(PAD.moveSprintThreshold).toBeGreaterThan(0);
    expect(PAD.moveSprintThreshold).toBeLessThanOrEqual(1);
    expect(PAD.lookCurve).toBeGreaterThan(1);
  });

  it('模拟量不许冒充按键：`move` 不进 `keys`（否则走路会被当成按住 W 连发）', () => {
    expect(bridge).not.toMatch(/keys\[[^\]]*\]\s*=\s*.*move\./);
  });
});
