/**
 * 深渊蛮兽（W-E3 切片73）—— 深渊之颚底部的重躯压迫者。
 *
 * abyss_ 前缀第三名成员（reaver/watcher 之后）：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是慢速重踏（分岔于 maw_rend 的中速撕裂）；
 * abyss-deep-maw 池接住它且不抢打头；文案双表在；注册表全绿。
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

describe('深渊蛮兽：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_brute');
    const row = ENEMY_ROSTER.abyss_brute;
    expect(row.hp).toBeGreaterThanOrEqual(160);
    expect(row.hp).toBeLessThanOrEqual(190);
    expect(row.damage).toBeGreaterThanOrEqual(18);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.abyss_brute, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.abyss_brute.hover, '深渊蛮兽应为贴地体').toBeFalsy();
    expect(BODY_PLANS.abyss_brute.parts).toContain('legs');
    expect(BODY_PLANS.abyss_brute.radius).toBeGreaterThan(0.48);
    expect(ENEMY_RESIST.abyss_brute).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_brute).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_brute.length).toBeGreaterThanOrEqual(2);
  });
});

describe('深渊重踏（abyss_slam）：只有蛮兽有', () => {
  it('招式表里有它，且归属唯一；是慢速重逼退、分岔于 maw_rend', () => {
    const m = ENEMY_MOVES.abyss_slam;
    expect(m, '蛮兽的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '深渊重踏不是相位招').toBeFalsy();
    expect(m.travel, '深渊重踏不做位移').toBeFalsy();
    expect(m.windup, '深渊重踏是慢速重招').toBeGreaterThan(0.8);
    expect(m.knock).toBeGreaterThanOrEqual(6);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('abyss_slam'))
      .map(([t]) => t);
    expect(owners, '深渊重踏是蛮兽的专属招').toEqual(['abyss_brute']);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.abyss_brute).toContain('abyss_slam');
    expect(new Set(ENEMY_MOVE_SETS.abyss_brute).size).toBe(ENEMY_MOVE_SETS.abyss_brute.length);
  });
});

describe('副本池接住了它', () => {
  it('abyss-deep-maw 池里有 abyss_brute，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('abyss_brute');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('stalker');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_abyss_brute_hunt_title', 'obj_abyss_brute_hunt_desc', 'obj_abyss_brute_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
