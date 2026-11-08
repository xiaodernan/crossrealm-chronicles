/**
 * 深渊沼兽（W-E3 切片79）—— 深渊之颚里沉重缓慢的区域封锁者。
 * abyss_ 第六名独占：hazard 型专属招（非相位/非 ranged），接池/出生点/主线。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('深渊沼兽：四表齐全，名册有它', () => {
  it('名册登记，文案键双表在', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_mire');
    const row = ENEMY_ROSTER.abyss_mire;
    expect(row.speed).toBeLessThan(5);
    expect(ZH).toContain(row.name); expect(EN).toContain(row.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.abyss_mire).toBeTruthy();
    expect(ENEMY_RESIST.abyss_mire).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_mire).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_mire.length).toBeGreaterThanOrEqual(2);
  });
});
describe('深渊沼泽（abyss_mire）：唯一归属，hazard 区域封锁', () => {
  it('招式存在且为 hazard、非相位、归属唯一', () => {
    const m = ENEMY_MOVES.abyss_mire;
    expect(m).toBeTruthy();
    expect(m.hazard).toBeTruthy();
    expect(m.phase).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('abyss_mire')).map(([t]) => t);
    expect(owners).toEqual(['abyss_mire']);
  });
  it('与 rift 分岔（同 hazard 机制，不同参数）', () => {
    expect(ENEMY_MOVES.rift).toBeTruthy();
    expect(ENEMY_MOVES.abyss_mire.cooldown).not.toBe(ENEMY_MOVES.rift.cooldown);
  });
});
describe('副本池与文案注册', () => {
  it('abyss-deep-maw 池有 abyss_mire，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    expect(row.pool.map((e) => e.type)).toContain('abyss_mire');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('stalker');
  });
  it('清剿步三键双表在，注册表全绿', () => {
    for (const k of ['obj_abyss_mire_hunt_title', 'obj_abyss_mire_hunt_desc', 'obj_abyss_mire_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
