/**
 * 深渊幽影（W-E3 切片75）—— 深渊暗隙里的相位伏击者。
 *
 * abyss_ 前缀第四名成员（reaver/watcher/brute 之后）：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是中距相位伏击（7m/0.6s/knock3），
 * 分岔于 shadowstep（6m/0.55s/knock4）与 rift_step（8m/0.65s/knock3.5）；
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

describe('深渊幽影：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_shade');
    const row = ENEMY_ROSTER.abyss_shade;
    expect(row.hp).toBeGreaterThanOrEqual(140);
    expect(row.hp).toBeLessThanOrEqual(165);
    expect(row.damage).toBeGreaterThanOrEqual(15);
    expect(row.speed).toBeGreaterThan(5.0);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.abyss_shade, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.abyss_shade.hover, '深渊幽影应为贴地体').toBeFalsy();
    expect(BODY_PLANS.abyss_shade.parts).toContain('legs');
    expect(ENEMY_RESIST.abyss_shade).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_shade).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_shade.length).toBeGreaterThanOrEqual(2);
  });
});

describe('深渊隐袭（abyss_veil）：只有幽影有，且相位参数分岔清晰', () => {
  it('招式表里有它，且归属唯一；是中距相位伏击', () => {
    const m = ENEMY_MOVES.abyss_veil;
    expect(m, '幽影的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '深渊隐袭应为相位招').toBe(true);
    expect(m.blink, 'blink 7m').toBe(7);
    expect(m.windup, 'windup 0.6s').toBeCloseTo(0.6, 5);
    expect(m.knock, 'knock 3').toBe(3);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('abyss_veil'))
      .map(([t]) => t);
    expect(owners, '深渊隐袭是幽影的专属招').toEqual(['abyss_shade']);
  });

  it('与 shadowstep / rift_step 三者 blink·windup·knock 各不相同', () => {
    const veil = ENEMY_MOVES.abyss_veil;
    const shadow = ENEMY_MOVES.shadowstep;
    const rift = ENEMY_MOVES.rift_step;
    expect(shadow).toBeTruthy();
    expect(rift).toBeTruthy();
    expect(veil.blink).not.toBe(shadow.blink);
    expect(veil.blink).not.toBe(rift.blink);
    expect(veil.windup).not.toBe(shadow.windup);
    expect(veil.windup).not.toBe(rift.windup);
    expect(veil.knock).not.toBe(shadow.knock);
    expect(veil.knock).not.toBe(rift.knock);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.abyss_shade).toContain('abyss_veil');
    expect(new Set(ENEMY_MOVE_SETS.abyss_shade).size).toBe(ENEMY_MOVE_SETS.abyss_shade.length);
  });
});

describe('副本池接住了它', () => {
  it('abyss-deep-maw 池里有 abyss_shade，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('abyss_shade');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('stalker');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_abyss_shade_hunt_title', 'obj_abyss_shade_hunt_desc', 'obj_abyss_shade_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
