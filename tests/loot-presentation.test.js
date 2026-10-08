/**
 * 掉落表现的门禁（W-B5 切片7 / 同时收 W-B8 的同名余项）。
 *
 * ## 这一片交付了什么
 * 掉落物从"一枚八面体"变成"三件套"：本体 + 地面环（档位色、档位环径，贴地呼吸）+ 高亮光柱
 * （只有"比身上那件严格更好"的装备才亮）。外加装备落地的一声 `gearDrop`（档位越高音越亮）。
 * 三个余项各有去处：特效 = 环与柱，音效 = `gearDrop`，**"更好的装备"高亮对比 = 光柱**。
 *
 * ## 这里钉住的五层（坏法各不同）
 * 1. **地面环**（①）：躺平（`rotation.x = -π/2`）、**永远贴着地面**（身体在浮动，环的世界高度
 *    恒为 ground + 0.02 —— `_lay` 的补偿漏一半的症状是"环跟着身体飞"）、颜色查表（魂青 / 装备逐档）、
 *    档位阶梯（环径与环光都随档位升 —— 平了就是"稀有度特效"名存实亡）。
 * 2. **高亮光柱**（②）：五态表驱动（空槽/更轻/相等/更重/另一槽），每一态同时读**两个答案** ——
 *    `beam.visible` 与 `pickupChoice(...).action === 'equip'` 必须逐态相等（分家的症状：
 *    地上亮着，捡起来却说不如身上）；活判据（换装备后同帧跟上，不许 catch 在出生那一刻）。
 * 3. **池化 hygiene**（③）：史诗装备（亮柱大环）被捡走后同一格复用给魂 —— 柱必须灭、环必须
 *    换成魂的规格与颜色（`_spawn` 少写一行，上一件的"亮柱"就会穿到下一件身上）。
 * 4. **音效**（④）：装备落地问一次 `gearDrop(档位序)`、魂不响、Boss 两件套响两声；
 *    `AudioManager.gearDrop` 两声、档位抬频、越界收档不炸、**不进 `SFX_NAMES`**。
 * 5. **静态门禁**（⑤）：`gearIsUpgrade` 的消费者只有掉落层一家；LootSystem 只准 import 判据，
 *    不许 import `gearScore` / `pickupChoice`（自己算"更好"就是第二份真相）；`gearDrop` 的
 *    调用点只有掉落层。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import { LootSystem, DROP_RING_BY_RARITY, DROP_RING_SOUL } from '../src/game/LootSystem.js';
import { GEAR_RARITY, GEAR_RARITY_DISPLAY, pickupChoice, rarityRank } from '../src/content/gear.js';
import { SFX_NAMES } from '../src/audio/AudioManager.js';
import { freshArm, run, notesOn, disarmAudio } from './helpers/fakeAudio.js';

const FRAME = 1 / 60;
const 装备 = (base, rarity, affixes = []) => ({ base, rarity, affixes });
const 假场景 = () => ({ add() {}, remove() {} });
const 远 = () => ({ x: 999, y: 0, z: 999 });
const 空槽 = () => ({ charm: null, sigil: null });
const mkLoot = (stats = { addSouls() {} }, audio = null) =>
  new LootSystem(假场景(), stats, audio, { rng: () => 0 });

afterEach(() => disarmAudio());

/* ------------------------------------------------------------------ *
 * 一、地面环
 * ------------------------------------------------------------------ */

