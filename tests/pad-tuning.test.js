/**
 * 手柄手感的三根滑杆（W-A7 切片15：死区 / 外圈量程 / 镜头响应曲线）。
 *
 * 这一片的风险是三件事，各自要有一层用例：
 * 1. **一份范围**：滑杆能拖到的值与桥肯认的值必须是同一份（`PAD_TUNING`），否则玩家拖到
 *    头会发现"明明动了却什么都没变"（值被当脏数据悄悄回落）；
 * 2. **一处写入口**：手档进桥只有 `SettingsManager.applyToGame` 一条路，桥自己只读
 *    `this.tuning`；出厂对象 `PAD` 一动不动（就地改它等于改了全仓默认，"恢复默认"回不来）；
 * 3. **坏档逐项回落**：存储是玩家可写的，把 `lookCurve` 写成 `"abc"` 不该把死区与量程一起废掉，
 *    更不该把 `NaN` 乘进每帧的舵量里。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  PAD, PAD_TUNING, padTuning, GAMEPAD_BINDINGS,
} from '../src/content/keybinds.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

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

const FACTORY = { ...PAD };

afterEach(() => {
  // 出厂对象必须一动没动：任何一处就地改 `PAD` 都会在这里现形
  expect(PAD).toEqual(FACTORY);
});

/* ------------------------------------------------------ 那一小段清洗 */

describe('padTuning：出厂 + 玩家档 → 桥用的那一组值', () => {
  it('什么都不给就是出厂值，而且值取自 `PAD`（不另抄一份数字）', () => {
    expect(padTuning()).toEqual({
      deadzone: PAD.deadzone, analogRange: PAD.analogRange, lookCurve: PAD.lookCurve,
    });
    expect(Object.keys(padTuning()).sort()).toEqual(Object.keys(PAD_TUNING).sort());
  });

  it('合法值原样通过（含两端边界）', () => {
    expect(padTuning({ deadzone: 0.4, analogRange: 0.6, lookCurve: 3 }))
      .toEqual({ deadzone: 0.4, analogRange: 0.6, lookCurve: 3 });
    expect(padTuning({ deadzone: 0 }).deadzone).toBe(0);   // 0 是允许档（不留漂移余量）
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
    expect(s.get('padTuning')).toEqual({
      deadzone: PAD.deadzone, analogRange: PAD.analogRange, lookCurve: PAD.lookCurve,
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
    expect(seen).toEqual([{ deadzone: 0.3, analogRange: 0.85, lookCurve: 2 }]);
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
    const knobs = { 'set-deadzone': el('set-deadzone'), 'set-analog-range': el('set-analog-range'), 'set-look-curve': el('set-look-curve') };
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
      expect(game.settings.get('padTuning')).toEqual({
        deadzone: 0.05, analogRange: PAD.analogRange, lookCurve: PAD.lookCurve,
      });
    } finally {
      globalThis.document = realDoc;
      globalThis.window = realWindow;
    }
  });
});

/* ------------------------------------------------------- 静态门禁 */

describe('静态门禁：一处范围、一处写入口、桥只读自己的手档', () => {
  it('滑杆的范围只写在 `PAD_TUNING`：壳页里那三行不许带 min/max/step', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    for (const id of ['set-deadzone', 'set-analog-range', 'set-look-curve']) {
      const line = html.split('\n').find((l) => l.includes(`id="${id}"`));
      expect(line, `${id} 不在了`).toBeTruthy();
      expect(line, '范围被抄进壳页：与 `PAD_TUNING` 就是两份').not.toMatch(/\b(min|max|step)=/);
    }
  });

  it('手档进桥只有一条路：`setTuning(` 的定义在桥里，唯一的调用点在 `SettingsManager`', () => {
    const calls = FILES.filter((f) => /\.setTuning\(/.test(f.source)).map((f) => f.name);
    expect(calls).toEqual(['core/SettingsManager.js']);
    const bridge = sourceOf('engine/GamepadInput.js');
    expect(bridge).toMatch(/\n {2}setTuning\(raw = \{\}\)\s*\{/);
    expect((bridge.match(/padTuning\(/g) || []).length, '清洗至少要走一次（默认 + 换档）').toBeGreaterThanOrEqual(2);
  });

  it('桥里不许再直接读那三个出厂常量（热路径绕过手档 = 滑杆白拖）', () => {
    const bridge = sourceOf('engine/GamepadInput.js');
    for (const key of ['deadzone', 'analogRange', 'lookCurve']) {
      const direct = [...bridge.matchAll(new RegExp(`PAD\\.${key}`, 'g'))]
        // 参数默认值（`deadzone = PAD.deadzone`）留着：单元调用与桥内默认仍要有一个值
        .filter((m) => !/[,(]\s*deadzone = |range = PAD\.|, s, deadzone = /.test(bridge.slice(Math.max(0, m.index - 24), m.index + 24)));
      expect(direct.map((m) => bridge.slice(m.index, m.index + 24)), `桥里直接读了 PAD.${key}`).toEqual([]);
      expect(bridge).toContain(`this.tuning.${key}`);
    }
  });

  it(`\`PAD_TUNING\` 的每一格都有滑杆接着（登记了却没人画 = 玩家调不到）`, () => {
    const panel = sourceOf('ui/SettingsPanel.js');
    for (const key of Object.keys(PAD_TUNING)) {
      expect(panel, `滑杆没接 ${key}`).toContain(`knob('set-`);
      expect(panel.match(new RegExp(`knob\\('set-[a-z-]+', '${key}'\\)`)), key).toBeTruthy();
    }
  });

  it('桥是最后建起来的消费者：手档必须在它建好之后再走一次 applyToGame', () => {
    // 少了这一次，开机读到的手档会静静躺在存储里 —— 玩家要打开设置面板再关掉才生效
    const game = sourceOf('core/Game.js');
    const made = game.indexOf('this.padInput = new GamepadInput(');
    expect(made).toBeGreaterThanOrEqual(0);
    // 位置要贴着桥的构造：往后翻整个文件去找"某一次 applyToGame"不叫证明桥拿到了手档
    const window = game.slice(made, made + 700);
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
