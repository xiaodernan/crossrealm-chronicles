import { StateGraph } from '../core/StateGraph.js';
import { QUESTIONS, FORTUNE_ENDINGS } from '../content/fortunePath.js';

/**
 * FortunePathSystem —— 命途的逻辑层（StateGraph 真实驱动路由，不是木偶）
 *
 * ## 设计
 * - 节点 = 每一道题目的「解析节点」+ 每一张结局卡的「终值节点」；
 * - 条件边只依赖累积的轴（ember/grey/self）+ 第三题的选项；
 * - 每天读一次（UTC 日切），同日重复进入只会看到同一张结局卡；
 * - 存档 = `crossrealm_fortune_path_v1`：只记录 key/最终答案/id/earned；
 * - 不读/不写其他模块的 LS，无副作用。
 */

export const LS = 'crossrealm_fortune_path_v1';
const MAX_HISTORY = 40;

const todayKey = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export class FortunePathSystem {
  constructor(game) {
    this.game = game;
    this.state = this._load();
    this._graph = this._buildGraph();
  }

  _default() {
    return {
      today: '',
      todayEndingId: null,
      todayAnswers: [null, null, null],
      history: [],
      totalSoulsEarned: 0,
      totalDraws: 0,
    };
  }

  _load() {
    if (typeof localStorage === 'undefined') return this._default();
    try {
      const raw = JSON.parse(localStorage.getItem(LS) ?? '{}');
      return {
        ...this._default(),
        ...raw,
        history: Array.isArray(raw?.history) ? raw.history.slice(0, MAX_HISTORY) : [],
      };
    } catch {
      return this._default();
    }
  }

  _save() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LS, JSON.stringify(this.state));
    } catch { /* privacy mode */ }
  }

  canDrawToday() {
    return this.state?.today !== todayKey();
  }

  todayEnding() {
    if (this.state?.today !== todayKey() || !this.state?.todayEndingId) return null;
    return FORTUNE_ENDINGS.find((e) => e.id === this.state.todayEndingId) ?? null;
  }

  /** 历史结局（带 card 引用细节） */
  history() {
    return (this.state?.history ?? [])
      .map((h) => ({ ...h, ending: FORTUNE_ENDINGS.find((e) => e.id === h.id) ?? null }))
      .filter((h) => h.ending);
  }

  /** 抽 / 重看今日结局 */
  resolve(answers) {
    const mapped = (answers ?? []).slice(0, 3).map((v) => (v === 0 || v === 1 || v === 2 ? v : 0));
    if (mapped.length < 3) throw new Error('answers must carry exactly three picks (0/1/2)');

    // 今天已经抽过了：返回当日卡而不触发节点
    if (!this.canDrawToday()) {
      return { ending: this.todayEnding(), souls: 0, drewNew: false };
    }

    const { state } = this._graph.invoke({ picks: mapped });
    const ending = FORTUNE_ENDINGS.find((e) => e.id === state.endingId) ?? FORTUNE_ENDINGS[9];

    const entry = { id: ending.id, ymd: todayKey(), souls: ending.souls, ts: Date.now() };
    this.state = {
      ...this.state,
      today: todayKey(),
      todayEndingId: ending.id,
      todayAnswers: mapped,
      history: [entry, ...(this.state?.history ?? [])].slice(0, MAX_HISTORY),
      totalDraws: (this.state?.totalDraws ?? 0) + 1,
      totalSoulsEarned: (this.state?.totalSoulsEarned ?? 0) + ending.souls,
    };
    this._save();
    return { ending, souls: ending.souls, drewNew: true };
  }

  snapshot() {
    return { ...this.state, todayCanDraw: this.canDrawToday() };
  }

  /** 把 StateGraph 写死进代码：每一次调用都不依赖动态构造（避免重编译开销），只写场景节点 */
  _buildGraph() {
    const Q = QUESTIONS.map((q) => q.key);
    const graph = new StateGraph();

    // 入口：只读预设的 picks（调用者整理好 mapped）
    graph.addNode('intro', () => ({}));

    // 每一问 = 累积一轴；存 q 值供后续路由。轴累计 ember/grey/self
    const accumulate = (key, idx) => (state) => {
      const a = (state.axis ?? [0, 0, 0]).slice();
      const pick = state.picks?.[idx] ?? 0;
      a[pick] = (a[pick] ?? 0) + 1;
      state.axis = a;
      state.axes = a;
      const qpicks = (state.apiPicks ?? []).slice();
      qpicks[idx] = pick;
      state.apiPicks = qpicks;
      return {};
    };
    graph.addNode(Q[0], accumulate('q1', 0));
    graph.addNode(Q[1], accumulate('q2', 1));
    graph.addNode(Q[2], accumulate('q3', 2));

    // 判决——把答案钉成 deterministic endingId
    graph.addNode('verdict', (state) => {
      const axis = state.axis ?? [0, 0, 0];
      const q3 = state.picks?.[2] ?? 0;
      const maxAxis = axis.indexOf(Math.max(...axis));
      // 1-1-1 平票走「风守」
      const allEqual = axis[0] === axis[1] && axis[1] === axis[2];
      let endingId = allEqual ? 'windkeeper' : maxAxis === 0 ? `ember_${q3 + 1}` : maxAxis === 1 ? `grey_${q3 + 1}` : `self_${q3 + 1}`;
      return { endingId };
    });

    graph.setEntryPoint('intro');
    graph.addEdge('intro', Q[0]);
    graph.addEdge(Q[0], Q[1]);
    graph.addEdge(Q[1], Q[2]);
    graph.addEdge(Q[2], 'verdict');

    // 注册末端结局节点（终点）
    for (const e of FORTUNE_ENDINGS) graph.addNode(e.id, () => ({}));

    // 条件边：verdict → endingId
    graph.addConditionalEdges('verdict', (state) => state.endingId);
    return graph.compile();
  }
}
