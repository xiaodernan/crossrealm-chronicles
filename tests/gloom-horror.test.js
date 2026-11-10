/**
 * 幽暗恐惧者（W-E3 切片97）—— 幽暗林地潜行的伏击者。
 * gloom_ 第七名独占：ranged 非 hazard，ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('幽暗恐惧者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('gloom_horror');
    expect(ZH).toContain(ENEMY_ROSTER.gloom_horror.name);
    expect(EN).toContain(ENEMY_ROSTER.gloom_horror.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.gloom_horror).toBeTruthy();
    expect(ENEMY_RESIST.gloom_horror).toBeTruthy();
    expect(ENEMY_DEFENSE.gloom_horror).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.gloom_horror.length).toBeGreaterThanOrEqual(2);
  });
});
describe('幽暗鬼爪（gloom_grasp）：ranged 非 hazard，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.gloom_grasp;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('gloom_grasp')).map(([t]) => t);
    expect(owners).toEqual(['gloom_horror']);
  });
  it('与 gloom_whisper/prowl/lurk 分岔', () => {
    expect(ENEMY_MOVES.gloom_whisper.range).toBeLessThanOrEqual(ENEMY_MOVES.gloom_grasp.range + 1.5);
    expect(ENEMY_MOVES.prowl.travel).toBeTruthy();
    expect(ENEMY_MOVES.lurk.travel).toBeTruthy();
  });
});
describe('副本池与注册表', () => {
  it('gloom-mist-crypt 池有 gloom_horror，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['gloom-mist-crypt'];
    expect(row.pool.map((e) => e.type)).toContain('gloom_horror');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('gloom_wraith');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_gloom_horror_hunt_title', 'obj_gloom_horror_hunt_desc', 'obj_gloom_horror_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
