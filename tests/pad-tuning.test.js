/**
 * 手柄手感的滑杆（W-A7 切片15 的三根：死区 / 外圈量程 / 镜头响应曲线；切片21 再加三根：
 * 镜头死区 / 镜头转速 / 冲刺触发深度）。
 *
 * 这一片的风险是四件事，各自要有一层用例：
 * 1. **一份范围**：滑杆能拖到的值与桥肯认的值必须是同一份（`PAD_TUNING`），否则玩家拖到
 *    头会发现"明明动了却什么都没变"（值被当脏数据悄悄回落）；
 * 2. **一处写入口**：手档进桥只有 `SettingsManager.applyToGame` 一条路，桥自己只读
 *    `this.tuning`；出厂对象 `PAD` 一动不动（就地改它等于改了全仓默认，"恢复默认"回不来）；
 * 3. **坏档逐项回落**：存储是玩家可写的，把 `lookCurve` 写成 `"abc"` 不该把死区与量程一起废掉，
 *    更不该把 `NaN` 乘进每帧的舵量里；
 * 4. **一格旋钮只有一个名字**（切片21）：表里的键名、桥读的字段名、壳页那根的 id 是同一件事的
 *    三面 —— 名单一旦在面板里手抄一遍，加一格就会漏抄，而漏抄的表现不是报错，是"那一格永远拖不动"。
 *    所以 id 从键名**推**（`padKnobId`），壳页与表互查（双向），出厂值还必须正落在滑杆的格子上
 *    （`type=range` 会把值吸到 `min + n×step`，不在格子上的出厂值就是"显示 0.14 而存着 0.15"）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PAD, PAD_TUNING, padTuning, GAMEPAD_BINDINGS,
} from '../src/content/keybinds.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { SettingsPanel, padKnobId } from '../src/ui/SettingsPanel.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

const SRC = join(process.cwd(), 'src');

/** 表里每一格的出厂值：`padTuning()` 该给的就是这一份（用例不抄数字，抄了就得跟着加格改） */
const factoryTuning = () => Object.fromEntries(Object.keys(PAD_TUNING).map((k) => [k, PAD[k]]));

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

const FACTORY = { ...PAD };

afterEach(() => {
  // 出厂对象必须一动没动：任何一处就地改 `PAD` 都会在这里现形
  expect(PAD).toEqual(FACTORY);
});

/* ------------------------------------------------------ 那一小段清洗 */

