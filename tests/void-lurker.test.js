/**
 * 虚空潜伏者（W-E3 切片74）—— 虚空断口里贴裂隙伏击的贴地实影。
 *
 * void_ 前缀第三名成员（phantom/riftwalker 之后）：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是短距 travel 扑袭（分岔于 rift_step 的相位突入）；
 * void-broken-casket 池接住它且不抢打头；文案双表在；注册表全绿。
 */
import { describe, expect, it } from 'vitest';
import {
  BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS,
} from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';

const ZH = new Set(ZH_KEYS);
const EN = new Set(EN_KEYS);

describe('虚空潜伏者：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_lurker');
    const row = ENEMY_ROSTER.void_lurker;
    expect(row.hp).toBeGreaterThanOrEqual(140);
    expect(row.hp).toBeLessThanOrEqual(170);
    expect(row.damage).toBeGreaterThanOrEqual(15);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.void_lurker, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.void_lurker.hover, '虚空潜伏者应为贴地体').toBeFalsy();
    expect(BODY_PLANS.void_lurker.parts).toContain('legs');
    expect(ENEMY_RESIST.void_lurker).toBeTruthy();
    expect(ENEMY_DEFENSE.void_lurker).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_lurker.length).toBeGreaterThanOrEqual(2);
  });
});

describe('虚空扑袭（void_lunge）：只有潜伏者有', () => {
  it('招式表里有它，且归属唯一；是 travel 扑袭、分岔于 rift_step', () => {
    const m = ENEMY_MOVES.void_lunge;
    expect(m, '潜伏者的专属招不在招式表里').toBeTruthy();
    expect(m.travel, '虚空扑袭应为 travel 扑袭').toBe('lunge');
    expect(m.phase, '虚空扑袭不是相位招').toBeFalsy();
    expect(m.damage).toBeGreaterThan(0);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('void_lunge'))
      .map(([t]) => t);
    expect(owners, '虚空扑袭是潜伏者的专属招').toEqual(['void_lurker']);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.void_lurker).toContain('void_lunge');
    expect(new Set(ENEMY_MOVE_SETS.void_lurker).size).toBe(ENEMY_MOVE_SETS.void_lurker.length);
  });
});

describe('副本池接住了它', () => {
  it('void-broken-casket 池里有 void_lurker，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('void_lurker');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('sentinel');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_void_lurker_hunt_title', 'obj_void_lurker_hunt_desc', 'obj_void_lurker_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
