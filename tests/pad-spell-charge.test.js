/**
 * 手柄侧的蓄力法术（W-A7 切片30）。
 *
 * 说明书、营火台词、图鉴低语都写着"长按 {spell1} 蓄力"，`SpellSystem` 也真的按"按住多久"
 * 决定这一发算不算蓄力。但手柄那一格写的是 `mode: 'edge'` —— 桥只在按下那一帧给 true，
 * 于是玩家按住 LT 一秒，消费方看到的是"按下 + 松手"两帧，`chargeTime` 只累计到一帧的 dt。
 * 这不是"手感差一点"，是**蓄力那一档在手柄上根本不存在**：蓄力伤害、时停打断、
 * `charge-spell` 任务、HUD 那根蓄力条，全都只在键盘侧可达。
 *
 * 用例两头都测：轻点不许变成蓄力（否则蓄力白送），按住也不许每帧各落一发
 * （`level` 的老毛病正是 W-A4 那条"按住 Ctrl 每帧请求一次翻滚"）。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { GAMEPAD_BINDINGS, PAD_BUTTON, bindingFor } from '../src/content/keybinds.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { SpellSystem } from '../src/combat/SpellSystem.js';
import { installWindowShim, makeScene } from './helpers/enemyHarness.js';

const DT = 1 / 60;
/** 与 `SpellSystem` 内部那个常数同一口径：按住超过它才算蓄力。这里只当黑盒用（0.2s 轻点 / 1s 长按） */
const TAP = 12;
const HOLD = 60;

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

/** 扳机在标准映射里既报 `pressed` 也报模拟量，两边一起给才是真机形状 */
function trigger(pad, name, value) {
  const b = pad.buttons[PAD_BUTTON[name]];
  b.value = value;
  b.pressed = value >= 0.5;
}

/**
 * 真 `SpellSystem` + 真桥 + 真键位出口。
 *
 * 替身只给到 `SpellSystem` 实际调用的那层接口（`isBusy` / `getCombatForwardXZ` /
 * `getAliveEnemies`），不给它没问过的字段 —— 桩多给一个字段，就等于替生产替玩家答一次"能"。
 */
function rig() {
  const pad = makePad();
  setPad(pad);
  const keys = {};
  const bridge = new GamepadInput({ keys, mouseDown: { left: false, right: false } },
    GAMEPAD_BINDINGS, null, (slot) => (slot.hotkey ? null : bindingFor(slot.action)));
  const scene = makeScene();
  const casts = [];
  const charges = [];
  window.addEventListener('spell-cast', (e) => casts.push(e.detail));
  const spells = new SpellSystem(
    scene,
    {
      position: new THREE.Vector3(0, 0, 0),
      combat: { isBusy: () => false },
      getCombatForwardXZ: () => ({ x: 0, z: -1 }),
    },
    { getAliveEnemies: () => [] },
    null,
    { spawn: () => {} },
    { spellCast: () => {}, hit: () => {}, heavyHit: () => {} },
    { arcane: 1, mind: 0 },
  );
  const step = () => {
    bridge.poll();
    spells.update(DT, keys);
    charges.push(spells.vitals.chargePct.value);
  };
  return { pad, keys, spells, casts, charges, step, lt: (v) => trigger(pad, 'leftTrigger', v) };
}

beforeAll(() => {
  installWindowShim();
});

afterEach(() => {
  if (realNavigator) {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: realNavigator });
  }
});

describe('按住那一秒真的要被按住：键盘与手柄走同一个判据', () => {
  it('键盘长按 {spell1} 一秒 → 蓄力施法（对照组，这一条今天就是绿的）', () => {
    const r = rig();
    const code = bindingFor('spell1').code;
    for (let i = 0; i < HOLD; i++) {
      r.keys[code] = true;
      r.step();
    }
    r.keys[code] = false;
    r.step();
    expect(r.casts).toEqual([{ id: 'fire', nameKey: 'spell_name_fire', charged: true }]);
  });

  it('手柄长按 LT 一秒 → 蓄力施法', () => {
    const r = rig();
    for (let i = 0; i < HOLD; i++) {
      r.lt(1);
      r.step();
    }
    r.lt(0);
    r.step();
    expect(r.casts).toEqual([{ id: 'fire', nameKey: 'spell_name_fire', charged: true }]);
  });

  it('手柄按住期间蓄力条在走（不是一帧的闪烁）', () => {
    const r = rig();
    for (let i = 0; i < 30; i++) {
      r.lt(1);
      r.step();
    }
    r.lt(0);
    r.step();
    const pct = r.charges;
    const peak = Math.max(...pct);
    expect(peak).toBeGreaterThan(0.5);
    // 蓄力中的帧数：至少要有连续多帧处在 0 与 1 之间，一帧脉冲只会留一个台阶
    const rising = pct.filter((v, i) => v > 0 && v < 1 && i > 0 && pct[i - 1] < v).length;
    expect(rising).toBeGreaterThan(5);
  });

  it('手柄轻点 LT（不到蓄力时间）→ 普通施法，不算蓄力', () => {
    const r = rig();
    for (let i = 0; i < TAP; i++) {
      r.lt(1);
      r.step();
    }
    r.lt(0);
    r.step();
    expect(r.casts).toEqual([{ id: 'fire', nameKey: 'spell_name_fire', charged: false }]);
  });

  it('键盘轻点 {spell1} 同样不算蓄力：门限不许被任何一侧白送', () => {
    const r = rig();
    const code = bindingFor('spell1').code;
    for (let i = 0; i < TAP; i++) {
      r.keys[code] = true;
      r.step();
    }
    r.keys[code] = false;
    r.step();
    expect(r.casts).toEqual([{ id: 'fire', nameKey: 'spell_name_fire', charged: false }]);
  });

  it('手柄按住两秒也只落一发：`level` 不许退成"每帧各一次"（W-A4 那一类）', () => {
    const r = rig();
    for (let i = 0; i < 120; i++) {
      r.lt(1);
      r.step();
    }
    expect(r.casts).toEqual([]);          // 没松手就不该出手
    r.lt(0);
    r.step();
    expect(r.casts.length).toBe(1);
    expect(r.casts[0].charged).toBe(true);
  });

  it('松手那一帧桥把借走的那一格还掉：不还就是"永远在蓄力"', () => {
    const r = rig();
    const code = bindingFor('spell1').code;
    for (let i = 0; i < 20; i++) {
      r.lt(1);
      r.step();
    }
    expect(r.keys[code]).toBe(true);
    r.lt(0);
    r.step();
    expect(r.keys[code]).toBeFalsy();
    expect(r.spells.chargeSlot).toBe(null);
  });
});

describe('表里那一格的声明要与消费方的判据同形', () => {
  it('蓄力类动作在手柄侧是 level：消费方要看到"按住"这几帧一直是真', () => {
    expect(GAMEPAD_BINDINGS.spell1.mode).toBe('level');
  });

  it('表里凡是法术那几格都是 level：蓄力是它们的共同判据', () => {
    const spellCells = Object.entries(GAMEPAD_BINDINGS)
      .filter(([, e]) => String(e.action).startsWith('spell'))
      .map(([name, e]) => [name, e.mode]);
    // 今天只有 LT 这一格法术在手柄上；哪天多出一格，这条门禁自动管到它
    expect(spellCells.length).toBeGreaterThan(0);
    expect(spellCells.filter(([, mode]) => mode !== 'level')).toEqual([]);
  });
});
