/**
 * 深渊空壳（W-E3 切片85）—— 深渊之颚里轻盈的汲取施压者。
 * abyss_ 第九名独占：ranged 非 hazard，ch5 不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('深渊空壳：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_hollow');
    expect(ZH).toContain(ENEMY_ROSTER.abyss_hollow.name);
    expect(EN).toContain(ENEMY_ROSTER.abyss_hollow.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.abyss_hollow).toBeTruthy();
    expect(ENEMY_RESIST.abyss_hollow).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_hollow).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_hollow.length).toBeGreaterThanOrEqual(2);
  });
});
describe('深渊汲取（abyss_drain）：ranged 非 hazard，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.abyss_drain;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('abyss_drain')).map(([t]) => t);
    expect(owners).toEqual(['abyss_hollow']);
  });
  it('与 abyss_gaze/abyss_scar 分岔', () => {
    expect(ENEMY_MOVES.abyss_gaze).toBeTruthy();
    expect(ENEMY_MOVES.abyss_scar.hazard).toBeTruthy();
    expect(ENEMY_MOVES.abyss_drain.range).not.toBe(ENEMY_MOVES.abyss_gaze.range);
  });
});
describe('副本池与注册表', () => {
  it('abyss-deep-maw 池有 abyss_hollow，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    expect(row.pool.map((e) => e.type)).toContain('abyss_hollow');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('stalker');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_abyss_hollow_hunt_title', 'obj_abyss_hollow_hunt_desc', 'obj_abyss_hollow_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
