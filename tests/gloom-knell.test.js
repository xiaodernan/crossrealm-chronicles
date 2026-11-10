/**
 * 幽暗丧钟（W-E3 切片100）—— 幽暗林地远压重炮的第九独占。
 * gloom_ 第九名独占：ranged 直击重炮（非 hazard/非 travel），ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('幽暗丧钟：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('gloom_knell');
    expect(ZH).toContain(ENEMY_ROSTER.gloom_knell.name);
    expect(EN).toContain(ENEMY_ROSTER.gloom_knell.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.gloom_knell).toBeTruthy();
    expect(ENEMY_RESIST.gloom_knell).toBeTruthy();
    expect(ENEMY_DEFENSE.gloom_knell).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.gloom_knell.length).toBeGreaterThanOrEqual(2);
  });
});
describe('幽暗丧钟（gloom_toll）：ranged 直击，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.gloom_toll;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    expect(m.damage).toBeGreaterThan(0);
    expect(m.travel).toBeUndefined();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('gloom_toll')).map(([t]) => t);
    expect(owners).toEqual(['gloom_knell']);
  });
  it('与 gloom_whisper / gloom_lament 远程层分岔', () => {
    // 比鬼火的轻压重、比歌手的布陷场直接：这是“一下要人命”，不是“把地标出来”
    expect(ENEMY_MOVES.gloom_toll.damage).toBeGreaterThan(ENEMY_MOVES.gloom_whisper.damage);
    expect(ENEMY_MOVES.gloom_lament.damage).toBe(0);
    expect(ENEMY_MOVES.gloom_toll.range).toBeGreaterThan(ENEMY_MOVES.gloom_whisper.range);
    expect(ENEMY_MOVES.gloom_toll.cooldown).toBeGreaterThan(ENEMY_MOVES.gloom_whisper.cooldown);
    expect(ENEMY_MOVE_SETS.gloom_knell).not.toContain('gloom_lament');
  });
});
describe('副本池与注册表', () => {
  it('gloom-mist-crypt 池有 gloom_knell，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['gloom-mist-crypt'];
    expect(row.pool.map((e) => e.type)).toContain('gloom_knell');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('gloom_wraith');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_gloom_knell_hunt_title', 'obj_gloom_knell_hunt_desc', 'obj_gloom_knell_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
