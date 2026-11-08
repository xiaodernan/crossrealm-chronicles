/**
 * 虚空号哭者（W-E3 切片91）—— 虚空断口飘忽的远压施术者。
 * void_ 第十一名独占：ranged 非 hazard，ch4 插步右移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('虚空号哭者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_howler');
    expect(ZH).toContain(ENEMY_ROSTER.void_howler.name);
    expect(EN).toContain(ENEMY_ROSTER.void_howler.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.void_howler).toBeTruthy();
    expect(ENEMY_RESIST.void_howler).toBeTruthy();
    expect(ENEMY_DEFENSE.void_howler).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_howler.length).toBeGreaterThanOrEqual(2);
  });
});
describe('虚空号哭（void_howl）：ranged 非 hazard，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.void_howl;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('void_howl')).map(([t]) => t);
    expect(owners).toEqual(['void_howler']);
  });
  it('与 void_sting/void_siphon 分岔', () => {
    expect(ENEMY_MOVES.void_sting).toBeTruthy();
    expect(ENEMY_MOVES.void_siphon).toBeTruthy();
    expect(ENEMY_MOVES.void_howl.range).not.toBe(ENEMY_MOVES.void_sting.range);
    expect(ENEMY_MOVES.void_howl.range).not.toBe(ENEMY_MOVES.void_siphon.range);
  });
});
describe('副本池与注册表', () => {
  it('void-broken-casket 池有 void_howler，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    expect(row.pool.map((e) => e.type)).toContain('void_howler');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('sentinel');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_void_howler_hunt_title', 'obj_void_howler_hunt_desc', 'obj_void_howler_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