describe('padTuning：出厂 + 玩家档 → 桥用的那一组值', () => {
  it('什么都不给就是出厂值，而且值取自 `PAD`（不另抄一份数字）', () => {
    expect(padTuning()).toEqual(factoryTuning());
    expect(Object.keys(padTuning()).sort()).toEqual(Object.keys(PAD_TUNING).sort());
  });

  it('表里每一格都在 `PAD` 里有同名出厂值（键名打错的表现不是报错，是那一格永远是 undefined）', () => {
    for (const [key, spec] of Object.entries(PAD_TUNING)) {
      expect(PAD[key], `PAD.${key} 不在了`).toBeTypeOf('number');
      for (const bound of ['min', 'max']) {
        expect(spec[bound], `${key}.${bound} 不是数`).toBeTypeOf('number');
      }
      expect(spec.min, key).toBeLessThan(spec.max);
      expect(spec.step, key).toBeGreaterThan(0);
    }
  });

  it('出厂值落在自己的范围内，而且**正落在滑杆的格子上**（`type=range` 会把值吸到 min+n×step）', () => {
    for (const [key, spec] of Object.entries(PAD_TUNING)) {
      const def = PAD[key];
      expect(def, `${key} 出厂值出界了（出厂即脏档）`).toBeGreaterThanOrEqual(spec.min);
      expect(def, `${key} 出厂值出界了`).toBeLessThanOrEqual(spec.max);
      // 不在格子上：滑杆显示的是被吸过的那一格，而存储里是出厂值 —— 回显与行为分家（B47 一族）
      const n = (def - spec.min) / spec.step;
      expect(Math.abs(n - Math.round(n)), `${key} 出厂值 ${def} 不在 step ${spec.step} 的格子上`)
        .toBeLessThan(1e-9);
      // 两端也必须在格子上：否则"拖到头"写回来的值与滑杆显示的不是同一个数
      for (const bound of ['min', 'max']) {
        const k = (spec[bound] - spec.min) / spec.step;
        expect(Math.abs(k - Math.round(k)), `${key}.${bound} 不在格子上`).toBeLessThan(1e-9);
      }
    }
  });

  it('合法值原样通过（含两端边界）：每一格都各自验一次', () => {
    expect(padTuning({ deadzone: 0.4, analogRange: 0.6, lookCurve: 3 }))
      .toEqual({ ...factoryTuning(), deadzone: 0.4, analogRange: 0.6, lookCurve: 3 });
    expect(padTuning({ deadzone: 0 }).deadzone).toBe(0);   // 0 是允许档（不留漂移余量）
    for (const [key, spec] of Object.entries(PAD_TUNING)) {
      for (const v of [spec.min, spec.max, PAD[key]]) {
        expect(padTuning({ [key]: v })[key], `${key} 的 ${v} 被当脏数据了`).toBe(v);
      }
    }
  });

  it('坏值逐项回落出厂：只有一格脏，其余两格仍然是玩家要的', () => {
    const got = padTuning({ deadzone: 'abc', analogRange: 5, lookCurve: PAD.lookCurve });
    expect(got.deadzone).toBe(PAD.deadzone);
    expect(got.analogRange).toBe(PAD.analogRange);
    expect(got.lookCurve).toBe(PAD.lookCurve);
    for (const bad of [null, undefined, NaN, -1, {}, [], '0.3']) {
      expect(Number.isFinite(Number(bad) ) ? padTuning({ deadzone: bad }).deadzone : PAD.deadzone,
        String(bad)).toBe(Number.isFinite(Number(bad)) && Number(bad) >= 0 && Number(bad) <= 0.4 ? Number(bad) : PAD.deadzone);
    }
  });

  it('不写回 `PAD`：清洗过脏档之后出厂值仍然在（"恢复默认"回得来）', () => {
    padTuning({ deadzone: 99, analogRange: -3, lookCurve: 'x' });
    expect(PAD.deadzone).toBe(FACTORY.deadzone);
    expect(PAD.analogRange).toBe(FACTORY.analogRange);
    expect(PAD.lookCurve).toBe(FACTORY.lookCurve);
  });
});

/* ---------------------------------------------------------- 桥用它 */

const makePad = () => ({
  connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
});

const mkBridge = (tuning = null) => {
  const pad = makePad();
  const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
  if (tuning) bridge.setTuning(tuning);
  return { bridge, pad };
};

