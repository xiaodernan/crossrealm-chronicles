/**
 * 辉煌大主教（W-E3 切片67）—— 辉煌圣域最深处那一位。
 *
 * 这一片加一类敌人（`radiant_archon`）、两样装备（`dawn-charm` 底座 / `dawn-blessed` 词缀）、
 * 以及一招专属招（`edict` 晨曦敕命）。之所以单开一个文件而不是塞进既有的哪一片，
 * 是因为这一片要一次钉住**加新敌人时必须走完的每一格**：
 *
 * 1. 四表齐全（体型 / 招式 / 抗性 / 减伤），且名册里有它 —— 漏一格的症状不是报错，
 *    是"那一栏落到默认档、玩家看不出区别"；
 * 2. 专属招的归属——只有大主教有（专属就是可检验的）；
 * 3. 它必须出现在某个副本池里（否则"加了新敌人"对玩家等于没加，
 *    而那条门禁就在 `dungeon-encounters-table.test.js` 里，这一片把自己对同一条的见证写下来）；
 * 4. 新底座与新词缀进了掉落池（`radiant`），名字键双表覆盖（GEAR_NAMES 双向口径）；
 * 5. 两条文案键在中英两表里都在。
 *
 * 纯数据 + 注册表检查，不碰 THREE —— 这一类的数值行为由既有的招式/战斗门禁继续管。
 */
import { describe, expect, it } from 'vitest';
import {
  BODY_PLANS, ENEMY_RESIST, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS,
} from '../src/content/tuning.js';
import { ENEMY_ROSTER, ENEMY_ROSTER_IDS } from '../src/content/enemies.js';
import { DUNGEON_ENCOUNTERS } from '../src/content/dungeonEncounters.js';
import {
  GEAR_BASES, GEAR_AFFIXES, GEAR_NAMES, GEAR_POOLS, poolForZone,
} from '../src/content/gear.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';

const ZH = new Set(ZH_KEYS);
const EN = new Set(EN_KEYS);

describe('辉煌大主教：四表齐全，名册有它', () => {
  it('名册里登记了，且 name 是中英两表都认的键', () => {
    expect(ENEMY_ROSTER_IDS, '大主教要进名册的键名单').toContain('radiant_archon');
    const row = ENEMY_ROSTER.radiant_archon;
    expect(row.hp).toBeGreaterThan(150);
    expect(row.hp).toBeLessThan(200);          // 手感定位：玻璃炮，不是骑士
    expect(row.aggroRange).toBeGreaterThan(26);   // 立身之本：在你到不了的地方开火
    expect(ZH, '中文表里没有它的名字键').toContain(row.name);
    expect(EN, '英文表里没有它的名字键').toContain(row.name);
  });

  it('BODY_PLANS / ENEMY_RESIST / ENEMY_DEFENSE / ENEMY_MOVE_SETS 四张表都有它', () => {
    expect(BODY_PLANS.radiant_archon, '体型表漏了 ⇒ 出生落到默认 soldier 档').toBeTruthy();
    expect(BODY_PLANS.radiant_archon.hover, '大主教是悬浮施法者（与幽暗怨影同口径）').toBeGreaterThan(0);
    expect(BODY_PLANS.radiant_archon.parts, '悬浮体不该有 legs 分段').not.toContain('legs');
    expect(ENEMY_RESIST.radiant_archon).toBeTruthy();
    expect(ENEMY_DEFENSE.radiant_archon).toBeGreaterThan(0);
    expect(ENEMY_MOVE_SETS.radiant_archon.length).toBeGreaterThanOrEqual(3);
  });
});

describe('晨曦敕命（edict）：只有大主教有', () => {
  it('招式表里有它，且归属唯一', () => {
    const m = ENEMY_MOVES.edict;
    expect(m, '大主教的专属招不在招式表里').toBeTruthy();
    expect(m.hazard, '敕命是 hazard 型（ GroundHazards 结算，与 flare 同链路）').toBeTruthy();
    expect(m.damage, '敕命本体 damage 必须是 0 —— 伤害由光环结算').toBe(0);
    expect(m.windup, '前摇给玩家的挪开窗口 ≥ 1.5 秒').toBeGreaterThanOrEqual(1.5);
    expect(m.telegraph?.color, '敕命要有可读出的预警圈颜色').toBeTypeOf('number');
    const owners = Object.entries(ENEMY_MOVE_SETS)
      .filter(([, ids]) => ids.includes('edict'))
      .map(([t]) => t);
    expect(owners, '敕命是大主教的专属招 —— 谁都能用等于没有专属').toEqual(['radiant_archon']);
  });

  it('它真的只配进大主教的招式组合', () => {
    expect(ENEMY_MOVE_SETS.radiant_archon).toContain('edict');
    // 招式组合里不能出现第二份"敕命"，也不能落到全默认三板斧
    expect(new Set(ENEMY_MOVE_SETS.radiant_archon).size).toBe(ENEMY_MOVE_SETS.radiant_archon.length);
  });
});

describe('它只在副本里见得到：晨曦圣殿的池子接住了它', () => {
  it('radiant-dawn-hall 池里有 radiant_archon，且不是那座池子打头的那一类', () => {
    const row = DUNGEON_ENCOUNTERS['radiant-dawn-hall'];
    const types = row.pool.map((e) => e.type);
    expect(types, '大主教登记进名册却不进任何池 ⇒ 玩家永远碰不到它').toContain('radiant_archon');
    const 权重最大 = [...row.pool].sort((a, b) => b.weight - a.weight)[0].type;
    expect(权重最大, '池子打头的是爬兽 —— 大主教是添头，不是主菜').toBe('radiant_crawler');
  });
});

describe('晨曦护符 / 晨曦赐福：底座与词缀接线完', () => {
  it('两样都在表里，GEAR_NAMES 双向覆盖，且稀有度档对得上', () => {
    const base = GEAR_BASES.find((r) => r.id === 'dawn-charm');
    expect(base, '新底座 dawn-charm 不在 GEAR_BASES').toBeTruthy();
    expect(base.slot).toBe('charm');
    expect(base.mods).toEqual({ vigor: 1, arcane: 1 });
    const affix = GEAR_AFFIXES.find((r) => r.id === 'dawn-blessed');
    expect(affix, '新词缀 dawn-blessed 不在 GEAR_AFFIXES').toBeTruthy();
    expect(affix.minRarity).toBe('rare');
    expect(affix.mods).toEqual({ vigor: 1, mind: 1 });   // 表内唯一 vigor×mind 配对
    expect(GEAR_NAMES['dawn-charm']).toBeTruthy();
    expect(GEAR_NAMES['dawn-blessed']).toBeTruthy();
    expect(ZH).toContain(GEAR_NAMES['dawn-charm']);
    expect(EN).toContain(GEAR_NAMES['dawn-charm']);
    expect(ZH).toContain(GEAR_NAMES['dawn-blessed']);
    expect(EN).toContain(GEAR_NAMES['dawn-blessed']);
  });

  it('dawn-charm 只从辉煌圣域池掉（不放进 default 兜底），且注册表双向校验过', () => {
    expect(GEAR_POOLS.radiant.some((e) => e.base === 'dawn-charm')).toBe(true);
    expect(GEAR_POOLS.default.some((e) => e.base === 'dawn-charm')).toBe(false);
    expect(poolForZone('radiant').some((e) => e.base === 'dawn-charm')).toBe(true);
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });
});
