/**
 * 幽暗熄灯人（W-E3 切片101）—— 幽暗林地贴身扇形的第十独占。
 * gloom_ 第十名独占：cone wide melee sweep + knock（非 ranged/非 hazard/非 travel），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('幽暗熄灯人：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('gloom_snuffer');
    expect(ZH).toContain(ENEMY_ROSTER.gloom_snuffer.name);
    expect(EN).toContain(ENEMY_ROSTER.gloom_snuffer.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.gloom_snuffer).toBeTruthy();
    expect(ENEMY_RESIST.gloom_snuffer).toBeTruthy();
    expect(ENEMY_DEFENSE.gloom_snuffer).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.gloom_snuffer.length).toBeGreaterThanOrEqual(2);
  });
});
describe('幽暗熄焰（gloom_snuff）：wide cone，归属唯一', () => {
  it('招式存在且为近战 knock、非 ranged/hazard/travel、归属唯一', () => {
    const m = ENEMY_MOVES.gloom_snuff;
    expect(m).toBeTruthy();
    expect(m.knock).toBeGreaterThanOrEqual(6);
    expect(m.cone).toBeGreaterThanOrEqual(0.95);
    expect(m.cone).toBeGreaterThan(-1); // ranged cone would be -2; this must be an actual arc
    expect(m.reach).toBeLessThan(2);
    expect(m.travel).toBeUndefined();
    expect(m.hazard).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('gloom_snuff')).map(([t]) => t);
    expect(owners).toEqual(['gloom_snuffer']);
  });
  it('与 gloom_toll（远程重炮）/ gloom_lament（布陷）独占分野', () => {
    expect(ENEMY_MOVES.gloom_snuff.cone).toBeGreaterThan(ENEMY_MOVES.radiant_cleave.cone);
    expect(ENEMY_MOVES.gloom_toll.cone).toBe(-2); // 远程占位
    expect(ENEMY_MOVES.gloom_lament.damage).toBe(0);
    expect(ENEMY_MOVE_SETS.gloom_snuffer).not.toContain('gloom_toll');
    expect(ENEMY_MOVE_SETS.gloom_snuffer).not.toContain('gloom_lament');
  });
});
describe('副本池与注册表', () => {
  it('gloom-mist-crypt 池有 gloom_snuffer，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['gloom-mist-crypt'];
    expect(row.pool.map((e) => e.type)).toContain('gloom_snuffer');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('gloom_wraith');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_gloom_snuffer_hunt_title', 'obj_gloom_snuffer_hunt_desc', 'obj_gloom_snuffer_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
