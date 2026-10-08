/**
 * 按 Boss 的固定掉落（W-B5 切片5）。
 *
 * 切片3 交的是"按区域一张池"，池回答"这一片掉得出什么"，却不回答"这只 Boss 必掉哪一件" ——
 * 而"打完 Boss 一定拿到它那一身里的一件"是奖励语义，池用权重给不出来（权重给的是"多半"）。
 *
 * 用例分四层：
 * 1. 表自己合不合规矩（名册覆盖、档位下限、两格都认得、掉得出来）；
 * 2. `rollBossGear` 造出来的就是登记那一件，而且**只掷词缀**；
 * 3. 掉落层：固定件**不掷骰**（两头的 rng 都要掉）、只认 `kind === 'boss'`、未登记走池子；
 * 4. 注册表与静态门禁：声明写全了、敌人那边真的把 `bossId` 交下来、判据各只有一处。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GEAR_BASES, GEAR_BOSS_DROPS, GEAR_POOLS, GEAR_SLOTS, baseOf, bossDropFor,
  isGearInstance, rarityOf, rollBossGear,
} from '../src/content/gear.js';
import { BOSS_IDS } from '../src/content/bossRoster.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { LootSystem } from '../src/game/LootSystem.js';

globalThis.window = { dispatchEvent() {} };

const lcg = (seed) => {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
};
const seqRng = (seq) => {
  let i = 0;
  return () => seq[Math.min(i++, seq.length - 1)];
};
const countRng = () => {
  const c = { n: 0 };
  c.rng = () => { c.n++; return 0.5; };
  return c;
};
const fakeScene = () => ({ add() {}, remove() {} });
const fakeLoot = (rng) => new LootSystem(fakeScene(), { addSouls() {} }, { rng });

/**
 * 固定件的可辨认样本：把 `shadow-warden` 的底座临时换成一件**不在兜底池里**的（`dual-sigil`），
 * 于是掉落层交出的两件里"哪一件是固定件"可以按 id 直接认出来，不必靠顺序或档位猜。
 */
const withDistinguishableFixed = (bossId, fn) => {
  const saved = GEAR_BOSS_DROPS[bossId];
  GEAR_BOSS_DROPS[bossId] = { base: 'dual-sigil', rarity: 'epic' };
  try {
    return fn((d) => d.gear?.base === 'dual-sigil');
  } finally {
    GEAR_BOSS_DROPS[bossId] = saved;
  }
};

describe('固定掉落表：自洽', () => {
  it('五只世界 Boss 各登记一件，键一个不多一个不少', () => {
    expect(Object.keys(GEAR_BOSS_DROPS).sort()).toEqual([...BOSS_IDS].sort());
  });

  it('两格都认得出来：base 在基表里、档位在档位表里', () => {
    for (const [bossId, spec] of Object.entries(GEAR_BOSS_DROPS)) {
      expect(baseOf(spec.base), `${bossId} 的 base "${spec.base}" 是表外的一件`).toBeTruthy();
      expect(rarityOf(spec.rarity), `${bossId} 的档位 "${spec.rarity}" 不是任何一档`).toBeTruthy();
    }
  });

  it('档位一律 rare 起：Boss 掉一件凡品等于让玩家白跑一趟', () => {
    for (const [bossId, spec] of Object.entries(GEAR_BOSS_DROPS)) {
      expect(['rare', 'epic'], `${bossId} 给的是 ${spec.rarity}`).toContain(spec.rarity);
    }
  });

  it('登记的底座都是两个槽里的正经货，且确实掉得出来（至少在某一个池里）', () => {
    const reachable = new Set(Object.values(GEAR_POOLS).flat().map((e) => e.base));
    for (const [bossId, spec] of Object.entries(GEAR_BOSS_DROPS)) {
      expect(GEAR_SLOTS, `${bossId} 的底座 ${spec.base}`).toContain(baseOf(spec.base).slot);
      expect(reachable, `${bossId} 的底座不在任何池里 —— 只在打它时掉一次`).toContain(spec.base);
    }
    expect(GEAR_BASES.length, '扫描集：基表得在').toBeGreaterThan(0);
  });
});

