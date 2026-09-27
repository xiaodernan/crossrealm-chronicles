/**
 * 装备掉在地上、捡起来穿上（W-B5 切片2）。
 *
 * 这一片第一次让装备**碰到玩家**，所以用例分三层：
 * 1. 数据层新增的两件事（显示名单、掉率与折魂）自不自洽，注册表拦不拦得住写错；
 * 2. `pickupChoice` 那条分岔：严格更好才换，不换的那件当场折成灵魂（不是凭空消失）；
 * 3. `LootSystem` 的拾取那一路：注入的 rng 让"该不该掉、掉哪一档"可复现，捡起那一帧
 *    装备走 `onGear` 而不是走灵魂账。
 *
 * "换上之后玩家看到什么"由两半担保：判据与字样在 `gear-model` / 这里各测一次，
 * 而**把它们接到屏幕上**那一段在 `Game.pickUpGear` 里，由静态门禁点名 + 真浏览器读数验收
 * （假 Game 实例里自己重写一遍那段拼装，测的就不是生产代码了）。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GEAR_BASES, GEAR_AFFIXES, GEAR_DROP, GEAR_NAMES, GEAR_RARITY, GEAR_RARITY_DISPLAY,
  gearMods, gearScore, gearLabel, dropChance, soulValue, pickupChoice,
} from '../src/content/gear.js';
import { CONTENT_TABLES, checkContent } from '../src/content/registry.js';
import { LootSystem } from '../src/game/LootSystem.js';

globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const seqRng = (seq) => {
  let i = 0;
  return () => seq[Math.min(i++, seq.length - 1)];
};
const charm = (base, rarity, affixes = []) => ({ base, rarity, affixes });

/* ------------------------------------------------------------------ *
 * 一、显示与掉率两张新表
 * ------------------------------------------------------------------ */

describe('显示名单与掉率表：双向覆盖', () => {
  it('每一个稀有度都有字样、颜色、折魂价', () => {
    for (const rarity of GEAR_RARITY) {
      const d = GEAR_RARITY_DISPLAY[rarity.id];
      expect(d, `${rarity.id} 没有显示档（地上的光会是 undefined 的颜色）`).toBeTruthy();
      expect(d.label, rarity.id).not.toBe('');
      expect(Number.isInteger(d.tint) && d.tint >= 0 && d.tint <= 0xffffff, `${rarity.id}.tint`).toBe(true);
      expect(soulValue(rarity.id), `${rarity.id} 折成 0 魂 = 白捡`).toBeGreaterThan(0);
    }
  });

  it('中文名单与两张 id 表互相覆盖：少一格提示里就是 slug，多一格那条名字永远不出现', () => {
    const ids = [...GEAR_BASES, ...GEAR_AFFIXES].map((r) => r.id);
    for (const id of ids) expect(GEAR_NAMES[id], `缺 "${id}" 的中文名`).toBeTruthy();
    for (const id of Object.keys(GEAR_NAMES)) {
      expect(ids, `"${id}" 不是任何一件装备或词缀`).toContain(id);
    }
  });

  it('掉率在 0~1，且兜底与"什么都不掉"都是显式一格', () => {
    for (const [kind, p] of Object.entries(GEAR_DROP.byKind)) {
      expect(p >= 0 && p <= 1, `${kind} = ${p}`).toBe(true);
    }
    expect(dropChance('boss'), 'Boss 那一档必须写死必掉，而不靠一次运气').toBe(1);
    expect(dropChance('dummy'), '训练木人显式不掉').toBe(0);
    expect(dropChance('nobody-knows-this'), '名单外的新敌人该走显式兜底').toBe(GEAR_DROP.byKind.none);
  });

  it('四张新表都进了注册表（打错一个稀有度 id 要红在开机，而不是"那一档折成 0 魂"）', () => {
    const kinds = CONTENT_TABLES.map((t) => t.kind);
    for (const k of ['gearDropChance', 'gearSoulValue', 'gearRarityDisplay', 'gearNames']) {
      expect(kinds, `${k} 没登记`).toContain(k);
    }
    expect(checkContent(CONTENT_TABLES)).toEqual([]);
  });

  it('拒绝侧：名单少一格、稀有度 id 打错、掉率写 1.5 —— 都要红', () => {
    const mutate = (kind, fn) => checkContent(CONTENT_TABLES.map((t) => (
      t.kind === kind ? { ...t, table: fn(structuredClone(t.table)) } : t)));
    expect(mutate('gearNames', (t) => { delete t['ash-charm']; return t; }).join('\n'))
      .toMatch(/gearNames: 缺 "ash-charm"/);
    expect(mutate('gearNames', (t) => { t['ghost-blade'] = '幽灵刃'; return t; }).join('\n'))
      .toMatch(/gearNames: "ghost-blade" 不是任何一件装备或词缀/);
    expect(mutate('gearSoulValue', (t) => { t.rae = 90; return t; }).join('\n'))
      .toMatch(/rae.*不在 gearRarity 里/);
    expect(mutate('gearDropChance', (t) => { t.boss = 1.5; return t; }).join('\n'))
      .toMatch(/gearDropChance\["boss"\]: 不大于 1/);
    expect(mutate('gearRarityDisplay', (t) => { delete t.epic.tint; return t; }).join('\n'))
      .toMatch(/gearRarityDisplay\["epic"\]\.tint: 缺少必填字段/);
  });
});

