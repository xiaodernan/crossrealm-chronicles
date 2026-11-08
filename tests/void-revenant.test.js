/**
 * 虚空残魂（W-E3 切片84）—— 虚空断口里相位游猎的残影。
 * void_ 第八名独占：phase 近斩，ch4 插步右移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('虚空残魂：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_revenant');
    expect(ZH).toContain(ENEMY_ROSTER.void_revenant.name);
    expect(EN).toContain(ENEMY_ROSTER.void_revenant.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.void_revenant).toBeTruthy();
    expect(ENEMY_RESIST.void_revenant).toBeTruthy();
    expect(ENEMY_DEFENSE.void_revenant).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_revenant.length).toBeGreaterThanOrEqual(2);
  });
});
describe('虚空相噬（void_phase_rend）：phase 归属唯一', () => {
  it('招式存在且为 phase、归属唯一', () => {
    const m = ENEMY_MOVES.void_phase_rend;
    expect(m).toBeTruthy();
    expect(m.phase).toBeTruthy();
    expect(m.blink).toBeGreaterThan(0);
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('void_phase_rend')).map(([t]) => t);
    expect(owners).toEqual(['void_revenant']);
  });
  it('与 phase_cut/rift_step 分岔', () => {
    expect(ENEMY_MOVES.phase_cut).toBeTruthy();
    expect(ENEMY_MOVES.rift_step).toBeTruthy();
    expect(ENEMY_MOVES.void_phase_rend.blink).not.toBe(ENEMY_MOVES.phase_cut.blink);
  });
});
describe('副本池与注册表', () => {
  it('void-broken-casket 池有 void_revenant，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    expect(row.pool.map((e) => e.type)).toContain('void_revenant');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('sentinel');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_void_revenant_hunt_title', 'obj_void_revenant_hunt_desc', 'obj_void_revenant_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
