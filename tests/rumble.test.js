/**
 * 手柄震动（W-A7 切片17）—— 桥的第四类出口，加上"没有致动器时安静降级"那三条路。
 *
 * 这一片的风险是三件事，各自要有一层用例：
 * 1. **一个决定**：各系统照旧只调 `addShake(intensity)`，马达吃的是**同一条**强度。
 *    若调用点旁边还能写第二份马达数字，"这一击多重"就又分家（B36 那一族）—— 所以调用点是扫出来的。
 * 2. **一次合并**：`GamepadHapticActuator.playEffect` 没有叠加，它**替换**当前那次震动。
 *    所以"一帧里几下"必须合成一次下令，而"正在跑的那次更强"时新的弱请求干脆不许发出去 ——
 *    否则症状从"没叠够"变成"震到一半没了"（连招里天天发生）。
 * 3. **降级是常态**：多数网页手柄根本没有致动器，少数有但不支持 `dual-rumble`，
 *    拔掉的那一刻 `playEffect` 还会 reject。三条都只能得到一个 `false`：不抛、不重试、
 *    不留下未处理的 Promise 拒绝（那会让整个测试文件莫名变红，切片前的夹具就为它补过一次）。
 *
 * 桩的纪律沿用切片11 那一课（`tests/helpers/fakePanelDom.js` 的来路）：假手柄的 `playEffect`
 * **必须录参数**，而且录的是**当场抄下来的值** —— 桥交出去的是复用槽，留着引用就等于什么都没记。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RUMBLE } from '../src/content/tuning.js';
import { Rumble, rumbleBandFor, assertRumbleBands } from '../src/engine/Rumble.js';
import { Shake } from '../src/engine/Shake.js';
import { GamepadInput } from '../src/engine/GamepadInput.js';
import { GAMEPAD_BINDINGS } from '../src/content/keybinds.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';

/** 出厂档位表的快照（不是第二份数字：抄一份字面量进来，这片自己要防的错就长在测试里了） */
const FACTORY_BANDS = RUMBLE.bands.map((b) => [b.at, b.strong, b.weak, b.ms]);

const SRC = join(process.cwd(), 'src');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.js$/.test(n) ? [full] : [];
});

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const FILES = walk(SRC).map((f) => {
  const source = readFileSync(f, 'utf8');
  return {
    name: f.slice(SRC.length + 1).replace(/\\/g, '/'),
    source,
    /* 扫"谁在代码里干了这件事"必须先剥注释：这一片的注释恰好在讲 `playEffect` 与
     * `navigator.getGamepads`，不剥就会把"解释得最清楚的那两个文件"当成嫌疑人报出来。 */
    code: stripComments(source),
  };
});

const sourceOf = (name) => {
  const found = FILES.find((f) => f.name === name);
  expect(found, `${name} 不在了`).toBeTruthy();
  return found.source;
};

/* ------------------------------------------------------- 假手柄与假致动器 */

/**
 * 一只带致动器的手柄。`log` 每项是**当场抄下来的**那一次命令 —— 桥给的槽是复用的，
 * 原样存引用会让"三次命令"看起来是同一个对象，测试就再也分不清合并与截断。
 */
function fakePad({ actuator = true, playEffect = true } = {}) {
  const pad = {
    connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    log: [],
  };
  if (actuator) {
    pad.vibrationActuator = { type: 'dual-rumble', effects: [] };
    if (playEffect) {
      pad.vibrationActuator.playEffect = (shape, options) => {
        pad.log.push({ shape, ...options });
        pad.vibrationActuator.effects.push(shape);
        return Promise.resolve('supported');
      };
    }
  }
  return pad;
}

const mkBridge = (pad) => new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [pad]);

/** 一条完整链路：震屏（唯一请求入口）→ Rumble（合并）→ 桥（设备） */
function mkChain(padSpec) {
  const pad = fakePad(padSpec);
  const bridge = mkBridge(pad);
  const shake = new Shake();
  const rumble = new Rumble((pulse) => bridge.vibrate(pulse));
  shake.setImpactSink((intensity) => rumble.request(intensity));
  return { pad, bridge, shake, rumble };
}