/* ------------------------------------------------------------------ *
 * 二、判据：什么叫"更好"
 * ------------------------------------------------------------------ */

describe('gearScore：一件装备"多重"只有一条算式', () => {
  it('就是 `gearMods` 那些点数的和（没有第二份权重）', () => {
    const piece = charm('oath-charm', 'rare', ['ember-edge', 'arcane-lens']);
    const mods = gearMods(piece);
    expect(gearScore(piece)).toBe(Object.values(mods).reduce((s, n) => s + n, 0));
    expect(gearScore(piece)).toBe(4);                     // 基表 2 + 两条词缀各 1
  });

  it('表外的一件算 0，而不是抛（存档里坏的那件本来就该进不了账）', () => {
    expect(gearScore(charm('ghost-blade', 'epic'))).toBe(0);
    expect(gearScore(null)).toBe(0);
  });

  it('点数是加起来的，不是数条目的：一条给 2 点的词缀要算 2', () => {
    // 全 1 的配方量不出这条 —— "数条目"与"数点数"在每条都只给 1 点时逐字同形（变异探针 M3 就这么绿过去的）
    const piece = charm('ash-charm', 'epic', ['archmagistone']);      // 基表 1 + 大贤者石 arcane 2 + mind 1
    expect(gearMods(piece)).toEqual({ vigor: 1, arcane: 2, mind: 1 });
    expect(gearScore(piece), '数条目的话这里是 2').toBe(4);
  });

  it('词缀越多越重：同一件基表，档位高就是点数多', () => {
    const plain = gearScore(charm('ember-charm', 'common'));
    const dressed = gearScore(charm('ember-charm', 'epic', ['twin-fang', 'bulwark-oath', 'arcane-lens']));
    expect(dressed).toBeGreaterThan(plain);
  });
});

describe('pickupChoice：严格更好才换上，其余当场折成魂', () => {
  const empty = { charm: null, sigil: null };

  it('空槽：直接穿上，不折任何东西', () => {
    const got = pickupChoice(empty, charm('ash-charm', 'common'));
    expect(got).toMatchObject({ action: 'equip', slot: 'charm', replaced: null, souls: 0 });
  });

  it('槽里已经有一件更轻的：换上，旧的按它自己的档位折魂', () => {
    const worn = charm('ash-charm', 'common');                     // 1 点，凡品 20 魂
    const got = pickupChoice({ ...empty, charm: worn }, charm('dual-sigil', 'rare', ['twin-fang']));
    expect(got.action).toBe('equip');
    expect(got.slot, '换的是这件自己声明的那个槽，不是身上那件的槽').toBe('sigil');
  });

  it('同槽更重的一件才挤掉：更轻的与一样的都留身上，捡到的折魂', () => {
    const wornHeavy = charm('oath-charm', 'epic', ['twin-fang', 'bulwark-oath', 'arcane-lens']);
    const stats = { charm: wornHeavy, sigil: null };
    const worse = pickupChoice(stats, charm('ash-charm', 'common'));
    expect(worse).toEqual({ action: 'dust', slot: 'charm', souls: GEAR_DROP.soulValue.common });
    // 一模一样重：不换。换一趟只多一条提示，玩家没得到任何东西
    const equal = pickupChoice(stats, { ...wornHeavy, affixes: [...wornHeavy.affixes] });
    expect(equal.action).toBe('dust');
    expect(equal.souls, '折的是**捡到的那一件**的档位价').toBe(soulValue(wornHeavy.rarity));
  });

  it('另一槽的轻装备不许挤掉重的那件：槽是各算各的', () => {
    const got = pickupChoice({ charm: charm('dual-sigil', 'epic', ['twin-fang', 'bulwark-oath', 'arcane-lens']), sigil: null },
      charm('ember-charm', 'common'));
    expect(got.action, 'ember-charm 落在 charm 槽，而那一格现在更重').toBe('dust');
  });

  it('坏的一件什么都不做（不折魂、不穿上一个不存在的 base）', () => {
    expect(pickupChoice(empty, charm('ghost-blade', 'common'))).toEqual({ action: 'nothing' });
    expect(pickupChoice(empty, null)).toEqual({ action: 'nothing' });
  });

  it('字样是给人看的：档位 + 名字 + 词缀，绝不出现 slug', () => {
    const label = gearLabel(charm('ember-charm', 'rare', ['long-wait']));   // 表外词缀才露出 id
    expect(label).toContain('稀有');
    expect(label).toContain('余烬护符');
    expect(gearLabel(charm('ember-charm', 'rare', ['ember-edge']))).toBe('稀有·余烬护符（余烬之锋）');
    expect(gearLabel(charm('tide-charm', 'common'))).toBe('凡品·潮纹护符');
    expect(gearLabel(null)).toBe('');
  });
});

