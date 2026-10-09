/**
 * 音量这条路径的门禁（W-C7 切片3，B103）。
 *
 * 改前三处实测（`.tmp-20261010/wc7s3-probe2.mjs`，走真 `SettingsManager` + 真 `AudioManager`）：
 * ① 开机那次 `settings.applyToGame(this)`（`core/Game.js:382`）跑在任何用户手势之前，那时
 *    ctx 还没建、`setVolumes` 的两行都是 `if (this.master)` —— 玩家存的 0.9/0.2 被安静吞掉，
 *    第一次点击解锁时 `_initOnGesture` 又把自己的字面量 0.35/0.55 写上去；
 * ② 同一个量两处定义且已经漂：面板回显读 `SettingsManager` 的 0.5，实际发声是 0.55；
 * ③ 存储里的脏值直接进 `AudioParam.value` —— NaN/Infinity 在 Chrome 是 TypeError，
 *    越界的 5 与 −1 不钳就写进增益。
 *
 * 判据的形状与 `engine/aaPolicy.js` / `engine/ssaoSettings.js` 同一条：**名册 + normalize +
 * 唯一落笔口**，而"唯一"由源码扫描钉住（值相等不算同源 —— 手抄一个一样的数照样过值断言）。
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { VOLUME_DEFAULTS, VOLUME_BOUNDS, normalizeVolume, assertVolumeRoster } from '../src/audio/AudioVolumes.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { AudioManager } from '../src/audio/AudioManager.js';
import { makeFakeAudioContext } from './helpers/fakeAudio.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { scheduler } from '../src/engine/Scheduler.js';
import { offAll } from '../src/engine/EventBus.js';

const SRC = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/**
 * 真 `AudioParam` 的写入语义（WebIDL 的 `float` 转换）：先 `Number()` 再查有限性，
 * 非有限值抛 `TypeError`。`fakeAudio.js` 那份 `audioParam()` 是纯记账的宽容形状，
 * 音量这条判据要的正是"写坏值会抛"，所以这里只把 `gain.value` 换成会校验的属性 ——
 * 节点、连接链、音符记录全部沿用同一份夹具，不留第二套假接口。
 */
function strictifyGain(node) {
  let stored = node.gain.value;
  Object.defineProperty(node.gain, 'value', {
    configurable: true,
    get: () => stored,
    set: (x) => {
      const n = Number(x);
      if (!Number.isFinite(n)) throw new TypeError('AudioParam.value: provided float value is non-finite');
      stored = n;
    },
  });
  return node;
}

class StrictAudioContext extends (makeFakeAudioContext()) {
  createGain() { return strictifyGain(super.createGain()); }
}

const captured = {
  document: globalThis.document,
  localStorage: globalThis.localStorage,
  window: globalThis.window,
  CustomEvent: globalThis.CustomEvent,
};
const docHandlers = new Map();
const store = new Map();

globalThis.document = {
  addEventListener(type, fn) {
    if (!docHandlers.has(type)) docHandlers.set(type, new Set());
    docHandlers.get(type).add(fn);
  },
  removeEventListener(type, fn) { docHandlers.get(type)?.delete(fn); },
};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.AudioContext = StrictAudioContext;
installWindowShim();

/** 清掉设置存档：出厂那条用例与"玩家存了 0.9"那条用例共用一个 localStorage，不清就互相污染 */
const freshStorage = () => store.clear();

/**
 * 走到"有节点"之前的一切都是真的：`new AudioManager()` 之后 ctx 还没建，
 * `unlock()` 才扮演第一次点击。这个时序正是本片要钉的东西 —— 改前那两段是分家的。
 */
function build() {
  const audio = new AudioManager();
  const unlock = () => docHandlers.get('click').forEach((fn) => fn());
  return { audio, unlock };
}

