import { StateGraph } from '../core/StateGraph.js';
import { VOW_QUESTIONS, VOW_ENDINGS } from '../content/vigilVow.js';

/**
 * VigilVowSystem — 星轨 · 炉火祈愿（StateGraph 驱动的炉火祈愿链）
 *
 * 锚火三问之后那三个祈愿——
 *   Q1 · 你独自站在灶前——炉火快要熄了。你说了什么？
 *   Q2 · 第一次让你独自守火的那个夜晚，你做了什么？
 *   Q3 · 炉火终于有了名字。你记住那天以什么？
 *
 * 设计（与 FortunePath 同源，意图相反）：
 *   - 锚火三问是 "你必须直视自己"；守火祈愿是 "你对一个灶火忠诚"
 *   - 判定：2+ 落到同一轴则恭敬落到对应结局，1-1-1 平票走「无名炉」
 *   - 每日 UTC 日切，同日重复进入只看得到当日的祈愿终局
 *   - 落盘 = `crossrealm_vow_path_v1`；不读写任何其他模块的 LS
 *   - 不读/不写其他模块（无副作用）
 */

export const LS = 'crossrealm_vow_path_v1';
const MAX_HISTORY = 40;

const todayKey = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export class VigilVowSystem {
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
    return VOW_ENDINGS.find((e) => e.id === this.state.todayEndingId) ?? null;
  }

  history() {
    return (this.state?.history ?? [])
      .map((h) => ({ ...h, ending: VOW_ENDINGS.find((e) => e.id === h.id) ?? null }))
      .filter((h) => h.ending);
  }

  resolve(answers) {
    const mapped = (answers ?? []).slice(0, 3).map((v) => (v === 0 || v === 1 || v === 2 ? v : 0));
    if (mapped.length < 3) throw new Error('answers must carry exactly three picks (0/1/2)');

    if (!this.canDrawToday()) {
      return { ending: this.todayEnding(), souls: 0, drewNew: false };
    }

    const { state } = this._graph.invoke({ picks: mapped });
    const ending = VOW_ENDINGS.find((e) => e.id === state.endingId) ?? VOW_ENDINGS[9];

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
    const Q = VOW_QUESTIONS.map((q) => q.key);
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
      const endingId = allEqual ? 'windkeeper'
        : maxAxis === 0 ? `ember_${q3 + 1}` : maxAxis === 1 ? `grey_${q3 + 1}` : `self_${q3 + 1}`;
      return { endingId };
    });

    graph.setEntryPoint('intro');
    graph.addEdge('intro', Q[0]);
    graph.addEdge(Q[0], Q[1]);
    graph.addEdge(Q[1], Q[2]);
    graph.addEdge(Q[2], 'verdict');
    for (const e of VOW_ENDINGS) graph.addNode(e.id, () => ({}));
    graph.addConditionalEdges('verdict', (state) => state.endingId);
    return graph.compile();
  }
}