/* ------------------------------------------------------------------ *
 * 三、LootSystem：掉与捡
 * ------------------------------------------------------------------ */

const fakeScene = () => {
  const scene = { added: 0, removed: 0, add() { scene.added++; }, remove() { scene.removed++; } };
  return scene;
};

describe('LootSystem：该不掉由表说，掉哪一件由注入的 rng 说', () => {
  it('Boss 那一档必掉两件：灵魂 + 一件装备，而装备的 mesh 颜色就是稀有度那一格', () => {
    const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: seqRng([0.99, 0.1, 0.5, 0.5]) });
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 500, 'boss');
    expect(loot.drops).toHaveLength(2);
    const gear = loot.drops.find((d) => d.gear);
    expect(gear.souls, '装备那一格不带货，货是灵魂那一格').toBe(0);
    expect(gear.mesh.material.color.getHex()).toBe(GEAR_RARITY_DISPLAY[gear.gear.rarity].tint);
  });

  it('训练木人显式不掉：一次击杀只交出灵魂', () => {
    const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: seqRng([0]) });
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 25, 'dummy');
    expect(loot.drops.map((d) => d.gear)).toEqual([null]);
  });

  it('掷骰用的是**同一只** rng：注入序列就能复现出"这一只掉了哪一件"', () => {
    const mk = () => new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: seqRng([0.9, 0.7, 0.2, 0.4]) });
    const a = mk(), b = mk();
    a.spawnKill({ x: 0, y: 0, z: 0 }, 25, 'normal');
    b.spawnKill({ x: 0, y: 0, z: 0 }, 25, 'normal');
    expect(a.drops.map((d) => d.gear)).toEqual(b.drops.map((d) => d.gear));
  });

  it('捡起装备那一帧走 onGear，不碰灵魂账；捡起灵魂那一帧照旧 addSouls', () => {
    const seen = [];
    const souls = [];
    const loot = new LootSystem(fakeScene(), { addSouls: (n) => souls.push(n) }, null,
      { rng: seqRng([0.99, 0, 0, 0]), onGear: (g) => seen.push(g) });
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 25, 'boss');
    const player = { x: 0, y: 0, z: 0 };
    loot.update(0.016, player);                      // 靠近：两格都在 2.5 米内
    expect(seen).toHaveLength(1);
    expect(souls).toEqual([25]);                     // 只有灵魂那一格进了账
    expect(loot.drops).toHaveLength(0);
  });

  it('不认识的装备不捡走（onGear 收到 null 也算事件，得先拦在生成那一头）', () => {
    const seen = [];
    const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { onGear: (g) => seen.push(g) });
    loot.spawnGear({ x: 0, y: 0, z: 0 }, charm('ghost-blade', 'common'));
    expect(seen).toEqual([]);
    // 坏的那一件在生成时就没进去：颜色查不到稀有度会当场抛，而不是等到玩家去捡
    expect(loot.drops).toHaveLength(0);
  });

  it('四档逐一对上：地上那一团光的颜色就是表里那一枚，而不是"装备掉落一律青色"', () => {
    // 文本门禁查不住这件事（手抄一枚青色之后，`GEAR_RARITY_DISPLAY` 还在 import 里）——
    // 只有逐档真造一次掉落物才量得出（变异探针 M11 就是从那道缝里绿过去的）
    for (const rarity of GEAR_RARITY) {
      const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: () => 0 });
      const drop = loot.spawnGear({ x: 0, y: 0, z: 0 }, charm('ash-charm', rarity.id, []));
      expect(drop, `${rarity.id} 那一档没生成掉落物`).toBeTruthy();
      expect(drop.mesh.material.color.getHex(), `${rarity.id} 的颜色不是表上那一枚`)
        .toBe(GEAR_RARITY_DISPLAY[rarity.id].tint);
    }
  });

  it('没掷中掉率时那一格还是纯灵魂、颜色还是改前那枚青色（`normal` 档 rng 给 0.9 > 0.15）', () => {
    const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: () => 0.9 });
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 15, 'normal');
    expect(loot.drops).toHaveLength(1);
    expect(loot.drops[0].gear).toBe(null);
    expect(loot.drops[0].mesh.material.color.getHex()).toBe(0x44ddff);
  });

  it('到期与拾取都只摘自己那一格：一帧里掉两件，走开就都在', () => {
    const loot = new LootSystem(fakeScene(), { addSouls() {} }, null, { rng: seqRng([0.99, 0, 0, 0]) });
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 25, 'boss');
    loot.update(0.016, { x: 100, y: 0, z: 100 });     // 玩家不在旁边
    expect(loot.drops).toHaveLength(2);
    loot.update(31, { x: 100, y: 0, z: 100 });        // 到期
    expect(loot.drops).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * 四、静态门禁：判据与消费口各只有一处
 * ------------------------------------------------------------------ */

describe('静态门禁', () => {
  const SRC = join(process.cwd(), 'src');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const CODE = walk(SRC).filter((f) => f.endsWith('.js'));
  const rel = (f) => relative(SRC, f).replaceAll('\\', '/');
  const hits = (re) => CODE.flatMap((f) => readFileSync(f, 'utf8')
    .split(/\r?\n/).flatMap((line, i) => (re.test(line) ? [`${rel(f)}:${i + 1}`] : [])));

  it('扫描集覆盖当前源码树（空目录会让下面每一条都假绿）', () => {
    expect(CODE.length).toBeGreaterThan(50);
    for (const probe of ['game/LootSystem.js', 'combat/EnemyManager.js', 'core/Game.js']) {
      expect(CODE.map(rel)).toContain(probe);
    }
  });

  it('LootSystem 里不许再自己写 `Math.random`：掉落必须能被注入复现', () => {
    const text = readFileSync(join(SRC, 'game/LootSystem.js'), 'utf8');
    const lines = text.split(/\r?\n/).map((l, i) => [l, i + 1]).filter(([l]) => /Math\.random\s*\(/.test(l));
    expect(lines.map(([, n]) => n), `第 ${lines.map(([, n]) => n.join(', ')).join(' / ')} 行自己在掷骰`)
      .toEqual([]);
  });

  it('一次击杀只有一个出口：`spawnKill(` 的调用点只有 EnemyManager', () => {
    const callers = [...new Set(hits(/\.spawnKill\s*\(/).map((h) => h.split(':')[0]))];
    expect(callers, `掉落的入口不止一个：${callers.join(' / ')}`).toEqual(['combat/EnemyManager.js']);
    expect(hits(/^\s*spawnKill\s*\(/).length, `生成函数必须有且只有一份`).toBe(1);
  });

  it('捡到装备之后只有一个消费者：`onGear` 由 LootSystem 交出、由 Game 接住', () => {
    const files = [...new Set(hits(/onGear/).map((h) => h.split(':')[0]))].sort();
    expect(files, `有人绕过 Game 处理装备：${files.join(' / ')}`).toEqual(['core/Game.js', 'game/LootSystem.js']);
    expect(hits(/\.pickUpGear\s*\(/).length, 'pickUpGear 的调用点必须只有一个（就是拾取那一路）').toBe(1);
  });

  it('判据与字样只在 Game 那一处拼进提示：别处再算一份"更好"就是第二份真相', () => {
    for (const [re, name] of [[/pickupChoice\s*\(/g, 'pickupChoice'], [/gearLabel\s*\(/g, 'gearLabel']]) {
      const files = [...new Set(hits(re).map((h) => h.split(':')[0]))];
      expect(files.sort(), `${name} 出现在 ${files.join(' / ')}`).toEqual(['content/gear.js', 'core/Game.js']);
    }
  });

  it('稀有度颜色只有一个来源：读 GEAR_RARITY_DISPLAY 的只有表自己、注册表与掉落层，而掉落层没再手抄一枚档位色', () => {
    // registry.js 也读它 —— 那正是"把这张表接进校验"的样子，不是第二处颜色
    const files = [...new Set(hits(/GEAR_RARITY_DISPLAY/).map((h) => h.split(':')[0]))].sort();
    expect(files, `颜色被抄到了别处：${files.join(' / ')}`)
      .toEqual(['content/gear.js', 'content/registry.js', 'game/LootSystem.js']);
    const text = readFileSync(join(SRC, 'game/LootSystem.js'), 'utf8');
    const hexes = text.match(/0x[0-9a-fA-F]{6}/g) ?? [];
    // 装备那一格的颜色是从表里取的，不是这里抄的：所以本文件只该留下灵魂掉落那一对既有常数
    expect(hexes, `LootSystem 里多了一枚手抄颜色：${hexes.join(' / ')}`).toEqual(['0x44ddff', '0x116688']);
  });
});