/* ------------------------------------------------------------- 档位表 */

describe('RUMBLE 档位表：一次决定"多重"，映射只有一处', () => {
  it('出厂表过自检，最后一行是兜底档', () => {
    expect(() => assertRumbleBands()).not.toThrow();
    expect(RUMBLE.bands.at(-1).at).toBe(null);
  });

  it('单调：从 0.01 推到 0.4，三格都不许回头（越轻越猛就是真回归）', () => {
    let prev = null;
    for (let i = 1; i <= 40; i += 1) {
      const b = rumbleBandFor(i / 100);
      if (prev) {
        expect(b.strong >= prev.strong, `strong 在 ${i / 100} 处回头`).toBe(true);
        expect(b.weak >= prev.weak, `weak 在 ${i / 100} 处回头`).toBe(true);
        expect(b.ms >= prev.ms, `ms 在 ${i / 100} 处回头`).toBe(true);
      }
      prev = b;
    }
  });

  it('档位边界：≤0.05 落第一档，略过一点落第二档，0.35 落兜底那一档', () => {
    expect(rumbleBandFor(0.03)).toBe(RUMBLE.bands[0]);
    expect(rumbleBandFor(0.05)).toBe(RUMBLE.bands[0]);
    expect(rumbleBandFor(0.06)).toBe(RUMBLE.bands[1]);
    expect(rumbleBandFor(0.35)).toBe(RUMBLE.bands.at(-1));
    expect(rumbleBandFor(9)).toBe(RUMBLE.bands.at(-1));   // 兜底档真的兜住（数值只会来自 `Shake.add`）
  });

  it('自检真的会拒绝回头档、缺兜底档与非数值的幅度', () => {
    const ok = RUMBLE.bands[0];
    expect(() => assertRumbleBands([{ ...ok, at: 0.05 }, { ...ok, at: null, strong: 0.01 }])).toThrow(/不许回头/);
    expect(() => assertRumbleBands([{ ...ok, at: 0.05 }])).toThrow(/兜底/);
    expect(() => assertRumbleBands([{ ...ok, at: null, ms: 'long' }])).toThrow(/非负数/);
    expect(() => assertRumbleBands([])).toThrow(/非空数组/);
  });
});

/* ------------------------------------------------- 合并：一帧几下只下一次令 */

