/**
 * FortunePathSystem — 命途的单测钉住：
 *   - StateGraph 真实在跑，所有 endings 可由输入答案精准抵达；
 *   - 同 UTC 日同一答案 → 同一结局，重复 resolve 不重复兑魂；
 *   - LS 落盘；双语表均持新键（全值校验）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FortunePathSystem } from '../src/game/FortunePathSystem.js';
import { FORTUNE_ENDINGS } from '../src/content/fortunePath.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const LS = 'crossrealm_fortune_path_v1';
let realLS;
const fresh = () => {
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
  globalThis.localStorage = fresh();
});
afterEach(() => { globalThis.localStorage = realLS; });

const freshSys = () => {
  globalThis.localStorage.clear();
  return new FortunePathSystem({});
};

describe('FortunePathSystem — 逐结局可达（StateGraph 真实路由）', () => {
  it('ember 轴 a/b/c → ember_1 / ember_2 / ember_3', () => {
    expect(freshSys().resolve([0, 0, 0]).ending.id).toBe('ember_1');
    expect(freshSys().resolve([0, 0, 1]).ending.id).toBe('ember_2');
    expect(freshSys().resolve([0, 0, 2]).ending.id).toBe('ember_3');
  });

  it('grey 轴 a/b/c → grey_1 / grey_2 / grey_3', () => {
    expect(freshSys().resolve([1, 1, 0]).ending.id).toBe('grey_1');
    expect(freshSys().resolve([1, 1, 1]).ending.id).toBe('grey_2');
    expect(freshSys().resolve([1, 1, 2]).ending.id).toBe('grey_3');
  });

  it('self 轴 a/b/c → self_1 / self_2 / self_3', () => {
    expect(freshSys().resolve([2, 2, 0]).ending.id).toBe('self_1');
    expect(freshSys().resolve([2, 2, 1]).ending.id).toBe('self_2');
    expect(freshSys().resolve([2, 2, 2]).ending.id).toBe('self_3');
  });

  it('1-1-1 平票 → windkeeper', () => {
    const sys = freshSys();
    const { ending } = sys.resolve([0, 1, 2]);
    expect(ending.id).toBe('windkeeper');
  });

  it('resolver 后缀联锁：相同三选 → 同一 ending（确定性，不掺随机）', () => {
    const a = freshSys().resolve([0, 0, 0]).ending.id;
    const b = freshSys().resolve([0, 0, 0]).ending.id;
    expect(a).toBe(b);
  });

  it('所有 endings shape 完整（双语 name + line + souls + rarity∈{1,2,3}）', () => {
    expect(FORTUNE_ENDINGS.length).toBe(10);
    for (const e of FORTUNE_ENDINGS) {
      expect(typeof e.id).toBe('string');
      expect([1, 2, 3]).toContain(e.rarity);
      expect(e.zh.name.length).toBeGreaterThan(0);
      expect(e.en.name.length).toBeGreaterThan(0);
      expect(e.zh.line.length).toBeGreaterThan(0);
      expect(e.en.line.length).toBeGreaterThan(0);
      expect(e.souls).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('FortunePathSystem — 每 UTC 日只写一次', () => {
  it('同日 resolve：drewNew=true → 第二次 drewNew=false（同一 ending，魂 0）', () => {
    const sys = new FortunePathSystem({});
    const first = sys.resolve([0, 0, 0]);
    expect(first.drewNew).toBe(true);
    const second = sys.resolve([2, 2, 2]);
    expect(second.drewNew).toBe(false);
    expect(second.souls).toBe(0);
    expect(second.ending.id).toBe(first.ending.id);
    expect(sys.snapshot().totalDraws).toBe(1);
  });
});

describe('FortunePathSystem — LS 持久化与快照', () => {
  it('resolve → LS 键 crossrealm_fortune_path_v1 落盘字段完整', () => {
    const sys = new FortunePathSystem({});
    sys.resolve([0, 0, 1]);
    const persisted = JSON.parse(globalThis.localStorage.getItem(LS));
    expect(persisted.todayEndingId).toBeTruthy();
    expect(Array.isArray(persisted.history)).toBe(true);
    expect(persisted.totalDraws).toBe(1);
    expect(persisted.totalSoulsEarned).toBeGreaterThan(0);
    expect(persisted.todayAnswers).toEqual([0, 0, 1]);
  });

  it('todayEnding() 串回完整结局卡', () => {
    const sys = new FortunePathSystem({});
    sys.resolve([2, 2, 1]);
    const card = sys.todayEnding();
    expect(card.id).toBe('self_2');
    expect(typeof card.souls).toBe('number');
    expect(card.zh.name.length).toBeGreaterThan(0);
  });
});

describe('FortunePathSystem — 字符串覆盖', () => {
  const keys = ['path_intro', 'path_hint', 'path_souls_reward', 'path_total_draws_fmt', 'path_total_souls_fmt', 'path_history_title', 'path_history_empty', 'journal_tab_path'];
  for (const k of keys) {
    it(`both STRINGS[${k}] present`, () => {
      expect(STRINGS_ZH[k]).toBeTruthy();
      expect(STRINGS_EN[k]).toBeTruthy();
    });
  }
});
