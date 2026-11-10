/**
 * 辉煌回廊卫（W-E3 切片107）—— 辉煌圣域第十二独占。
 * radiant_ 第十二名独占：solemn processional melee（非 travel/非 hazard/非 ranged），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('辉煌回廊卫：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('radiant_chancel');
    expect(ZH).toContain(ENEMY_ROSTER.radiant_chancel.name);
    expect(EN).toContain(ENEMY_ROSTER.radiant_chancel.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.radiant_chancel).toBeTruthy();
    expect(ENEMY_RESIST.radiant_chancel).toBeTruthy();
    expect(ENEMY_DEFENSE.radiant_chancel).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.radiant_chancel.length).toBeGreaterThanOrEqual(2);
  });
});
describe('辉煌肃行（radiant_solemn）：solemn processional melee，归属唯一', () => {
  it('招式存在且为近战、非 travel/hazard/ranged、归属唯一', () => {
    const m = ENEMY_MOVES.radiant_solemn;
    expect(m).toBeTruthy();
    expect(m.damage).toBeGreaterThan(0);
    expect(m.knock).toBeGreaterThan(0);
    expect(m.standoff).toBeUndefined();
    expect(m.travel).toBeUndefined();
    expect(m.hazard).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('radiant_solemn')).map(([t]) => t);
    expect(owners).toEqual(['radiant_chancel']);
  });
  it('与 radiant_smite（慢重锤）/ radiant_pierce（长枪）/ radiant_charge（travel）分野', () => {
    expect(ENEMY_MOVES.radiant_solemn.damage).toBeLessThan(ENEMY_MOVES.radiant_smite.damage);
    expect(ENEMY_MOVES.radiant_solemn.knock).toBeLessThan(ENEMY_MOVES.radiant_smite.knock);
    expect(ENEMY_MOVES.radiant_solemn.cooldown).toBeLessThan(ENEMY_MOVES.radiant_smite.cooldown);
    expect(ENEMY_MOVES.radiant_charge.travel).toBe('lunge');
    expect(ENEMY_MOVES.radiant_pierce.reach).toBeGreaterThan(1.5);
    expect(ENEMY_MOVE_SETS.radiant_chancel).toContain('radiant_solemn');
    expect(ENEMY_MOVE_SETS.radiant_hammer).not.toContain('radiant_solemn');
  });
});
describe('副本池与注册表', () => {
  it('radiant-dawn-hall 池有 radiant_chancel，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['radiant-dawn-hall'];
    expect(row.pool.map((e) => e.type)).toContain('radiant_chancel');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('radiant_crawler');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_radiant_chancel_hunt_title', 'obj_radiant_chancel_hunt_desc', 'obj_radiant_chancel_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
