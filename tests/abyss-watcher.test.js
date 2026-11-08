/**
 * 深渊凝视者（W-E3 切片71）—— 深渊之颚上空的悬浮暗目。
 *
 * 与切片70（撕掠者）同为 abyss_ 前缀第二名成员：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。zone-exclusive-enemies 门禁已在切片70扩到 abyss_。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是远程弹（分岔于 maw_rend 的贴身重撕）；
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

describe('深渊凝视者：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_watcher');
    const row = ENEMY_ROSTER.abyss_watcher;
    expect(row.hp).toBeGreaterThanOrEqual(140);
    expect(row.hp).toBeLessThanOrEqual(170);
    expect(row.damage).toBeGreaterThanOrEqual(15);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.abyss_watcher, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.abyss_watcher.hover, '深渊凝视者应为悬浮体').toBeGreaterThan(0);
    expect(BODY_PLANS.abyss_watcher.parts).not.toContain('legs');
    expect(ENEMY_RESIST.abyss_watcher).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_watcher).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_watcher.length).toBeGreaterThanOrEqual(2);
  });
});

describe('深渊凝视（abyss_gaze）：只有凝视者有', () => {
  it('招式表里有它，且归属唯一；是远程弹、分岔于 maw_rend', () => {
    const m = ENEMY_MOVES.abyss_gaze;
    expect(m, '凝视者的专属招不在招式表里').toBeTruthy();
    expect(m.ranged, '深渊凝视应为远程弹').toBeTruthy();
    expect(m.phase, '深渊凝视不是相位招').toBeFalsy();
    expect(m.windup, '深渊凝视有可读前摇').toBeGreaterThanOrEqual(0.6);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('abyss_gaze'))
      .map(([t]) => t);
    expect(owners, '深渊凝视是凝视者的专属招').toEqual(['abyss_watcher']);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.abyss_watcher).toContain('abyss_gaze');
    expect(new Set(ENEMY_MOVE_SETS.abyss_watcher).size).toBe(ENEMY_MOVE_SETS.abyss_watcher.length);
  });
});

describe('副本池接住了它', () => {
  it('abyss-deep-maw 池里有 abyss_watcher，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('abyss_watcher');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('stalker');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_abyss_watcher_hunt_title', 'obj_abyss_watcher_hunt_desc', 'obj_abyss_watcher_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