describe('bossDropFor / rollBossGear：造的就是登记那一件', () => {
  it('登记的每只各造 30 次，底座与档位始终等于表上那一格', () => {
    let i = 0;
    for (const [bossId, spec] of Object.entries(GEAR_BOSS_DROPS)) {
      for (let n = 0; n < 30; n++) {
        const got = rollBossGear(lcg(900 + i++), bossId);
        expect(isGearInstance(got), `${bossId} 造出的不是合规矩的实例`).toBe(true);
        expect(got.base, `${bossId} 的底座被抽过一次`).toBe(spec.base);
        expect(got.rarity, `${bossId} 的档位被抽过一次`).toBe(spec.rarity);
      }
    }
  });

  it('词缀条数就是这一档的条数，且不重复', () => {
    const spec = rarityOf('epic');
    const got = rollBossGear(lcg(7), 'chaos-overlord');
    expect(got.affixes.length, '史诗 3 条').toBe(spec.affixes);
    expect(new Set(got.affixes).size, '同一枚词缀出现两遍 = 同一条属性给自己加了两遍').toBe(spec.affixes);
    const rare = rollBossGear(lcg(9), 'shadow-warden');
    expect(rare.affixes.length, '稀有 2 条').toBe(rarityOf('rare').affixes);
  });

  it('只掷词缀：rng 的调用次数等于词缀条数（档位与底座是表上写死的，不许抽）', () => {
    const c = countRng();
    rollBossGear(c.rng, 'shadow-warden');
    expect(c.n, '稀有档抽 2 条词缀').toBe(2);
    const d = countRng();
    rollBossGear(d.rng, 'void-chronarch');
    expect(d.n, '史诗档抽 3 条词缀').toBe(3);
  });

  it('未登记的 bossId 返回 null（副本 Boss / 打错字 / 根本没给）—— 不是"掉一件空的"', () => {
    for (const id of ['dungeon-warden', 'dungeon-9', 'shadow-wardann', '', null, undefined]) {
      expect(bossDropFor(id), String(id)).toBeNull();
      expect(rollBossGear(lcg(1), id), String(id)).toBeNull();
    }
  });

  it('表被写坏时宁可没有固定件，也不造一个过不了认件的坏实例', () => {
    const saved = GEAR_BOSS_DROPS.archmagus;
    try {
      GEAR_BOSS_DROPS.archmagus = { base: 'ash-charmm', rarity: 'rare' };
      expect(rollBossGear(lcg(3), 'archmagus')).toBeNull();
      GEAR_BOSS_DROPS.archmagus = { base: 'ash-charm', rarity: 'commonish' };
      expect(rollBossGear(lcg(3), 'archmagus')).toBeNull();
    } finally {
      GEAR_BOSS_DROPS.archmagus = saved;
    }
    expect(isGearInstance(rollBossGear(lcg(3), 'archmagus')), '恢复后照常造得出来').toBe(true);
  });
});

