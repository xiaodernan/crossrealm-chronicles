/**
 * 幽暗影煞（W-E3 切片68）—— 迷雾里最快的那一道影。
 *
 * 与切片67（辉煌大主教）同一类"加一位面独占敌人"的片：一类敌人、一招专属招、
 * 接进副本池与野外出生点、再接进主线清剿。区别只在手感与数值：
 * 大主教是远距区域封锁（edict hazard，大圈慢烧），影煞是贴身快影（shadowstep 短距相位 + 高攻低血）。
 *
 * 钉六件事：四表齐全 + 名册在；专属招归属唯一；gloom-mist-crypt 池接住它且不抢打头；
 * 野外有出生点；主线有清剿步；文案双表在。
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

describe('幽暗影煞：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS).toContain('gloom_shade');
    const row = ENEMY_ROSTER.gloom_shade;
    expect(row.hp).toBeGreaterThanOrEqual(130);
    expect(row.hp).toBeLessThanOrEqual(160);        // 手感：快影玻璃炮，不是守夜人
    expect(row.speed).toBeGreaterThan(5.5);         // 立身之本：gloom 族最快档
    expect(row.damage).toBeGreaterThanOrEqual(17);
    expect(ZH).toContain(row.name);
    expect(EN).toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.gloom_shade, '体型表漏了').toBeTruthy();
    expect(BODY_PLANS.gloom_shade.parts).toContain('legs'); // 贴地快影，不是悬浮体
    expect(ENEMY_RESIST.gloom_shade).toBeTruthy();
    expect(ENEMY_DEFENSE.gloom_shade).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.gloom_shade.length).toBeGreaterThanOrEqual(3);
  });
});

describe('影袭（shadowstep）：只有影煞有', () => {
  it('招式表里有它，且归属唯一', () => {
    const m = ENEMY_MOVES.shadowstep;
    expect(m, '影煞的专属招不在招式表里').toBeTruthy();
    expect(m.phase, '影袭是相位招（短距错位）').toBe(true);
    expect(m.blink, '影袭要写 blink 距离').toBeGreaterThan(0);
    expect(m.blink, '影袭的闪距要短于怨影 haunt 的 10m').toBeLessThan(10);
    expect(m.windup, '影袭是快招，前摇 < 0.7s').toBeLessThan(0.7);
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('shadowstep'))
      .map(([t]) => t);
    expect(owners, '影袭是影煞的专属招').toEqual(['gloom_shade']);
  });

  it('招式组合无重复', () => {
    expect(ENEMY_MOVE_SETS.gloom_shade).toContain('shadowstep');
    expect(new Set(ENEMY_MOVE_SETS.gloom_shade).size).toBe(ENEMY_MOVE_SETS.gloom_shade.length);
  });
});

describe('副本池接住了它', () => {
  it('gloom-mist-crypt 池里有 gloom_shade，且不是打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['gloom-mist-crypt'];
    const types = row.pool.map((e) => e.type);
    expect(types).toContain('gloom_shade');
    const heaviest = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(heaviest).toBe('gloom_wraith');
  });
});

describe('文案与注册表', () => {
  it('清剿步三键双表在', () => {
    for (const k of ['obj_gloom_shade_hunt_title', 'obj_gloom_shade_hunt_desc', 'obj_gloom_shade_hunt_journal']) {
      expect(ZH, `zh 缺 ${k}`).toContain(k);
      expect(EN, `en 缺 ${k}`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
