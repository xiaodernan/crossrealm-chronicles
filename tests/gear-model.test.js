/**
 * 装备的数据层与那一本账（W-B5 切片1）。
 *
 * 覆盖四件事，每件都只有一个真源要守：
 * 1. 表自己合规矩（注册表加载期已经抛过一次，这里是**可读的复证** + 拒绝路径的用例）；
 * 2. `rollGear` 抽出来的是**表上说的那一件**（注入定序 rng，于是期望值是写得出的具体件）；
 * 3. 一件装备换算成属性点只有一处算式（`gearMods`），而属性点折进读数也只有一处（`PlayerStats`）；
 * 4. 存盘存的是出身点而不是含装备的读数 —— 这一条错了就是"读一次档装备算两遍"。
 *
 * 用例里的数字都是**字面量**而不是从表里现算的：从表算等于让被测对象自己当裁判（切片32 的
 * 变异探针就是因为出厂值只被"与 `PAD` 相等"这种同义反复守着，改出厂值时全套仍然绿）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GEAR_SLOTS, GEAR_STATS, GEAR_RARITY, GEAR_BASES, GEAR_AFFIXES,
  rollGear, gearMods, isGearInstance, rarityOf, rarityRank, baseOf, affixOf,
} from '../src/content/gear.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { PlayerStats } from '../src/game/PlayerStats.js';

/* ------------------------------------------------------------------ *
 * 共用零件
 * ------------------------------------------------------------------ */

/**
 * 定序 rng：`seq` 给什么就返回什么，用完重复最后一个。
 * 生产代码只要求 `() => number`，所以这里不解释"为什么是这几个数"—— 解释写在用例里。
 */
const rngOf = (seq) => {
  let i = 0;
  return () => seq[Math.min(i++, seq.length - 1)];
};

/** 一条线性同余序列：用来证明"抽 500 次不会出同词缀两条 / 越档的词缀"这类全量性质 */
function lcg(seed = 20260927) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const registryKinds = () => CONTENT_TABLES.map((t) => t.kind);
const tableOf = (kind) => CONTENT_TABLES.find((t) => t.kind === kind);

const statsWithWindow = () => {
  const dispatched = [];
  globalThis.window = { dispatchEvent: (e) => dispatched.push(e) };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
  return dispatched;
};

/* ------------------------------------------------------------------ *
 * 一、表
 * ------------------------------------------------------------------ */

