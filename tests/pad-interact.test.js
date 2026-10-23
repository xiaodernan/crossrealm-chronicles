/**
 * 手柄侧的"交互"这一格（W-A7 切片31）。
 *
 * 现场：`interact`（出厂 `KeyE`）与 `fastTravel`（出厂 `KeyT`）只在键盘表里，两张手柄表
 * 没有任何一格指向它们。纯手柄玩家走到营火、NPC、世界之锚面前**什么都按不动** ——
 * 而界面文案（`{interact}` 那些提示）说的是"按 E"，键位表里"交互"那一行的手柄列显示 `—`。
 * 这与 B55/B57 同族：不是这条路难走，是从来没有被定义。
 *
 * 认领的槽：**右摇杆按下（`rightStick`）**。它今天是真空的（`grep "button: 'rightStick'" src/`
 * 命中 0），而"右摇杆按下 = 交互"是这一代动作游戏的通用惯例，不用教。
 * 冲刺是**左**摇杆按下，两枚互不干扰。
 *
 * 判据形状决定档位（切片30 写进 `keybinds.js` 文件头的那条规矩）：
 * `PlayerController.handleInteractions` 是"读一眼就把键清成 false"再加 0.8 秒冷却的消费者，
 * 它判的是**按过没有**，所以这一格必须是 `edge` —— 给 `level` 就是"按住营火每帧重开一次对话"，
 * 正是 W-A4 那一类。这一片与切片30 恰好成对：同一张表里，`spell1` 因为判"按了多久"吃 `level`，
 * `interact` 因为判"按过没有"吃 `edge`。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { t } from '../src/engine/i18n.js';
import {
  GAMEPAD_BINDINGS, UI_GAMEPAD_BINDINGS, PAD_BUTTON, KEY_BINDINGS,
  KEY_ACTION_LABELS, bindingFor, codeFor, resolveGamepadBindings,
} from '../src/content/keybinds.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';

const realNavigator = globalThis.navigator;
const setPad = (pad) => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => (pad ? [pad] : []) },
  });
};

function makePad() {
  return {
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
}

/** 摇杆按下那一枚是真按键（`pressed` 布尔），不是扳机那种模拟量 */
function press(pad, name, down = true) {
  const b = pad.buttons[PAD_BUTTON[name]];
  b.pressed = down;
  b.value = down ? 1 : 0;
}

function rig(table = GAMEPAD_BINDINGS, overrides = null) {
  const pad = makePad();
  setPad(pad);
  const keys = {};
  const bindings = overrides ? resolveGamepadBindings(table, overrides) : table;
  const bridge = new GamepadInput({ keys, mouseDown: { left: false, right: false } },
    bindings, null, (slot) => (slot.hotkey ? null : bindingFor(slot.action)));
  const step = () => { bridge.poll(); return { ...keys }; };
  return { pad, keys, bridge, step };
}

afterEach(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});

describe('表里得有"交互"这一格，而且得是对的那一格', () => {
  it('手柄表认领 interact：右摇杆按下', () => {
    const cell = Object.values(GAMEPAD_BINDINGS).find((e) => e.action === 'interact');
    expect(cell, 'interact 在手柄表里没有格 —— 纯手柄玩家走到营火面前按什么都没有反应').toBeTruthy();
    expect(cell.button).toBe('rightStick');
  });

  it('这一格是 edge：消费者判"按过没有"（读完自己清键 + 0.8 秒冷却）', () => {
    const cell = Object.values(GAMEPAD_BINDINGS).find((e) => e.action === 'interact');
    expect(cell.mode).toBe('edge');
  });

  it('右摇杆按下在游戏表与界面表里都只有一个主人', () => {
    const owners = [GAMEPAD_BINDINGS, UI_GAMEPAD_BINDINGS]
      .flatMap((t) => Object.values(t).filter((e) => e.button === 'rightStick').map((e) => e.action));
    expect(owners).toEqual(['interact']);
  });

  it('这一格的名字只在标签表一份，手柄条目不许自带中文', () => {
    const cell = Object.values(GAMEPAD_BINDINGS).find((e) => e.action === 'interact');
    expect(cell, '手柄表里还没有 interact 这一格（先补格子再谈标签归属）').toBeTruthy();
    expect(cell.label, '手柄条目自带标签就等于开了第二份名字表').toBeUndefined();
    // W-D2 切片18：标签表存的是键，展开后才是玩家读到的那两个字
    expect(t(KEY_ACTION_LABELS.interact)).toBe('交互');
    expect(KEY_BINDINGS.interact, '键盘侧那一格本来就有，手柄这格是补的第二条出口').toBeTruthy();
  });
});

describe('按下那一帧给一次，按住不连发，松手把键还掉', () => {
  it('按下右摇杆那一帧，interact 的生效键码在 keys 里为真', () => {
    const r = rig();
    expect(r.step()[codeFor('interact')]).toBeFalsy();
    press(r.pad, 'rightStick');
    expect(r.step()[codeFor('interact')]).toBe(true);
  });

  it('按住第二帧不许再来一次：level 会把营火对话每帧重开', () => {
    const r = rig();
    press(r.pad, 'rightStick');
    r.step();
    press(r.pad, 'rightStick');
    expect(r.step()[codeFor('interact')]).toBeFalsy();
  });

  it('没碰手柄时不动键盘那一格；手柄按过又松开，才轮到它清这一格', () => {
    const r = rig();
    const code = codeFor('interact');
    r.keys[code] = true;                      // 玩家正按着键盘的 E
    r.step();
    expect(r.keys[code], '手柄一回中就把键盘按着的交互抹掉，是越权').toBe(true);
    press(r.pad, 'rightStick');
    r.step();
    press(r.pad, 'rightStick', false);
    r.step();
    expect(r.keys[code], '借走的那一格必须自己还，否则"永远在交互"').toBe(false);
  });

  // 这一条是改前跑红时摔出来的：把"一枚按钮两个主人"的账本当成纸上的说法，
  // 真去改绑才看见开机表直接拒。既然机制在场，就该有一条用例钉住它 —— 否则
  // 哪天校验松了口，玩家可以悄悄把交互和锁敌绑在同一枚键上。
  it('改绑不许把一枚按钮交给两个主人：只搬 interact 会被开机表拒', () => {
    expect(() => resolveGamepadBindings(GAMEPAD_BINDINGS, { interact: 'leftBumper' }))
      .toThrow(/已被动作 "lockOn" 认领/);
  });

  it('改绑要走就得整对走：interact 搬去 LB、lockOn 搬来 RS，脉冲跟着搬家', () => {
    const r = rig(GAMEPAD_BINDINGS, { interact: 'leftBumper', lockOn: 'rightStick' });
    const code = codeFor('interact');
    press(r.pad, 'rightStick');
    expect(r.step()[code], '出厂那枚右摇杆已经交给 lockOn，不该再办交互').toBeFalsy();
    press(r.pad, 'leftBumper');
    const fired = r.step()[code];
    press(r.pad, 'leftBumper');
    const again = r.step()[code];
    expect(fired).toBe(true);
    expect(again, '改绑之后边沿形状不该变').toBeFalsy();
  });
});
