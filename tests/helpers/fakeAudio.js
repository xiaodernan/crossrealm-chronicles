/**
 * 假 Web Audio 环境 —— 给"声音到底有没有按秒数发出来"这类用例共用的一份夹具。
 *
 * 为什么是这样一份假物：`AudioManager` 真正碰到的 API 只有增益、振荡器、缓冲源、
 * 滤波器与一条 `createBuffer`，而"这一拍响了没有"在测试里唯一可信的证据是
 * **某个节点被 start() 过**。所以这里把每次 `start()` 记成一条音符，并沿连接链
 * 走到被贴了标签的那条总线 —— 于是"进了哪一层"是走回来的事实，不是字段名猜的。
 *
 * 夹具的两条纪律（都是这里踩过的坑）：
 * 1. `gain` 与 `frequency` 必须是**同一个形状**（`audioParam()`）。真设备上两者都是
 *    AudioParam，`AudioManager` 对 `frequency` 一样会 ramp；早期版本只给 `gain` 补了
 *    方法，两例红在 production 根本没做错的地方。
 * 2. 六条总线是**解锁那一刻**才存在的，标签只能在 `armAudio()` 里点击之后贴；
 *    解锁自身会起常驻底噪（两条振荡器），那不是节拍，所以数音之前把这段记录丢掉。
 */
import { scheduler } from '../../src/engine/Scheduler.js';
import { AudioManager } from '../../src/audio/AudioManager.js';
import { installWindowShim } from './enemyHarness.js';

export const FRAME = 1 / 60;

/** 沿连接链走到被贴了标签的那条总线，音符"进了哪一层"由走回来的结果说了算 */
export function busOf(node) {
  let cur = node;
  for (let hops = 0; cur && hops < 8; hops++) {
    if (cur.label) return cur.label;
    cur = cur._target;
  }
  return null;
}

/** AudioParam 的形状：gain 与 frequency 在真设备上都是同一套方法，这里也别分家 */
export const audioParam = () => {
  const p = { value: 0 };
  p.setValueAtTime = () => p;
  p.linearRampToValueAtTime = () => p;
  p.exponentialRampToValueAtTime = () => p;
  p.setTargetAtTime = () => p;
  return p;
};

/**
 * 假 AudioContext：只实现 `AudioManager` 真的用到的那几样，
 * 并把每一次 `start()` 记成一条音符（总线 + 频率 + 时刻）。
 */
export function makeFakeAudioContext() {
  return class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.notes = [];
      this.resumed = 0;
      this.destination = this._node('destination');
    }
    _node(label, kind) {
      const self = this;
      const n = {
        label,
        kind: kind ?? null,
        type: 'sine',
        _target: null,
        buffer: null,
        gain: audioParam(),
        frequency: audioParam(),
        connect(target) { n._target = target; },
        disconnect() { n._target = null; },
        start(at) {
          if (!n.kind) return;
          self.notes.push({ kind: n.kind, bus: busOf(n), freq: n.frequency.value, at: at ?? self.currentTime });
        },
        stop() {},
      };
      return n;
    }
    resume() { this.resumed += 1; this.state = 'running'; }
    createGain() { return this._node(null); }
    createBiquadFilter() { return this._node(null); }
    createOscillator() { return this._node(null, 'osc'); }
    createBufferSource() { return this._node(null, 'noise'); }
    createBuffer(_ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  };
}

export const BUSES = { master: 'master', sfx: 'sfx', ambient: 'ambient', bgm: 'bgm', combatLayer: 'combat', bleed: 'bleed' };

/**
 * 走真实的上屏路径：装假环境 → 造 manager → 由"第一次点击"解锁出 ctx。
 * 返回 `{ audio, ctx }`，`ctx.notes` 从这里开始只记解锁之后的音。
 */
export function armAudio() {
  globalThis.AudioContext = makeFakeAudioContext();
  installWindowShim();
  const docHandlers = new Map();
  globalThis.document = {
    addEventListener(type, fn) {
      if (!docHandlers.has(type)) docHandlers.set(type, new Set());
      docHandlers.get(type).add(fn);
    },
    removeEventListener(type, fn) { docHandlers.get(type)?.delete(fn); },
  };
  const audio = new AudioManager();
  docHandlers.get('click').forEach((fn) => fn());
  const ctx = audio.ctx;
  for (const [field, label] of Object.entries(BUSES)) audio[field].label = label;
  ctx.notes.length = 0;
  return { audio, ctx };
}

/** 固定步长推进主循环：调度器走一格，假 ctx 的时间跟着走一格；返回实际帧数 */
export function runAt(ctx, seconds, step = FRAME) {
  let elapsed = 0;
  let frames = 0;
  while (elapsed < seconds - 1e-9) {
    scheduler.update(step);
    ctx.currentTime += step;
    elapsed += step;
    frames += 1;
    if (frames > 100000) throw new Error('runAt() 未收敛');
  }
  return frames;
}

export const run = (ctx, seconds) => runAt(ctx, seconds, FRAME);

/** 逐帧推进到某条总线出声，返回用掉的帧数（出声那一帧算在内）；300 帧不出声返回 NaN */
export function framesToFirst(ctx, bus, step = FRAME) {
  for (let i = 1; i <= 300; i++) {
    scheduler.update(step);
    ctx.currentTime += step;
    if (ctx.notes.some((n) => n.bus === bus)) return i;
  }
  return Number.NaN;
}

export const notesOn = (ctx, bus) => ctx.notes.filter((n) => n.bus === bus);
export const countOn = (ctx, bus) => notesOn(ctx, bus).length;

/** 换一个干净的 manager（调度器是模块单例，用例之间必须手工清零） */
export function freshArm() {
  scheduler.clearAll();
  return armAudio();
}

/** 用例结束后的清场：全局假环境是装在 globalThis 上的，留下会污染同进程的下一个文件 */
export function disarmAudio() {
  scheduler.clearAll();
  delete globalThis.AudioContext;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.CustomEvent;
}
