/**
 * 幽暗扑影（W-E3 切片106）—— 幽暗林地影中扑击的第十一独占。
 * gloom_ 第十一名独占：travel lunge（非 ranged/非 hazard/非 cone），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('幽暗扑影：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('gloom_lunger');
    expect(ZH).toContain(ENEMY_ROSTER.gloom_lunger.name);
    expect(EN).toContain(ENEMY_ROSTER.gloom_lunger.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.gloom_lunger).toBeTruthy();
    expect(ENEMY_RESIST.gloom_lunger).toBeTruthy();
    expect(ENEMY_DEFENSE.gloom_lunger).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.gloom_lunger.length).toBeGreaterThanOrEqual(2);
  });
});
describe('幽暗扑影（gloom_pounce）：travel lunge，归属唯一', () => {
  it('招式存在且为 travel、非 ranged/hazard、归属唯一', () => {
    const m = ENEMY_MOVES.gloom_pounce;
    expect(m).toBeTruthy();
    expect(m.travel).toBe('lunge');
    expect(m.ranged).toBeFalsy();
    expect(m.hazard).toBeFalsy();
    expect(m.travelSpeed).toBeGreaterThan(0);
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('gloom_pounce')).map(([t]) => t);
    expect(owners).toEqual(['gloom_lunger']);
  });
  it('与 gloom_snuff（扇形 knock）/ gloom_toll（远程重炮）/ gloom_wisp（whisper 远压）分野', () => {
    expect(ENEMY_MOVES.gloom_pounce.travel).toBe('lunge');
    expect(ENEMY_MOVES.gloom_snuff.travel).toBeUndefined();
    expect(ENEMY_MOVES.gloom_snuff.cone).toBeGreaterThanOrEqual(1);
    expect(ENEMY_MOVES.gloom_toll.cone).toBe(-2);
    expect(ENEMY_MOVE_SETS.gloom_lunger).toContain('gloom_pounce');
    expect(ENEMY_MOVE_SETS.gloom_snuffer).not.toContain('gloom_pounce');
  });
});
describe('副本池与注册表', () => {
  it('gloom-mist-crypt 池有 gloom_lunger，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['gloom-mist-crypt'];
    expect(row.pool.map((e) => e.type)).toContain('gloom_lunger');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('gloom_wraith');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_gloom_lunger_hunt_title', 'obj_gloom_lunger_hunt_desc', 'obj_gloom_lunger_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
