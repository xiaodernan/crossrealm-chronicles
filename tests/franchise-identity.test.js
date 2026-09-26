/**
 * 母题（franchise）身份与分桶统计（修 B36）。
 *
 * `tests/content-boundary.test.js` 只能证明源码里没人再拿中文母题名做判定；
 * 证明不了**数据本身**自洽 —— 目录里加一条回声、给成就写了个对不上的门限，
 * 静态扫描全都是绿的。所以这里既扫数据表，也真跑一遍 `attachPopCultureAchievements`
 * 的统计路径（那条路径此前只在 lint 里露过一次马脚：桶名写错没人发现）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FRANCHISE, FRANCHISE_LABELS, franchiseLabel } from '../src/content/franchises.js';
import { ECHOES } from '../src/content/echoes.js';
import { ACHIEVEMENTS_POP_CULTURE, ECHO_FRANCHISE_BUCKETS } from '../src/content/achievements.js';
import { attachPopCultureAchievements } from '../src/game/PopCultureAchievementExtras.js';
import { installWindowShim } from './helpers/enemyHarness.js';

const countOf = (franchise) => ECHOES.filter((e) => e.franchise === franchise).length;

/** 只给 `attach` 用到的那几个接口：它读 sys.unlocked / sys.getStats / sys.getEntries */
const makeAch = (unlockedIds) => {
  const sys = {
    unlocked: new Set(unlockedIds),
    getStats: () => ({ unlocked: unlockedIds.length, total: ECHOES.length, percent: 100 }),
    getEntries: () => ECHOES,
  };
  return { game: { popCulture: sys }, stats: {}, checks: 0, checkAll() { this.checks += 1; } };
};

const collect = () => {
  const ach = makeAch(ECHOES.map((e) => e.id));
  attachPopCultureAchievements(ach);
  window.dispatchEvent(new CustomEvent('pop-culture-unlocked'));
  return ach;
};

describe('母题身份表', () => {
  it('每条回声的母题都是 FRANCHISE 里的 id，显示名既不缺失也不等于 id', () => {
    const ids = Object.values(FRANCHISE);
    const bad = ECHOES.filter((e) =>
      !ids.includes(e.franchise) || !FRANCHISE_LABELS[e.franchise] || FRANCHISE_LABELS[e.franchise] === e.franchise);
    expect(bad.map((e) => `${e.id}:${e.franchise}`)).toEqual([]);
  });

  it('母题表里每个 id 目录中都有货（不留空桶）', () => {
    const used = new Set(ECHOES.map((e) => e.franchise));
    expect(Object.values(FRANCHISE).filter((f) => !used.has(f))).toEqual([]);
  });

  it('franchiseLabel 认得的用它自己，认不出的原样交回（不吞掉未知 id）', () => {
    expect(franchiseLabel(FRANCHISE.WIZARD)).toBe(FRANCHISE_LABELS[FRANCHISE.WIZARD]);
    expect(franchiseLabel('not-a-franchise')).toBe('not-a-franchise');
  });
});

describe('成就门槛与目录条数对齐', () => {
  it('每个分桶母题都有一个成就正好在「全解锁」那一刻达成', () => {
    const offenders = [];
    for (const [key, franchise] of ECHO_FRANCHISE_BUCKETS) {
      const n = countOf(franchise);
      if (!n) { offenders.push(`${key}: 母题 ${franchise} 在目录里一条都没有`); continue; }
      // 差一条就不该算「共鸣全部」：门槛必须正好压在条数上
      const sensitive = ACHIEVEMENTS_POP_CULTURE.filter(
        (a) => a.check({ [key]: n }) !== a.check({ [key]: n - 1 }),
      );
      if (!sensitive.length) offenders.push(`${key}: 母题 ${franchise} 实有 ${n} 条，却没有以此门槛达成的成就`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('解锁全部回声后的分桶统计', () => {
  beforeEach(() => installWindowShim());

  it('每个桶的数量等于目录里该母题的条数，且真的跑过 checkAll', () => {
    const ach = collect();
    expect(ach.checks).toBe(1);
    for (const [key, franchise] of ECHO_FRANCHISE_BUCKETS) {
      expect(ach.stats[key], `${key} 应等于 ${franchise} 的条数`).toBe(countOf(franchise));
    }
    expect(Object.values(FRANCHISE).reduce((s, f) => s + countOf(f), 0))
      .toBe(ECHOES.length);
  });

  it('把母题显示名换成乱码后，统计一字不差（改名只会改文案，不会改内容）', () => {
    const baseline = collect().stats;
    const saved = { ...FRANCHISE_LABELS };
    for (const k of Object.keys(FRANCHISE_LABELS)) FRANCHISE_LABELS[k] = '@@@';
    try {
      expect(collect().stats).toEqual(baseline);
    } finally {
      for (const k of Object.keys(FRANCHISE_LABELS)) delete FRANCHISE_LABELS[k];
      Object.assign(FRANCHISE_LABELS, saved);
    }
  });

  it('一条都没解锁时各桶为 0，而不是 undefined（成就判定不抛）', () => {
    const ach = makeAch([]);
    attachPopCultureAchievements(ach);
    window.dispatchEvent(new CustomEvent('pop-culture-unlocked'));
    for (const [key] of ECHO_FRANCHISE_BUCKETS) {
      expect(ach.stats[key]).toBe(0);
      expect(() => ACHIEVEMENTS_POP_CULTURE.forEach((a) => a.check(ach.stats))).not.toThrow();
    }
  });
});
