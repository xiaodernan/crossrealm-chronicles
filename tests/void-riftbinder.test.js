/**
 * 虚空缚裂者（W-E3 切片94）—— 虚空断口贴身的连斩手。
 * void_ 第十二名独占：combo/comboWindup 既有机制，ch4 插步右移 choice-void（61→62）。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('虚空缚裂者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_riftbinder');
    expect(ZH).toContain(ENEMY_ROSTER.void_riftbinder.name);
    expect(EN).toContain(ENEMY_ROSTER.void_riftbinder.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.void_riftbinder).toBeTruthy();
    expect(ENEMY_RESIST.void_riftbinder).toBeTruthy();
    expect(ENEMY_DEFENSE.void_riftbinder).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_riftbinder.length).toBeGreaterThanOrEqual(2);
  });
});
describe('虚空绝斩（void_sever）：combo 既有机制，归属唯一', () => {
  it('招式存在且为多段 melee（combo>1）、归属唯一', () => {
    const m = ENEMY_MOVES.void_sever;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeFalsy();
    expect(m.hazard).toBeFalsy();
    expect(m.combo).toBeGreaterThanOrEqual(2);
    expect(m.comboWindup).toBeLessThan(m.windup);
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('void_sever')).map(([t]) => t);
    expect(owners).toEqual(['void_riftbinder']);
  });
  it('damage/cooldown 与 void_rake、abyss_gloomlash 分岔', () => {
    expect(ENEMY_MOVES.void_sever.damage).not.toBe(ENEMY_MOVES.void_rake.damage);
    expect(ENEMY_MOVES.void_sever.cooldown).not.toBe(ENEMY_MOVES.abyss_gloomlash.cooldown);
  });
});
describe('副本池与注册表', () => {
  it('void-broken-casket 池有 void_riftbinder，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    expect(row.pool.map((e) => e.type)).toContain('void_riftbinder');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('sentinel');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_void_riftbinder_hunt_title', 'obj_void_riftbinder_hunt_desc', 'obj_void_riftbinder_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
