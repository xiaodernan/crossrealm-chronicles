/**
 * 辉煌铁锤人（W-E3 切片106）—— 辉煌圣域重锤破阵的第十一独占。
 * radiant_ 第十一名独占：heavy hammer smash（非 travel/非 hazard/非 ranged），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('辉煌铁锤人：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('radiant_hammer');
    expect(ZH).toContain(ENEMY_ROSTER.radiant_hammer.name);
    expect(EN).toContain(ENEMY_ROSTER.radiant_hammer.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.radiant_hammer).toBeTruthy();
    expect(ENEMY_RESIST.radiant_hammer).toBeTruthy();
    expect(ENEMY_DEFENSE.radiant_hammer).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.radiant_hammer.length).toBeGreaterThanOrEqual(2);
  });
});
describe('辉煌锻击（radiant_smite）：heavy hammer smash，归属唯一', () => {
  it('招式存在且为近战 knock、非 travel/hazard/ranged、归属唯一', () => {
    const m = ENEMY_MOVES.radiant_smite;
    expect(m).toBeTruthy();
    expect(m.damage).toBeGreaterThanOrEqual(1.8);
    expect(m.knock).toBeGreaterThanOrEqual(7.0);
    expect(m.windup).toBeGreaterThanOrEqual(0.9);
    expect(m.travel).toBeUndefined();
    expect(m.hazard).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('radiant_smite')).map(([t]) => t);
    expect(owners).toEqual(['radiant_hammer']);
  });
  it('与 radiant_cleave（快劈）/ radiant_pierce（长枪）/ radiant_charge（travel）分野', () => {
    expect(ENEMY_MOVES.radiant_smite.windup).toBeGreaterThan(ENEMY_MOVES.radiant_cleave.windup);
    expect(ENEMY_MOVES.radiant_smite.knock).toBeGreaterThan(ENEMY_MOVES.radiant_cleave.knock);
    expect(ENEMY_MOVES.radiant_smite.damage).toBeGreaterThan(ENEMY_MOVES.radiant_cleave.damage);
    expect(ENEMY_MOVES.radiant_charge.travel).toBe('lunge');
    expect(ENEMY_MOVES.radiant_pierce.reach).toBeGreaterThan(1.8);
    expect(ENEMY_MOVE_SETS.radiant_hammer).toContain('radiant_smite');
    expect(ENEMY_MOVE_SETS.radiant_harbinger).not.toContain('radiant_smite');
    expect(ENEMY_MOVE_SETS.radiant_duelist).not.toContain('radiant_smite');
  });
});
describe('副本池与注册表', () => {
  it('radiant-dawn-hall 池有 radiant_hammer，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['radiant-dawn-hall'];
    expect(row.pool.map((e) => e.type)).toContain('radiant_hammer');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('radiant_crawler');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_radiant_hammer_hunt_title', 'obj_radiant_hammer_hunt_desc', 'obj_radiant_hammer_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
