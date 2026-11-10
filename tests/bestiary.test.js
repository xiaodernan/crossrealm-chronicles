/**
 * 敌人图鉴（W-F1 切片1）的门禁。
 *
 * ## 这一片为什么几乎没有"内容"要测
 *
 * 图鉴的条目是**推出来的**（名册 + 抗性表 + 体型表 + 击杀账），所以这里量的不是
 * "60 条文案写没写对"，而是三件更容易腐烂的事：
 *
 * 1. **口径有没有空转** —— 三类"应当存在"的特征（疾行 / 重装 / 浮空）如果一类都筛不出来，
 *    说明阈值写飘了，玩家看到的标签会是空的，而代码不会报错；
 * 2. **筛选档有没有空页** —— 每一档筛选都必须真的有条目，否则玩家点进去以为图鉴漏页；
 * 3. **它有没有偷偷变成第二个真源** —— 数值必须逐字等于名册与抗性表，
 *    击杀数必须只从 `stats.kills` 读；一旦有人在这里抄一份常量，第 1 条腿就会红。
 *
 * 另外两条静态腿盯着接线：HUD 的页签分支与日志注册表必须真的挂上 ——
 * 这个仓库里"加了系统但没人能打开"发生过不止一次（B35/B36 那一族）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { ENEMY_RESIST, BODY_PLANS } from '../src/content/tuning.js';
import {
  BESTIARY_ELEMENTS, BESTIARY_EXCLUDED, BESTIARY_FILTERS, BESTIARY_SHARED_ZONE,
  BESTIARY_TIERS, BESTIARY_TRAITS,
  bestiaryAffinity, bestiaryTierOf, bestiaryTraits, bestiaryTypes, bestiaryZoneOf,
} from '../src/content/bestiary.js';
import { BestiarySystem } from '../src/game/BestiarySystem.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

/** 造一个只有击杀账的宿主：图鉴只读 `stats.kills`，不该碰别的 */
const 宿主 = (kills = {}) => ({ stats: { kills } });

describe('内容层：收录范围与训练木人', () => {
  it('收录 = 名册去掉训练木人，一类不多一类不少', () => {
    const types = bestiaryTypes();
    expect(types).toEqual(Object.keys(ENEMY_ROSTER).filter((t) => !BESTIARY_EXCLUDED.includes(t)));
    expect(types).not.toContain('dummy');
    expect(types.length, '名册只剩个位数了？这张表不该空转').toBeGreaterThan(40);
  });

  it('训练木人被排除的理由今天仍成立（不可攻击 / 不刷新）', () => {
    expect(ENEMY_ROSTER.dummy.canAttack).toBe(false);
    expect(ENEMY_ROSTER.dummy.respawn).toBe(false);
  });

  it('每一类都归到一个合法档，且四座有前缀的位面各至少一类', () => {
    const 合法 = new Set(BESTIARY_FILTERS.map((f) => f.id).filter((id) => id !== 'all'));
    for (const type of bestiaryTypes()) expect(合法.has(bestiaryZoneOf(type)), `${type} 归到野档`).toBe(true);
    for (const zone of ['gloom', 'radiant', 'void', 'abyss']) {
      expect(bestiaryTypes().filter((t) => bestiaryZoneOf(t) === zone).length, `${zone} 一类独占敌人都没有`).toBeGreaterThan(0);
    }
    expect(bestiaryZoneOf('soldier')).toBe(BESTIARY_SHARED_ZONE);
  });

  it('筛选条没有空页：每一档（含通用）都真的有条目', () => {
    for (const filter of BESTIARY_FILTERS.filter((f) => f.id !== 'all')) {
      expect(bestiaryTypes().filter((t) => bestiaryZoneOf(t) === filter.id).length, `筛选档 "${filter.id}" 是空的`).toBeGreaterThan(0);
    }
  });
});

describe('内容层：档位判据', () => {
  it('0 / 负数 / 脏值 ⇒ 未记录（null），不是最低档', () => {
    expect(bestiaryTierOf(0)).toBe(null);
    expect(bestiaryTierOf(-3)).toBe(null);
    expect(bestiaryTierOf(Number.NaN)).toBe(null);
    expect(bestiaryTierOf(undefined)).toBe(null);
  });

  it('阈值边界逐档对齐（1 / 4 / 5 / 14 / 15）', () => {
    expect(bestiaryTierOf(1).id).toBe('sighted');
    expect(bestiaryTierOf(4).id).toBe('sighted');
    expect(bestiaryTierOf(5).id).toBe('studied');
    expect(bestiaryTierOf(14).id).toBe('studied');
    expect(bestiaryTierOf(15).id).toBe('mastered');
    expect(bestiaryTierOf(999).id).toBe('mastered');
  });

  it('档位阈值单调递增（写成 5 / 1 / 15 会让"精通"比"见过"更容易）', () => {
    const 阈值 = BESTIARY_TIERS.map((t) => t.kills);
    expect(阈值).toEqual([...阈值].sort((a, b) => a - b));
  });
});