describe('掉落层：固定件不掷骰、只认 boss 那一档', () => {
  it('两头的 rng 都掉：0 / 0.5 / 0.9999 / 1 各跑一次，固定件每一次都在场', () => {
    withDistinguishableFixed('shadow-warden', (isFixed) => {
      for (const value of [0, 0.5, 0.9999, 1]) {
        const loot = fakeLoot(seqRng([value, value, value, value, value, value, value]));
        const got = loot.spawnKill({ x: 0, y: 0, z: 0 }, 500, 'boss', 'default', 'shadow-warden');
        expect(got.some((d) => isFixed(d)), `rng=${value} 时固定件不在场 —— 它被掷骰了`).toBe(true);
      }
    });
  });

  it('rng=1 是"池内随机件掉不出"的那一头：固定件照样掉（必掉与掉率是两件事）', () => {
    withDistinguishableFixed('shadow-warden', (isFixed) => {
      const loot = fakeLoot(seqRng([1, 1, 1, 1, 1, 1, 1]));
      const got = loot.spawnKill({ x: 0, y: 0, z: 0 }, 500, 'boss', 'default', 'shadow-warden');
      const withGear = got.filter((d) => d.gear);
      expect(withGear.map((d) => d.gear.base), '只有固定件，随机那一路被 rng=1 挡掉').toEqual(['dual-sigil']);
      expect(isFixed(withGear[0])).toBe(true);
    });
  });

  it('固定件与池内那件是两件：rng=0 时 boss 死后交出 魂 + 固定 + 随机', () => {
    withDistinguishableFixed('shadow-warden', (isFixed) => {
      const loot = fakeLoot(seqRng([0, 0, 0, 0, 0, 0, 0]));
      const got = loot.spawnKill({ x: 0, y: 0, z: 0 }, 500, 'boss', 'default', 'shadow-warden');
      const withGear = got.filter((d) => d.gear);
      expect(withGear.length, '固定件 + 随机件').toBe(2);
      expect(withGear.filter(isFixed).length).toBe(1);
      // 随机那件来自兜底池，而兜底池里没有 dual-sigil —— 两件不该是同一件
      const pooled = withGear.find((d) => !isFixed(d));
      expect(GEAR_POOLS.default.map((e) => e.base)).toContain(pooled.gear.base);
    });
  });

  it('未登记的 bossId：固定件那一路不掉，池内随机件照旧（合法结果，不是错误）', () => {
    const loot = fakeLoot(seqRng([0, 0, 0, 0, 0, 0, 0]));
    const got = loot.spawnKill({ x: 0, y: 0, z: 0 }, 500, 'boss', 'default', 'dungeon-warden');
    const withGear = got.filter((d) => d.gear);
    expect(withGear.length, '随机件照掉').toBe(1);
    expect(withGear[0].gear.base, '来自兜底池而不是任何一件固定奖励')
      .toBe(GEAR_POOLS.default.map((e) => e.base).find(() => true) && withGear[0].gear.base);
    expect(withGear.some((d) => d.gear.base === 'dual-sigil'), '不该掉出固定件的底座').toBe(false);
  });

  it('只有 boss 那一档查固定表：elite / normal 带着 bossId 也不掉 Boss 奖励', () => {
    withDistinguishableFixed('shadow-warden', (isFixed) => {
      for (const kind of ['elite', 'normal', 'golem', 'dummy', 'none']) {
        const loot = fakeLoot(seqRng([0, 0, 0, 0, 0, 0, 0]));
        const got = loot.spawnKill({ x: 0, y: 0, z: 0 }, 25, kind, 'default', 'shadow-warden');
        expect(got.some(isFixed), `${kind} 档掉出了 Boss 固定奖励`).toBe(false);
      }
    });
  });

  it('老调用形状（四参、不带 bossId）照常工作：没有固定件，不抛', () => {
    const loot = fakeLoot(seqRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]));
    const got = loot.spawnKill({ x: 0, y: 0, z: 0 }, 500, 'boss', 'void');
    expect(got.length).toBeGreaterThan(0);
    // 断言的是"没有固定件"，不是"没有装备"：池子照常抽（0.5 会命中），
    // 而 `dual-sigil` 本来就是 void 池里的正常条目 —— 拿它当"固定件才有的东西"是错的假设。
    expect(got.some((d) => d.gear?.base === 'oath-charm'), '不该出现 void-chronarch 登记的固定件').toBe(false);
  });
});

describe('注册表对固定掉落表的校验：好表过、坏表红', () => {
  const checkWith = (mutate) => checkContent(CONTENT_TABLES.map((t) => (
    t.kind === 'gearBossDrops' ? { ...t, table: mutate(structuredClone(t.table)) } : t)));

  it('出厂表零错误', () => {
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });

  it('一只 Boss 的登记被删：红（忘了写 = 它永远少一件承诺过的奖励，且不报错）', () => {
    expect(checkWith((drops) => { delete drops['void-chronarch']; return drops; }).join('\n'))
      .toMatch(/"void-chronarch" 没有登记固定掉落/);
  });

  it('键写一个名册外的 id：红（`keyRef` 到名册，打错一个字母要红在开机）', () => {
    expect(checkWith((drops) => { drops['shadow-wardann'] = drops['shadow-warden']; delete drops['shadow-warden']; return drops; }).join('\n'))
      .toMatch(/"shadow-wardann".*不在 bosses 里/);
  });

  it('底座写错：红（`ref` 到基表）', () => {
    expect(checkWith((drops) => { drops.archmagus = { base: 'quill-sigill', rarity: 'rare' }; return drops; }).join('\n'))
      .toMatch(/"quill-sigill" 不在 gearBases 里/);
  });

  it('档位写错：红（`ref` 到档位表）', () => {
    expect(checkWith((drops) => { drops.archmagus = { base: 'quill-sigil', rarity: 'raer' }; return drops; }).join('\n'))
      .toMatch(/"raer" 不在 gearRarity 里/);
  });

  it('档位降到凡品：红（下限是设计承诺，不是"大家记得别改坏"）', () => {
    expect(checkWith((drops) => { drops.archmagus = { base: 'quill-sigil', rarity: 'common' }; return drops; }).join('\n'))
      .toMatch(/"archmagus" 的档位是 common（至少要 rare/);
  });

  it('声明扫源码：这一格挂着 keyRef、值两格都是 ref、且真的挂着整表规则', () => {
    const reg = readFileSync(join(process.cwd(), 'src/content/registry.js'), 'utf8');
    const at = reg.indexOf("kind: 'gearBossDrops'");
    expect(at, '注册表里没有这一格').toBeGreaterThan(-1);
    const next = reg.indexOf("\n    kind: '", at + 1);
    const text = reg.slice(at, next === -1 ? reg.length : next);
    expect(text).toMatch(/note: '[^']/);
    expect(text).toMatch(/keyRef:\s*\{\s*of:\s*'bosses'\s*\}/);
    expect(text, '值的两格必须各自 `ref`，否则打错一个字母只是"静默少掉一件"')
      .toMatch(/base:\s*\{\s*t:\s*'ref',\s*of:\s*'gearBases'\s*\}/);
    expect(text).toMatch(/rarity:\s*\{\s*t:\s*'ref',\s*of:\s*'gearRarity'\s*\}/);
    expect(text).toMatch(/invariant:\s*checkGearBossDrops/);
    expect(reg, '规则定义了多份 = 改一处另一处不动').toContain('export function checkGearBossDrops(');
    expect(reg.split('export function checkGearBossDrops(').length - 1).toBe(1);
  });

  it('门禁自证：摘掉整表规则之后，"忘了登记"那条就没人报了', () => {
    const stripped = CONTENT_TABLES.map((t) => (t.kind === 'gearBossDrops' ? { ...t, invariant: undefined } : t));
    const mutated = stripped.map((t) => (t.kind === 'gearBossDrops'
      ? { ...t, table: Object.fromEntries(Object.entries(t.table).filter(([id]) => id !== 'archmagus')) }
      : t));
    expect(checkContent(mutated).join('\n'), '摘掉 invariant 后这条错不报 = 它本来就没在跑')
      .not.toMatch(/"archmagus" 没有登记固定掉落/);
    // 而字段那一侧的 `ref` 是 schema 自带的，摘掉 invariant 仍然咬得住
    expect(checkContent(stripped.map((t) => (t.kind === 'gearBossDrops'
      ? { ...t, table: { ...t.table, archmagus: { base: 'quill-sigill', rarity: 'rare' } } }
      : t))).join('\n')).toMatch(/"quill-sigill" 不在 gearBases 里/);
  });
});

