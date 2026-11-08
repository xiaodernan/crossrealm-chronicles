/**
 * 虚空幻影（W-E3 切片69）—— 虚空断口里扯出来的悬浮残影。
 *
 * 与切片68（幽暗影煞）/67（辉煌大主教）同类"加一位面独占敌人"：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。切片69 同时把 `zone-exclusive-enemies` 门禁
 * 扩展到 `void_` 前缀（从 gloom/radiant 扩到 gloom/radiant/void）。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且分岔明确；void-broken-casket 池接住它且不抢打头；
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

describe('虚空幻影：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_phantom');
    const row = ENEMY_ROSTER.void_phantom;
    expect(row.hp).toBeGreaterThanOrEqual(140);
    expect(row.hp).toBeLessThanOrEqual(170);
    expect(row.damage).toBeGreaterThanOrEqual(16);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.void_phantom, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.void_phantom.hover, '虚空幻影应为悬浮体').toBeGreaterThan(0);
    expect(BODY_PLANS.void_phantom.parts).not.toContain('legs');
    expect(ENEMY_RESIST.void_phantom).toBeTruthy();
    expect(ENEMY_DEFENSE.void_phantom).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_phantom.length).toBeGreaterThanOrEqual(2);
  });
});

describe('相位斩（phase_cut）：只有幻影有', () => {
  it('招式表里有它，且归属唯一；分岔于 haunt/shadowstep', () => {
    const m = ENEMY_MOVES.phase_cut;
    expect(m, '幻影的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '相位斩是相位招').toBe(true);
    expect(m.blink).toBeGreaterThan(0);
    expect(m.blink, '相位斩的闪距要短于怨影 haunt 的 10m').toBeLessThan(10);
    expect(m.windup, '相位斩是快招').toBeLessThan(0.7);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('phase_cut'))
      .map(([t]) => t);
    expect(owners, '相位斩是幻影的专属招').toEqual(['void_phantom']);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.void_phantom).toContain('phase_cut');
    expect(new Set(ENEMY_MOVE_SETS.void_phantom).size).toBe(ENEMY_MOVE_SETS.void_phantom.length);
  });
});

describe('副本池接住了它', () => {
  it('void-broken-casket 池里有 void_phantom，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('void_phantom');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('sentinel');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_void_phantom_hunt_title', 'obj_void_phantom_hunt_desc', 'obj_void_phantom_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
