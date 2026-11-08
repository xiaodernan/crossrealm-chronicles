/**
 * 深渊恸嚎者（W-E3 切片90）—— 深渊之颚飘忽的远压施术者。
 * abyss_ 第十一名独占：ranged 非 hazard，ch5 不移 choice-void。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
const ZH = new Set(ZH_KEYS); const EN = new Set(EN_KEYS);

describe('深渊恸嚎者：四表齐全', () => {
  it('名册登记，文案双表', () => {
    expect(ENEMY_ROSTER_IDS).toContain('abyss_wailer');
    expect(ZH).toContain(ENEMY_ROSTER.abyss_wailer.name);
    expect(EN).toContain(ENEMY_ROSTER.abyss_wailer.name);
  });
  it('四张表都有它', () => {
    expect(BODY_PLANS.abyss_wailer).toBeTruthy();
    expect(ENEMY_RESIST.abyss_wailer).toBeTruthy();
    expect(ENEMY_DEFENSE.abyss_wailer).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.abyss_wailer.length).toBeGreaterThanOrEqual(2);
  });
});
describe('深渊恸嚎（abyss_wail）：ranged 非 hazard，归属唯一', () => {
  it('招式存在且为 ranged、非 hazard、归属唯一', () => {
    const m = ENEMY_MOVES.abyss_wail;
    expect(m).toBeTruthy();
    expect(m.ranged).toBeTruthy();
    expect(m.hazard).toBeFalsy();
    const owners = Object.entries(ENEMY_MOVE_SETS).filter(([, ids]) => ids.includes('abyss_wail')).map(([t]) => t);
    expect(owners).toEqual(['abyss_wailer']);
  });
  it('与 abyss_gaze/abyss_drain 分岔', () => {
    expect(ENEMY_MOVES.abyss_gaze).toBeTruthy();
    expect(ENEMY_MOVES.abyss_drain).toBeTruthy();
    expect(ENEMY_MOVES.abyss_wail.range).not.toBe(ENEMY_MOVES.abyss_gaze.range);
    expect(ENEMY_MOVES.abyss_wail.range).not.toBe(ENEMY_MOVES.abyss_drain.range);
  });
});
describe('副本池与注册表', () => {
  it('abyss-deep-maw 池有 abyss_wailer，不抢打头', () => {
    const row = DUNGEON_ENCOUNTERS['abyss-deep-maw'];
    expect(row.pool.map((e) => e.type)).toContain('abyss_wailer');
    expect([...row.pool].sort((a, b) => b.weight - a.weight)[0].type).toBe('stalker');
  });
  it('清剿三键双表在，注册表全绿', () => {
    for (const k of ['obj_abyss_wailer_hunt_title', 'obj_abyss_wailer_hunt_desc', 'obj_abyss_wailer_hunt_journal']) {
      expect(ZH).toContain(k); expect(EN).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