afterAll(() => {
  scheduler.clearAll();
  offAll('audio/AudioManager');
  delete globalThis.AudioContext;
  for (const [key, value] of Object.entries(captured)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
});

describe('① 真源只有一份：出厂数从名册取，不在两处手抄', () => {
  it('SettingsManager 的音量两格引用 AudioVolumes 的名册（值相等不算同源）', () => {
    const src = read('src/core/SettingsManager.js');
    expect(src, 'SettingsManager 没有 import AudioVolumes').toContain("from '../audio/AudioVolumes.js'");
    expect(src, 'masterVolume 那一格不是引用名册').toMatch(/masterVolume:\s*VOLUME_DEFAULTS\.master\s*,/);
    expect(src, 'sfxVolume 那一格不是引用名册').toMatch(/sfxVolume:\s*VOLUME_DEFAULTS\.sfx\s*,/);
  });

  it('AudioManager 的 master/sfx 增益上不许再有数字字面量（B103 的死口径不得回流）', () => {
    const src = read('src/audio/AudioManager.js');
    const 字面量写增益 = src.match(/(?:master|sfx)\.gain\.value\s*=\s*[\d.]+/g) ?? [];
    expect(字面量写增益, '还留着的字面量写入：' + JSON.stringify(字面量写增益)).toEqual([]);
    expect(src, '解锁时没落 this.volumes 那份档（master）').toMatch(/this\.master\.gain\.value\s*=\s*this\.volumes\.master/);
    expect(src, '解锁时没落 this.volumes 那份档（sfx）').toMatch(/this\.sfx\.gain\.value\s*=\s*this\.volumes\.sfx/);
  });

  it('名册自己合法且冻结：出厂值都在定义域里，改不动它，坏名册加载期就抛', () => {
    expect(() => assertVolumeRoster()).not.toThrow();
    expect(Object.isFrozen(VOLUME_DEFAULTS)).toBe(true);
    for (const [key, value] of Object.entries(VOLUME_DEFAULTS)) {
      expect(value, `${key} 出厂值越界`).toBeGreaterThanOrEqual(VOLUME_BOUNDS.min);
      expect(value, `${key} 出厂值越界`).toBeLessThanOrEqual(VOLUME_BOUNDS.max);
    }
    expect(() => assertVolumeRoster({ master: 2 })).toThrow(/不在 \[0, 1\]/);
    expect(() => assertVolumeRoster({ master: NaN })).toThrow();
  });
});

describe('② 开机那次 applyToGame 不再把音量档吞掉', () => {
  it('解锁前写的音量记在实例上，解锁那一刻落到节点', () => {
    const { audio, unlock } = build();
    expect(audio.ctx, '构造期就该没有 ctx（这条路径的存在正是 bug 的形状）').toBe(null);
    audio.setVolumes(0.9, 0.2);
    expect(audio.volumes).toEqual({ master: 0.9, sfx: 0.2 });
    unlock();
    expect(audio.master.gain.value, '解锁时落的是玩家那份档，不是 AudioManager 自己的字面量').toBe(0.9);
    expect(audio.sfx.gain.value).toBe(0.2);
  });

  it('整条 shipped 路径：存 0.9/0.2 → 重开（读存储）→ 开机 applyToGame → 第一次点击 → 实得 0.9/0.2', () => {
    freshStorage();
    const first = new SettingsManager();
    first.set('masterVolume', 0.9);
    first.set('sfxVolume', 0.2);
    // 重开一局：Game.js 造 AudioManager（此刻还没有任何手势）→ 紧接着 settings.applyToGame(this)
    const { audio, unlock } = build();
    new SettingsManager().applyToGame({ audio });
    expect(audio.master, 'applyToGame 时 ctx 仍未建 —— 这一句是改前那条路成立的前提').toBe(null);
    unlock();
    expect(audio.master.gain.value).toBe(0.9);
    expect(audio.sfx.gain.value).toBe(0.2);
  });

  it('出厂（玩家从没动过滑杆）时面板与喇叭读同一份：解锁后就是名册那两个数', () => {
    freshStorage();
    const { audio, unlock } = build();
    unlock();
    expect(audio.master.gain.value, 'master 与 SettingsManager 的出厂值分家了').toBe(VOLUME_DEFAULTS.master);
    expect(audio.sfx.gain.value, 'sfx 与 SettingsManager 的出厂值分家了（改前这里是 0.55，面板写 0.5）').toBe(VOLUME_DEFAULTS.sfx);
    expect(new SettingsManager().get('masterVolume')).toBe(audio.master.gain.value);
    expect(new SettingsManager().get('sfxVolume')).toBe(audio.sfx.gain.value);
  });

  it('音量档不改总线拓扑：master 连 destination、sfx 连 master（这一片只动数，不动线）', () => {
    const { audio, unlock } = build();
    unlock();
    expect(audio.master._target).toBe(audio.ctx.destination);
    expect(audio.sfx._target).toBe(audio.master);
    expect(audio.ambient._target).toBe(audio.master);
    expect(audio.bgm._target).toBe(audio.master);
  });
});

describe('③ 最新值胜出，节点与账本不分家', () => {
  it('已解锁时改档立即落上，再改一次覆盖前一次', () => {
    const { audio, unlock } = build();
    unlock();
    audio.setVolumes(0.7, 0.3);
    expect([audio.master.gain.value, audio.sfx.gain.value, audio.volumes.master]).toEqual([0.7, 0.3, 0.7]);
    audio.setVolumes(0.1, 0.9);
    expect([audio.master.gain.value, audio.sfx.gain.value]).toEqual([0.1, 0.9]);
  });
});

describe('④ 存储是玩家可写的：脏值回落/钳住，绝不当场抛', () => {
  /** 三种病分开治，所以三组输入各有断言，不是一句"不抛"糊过去 */
  it('不是数（NaN / Infinity / null / undefined / 非数字串）→ 回落名册出厂值', () => {
    for (const raw of [NaN, Infinity, -Infinity, null, undefined, 'abc', {}]) {
      const { audio, unlock } = build();
      unlock();
      expect(() => audio.setVolumes(raw, raw), '脏值 ' + String(raw) + ' 把设置路径炸了').not.toThrow();
      expect(audio.master.gain.value, '脏值 ' + String(raw) + ' 落到了节点上').toBe(VOLUME_DEFAULTS.master);
      expect(audio.sfx.gain.value).toBe(VOLUME_DEFAULTS.sfx);
    }
  });

  it('越界的数（5 / −1）→ 钳进定义域：那是"要最大/最小"的意图，不是坏数据', () => {
    const { audio, unlock } = build();
    unlock();
    audio.setVolumes(5, -1);
    expect(audio.master.gain.value).toBe(VOLUME_BOUNDS.max);
    expect(audio.sfx.gain.value).toBe(VOLUME_BOUNDS.min);
  });

  it('数字串按 WebIDL 的 float 转换收（localStorage 读回来本来就是字符串）', () => {
    expect(normalizeVolume('0.4', VOLUME_DEFAULTS.master)).toBe(0.4);
    const { audio, unlock } = build();
    unlock();
    audio.setVolumes('0.4', '0.8');
    expect([audio.master.gain.value, audio.sfx.gain.value]).toEqual([0.4, 0.8]);
  });
});
