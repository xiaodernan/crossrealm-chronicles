/**
 * 辉煌天使（W-E3 切片97）—— 辉煌圣域 hover 的远压施术者。
 * radiant_ 第七名独占：ranged 非 hazard，ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('辉煌天使：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('radiant_seraph');
    expect(ZH).toContain(ENEMY_ROSTER.radiant_seraph.name);
    expect(EN).toContain(ENEMY_ROSTER.radiant_seraph.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.radiant_seraph).toBeTruthy();
    expect(ENEMY_RESIST.radiant_seraph).toBeTruthy();
    expect(ENEMY_DEFENSE.radiant_seraph).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.radiant_seraph.length).toBeGreaterThanOrEqual(2);
  });
});
describe('辉煌天使之吟（radiant_cry）：ranged 非 hazard，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.radiant_cry;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('radiant_cry')).map(([t]) => t);
    expect(owners).toEqual(['radiant_seraph']);
  });
  it('与 radiant_rebuke / edict 分岔', () => {
    expect(ENEMY_MOVES.radiant_rebuke.damage).toBeLessThan(ENEMY_MOVES.radiant_cry.damage);
    expect(ENEMY_MOVES.edict.hazard).toBeTruthy();
    expect(ENEMY_MOVES.radiant_cry.hazard).toBeFalsy();
  });
});
describe('副本池与注册表', () => {
  it('radiant-dawn-hall 池有 radiant_seraph，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['radiant-dawn-hall'];
    expect(row.pool.map((e) => e.type)).toContain('radiant_seraph');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('radiant_crawler');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_radiant_seraph_hunt_title', 'obj_radiant_seraph_hunt_desc', 'obj_radiant_seraph_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