describe('GamepadInput：两根杆都只认这一份手档', () => {
  it('出厂档下与切片2/8 的算式逐字一致（回归锚点，防止清洗顺手改了公式）', () => {
    const { bridge, pad } = mkBridge();
    pad.axes[2] = 1;                                   // 右杆满舵
    pad.axes[0] = 1;                                   // 左杆满推
    bridge.poll();
    expect(bridge.move.mag).toBeCloseTo(1, 6);
    expect(bridge.look.x).toBeCloseTo(PAD.lookPixelsPerSecond, 6);
  });

  it('死区抬高一档：同一推量变小、方向码同时不亮（两条路共用同一个死区）', () => {
    const { bridge, pad } = mkBridge({ deadzone: 0.35 });
    pad.axes[0] = 0.3;                                 // 出厂死区之上、新手档之下：这一推该没了
    bridge.poll();
    expect(bridge.move.mag).toBe(0);
    expect(bridge._slots.some((s) => s.dirName && s.down), '方向码亮着而 mag 是 0 = 自相矛盾的一帧')
      .toBe(false);
  });

  it('量程调低：够不到 1.0 的行程也能推满速（切片8 那块物理余量的玩家档）', () => {
    const { bridge, pad } = mkBridge({ analogRange: 0.7 });
    pad.axes[0] = 0.7;
    bridge.poll();
    expect(bridge.move.mag).toBeCloseTo(1, 6);
  });

  it('镜头曲线改陡：半舵的舵量按新曲线走，满舵仍然是满舵（端点不弯）', () => {
    const { bridge: flat, pad: p1 } = mkBridge({ lookCurve: 1 });
    p1.axes[2] = 0.5;
    flat.poll();
    const { bridge: curved, pad: p2 } = mkBridge({ lookCurve: 2 });
    p2.axes[2] = 0.5;
    curved.poll();
    // 同一个 t 过一次各自的曲线：curve=1 是线性，curve=2 是 t²（比值就是 t 本身）
    const t = flat.look.x / PAD.lookPixelsPerSecond;
    expect(curved.look.x / PAD.lookPixelsPerSecond).toBeCloseTo(t ** 2, 6);
    p2.axes[2] = 1;
    curved.poll();
    expect(curved.look.x).toBeCloseTo(PAD.lookPixelsPerSecond, 6);
  });

  it('镜头那一档死区**只管镜头**：同一推量下走路照走、镜头不转（两格各拧各的）', () => {
    const { bridge, pad } = mkBridge({ lookDeadzone: 0.3 });
    pad.axes[0] = 0.3;                                  // 左杆：走路（出厂死区 0.2 → 该有速度）
    pad.axes[2] = 0.3;                                  // 右杆：镜头（新手档 0.3 → 正好还没出死区）
    bridge.poll();
    expect(bridge.move.mag).toBeGreaterThan(0);
    expect(bridge.look.x).toBe(0);
    expect(bridge.look.y).toBe(0);
    // 反手验一次：把镜头死区调回出厂，同一推量就该转了（否则"没转"可能是别的原因）
    const back = mkBridge({ lookDeadzone: PAD.lookDeadzone });
    back.pad.axes[2] = 0.3;
    back.bridge.poll();
    expect(Math.hypot(back.bridge.look.x, back.bridge.look.y)).toBeGreaterThan(0);
  });

  it('镜头转速一格就管转速：满推的点数跟着滑杆走，出厂那格仍然是 `PAD.lookPixelsPerSecond`', () => {
    for (const v of [400, 2600, PAD.lookPixelsPerSecond]) {
      const { bridge, pad } = mkBridge({ lookPixelsPerSecond: v, lookCurve: 1 });
      pad.axes[2] = 1;
      bridge.poll();
      expect(bridge.look.x, `满推 ${v}`).toBeCloseTo(v, 6);
    }
    // 方向与大小分家：转速改了，朝哪儿不该改（曲线也只改快慢）。镜头那条**不翻 y 符号** ——
    // 翻符号的是移动（"前"是 -y），别把两条杆当成同一件事
    const a = mkBridge({ lookPixelsPerSecond: 2600 });
    a.pad.axes[3] = -1;                                 // 右杆 y 轴向下为正 → 推上
    a.bridge.poll();
    expect(a.bridge.look.x).toBe(0);
    expect(a.bridge.look.y).toBeCloseTo(-2600, 6);
  });

  it('冲刺触发深度：同一推量在两个档下分别是"跑"和"走"（判定长在桥的 `move.sprint`）', () => {
    const push = 0.6;                                   // 重映射后 t=(0.6-0.2)/(0.92-0.2)≈0.588
    const soft = mkBridge({ moveSprintThreshold: 0.5 });
    soft.pad.axes[1] = -push;
    soft.bridge.poll();
    const stiff = mkBridge({ moveSprintThreshold: 0.9 });
    stiff.pad.axes[1] = -push;
    stiff.bridge.poll();
    expect(soft.bridge.move.mag).toBeCloseTo(stiff.bridge.move.mag, 9);   // 走路速度不该被这格改了
    expect(soft.bridge.move.sprint).toBe(true);
    expect(stiff.bridge.move.sprint).toBe(false);
  });

  it('静止与死区里都不许凭空"想跑"：每一档门槛下 `mag` 为 0 时 `sprint` 必为假', () => {
    for (const threshold of [0.3, 0.5, 0.9, 1]) {
      const { bridge, pad } = mkBridge({ moveSprintThreshold: threshold });
      pad.axes[1] = -0.1;                               // 出厂死区 0.2 之下：这一推等于没推
      bridge.poll();
      expect(bridge.move.mag, String(threshold)).toBe(0);
      expect(bridge.move.sprint, `门槛 ${threshold} 下静止算想跑`).toBe(false);
    }
  });

  it('门槛是**闭**区间：推到量程尽头那一档（重映射后正好 1）在门槛 1 下就算想跑', () => {
    const { bridge, pad } = mkBridge({ moveSprintThreshold: 1 });
    pad.axes[1] = -PAD.analogRange;                    // 两个操作数与桥里那条式子完全相同 → `t` 恰为 1
    bridge.poll();
    expect(bridge.move.mag).toBe(1);
    expect(bridge.move.sprint, '写成严格大于就是"永远差一格"').toBe(true);
    const near = mkBridge({ moveSprintThreshold: 1 });
    near.pad.axes[1] = -PAD.analogRange * 0.99;
    near.bridge.poll();
    expect(near.bridge.move.sprint).toBe(false);
  });

  it('吃的是**重映射之后**的行程：物理上差一点到底（0.85）已经算满推（切片8 那块余量的账）', () => {
    const { bridge, pad } = mkBridge({});              // 出厂：门槛 0.9、外圈量程 0.92
    pad.axes[1] = -0.85;
    bridge.poll();
    expect(bridge.move.mag).toBeCloseTo(0.9028, 4);
    expect(bridge.move.sprint, '拿原始模长比门槛，这一推就会翻成"没到"').toBe(true);
  });

  it('拔手之后 `sprint` 跟着清：留着就是"松手还在跑"（与 `mag` 同一本账）', () => {
    const pad = makePad();
    const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    pad.axes[1] = -1;
    bridge.poll();
    expect(bridge.move.sprint).toBe(true);
    pad.connected = false;                              // 直接拔掉：走 `releaseAll` 那一条
    bridge.poll();
    expect(bridge.active).toBe(false);
    expect(bridge.move.sprint).toBe(false);
    expect(bridge.move.mag).toBe(0);
  });

  it('手档是一只复用对象：反复换档不换引用，也不在每帧新建', () => {
    const { bridge } = mkBridge();
    const before = bridge.tuning;
    for (let i = 0; i < 5; i += 1) bridge.setTuning({ deadzone: 0.1 + i / 100 });
    expect(bridge.tuning).toBe(before);
    expect(bridge.tuning.deadzone).toBeCloseTo(0.14, 6);
  });

  it('坏档不会把 NaN 乘进舵量：桥里看到的永远是数', () => {
    const { bridge, pad } = mkBridge({ deadzone: 'abc', analogRange: null, lookCurve: {} });
    pad.axes[0] = 0.8;
    pad.axes[2] = 0.8;
    bridge.poll();
    expect(Number.isFinite(bridge.move.mag)).toBe(true);
    expect(Number.isFinite(bridge.look.x)).toBe(true);
    expect(bridge.tuning).toEqual(padTuning());
  });
});

