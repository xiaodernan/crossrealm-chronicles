/**
 * 虚空裂渊者（W-E3 切片82）—— 虚空断口里沉重的区域封锁者。
 * void_ 第七名独占：hazard 专属招（非 ranged/非相位），ch4 插步右移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('虚空裂渊者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_chasmer');
    expect(ZH).toContain(ENEMY_ROSTER.void_chasmer.name);
    expect(EN).toContain(ENEMY_ROSTER.void_chasmer.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.void_chasmer).toBeTruthy();
    expect(ENEMY_RESIST.void_chasmer).toBeTruthy();
    expect(ENEMY_DEFENSE.void_chasmer).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_chasmer.length).toBeGreaterThanOrEqual(2);
  });
});
describe('虚空裂渊（void_chasm）：hazard 归属唯一', () => {
  it('招式存在且为 hazard、非 ranged、归属唯一', () => {
    const m = ENEMY_MOVES.void_chasm;
    expect(m).toBeTruthy();
    expect(m.hazard).toBeTruthy();
    expect(m.ranged).toBeFalsy();
    expect(m.phase).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('void_chasm')).map(([t]) => t);
    expect(owners).toEqual(['void_chasmer']);
  });
  it('与 rift/abyss_mire/void_breach 分岔', () => {
    expect(ENEMY_MOVES.rift).toBeTruthy();
    expect(ENEMY_MOVES.abyss_mire).toBeTruthy();
    expect(ENEMY_MOVES.void_breach.ranged).toBeTruthy();
    expect(ENEMY_MOVES.void_chasm.ranged).toBeFalsy();
  });
});
describe('副本池与注册表', () => {
  it('void-broken-casket 池有 void_chasmer，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    expect(row.pool.map((e) => e.type)).toContain('void_chasmer');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('sentinel');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_void_chasmer_hunt_title', 'obj_void_chasmer_hunt_desc', 'obj_void_chasmer_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