describe('① 地面环：档位色与档位环径，永远躺在地面', () => {
  it('魂与四档装备各有一枚环：躺平、贴地、颜色是那一档的自己（魂青 / 装备查表）', () => {
    const loot = mkLoot();
    expect(loot.ringGeometry.parameters.innerRadius).toBe(0.32);
    expect(loot.ringGeometry.parameters.outerRadius).toBe(0.46);
    expect(loot.beamGeometry.parameters.height, '光柱高 3 米').toBe(3);
    expect(loot.beamGeometry.parameters.radiusTop).toBe(0.035);

    const 魂 = loot._spawn({ x: 1, y: 0, z: 2 }, { souls: 1, gear: null });
    expect(魂.ring.rotation.x, '环要躺平（立着像一扇门，不是地面特效）').toBeCloseTo(-Math.PI / 2, 6);
    expect(魂.ring.material.color.getHex(), '魂的环跟身体同一枚青（魂色仍只有 SOUL_TINT 一处）').toBe(0x44ddff);
    const 各件 = [魂];
    GEAR_RARITY.forEach((r, i) => {
      const d = loot.spawnGear({ x: 10 + i * 2, y: 0, z: 0 }, 装备('tide-charm', r.id));
      expect(d.ring.material.color.getHex(), `${r.id} 的环色不是表上那一枚`).toBe(GEAR_RARITY_DISPLAY[r.id].tint);
      各件.push(d);
    });

    // 出生那一刻：环世界高度 = 出生点地面 + 0.02（_lay 在 spawn 就走了一次）
    const 世界 = new THREE.Vector3();
    魂.ring.getWorldPosition(世界);
    expect(世界.y).toBeCloseTo(0.02, 5);

    // 跑满一圈相位：身体在浮动，环与柱的世界高度必须钉在地面参照上（换一处 playerY = 3.5 也一样）
    for (let i = 0; i < 120; i++) {
      loot.update(FRAME, { x: 100, y: 3.5, z: 100 });
      for (const d of 各件) {
        d.ring.getWorldPosition(世界);
        expect(世界.y, `第 ${i} 帧环漂离了地面（身体在浮动，补偿算式漏了一半）`).toBeCloseTo(3.5 + 0.02, 5);
        d.beam.getWorldPosition(世界);
        expect(世界.y, `第 ${i} 帧光柱中心不在 1.5 米（柱脚该落在地面）`).toBeCloseTo(3.5 + 1.5, 5);
      }
    }
    // 环真的呼吸过（120 帧里相位转过，scale 变过）——否则"呼吸"只是一句文案
    loot.update(FRAME, { x: 100, y: 3.5, z: 100 });
    expect(各件[0].ring.scale.x).not.toBeCloseTo(各件[0].look.scale, 4);
  });

  it('档位阶梯：环径与环光都随档位升（表值即规格，用例不手抄数字）', () => {
    const 各 = GEAR_RARITY.map((r) => mkLoot().spawnGear({ x: 0, y: 0, z: 0 }, 装备('ash-charm', r.id)));
    for (let i = 0; i < 各.length; i++) {
      const 期望 = DROP_RING_BY_RARITY[GEAR_RARITY[i].id];
      expect(各[i].ring.scale.x, `${GEAR_RARITY[i].id} 的环径不是表上那一格`).toBeCloseTo(期望.scale, 6);
      expect(各[i].ring.material.opacity, `${GEAR_RARITY[i].id} 的环光不是表上那一格`).toBeCloseTo(期望.opacity, 6);
      if (i > 0) {
        expect(各[i].ring.scale.x, '环径没有随档位升 —— "稀有度的地面特效"名存实亡').toBeGreaterThan(各[i - 1].ring.scale.x);
        expect(各[i].ring.material.opacity, '环光没有随档位升').toBeGreaterThan(各[i - 1].ring.material.opacity);
      }
    }
    // 魂那一枚比凡品更小更暗（显式一格，不是"没档位就 fallback 成凡品"）
    expect(DROP_RING_SOUL.scale).toBeLessThan(DROP_RING_BY_RARITY.common.scale);
    expect(DROP_RING_SOUL.opacity).toBeLessThan(DROP_RING_BY_RARITY.common.opacity);
  });

  it('环规格表的键集与 GEAR_RARITY 逐一对齐：多一格是死格，少一格那一档的环会当场炸', () => {
    expect(Object.keys(DROP_RING_BY_RARITY).sort()).toEqual(GEAR_RARITY.map((r) => r.id).sort());
    for (const r of GEAR_RARITY) {
      expect(DROP_RING_BY_RARITY[r.id], `${r.id} 没有环规格 —— 那一档落地就会炸`).toBeTruthy();
    }
  });
});