describe('Rumble：请求先攒进本帧，帧末合成一次下令', () => {
  it('一帧两下（轻击 + 蓄力）→ 一次下令，取最大的那两格', () => {
    const sent = [];
    const r = new Rumble((p) => { sent.push({ ...p }); return true; });
    r.request(0.03);
    r.request(0.35);
    expect(r.update(1 / 60)).toBe(true);
    expect(sent).toEqual([{
      strong: RUMBLE.bands.at(-1).strong, weak: RUMBLE.bands.at(-1).weak, ms: RUMBLE.bands.at(-1).ms,
    }]);
    expect(r.pulses).toBe(1);
  });

  it('没有请求的那一帧：一次都不下令（不靠"发个 0 幅度"占位）', () => {
    let calls = 0;
    const r = new Rumble(() => { calls += 1; return true; });
    expect(r.update(1 / 60)).toBe(false);
    expect(calls).toBe(0);
  });

  it('下令用的是复用槽：连续两次不换引用，值当场被读走', () => {
    const seen = [];
    const r = new Rumble((p) => { seen.push(p); return true; });
    r.request(0.03);
    r.update(1 / 60);
    r.request(0.35);
    r.update(1 / 60);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);                       // 同一只槽
    expect(seen[0]).toBe(r.pulse);
  });

  it('跑着的那次更强也更久 → 新的弱请求被吞掉（否则就是它把重的那下砍短）', () => {
    let calls = 0;
    const r = new Rumble(() => { calls += 1; return true; });
    r.request(0.35);
    r.update(1 / 60);
    expect(calls).toBe(1);
    r.request(0.03);
    expect(r.update(1 / 60)).toBe(false);
    expect(calls).toBe(1);
    expect(r.dropped).toBe(1);
    // 但剩下的时长还在走：过了那一档的时间之后，同一请求就该发出去了
    r.request(0.03);
    for (let i = 0; i < 12; i += 1) r.update(1 / 60);    // 170ms 已经跑完
    r.request(0.03);
    expect(r.update(1 / 60)).toBe(true);
    expect(calls).toBe(2);
  });

  it('新的更响但更短 → 幅度取两者里更大的、时长不许把正在跑的截断', () => {
    /* 出厂表是单调的（越响越久），所以"更响但更短"这一格只能自己造一张表来演：
     * 这里验的是合并那条算式（两边取 max），不是档位。 */
    const cfg = {
      bands: [
        { at: 0.05, strong: 0.2, weak: 0.1, ms: 60 },
        { at: null, strong: 0.9, weak: 0.5, ms: 40 },
      ],
    };
    const sent = [];
    const r = new Rumble((p) => { sent.push({ ...p }); return true; }, cfg);
    r.request(0.05);                                     // 弱而长：0.2 / 60ms
    r.update(1 / 60);
    r.request(0.35);                                     // 响而短：40ms 装不下剩下的 ~43ms
    r.update(1 / 60);
    expect(sent).toHaveLength(2);
    expect(sent[1].strong).toBe(0.9);
    expect(sent[1].weak).toBe(0.5);
    expect(sent[1].ms).toBeGreaterThan(40);
    expect(sent[1].ms).toBeLessThanOrEqual(60);
  });

  it('同一档连下两下（连招）：第二下把时长续满，不是"只补剩下的那一截"', () => {
    const loudest = RUMBLE.bands.at(-1);
    const sent = [];
    const r = new Rumble((p) => { sent.push({ ...p }); return true; });
    r.request(0.35);
    r.update(1 / 60);
    for (let i = 0; i < 5; i += 1) r.update(1 / 60);     // 空跑 5 帧：马达还在转，没人下单
    r.request(0.35);
    r.update(1 / 60);
    expect(sent).toHaveLength(2);
    expect(sent[1].ms).toBe(loudest.ms);
    expect(sent[1].strong).toBe(loudest.strong);
  });

  it('一帧两下、顺序倒过来（先最响再最轻）：响的那一档说了算，"谁最后来的"不作数', () => {
    /* 与上面那条"轻击 + 蓄力"成对：只测升序，就等于没测合并 —— 谁最后谁赢的写法在升序里
     * 与取最大值逐字同形（变异验证 M4 第一次就是这么溜过去的）。 */
    const sent = [];
    const r = new Rumble((p) => { sent.push({ ...p }); return true; });
    r.request(0.35);
    r.request(0.03);
    expect(r.update(1 / 60)).toBe(true);
    const loudest = RUMBLE.bands.at(-1);
    expect(sent).toEqual([{ strong: loudest.strong, weak: loudest.weak, ms: loudest.ms }]);
  });

  it('马达快跑完时来了一记轻的：幅度仍并入正在跑的那次（马达不许从满舵掉回轻击）', () => {
    /* 这一次不能看档位、要看 `held`：出厂表越响也越久，所以"弱而不被盖过"只能出现在
     * 长时间已经跑得差不多的那一刻 —— 也正是连招收尾那一下的真实形状。 */
    const sent = [];
    const r = new Rumble((p) => { sent.push({ ...p }); return true; });
    const loudest = RUMBLE.bands.at(-1);
    const lightest = RUMBLE.bands[0];
    r.request(0.35);
    expect(r.update(1 / 60)).toBe(true);
    for (let i = 0; i < 8; i += 1) r.update(1 / 60);      // 170ms 跑到只剩约 37ms
    r.request(0.03);                                     // 55ms 装不进剩下的那一段 → 不算被盖过
    expect(r.update(1 / 60)).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[1].strong).toBe(loudest.strong);
    expect(sent[1].weak).toBe(loudest.weak);
    expect(sent[1].ms).toBe(lightest.ms);                // 时长取更长的那一边
  });

  it('非法强度不进账：0 / 负数 / NaN 只算被挡下，不脏了合并槽', () => {
    let calls = 0;
    const r = new Rumble(() => { calls += 1; return true; });
    for (const bad of [0, -1, NaN, undefined, 'x']) expect(r.request(bad)).toBe(false);
    expect(r.update(1 / 60)).toBe(false);
    expect(calls).toBe(0);
    r.request(0.06);
    expect(r.update(1 / 60)).toBe(true);
    expect(calls).toBe(1);
  });
});

