/**
 * 深渊裂痕使（W-E3 切片81）—— 深渊之颚里远距投射危险区的施压者。
 * abyss_ 第七名独占：ranged+hazard 专属招，接池/出生点/主线（ch5，不移 choice-void）。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('深渊裂痕使：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_scarbearer');
    expect(ZH).toContain(ENEMY_ROSTER.abyss_scarbearer.name);
    expect(EN).toContain(ENEMY_ROSTER.abyss_scarbearer.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.abyss_scarbearer).toBeTruthy();
    expect(ENEMY_RESIST.abyss_scarbearer).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_scarbearer).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_scarbearer.length).toBeGreaterThanOrEqual(2);
  });
});
describe('深渊裂痕（abyss_scar）：ranged+hazard 归属唯一', () => {
  it('招式存在且为 ranged+hazard、归属唯一', () => {
    const m = ENEMY_MOVES.abyss_scar;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeTruthy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('abyss_scar')).map(([t]) => t);
    expect(owners).toEqual(['abyss_scarbearer']);
  });
  it('与 void_breach/abyss_mire 分岔', () => {
    expect(ENEMY_MOVES.void_breach).toBeTruthy();
    expect(ENEMY_MOVES.abyss_mire).toBeTruthy();
    expect(ENEMY_MOVES.abyss_scar.name).not.toBe(ENEMY_MOVES.void_breach.name);
    expect(ENEMY_MOVES.abyss_scar.ranged).toBeTruthy();
    expect(ENEMY_MOVES.abyss_mire.ranged).toBeFalsy();
  });
});
describe('副本池与注册表', () => {
  it('abyss-deep-maw 池有 abyss_scarbearer，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    expect(row.pool.map((e) => e.type)).toContain('abyss_scarbearer');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('stalker');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_abyss_scarbearer_hunt_title', 'obj_abyss_scarbearer_hunt_desc', 'obj_abyss_scarbearer_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
