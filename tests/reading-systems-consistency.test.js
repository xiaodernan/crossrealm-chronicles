/**
 * 双占卜系统「标志位 / 内容」一致性门禁。
 *
 * FlameReadingSystem（日签）与 TrilanceReadingSystem（周盘）在源码注释里
 * 明确写着「同源」——两处都把「周期键」和「内容」拆成两个独立字段存进 LS：
 *   flame:  { today, todayCardId }
 *   trilance: { week, cards }
 *
 * 若只读周期键判断「本期是否已用」，一旦内容字段丢失/损坏（老存档、半截迁移、
 * 多标签同时写、手工改 LS），就会出现：本期标记还在 → 不能再抽 → 内容也拿不到
 * ——玩家被自己上一抽锁死，直到 UTC 周期翻页。这枚门禁同时钉住两个系统：
 * 周期键必须与"可读回的内容"同真同假。
 *
 * 变异判据：把任一 canXxx() 里的"内容兜底"去掉 → 对应的"死锁复现"用例必红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlameReadingSystem } from '../src/game/FlameReadingSystem.js';
import { TrilanceReadingSystem } from '../src/game/TrilanceReadingSystem.js';
import { FortunePathSystem } from '../src/game/FortunePathSystem.js';
import { KindlePassSystem } from '../src/game/KindlePassSystem.js';
import { VigilVowSystem } from '../src/game/VigilVowSystem.js';
import { FLAME_CARDS } from '../src/content/flameDivination.js';
import { TRI_SUN_CARDS } from '../src/content/trilanceReading.js';

const FLAME_LS = 'crossrealm_flame_reading_v1';
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

describe('FlameReadingSystem —— 日签逻辑（此前只有 UI 层测试）', () => {
  it('开局：今天可抽、无今日卡、历史为空、快照字段齐', () => {
    const sys = new FlameReadingSystem({});
    expect(sys.canDrawToday()).toBe(true);
    expect(sys.todayCard()).toBeNull();
    expect(sys.history()).toEqual([]);
    const s = sys.snapshot();
    expect(s).toMatchObject({ totalDraws: 0, totalSoulsEarned: 0, todayCanDraw: true });
  });

  it('draw()：抽到真实卡、当天有卡、计数进账、写进历史', () => {
    const sys = new FlameReadingSystem({});
    const r = sys.draw();
    expect(r.drewNew).toBe(true);
    expect(FLAME_CARDS.some((c) => c.id === r.card.id)).toBe(true);
    expect(r.souls).toBe(r.card.souls);
    expect(sys.todayCard()?.id).toBe(r.card.id);
    expect(sys.snapshot().totalDraws).toBe(1);
    expect(sys.snapshot().totalSoulsEarned).toBe(r.souls);
    expect(sys.history()[0].id).toBe(r.card.id);
  });

  it('同一 UTC 日再抽：drewNew=false / souls=0 / 卡不变 / 计数不涨', () => {
    const sys = new FlameReadingSystem({});
    const first = sys.draw();
    const again = sys.draw();
    expect(again.drewNew).toBe(false);
    expect(again.souls).toBe(0);
    expect(again.card.id).toBe(first.card.id);
    expect(sys.snapshot().totalDraws).toBe(1);
    expect(sys.snapshot().totalSoulsEarned).toBe(first.souls);
    expect(sys.history()).toHaveLength(1);
  });

  it('跨 UTC 日：改掉 today 后可再抽，历史累加而非清零', () => {
    const sys = new FlameReadingSystem({});
    const first = sys.draw();
    sys.state.today = '1999-01-01';
    expect(sys.canDrawToday()).toBe(true);
    const second = sys.draw();
    expect(second.drewNew).toBe(true);
    expect(sys.snapshot().totalDraws).toBe(2);
    expect(sys.history()).toHaveLength(2);
    expect(second.card.id).toBeDefined();
    expect(first.card.id).toBeDefined();
  });

  it('历史硬上限 40：塞 50 条后读档只留 40，再抽仍不超', () => {
    const bogus = Array.from({ length: 50 }, (_, i) => ({
      id: FLAME_CARDS[i % FLAME_CARDS.length].id,
      ymd: '1999-01-01',
      souls: 1,
      ts: i,
    }));
    localStorage.setItem(FLAME_LS, JSON.stringify({
      today: '', todayCardId: null, draws: bogus, totalDraws: 50, totalSoulsEarned: 50,
    }));
    const sys = new FlameReadingSystem({});
    expect(sys.history()).toHaveLength(40);
    sys.draw();
    expect(sys.history()).toHaveLength(40);
  });

  it('奖品卡 id 变更/丢失后：标志位不再构成死锁，玩家能重抽自救', () => {
    const sys = new FlameReadingSystem({});
    const first = sys.draw();
    expect(first.drewNew).toBe(true);
    // 模拟半截存档：today 写了，但 todayCardId 指向一张已不存在的卡
    sys.state.todayCardId = 'card-removed-in-content-update';
    expect(sys.todayCard()).toBeNull();
    expect(sys.canDrawToday()).toBe(true); // ← 守卫：不能自己锁死自己
    const rescue = sys.draw();
    expect(rescue.drewNew).toBe(true);
    expect(sys.todayCard()?.id).not.toBe('card-removed-in-content-update');
    expect(sys.todayCard()).not.toBeNull();
  });

  it('归档坏 JSON 不炸：回落到干净默认态', () => {
    localStorage.setItem(FLAME_LS, '{not-json');
    const sys = new FlameReadingSystem({});
    expect(sys.canDrawToday()).toBe(true); // 回落干净默认态，今天可抽
    expect(() => sys.draw()).not.toThrow();
    expect(sys.snapshot().totalDraws).toBe(1);
  });
});

describe('TrilanceReadingSystem —— 周盘标志位/内容一致性（补现有测试的盲区）', () => {
  it('正常起盘后：本周不能再起（回归，防止守卫修过头）', () => {
    const sys = new TrilanceReadingSystem({});
    const r = sys.castWeek(() => 0);
    expect(r.drewNew).toBe(true);
    expect(sys.canCastThisWeek()).toBe(false);
    expect(sys.thisWeek().cards).toHaveLength(3);
    expect(sys.thisWeek().cards.every((c) => TRI_SUN_CARDS.includes(c))).toBe(true);
  });

  it('cards 字段丢失（null）后：标志位不再构成死锁，本周可重起', () => {
    const sys = new TrilanceReadingSystem({});
    sys.castWeek(() => 0);
    sys.state.cards = null;
    expect(sys.thisWeek()).toBeNull();
    expect(sys.canCastThisWeek()).toBe(true); // ← 守卫
    const rescue = sys.castWeek(() => 0);
    expect(rescue.drewNew).toBe(true);
    expect(sys.thisWeek().cards).toHaveLength(3);
  });

  it('cards 全指向已下架的牌后：也能重起（水合后不足 3 张 = 内容无效）', () => {
    const sys = new TrilanceReadingSystem({});
    sys.castWeek(() => 0);
    sys.state.cards = ['gone-a', 'gone-b', 'gone-c'];
    expect(sys.thisWeek().cards).toEqual([]);
    expect(sys.canCastThisWeek()).toBe(true); // ← 守卫
    const rescue = sys.castWeek(() => 0);
    expect(rescue.drewNew).toBe(true);
    expect(sys.thisWeek().cards).toHaveLength(3);
  });
});

/**
 * 三个 StateGraph 系统（命运签 / 渡灯凭证 / 守夜誓）与上面两枚同源：
 * today 标志位在、todayEndingId 指向已下架结局 → resolve() 早退返回 null 结局，
 * 玩家当天既读不到、也再抽不了。StateGraph 节点本身无错，错在入口闸。
 */