/* -------------------------------------------------- 开关：关掉就不该震到手 */

describe('`vibration` 开关：唯一写点是 `SettingsManager.applyToGame`', () => {
  it('关掉之后连攒都不攒：本帧漏进来的那一次也不会在下一帧冒出去', () => {
    let calls = 0;
    const r = new Rumble(() => { calls += 1; return true; });
    r.request(0.35);                                     // 开着时先攒一次
    r.enabled = false;
    expect(r.update(1 / 60)).toBe(false);
    expect(r.request(0.35)).toBe(false);
    r.enabled = true;
    expect(r.update(1 / 60)).toBe(false);                // 关掉期间攒不下 → 打开也不补发
    expect(calls).toBe(0);
    expect(r.dropped).toBe(2);
  });

  it('出厂档是开着的，旧档（v1 扁平、没有这一格）也回落成开', () => {
    const real = { localStorage: globalThis.localStorage, window: globalThis.window };
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    try {
      expect(new SettingsManager().get('vibration')).toBe(true);
      expect(migrateFromFlat()).toBe(true);
    } finally {
      globalThis.localStorage = real.localStorage;
      globalThis.window = real.window;
    }
  });

  it('`applyToGame` 是写进反馈层的唯一路径，而且只认真勾上的值', () => {
    const real = { localStorage: globalThis.localStorage, window: globalThis.window };
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    try {
      const s = new SettingsManager();
      const rumble = new Rumble(() => true);
      s.set('vibration', false);
      s.applyToGame({ rumble });
      expect(rumble.enabled).toBe(false);
      s.set('vibration', true);
      s.applyToGame({ rumble });
      expect(rumble.enabled).toBe(true);
      for (const dirty of ['true', 1, 'yes', {}]) {
        s.data.vibration = dirty;
        s.applyToGame({ rumble });
        expect(rumble.enabled, `脏值 ${JSON.stringify(dirty)} 不该被当成"勾上"`).toBe(false);
      }
      // `null` 走的是 `get()` 那条全仓既有语义：算"没这一格"、回落默认（开），这里不特殊化
      s.data.vibration = null;
      s.applyToGame({ rumble });
      expect(rumble.enabled).toBe(true);
      // 反馈层还不在（构造早期）：不炸，也不凭空造一格
      expect(() => s.applyToGame({})).not.toThrow();
    } finally {
      globalThis.localStorage = real.localStorage;
      globalThis.window = real.window;
    }
  });
});

/** v1 扁平档（没有 `version` 字段）走 `migrateLegacySettings`：不认识 `vibration` 就用默认 */
function migrateFromFlat() {
  const real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: () => JSON.stringify({ masterVolume: 0.5 }),
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    return new SettingsManager().get('vibration');
  } finally {
    globalThis.localStorage = real;
  }
}

/* ------------------------------------------- 桥那三条降级路（没有致动器是常态） */

