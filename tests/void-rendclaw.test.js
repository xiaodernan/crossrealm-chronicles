/**
 * 虚空裂爪兽（W-E3 切片89）—— 虚空断口魁梧的近身撕裂者。
 * void_ 第十名独占：重型近战，ch4 插步右移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('虚空裂爪兽：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_rendclaw');
    expect(ZH).toContain(ENEMY_ROSTER.void_rendclaw.name);
    expect(EN).toContain(ENEMY_ROSTER.void_rendclaw.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.void_rendclaw).toBeTruthy();
    expect(ENEMY_RESIST.void_rendclaw).toBeTruthy();
    expect(ENEMY_DEFENSE.void_rendclaw).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_rendclaw.length).toBeGreaterThanOrEqual(2);
  });
});
describe('虚空裂爪（void_rake）：重型近战，归属唯一', () => {
  it('招式存在且非 travel/非 ranged/非 hazard/非 phase，归属唯一', () => {
    const m = ENEMY_MOVES.void_rake;
    expect(m).toBeTruthy();
    expect(m.travel).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    expect(m.hazard).toBeFalsy();
    expect(m.phase).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('void_rake')).map(([t]) => t);
    expect(owners).toEqual(['void_rendclaw']);
  });
  it('与 void_rend/abyss_ravage 分岔', () => {
    expect(ENEMY_MOVES.void_rend).toBeTruthy();
    expect(ENEMY_MOVES.abyss_ravage).toBeTruthy();
    expect(ENEMY_MOVES.void_rake.damage).not.toBe(ENEMY_MOVES.void_rend.damage);
  });
});
describe('副本池与注册表', () => {
  it('void-broken-casket 池有 void_rendclaw，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    expect(row.pool.map((e) => e.type)).toContain('void_rendclaw');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('sentinel');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_void_rendclaw_hunt_title', 'obj_void_rendclaw_hunt_desc', 'obj_void_rendclaw_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
