/**
 * 深渊猎犬（W-E3 切片77）—— 深渊之颚里贴地追击的迅捷猎兽。
 *
 * abyss_ 前缀第五名成员（reaver/watcher/brute/shade 之后）：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是快速 travel 追击扑击（非相位），
 * 分岔于 void_lunge（断口伏击，较慢）与 abyss_veil（相位伏击）及 prowl（damage 0）；
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

describe('深渊猎犬：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_hound');
    const row = ENEMY_ROSTER.abyss_hound;
    expect(row.hp).toBeGreaterThanOrEqual(135);
    expect(row.hp).toBeLessThanOrEqual(160);
    expect(row.speed).toBeGreaterThan(6.0);
    expect(row.aggroRange).toBeGreaterThanOrEqual(26);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.abyss_hound, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.abyss_hound.hover, '深渊猎犬应为贴地体').toBeFalsy();
    expect(BODY_PLANS.abyss_hound.parts).toContain('legs');
    expect(ENEMY_RESIST.abyss_hound).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_hound).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_hound.length).toBeGreaterThanOrEqual(2);
  });
});

describe('深渊扑袭（abyss_pounce）：只有猎犬有，且是快速非相位追击扑击', () => {
  it('招式表里有它，且归属唯一；travel lunge、非相位、有伤害', () => {
    const m = ENEMY_MOVES.abyss_pounce;
    expect(m, '猎犬的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '不应是相位招').toBeFalsy();
    expect(m.blink, '不应有 blink').toBeFalsy();
    expect(m.travel, '应为 travel 招').toBeTruthy();
    expect(m.damage, '应有明确伤害').toBeGreaterThan(0);
    expect(m.windup, '应为快速前摇').toBeLessThanOrEqual(0.5);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('abyss_pounce'))
      .map(([t]) => t);
    expect(owners, '深渊扑袭是猎犬的专属招').toEqual(['abyss_hound']);
  });

  it('与 void_lunge / abyss_veil / prowl 分岔', () => {
    const p = ENEMY_MOVES.abyss_pounce;
    const vl = ENEMY_MOVES.void_lunge;
    const av = ENEMY_MOVES.abyss_veil;
    const pr = ENEMY_MOVES.prowl;
    expect(vl).toBeTruthy(); expect(av).toBeTruthy(); expect(pr).toBeTruthy();
    expect(p.phase).not.toBe(av.phase);
    expect(p.windup).not.toBe(vl.windup);
    expect(p.damage).toBeGreaterThan(pr.damage);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.abyss_hound).toContain('abyss_pounce');
    expect(new Set(ENEMY_MOVE_SETS.abyss_hound).size).toBe(ENEMY_MOVE_SETS.abyss_hound.length);
  });
});

describe('副本池接住了它', () => {
  it('abyss-deep-maw 池里有 abyss_hound，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('abyss_hound');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('stalker');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_abyss_hound_hunt_title', 'obj_abyss_hound_hunt_desc', 'obj_abyss_hound_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