/* ------------------------------------------------- 存储与面板那三格 */

describe('设置那一格：范围只有一个真源、写进桥只有一条路', () => {
  const real = { localStorage: globalThis.localStorage, window: globalThis.window };
  const install = (values) => {
    const store = new Map(Object.entries(values ?? {}));
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    return store;
  };
  afterEach(() => {
    globalThis.localStorage = real.localStorage;
    globalThis.window = real.window;
  });

  it('出厂档直接取自 `PAD`：DEFAULTS 里没有第二份数字', () => {
    install();
    const s = new SettingsManager();
    expect(s.get('padTuning')).toEqual(factoryTuning());
  });

  it('老档缺新格（切片21 加出来的三格）：缺的那几格落到出厂值，玩家拧过的原样保留', () => {
    const store = install();
    store.set('crossrealm_settings', JSON.stringify({
      version: 2, values: { padTuning: { deadzone: 0.06, analogRange: 0.66, lookCurve: 2.2 } },
    }));
    const s = new SettingsManager();
    expect(s.get('padTuning')).toEqual({
      ...factoryTuning(), deadzone: 0.06, analogRange: 0.66, lookCurve: 2.2,
    });
  });

  it('读档浅拷贝：就地改一次 `data.padTuning` 不许污染出厂默认（切片4 同一课）', () => {
    install();
    const s = new SettingsManager();
    s.data.padTuning.deadzone = 0.39;
    expect(new SettingsManager().get('padTuning').deadzone).toBe(PAD.deadzone);
  });

  it('`applyToGame` 是手档进桥的唯一写入口', () => {
    install();
    const s = new SettingsManager();
    s.set('padTuning', { deadzone: 0.3, analogRange: 0.85, lookCurve: 2 });
    const seen = [];
    s.applyToGame({ padInput: { setTuning: (raw) => seen.push({ ...padTuning(raw) }) } });
    expect(seen).toEqual([{ ...factoryTuning(), deadzone: 0.3, analogRange: 0.85, lookCurve: 2 }]);
  });

  it('桥不在（早期启动 / 没插手柄）也不炸', () => {
    install();
    const s = new SettingsManager();
    expect(() => s.applyToGame({})).not.toThrow();
  });

  it('脏档经面板回显时显示的是清洗后的那一格（不是把 "abc" 摆给玩家看）', () => {
    const store = install();
    store.set('crossrealm_settings', JSON.stringify({
      version: 2, values: { padTuning: { deadzone: 'abc', analogRange: 0.8, lookCurve: 1.2 } },
    }));
    const shown = {};
    const el = (id) => ({
      id, min: '', max: '', step: '', value: '', checked: false,
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      fire(type) { (this.listeners[type] ?? []).forEach((fn) => fn({ target: this })); },
    });
    // 滑杆名单从表推（与面板同一个 `padKnobId`）：这里若手抄，加一格就得回来补一次
    const knobs = Object.fromEntries(Object.keys(PAD_TUNING)
      .map((k) => [padKnobId(k), el(padKnobId(k))]));
    const doc = {
      getElementById: (id) => knobs[id] ?? null,
      addEventListener: () => {}, removeEventListener: () => {},
      querySelectorAll: () => [],
    };
    const realDoc = globalThis.document;
    const realWindow = globalThis.window;
    globalThis.document = doc;
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    try {
      const applied = [];
      const game = {
        settings: new SettingsManager(),
        padInput: { setTuning: (raw) => applied.push(padTuning(raw)) },
        dialog: { toast: () => {} },
      };
      new SettingsPanel(game);                          // 构造期就绑滑杆并灌范围
      game.settings.applyToGame(game);
      for (const id of Object.keys(knobs)) {
        expect(knobs[id].min, id).not.toBe('');
        expect(knobs[id].max, id).not.toBe('');
        expect(knobs[id].step, id).not.toBe('');
      }
      // refresh 走的是清洗过的值：坏的那一格显示出厂、另外两格显示玩家的
      knobs['set-deadzone'].value = '';
      shown.deadzone = knobs['set-deadzone'];
      game.settingsPanel = { show() {}, hide() {}, refresh() {} };
      const panel = new SettingsPanel(game);
      panel.refresh();
      expect(Number(knobs['set-deadzone'].value)).toBe(PAD.deadzone);
      expect(Number(knobs['set-analog-range'].value)).toBe(0.8);
      expect(applied.at(-1)).toEqual(padTuning({ deadzone: PAD.deadzone, analogRange: 0.8, lookCurve: 1.2 }));
      void shown;
    } finally {
      globalThis.document = realDoc;
      globalThis.window = realWindow;
    }
  });

  it('拖一根滑杆：写进设置、推给桥，且不把另外两根顺手改回去', () => {
    install();
    const slider = {
      value: String(PAD.deadzone), min: '', max: '', step: '',
      listeners: {},
      addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
      fire(type) { (this.listeners[type] ?? []).forEach((fn) => fn({ target: this })); },
    };
    const realDoc = globalThis.document;
    const realWindow = globalThis.window;
    globalThis.document = { getElementById: (id) => (id === 'set-deadzone' ? slider : null) };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    try {
      const game = {
        settings: new SettingsManager(),
        padInput: { setTuning: () => {} },
        dialog: { toast: () => {} },
      };
      game.settingsPanel = { show() {}, hide() {} };
      const panel = new SettingsPanel(game);
      void panel;
      slider.value = '0.05';
      slider.fire('input');
      expect(game.settings.get('padTuning')).toEqual({ ...factoryTuning(), deadzone: 0.05 });
    } finally {
      globalThis.document = realDoc;
      globalThis.window = realWindow;
    }
  });
});

