/**
 * 深渊撕裂者（W-E3 切片88）—— 深渊之颚魁梧的近身压迫者。
 * abyss_ 第十名独占：重型近战（非 travel/非 ranged/非 hazard/非 phase），ch5 不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('深渊撕裂者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_ravager');
    expect(ZH).toContain(ENEMY_ROSTER.abyss_ravager.name);
    expect(EN).toContain(ENEMY_ROSTER.abyss_ravager.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.abyss_ravager).toBeTruthy();
    expect(ENEMY_RESIST.abyss_ravager).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_ravager).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_ravager.length).toBeGreaterThanOrEqual(2);
  });
});
describe('深渊撕裂击（abyss_ravage）：重型近战，归属唯一', () => {
  it('招式存在且非 travel/非 ranged/非 hazard/非 phase，归属唯一', () => {
    const m = ENEMY_MOVES.abyss_ravage;
    expect(m).toBeTruthy();
    expect(m.travel).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    expect(m.hazard).toBeFalsy();
    expect(m.phase).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('abyss_ravage')).map(([t]) => t);
    expect(owners).toEqual(['abyss_ravager']);
  });
  it('与 abyss_gnash/maw_rend 分岔', () => {
    expect(ENEMY_MOVES.abyss_gnash.travel).toBeTruthy();
    expect(ENEMY_MOVES.maw_rend).toBeTruthy();
    expect(ENEMY_MOVES.abyss_ravage.damage).not.toBe(ENEMY_MOVES.abyss_gnash.damage);
  });
});
describe('副本池与注册表', () => {
  it('abyss-deep-maw 池有 abyss_ravager，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    expect(row.pool.map((e) => e.type)).toContain('abyss_ravager');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('stalker');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_abyss_ravager_hunt_title', 'obj_abyss_ravager_hunt_desc', 'obj_abyss_ravager_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
