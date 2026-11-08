/**
 * 深渊噬颚兽（W-E3 切片83）—— 凶猛追咬的深渊猎兽。
 * abyss_ 第八名独占：短距 travel 重咬（非相位/非 ranged），ch5 不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('深渊噬颚兽：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_gnasher');
    expect(ZH).toContain(ENEMY_ROSTER.abyss_gnasher.name);
    expect(EN).toContain(ENEMY_ROSTER.abyss_gnasher.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.abyss_gnasher).toBeTruthy();
    expect(ENEMY_RESIST.abyss_gnasher).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_gnasher).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_gnasher.length).toBeGreaterThanOrEqual(2);
  });
});
describe('深渊噬咬（abyss_gnash）：travel 重咬，归属唯一', () => {
  it('招式存在且为 travel、非相位、归属唯一', () => {
    const m = ENEMY_MOVES.abyss_gnash;
    expect(m).toBeTruthy();
    expect(m.travel).toBeTruthy();
    expect(m.phase).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('abyss_gnash')).map(([t]) => t);
    expect(owners).toEqual(['abyss_gnasher']);
  });
  it('与 abyss_pounce 分岔', () => {
    const g = ENEMY_MOVES.abyss_gnash;
    const p = ENEMY_MOVES.abyss_pounce;
    expect(p).toBeTruthy();
    expect(g.damage).not.toBe(p.damage);
    expect(g.cooldown).not.toBe(p.cooldown);
  });
});
describe('副本池与注册表', () => {
  it('abyss-deep-maw 池有 abyss_gnasher，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    expect(row.pool.map((e) => e.type)).toContain('abyss_gnasher');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('stalker');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_abyss_gnasher_hunt_title', 'obj_abyss_gnasher_hunt_desc', 'obj_abyss_gnasher_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
