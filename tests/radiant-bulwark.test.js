/**
 * 辉煌壁垒（W-E3 切片98）—— 辉煌圣域贴地猛冲的第八独占。
 * radiant_ 第八名独占：travel lunge，ch5 插步不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('辉煌壁垒：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('radiant_bulwark');
    expect(ZH).toContain(ENEMY_ROSTER.radiant_bulwark.name);
    expect(EN).toContain(ENEMY_ROSTER.radiant_bulwark.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.radiant_bulwark).toBeTruthy();
    expect(ENEMY_RESIST.radiant_bulwark).toBeTruthy();
    expect(ENEMY_DEFENSE.radiant_bulwark).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.radiant_bulwark.length).toBeGreaterThanOrEqual(2);
  });
});
describe('辉煌冲锋（radiant_charge）：travel lunge，归属唯一', () => {
  it('招式存在且为 travel、非 ranged、归属唯一', () => {
    const m = ENEMY_MOVES.radiant_charge;
    expect(m).toBeTruthy();
    expect(m.travel).toBe('lunge');
    expect(m.ranged).toBeFalsy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('radiant_charge')).map(([t]) => t);
    expect(owners).toEqual(['radiant_bulwark']);
  });
  it('与 radiant 的 ranged 流派分岔', () => {
    expect(ENEMY_MOVES.radiant_cry.ranged).toBeTruthy();
    expect(ENEMY_MOVES.radiant_charge.knock).toBeGreaterThan(ENEMY_MOVES.radiant_cry.damage); // 撞得更狠那条要够沉
    expect(ENEMY_MOVE_SETS.radiant_bulwark).not.toContain('radiant_cry');
  });
});
describe('副本池与注册表', () => {
  it('radiant-dawn-hall 池有 radiant_bulwark，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['radiant-dawn-hall'];
    expect(row.pool.map((e) => e.type)).toContain('radiant_bulwark');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('radiant_crawler');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_radiant_bulwark_hunt_title', 'obj_radiant_bulwark_hunt_desc', 'obj_radiant_bulwark_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
