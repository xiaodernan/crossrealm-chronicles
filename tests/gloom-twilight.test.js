/**
 * 幽暗宵影（W-E3 切片107）—— 幽暗林地第十二独占的兜底之作。
 * gloom_ 第十二名独占：fast tempo melee（非 travel/非 hazard/非 ranged），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('幽暗宵影：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('gloom_twilight');
    expect(ZH).toContain(ENEMY_ROSTER.gloom_twilight.name);
    expect(EN).toContain(ENEMY_ROSTER.gloom_twilight.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.gloom_twilight).toBeTruthy();
    expect(ENEMY_RESIST.gloom_twilight).toBeTruthy();
    expect(ENEMY_DEFENSE.gloom_twilight).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.gloom_twilight.length).toBeGreaterThanOrEqual(2);
  });
});
describe('幽暗摆影（gloom_sway）：fast tempo melee，归属唯一', () => {
  it('招式存在且为近战、非 travel/hazard/ranged、归属唯一', () => {
    const m = ENEMY_MOVES.gloom_sway;
    expect(m).toBeTruthy();
    expect(m.damage).toBeGreaterThan(0);
    expect(m.cooldown).toBeLessThanOrEqual(2.9);
    expect(m.travel).toBeUndefined();
    expect(m.hazard).toBeFalsy();
    expect(m.ranged).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('gloom_sway')).map(([t]) => t);
    expect(owners).toEqual(['gloom_twilight']);
  });
  it('与 gloom_pounce（travel）/ gloom_snuff（宽扇）/ gloom_whisper（远程）分野', () => {
    expect(ENEMY_MOVES.gloom_sway.windup).toBeLessThanOrEqual(0.44);
    expect(ENEMY_MOVES.gloom_sway.cooldown).toBeLessThan(ENEMY_MOVES.gloom_pounce.cooldown);
    expect(ENEMY_MOVES.gloom_snuff.cone).toBeGreaterThan(ENEMY_MOVES.gloom_sway.cone);
    expect(ENEMY_MOVES.gloom_whisper.cone).toBe(-2);
    expect(ENEMY_MOVE_SETS.gloom_twilight).toContain('gloom_sway');
    expect(ENEMY_MOVE_SETS.gloom_lunger).not.toContain('gloom_sway');
  });
});
describe('副本池与注册表', () => {
  it('gloom-mist-crypt 池有 gloom_twilight，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['gloom-mist-crypt'];
    expect(row.pool.map((e) => e.type)).toContain('gloom_twilight');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('gloom_wraith');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_gloom_twilight_hunt_title', 'obj_gloom_twilight_hunt_desc', 'obj_gloom_twilight_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
