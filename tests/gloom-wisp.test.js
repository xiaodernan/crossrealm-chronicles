/**
 * 幽暗鬼火（W-E3 切片96）—— 幽暗林地飘忽的鬼火斥候。
 * gloom_ 第六名独占：纯 ranged 无 hazard，ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('幽暗鬼火：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('gloom_wisp');
    expect(ZH).toContain(ENEMY_ROSTER.gloom_wisp.name);
    expect(EN).toContain(ENEMY_ROSTER.gloom_wisp.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.gloom_wisp).toBeTruthy();
    expect(ENEMY_RESIST.gloom_wisp).toBeTruthy();
    expect(ENEMY_DEFENSE.gloom_wisp).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.gloom_wisp.length).toBeGreaterThanOrEqual(2);
  });
});
describe('幽暗低语（gloom_whisper）：纯 ranged，无 hazard，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.gloom_whisper;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('gloom_whisper')).map(([t]) => t);
    expect(owners).toEqual(['gloom_wisp']);
  });
  it('与 beacon / haunt / shadowstep 分岔', () => {
    expect(ENEMY_MOVES.beacon.hazard).toBeTruthy();
    expect(ENEMY_MOVES.haunt.blink).toBeTruthy();
    expect(ENEMY_MOVES.shadowstep.blink).toBeTruthy();
    expect(ENEMY_MOVES.gloom_whisper.hazard).toBeFalsy();
  });
});
describe('副本池与注册表', () => {
  it('gloom-mist-crypt 池有 gloom_wisp，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['gloom-mist-crypt'];
    expect(row.pool.map((e) => e.type)).toContain('gloom_wisp');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('gloom_wraith');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_gloom_wisp_hunt_title', 'obj_gloom_wisp_hunt_desc', 'obj_gloom_wisp_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