describe('GamepadInput.vibrate：三类"设备不接"都只给一个 false', () => {
  it('没有 `vibrationActuator`（多数网页手柄）→ false，什么都没发生', () => {
    const pad = fakePad({ actuator: false });
    const bridge = mkBridge(pad);
    expect(bridge.vibrate({ strong: 0.5, weak: 0.3, ms: 100 })).toBe(false);
    expect(pad.log).toEqual([]);
  });

  it('有致动器但没有 `playEffect`（老 Firefox 的形状）→ false，不抛', () => {
    const pad = fakePad({ playEffect: false });
    const bridge = mkBridge(pad);
    expect(pad.vibrationActuator).toBeTruthy();
    expect(() => bridge.vibrate({ strong: 0.5, weak: 0.3, ms: 100 })).not.toThrow();
    expect(bridge.vibrate({ strong: 0.5, weak: 0.3, ms: 100 })).toBe(false);
  });

  it('正常那只：形状是 `dual-rumble` + 四个字段，一次命令一帧不超过一次', () => {
    const { pad, bridge } = mkChain();
    expect(bridge.vibrate({ strong: 0.42, weak: 0.21, ms: 90 })).toBe(true);
    expect(pad.log).toEqual([{
      shape: 'dual-rumble', startDelay: 0, duration: 90, strongMagnitude: 0.42, weakMagnitude: 0.21,
    }]);
  });

  it('幅度夹在 0~1、时长夹在 1~250：脏值不该把马达锁死', () => {
    const pad = fakePad();
    const bridge = mkBridge(pad);
    bridge.vibrate({ strong: 9, weak: -3, ms: 5000 });
    bridge.vibrate({});
    bridge.vibrate({ strong: NaN, weak: Infinity, ms: NaN });
    expect(pad.log[0]).toMatchObject({ duration: 250, strongMagnitude: 1, weakMagnitude: 0 });
    expect(pad.log[1]).toMatchObject({ duration: 1, strongMagnitude: 0, weakMagnitude: 0 });
    expect(pad.log[2]).toMatchObject({ duration: 1, strongMagnitude: 0, weakMagnitude: 0 });
  });

  it('`playEffect` 当场抛（拔手那一刻）→ false，异常不冒到反馈层', () => {
    const pad = fakePad();
    pad.vibrationActuator.playEffect = () => { throw new Error('device lost'); };
    const bridge = mkBridge(pad);
    expect(() => bridge.vibrate({ strong: 0.5, weak: 0.2, ms: 80 })).not.toThrow();
    expect(bridge.vibrate({ strong: 0.5, weak: 0.2, ms: 80 })).toBe(false);
  });

  it('`playEffect` 返回 rejected promise → 不算失败，但也不留未处理的拒绝', async () => {
    const pad = fakePad();
    pad.vibrationActuator.playEffect = () => Promise.reject(new Error('unsupported'));
    const bridge = mkBridge(pad);
    const rejections = [];
    const onHide = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onHide);
    try {
      expect(bridge.vibrate({ strong: 0.5, weak: 0.2, ms: 80 })).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onHide);
    }
  });

  it('震的是 `_pickPad` 选中的那一只：动作与震动不会各认一只手柄（B47 那一族）', () => {
    const first = fakePad();
    const second = fakePad();
    const bridge = new GamepadInput({ keys: {} }, GAMEPAD_BINDINGS, () => [first, second]);
    expect(bridge.poll()).toBe(true);                    // 轮询认下第一只并记住口位
    expect(bridge.vibrate({ strong: 0.4, weak: 0.2, ms: 60 })).toBe(true);
    expect(first.log).toHaveLength(1);
    expect(second.log).toEqual([]);
    // 拔掉第一只：下一帧轮询换到第二只，震动也跟着换 —— 两处读的是同一份"当前手柄"
    first.connected = false;
    expect(bridge.poll()).toBe(true);
    expect(bridge.vibrate({ strong: 0.4, weak: 0.2, ms: 60 })).toBe(true);
    expect(second.log).toHaveLength(1);
  });
});

