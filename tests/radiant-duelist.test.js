/**
 * 辉煌决斗者（W-E3 切片101）—— 辉煌圣域长枪刺杀的第十独占。
 * radiant_ 第十名独占：long-reach piercing thrust（非 travel/非 hazard/非 ranged），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('辉煌决斗者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('radiant_duelist');
    expect(ZH).toContain(ENEMY_ROSTER.radiant_duelist.name);
    expect(EN).toContain(ENEMY_ROSTER.radiant_duelist.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.radiant_duelist).toBeTruthy();
    expect(ENEMY_RESIST.radiant_duelist).toBeTruthy();
    expect(ENEMY_DEFENSE.radiant_duelist).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.radiant_duelist.length).toBeGreaterThanOrEqual(2);
  });
});
describe('辉煌贯决（radiant_pierce）：long-reach piercing，归属唯一', () => {
  it('招式存在且为近战 knock、非 travel/hazard/ranged、归属唯一', () => {
    const m = ENEMY_MOVES.radiant_pierce;
    expect(m).toBeTruthy();
    expect(m.cone).toBeLessThanOrEqual(0.35);
    expect(m.reach).toBeGreaterThanOrEqual(1.85);
    expect(m.damage).toBeGreaterThanOrEqual(1.7);
    expect(m.travel).toBeUndefined();
    expect(m.hazard).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('radiant_pierce')).map(([t]) => t);
    expect(owners).toEqual(['radiant_duelist']);
  });
  it('与 radiant_cleave（宽弧重劈）独占分野，与 radiant_cry（远程）分野', () => {
    expect(ENEMY_MOVES.radiant_pierce.reach).toBeGreaterThan(ENEMY_MOVES.radiant_cleave.reach);
    expect(ENEMY_MOVES.radiant_pierce.cone).toBeLessThan(ENEMY_MOVES.radiant_cleave.cone);
    expect(ENEMY_MOVES.radiant_charge.travel).toBe('lunge');
    expect(ENEMY_MOVES.radiant_cry.ranged).toBeTruthy();
    expect(ENEMY_MOVE_SETS.radiant_duelist).not.toContain('radiant_cleave');
    expect(ENEMY_MOVE_SETS.radiant_duelist).not.toContain('radiant_charge');
  });
});
describe('副本池与注册表', () => {
  it('radiant-dawn-hall 池有 radiant_duelist，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['radiant-dawn-hall'];
    expect(row.pool.map((e) => e.type)).toContain('radiant_duelist');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('radiant_crawler');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_radiant_duelist_hunt_title', 'obj_radiant_duelist_hunt_desc', 'obj_radiant_duelist_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
