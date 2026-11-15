import { TRI_SUN_CARDS, dealTrilance } from '../content/trilanceReading.js';

/**
 * TrilanceReadingSystem —— 三日曜盘（周占卜）
 *
 * ## 架构与焰占卜同源（FlameReadingSystem），但两处不同：
 *
 *   - 周期是 UTC 周（ISO-8601 week），不是 UTC 日
 *   - 一次三张牌（左阳/中阳/右阳），不重复抽取（dealTrilance 内 Fisher–Yates）
 *
 * ## 合帘 / Aligned
 *
 * 三张卡同档（全 ★1 / ★2 / ★3）→ aligned：额外 +30% 魂。
 * 杂档 → staggered：不再加成。数值口径与 flame 同级（总 ~30-100 魂/周），
 * 但给玩家的每周"仪式感"高于每日的休闲感。
 *
 * ## 持久化
 *
 * `crossrealm_trilance_reading_v1`：
 *   { week, cards: [id,id,id], souls, aligned, totalWeeks, totalSoulsEarned, history: [{ week, souls, aligned, cards }] }
 */
const LS = 'crossrealm_trilance_reading_v1';
const MAX_HISTORY = 26;
const ALIGNED_BONUS = 0.3;

const isoWeekKey = (date = new Date()) => {
  // ISO-8601 week number (UTC)
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday=1..Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

export class TrilanceReadingSystem {
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
        history: Array.isArray(raw?.history) ? raw.history.slice(0, MAX_HISTORY) : [],
      };
    } catch {
      return this._default();
    }
  }

  _default() {
    return {
      week: '',
      cards: null, // ['id','id','id']
      souls: 0,
      aligned: false,
      totalWeeks: 0,
      totalSoulsEarned: 0,
      history: [],
    };
  }

  _save() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(LS, JSON.stringify(this.state));
    } catch { /* quota — silent */ }
  }

  weekKey() { return isoWeekKey(); }

  canCastThisWeek() {
    return this.state?.week !== this.weekKey();
  }

  /** 本周已起的曜盘（未起则 null） */
  thisWeek() {
    if (this.state?.week !== this.weekKey() || !Array.isArray(this.state?.cards)) return null;
    const cards = this.state.cards.map((id) => TRI_SUN_CARDS.find((c) => c.id === id)).filter(Boolean);
    return { cards, souls: this.state.souls ?? 0, aligned: !!this.state?.aligned };
  }

  /**
   * 起曜盘：本周一次；连续结算
   * @returns {{ cards: object[], souls: number, aligned: boolean, drewNew: boolean }}
   */
  castWeek(rng = Math.random) {
    if (!this.canCastThisWeek()) {
      const cur = this.thisWeek();
      return { cards: cur?.cards ?? [], souls: 0, aligned: cur?.aligned ?? false, drewNew: false };
    }
    const picked = dealTrilance(rng, 3);
    const rarities = picked.map((c) => c.rarity);
    const aligned = rarities.every((r) => r === rarities[0]);
    const base = picked.reduce((sum, c) => sum + c.souls, 0);
    const souls = aligned ? Math.round(base * (1 + ALIGNED_BONUS)) : base;
    const entry = {
      week: this.weekKey(),
      souls,
      aligned,
      cards: picked.map((c) => c.id),
      ts: Date.now(),
    };
    this.state = {
      ...this.state,
      week: this.weekKey(),
      cards: entry.cards,
      souls,
      aligned,
      totalWeeks: (this.state.totalWeeks ?? 0) + 1,
      totalSoulsEarned: (this.state.totalSoulsEarned ?? 0) + souls,
      history: [entry, ...(this.state.history ?? [])].slice(0, MAX_HISTORY),
    };
    this._save();
    return { cards: picked, souls, aligned, drewNew: true };
  }

  history() {
    return (this.state?.history ?? []).map((h) => ({
      ...h,
      cards: (h.cards ?? []).map((id) => TRI_SUN_CARDS.find((c) => c.id === id)).filter(Boolean),
    }));
  }

  snapshot() {
    return { ...this.state, canCast: this.canCastThisWeek(), week: this.weekKey() };
  }
}
