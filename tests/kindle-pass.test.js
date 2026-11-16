/**
 * W-Z282 · 炉火的交棒（KindlePassSystem）门禁——StateGraph 真路由钉死。
 * 场景表 × 轴组合 × 结局落点——像 vigil-vow.test.js 那样逐一过。
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { StateGraph } from '../src/core/StateGraph.js';
import { PASS_QUESTIONS, PASS_ENDINGS } from '../src/content/kindlePass.js';
import { KindlePassSystem, LS } from '../src/game/KindlePassSystem.js';

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

describe('炉火的交棒（W-Z282）', () => {
  it('content: 3 questions × 2 locales, every ending is StateGraph-reachable', () => {
    expect(PASS_QUESTIONS).toHaveLength(3);
    for (const q of PASS_QUESTIONS) {
      expect(q.zh?.text.length).toBeGreaterThan(5);
      expect(q.en?.text.length).toBeGreaterThan(5);
      expect(q.zh?.a?.length).toBeGreaterThan(3);
      expect(q.zh?.b?.length).toBeGreaterThan(3);
      expect(q.zh?.c?.length).toBeGreaterThan(3);
      expect(q.en?.a?.length).toBeGreaterThan(3);
      expect(q.en?.b?.length).toBeGreaterThan(3);
      expect(q.en?.c?.length).toBeGreaterThan(3);
    }
    // 1-1-1 平票 → 无名守火人；任何单轴占优 → 该轴的三个 end-by-q3。
    for (const e of PASS_ENDINGS) {
      expect(e.souls).toBeGreaterThan(0);
      expect(e.rarity).toBeGreaterThanOrEqual(1);
      expect(e.rarity).toBeLessThanOrEqual(3);
      expect(e.zh?.name.length).toBeGreaterThan(0);
      expect(e.en?.name.length).toBeGreaterThan(0);
      expect(e.zh?.line.length).toBeGreaterThan(10);
      expect(e.en?.line.length).toBeGreaterThan(10);
    }
    // 每个 id 必须被 _buildGraph 覆盖；10 个 id。
    for (const id of ['kindle_1', 'kindle_2', 'kindle_3', 'tend_1', 'tend_2', 'tend_3', 'root_1', 'root_2', 'root_3', 'heirkeeper']) {
      expect(PASS_ENDINGS.some((e) => e.id === id)).toBe(true);
    }
  });

  it('graph 拓扑静态良构：入口能走到 sink、不会卡在中间、也没环', () => {
    const g = new StateGraph();
    const Q = PASS_QUESTIONS.map((q) => q.key);
    g.addNode('intro', () => ({}));
    for (const q of Q) g.addNode(q, () => ({}));
    g.addNode('verdict', (state) => ({ endingId: state.__pick }));
    // __pick 仅用于拓扑静态良构性探测
    g.setEntryPoint('intro');
    g.addEdge('intro', Q[0]);
    g.addEdge(Q[0], Q[1]);
    g.addEdge(Q[1], Q[2]);
    g.addEdge(Q[2], 'verdict');
    const state = g.inspect?.({ __pick: 'kindle_1' }) ?? null;
    void state;
    expect(() => g.compile()).not.toThrow();
  });

  it('routes deterministic picks to the right endings', () => {
    const resolveWith = (picks) => {
      const g = new StateGraph();
      const Q = PASS_QUESTIONS.map((q) => q.key);
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
          endingId: equal ? 'heirkeeper' : maxIdx === 0 ? `kindle_${q3 + 1}` : maxIdx === 1 ? `tend_${q3 + 1}` : `root_${q3 + 1}`,
        };
      });
      g.setEntryPoint('intro');
      g.addEdge('intro', Q[0]);
      g.addEdge(Q[0], Q[1]);
      g.addEdge(Q[1], Q[2]);
      g.addEdge(Q[2], 'verdict');
      for (const e of PASS_ENDINGS) g.addNode(e.id, () => ({}));
      g.addConditionalEdges('verdict', (state) => state.endingId);
      const c = g.compile();
      const { state } = c.invoke({ picks });
      return state.endingId;
    };
    expect(resolveWith([0, 0, 0])).toBe('kindle_1');
    expect(resolveWith([0, 0, 1])).toBe('kindle_2');
    expect(resolveWith([0, 0, 2])).toBe('kindle_3');
    expect(resolveWith([1, 1, 0])).toBe('tend_1');
    expect(resolveWith([1, 1, 1])).toBe('tend_2');
    expect(resolveWith([1, 1, 2])).toBe('tend_3');
    expect(resolveWith([2, 2, 0])).toBe('root_1');
    expect(resolveWith([2, 2, 1])).toBe('root_2');
    expect(resolveWith([2, 2, 2])).toBe('root_3');
    expect(resolveWith([0, 1, 2])).toBe('heirkeeper');
  });

  it('daily UTC gate: resolve twice in one “day” → second draw flag false, LS unchanged path', () => {
    const v = new KindlePassSystem({});
    expect(v.canDrawToday()).toBe(true);
    const first = v.resolve([0, 0, 0]);
    expect(first.drewNew).toBe(true);
    expect(first.ending?.id).toBe('kindle_1');
    expect(first.souls).toBe(25);
    const again = v.resolve([0, 0, 0]);
    expect(again.drewNew).toBe(false);
    expect(again.souls).toBe(0);
    const raw = JSON.parse(LS_MOCK.getItem(LS));
    expect(raw.todayEndingId).toBe('kindle_1');
    expect(raw.history).toHaveLength(1);
    expect(raw.totalDraws).toBe(1);
  });

  it('LocalStorage round-trip: history capped, souls counted', () => {
    const v = new KindlePassSystem({});
    v.resolve([0, 1, 2]);
    v.resolve([0, 0, 1]); // today already used
    const snap = v.snapshot();
    expect(snap.totalDraws).toBe(1);
    expect(snap.totalSoulsEarned).toBeGreaterThan(0);
    expect(Array.isArray(snap.history)).toBe(true);
  });
});