/* ------------------------------------------------------------------ *
 * 二、高亮光柱（"更好的装备"对比）
 * ------------------------------------------------------------------ */

describe('② 高亮光柱：与 pickupChoice 是同一个答案', () => {
  it('五态表驱动：每一态上光柱的亮灭必须等于"捡起来会不会换上"', () => {
    const 重 = 装备('oath-charm', 'epic', ['twin-fang', 'bulwark-oath', 'arcane-lens']);
    const 轻 = 装备('ash-charm', 'common');
    const 态 = [
      { 名: '空槽', 身上: 空槽(), 来件: 轻, 亮: true },
      { 名: '更轻的来件', 身上: { charm: 轻, sigil: null }, 来件: 重, 亮: true },
      { 名: '相等的来件（相等不换）', 身上: { charm: 轻, sigil: null }, 来件: 装备('ash-charm', 'common'), 亮: false },
      { 名: '更重的来件', 身上: { charm: 重, sigil: null }, 来件: 轻, 亮: false },
      { 名: '另一槽空着（各算各的槽）', 身上: { charm: 重, sigil: null }, 来件: 装备('quill-sigil', 'common'), 亮: true },
    ];
    for (const t of 态) {
      const loot = mkLoot({ gear: t.身上, addSouls() {} });
      const d = loot.spawnGear({ x: 0, y: 0, z: 0 }, t.来件);
      expect(d.beam.visible, `${t.名}：光柱该${t.亮 ? '亮' : '灭'}`).toBe(t.亮);
      // 同一个判据的另一半：捡起时换不换（两处写死两份判据时，这一条就是分家的见证）
      expect(pickupChoice(t.身上, t.来件).action === 'equip', `${t.名}：光柱与 pickupChoice 分家了`).toBe(t.亮);
      for (let i = 0; i < 30; i++) loot.update(FRAME, 远());
      expect(d.beam.visible, `${t.名}：跑了几帧光柱就漂了`).toBe(t.亮);
    }
  });

  it('活判据：玩家换上/卸下之后，地上那一件的柱子同帧跟上（不许 catch 在出生那一刻）', () => {
    const stats = { gear: 空槽(), addSouls() {} };
    const loot = mkLoot(stats);
    const d = loot.spawnGear({ x: 0, y: 0, z: 0 }, 装备('ash-charm', 'common'));
    expect(d.beam.visible, '空槽：出生就该亮').toBe(true);
    stats.gear.charm = 装备('oath-charm', 'epic', ['twin-fang', 'bulwark-oath', 'arcane-lens']);
    loot.update(FRAME, 远());
    expect(d.beam.visible, '装备账变了但光柱没跟上 —— 判据被 catch 在出生那一刻了').toBe(false);
    stats.gear.charm = null;
    loot.update(FRAME, 远());
    expect(d.beam.visible, '卸下来之后该亮回去').toBe(true);
  });

  it('魂没有柱：光柱是"值得捡"的装备语义，不是所有掉落物都有', () => {
    const loot = new LootSystem(假场景(), { addSouls() {} }, null, { rng: () => 0.99 });
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 5, 'dummy');
    expect(loot.drops).toHaveLength(1);
    expect(loot.drops[0].beam.visible).toBe(false);
    expect(loot.drops[0].look, '魂那一格该拿的是魂的环规格').toBe(DROP_RING_SOUL);
  });
});

/* ------------------------------------------------------------------ *
 * 三、池化 hygiene
 * ------------------------------------------------------------------ */