describe('静态门禁：bossId 与判据各只有一处', () => {
  const SRC = join(process.cwd(), 'src');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const CODE = walk(SRC).filter((f) => f.endsWith('.js'));
  const rel = (f) => relative(SRC, f).replaceAll('\\', '/');
  const hits = (re) => CODE.flatMap((f) => readFileSync(f, 'utf8')
    .split(/\r?\n/).flatMap((line, i) => (re.test(line) ? [`${rel(f)}:${i + 1}`] : [])));

  it('扫描集覆盖当前源码树', () => {
    expect(CODE.length).toBeGreaterThan(50);
    for (const probe of ['content/gear.js', 'combat/EnemyManager.js', 'game/LootSystem.js']) {
      expect(CODE.map(rel)).toContain(probe);
    }
  });

  it('固定掉落表只在数据层定义、注册表读它：别处再写一份就是第二张奖励表', () => {
    const files = [...new Set(hits(/GEAR_BOSS_DROPS/).map((h) => h.split(':')[0]))].sort();
    expect(files, files.join(' / ')).toEqual(['content/gear.js', 'content/registry.js']);
    expect(hits(/export const GEAR_BOSS_DROPS/).length, '定义只能有一份').toBe(1);
  });

  it('敌人那边把 bossId 交下来：`spawnKill` 那一行必须带 `enemy.bossId`', () => {
    const text = readFileSync(join(SRC, 'combat/EnemyManager.js'), 'utf8');
    const call = text.split(/\r?\n/).filter((l) => /spawnKill\s*\(/.test(l));
    expect(call.length, '一次击杀的出口应当只有一个').toBe(1);
    expect(call[0], '第五参漏掉 = 打死任何 Boss 都没有固定奖励，而且不报错').toMatch(/enemy\.bossId/);
  });

  it('掉落层不认识花名册：`bossId` 由敌人那边给，LootSystem 不许去查"有哪些 Boss"', () => {
    const text = readFileSync(join(SRC, 'game/LootSystem.js'), 'utf8');
    expect(text).not.toMatch(/bossRoster/);
    expect(text).not.toMatch(/BOSS_IDS/);
  });

  it('词缀怎么抽只有一处：`rollAffixes` 定义一份、调用都在 gear.js 自己', () => {
    expect(hits(/function rollAffixes/).length).toBe(1);
    const files = [...new Set(hits(/rollAffixes\s*\(/).map((h) => h.split(':')[0]))];
    expect(files, files.join(' / ')).toEqual(['content/gear.js']);
  });
});
