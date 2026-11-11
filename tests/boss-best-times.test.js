/**
 * 个人最速通关记账（W-G5 切片1）
 *
 * 三条纪律对应三组用例：
 * 1. **坏档自愈** —— 读/写任何一步抛异常（隐私模式、磁盘满、JSON 被手改）都不许炸；
 * 2. **非有限数/非正数一律不收** —— NaN/Infinity/≤0 写进账本等于传染下一个页面；
 * 3. **单调收紧** —— 只接受更快的成绩（`<`），同分不覆盖先做到的那一版。
 */
import { describe, it, expect } from 'vitest';
import { BossBestTimes } from '../src/game/BossBestTimes.js';

/** 内存版 Storage：只实现 getItem/setItem/removeItem 三个方法 */
function fakeStorage(initial = null) {
  const map = new Map(initial ? Object.entries(initial) : []);
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe('W-G5 BossBestTimes · 记账与收紧', () => {
  it('首次记入即写入本地；慢的那次不覆盖', () => {
    const s = fakeStorage();
    const b = new BossBestTimes(s);
    const first = b.consider('shadow-warden', 120_000);
    expect(first).toEqual({ improved: true, bestMs: 120_000 });
    const slower = b.consider('shadow-warden', 180_000);
    expect(slower.improved).toBe(false);
    expect(slower.bestMs).toBe(120_000);
    expect(b.best('shadow-warden')).toBe(120_000);
  });

  it('更快的那次覆盖；同分不覆盖（先做到的版本永远是更早的那一刻）', () => {
    const b = new BossBestTimes(fakeStorage());
    b.consider('archmagus', 100_000);
    const same = b.consider('archmagus', 100_000);
    expect(same.improved).toBe(false);
    const faster = b.consider('archmagus', 99_000);
    expect(faster.improved).toBe(true);
    expect(b.best('archmagus')).toBe(99_000);
  });

  it('非法输入全部静默拒收：NaN/Infinity/≤0/空串 bossId', () => {
    const b = new BossBestTimes(fakeStorage());
    for (const [bossId, ms] of [['a', NaN], ['a', Infinity], ['a', 0], ['a', -5], ['', 1000], [123, 1000], [undefined, 1000]]) {
      expect(b.consider(bossId, ms).improved).toBe(false);
    }
    expect(b.size()).toBe(0);
  });

  it('重启后仍在（跨实例读同一把钥匙）', () => {
    const s = fakeStorage();
    new BossBestTimes(s).consider('void-chronarch', 88_000);
    const fresh = new BossBestTimes(s);
    expect(fresh.best('void-chronarch')).toBe(88_000);
  });
});

describe('W-G5 BossBestTimes · 坏档自愈', () => {
  it('JSON 被手改 → 空账本，不抛不炸', () => {
    const s = fakeStorage({ crossrealm_boss_best_v1: '{broken json' });
    const b = new BossBestTimes(s);
    expect(b.size()).toBe(0);
    expect(b.consider('chaos-overlord', 61_000).improved).toBe(true);
  });

  it('条目里混入 NaN/≤0/非字符串键 → 全部被过滤', () => {
    const s = fakeStorage({
      crossrealm_boss_best_v1: JSON.stringify({
        good: 60_000,
        badNaN: NaN,          // JSON.stringify(NaN) → null
        zero: 0,
        negative: -1000,
      }),
    });
    const b = new BossBestTimes(s);
    expect(b.best('good')).toBe(60_000);
    expect(b.best('zero')).toBe(null);
    expect(b.best('negative')).toBe(null);
    expect(b.best('badNaN')).toBe(null);
  });

  it('setItem 抛异常（隐私模式/磁盘满）→ consider 照常返回，不抛', () => {
    const s = fakeStorage();
    s.setItem = () => { throw new Error('quota exceeded'); };
    const b = new BossBestTimes(s);
    const r = b.consider('shadow-warden', 100_000);
    expect(r.improved).toBe(true);
    expect(b.best('shadow-warden')).toBe(100_000);
  });
});

describe('W-G5 BossBestTimes · 榜式出参', () => {
  it('top()：按用时升序、bossId 字典序 tie-break、cap 生效', () => {
    const b = new BossBestTimes(fakeStorage());
    b.consider('archmagus', 90_000);
    b.consider('shadow-warden', 60_000);
    b.consider('singularity-herald', 60_000);
    b.consider('chaos-overlord', 120_000);
    expect(b.top(10).map((r) => r.bossId)).toEqual(['shadow-warden', 'singularity-herald', 'archmagus', 'chaos-overlord']);
    expect(b.top(2).map((r) => r.bossId)).toEqual(['shadow-warden', 'singularity-herald']);
    expect(b.top(0)).toHaveLength(1);
  });
});
