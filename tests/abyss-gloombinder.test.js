/**
 * 深渊缚影者（W-E3 切片93）—— 深渊之颚贴身舞影的缚鞭手。
 * abyss_ 第十二名独占：combo/comboWindup 既有机制，ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('深渊缚影者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_gloombinder');
    expect(ZH).toContain(ENEMY_ROSTER.abyss_gloombinder.name);
    expect(EN).toContain(ENEMY_ROSTER.abyss_gloombinder.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.abyss_gloombinder).toBeTruthy();
    expect(ENEMY_RESIST.abyss_gloombinder).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_gloombinder).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_gloombinder.length).toBeGreaterThanOrEqual(2);
  });
});
describe('深渊缚影鞭（abyss_gloomlash）：combo 既有机制，归属唯一', () => {
  it('招式存在且为多段 melee（combo>1）、归属唯一', () => {
    const m = ENEMY_MOVES.abyss_gloomlash;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeFalsy();
    expect(m.hazard).toBeFalsy();
    expect(m.combo).toBeGreaterThanOrEqual(2);
    expect(m.comboWindup).toBeLessThan(m.windup);
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('abyss_gloomlash')).map(([t]) => t);
    expect(owners).toEqual(['abyss_gloombinder']);
  });
  it('damage/cooldown 与 abyss_ravage、abyss_gnash 分岔', () => {
    expect(ENEMY_MOVES.abyss_gloomlash.damage).not.toBe(ENEMY_MOVES.abyss_ravage.damage);
    expect(ENEMY_MOVES.abyss_gloomlash.cooldown).not.toBe(ENEMY_MOVES.abyss_gnash.cooldown);
  });
});
describe('副本池与注册表', () => {
  it('abyss-deep-maw 池有 abyss_gloombinder，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    expect(row.pool.map((e) => e.type)).toContain('abyss_gloombinder');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('stalker');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_abyss_gloombinder_hunt_title', 'obj_abyss_gloombinder_hunt_desc', 'obj_abyss_gloombinder_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
