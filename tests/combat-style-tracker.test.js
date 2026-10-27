/**
 * 战斗风格积分门禁 —— 钉 `game/CombatStyleTracker.js`（弹反/连击/处决/Boss 的风格评级）。
 *
 * 纯逻辑（分数累积 + 档位阈值 + 世界时衰减 + 会话最佳），此前只有 wiring/clock 的间接测试，
 * 评级与衰减本身没被钉。几条"写错不抛、只静默评错级/漏衰减"的不变量：
 * - **档位阈值**：0→—、50→C、120→B、250→A、450→S、700→SS，取"够得着的最高档"。
 * - `add`：累积分数、连段+1、重置衰减计时 8s、刷新会话最佳，并广播 `combat-style-changed`
 *   （带 score/rank/color/label/chain）。
 * - `update`：世界时倒计时归零才**扣 40（下限 0）、清连段、广播**；未到期不动。
 * - `sessionBest` 只增不减（衰减后仍是历史最高）；`toJSON/fromJSON` 只存这一格。
 * - 事件 → 加分：parry 35 / finisher 80 / execution 120 / 敌死 boss 200·普通 8 / boss-defeated 300。
 *
 * EventBus 监听在构造期注册，`afterEach` 用 `dispose()` 结清；`window.dispatchEvent` 桩录事件。
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { CombatStyleTracker } from '../src/game/CombatStyleTracker.js';

let events, tracker, capture;

beforeEach(() => {
  events = [];
  // EventBus 走的是**原生 window 事件**（on→addEventListener，emit→dispatchEvent），
  // 所以不替换 window，只在真 window 上加一个采集监听。
  capture = (e) => { events.push(e); };
  globalThis.window.addEventListener('combat-style-changed', capture);
  tracker = new CombatStyleTracker({});
});
afterEach(() => {
  tracker?.dispose();
  globalThis.window.removeEventListener('combat-style-changed', capture);
  tracker = null;
});

describe('CombatStyleTracker 档位阈值', () => {
  it('getRank 取够得着的最高档（边界逐档验）', () => {
    const cases = [
      [0, '—'], [49, '—'], [50, 'C'], [119, 'C'], [120, 'B'], [249, 'B'],
      [250, 'A'], [449, 'A'], [450, 'S'], [699, 'S'], [700, 'SS'], [9999, 'SS'],
    ];
    for (const [score, label] of cases) {
      tracker.score = score;
      expect(tracker.getRank().label, `score=${score}`).toBe(label);
    }
  });
});

describe('CombatStyleTracker.add 累积与广播', () => {
  it('累积分数/连段/最佳、重置衰减计时，并广播带 rank 的变更', () => {
    tracker.add(35, 'style_label_parry');
    expect(tracker.score).toBe(35);
    expect(tracker.comboChain).toBe(1);
    expect(tracker.sessionBest).toBe(35);
    expect(tracker.decayTimer).toBe(8);
    expect(events.at(-1).detail).toMatchObject({
      score: 35, rank: '—', label: 'style_label_parry', chain: 1,
    });
  });
});

describe('CombatStyleTracker.update 世界时衰减', () => {
  it('倒计时归零 → 扣 40、清连段、广播', () => {
    tracker.add(100, 'x'); // decayTimer=8
    tracker.update(8);
    expect(tracker.score).toBe(60);
    expect(tracker.comboChain).toBe(0);
    expect(events.at(-1).detail).toMatchObject({ score: 60, chain: 0, label: '' });
  });

  it('未到期不动', () => {
    tracker.score = 50;
    tracker.decayTimer = 0;
    tracker.update(1);
    expect(tracker.score).toBe(50);
  });
});

describe('CombatStyleTracker 会话最佳与存档', () => {
  it('sessionBest 只增不减（衰减后仍是历史最高）', () => {
    tracker.add(100, 'x');
    tracker.update(8); // 衰减
    expect(tracker.sessionBest).toBe(100);
  });

  it('toJSON/fromJSON 只存读 sessionBest', () => {
    tracker.add(300, 'x');
    expect(tracker.toJSON()).toEqual({ sessionBest: 300 });
    tracker.sessionBest = 0;
    tracker.fromJSON({ sessionBest: 300 });
    expect(tracker.sessionBest).toBe(300);
    tracker.fromJSON({}); // 有 data 但无该格 → 回落 0
    expect(tracker.sessionBest).toBe(0);
    tracker.fromJSON(null); // 空档 → 安全 no-op（不改）
    expect(tracker.sessionBest).toBe(0);
  });
});

describe('CombatStyleTracker 事件 → 加分', () => {
  it('parry 35 / 敌死 boss 200·普通 8', () => {
    emit('parry-success');
    expect(tracker.score).toBe(35);
    emit('enemy-defeated', { type: 'boss' });
    expect(tracker.score).toBe(235);
    emit('enemy-defeated', { type: 'normal' });
    expect(tracker.score).toBe(243);
  });
});
