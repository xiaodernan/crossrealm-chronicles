/**
 * 虚空掠夺者（W-E3 切片76）—— 虚空断口里中重型的掠食压迫者。
 *
 * void_ 前缀第四名成员（phantom/riftwalker/lurker 之后）：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。
 *
 * 钉：四表齐全 + 名册在；专属招归属唯一且是非相位/无位移的重型宽撕
 * （分岔于 void_lunge 的 travel 伏击与 abyss_slam 的蛮兽级逼退）；
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

describe('虚空掠夺者：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('void_marauder');
    const row = ENEMY_ROSTER.void_marauder;
    expect(row.hp).toBeGreaterThanOrEqual(160);
    expect(row.hp).toBeLessThanOrEqual(185);
    expect(row.damage).toBeGreaterThanOrEqual(17);
    expect(row.speed).toBeGreaterThan(4.5);
    expect(row.speed).toBeLessThan(6.0);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.void_marauder, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.void_marauder.hover, '虚空掠夺者应为贴地体').toBeFalsy();
    expect(BODY_PLANS.void_marauder.parts).toContain('legs');
    expect(ENEMY_RESIST.void_marauder).toBeTruthy();
    expect(ENEMY_DEFENSE.void_marauder).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.void_marauder.length).toBeGreaterThanOrEqual(2);
  });
});

describe('虚空撕扯（void_rend）：只有掠夺者有，且是非相位重型宽撕', () => {
  it('招式表里有它，且归属唯一；无相位/无位移，宽扇重压', () => {
    const m = ENEMY_MOVES.void_rend;
    expect(m, '掠夺者的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '虚空撕扯不应是相位招').toBeFalsy();
    expect(m.blink, '不应有 blink').toBeFalsy();
    expect(m.travel, '不应有 travel').toBeFalsy();
    expect(m.cone, '应为宽扇面').toBeGreaterThanOrEqual(0.6);
    expect(m.knock, '应有明显击退').toBeGreaterThanOrEqual(4);
    expect(m.windup, '前摇应较长以给窗口').toBeGreaterThanOrEqual(0.7);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('void_rend'))
      .map(([t]) => t);
    expect(owners, '虚空撕扯是掠夺者的专属招').toEqual(['void_marauder']);
  });

  it('与 void_lunge / abyss_slam 参数分岔', () => {
    const rend = ENEMY_MOVES.void_rend;
    const lunge = ENEMY_MOVES.void_lunge;
    const slam = ENEMY_MOVES.abyss_slam;
    expect(lunge).toBeTruthy();
    expect(slam).toBeTruthy();
    expect(rend.windup).toBeGreaterThan(lunge.windup);
    expect(rend.cone).toBeGreaterThan(lunge.cone);
    expect(rend.windup).toBeLessThan(slam.windup);
    expect(rend.knock).toBeLessThan(slam.knock);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.void_marauder).toContain('void_rend');
    expect(new Set(ENEMY_MOVE_SETS.void_marauder).size).toBe(ENEMY_MOVE_SETS.void_marauder.length);
  });
});

describe('副本池接住了它', () => {
  it('void-broken-casket 池里有 void_marauder，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['void-broken-casket'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('void_marauder');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('sentinel');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_void_marauder_hunt_title', 'obj_void_marauder_hunt_desc', 'obj_void_marauder_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