describe('③ 池化 hygiene：上一格的环/柱状态不许穿到下一件', () => {
  it('史诗装备（大环亮柱）被捡走后，同一格复用给魂：柱灭、环换成魂的规格与颜色', () => {
    const loot = mkLoot({ gear: 空槽(), addSouls() {} });
    const 史诗 = loot.spawnGear({ x: 2, y: 0, z: 0 }, 装备('ash-charm', 'epic'));
    expect(史诗.beam.visible).toBe(true);
    for (let i = 0; i < 10; i++) loot.update(FRAME, 远());          // 环转过相、柱亮着

    loot.update(FRAME, { x: 2, y: 0, z: 0 });                        // 玩家贴脸捡走
    expect(loot.drops).toHaveLength(0);
    expect(loot.pooled()).toBe(1);

    const 魂 = loot._spawn({ x: 8, y: 0, z: 8 }, { souls: 3, gear: null });
    expect(魂.mesh, '回来的就是那一格').toBe(史诗.mesh);
    expect(魂.ring, '环也跟着这一格回来').toBe(史诗.ring);
    expect(魂.beam, '柱也跟着这一格回来').toBe(史诗.beam);
    expect(魂.beam.visible, '上一件的亮柱穿到了魂身上').toBe(false);
    expect(魂.ring.material.color.getHex(), '环色没换成魂那一枚').toBe(0x44ddff);
    expect(魂.ring.scale.x, '环径没缩回魂的规格（还带着史诗的呼吸）').toBeCloseTo(DROP_RING_SOUL.scale, 6);
    expect(魂.ring.material.opacity, '环光没换成魂的规格').toBeCloseTo(DROP_RING_SOUL.opacity, 6);
    expect(魂.mesh.rotation.y, '上一件留下的自转必须洗掉').toBe(0);

    // 反向：把魂捡走（同一格回到池里），再复用给一件"空槽玩家"的史诗 —— 柱要亮起、环色换成该档
    loot.update(FRAME, { x: 8, y: 0, z: 8 });
    expect(loot.pooled()).toBe(1);
    const 史诗2 = loot._spawn({ x: 9, y: 0, z: 9 }, { souls: 0, gear: 装备('ash-charm', 'epic') });
    expect(史诗2.mesh, '还是那一格').toBe(史诗.mesh);
    expect(史诗2.beam.visible, '空槽玩家面前，史诗的柱该亮').toBe(true);
    expect(史诗2.ring.material.color.getHex()).toBe(GEAR_RARITY_DISPLAY.epic.tint);
    expect(史诗2.ring.scale.x).toBeCloseTo(DROP_RING_BY_RARITY.epic.scale, 6);
  });
});

/* ------------------------------------------------------------------ *
 * 四、落地音效
 * ------------------------------------------------------------------ */

