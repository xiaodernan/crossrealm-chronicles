/**
 * 虚空刺蜇者（W-E3 切片78）—— 虚空断口里保持距离的轻快远程骚扰者。
 *
 * void_ 前缀第五名成员（phantom/riftwalker/lurker/marauder 之后）：一类敌人、一招专属远程招、
 * 接进副本池与野外出生点、再接进主线清剿。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是 ranged 非相位弹道骚扰，
 * 分岔于 shot（较慢重弹）、abyss_gaze（凝视远压）、void_lunge/void_rend（近身）；
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

describe('虚空刺蜇者：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_stinger');
    const row = ENEMY_ROSTER.void_stinger;
    expect(row.hp).toBeGreaterThanOrEqual(130);
    expect(row.hp).toBeLessThanOrEqual(155);
    expect(row.speed).toBeGreaterThan(5.0);
    expect(row.aggroRange).toBeGreaterThanOrEqual(28);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.void_stinger, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.void_stinger.hover, '刺蜇者应为贴地体').toBeFalsy();
    expect(ENEMY_RESIST.void_stinger).toBeTruthy();
    expect(ENEMY_DEFENSE.void_stinger).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_stinger.length).toBeGreaterThanOrEqual(2);
  });
});

describe('虚空刺蜇（void_sting）：只有刺蜇者有，且是远程非相位弹道骚扰', () => {
  it('招式表里有它，且归属唯一；ranged、非相位、有伤害', () => {
    const m = ENEMY_MOVES.void_sting;
    expect(m, '刺蜇者的专属招不在招式表里').toBeTruthy();
    expect(m.ranged, '应为远程招').toBeTruthy();
    expect(m.phase, '不应是相位招').toBeFalsy();
    expect(m.damage, '应有明确伤害').toBeGreaterThan(0);
    expect(m.range, '应有射程').toBeGreaterThan(0);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('void_sting'))
      .map(([t]) => t);
    expect(owners, '虚空刺蜇是刺蜇者的专属招').toEqual(['void_stinger']);
  });

  it('与 shot / abyss_gaze 分岔（不同参数/语义）', () => {
    const st = ENEMY_MOVES.void_sting;
    const sh = ENEMY_MOVES.shot;
    const ag = ENEMY_MOVES.abyss_gaze;
    expect(sh).toBeTruthy(); expect(ag).toBeTruthy();
    expect(st.windup).not.toBe(sh.windup);
    expect(st.name).not.toBe(ag.name);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.void_stinger).toContain('void_sting');
    expect(new Set(ENEMY_MOVE_SETS.void_stinger).size).toBe(ENEMY_MOVE_SETS.void_stinger.length);
  });
});

describe('副本池接住了它', () => {
  it('void-broken-casket 池里有 void_stinger，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('void_stinger');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('sentinel');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_void_stinger_hunt_title', 'obj_void_stinger_hunt_desc', 'obj_void_stinger_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
