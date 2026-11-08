/**
 * 虚空裂隙行者（W-E3 切片72）—— 虚空断口里穿行裂隙的贴地实影。
 *
 * void_ 前缀第二名成员（phantom 之后）：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是相位突入（分岔于 phase_cut 的短切 / haunt 的远距背刺）；
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

describe('虚空裂隙行者：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_riftwalker');
    const row = ENEMY_ROSTER.void_riftwalker;
    expect(row.hp).toBeGreaterThanOrEqual(150);
    expect(row.hp).toBeLessThanOrEqual(175);
    expect(row.damage).toBeGreaterThanOrEqual(16);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.void_riftwalker, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.void_riftwalker.hover, '裂隙行者应为贴地体').toBeFalsy();
    expect(BODY_PLANS.void_riftwalker.parts).toContain('legs');
    expect(ENEMY_RESIST.void_riftwalker).toBeTruthy();
    expect(ENEMY_DEFENSE.void_riftwalker).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_riftwalker.length).toBeGreaterThanOrEqual(2);
  });
});

describe('裂隙步（rift_step）：只有裂隙行者有', () => {
  it('招式表里有它，且归属唯一；是相位突入、分岔于 phase_cut/haunt', () => {
    const m = ENEMY_MOVES.rift_step;
    expect(m, '裂隙行者的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '裂隙步是相位招').toBe(true);
    expect(m.blink).toBeGreaterThan(5); // longer than phase_cut's 5m
    expect(m.blink).toBeLessThan(10);   // shorter than haunt's 10m
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('rift_step'))
      .map(([t]) => t);
    expect(owners, '裂隙步是裂隙行者的专属招').toEqual(['void_riftwalker']);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.void_riftwalker).toContain('rift_step');
    expect(new Set(ENEMY_MOVE_SETS.void_riftwalker).size).toBe(ENEMY_MOVE_SETS.void_riftwalker.length);
  });
});

describe('副本池接住了它', () => {
  it('void-broken-casket 池里有 void_riftwalker，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('void_riftwalker');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('sentinel');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_void_riftwalker_hunt_title', 'obj_void_riftwalker_hunt_desc', 'obj_void_riftwalker_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
