import { StateGraph } from '../core/StateGraph.js';
import { PASS_QUESTIONS, PASS_ENDINGS } from '../content/kindlePass.js';

/**
 * KindlePassSystem — 炉火的交棒（StateGraph 驱动的传承链）
 *
 * 锚火三问之后的最后一课——
 *   Q1 · 阿祖说「炉火，我要走了」。炉火让你回答它一件事。
 *   Q2 · 炉火让你做第二件事。
 *   Q3 · 炉火把最亮的一点光照在你手心。你以什么记住这一晚？
 *
 * 设计（与 FortunePath / VigilVow 同源，意图递进）：
 *   - 锚火三问是 "你必须直视自己"；守火祈愿是 "你对一炉火忠诚"；
 *   - 炉火的交棒是 "七百年换一次手——火不过是从一个手心过到另一个"
 *   - 判定：2+ 落到同一轴则落到对应结局，1-1-1 平票走「无名守火人」
 *   - 每日 UTC 日切，同日重复进入只看得到当日的交棒终局
 *   - 落盘 = `crossrealm_kindle_pass_v1`；不读写任何其他模块的 LS
 *   - 不读/不写其他模块（无副作用）
 */

export const LS = 'crossrealm_kindle_pass_v1';
const MAX_HISTORY = 40;

const todayKey = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export class KindlePassSystem {
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
    return PASS_ENDINGS.find((e) => e.id === this.state.todayEndingId) ?? null;
  }

  history() {
    return (this.state?.history ?? [])
      .map((h) => ({ ...h, ending: PASS_ENDINGS.find((e) => e.id === h.id) ?? null }))
      .filter((h) => h.ending);
  }

  resolve(answers) {
    const mapped = (answers ?? []).slice(0, 3).map((v) => (v === 0 || v === 1 || v === 2 ? v : 0));
    if (mapped.length < 3) throw new Error('answers must carry exactly three picks (0/1/2)');

    if (!this.canDrawToday()) {
      return { ending: this.todayEnding(), souls: 0, drewNew: false };
    }

    const { state } = this._graph.invoke({ picks: mapped });
    const ending = PASS_ENDINGS.find((e) => e.id === state.endingId) ?? PASS_ENDINGS[9];

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

  /** StateGraph: deterministic endings, no dice, no randomness. */
  _buildGraph() {
    const Q = PASS_QUESTIONS.map((q) => q.key);
    const graph = new StateGraph();

    graph.addNode('intro', () => ({}));

    const accumulate = (idx) => (state) => {
      const a = (state.axis ?? [0, 0, 0]).slice();
      const pick = state.picks?.[idx] ?? 0;
      a[pick] = (a[pick] ?? 0) + 1;
      state.axis = a;
      return {};
    };
    graph.addNode(Q[0], accumulate(0));
    graph.addNode(Q[1], accumulate(1));
    graph.addNode(Q[2], accumulate(2));

    graph.addNode('verdict', (state) => {
      const axis = state.axis ?? [0, 0, 0];
      const q3 = state.picks?.[2] ?? 0;
      const maxAxis = axis.indexOf(Math.max(...axis));
      const allEqual = axis[0] === axis[1] && axis[1] === axis[2];
      const endingId = allEqual ? 'heirkeeper'
        : maxAxis === 0 ? `kindle_${q3 + 1}` : maxAxis === 1 ? `tend_${q3 + 1}` : `root_${q3 + 1}`;
      return { endingId };
    });

    graph.setEntryPoint('intro');
    graph.addEdge('intro', Q[0]);
    graph.addEdge(Q[0], Q[1]);
    graph.addEdge(Q[1], Q[2]);
    graph.addEdge(Q[2], 'verdict');
    for (const e of PASS_ENDINGS) graph.addNode(e.id, () => ({}));
    graph.addConditionalEdges('verdict', (state) => state.endingId);
    return graph.compile();
  }
}
