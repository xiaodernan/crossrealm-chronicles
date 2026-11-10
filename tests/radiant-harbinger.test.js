/**
 * 辉煌先驱（W-E3 切片100）—— 辉煌圣域裂光先锋的第九独占。
 * radiant_ 第九名独占：重劈 knock melee（非 travel/非 hazard/非 ranged），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('辉煌先驱：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('radiant_harbinger');
    expect(ZH).toContain(ENEMY_ROSTER.radiant_harbinger.name);
    expect(EN).toContain(ENEMY_ROSTER.radiant_harbinger.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.radiant_harbinger).toBeTruthy();
    expect(ENEMY_RESIST.radiant_harbinger).toBeTruthy();
    expect(ENEMY_DEFENSE.radiant_harbinger).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.radiant_harbinger.length).toBeGreaterThanOrEqual(2);
  });
});
describe('辉煌裂光（radiant_cleave）：重劈 knock melee，归属唯一', () => {
  it('招式存在且为近战 knock、非 travel/非 hazard/非 ranged、归属唯一', () => {
    const m = ENEMY_MOVES.radiant_cleave;
    expect(m).toBeTruthy();
    expect(m.knock).toBeGreaterThan(0);
    expect(m.travel).toBeUndefined();
    expect(m.hazard).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    expect(m.reach).toBeGreaterThan(1);
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('radiant_cleave')).map(([t]) => t);
    expect(owners).toEqual(['radiant_harbinger']);
  });
  it('与 radiant_charge（travel lunge）/ radiant_cry（ranged）分岔', () => {
    expect(ENEMY_MOVES.radiant_charge.travel).toBe('lunge');
    expect(ENEMY_MOVES.radiant_cry.ranged).toBeTruthy();
    expect(ENEMY_MOVES.radiant_cleave.cone).toBeGreaterThan(ENEMY_MOVES.radiant_charge.cone);
    expect(ENEMY_MOVES.radiant_cleave.damage).toBeGreaterThan(ENEMY_MOVES.radiant_charge.damage);
    expect(ENEMY_MOVE_SETS.radiant_harbinger).not.toContain('radiant_charge');
    expect(ENEMY_MOVE_SETS.radiant_harbinger).not.toContain('radiant_cry');
  });
});
describe('副本池与注册表', () => {
  it('radiant-dawn-hall 池有 radiant_harbinger，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['radiant-dawn-hall'];
    expect(row.pool.map((e) => e.type)).toContain('radiant_harbinger');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('radiant_crawler');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_radiant_harbinger_hunt_title', 'obj_radiant_harbinger_hunt_desc', 'obj_radiant_harbinger_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