describe.each([
  ['FortunePathSystem', FortunePathSystem, 'crossrealm_fortune_path_v1'],
  ['KindlePassSystem', KindlePassSystem, 'crossrealm_kindle_pass_v1'],
  ['VigilVowSystem', VigilVowSystem, 'crossrealm_vow_path_v1'],
])('%s —— StateGraph 日签的标志位/内容一致性', (_name, System, _ls) => {
  it('正常 resolve 后当天不能再抽（回归，守卫不误伤）', () => {
    const sys = new System({});
    const first = sys.resolve([0, 1, 2]);
    expect(first.drewNew).toBe(true);
    expect(first.ending).toBeTruthy();
    expect(sys.canDrawToday()).toBe(false);
    const again = sys.resolve([0, 1, 2]);
    expect(again.drewNew).toBe(false);
    expect(again.souls).toBe(0);
    expect(again.ending.id).toBe(first.ending.id);
  });

  it('结局 id 下架后：标志位不构成死锁，可重抽自救', () => {
    const sys = new System({});
    const first = sys.resolve([0, 1, 2]);
    expect(first.ending).toBeTruthy();
    sys.state.todayEndingId = 'ending-removed-in-content-update';
    expect(sys.todayEnding()).toBeNull();
    expect(sys.canDrawToday()).toBe(true); // ← 守卫
    const rescue = sys.resolve([0, 1, 2]);
    expect(rescue.drewNew).toBe(true);
    expect(rescue.ending).toBeTruthy();
    expect(sys.todayEnding()).toBeTruthy();
    expect(sys.todayEnding().id).not.toBe('ending-removed-in-content-update');
    expect(sys.todayEnding().id).toBe(rescue.ending.id);
  });
});
