/**
 * 什么地方掉什么东西（W-B5 切片3）。
 *
 * 这一片把掉落从"全局一张池"改成"按区域一张池"，所以用例分成三层：
 * 1. 池表自己合不合规矩（兜底在不在、有没有永远掉不出的孤儿装备）；
 * 2. `rollGear(rng, zoneId)` 抽出来的是不是**那一片**的东西，而且不同区域真的给出不同集合；
 * 3. 掉落层与敌人那边：`spawnKill` 把区域 id 一路带到抽样，中间没人自己抄一份几何判断。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GEAR_BASES, GEAR_POOLS, GEAR_POOL_DEFAULT, poolForZone, rollGear, baseOf,
} from '../src/content/gear.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { ZONE_IDS } from '../src/content/ZoneIdentity.js';
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
const fakeScene = () => {
  const scene = { add() {}, remove() {} };
  return scene;
};
const poolIds = (zoneId) => poolForZone(zoneId).map((e) => e.base);

describe('掉落池表：自洽', () => {
  it('每一池都非空、权重都是正整数、里面的 base 都认得出来', () => {
    for (const [zone, rows] of Object.entries(GEAR_POOLS)) {
      expect(rows.length, `${zone} 是空池`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(Number.isInteger(row.weight) && row.weight >= 1, `${zone}/${row.base}`).toBe(true);
        expect(baseOf(row.base), `${zone} 里写着 "${row.base}"：表外的一件装备`).toBeTruthy();
      }
    }
  });

  it('兜底那一格在，而且它是显式的一格而不是"随便挑一个区域"', () => {
    expect(GEAR_POOL_DEFAULT, '兜底档名要能被门禁引用，不该是散在各处的字符串').toBe('default');
    expect(GEAR_POOLS[GEAR_POOL_DEFAULT], '少了兜底池 = 走廊里的怪什么都不掉，且不报错').toBeTruthy();
  });

  it('每一件基表都掉得出：出现在至少一个池里（否则表里留着名字而玩家永远见不到）', () => {
    const reachable = new Set(Object.values(GEAR_POOLS).flat().map((e) => e.base));
    for (const base of GEAR_BASES) {
      expect(reachable, `${base.id} 不在任何一个池里 —— 永远掉不出`).toContain(base.id);
    }
  });

  it('两个槽在每一个池里都有代表：不然"另一槽永远空着"而面板上看不出来', () => {
    for (const [zone, rows] of Object.entries(GEAR_POOLS)) {
      const slots = new Set(rows.map((r) => baseOf(r.base).slot));
      expect([...slots].sort(), `${zone} 的池只覆盖了 ${[...slots].join('/')}`).toEqual(['charm', 'sigil']);
    }
  });

  it('池表的键都是认得出的区域（`corridor` / `unknown` 刻意不列 —— 它们走兜底）', () => {
    const zoneIds = new Set(Object.values(ZONE_IDS));
    for (const zone of Object.keys(GEAR_POOLS)) {
      if (zone === GEAR_POOL_DEFAULT) continue;
      expect(zoneIds, `"${zone}" 不是任何一个区域 id`).toContain(zone);
    }
    expect(Object.keys(GEAR_POOLS), '走廊与未知区不该各列一格（它们落兜底）')
      .not.toContain(ZONE_IDS.CORRIDOR);
  });

  it('void 与 abyss 的首件各不相同（切片6：Boss 掉落池权重拉开，避免两地首件同款）', () => {
    const voidFirst = GEAR_POOLS.void[0].base;
    const abyssFirst = GEAR_POOLS.abyss[0].base;
    expect(voidFirst, 'void 首件应为誓约护符').toBe('oath-charm');
    expect(abyssFirst, 'abyss 首件应为战纹印记').toBe('war-sigil');
    expect(voidFirst).not.toBe(abyssFirst);
  });

  it('void 与 abyss 的首件权重严格大于次席，且符合设计值（切片6：Boss 掉落池权重拉开，避免权重并列导致"首件"不稳定）', () => {
    expect(GEAR_POOLS.void[0]).toEqual({ base: 'oath-charm', weight: 5 });
    expect(GEAR_POOLS.void[1]).toEqual({ base: 'dual-sigil', weight: 3 });
    expect(GEAR_POOLS.void[0].weight).toBeGreaterThanOrEqual(5);
    expect(GEAR_POOLS.abyss[0]).toEqual({ base: 'war-sigil', weight: 4 });
    expect(GEAR_POOLS.abyss[1]).toEqual({ base: 'oath-charm', weight: 2 });
    expect(GEAR_POOLS.abyss[0].weight).toBeGreaterThanOrEqual(4);
  });
});

describe('poolForZone：只有一处兜底', () => {
  it('名单内的区域拿到自己的池，名单外的落 default', () => {
    expect(poolForZone('hub')).toBe(GEAR_POOLS.hub);
    for (const outside of [ZONE_IDS.CORRIDOR, ZONE_IDS.UNKNOWN, 'nonsense', undefined, null]) {
      expect(poolForZone(outside), `${String(outside)} 该落兜底`).toBe(GEAR_POOLS[GEAR_POOL_DEFAULT]);
    }
  });

  it('不同区域给的是不同的集合（"区域之间没差别"就是这条要拦的）', () => {
    expect(poolIds('fantasy')).not.toEqual(poolIds('magic'));
    expect(poolIds('hub')).not.toEqual(poolIds('abyss'));
    // 而 hub 与兜底也不该互相顶替：枢纽是玩家第一小时待得最久的地方
    expect(poolIds('hub')).not.toEqual(poolIds(GEAR_POOL_DEFAULT));
  });
});

describe('rollGear(rng, zoneId)：抽出来的是那一片的东西', () => {
  it('每个区域各抽 200 次，掉出的 base 始终在自己池里', () => {
    for (const zone of Object.keys(GEAR_POOLS)) {
      const allowed = new Set(poolIds(zone));
      const rng = lcg(1000 + zone.length * 7);
      for (let i = 0; i < 200; i++) {
        const got = rollGear(rng, zone);
        expect(allowed, `${zone} 抽出了 ${got.base}`).toContain(got.base);
      }
    }
  });

  it('同一份 rng 换个区域就换一件：区域这一参数真的进了抽样，不是装饰', () => {
    const a = rollGear(seqRng([0.5, 0.5, 0.5, 0.5]), 'magic');
    const b = rollGear(seqRng([0.5, 0.5, 0.5, 0.5]), 'fantasy');
    expect(a.base).not.toBe(b.base);
    expect(poolIds('magic')).toContain(a.base);
    expect(poolIds('fantasy')).toContain(b.base);
  });

  it('没给区域（老那一路的调用形状）落兜底池，而不是抛或给个空 base', () => {
    const got = rollGear(seqRng([0.1, 0.1, 0.1, 0.1]));
    expect(poolIds(GEAR_POOL_DEFAULT)).toContain(got.base);
  });

  it('一个池里只留一件时，base 就被钉死（说明区域这一路真的在过滤，不是加权而已）', () => {
    const saved = GEAR_POOLS.hub;
    try {
      GEAR_POOLS.hub = [{ base: 'ring-sigil', weight: 5 }];
      const rng = lcg(4242);
      for (let i = 0; i < 30; i++) expect(rollGear(rng, 'hub').base).toBe('ring-sigil');
    } finally {
      GEAR_POOLS.hub = saved;
    }
  });
});

describe('掉落层与敌人层：区域 id 一路带到抽样', () => {
  it('`spawnKill` 交出的装备属于死亡位置所在区域的池', () => {
    const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: seqRng([0.99, 0.4, 0.6, 0.2]) });
    const created = loot.spawnKill({ x: 0, y: 0, z: 0 }, 25, 'boss', 'void');
    const gear = created.find((d) => d.gear);
    expect(gear, 'boss 那一档必掉').toBeTruthy();
    expect(poolIds('void')).toContain(gear.gear.base);
  });

  it('没给区域 id 时（老调用形状）走兜底池，不抛', () => {
    const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: seqRng([0.99, 0.2, 0.3, 0.3]) });
    const gear = loot.spawnKill({ x: 0, y: 0, z: 0 }, 25, 'boss').find((d) => d.gear);
    expect(poolIds(GEAR_POOL_DEFAULT)).toContain(gear.gear.base);
  });
});

describe('注册表对池表的校验：好池过、坏池红', () => {
  const checkWith = (mutate) => checkContent(CONTENT_TABLES.map((t) => (
    t.kind === 'gearPools' ? { ...t, table: mutate(structuredClone(t.table)) } : t)));

  it('出厂池表零错误', () => {
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });

  it('一件装备从所有池里被抹掉：红（表里留着名字而玩家永远见不到）', () => {
    expect(checkWith((pools) => {
      for (const rows of Object.values(pools)) {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].base === 'dual-sigil') rows.splice(i, 1);
      }
      return pools;
    }).join('\n')).toMatch(/dual-sigil.*不在任何一个池里.*永远掉不出/);
  });

  it('兜底那一格被删：红', () => {
    expect(checkWith((pools) => { delete pools.default; return pools; }).join('\n'))
      .toMatch(/缺兜底那一格 "default"/);
  });

  it('池里写一个表外的 base：红（`ref` 查得到，打错一个字母要红在开机）', () => {
    const errors = checkWith((pools) => { pools.hub[0] = { base: 'ash-charmm', weight: 9 }; return pools; }).join('\n');
    expect(errors).toMatch(/"ash-charmm" 不在 gearBases 里/);
  });

  it('池是空的：红（`minLength` 那一档，而不是运行时 `weightedPick` 拿到 undefined）', () => {
    expect(checkWith((pools) => { pools.abyss = []; return pools; }).join('\n'))
      .toMatch(/abyss.*至少要 1 条/);
  });

  it('写一个不存在的区域 id：红（`keyRef` 到区域表，`default` 是显式豁免）', () => {
    expect(checkWith((pools) => { pools.forrest = pools.hub; return pools; }).join('\n'))
      .toMatch(/"forrest".*不在 zones 里/);
  });

  it('门禁自证：池表确实挂着整表规则，删掉它那条"孤儿装备"就没人报了', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'gearPools');
    expect(entry.invariant).toBeTypeOf('function');
    // 声明本身也是判据：`default` 走的是显式豁免，而区域 id 走 `keyRef` —— 把豁免摘了，
    // 加载期的 `assertContent()` 会当场抛（那是机制性红，不是断言证据），所以这里断言声明
    expect(entry.keyRef, '池表的键不再引用区域表 = 打错一个区域名没人管').toEqual({ of: 'zones' });
    expect(entry.keyAllow, '`default` 不再被显式豁免 = 出厂表自己就过不了校验')
      .toContain(GEAR_POOL_DEFAULT);
    const stripped = CONTENT_TABLES.map((t) => (t.kind === 'gearPools' ? { ...t, invariant: undefined } : t));
    const mutated = stripped.map((t) => (t.kind === 'gearPools'
      ? { ...t, table: Object.fromEntries(Object.entries(t.table).map(([z, rows]) => [z, rows.filter((r) => r.base !== 'dual-sigil')])) }
      : t));
    expect(checkContent(mutated).join('\n'), '摘掉 invariant 之后这条错就不报了 = 它本来就没在跑')
      .not.toMatch(/永远掉不出/);
  });
});

describe('静态门禁：判据与查表各只有一处', () => {
  const SRC = join(process.cwd(), 'src');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const CODE = walk(SRC).filter((f) => f.endsWith('.js'));
  const rel = (f) => relative(SRC, f).replaceAll('\\', '/');
  const hits = (re) => CODE.flatMap((f) => readFileSync(f, 'utf8')
    .split(/\r?\n/).flatMap((line, i) => (re.test(line) ? [`${rel(f)}:${i + 1}`] : [])));

  it('扫描集覆盖当前源码树', () => {
    expect(CODE.length).toBeGreaterThan(50);
    for (const probe of ['content/gear.js', 'combat/EnemyManager.js', 'world/WorldManager.js']) {
      expect(CODE.map(rel)).toContain(probe);
    }
  });

  it('池表只有掉落层在读：别处再查一次就是第二份"什么地方掉什么"', () => {
    const files = [...new Set(hits(/GEAR_POOLS/).map((h) => h.split(':')[0]))].sort();
    expect(files, files.join(' / ')).toEqual(['content/gear.js', 'content/registry.js']);
  });

  it('按位置反推区域仍然只有一条判据：`zoneIdAt` 的定义在 ZoneIdentity，调用方只有世界与敌人两处', () => {
    const defs = hits(/^export function zoneIdAt/);
    expect(defs.length, '定义必须只有一份').toBe(1);
    const callers = [...new Set(hits(/[^a-zA-Z]zoneIdAt\s*\(/).map((h) => h.split(':')[0]))].sort();
    expect(callers, `有人在别处再抄一份几何判断：${callers.join(' / ')}`)
      .toEqual(['combat/EnemyManager.js', 'content/ZoneIdentity.js', 'world/WorldManager.js']);
  });

  it('`poolForZone` 的调用点只有掉落函数自己：别人不许绕过兜底直接索引表', () => {
    const files = [...new Set(hits(/poolForZone\s*\(/).map((h) => h.split(':')[0]))];
    expect(files, files.join(' / ')).toEqual(['content/gear.js']);
  });

  it('敌人那边把区域一路带到抽样：`spawnKill` 那一行必须自己反推区域，而不是漏掉第四参', () => {
    const text = readFileSync(join(SRC, 'combat/EnemyManager.js'), 'utf8');
    const call = text.split(/\r?\n/).filter((l) => /spawnKill\s*\(/.test(l));
    expect(call.length, '一次击杀的出口应当只有一个').toBe(1);
    expect(call[0], '第四参漏掉 = 所有区域都掉同一张默认池').toMatch(/zoneIdAt\s*\(/);
    expect(call[0]).toMatch(/,\s*kind\s*,/);   // 档位与区域都从同一个位置算，不各抄一遍
  });
});
