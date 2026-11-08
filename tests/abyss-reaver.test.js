/**
 * 深渊撕掠者（W-E3 切片70）—— 深渊之颚边缘的贴地猎手。
 *
 * 与切片67/68/69 同类"加一位面独占敌人"：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。切片70 同时把 `zone-exclusive-enemies` 门禁
 * 扩展到 `abyss_` 前缀（gloom/radiant/void/abyss 四族）。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且分岔明确；abyss-deep-maw 池接住它且不抢打头；
 * 文案双表在；注册表全绿。
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

describe('深渊撕掠者：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_reaver');
    const row = ENEMY_ROSTER.abyss_reaver;
    expect(row.hp).toBeGreaterThanOrEqual(150);
    expect(row.hp).toBeLessThanOrEqual(180);
    expect(row.damage).toBeGreaterThanOrEqual(17);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.abyss_reaver, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.abyss_reaver.hover, '深渊撕掠者应为贴地体').toBeFalsy();
    expect(BODY_PLANS.abyss_reaver.parts).toContain('legs');
    expect(ENEMY_RESIST.abyss_reaver).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_reaver).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_reaver.length).toBeGreaterThanOrEqual(2);
  });
});

describe('深渊撕裂（maw_rend）：只有撕掠者有', () => {
  it('招式表里有它，且归属唯一；分岔于 prowl/sweep', () => {
    const m = ENEMY_MOVES.maw_rend;
    expect(m, '撕掠者的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '深渊撕裂不是相位招').toBeFalsy();
    expect(m.travel, '深渊撕裂不做位移扑击（与 prowl 分岔）').toBeFalsy();
    expect(m.windup, '深渊撕裂是中速重招').toBeGreaterThan(0.5);
    expect(m.knock).toBeGreaterThanOrEqual(4);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('maw_rend'))
      .map(([t]) => t);
    expect(owners, '深渊撕裂是撕掠者的专属招').toEqual(['abyss_reaver']);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.abyss_reaver).toContain('maw_rend');
    expect(new Set(ENEMY_MOVE_SETS.abyss_reaver).size).toBe(ENEMY_MOVE_SETS.abyss_reaver.length);
  });
});

describe('副本池接住了它', () => {
  it('abyss-deep-maw 池里有 abyss_reaver，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('abyss_reaver');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('stalker');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_abyss_reaver_hunt_title', 'obj_abyss_reaver_hunt_desc', 'obj_abyss_reaver_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