/* -------------------------------------------------- 端到端：一次请求管两路 */

describe('端到端：`addShake` 一下，相机抖与手柄震是同一个决定', () => {
  it('最响的一档（蓄力法术 0.35）落到设备上就是兜底档那三个数', () => {
    const { pad, shake, rumble } = mkChain();
    shake.add(0.35);
    expect(rumble.update(1 / 60)).toBe(true);
    expect(pad.log).toEqual([{
      shape: 'dual-rumble',
      startDelay: 0,
      duration: RUMBLE.bands.at(-1).ms,
      strongMagnitude: RUMBLE.bands.at(-1).strong,
      weakMagnitude: RUMBLE.bands.at(-1).weak,
    }]);
    expect(shake.strength).toBeGreaterThan(0);           // 相机那一路照旧
  });

  it('没插手柄（桥不在）也不炸：命令落空，相机照抖', () => {
    const shake = new Shake();
    const rumble = new Rumble((pulse) => pulse && false);
    shake.setImpactSink((intensity) => rumble.request(intensity));
    shake.add(0.2);
    expect(rumble.update(1 / 60)).toBe(false);
    expect(rumble.failed).toBe(1);
    expect(shake.strength).toBeGreaterThan(0);
    expect(rumble.held.left).toBe(0);                    // 设备没接住 → 不留"正在跑"的账
  });

  it('没有致动器的那只手柄：每帧请求都安静落空，不重试成刷屏', () => {
    const { pad, shake, rumble } = mkChain({ actuator: false });
    for (let i = 0; i < 5; i += 1) {
      shake.add(0.1);
      rumble.update(1 / 60);
    }
    expect(pad.log).toEqual([]);
    expect(rumble.pulses).toBe(0);
    expect(rumble.failed).toBeGreaterThan(0);
  });

  it('自动演示/截图那条 `muted` 闸对两路同源：不抖也不震', () => {
    const { pad, shake, rumble } = mkChain();
    shake.muted = true;
    shake.add(0.35);
    rumble.update(1 / 60);
    expect(pad.log).toEqual([]);
    expect(shake.strength).toBe(0);
  });

  it('连续两下轻击（连招里最常见的形状）不会各自震一下：帧内合成一次', () => {
    const { pad, shake, rumble } = mkChain();
    shake.add(0.03);
    shake.add(0.03);
    rumble.update(1 / 60);
    expect(pad.log).toHaveLength(1);
    expect(pad.log[0].strongMagnitude).toBe(RUMBLE.bands[0].strong);
  });
});

/* ---------------------------------------------------------- 静态门禁 */