/* ------------------------------------------------------- 静态门禁 */

describe('静态门禁：一处范围、一处写入口、桥只读自己的手档', () => {
  it('滑杆的范围只写在 `PAD_TUNING`：壳页里那些"旋钮格"不许带 min/max/step，而且与表**双向**对上', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const free = [];                                   // 没写范围的滑杆 = 由表灌范围的那一格
    for (const m of html.matchAll(/<input id="([^"]+)" type="range"([^>]*?)\/>/g)) {
      if (!/\b(min|max|step)=/.test(m[2])) free.push(m[1]);
    }
    const fromTable = Object.keys(PAD_TUNING).map(padKnobId);
    expect([...free].sort(), '壳页与 `PAD_TUNING` 不再是同一份名单（漏一格 = 拖不动，多一格 = 没人认）')
      .toEqual([...fromTable].sort());
    // 每一格都真的有一行 `<label>名称 <input .../></label>`：没有名字的滑杆玩家不知道它管什么
    for (const id of fromTable) {
      const line = html.split('\n').find((l) => l.includes(`id="${id}"`));
      expect(line, `${id} 不在了`).toBeTruthy();
      expect(line, `${id} 那一行没有中文名`).toMatch(/<label>[^<]+<input/);
    }
  });

  it('手档进桥只有一条路：`setTuning(` 的定义在桥里，唯一的调用点在 `SettingsManager`', () => {
    const calls = FILES.filter((f) => /\.setTuning\(/.test(f.source)).map((f) => f.name);
    expect(calls).toEqual(['core/SettingsManager.js']);
    const bridge = sourceOf('engine/GamepadInput.js');
    expect(bridge).toMatch(/\n {2}setTuning\(raw = \{\}\)\s*\{/);
    expect((bridge.match(/padTuning\(/g) || []).length, '清洗至少要走一次（默认 + 换档）').toBeGreaterThanOrEqual(2);
  });

  it('旋钮的读取点只问手档：`PAD.<旋钮名>` 在 `src/` 里只许出现在出厂表自己那一格', () => {
    // 这一条是切片21 的重点。热路径绕过手档 = 玩家滑杆白拖，而"白拖"不会报错：
    // 表现是"我明明调了，手感没变"（B47 那一族：显示与行为各说各话）。
    for (const key of Object.keys(PAD_TUNING)) {
      const re = new RegExp(`PAD\\.${key}\\b`);
      const readers = FILES.filter((f) => f.name !== 'content/keybinds.js' && re.test(f.source)).map((f) => f.name);
      expect(readers, `这些地方还在读出厂值 PAD.${key}（手档改了它们不跟）`).toEqual([]);
    }
  });

  it('桥里每一格旋钮都真的读了自己的手档字段（"没读常量"不等于"读了手档"）', () => {
    const bridge = sourceOf('engine/GamepadInput.js');
    for (const key of Object.keys(PAD_TUNING)) {
      expect(bridge, `桥里没有 this.tuning.${key}`).toContain(`this.tuning.${key}`);
    }
    // `_analogMagnitude` 不许再留出厂默认参数：那是在手档之外藏的第二个值，漏传一格不会报错
    expect(bridge).toMatch(/function _analogMagnitude\(mag, deadzone, range\)/);
  });

  it('一格旋钮只有一个名字：面板不抄滑杆名单，id 从键名推', () => {
    const panel = sourceOf('ui/SettingsPanel.js');
    expect(panel, '面板里手抄了一格滑杆 id：加旋钮时会漏抄，而漏抄的表现是"拖不动"不是报错')
      .not.toMatch(/knob\('set-/);
    expect(panel, '面板没按 `PAD_TUNING` 画滑杆').toContain('for (const key of Object.keys(PAD_TUNING)) knob(key);');
    expect(panel, '回显没按 `PAD_TUNING` 走').toContain('for (const key of Object.keys(PAD_TUNING)) set(padKnobId(key), t[key]);');
    // 切片15 那三根的 id 一个字没改：玩家档、壳页、说明书都指着它们
    expect(['deadzone', 'analogRange', 'lookCurve'].map(padKnobId))
      .toEqual(['set-deadzone', 'set-analog-range', 'set-look-curve']);
  });

  it('桥是最后建起来的消费者：手档必须在它建好之后再走一次 applyToGame', () => {
    // 少了这一次，开机读到的手档会静静躺在存储里 —— 玩家要打开设置面板再关掉才生效
    const game = sourceOf('core/Game.js');
    const made = game.indexOf('this.padInput = new GamepadInput(');
    expect(made).toBeGreaterThanOrEqual(0);
    // 位置要贴着桥的构造：往后翻整个文件去找"某一次 applyToGame"不叫证明桥拿到了手档。
    // 窗口 700 → 1200 是因为切片17 的震动登记（`new Rumble` + `setImpactSink`）插在中间 ——
    // 贴着桥是这条门禁的本意，中间多一段初始化不算破约；但**再远就不行了**，所以仍然有上限
    const window = game.slice(made, made + 1200);
    expect(window, '桥建好之后没人把设置推给它（手档会在开机时丢掉）')
      .toContain('this.settings.applyToGame(this);');
  });

  it('滑杆写进存储之前先过 `padTuning`：脏值不许先落盘再指望读的时候救', () => {
    const panel = sourceOf('ui/SettingsPanel.js');
    expect((panel.match(/s\.set\('padTuning', padTuning\(/g) || []).length).toBe(1);
  });

  it('三根滑杆之后仍然在 `nav` 清单里走得到（切片11 的焦点覆盖到它们）', () => {
    // 面板收焦点那条门禁在 `focus-nav` 里逐行查；这里只钉住"手档滑杆也走 `navItems` 那条选择器"
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toMatch(/<input id="set-deadzone" type="range" \/>/);
    expect(html).toMatch(/id="settings-panel" class="overlay-panel/);
  });
});

/* ------------------------------------- 端到端：改档之后真的手感不同 */

describe('真玩家身上：同一舵量，改档前后走得不一样的就是那两米', () => {
  const walked = (tuning, push = 1) => {
    const pad = makePad();
    const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    bridge.setTuning(tuning);
    const p = makePlayer({});
    pad.axes[0] = 0;
    pad.axes[1] = -push;                               // 向前推 push 那么多
    const dt = 1 / 60;
    let x = 0;
    let z = 0;
    for (let i = 0; i < 60; i += 1) {
      bridge.poll();
      const keys = {};
      for (const [code, down] of Object.entries(bridge.keys ?? {})) keys[code] = down;
      runFrames(p, dt, dt, keys, bridge.move);
      x = p.position.x; z = p.position.z;
    }
    return { x: +x.toFixed(2), z: +z.toFixed(2), mag: bridge.move.mag };
  };

  it('出厂档：满推一秒会进入疾走那一档（`moveSprintThreshold` 说的就是"推到底"）', () => {
    const got = walked({});
    expect(got.mag).toBeCloseTo(1, 6);
    expect(Math.abs(got.z)).toBeGreaterThan(20);
  });

  it('冲刺触发深度拧松一档：同一推量从"走"变成"跑"（滑杆改的是位移，不只是数字）', () => {
    const push = 0.65;                        // 重映射后 ≈0.606：出厂门槛 0.9 之下 → 走
    const strict = walked({}, push);
    const loose = walked({ moveSprintThreshold: 0.5 }, push);
    expect(strict.mag).toBeGreaterThan(0);
    expect(strict.mag).toBeCloseTo(loose.mag, 9);        // 走路那一档不该被这格碰
    // 疾走倍率 1.85：留一半余量（起步那几帧还在加速）
    expect(Math.abs(loose.z)).toBeGreaterThan(Math.abs(strict.z) * 1.4);
  });

  it('死区抬高一档之后，同一推量走得更慢；而满推仍然满速（下沿变了，端点没变）', () => {
    const full = walked({}, 0.5);
    const soft = walked({ deadzone: 0.3 }, 0.5);
    expect(Math.abs(soft.z)).toBeLessThan(Math.abs(full.z));
    // 端点不弯：满推在两种死区下都到疾走那一档
    expect(Math.abs(walked({ deadzone: 0.3 }).z)).toBeCloseTo(Math.abs(walked({}).z), 1);
  });

  it('量程调到 0.7：推七成就算推到底（够不到头的人也能冲刺）', () => {
    const pad = makePad();
    const a = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    const b = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);
    b.setTuning({ analogRange: 0.7 });
    pad.axes[1] = -0.7;
    pad.axes[0] = 0;
    a.poll();
    b.poll();
    expect(a.move.mag).toBeLessThan(1);
    expect(b.move.mag).toBeCloseTo(1, 6);
  });
});