describe('④ 落地音效：档位越高越亮，魂落地不响', () => {
  it('一件装备落地问一次 gearDrop，参数是档位序；魂与"不掉装备的击杀"都不响', () => {
    const 响 = [];
    const loot = mkLoot({ addSouls() {} }, { gearDrop: (...a) => 响.push(a) });
    loot.spawnGear({ x: 0, y: 0, z: 0 }, 装备('ash-charm', 'epic'));
    expect(响).toEqual([[rarityRank('epic')]]);
    loot._spawn({ x: 1, y: 0, z: 0 }, { souls: 5, gear: null });
    expect(响, '魂落地不该响（捡起时那一声才是魂的）').toHaveLength(1);
  });

  it('Boss 一次交三格（魂 + 固定件 + 池件）时只有装备那两格响', () => {
    const 响 = [];
    const loot = mkLoot({ addSouls() {} }, { gearDrop: (...a) => 响.push(a) });
    loot.spawnKill({ x: 0, y: 0, z: 0 }, 500, 'boss', 'hub', 'shadow-warden');
    expect(loot.drops).toHaveLength(3);
    expect(响, '两件装备各响一声，魂不响').toHaveLength(2);
    expect(响.map(([r]) => r).sort(), '两声各带自己的档位序').toEqual([rarityRank('common'), rarityRank('rare')].sort());
  });

  it('AudioManager.gearDrop：两声、档位抬频、越界收档（99 与 3 同频、-5/NaN 与 0 同频）、不进 SFX_NAMES', () => {
    const 采 = (rank) => {
      const a = freshArm();
      a.audio.gearDrop(rank);
      run(a.ctx, 0.3);
      return notesOn(a.ctx, 'sfx').map((n) => n.freq).sort((x, y) => x - y);
    };
    const 低 = 采(0);
    expect(低, 'gearDrop 该是两声').toHaveLength(2);
    const 高 = 采(3);
    expect(高[0], '高一档的基准频率没抬起来').toBeGreaterThan(低[0]);
    expect(采(99), '99 没收进顶档：频率与 3 不同').toEqual(高);
    expect(采(-5), '-5 没收进底档：频率与 0 不同').toEqual(低);
    expect(采(NaN), 'NaN 没收进底档：频率与 0 不同').toEqual(低);

    expect(SFX_NAMES).not.toContain('gearDrop');
  });
});

/* ------------------------------------------------------------------ *
 * 五、静态门禁
 * ------------------------------------------------------------------ */

describe('⑤ 静态门禁：判据与消费口各只有一处', () => {
  const SRC = join(process.cwd(), 'src');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
  const CODE = walk(SRC).filter((f) => f.endsWith('.js'));
  const rel = (f) => relative(SRC, f).replaceAll('\\', '/');
  const hits = (re) => CODE.flatMap((f) => readFileSync(f, 'utf8')
    .split(/\r?\n/).flatMap((line, i) => (re.test(line) ? [`${rel(f)}:${i + 1}`] : [])));

  it('扫描集覆盖当前源码树（空目录会让下面每一条都假绿）', () => {
    expect(CODE.length).toBeGreaterThan(50);
    for (const probe of ['game/LootSystem.js', 'content/gear.js', 'audio/AudioManager.js']) {
      expect(CODE.map(rel)).toContain(probe);
    }
  });

  it('"更好"的判据只有一处：`gearIsUpgrade` 的消费者只剩掉落层一家', () => {
    const files = [...new Set(hits(/gearIsUpgrade/).map((h) => h.split(':')[0]))].sort();
    expect(files, `有人绕过判据自己算"更好"：${files.join(' / ')}`).toEqual(['content/gear.js', 'game/LootSystem.js']);
  });

  it('LootSystem 只准 import 判据：不许把 gearScore / pickupChoice 带进来自己算', () => {
    const text = readFileSync(join(SRC, 'game', 'LootSystem.js'), 'utf8');
    const m = text.match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/content\/gear\.js'/);
    expect(m, 'LootSystem 不再从 gear.js 取数据了？').toBeTruthy();
    const names = m[1].split(',').map((s) => s.trim());
    expect(names).toContain('gearIsUpgrade');
    expect(names, 'LootSystem 拿了 gearScore —— 那意味着它准备自己算"更好"').not.toContain('gearScore');
    expect(names, 'LootSystem 拿了 pickupChoice —— 判据入口被抄到了掉落层').not.toContain('pickupChoice');
  });

  it('落地音效的接线在掉落层：gearDrop 的调用点只有 LootSystem，名册里没有它', () => {
    // \b 是硬约束：`gearDropChance`（注册表里的掉率键）不是这个音效名，别把好心算成命中
    const files = [...new Set(hits(/\bgearDrop\b/).map((h) => h.split(':')[0]))].sort();
    expect(files, `gearDrop 出现在 ${files.join(' / ')}`).toEqual(['audio/AudioManager.js', 'game/LootSystem.js']);
    expect(SFX_NAMES).not.toContain('gearDrop');
  });
});
