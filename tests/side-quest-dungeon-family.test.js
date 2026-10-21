/**
 * 第四族专属支线：**那位面的副本**（W-E3 切片7）。
 *
 * ## 这一族是什么
 *
 * 前三族的事实都发生在**野外**（歇脚与插画 / 萤火与火牌 / 清剿数）—— 第四样是
 * **副本**：那位面里那座地下城有没有被下过。它是全局最长的一段内容 ⇒
 * "那位面你到底下过没有"值得单列一条。
 *
 * ## 事实从哪来：位面 → 副本的映射是**推导**的
 *
 * 用的是**副本定义表里那格 `zone`**（W-B10 切片7 新增）⇒ 改副本的位面，那一支跟着改
 * —— 不存在"名单与表各说一套"的可能（手抄一份就是第二份真相：改了表而名单没改，
 * 那一支就永远做不完）。
 */
import { describe, it, expect } from 'vitest';
import { SIDE_QUESTS_ZONE, SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { ZONE_IDS, ZONE_ORDER } from '../src/content/ZoneIdentity.js';

const 副本族 = SIDE_QUESTS_ZONE.filter((q) => q.id.startsWith('side-dun-'));
const 清剿族 = SIDE_QUESTS_ZONE.filter((q) => q.id.startsWith('side-cull-'));
/** 那一位面的「副本」支线 */
const 那条 = (zone) => 副本族.find((q) => q.zone === zone);

describe('① 每位面恰好一条「副本」支线', () => {
  it('七座真实位面各一条，id 带区位前缀', () => {
    expect(副本族.length, '副本族的条数不对').toBe(ZONE_ORDER.length);
    for (const zone of ZONE_ORDER) {
      const 本位面 = 副本族.filter((q) => q.zone === zone);
      expect(本位面.length, `位面 "${zone}" 的副本支线不是恰好一条`).toBe(1);
      expect(本位面[0].id, `位面 "${zone}" 的副本支线 id 不带区位前缀`).toBe(`side-dun-${zone}`);
    }
  });

  it('枢纽不在这族里（枢纽那一族是"基础"）', () => {
    expect(副本族.some((q) => q.zone === ZONE_IDS.HUB)).toBe(false);
  });

  it('奖励比「清剿」族高（下一次副本比在野外清十只敌人更费工夫）', () => {
    for (const q of 副本族) {
      const 同位面的清剿 = 清剿族.find((c) => c.zone === q.zone);
      expect(同位面的清剿, `位面 "${q.zone}" 没有清剿支线`).toBeTruthy();
      expect(q.reward, `位面 "${q.zone}" 的副本支线奖励不高于清剿支线`).toBeGreaterThan(同位面的清剿.reward);
    }
  });

  it('全量名单里这七条都在（不是写了没人读）', () => {
    for (const q of 副本族) {
      expect(SIDE_QUESTS_ALL.some((x) => x.id === q.id), `${q.id} 不在 SIDE_QUESTS_ALL 里`).toBe(true);
    }
  });
});

describe('② 判据读的是那位面那座副本的通关数', () => {
  const game = (clears) => ({ dungeonRuns: { clears } });

  it('通了那位面的副本就算数', () => {
    const 副本id = DUNGEON_DEFS.find((d) => d.zone === ZONE_IDS.VOID)?.id;
    expect(副本id, '破碎时线没有副本 —— 事实无从谈起').toBeTruthy();
    expect(那条(ZONE_IDS.VOID).check(game({ [副本id]: 1 }))).toBe(true);
  });

  it('没通不算数', () => {
    expect(那条(ZONE_IDS.VOID).check(game({}))).toBe(false);
  });

  it('**别的位面**的副本通了不算这一条', () => {
    const 别的 = DUNGEON_DEFS.find((d) => d.zone === ZONE_IDS.RADIANT)?.id;
    expect(别的, '辉煌圣域没有副本').toBeTruthy();
    expect(那条(ZONE_IDS.VOID).check(game({ [别的]: 3 }))).toBe(false);
  });

  it('账本里没有这一格时读成 0（不是 NaN —— NaN 比较永远是假，症状会变成"永远差一点"）', () => {
    expect(那条(ZONE_IDS.VOID).check({})).toBe(false);
    expect(那条(ZONE_IDS.VOID).check({ dungeonRuns: {} })).toBe(false);
  });
});

describe('③ 位面 → 副本的映射是**推导**的', () => {
  it('每一条支线的判据都跟着副本定义表那格 `zone` 走', () => {
    // 独立复算：与生产同一条规则（副本定义表里的 zone 格）
    const 复算 = (zone) => DUNGEON_DEFS.filter((d) => d.zone === zone).map((d) => d.id);
    for (const zone of ZONE_ORDER) {
      const ids = 复算(zone);
      expect(ids.length, `位面 "${zone}" 没有副本 ⇒ 那一条支线永远做不完`).toBeGreaterThan(0);
      // 那一座区的副本通了 ⇒ 那一条支线完成
      const 清 = {};
      for (const id of ids) 清[id] = 1;
      expect(那条(zone).check({ dungeonRuns: { clears: 清 } }), `位面 "${zone}" 的支线没跟着副本表走`).toBe(true);
    }
  });

  it('每一位面都有副本（W-B10 切片7 的那一条）⇒ 这七条支线都有得做', () => {
    for (const zone of ZONE_ORDER) {
      const ids = DUNGEON_DEFS.filter((d) => d.zone === zone);
      expect(ids.length, `位面 "${zone}" 一座副本都没有 —— 它的副本支线就永远做不完`).toBeGreaterThan(0);
    }
  });
});
