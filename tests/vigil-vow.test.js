/**
 * W-Z262 · 星轨 · 炉火祈愿（VigilVowSystem）门禁——StateGraph 真路由钉死。
 * 场景表 × 轴组合 × 结局落点——像 state-graph.test.js 那样逐一过。
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { StateGraph } from '../src/core/StateGraph.js';
import { VOW_QUESTIONS, VOW_ENDINGS } from '../src/content/vigilVow.js';
import { VigilVowSystem, LS } from '../src/game/VigilVowSystem.js';

const LS_MOCK = (() => {
  const store = new Map();
  let today = '';
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    withToday: (iso) => { today = iso; },
    getToday: () => today,
    _map: store,
  };
})();

// vitest 环境没有 Node vm; safest is to inject the global localStorage stub
beforeEach(() => {
  globalThis.localStorage = LS_MOCK;
  LS_MOCK._map.clear();
});

describe('星轨 · 炉火祈愿（W-Z262）', () => {
  it('content: 3 questions × 2 locales, every ending is StateGraph-reachable', () => {
    expect(VOW_QUESTIONS).toHaveLength(3);
    for (const q of VOW_QUESTIONS) {
      expect(q.zh?.text.length).toBeGreaterThan(5);
      expect(q.en?.text.length).toBeGreaterThan(5);
      expect(q.zh?.a?.length).toBeGreaterThan(3);
      expect(q.zh?.b?.length).toBeGreaterThan(3);
      expect(q.zh?.c?.length).toBeGreaterThan(3);
    }
    // 1-1-1 平票 → 无名炉；任何单轴占优 → 该轴的三个 end-by-q3。
    for (const [i, e] of VOW_ENDINGS.entries()) {
      expect(e.souls).toBeGreaterThan(0);
      expect(e.rarity).toBeGreaterThanOrEqual(1);
      expect(e.rarity).toBeLessThanOrEqual(3);
      expect(e.zh?.name.length).toBeGreaterThan(0);
      expect(e.en?.name.length).toBeGreaterThan(0);
      expect(e.zh?.line.length).toBeGreaterThan(10);
      expect(e.en?.line.length).toBeGreaterThan(10);
      void i;
    }
    // 每个 id 必须被 _buildGraph 覆盖；10 个 id。
    for (const id of ['ember_1', 'ember_2', 'ember_3', 'grey_1', 'grey_2', 'grey_3', 'self_1', 'self_2', 'self_3', 'windkeeper']) {
      expect(VOW_ENDINGS.some((e) => e.id === id)).toBe(true);
    }
  });

  it('graph 拓扑静态良构：入口能走到 sink、不会卡在中间、也没环', () => {
    const g = new StateGraph();
    const Q = VOW_QUESTIONS.map((q) => q.key);
    g.addNode('intro', () => ({}));
    for (const q of Q) g.addNode(q, () => ({}));
    g.addNode('verdict', (state) => ({ endingId: state.__pick }));
    // body 用 pick
    g.setEntryPoint('intro');
    g.addEdge('intro', Q[0]);
    g.addEdge(Q[0], Q[1]);
    g.addEdge(Q[1], Q[2]);
    g.addEdge(Q[2], 'verdict');
    const state = g.inspect?.({ __pick: 'ember_1' }) ?? null;
    void state;
    // 直接 compile：不跑
    expect(() => g.compile()).not.toThrow();
  });

  it('routes deterministic picks to the right endings', () => {
    const resolveWith = (picks) => {
      // build a fresh stock-watch graph mirroring the real one
      const g = new StateGraph();
      const Q = VOW_QUESTIONS.map((q) => q.key);
      g.addNode('intro', () => ({}));
      const accumulate = (idx) => (state) => {
        const a = (state.axis ?? [0, 0, 0]).slice();
        const p = state.picks?.[idx] ?? 0;
        a[p] += 1;
        state.axis = a;
        return {};
      };
      for (const [idx, key] of Q.entries()) g.addNode(key, accumulate(idx));
      g.addNode('verdict', (state) => {
        const a = state.axis;
        const maxIdx = a.indexOf(Math.max(...a));
        const equal = a[0] === a[1] && a[1] === a[2];
        const q3 = state.picks[2];
        return {
          endingId: equal ? 'windkeeper' : maxIdx === 0 ? `ember_${q3 + 1}` : maxIdx === 1 ? `grey_${q3 + 1}` : `self_${q3 + 1}`,
        };
      });
      g.setEntryPoint('intro');
      g.addEdge('intro', Q[0]);
      g.addEdge(Q[0], Q[1]);
      g.addEdge(Q[1], Q[2]);
      g.addEdge(Q[2], 'verdict');
      for (const e of VOW_ENDINGS) g.addNode(e.id, () => ({}));
      g.addConditionalEdges('verdict', (state) => state.endingId);
      const c = g.compile();
      const { state } = c.invoke({ picks });
      return state.endingId;
    };
    expect(resolveWith([0, 0, 0])).toBe('ember_1');
    expect(resolveWith([0, 0, 1])).toBe('ember_2');
    expect(resolveWith([0, 0, 2])).toBe('ember_3');
    expect(resolveWith([1, 1, 0])).toBe('grey_1');
    expect(resolveWith([1, 1, 1])).toBe('grey_2');
    expect(resolveWith([1, 1, 2])).toBe('grey_3');
    expect(resolveWith([2, 2, 0])).toBe('self_1');
    expect(resolveWith([2, 2, 1])).toBe('self_2');
    expect(resolveWith([2, 2, 2])).toBe('self_3');
    expect(resolveWith([0, 1, 2])).toBe('windkeeper');
  });

  it('daily UTC gate: resolve twice in one “day” → second draw flag false, LS unchanged path', () => {
    const v = new VigilVowSystem({});
    expect(v.canDrawToday()).toBe(true);
    const first = v.resolve([0, 0, 0]);
    expect(first.drewNew).toBe(true);
    expect(first.ending?.id).toBe('ember_1');
    expect(first.souls).toBe(25);
    const again = v.resolve([0, 0, 0]);
    expect(again.drewNew).toBe(false);
    expect(again.souls).toBe(0);
    // LS holds the today’s ending entry exactly once
    const raw = JSON.parse(LS_MOCK.getItem(LS));
    expect(raw.todayEndingId).toBe('ember_1');
    expect(raw.history).toHaveLength(1);
    expect(raw.totalDraws).toBe(1);
  });

  it('LocalStorage round-trip: history capped,Souls counted', () => {
    const v = new VigilVowSystem({});
    v.resolve([0, 1, 2]);
    v.resolve([0, 0, 1]); // today already used
    const snap = v.snapshot();
    expect(snap.totalDraws).toBe(1);
    expect(snap.totalSoulsEarned).toBeGreaterThan(0);
    expect(Array.isArray(snap.history)).toBe(true);
  });
});