describe('内容层：特征标签是阈值推出来的，不是手抄名单', () => {
  it('每个标签都至少命中一类（阈值写飘了这条就红）', () => {
    for (const trait of BESTIARY_TRAITS) {
      const 命中 = bestiaryTypes().filter((t) => bestiaryTraits(t).some((row) => row.id === trait.id));
      expect(命中.length, `标签 "${trait.id}" 一类都命中不了`).toBeGreaterThan(0);
    }
  });

  it('命中与否逐类等于名册/体型表的原始读数（没有第二份真相）', () => {
    for (const type of bestiaryTypes()) {
      const row = ENEMY_ROSTER[type];
      const ids = bestiaryTraits(type).map((t) => t.id);
      expect(ids.includes('swift'), `${type} 的疾行`).toBe((row.speed ?? 0) >= 6.5);
      expect(ids.includes('heavy'), `${type} 的重装`).toBe((row.hp ?? 0) >= 240);
      expect(ids.includes('sturdy'), `${type} 的硬架势`).toBe((row.posture ?? 0) >= 80);
      expect(ids.includes('far'), `${type} 的远哨`).toBe((row.aggroRange ?? 0) >= 28);
      expect(ids.includes('hover'), `${type} 的浮空`).toBe((BODY_PLANS[type]?.hover ?? 0) > 0);
    }
  });

  it('同一类的标签不重复', () => {
    for (const type of bestiaryTypes()) {
      const ids = bestiaryTraits(type).map((t) => t.id);
      expect(new Set(ids).size, `${type} 的标签有重复`).toBe(ids.length);
    }
  });
});

describe('内容层：属性相性的符号沿用 ENEMY_RESIST', () => {
  it('负数 = 弱点、正数 = 抗性（取最狠的一份）', () => {
    // gloom_wisp: fire -0.2 / gravity 0.2
    const a = bestiaryAffinity('gloom_wisp');
    expect(a.weak.id).toBe('fire');
    expect(a.weak.value).toBeCloseTo(-0.2);
    expect(a.resist.id).toBe('gravity');
    // golem: fire 0.25 / ice 0.35 ⇒ 抗性取更大的那一份
    const g = bestiaryAffinity('golem');
    expect(g.resist.id).toBe('ice');
    expect(g.weak).toBe(null);
  });

  it('没有抗性数据的类返回全空（不编一个 0 出来）', () => {
    expect(bestiaryAffinity('dummy')).toEqual({ weak: null, resist: null });
    expect(bestiaryAffinity('不存在的敌人')).toEqual({ weak: null, resist: null });
  });

  it('每一条相性都能在抗性表里找到同一份读数', () => {
    for (const type of bestiaryTypes()) {
      const { weak, resist } = bestiaryAffinity(type);
      const row = ENEMY_RESIST[type] ?? {};
      if (weak) expect(row[weak.id], `${type} 的弱点读数对不上`).toBe(weak.value);
      if (resist) expect(row[resist.id], `${type} 的抗性读数对不上`).toBe(resist.value);
      for (const elem of [weak, resist].filter(Boolean)) {
        expect(BESTIARY_ELEMENTS.some((e) => e.id === elem.id), `${type} 出现了未登记的元素 ${elem.id}`).toBe(true);
      }
    }
  });
});

