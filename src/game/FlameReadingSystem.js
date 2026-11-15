import { FLAME_CARDS } from '../content/flameDivination.js';

/**
 * FlameReadingSystem —— 锚火占卜的纯粹逻辑层
 *
 * ## 为什么单独抽一层 System 类而不是塞进 UI
 *
 * | 层级 | 职责 |
 * |---|---|
 * | UI（FlameReadingTab） | 展示 / 触发按钮 / 进度条 / 触发的魂反馈 / 成就 |
 * | System（本文件） | 存档、抽卡、当日判重、历史 |
 *
 * 之所以如此：占卜一天一次的节奏、存历史、收玩家已占卜轨迹——这些逻辑
 * 属于"世界里有记忆"，不该让它成为 UI 的附属品（UI 可以被拆掉、被重构、
 * 被静音；但"今天你已经占过了"这件事必须一直正确）。
 *
 * ## UTC 日判重
 *
 * "每日一次" 按 UTC 日边界切——无论 UTC 还是当地日已经够复杂了，
 * 在 UTC 日一天只占一次，不用纠结用户时区、跨 DST。返回 `false` 代表今日已占。
 */
const LS = 'crossrealm_flame_reading_v1';
const MAX_HISTORY = 40;

const todayKey = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

export class FlameReadingSystem {
  constructor(game) {
    this.game = game;
    this.state = this._load();
  }

  _load() {
    if (typeof localStorage === 'undefined') return this._default();
    try {
      const raw = JSON.parse(localStorage.getItem(LS) ?? '{}');
      return {
        ...this._default(),
        ...raw,
        draws: Array.isArray(raw?.draws) ? raw.draws.slice(0, MAX_HISTORY) : [],
      };
    } catch {
      return this._default();
    }
  }

  _default() {
    return {
      today: '',
      todayCardId: null,
      draws: [],
      totalSoulsEarned: 0,
      totalDraws: 0,
    };
  }

  _save() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LS, JSON.stringify(this.state));
    } catch { /* 隐私模式 / 配额满 → 静默 */ }
  }

  /** 今天可否再占一张（UTC 边界） */
  canDrawToday() {
    return this.state?.today !== todayKey();
  }

  /** 今天已占的卡（若无 → null） */
  todayCard() {
    if (this.state?.today !== todayKey() || !this.state?.todayCardId) return null;
    return FLAME_CARDS.find((c) => c.id === this.state.todayCardId) ?? null;
  }

  /**
   * 抽一张卡（纯逻辑；souls 反馈由调用方处理——相互依赖少了一层耦合）。
   * @returns {{card: object|null, souls: number, drewNew: boolean}}
   */
  draw() {
    if (!this.canDrawToday()) {
      const card = this.todayCard();
      return { card, souls: 0, drewNew: false };
    }
    const card = FLAME_CARDS[Math.floor(Math.random() * FLAME_CARDS.length)];
    const entry = { id: card.id, ymd: todayKey(), souls: card.souls, ts: Date.now() };
    this.state = {
      ...this.state,
      today: todayKey(),
      todayCardId: card.id,
      draws: [entry, ...(this.state.draws ?? [])].slice(0, MAX_HISTORY),
      totalDraws: (this.state.totalDraws ?? 0) + 1,
      totalSoulsEarned: (this.state.totalSoulsEarned ?? 0) + card.souls,
    };
    this._save();
    return { card, souls: card.souls, drewNew: true };
  }

  /** 历史已占的卡面集合（供 UI 展示） */
  history() {
    return (this.state?.draws ?? []).map((d) => ({ ...d, card: FLAME_CARDS.find((c) => c.id === d.id) ?? null })).filter((d) => d.card);
  }

  /** 今日抽到的卡与当前积分，给 Debug/inspector 用 */
  snapshot() {
    return { ...this.state, todayCanDraw: this.canDrawToday() };
  }
}
