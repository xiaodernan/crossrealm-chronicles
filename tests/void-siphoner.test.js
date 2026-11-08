/**
 * 虚空汲魂者（W-E3 切片86）—— 虚空断口里漂游的汲魂施压者。
 * void_ 第九名独占：ranged 非 hazard，ch4 插步右移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('虚空汲魂者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_siphoner');
    expect(ZH).toContain(ENEMY_ROSTER.void_siphoner.name);
    expect(EN).toContain(ENEMY_ROSTER.void_siphoner.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.void_siphoner).toBeTruthy();
    expect(ENEMY_RESIST.void_siphoner).toBeTruthy();
    expect(ENEMY_DEFENSE.void_siphoner).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_siphoner.length).toBeGreaterThanOrEqual(2);
  });
});
describe('虚空汲魂（void_siphon）：ranged 非 hazard，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.void_siphon;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('void_siphon')).map(([t]) => t);
    expect(owners).toEqual(['void_siphoner']);
  });
  it('与 void_sting/void_breach 分岔', () => {
    expect(ENEMY_MOVES.void_sting).toBeTruthy();
    expect(ENEMY_MOVES.void_breach.hazard).toBeTruthy();
    expect(ENEMY_MOVES.void_siphon.range).not.toBe(ENEMY_MOVES.void_sting.range);
  });
});
describe('副本池与注册表', () => {
  it('void-broken-casket 池有 void_siphoner，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    expect(row.pool.map((e) => e.type)).toContain('void_siphoner');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('sentinel');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_void_siphoner_hunt_title', 'obj_void_siphoner_hunt_desc', 'obj_void_siphoner_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
