/**
 * 三日曜盘隔离化单测：周闸 / 抽牌 / 合帘 / 持久化，全部注入式（不动真随机）。
 *
 * 抽样规则可推导：
 *   TRI_SUN_CARDS 数组序 = still(¥1), number(¥1), unlit(¥1), wax(¥2), seat(¥2), letter(¥2), hollow(¥3), keeper(¥3)
 *   dealTrilance(rng=() => 0)  每次取"当前头"（索引 0） ⇒ still, number, unlit = ¥1 ¥1 ¥1 ⇒ aligned + 30%（30+9=39）
 *   dealTrilance(rng=() => 0.9999999) 每次取"当前尾" ⇒ keeper, hollow, letter = ¥3 ¥3 ¥2 ⇒ staggered（35+35+20=90）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TrilanceReadingSystem } from '../src/game/TrilanceReadingSystem.js';
import { TRI_SUN_CARDS, dealTrilance } from '../src/content/trilanceReading.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const LS = 'crossrealm_trilance_reading_v1';
let realLS;
const store = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
  };
};

beforeEach(() => {
  realLS = globalThis.localStorage;
  globalThis.localStorage = store();
});
afterEach(() => { globalThis.localStorage = realLS; });

describe('TrilanceReadingSystem —— 三日曜盘（周闸 · 三卡 · 合帘）', () => {
  it('weekKey 形如 YYYY-Www（UTC ISO-8601）', () => {
    const sys = new TrilanceReadingSystem({});
    expect(sys.weekKey()).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('TRI_SUN_CARDS：8 张牌，¥1×3 / ¥2×3 / ¥3×2，名字双语都填了', () => {
    expect(TRI_SUN_CARDS.length).toBe(8);
    expect(TRI_SUN_CARDS.filter((c) => c.rarity === 1)).toHaveLength(3);
    expect(TRI_SUN_CARDS.filter((c) => c.rarity === 2)).toHaveLength(3);
    expect(TRI_SUN_CARDS.filter((c) => c.rarity === 3)).toHaveLength(2);
    for (const c of TRI_SUN_CARDS) {
      expect(c.zh.name.length).toBeGreaterThan(0);
      expect(c.en.name.length).toBeGreaterThan(0);
      expect(c.zh.line.length).toBeGreaterThan(0);
      expect(c.en.line.length).toBeGreaterThan(0);
      expect(c.souls).toBeGreaterThanOrEqual(10);
    }
  });

  it('dealTrilance(rng=() => 0)：静态数组头三张 —— 三 ¥1', () => {
    const cards = dealTrilance(() => 0);
    expect(cards.map((c) => c.id)).toEqual(['trilance-still', 'trilance-number', 'trilance-unlit']);
    expect(new Set(cards.map((c) => c.id)).size).toBe(3);
  });

  it('castWeek(rng=() => 0)：起盘 + 合帘，魂 = 30 + 30% = 39，持久化进 LS', () => {
    const sys = new TrilanceReadingSystem({});
    const r = sys.castWeek(() => 0);
    expect(r.drewNew).toBe(true);
    expect(r.aligned).toBe(true);
    expect(r.souls).toBe(39);
    expect(sys.thisWeek().cards.map((c) => c.id)).toEqual(['trilance-still', 'trilance-number', 'trilance-unlit']);
    expect(sys.snapshot().totalWeeks).toBe(1);
    const persisted = JSON.parse(globalThis.localStorage.getItem(LS));
    expect(persisted.week).toBe(sys.weekKey());
    expect(persisted.aligned).toBe(true);
  });

  it('castWeek(rng=() => 0.9999999)：起盘 + 非合帘（3,3,2），魂 = 35+35+20 = 90', () => {
    const sys = new TrilanceReadingSystem({});
    const r = sys.castWeek(() => 0.9999999);
    expect(r.aligned).toBe(false);
    expect(r.souls).toBe(90);
  });

  it('同一周第二次起盘：drewNew=false，souls=0，牌不变，totalWeeks 不涨', () => {
    const sys = new TrilanceReadingSystem({});
    const first = sys.castWeek(() => 0);
    const second = sys.castWeek(() => 0);
    expect(second.drewNew).toBe(false);
    expect(second.souls).toBe(0);
    expect(second.cards.map((c) => c.id)).toEqual(first.cards.map((c) => c.id));
    expect(sys.snapshot().totalWeeks).toBe(1);
  });

  it('旧周（1999-W01）可以重新起盘；totalWeeks +1', () => {
    globalThis.localStorage.setItem(LS, JSON.stringify({
      week: '1999-W01', cards: ['trilance-keeper'], souls: 35, aligned: false,
      totalWeeks: 4, totalSoulsEarned: 100, history: [],
    }));
    const sys = new TrilanceReadingSystem({});
    expect(sys.canCastThisWeek()).toBe(true);
    sys.castWeek(() => 0);
    expect(sys.snapshot().totalWeeks).toBe(5);
  });

  it('history 记录周条目（cards 已水合为对象）', () => {
    const sys = new TrilanceReadingSystem({});
    sys.castWeek(() => 0);
    const [row] = sys.history();
    expect(row.cards).toHaveLength(3);
    expect(row.cards[0].id).toBe('trilance-still');
    expect(row.week).toBe(sys.weekKey());
  });

  it('LS 配额满时不炸（setItem 抛出也静默，本周状态可用）', () => {
    globalThis.localStorage.setItem = () => { throw new Error('quota'); };
    const sys = new TrilanceReadingSystem({});
    const r = sys.castWeek(() => 0);
    expect(r.drewNew).toBe(true);
    expect(sys.thisWeek()).not.toBeNull();
  });

  it('trilance 静态 UI 键在中英表里同名同义（防止渲染 MISSING）', () => {
    const keys = [
      'journal_tab_trilance', 'trilance_intro', 'trilance_cast_cta', 'trilance_cast_done',
      'trilance_placeholder_hint', 'trilance_history_title', 'trilance_history_empty',
      'trilance_stats_weeks_fmt', 'trilance_souls_total_fmt', 'trilance_souls_reward',
      'trilance_aligned_title', 'trilance_aligned_text', 'trilance_aligned_bonus_fmt',
      'trilance_staggered_title', 'trilance_staggered_text',
      'trilance_reveal_left', 'trilance_reveal_mid', 'trilance_reveal_right',
    ];
    for (const k of keys) {
      expect(typeof STRINGS_ZH[k], `zh ${k}`).toBe('string');
      expect(typeof STRINGS_EN[k], `en ${k}`).toBe('string');
      expect(STRINGS_ZH[k].length, `zh ${k} empty`).toBeGreaterThan(0);
      expect(STRINGS_EN[k].length, `en ${k} empty`).toBeGreaterThan(0);
    }
  });
});
