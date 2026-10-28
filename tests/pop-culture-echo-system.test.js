/**
 * 次元回声门禁 —— 钉 `game/PopCultureEchoSystem.js`。
 *
 * 通过真实 EventBus 驱动。几条"写错不抛、只静默锁死内容"的不变量：
 * - **按 trigger 解锁** + **幂等**（已解锁不重复 toast/广播/日志）。
 * - **全位面共鸣（echo-full-resonance）必须能解锁**：它是"派生"回声（无派发点），
 *   靠"其余回声都共鸣"那一刻由本系统自己放出。⚠ 这是一条**回归门**：改前用
 *   `stats.percent >= 100` 判定，而 percent 的分母把共鸣本身也算进去（48/49=98），
 *   于是共鸣永远解锁不了、`echoPercent` 也永远到不了 100（`echo-full` 成就连带锁死）。
 *   现在改成"除共鸣外全部解锁即放出"，48/48 → 共鸣解锁 → 49/49=100%。
 * - `getStats().percent` 到 100 必须**可达**；`getEntries(franchise)` 按族过滤；存档往返。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { ECHOES } from '../src/content/echoes.js';
import { PopCultureEchoSystem } from '../src/game/PopCultureEchoSystem.js';

const BONUS_ID = 'echo-full-resonance';
const NON_BONUS = ECHOES.filter((e) => e.id !== BONUS_ID);

let game, sys, unlockedEvents, capture;

beforeEach(() => {
  unlockedEvents = [];
  capture = (e) => { unlockedEvents.push(e.detail); };
  globalThis.window.addEventListener('pop-culture-unlocked', capture);
  game = { dialog: { toast: () => {} }, storyJournal: { add: () => {} }, quests: { chapter: 2 } };
  sys = new PopCultureEchoSystem(game);
});
afterEach(() => {
  sys?.dispose();
  globalThis.window.removeEventListener('pop-culture-unlocked', capture);
  sys = null;
});

describe('PopCultureEchoSystem 按 trigger 解锁', () => {
  it('discovery 事件 → 对应回声解锁；幂等', () => {
    emit('discovery', { id: 'magic-castle' }); // echo-wizard-school 的 trigger
    expect(sys.unlocked.has('echo-wizard-school')).toBe(true);
    const before = unlockedEvents.length;
    emit('discovery', { id: 'magic-castle' }); // 再来一次
    expect(unlockedEvents.length).toBe(before); // 不重复广播
  });
});

describe('PopCultureEchoSystem 全位面共鸣必须可达', () => {
  it('解锁全部非共鸣回声 → 共鸣自动解锁、percent 到 100', () => {
    for (const e of NON_BONUS) sys.tryUnlock(e.trigger);
    // 其余全解锁后，派生回声自己放出来
    expect(sys.unlocked.has(BONUS_ID)).toBe(true);
    expect(sys.getStats().percent).toBe(100);
    expect(sys.getStats().unlocked).toBe(ECHOES.length);
  });
});

describe('PopCultureEchoSystem 统计 / 过滤 / 存档', () => {
  it('getStats 的 total 是整张表长度；getEntries 按族过滤', () => {
    expect(sys.getStats().total).toBe(ECHOES.length);
    const all = sys.getEntries('all');
    expect(all).toHaveLength(ECHOES.length);
    const franchises = [...new Set(ECHOES.map((e) => e.franchise))];
    const one = franchises[0];
    expect(sys.getEntries(one).every((e) => e.franchise === one)).toBe(true);
  });

  it('toJSON/fromJSON 存读 unlocked；null 安全 no-op', () => {
    emit('discovery', { id: 'magic-castle' });
    const json = JSON.parse(JSON.stringify(sys.toJSON()));
    sys.unlocked = new Set();
    sys.fromJSON(json);
    expect(sys.unlocked.has('echo-wizard-school')).toBe(true);
    sys.fromJSON(null);
    expect(sys.unlocked.has('echo-wizard-school')).toBe(true);
  });
});