describe('运行时：只读击杀账，不自己记数', () => {
  it('击杀数逐类读 stats.kills；未杀过 = 0 且 known=false', () => {
    const sys = new BestiarySystem(宿主({ soldier: 3, golem: 15 }));
    expect(sys.killsOf('soldier')).toBe(3);
    expect(sys.killsOf('golem')).toBe(15);
    expect(sys.killsOf('knight')).toBe(0);
    expect(sys.entryOf('soldier').tierId).toBe('sighted');
    expect(sys.entryOf('golem').tierId).toBe('mastered');
    expect(sys.entryOf('knight').known).toBe(false);
    expect(sys.entryOf('knight').tier).toBe(null);
  });

  it('条目里的数值逐字等于名册（改一个 hp 这条会红）', () => {
    const sys = new BestiarySystem(宿主({}));
    for (const type of bestiaryTypes()) {
      const row = ENEMY_ROSTER[type];
      const e = sys.entryOf(type);
      expect(e.stats.hp, `${type}.hp`).toBe(row.hp ?? 0);
      expect(e.stats.posture, `${type}.posture`).toBe(row.posture ?? 0);
      expect(e.stats.damage, `${type}.damage`).toBe(row.damage ?? 0);
      expect(e.stats.speed, `${type}.speed`).toBe(row.speed ?? 0);
      expect(e.nameKey, `${type} 的名字键`).toBe(row.name);
    }
  });

  it('entries 按位面筛，filter=all 给全部；未知档给空数组', () => {
    const sys = new BestiarySystem(宿主({}));
    const all = sys.entries('all');
    expect(all.length).toBe(bestiaryTypes().length);
    const gloom = sys.entries('gloom');
    expect(gloom.length).toBeGreaterThan(0);
    expect(gloom.every((e) => e.zone === 'gloom')).toBe(true);
    expect(sys.entries('月亮城')).toEqual([]);
  });

  it('getStats：seen/total/percent/mastered 四个读数一致', () => {
    const total = bestiaryTypes().length;
    const kills = { soldier: 1, golem: 15, drone: 5 };
    const sys = new BestiarySystem(宿主(kills));
    const s = sys.getStats();
    expect(s.total).toBe(total);
    expect(s.seen).toBe(3);
    expect(s.mastered).toBe(1);
    expect(s.percent).toBe(Math.round((3 / total) * 100));
    expect(s.tiers.sighted).toBe(1);
    expect(s.tiers.studied).toBe(1);
    expect(s.tiers.mastered).toBe(1);
  });

  it('账上多出来的旧 id 不影响读数（按名册遍历，不按账遍历）', () => {
    const sys = new BestiarySystem(宿主({ ghost_of_old_patch: 99, soldier: 2 }));
    expect(sys.getStats().seen).toBe(1);
    expect(sys.getStats().total).toBe(bestiaryTypes().length);
  });

  it('stats 还没装配时也不炸（设置面板能在开局前打开）', () => {
    const sys = new BestiarySystem({});
    expect(() => sys.getStats()).not.toThrow();
    expect(sys.getStats().seen).toBe(0);
    expect(() => new BestiarySystem(undefined).getStats()).not.toThrow();
  });

  it('highlights 按档位、再按击杀数排，且只收已记录的那些', () => {
    const sys = new BestiarySystem(宿主({ soldier: 2, golem: 20, drone: 6 }));
    const h = sys.highlights(2);
    expect(h.map((e) => e.type)).toEqual(['golem', 'drone']);
    expect(sys.highlights(0)).toEqual([]);
  });

  it('dispose 之后宿主引用被断开（不把整棵 Game 留在内存里）', () => {
    const sys = new BestiarySystem(宿主({}));
    sys.dispose();
    expect(sys.game).toBe(null);
  });
});

describe('接线：页签、子面板、计数分支、文案键', () => {
  it('日志注册表里有 bestiary 且指向已登记的键', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'ui', 'JournalTabRegistry.js'), 'utf8');
    expect(src).toMatch(/bestiary:\s*'journal_tab_bestiary'/);
    expect(STRINGS_ZH.journal_tab_bestiary).toBe('图鉴');
    expect(STRINGS_EN.journal_tab_bestiary).toBe('Bestiary');
  });

  it('HUD 有子面板与计数分支（加了系统却打不开是这一族的旧病）', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'ui', 'HUD.js'), 'utf8');
    expect(src).toMatch(/bestiary:\s*\(game, panel\)\s*=>\s*game\.bestiaryTab\.render\(panel\)/);
    expect(src).toMatch(/k === 'bestiary'/);
  });

  it('Game 装配了系统与页签，且系统进了 teardown 登记表', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'Game.js'), 'utf8');
    expect(src).toMatch(/new BestiarySystem\(this\)/);
    expect(src).toMatch(/new BestiaryJournalTab\(this\)/);
    expect(src).toMatch(/_adopt\('game\/BestiarySystem'/);
  });

  it('双表登记齐全：内容表标签与页签里出现的每个 t() 键都在两张表里', () => {
    const keys = new Set([
      ...BESTIARY_TIERS.map((t) => t.label),
      ...BESTIARY_ELEMENTS.map((e) => e.label),
      ...BESTIARY_TRAITS.map((t) => t.label),
      ...BESTIARY_FILTERS.map((f) => f.label),
      'journal_tab_bestiary', 'bestiary_stats_fmt', 'bestiary_kills_fmt',
      'bestiary_stats_line_fmt', 'bestiary_weak_fmt', 'bestiary_resist_fmt',
      'bestiary_no_affinity', 'bestiary_locked_name', 'bestiary_locked_hint', 'bestiary_empty',
    ]);
    const ui = readFileSync(join(process.cwd(), 'src', 'ui', 'BestiaryJournalTab.js'), 'utf8');
    for (const m of ui.matchAll(/\bt\('([a-z0-9_]+)'/g)) keys.add(m[1]);
    const 缺中 = [...keys].filter((k) => !(k in STRINGS_ZH));
    const 缺英 = [...keys].filter((k) => !(k in STRINGS_EN));
    expect(缺中, '中文表缺键').toEqual([]);
    expect(缺英, '英文表缺键').toEqual([]);
  });

  it('UI 里没有裸中文（注释除外）—— 英文玩家不该在图鉴里读到中文', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'ui', 'BestiaryJournalTab.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const 裸中文 = src.match(/['"`][^'"`]*[\u4e00-\u9fa5][^'"`]*['"`]/g) ?? [];
    expect(裸中文, `裸中文：${裸中文.join(' | ')}`).toEqual([]);
  });
});