describe('装备表：形状与自洽', () => {
  it('三张表都进了注册表，而且 kind 不重复', () => {
    for (const kind of ['gearRarity', 'gearBases', 'gearAffixes']) {
      expect(registryKinds().filter((k) => k === kind), `${kind} 没登记 = 加载期没人校验它`).toHaveLength(1);
    }
    expect(new Set(registryKinds()).size, 'kind 有重复 = 前一条永远查不到').toBe(registryKinds().length);
  });

  it('槽位、稀有度、基表、词缀都在表里，且 id 唯一', () => {
    expect(GEAR_SLOTS).toEqual(['charm', 'sigil']);
    for (const rows of [GEAR_RARITY, GEAR_BASES, GEAR_AFFIXES]) {
      const ids = rows.map((r) => r.id);
      expect(new Set(ids).size, `id 重复 = 后一件永远抽不到`).toBe(ids.length);
    }
    // 查表口与表本身必须一致：`baseOf('ash-charm')` 拿不到东西时，存档里那一件会被无声丢掉
    for (const base of GEAR_BASES) expect(baseOf(base.id), base.id).toBe(base);
    for (const affix of GEAR_AFFIXES) expect(affixOf(affix.id), affix.id).toBe(affix);
    for (const rarity of GEAR_RARITY) expect(rarityOf(rarity.id), rarity.id).toBe(rarity);
  });

  it('每个槽都有人掉：槽表里有而基表没有 = 那一格永远空着', () => {
    const slots = new Set(GEAR_BASES.map((b) => b.slot));
    expect([...slots].sort(), '基表写了表外的槽').toEqual([...GEAR_SLOTS].sort());
    for (const slot of GEAR_SLOTS) {
      expect(GEAR_BASES.filter((b) => b.slot === slot).length, `${slot} 一条基表都没有`).toBeGreaterThan(0);
    }
  });

  it('mods 只写装备真能改的属性，而且是正整数', () => {
    for (const row of [...GEAR_BASES, ...GEAR_AFFIXES]) {
      const keys = Object.keys(row.mods);
      expect(keys.length, `${row.id} 什么都不给 = 一件白捡的装备`).toBeGreaterThan(0);
      for (const [stat, n] of Object.entries(row.mods)) {
        expect(GEAR_STATS, `${row.id} 给了 "${stat}"：PlayerStats 里没有这一项，那一点没有主人`).toContain(stat);
        expect(Number.isInteger(n) && n >= 1, `${row.id}.${stat} = ${n}`).toBe(true);
      }
    }
  });

  it('词缀的门槛档位是认得出来的稀有度，且排序真的有序', () => {
    const ids = GEAR_RARITY.map((r) => r.id);
    for (const affix of GEAR_AFFIXES) {
      expect(ids, `${affix.id} 的 minRarity 不在稀有度里`).toContain(affix.minRarity);
    }
    expect(ids.map(rarityRank), '档位排序必须与表序一致（invariant 就是按它数够不够条）')
      .toEqual([0, 1, 2, 3]);
    expect(rarityRank('not-a-rarity'), '表外的档位不能被判成"够得到"').toBe(-1);
  });

  it('每一档要的条数都够得到：够不到就是 rollGear 静默少给', () => {
    for (const rarity of GEAR_RARITY) {
      if (!rarity.affixes) continue;
      const reachable = GEAR_AFFIXES
        .filter((a) => rarityRank(a.minRarity) <= rarityRank(rarity.id)).length;
      expect(reachable, `${rarity.id} 要 ${rarity.affixes} 条，够得到的只有 ${reachable} 条`)
        .toBeGreaterThanOrEqual(rarity.affixes);
    }
  });

  it('权重是正整数：0 或负数的话累计抽样会跳段，而"跳段"表现为某一件永远掉不出', () => {
    for (const rows of [GEAR_RARITY, GEAR_BASES, GEAR_AFFIXES]) {
      for (const r of rows) {
        expect(Number.isInteger(r.weight) && r.weight > 0, `${r.id}.weight = ${r.weight}`).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 二、校验真的拦得住（accept + refuse 两侧）
 * ------------------------------------------------------------------ */

describe('注册表对装备表的校验：好表过、坏表红', () => {
  it('出厂三张表零错误（registry 加载期已经抛过一次，这里要的是能读的那份清单）', () => {
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });

  /**
   * 改一份**内存里的副本**再校验：绝不写盘、绝不动 `src/`。
   * 这些是"错表必须红"的拒绝侧 —— 只验好表的话，一条坏规则也可能因为压根没跑而永远绿。
   */
  const checkWith = (kind, mutate) => {
    const tables = CONTENT_TABLES.map((t) => {
      if (t.kind !== kind) return t;
      const table = structuredClone(t.table);
      mutate(table);
      return { ...t, table };
    });
    return checkContent(tables);
  };

  it('基表写一个表外的槽：红，而且点名那一个槽', () => {
    const errors = checkWith('gearBases', (rows) => { rows[0].slot = 'helmet'; });
    expect(errors.join('\n')).toMatch(/gearBases\[0\]\.slot.*不在允许值里/s);
  });

  it('基表给一个没人读的属性点：红（那一点没有主人，界面上却写着加了 3 点）', () => {
    const errors = checkWith('gearBases', (rows) => { rows[0].mods = { luck: 3 }; });
    expect(errors.join('\n')).toMatch(/mods\.luck.*不是装备能改的属性/s);
  });

  it(' mods 是空对象：红（一件什么都不给的装备能掉出来，玩家只看到拾取提示）', () => {
    const errors = checkWith('gearAffixes', (rows) => { rows[0].mods = {}; });
    expect(errors.join('\n')).toMatch(/gearAffixes\[0\]\.mods.*不许是空对象/s);
  });

  it('词缀门槛写成一个打错的稀有度：红（ref 查不到 = 那条词缀永远够不到任何档）', () => {
    const errors = checkWith('gearAffixes', (rows) => { rows[0].minRarity = 'epi'; });
    expect(errors.join('\n')).toMatch(/minRarity.*不在 gearRarity 里/s);
  });

  it('把某档要的条数抬到词缀池之上：invariant 红，而不是运行时静默少给', () => {
    // 条数写在稀有度那一侧，所以规则挂在 gearRarity 的 invariant 上：`invariant` 只拿得到自己那张表
    const errors = checkWith('gearRarity', (rows) => { rows[0].affixes = 3; });
    expect(errors.join('\n')).toMatch(/稀有度 "common" 要 3 条词缀.*够得到的只有 2 条/s);
  });

  it('一个槽被清空：红（那一格从此永远空着，而面板上没有别的入口能填它）', () => {
    const errors = checkWith('gearBases', (rows) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].slot === 'sigil') rows.splice(i, 1);
    });
    expect(errors.join('\n')).toMatch(/槽位 "sigil" 一条基表都没有/s);
  });

  it('权重写成 0：红（累计抽样会跳过那一段，表现为"这一件永远掉不出"）', () => {
    const errors = checkWith('gearBases', (rows) => { rows[0].weight = 0; });
    expect(errors.join('\n')).toMatch(/gearBases\[0\]\.weight.*至少 1/s);
  });

  it('三张表的权重下限各自都要拦住：少写一格的表就是那一格能填 0', () => {
    // 只在 gearBases 上验一次，等于默认另外两张表的字段表抄对了 —— 变异探针 M12 就是从这里抓出来的
    for (const kind of ['gearRarity', 'gearBases', 'gearAffixes']) {
      const errors = checkWith(kind, (rows) => { rows[0].weight = 0; });
      expect(errors.join('\n'), `${kind} 的 weight 收到 0 也不报`).toMatch(new RegExp(`${kind}\\[0\\]\\.weight.*至少 1`));
    }
  });

  it('门禁自证：三张表各自挂着整表规则，而不是靠字段表顺手报', () => {
    for (const kind of ['gearRarity', 'gearBases', 'gearAffixes']) {
      expect(tableOf(kind).invariant, `${kind} 没有 invariant：那条整表规则压根没跑`).toBeTypeOf('function');
    }
    // 抽掉 invariant 之后，"改坏条数"必须变成没人报 —— 证明红的是这条规则而不是别的
    const tables = CONTENT_TABLES.map((t) => ({ ...t, invariant: undefined }));
    const mutated = tables.map((t) => (t.kind === 'gearRarity'
      ? { ...t, table: t.table.map((r, i) => (i === 0 ? { ...r, affixes: 3 } : r)) } : t));
    expect(checkContent(mutated).join('\n')).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * 三、抽取
 * ------------------------------------------------------------------ */

describe('rollGear：抽出来的是表上说的那一件', () => {
  it('rng 给 0 落进第一段：凡品 + 表上第一件基表', () => {
    const got = rollGear(rngOf([0, 0, 0, 0]));
    expect(got).toEqual({ base: 'ash-charm', rarity: 'common', affixes: [] });
  });

  it('rng 接近 1 落进最后一段：史诗 + 最后一件基表 + 三条词缀', () => {
    // 0.9999 / 0.9999 都在各自累计段的最末一档；第三次起给 0 = 每轮都取当前池的第一条
    const got = rollGear(rngOf([0.9999, 0.9999, 0, 0, 0]));
    expect(got.rarity).toBe('epic');
    expect(got.base).toBe('dual-sigil');
    expect(got.affixes).toHaveLength(3);
    // 史诗够得到池里每一条（rng 给 0 就取第一段），所以这三件是算得出的，不是"看到过就算对"
    expect(got.affixes).toEqual(['vigor-ward', 'endurance-march', 'ember-edge']);
  });

  it('条数跟着稀有度走：良品 1 条、稀有 2 条', () => {
    // 稀有度累计：62 / 88 / 97 / 100 → 0.7 落在 uncommon，0.9 落在 rare
    expect(rollGear(rngOf([0.7, 0, 0, 0])).affixes).toHaveLength(1);
    expect(rollGear(rngOf([0.9, 0, 0, 0])).affixes).toHaveLength(2);
  });

  it('同一件里不许出现两条同名词缀：那是同一件给自己加两遍同一条属性', () => {
    const roll = lcg();
    for (let i = 0; i < 400; i++) {
      const got = rollGear(roll);
      expect(new Set(got.affixes).size, JSON.stringify(got)).toBe(got.affixes.length);
      expect(got.affixes.length).toBe(rarityOf(got.rarity).affixes);
    }
  });

  it('词缀不许越过自己的门槛档：凡品上不长史诗的词', () => {
    const roll = lcg(7);
    for (let i = 0; i < 400; i++) {
      const got = rollGear(roll);
      for (const id of got.affixes) {
        expect(rarityRank(affixOf(id).minRarity) <= rarityRank(got.rarity),
          `${got.rarity} 抽到了 ${id}（门槛 ${affixOf(id).minRarity}）`).toBe(true);
      }
    }
  });

  it('抽出来的每一件都存得下、认得出：`isGearInstance` 对 roll 的结果恒真', () => {
    const roll = lcg(11);
    for (let i = 0; i < 200; i++) {
      expect(isGearInstance(rollGear(roll))).toBe(true);
    }
  });

  it('rng 恰好给 1.0 时不崩（累计段用 `<` 切，最后一档要有归属）', () => {
    const got = rollGear(rngOf([1, 1, 1, 1]));
    expect(rarityOf(got.rarity)).toBeTruthy();
    expect(baseOf(got.base)).toBeTruthy();
  });

  it('抽两件互相独立：不共享"已经抽过"的账', () => {
    const seq = [0.9, 0.1, 0.5, 0.5];
    expect(rollGear(rngOf(seq))).toEqual(rollGear(rngOf(seq)));
  });
});

/* ------------------------------------------------------------------ *
 * 四、换算
 * ------------------------------------------------------------------ */

describe('gearMods：一件装备等于几点', () => {
  it('基表 + 词缀一起加（词缀是**额外**的，不是替换）', () => {
    const instance = { base: 'ash-charm', rarity: 'rare', affixes: ['vigor-ward', 'arcane-lens'] };
    expect(gearMods(instance)).toEqual({ vigor: 2, arcane: 1 });
  });

  it('表外的 base：null（调用方按"这一件不算"处理，而不是按 0 点穿上身）', () => {
    expect(gearMods({ base: 'excalibur', rarity: 'common', affixes: [] })).toBeNull();
    expect(gearMods(null)).toBeNull();
    expect(gearMods(undefined)).toBeNull();
  });

  it('重复词缀只算一遍、表外词缀不进账', () => {
    const instance = { base: 'ash-charm', rarity: 'epic', affixes: ['vigor-ward', 'vigor-ward', 'nonsense'] };
    expect(gearMods(instance)).toEqual({ vigor: 2 });    // 基表 1 + 词缀 1（第二次出现的不算）
  });

});

describe('isGearInstance：存档可以被人手写', () => {
  const good = { base: 'quill-sigil', rarity: 'uncommon', affixes: ['arcane-lens'] };

  it('好的一件通过，而且是通过以后再被拒的那些才叫拦截', () => {
    expect(isGearInstance(good)).toBe(true);
  });

  it.each([
    ['不是对象', null],
    ['base 打错', { ...good, base: 'quill-sigll' }],
    ['rarity 打错', { ...good, rarity: 'rare2' }],
    ['没有 rarity', { base: good.base, affixes: [] }],
    ['affixes 不是数组', { ...good, affixes: 'arcane-lens' }],
    ['词缀里有表外的', { ...good, affixes: ['ghost-touch'] }],
    ['词缀重复', { ...good, affixes: ['arcane-lens', 'arcane-lens'] }],
    ['词缀越过门槛档', { base: good.base, rarity: 'common', affixes: ['arcane-lens'] }],
  ])('%s：拒', (_label, instance) => {
    expect(isGearInstance(instance)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 五、PlayerStats：装备折进同一本账
 * ------------------------------------------------------------------ */

describe('PlayerStats：出身点 + 装备 = 读数，而写的一侧只碰出身点', () => {
  it('出厂读数（回归锚点：拆出 baseStats 不许顺手改手感）', () => {
    statsWithWindow();
    const s = new PlayerStats();
    expect([s.maxHp, s.maxStamina, s.damageMult, s.skillMult])
      .toEqual([118, 108, 1.08, 1.12]);
    expect([s.vigor, s.endurance, s.strength, s.arcane, s.mind]).toEqual([1, 1, 1, 1, 0]);
    expect(s.gear).toEqual({ charm: null, sigil: null });
  });

  it('穿上一件：五个读数里相关的那几个跟着涨', () => {
    statsWithWindow();
    const s = new PlayerStats();
    expect(s.equip('charm', { base: 'ash-charm', rarity: 'rare', affixes: ['vigor-ward'] })).toBe(null);
    expect(s.vigor, '基表 1 点 + 词缀 1 点 + 出身 1 点').toBe(3);
    expect(s.maxHp).toBe(154);
  });

  it('两槽各自给点，一起算', () => {
    statsWithWindow();
    const s = new PlayerStats();
    s.equip('charm', { base: 'ember-charm', rarity: 'common', affixes: [] });
    s.equip('sigil', { base: 'war-sigil', rarity: 'common', affixes: [] });
    expect(s.strength).toBe(3);                      // 出身 1 + 两件各 1
    expect(s.damageMult).toBeCloseTo(1 + 3 * 0.08, 10);
  });

  it('换下之后逐字回到穿上之前', () => {
    statsWithWindow();
    const s = new PlayerStats();
    const before = [s.maxHp, s.damageMult, s.skillMult, s.gearBonus('arcane')];
    s.equip('sigil', { base: 'quill-sigil', rarity: 'uncommon', affixes: ['arcane-lens'] });
    expect(s.arcane).toBe(3);
    expect(s.unequip('sigil')).toEqual({ base: 'quill-sigil', rarity: 'uncommon', affixes: ['arcane-lens'] });
    expect([s.maxHp, s.damageMult, s.skillMult, s.gearBonus('arcane')]).toEqual(before);
  });

  it('空槽卸装：返回 null 且不发一次多余的推送', () => {
    const events = statsWithWindow();
    const s = new PlayerStats();
    expect(s.unequip('charm')).toBe(null);
    expect(events).toEqual([]);
  });

  it('setter 写的是出身点：装备那几点不会被"赋值"抹掉', () => {
    statsWithWindow();
    const s = new PlayerStats();
    s.equip('charm', { base: 'ash-charm', rarity: 'common', affixes: [] });   // +1 vigor
    s.vigor = 5;                              // `QuestAssistant` 的自动通关 cheat 就是这么写的
    expect(s.baseStats.vigor).toBe(5);
    expect(s.vigor, '读数必须还是含装备的那一份').toBe(6);
  });

  it('未知槽位当场抛：拼错的槽名静默失效的话，玩家看到的"已装备"就是假的', () => {
    statsWithWindow();
    const s = new PlayerStats();
    expect(() => s.equip('chrm', { base: 'ash-charm', rarity: 'common', affixes: [] })).toThrow(/未知的装备槽/);
    expect(() => s.unequip('chrm')).toThrow(/未知的装备槽/);
  });

  it('坏的一件拒收，账本一动不动（返回 false 而不是抛：这一路的数据来自存档）', () => {
    statsWithWindow();
    const s = new PlayerStats();
    expect(s.equip('charm', { base: 'nope', rarity: 'common', affixes: [] })).toBe(false);
    expect(s.gear.charm).toBe(null);
    expect(s.vigor).toBe(1);
  });

  it('存的是**拷的一份**：调用方随后改自己那个对象，不许把身上穿着的改了', () => {
    statsWithWindow();
    const s = new PlayerStats();
    const raw = { base: 'ash-charm', rarity: 'rare', affixes: ['vigor-ward'] };
    s.equip('charm', raw);
    raw.affixes.push('ember-edge');
    raw.rarity = 'common';
    expect(s.gear.charm).toEqual({ base: 'ash-charm', rarity: 'rare', affixes: ['vigor-ward'] });
    expect(s.vigor, '加上去的那条词缀不该跟着进账').toBe(3);
  });
});

describe('PlayerStats 的存档：读一次档不许把装备算两遍', () => {
  it('toJSON 里的属性是出身点，不是含装备的读数', () => {
    statsWithWindow();
    const s = new PlayerStats();
    s.equip('charm', { base: 'ash-charm', rarity: 'common', affixes: [] });   // vigor: 出身 1 + 装备 1
    const bag = s.toJSON();
    expect(bag.vigor, '存了读数 = 读档时装备再折一次，vigor 会变 4').toBe(1);
    expect(s.vigor).toBe(2);
    expect(bag.gear.charm).toEqual({ base: 'ash-charm', rarity: 'common', affixes: [] });
  });

  it('存 → 读 → 存：逐字相同，读数也相同', () => {
    statsWithWindow();
    const s = new PlayerStats();
    s.levelUp('arcane');
    s.equip('sigil', { base: 'dual-sigil', rarity: 'epic', affixes: ['twin-fang', 'arcane-lens', 'vigor-ward'] });
    const first = s.toJSON();
    const back = new PlayerStats();
    back.fromJSON(first);
    expect(back.toJSON()).toEqual(first);
    expect([back.arcane, back.strength, back.vigor]).toEqual([s.arcane, s.strength, s.vigor]);
  });

  it('切片1 之前的老档（根本没有 gear 这一格）：两槽落空，玩家升过的点原样保留', () => {
    statsWithWindow();
    const s = new PlayerStats();
    s.fromJSON({ level: 4, souls: 210, vigor: 3, endurance: 2, strength: 5, arcane: 1, mind: 0, totalKills: 9 });
    expect(s.gear).toEqual({ charm: null, sigil: null });
    expect([s.vigor, s.strength, s.maxHp]).toEqual([3, 5, 154]);
    expect(s.levelUpCost()).toBe(260);
  });

  it('坏的一件丢掉，另一槽仍然进账（逐件回落，与 `padTuning` 同一条纪律）', () => {
    statsWithWindow();
    const s = new PlayerStats();
    s.fromJSON({
      vigor: 1,
      gear: {
        charm: { base: 'ash-charm', rarity: 'common', affixes: [] },
        sigil: { base: 'ghost-sigil', rarity: 'common', affixes: [] },
      },
    });
    expect(s.gear.charm).toEqual({ base: 'ash-charm', rarity: 'common', affixes: [] });
    expect(s.gear.sigil, '表外的 base 不许进账：那件装备会一直显示而点数算不清').toBe(null);
    expect(s.vigor).toBe(2);
  });

  it('存档里没有 stats 对象：直接不动（`fromJSON(null)` 的旧语义保持）', () => {
    statsWithWindow();
    const s = new PlayerStats();
    expect(() => s.fromJSON(null)).not.toThrow();
    expect(s.vigor).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * 六、唯一推送口
 * ------------------------------------------------------------------ */

describe('属性读数变了之后，推给消费者只有那一处', () => {
  const fakeConsumers = () => {
    const combat = { hp: 50, stamina: 50, maxHp: 0, maxStamina: 0, damageMult: 0, skillMult: 0 };
    const calls = [];
    const spells = { syncMana() { calls.push('syncMana'); } };
    return { combat, calls, consumers: { combat, spells } };
  };

  it('没登记消费者时不炸（早期启动 / 单元测试里的裸 stats）', () => {
    const events = statsWithWindow();
    const s = new PlayerStats();
    s.souls = 500;                              // 升不了级的那条路不发事件，这里要的是两次"确实改了"
    expect(() => s.levelUp('vigor')).not.toThrow();
    expect(() => s.equip('charm', { base: 'ash-charm', rarity: 'common', affixes: [] })).not.toThrow();
    expect(events.map((e) => e.type)).toEqual(['stats-changed', 'stats-changed']);
  });

  it('登记那一次就推一次：开机之后 combat 拿到的是当前读数', () => {
    statsWithWindow();
    const s = new PlayerStats();
    const { combat, calls, consumers } = fakeConsumers();
    s.bindConsumers(consumers);
    expect(combat.maxHp, 'maxHp 必须跟着 stats 走，否则第一条血条就是旧的').toBe(118);
    expect(calls).toEqual(['syncMana']);
  });

  it('升级与穿戴都推：combat 与蓝条一起跟，不用调用方各抄一句', () => {
    statsWithWindow();
    const s = new PlayerStats();
    const { combat, calls, consumers } = fakeConsumers();
    s.bindConsumers(consumers);
    s.souls = 500;
    calls.length = 0;
    s.levelUp('vigor');
    expect(calls, '升级推了一次蓝条').toEqual(['syncMana']);
    expect(combat.maxHp).toBe(136);
    calls.length = 0;
    s.equip('charm', { base: 'ash-charm', rarity: 'common', affixes: [] });
    expect(calls, '穿戴推了一次蓝条').toEqual(['syncMana']);
    expect(combat.maxHp, '穿戴的 +1 vigor 也要进 combat').toBe(154);
    calls.length = 0;
    s.unequip('charm');
    expect(calls).toEqual(['syncMana']);
    expect(combat.maxHp).toBe(136);
  });

  it('加灵魂也走同一个口（它不改属性，但事件那半仍然要说真话）', () => {
    const events = statsWithWindow();
    const s = new PlayerStats();
    const { calls, consumers } = fakeConsumers();
    s.bindConsumers(consumers);
    calls.length = 0;
    s.addSouls(30);
    expect(events.length).toBeGreaterThan(0);
    expect(calls, '加灵魂不改读数：推不推都一样，但推的路径只有这一条').toEqual(['syncMana']);
  });
});

/* ------------------------------------------------------------------ *
 * 七、静态门禁：不许有第二份算式、第二份 chore
 * ------------------------------------------------------------------ */

describe('静态门禁', () => {
  const SRC = join(process.cwd(), 'src');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const CODE = walk(SRC).filter((f) => f.endsWith('.js'));
  const rel = (f) => relative(SRC, f).replaceAll('\\', '/');
  /** 扫源码里的调用点：命中 0 条一律算门禁失败（"扫描集自证"），否则规则坏掉也能永远绿 */
  const hits = (re) => CODE.flatMap((f) => readFileSync(f, 'utf8')
    .split(/\r?\n/).flatMap((line, i) => (re.test(line) ? [`${rel(f)}:${i + 1}`] : [])));

  it('扫描集覆盖当前源码树（空目录会让下面每一条都假绿）', () => {
    expect(CODE.length, '一个 src 文件都没扫到').toBeGreaterThan(50);
    for (const probe of ['content/gear.js', 'game/PlayerStats.js', 'core/Game.js']) {
      expect(CODE.map(rel), probe).toContain(probe);
    }
  });

  it('装备换算只有 `gearMods` 那一处：定义在 gear.js，调用它的只有 PlayerStats', () => {
    const files = [...new Set(hits(/gearMods\s*\(/).map((h) => h.split(':')[0]))];
    expect(files.sort(), '第二处换算 = 装备点数有两套算法').toEqual(['content/gear.js', 'game/PlayerStats.js']);
    const defs = hits(/^export function gearMods\s*\(/);
    expect(defs.length, `定义必须有且只有一份，实际 ${defs.length} 份`).toBe(1);
    expect(defs[0].split(':')[0]).toBe('content/gear.js');
    // 调用点也要真的存在：只有定义、没人调用，就是"表有了而身上没穿"的另一份假绿
    expect(hits(/gearMods\(this\.gear\[slot\]\)/).length, 'PlayerStats 里没找到那次换算').toBeGreaterThan(0);
  });

  it('装备账只由 PlayerStats 自己写：别处直接改格子就是绕过 `isGearInstance` 那道认件关', () => {
    expect(hits(/stats\.gear\s*\[[^\]]*\]\s*=[^=]/)).toEqual([]);
    expect(hits(/stats\.gear\.\w+\s*=[^=]/)).toEqual([]);
  });

  it('消费者登记只有一处，且在 Game 组装那一步', () => {
    const binds = hits(/\.bindConsumers\s*\(/);
    expect(binds.length, `bindConsumers 的调用点必须只有一个，实际：${binds.join(' / ')}`).toBe(1);
    expect(binds[0].split(':')[0], '登记不在组装那一步，就是"绑了个没人用的口"').toBe('core/Game.js');
  });

  it('推送口只有一个名字：`applyToCombat` 只有推送口与桥接自己在调', () => {
    // 读档那一步从前直接推战斗。要如实记一笔：改前改后的真浏览器读数逐字相同
    // （`SpellSystem.update` 每帧自己 `syncMana`），所以这条收成一处是**工程账**（少一份 chore），
    // 不是修了一条玩家看得见的错 —— 门禁钉的是"没有第二处直接推"，不是"玩家的手感变了"
    const files = [...new Set(hits(/\.applyToCombat\s*\(/).map((h) => h.split(':')[0]))];
    expect(files.sort(), `又有人绕过推送口直接推战斗：${files.join(' / ')}`)
      .toEqual(['combat/CombatController.js', 'game/PlayerStats.js']);
  });

  it('自动通关那两条 cheat 也走同一个口：手抄的 chore 与手抄的事件都是第二份真相', () => {
    const qa = readFileSync(join(SRC, 'ui/QuestAssistant.js'), 'utf8');
    expect(qa).not.toMatch(/applyToCombat\s*\(/);
    expect(qa, "改完属性自己再发一次 stats-changed = 第二份「谁说属性变了」的账").not.toMatch(/'stats-changed'/);
    expect((qa.match(/stats\.pushToConsumers\s*\(/g) ?? []).length, 'level 与 mind 两条各推一次').toBe(2);
  });

  it('升级面板与读档都不再手抄那句 chore', () => {
    const upgrade = readFileSync(join(SRC, 'ui/UpgradePanel.js'), 'utf8');
    expect(upgrade).not.toMatch(/applyToCombat\s*\(/);
    expect(upgrade).not.toMatch(/syncMana\s*\(/);
    const save = readFileSync(join(SRC, 'game/SaveSystem.js'), 'utf8');
    expect(save).toMatch(/stats\.pushToConsumers\s*\(/);
    expect(save, '读档绕过推送口自己拼 = 第二处"谁把读数推下去"的账').not.toMatch(/stats\.applyToCombat\s*\(/);
  });

  it('推送口只有一份实现，调用它的只有读档与 cheat', () => {
    const defs = hits(/^\s{2}pushToConsumers\s*\(/);
    expect(defs.length, `实现必须有且只有一份，实际 ${defs.length} 份`).toBe(1);
    expect(defs[0].split(':')[0]).toBe('game/PlayerStats.js');
    const callers = [...new Set(hits(/\.pushToConsumers\s*\(/)
      .map((h) => h.split(':')[0]).filter((f) => f !== 'game/PlayerStats.js'))];
    expect(callers.sort(), `别处又开始自己拼推送了：${callers.join(' / ')}`)
      .toEqual(['game/SaveSystem.js', 'ui/QuestAssistant.js']);
  });
});