describe('静态门禁：一个入口、一处映射、一处登记', () => {
  it('请求入口仍然只有 `addShake()`：马达的三个数不出现在任何调用点文件里', () => {
    const offenders = FILES
      .filter((f) => /addShake\(/.test(f.code))
      .filter((f) => /strongMagnitude|weakMagnitude|playEffect|vibrationActuator|RUMBLE/.test(f.code))
      .map((f) => f.name);
    expect(offenders, '调用点自己抄马达数字 = 第二个真源').toEqual([]);
    // 而请求方一个没被改坏：八处以上、分布在战斗与法术两侧
    const callers = FILES.filter((f) => /(^|[^.\w])addShake\(/.test(f.code));
    expect(callers.length).toBeGreaterThanOrEqual(7);
    expect(callers.map((f) => f.name)).toContain('combat/CombatController.js');
    expect(callers.map((f) => f.name)).toContain('combat/SpellSystem.js');
  });

  it('`playEffect` 只有一处（桥），`vibrate(` 的调用点只有 Game 注入的那一条闭包', () => {
    expect(FILES.filter((f) => /playEffect\(/.test(f.code)).map((f) => f.name))
      .toEqual(['engine/GamepadInput.js']);
    expect(FILES.filter((f) => /\.vibrate\(/.test(f.code)).map((f) => f.name))
      .toEqual(['core/Game.js']);
  });

  it('读手柄清单的地方仍然只有一个，而且震动走的也是它', () => {
    const readers = FILES.filter((f) => /navigator\.getGamepads/.test(f.code)).map((f) => f.name);
    expect(readers).toEqual(['engine/GamepadInput.js']);
    const bridge = sourceOf('engine/GamepadInput.js');
    expect((bridge.match(/this\.getPads\(\)/g) || []).length).toBe(1);
    expect((bridge.match(/_pickPad\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(bridge).toMatch(/vibrate\(pulse\)[\s\S]{0,120}_pickPad\(\)/);
  });

  it('登记的挂点只有一处、且在桥建好之后；结账在帧末、按 `rawDt`', () => {
    const game = sourceOf('core/Game.js');
    expect((game.match(/setImpactSink\(/g) || []).length).toBe(1);
    const made = game.indexOf('this.padInput = new GamepadInput(');
    const sunk = game.indexOf('this.shake.setImpactSink(');
    expect(made).toBeGreaterThanOrEqual(0);
    expect(sunk, '震动没接上（登记点不在主循环里）').toBeGreaterThan(made);
    const flush = game.indexOf('this.rumble.update(');
    expect(flush).toBeGreaterThan(sunk);
    expect(game.slice(flush, flush + 40), '马达是物理设备：按 `rawDt` 结账').toMatch(/rawDt/);
    expect((game.match(/rumble\.update\(/g) || []).length).toBe(1);
    /* 建反馈层要**早于**桥后那次 `applyToGame`：晚一步，玩家存的 `vibration: false` 就在开机时
     * 丢掉（`applyToGame` 找不到可写的对象），要打开设置面板再关掉才生效 —— 切片15 踩过同一格 */
    const applied = game.indexOf('this.settings.applyToGame(this);', made);
    const built = game.indexOf('this.rumble = new Rumble(');
    expect(applied).toBeGreaterThan(made);
    expect(built, '桥建好之后没人把设置推给反馈层').toBeLessThan(applied);
  });

  it(`震屏侧只有一个消费者位点：\`impactSink\` 只在 \`Shake.js\` 里被读、在 \`Game.js\` 里被登记`, () => {
    const users = FILES.filter((f) => /impactSink|setImpactSink/.test(f.code)).map((f) => f.name);
    expect(users.sort()).toEqual(['core/Game.js', 'engine/Shake.js']);
    const shake = sourceOf('engine/Shake.js');
    expect((shake.match(/impactSink\?\.\(/g) || []).length, '通知点只许在 `add()` 里那一处').toBe(1);
    // 相机先记账、马达后听：顺序反过来的话，一次设备异常就会吃掉那一帧的抖动
    expect(shake.indexOf('this.trauma = Math.min')).toBeLessThan(shake.indexOf('this.impactSink?.('));
  });

  it('强度是**顺路**给的：`add()` 通知的是刚加过 trauma 的那个 `intensity`，不是另算一份', () => {
    const shake = sourceOf('engine/Shake.js');
    expect(shake).toMatch(/this\.impactSink\?\.\(intensity\)/);
    expect(/impactSink\?\.\([^i)]/.test(shake), '通知了别的东西 = 第二个决定').toBe(false);
  });

  it('开关那一格两头都接着：既写进设置，也在 `refresh` 里回显（登记了却没人读的开关最坏）', () => {
    const panel = sourceOf('ui/SettingsPanel.js');
    expect((panel.match(/getElementById\('set-vibration'\)/g) || []).length, '只接一头 = 玩家拨了没反应或打开面板一看是错的').toBe(2);
    expect(panel).toMatch(/getElementById\('set-vibration'\)[\s\S]{0,160}s\.set\('vibration'/);
    expect((panel.match(/s\.set\('vibration'/g) || []).length).toBe(1);
    // 面板不自己摸马达：写入口只有 `applyToGame` 一条（切片15 给滑杆立的同一规矩）
    expect(panel, '面板绕过设置直接开马达 = 第二个写点').not.toMatch(/rumble\.enabled/);
    const settings = sourceOf('core/SettingsManager.js');
    expect((settings.match(/rumble\.enabled = /g) || []).length).toBe(1);
    // 默认开：这一格是"有马达就震"，玩家没表态之前不该先替他关掉
    expect(settings).toMatch(/\n {2}vibration: true,/);
  });

  it('壳页里那一格复选框存在，且在设置面板的 `nav` 宿主内（键盘/手柄走得到才谈开关）', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const line = html.split('\n').find((l) => l.includes('id="set-vibration"'));
    expect(line).toBeTruthy();
    expect(line).toMatch(/type="checkbox"/);
    expect(html.indexOf('id="set-vibration"')).toBeGreaterThan(html.indexOf('id="settings-panel"'));
    expect(html.indexOf('id="set-vibration"')).toBeLessThan(html.indexOf('id="set-keybinds"'));
  });
});

/* ----------------------------------------- 面板那一格：写设置 + 回显一致 */

describe('设置面板那一格：勾选只写设置，回显与 `applyToGame` 同一判据', () => {
  const stubDoc = (els) => ({
    getElementById: (id) => els[id] ?? null,
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
  });
  const checkbox = () => ({
    checked: false,
    listeners: {},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type) { (this.listeners[type] ?? []).forEach((fn) => fn({ target: this })); },
  });

  const run = (fn) => {
    const real = { localStorage: globalThis.localStorage, window: globalThis.window, document: globalThis.document };
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    try {
      return fn();
    } finally {
      globalThis.localStorage = real.localStorage;
      globalThis.window = real.window;
      globalThis.document = real.document;
    }
  };

  it('勾上 → 写进设置并推给反馈层；取消勾选 → 立刻推到 false', () => {
    run(() => {
      const vib = checkbox();
      globalThis.document = stubDoc({ 'set-vibration': vib });
      const s = new SettingsManager();
      const rumble = new Rumble(() => true);
      const game = { settings: s, rumble, padInput: { setTuning: () => {} }, dialog: { toast: () => {} } };
      game.settingsPanel = { show() {}, hide() {} };
      new SettingsPanel(game);
      vib.checked = true;
      vib.fire('change');
      expect(s.get('vibration')).toBe(true);
      expect(rumble.enabled).toBe(true);
      vib.checked = false;
      vib.fire('change');
      expect(s.get('vibration')).toBe(false);
      expect(rumble.enabled).toBe(false);
    });
  });

  it('回显与真行为同判据：任何一格脏值下，"框勾着"与"马达真会震"始终是一件事', () => {
    run(() => {
      const vib = checkbox();
      globalThis.document = stubDoc({ 'set-vibration': vib });
      const s = new SettingsManager();
      const rumble = new Rumble(() => true);
      const game = { settings: s, rumble, padInput: { setTuning: () => {} }, dialog: { toast: () => {} } };
      game.settingsPanel = { show() {}, hide() {} };
      const panel = new SettingsPanel(game);
      /* 期望值不来自一张字面量表，而是**现读反馈层**：面板与 `applyToGame` 一旦分家，这里立刻红。
       * 在测试里抄一份"该显示什么"就等于再长一个真源（切片11 的那一课）。 */
      for (const dirty of ['true', 1, 'yes', {}, null, undefined, true, false]) {
        s.data.vibration = dirty;
        s.applyToGame(game);
        panel.refresh();
        expect(vib.checked, `脏值 ${String(dirty)}：框勾着但马达不震（或反过来）`).toBe(rumble.enabled);
      }
    });
  });
});

afterEach(() => {
  // 出厂档位表一动不动：任何一处就地改 `RUMBLE.bands` 都会在这里现形（切片15 同一课）
  expect(RUMBLE.bands.map((b) => [b.at, b.strong, b.weak, b.ms])).toEqual(FACTORY_BANDS);
});
