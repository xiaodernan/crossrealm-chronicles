/**
 * 掉落物的资源生命周期 —— W-C1 切片2（修 B73 的掉落半区；普查读数在前，改码在后）。
 *
 * 改码之前的只读普查（`.tmp-20260929/wc2s2-census.mjs`，同一口径：资源要生效必须先进场景图）：
 * - 500 件掉落、全部让它到期：**500 个不同几何体 + 500 个不同材质、`dispose` 0 次**，
 *   而同时在场峰值只有 40 件 —— 新建数等于**累计掉落数**，与场上需要几件无关。
 * - 500 件、每件都立刻捡走：同样是 500 + 500、dispose 0。也就是"捡得勤"与"不捡"在这笔账上没区别。
 *
 * 这一处比切片1 那两类更糟的地方是**没有上限**：残影与雷至少有"同时在场 12 道 / 一条线"封顶，
 * 掉落物则随击杀线性增长。修法沿用同一套口径：几何共用一份 + 网格按池申领/归还，
 * **捡走与到期两条出口都走同一个归还口**。
 *
 * 光"数字变小"不够，所以配四条正向门槛，拦住"把功能删掉来减负"：跑 200 件与 500 件见过同样多的
 * 资源（且那一场确实掉过 500 件）、在场每一件各有材质与档位色（查表来的）、复用那一格先归位自转、
 * 池化期间一次 `dispose` 都不发生（还回去不等于拆掉）。
 *
 * 切片7（掉落表现）起一格是**三件网格**：本体八面体 + 地面环 + 高亮光柱（后两件是本体的孩子）。
 * 资源口径不变、只是按格 ×3 计：全局三份共享几何、每格三份材质 —— 下面各处对账随之改口径，
 * "每格一份材料、跟峰值挂钩"的语义没变。
 *
 * 另有三条对账跑在 `lootField` 的**每一帧**上（任何一刻没有两个掉落物共用一格、场景里挂的件数
 * 等于账上的件数、新建格数 = 在场 + 池里）。放在循环末尾对不住：双臂归还只在摘下的那一帧露馅，
 * 等收干净再对，错的那一格早被下一次申领回收了（变异臂10 就是这样从"只在一个用例里对账"溜过去的）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { LootSystem } from '../src/game/LootSystem.js';
import { GEAR_RARITY_DISPLAY } from '../src/content/gear.js';

const SRC = join(process.cwd(), 'src');
const FRAME = 1 / 60;
/** 与 `LootSystem.update` 的默认值一致：这里显式写出来，免得改了默认值就测不到"贴到脸上" */
const PICKUP_RADIUS = 2.5;
/** 一件魂的掉落：`_spawn` 的公开替身是 `spawnKill`，生命周期用例只关心进出场 */
const SOUL_DROP = { souls: 1, gear: null };

const opened = [];

/**
 * 资源监视器：数"挂进场景图的东西用过哪些几何与材质"。
 *
 * ESM 命名空间是只读的，`THREE.OctahedronGeometry` 这类构造器没法猴补，所以换个口径：
 * 资源要生效必须先进场景图 —— "这一场新建过几份"等价于"`add` 见过的不同 uuid 有几份"。
 * dispose 计在两个原型上，任何实例被拆掉都跑不掉。
 */
function openWatch() {
  const seen = { geometries: new Set(), materials: new Set() };
  const disposes = { geometries: 0, materials: 0 };
  let spies = null;

  const origAdd = THREE.Object3D.prototype.add;
  const origGeoDispose = THREE.BufferGeometry.prototype.dispose;
  const origMatDispose = THREE.Material.prototype.dispose;
  spies = [
    vi.spyOn(THREE.Object3D.prototype, 'add').mockImplementation(function (...children) {
      for (const c of children) {
        if (c.geometry) seen.geometries.add(c.geometry.uuid);
        const mats = c.material ? (Array.isArray(c.material) ? c.material : [c.material]) : [];
        for (const m of mats) seen.materials.add(m.uuid);
      }
      return origAdd.apply(this, children);
    }),
    vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function (...a) {
      disposes.geometries++;
      return origGeoDispose.apply(this, a);
    }),
    vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(function (...a) {
      disposes.materials++;
      return origMatDispose.apply(this, a);
    }),
  ];
  const stop = () => {
    for (const s of spies ?? []) s.mockRestore();
    spies = null;
  };
  opened.push(stop);
  return { seen, disposes, stop };
}

afterEach(() => {
  while (opened.length) opened.pop()();
});

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const farAway = () => v3(999, 0, 999);

/** 只关心进出场的最小装配：`rng` 固定成 0.99，`dropChance` 那一掷永不命中，掉落数就等于调用数 */
const mkLoot = (scene) => new LootSystem(scene, { addSouls() {} }, { rng: () => 0.99 });

/**
 * 每 `cadence` 帧掉一件，掉满 `total` 件之后让剩下的自然到期。
 *
 * 节奏要摊开而不是"一帧填满场上"，因为同时在场件数正是这一片要钉的量：一帧填满会使得
 * 每一批同时出生、同时到期，池子只在批与批之间复用，测出来的是另一种东西。
 * 落点按 6 米一格铺开（> 2 × 拾取半径），所以"站到那一件脸上"只会摘掉那一件。
 *
 * `everyFrames` 给非 0 时每那么多帧捡走最旧那件（对应"玩家一直在捡"）。
 *
 * 三个对账写在循环体内而不是用例里：这样每一个用例都是逐帧见证，不需要各自记得挂钩子。
 */
function lootField({ total, cadence = 15, everyFrames = 0 }) {
  const watch = openWatch();
  const scene = new THREE.Scene();
  const loot = mkLoot(scene);
  const spawnSpy = vi.spyOn(loot, '_spawn');
  const player = farAway();
  let peak = 0;
  let spawned = 0;
  let frames = 0;
  let grabbed = 0;
  // 放完全部 + 最后那 30 秒自然到期，再出不完就是"到期这一半没在跑"
  const maxFrames = total * cadence + 60 * 35;

  while (spawned < total || loot.drops.length) {
    if (spawned < total && frames % cadence === 0) {
      loot._spawn(v3((spawned % 60) * 6, 0, Math.floor(spawned / 60) * 6), SOUL_DROP);
      spawned++;
      // 峰值在"放进场上"那一刻算：等 update 之后再取样本就看不见这一帧的瞬时高了
      peak = Math.max(peak, loot.drops.length);
    }
    if (everyFrames && frames % everyFrames === 0 && loot.drops.length) {
      const p = loot.drops[0].mesh.position;
      player.set(p.x, 0, p.z);
      grabbed++;
    } else {
      player.copy(farAway());
    }
    loot.update(FRAME, player, PICKUP_RADIUS);
    const meshes = loot.drops.map((d) => d.mesh.uuid);
    expect(new Set(meshes).size, `第 ${frames} 帧场上有两个掉落物共用一格（归还被走了两遍）`).toBe(meshes.length);
    const rings = loot.drops.map((d) => d.ring.uuid);
    expect(new Set(rings).size, `第 ${frames} 帧两份掉落共用了同一枚地面环`).toBe(rings.length);
    expect(scene.children.length, `第 ${frames} 帧场景里挂的和账上的对不上`).toBe(loot.drops.length);
    // 每一格要么在场上要么在池里：多出来的是孤儿，少了的是凭空造的格（每格三份材质，按 ×3 对账）
    expect((loot.drops.length + loot.pooled()) * 3, `第 ${frames} 帧的材质数与这一场新建过的总数对不上`)
      .toBe(watch.seen.materials.size);
    frames++;
    if (frames > maxFrames) throw new Error(`掉落没有按期收干净：${maxFrames} 帧后场上还剩 ${loot.drops.length} 件`);
  }
  const spawns = spawnSpy.mock.calls.length;
  spawnSpy.mockRestore();
  watch.stop();
  return { loot, scene, seen: watch.seen, disposes: watch.disposes, peak, spawns, frames, grabbed };
}

describe('掉落物池化：一件掉落不再新建一份资源（W-C1 切片2）', () => {
  it('500 件掉落只用得到三份共享几何（本体 / 地面环 / 光柱）：普查里那 500 个几何体归一', () => {
    const { seen, spawns, peak } = lootField({ total: 500 });
    expect(spawns).toBe(500);
    expect(seen.geometries.size, '多出来的是没复用的新几何').toBe(3);
    // 材质按格 ×3（本体 / 环 / 柱）：改前这一格等于累计掉落数的三倍，现在跟峰值挂钩
    expect(seen.materials.size).toBe(peak * 3);
    expect(peak, '这一场真的堆起来过：峰值远小于累计数，池化才在做事').toBeLessThan(spawns / 3);
  });

  it('跑 200 件与跑 500 件见过同样多的资源：零增长，不是少增长', () => {
    const short = lootField({ total: 200 });
    const long = lootField({ total: 500 });
    expect(long.spawns).toBe(short.spawns * 2.5);
    expect(long.seen.geometries.size).toBe(short.seen.geometries.size);
    expect(long.seen.materials.size).toBe(short.seen.materials.size);
    // 上面两条关于"空集"时都没意义：这一场确实建过不止一格，也确实掉过东西
    expect(short.seen.materials.size).toBeGreaterThan(1);
    expect(short.grabbed).toBe(0);
  });

  it('新建过的格数与同时在场峰值严格相等（每格三份材质）：既不许多造，也不许只造一格排队', () => {
    const { seen, peak } = lootField({ total: 500 });
    expect(peak).toBeGreaterThan(20);
    // 第 k 次新建时前 k 格必都在场上（池子空了才造）；反过来峰值那一刻必有 peak 格不同的网格
    expect(seen.materials.size).toBe(peak * 3);
  });

  it('玩家一直在捡的时候，资源数仍只跟同时在场峰值挂钩', () => {
    // 节奏挑成"捡得勤、但掉得更快"：每 15 帧掉一件、每 25 帧捡走最旧那件。探针实测（`.tmp-20260929/wc2s2-probe-grab.mjs`）
    // 这一场峰值 120 件、新建 120 格，离场 48 件走捡走、72 件走到期 —— **两条出口都真的走路**。
    // 反过来（捡得比掉得快）场上永远只有一件，池子根本不用转，那一场测的是"一件格子能不能循环"，
    // 共用一块布 / 到期不还池那类毛病因此在里面看不出来（变异臂2 / 臂4 / 臂12 的第二轮读数）。
    const { seen, peak, grabbed, spawns } = lootField({ total: 300, everyFrames: 25 });
    expect(spawns).toBe(300);
    expect(grabbed).toBeGreaterThan(50);
    expect(peak, '这一场真的挤到过：峰值只有一件的话下面两条都是空的').toBeGreaterThan(20);
    expect(seen.geometries.size).toBe(3);
    expect(seen.materials.size, '捡走得多不等于要多造格子：归还口一开，池子就够转').toBe(peak * 3);
  });

  it('池化期间一次 dispose 都不发生：还回去不等于拆掉', () => {
    const { disposes, seen } = lootField({ total: 300 });
    expect(disposes.geometries).toBe(0);
    expect(disposes.materials).toBe(0);
    expect(seen.geometries.size).toBe(3);
  });

  it('对账：在场 + 池里 = 这一场新建过的总数，场景里不留孤儿', () => {
    const expired = lootField({ total: 120 });
    expect(expired.loot.drops.length).toBe(0);
    expect((expired.loot.pooled() + expired.loot.drops.length) * 3).toBe(expired.seen.materials.size);
    expect(expired.scene.children.length).toBe(0);
    const picked = lootField({ total: 120, everyFrames: 20 });
    expect((picked.loot.pooled() + picked.loot.drops.length) * 3).toBe(picked.seen.materials.size);
  });

  it('摘账只有一个出口：捡走与到期都走 _despawn，别处不许再直接归还', () => {
    const src = readFileSync(join(SRC, 'game', 'LootSystem.js'), 'utf8');
    const countIn = (re) => (src.match(re) ?? []).length;
    // 申领与归还各一处；`_despawn` 出现 3 次 = 定义一次 + update 里两条出口各一次
    expect(countIn(/this\.scene\.add\(/g)).toBe(1);
    expect(countIn(/this\.scene\.remove\(/g)).toBe(1);
    expect(countIn(/this\._pool\.push\(/g)).toBe(1);
    expect(countIn(/_despawn\(/g)).toBe(3);
    // 分配的口：几何三份共享（本体 / 环 / 柱）、材质每格三份（标准一件 + 基本两件），都只在建格那一步里
    expect(countIn(/new THREE\.OctahedronGeometry\(/g)).toBe(1);
    expect(countIn(/new THREE\.RingGeometry\(/g)).toBe(1);
    expect(countIn(/new THREE\.CylinderGeometry\(/g)).toBe(1);
    expect(countIn(/new THREE\.MeshStandardMaterial\(/g)).toBe(1);
    expect(countIn(/new THREE\.MeshBasicMaterial\(/g)).toBe(2);
  });
});

describe('两件出口与三件颜色：池化没把玩法改掉', () => {
  it('捡走的那一件回到池里：摘出场景、池子加一、魂到账', () => {
    const scene = new THREE.Scene();
    let souls = 0;
    const loot = new LootSystem(scene, { addSouls: (n) => { souls += n; } }, { rng: () => 0 });
    loot._spawn(v3(2, 0, 3), { souls: 15, gear: null });
    expect(scene.children.length).toBe(1);
    loot.update(FRAME, v3(2, 0, 3), PICKUP_RADIUS);
    expect(loot.drops).toHaveLength(0);
    expect(loot.pooled()).toBe(1);
    expect(scene.children.length).toBe(0);
    expect(souls).toBe(15);
  });

  it('到期的那一件也回到池里：两条出口都归还', () => {
    const scene = new THREE.Scene();
    const loot = mkLoot(scene);
    loot._spawn(v3(0, 0, 0), { souls: 3, gear: null });
    // 30 秒的生命周期：比 29 秒短还不该摘，比 30 秒长必须摘干净
    for (let i = 0; i < Math.round(29 / FRAME); i++) loot.update(FRAME, farAway(), PICKUP_RADIUS);
    expect(loot.drops).toHaveLength(1);
    for (let i = 0; i < Math.round(2 / FRAME); i++) loot.update(FRAME, farAway(), PICKUP_RADIUS);
    expect(loot.drops).toHaveLength(0);
    expect(loot.pooled()).toBe(1);
    expect(scene.children.length).toBe(0);
  });

  it('在场每一件有自己的材质与档位色：共用一份会互相改色', () => {
    const loot = mkLoot(new THREE.Scene());
    for (const rarity of Object.keys(GEAR_RARITY_DISPLAY)) {
      expect(loot.spawnGear(v3(rarity.length, 0, 0), { base: 'tide-charm', rarity, affixes: [] })).not.toBeNull();
    }
    loot._spawn(v3(8, 0, 8), { souls: 1, gear: null });
    expect(loot.drops).toHaveLength(Object.keys(GEAR_RARITY_DISPLAY).length + 1);
    const mats = loot.drops.map((d) => d.mesh.material.uuid);
    expect(new Set(mats).size, '两件掉落共用一块布，后掉的那件会改掉前那件的颜色').toBe(mats.length);
    const 环布 = loot.drops.map((d) => d.ring.material.uuid);
    expect(new Set(环布).size, '两件掉落共用一块环布，后掉的那件会改掉前那件的环色').toBe(环布.length);
    const 柱布 = loot.drops.map((d) => d.beam.material.uuid);
    expect(new Set(柱布).size, '两件掉落共用一块柱布：光柱颜色会互相改').toBe(柱布.length);
    for (const d of loot.drops) {
      expect(d.mesh.geometry).toBe(loot.geometry);
      expect(d.ring.geometry, '环几何是全局共享那一份').toBe(loot.ringGeometry);
      expect(d.beam.geometry, '柱几何是全局共享那一份').toBe(loot.beamGeometry);
    }
  });

  it('长相照旧：魂一枚青、装备的色仍查表（改的是分配方式，不是颜色）', () => {
    const loot = mkLoot(new THREE.Scene());
    const soul = loot._spawn(v3(0, 0, 0), { souls: 1, gear: null });
    const gear = loot.spawnGear(v3(1, 0, 1), { base: 'tide-charm', rarity: 'epic', affixes: [] });
    expect(gear.mesh.material.color.getHex()).toBe(GEAR_RARITY_DISPLAY.epic.tint);
    expect(gear.mesh.material.emissive.getHex(), '装备的自发光跟着自己的档位走').toBe(GEAR_RARITY_DISPLAY.epic.tint);
    expect(gear.mesh.material.metalness).toBe(0.6);
    expect(gear.mesh.material.roughness).toBe(0.2);
    expect(gear.mesh.material.emissiveIntensity).toBe(0.9);
    // 回头再读魂那一件：先在它身上验色再让它被后掉那件改掉，等于没验
    // （变异臂4「全场共用一块布」正是这样从只读各自出生那一刻的颜色的两条背后溜过去的）
    expect(soul.mesh.material.color.getHex()).toBe(0x44ddff);
    expect(soul.mesh.material.emissive.getHex()).toBe(0x116688);
  });

  it('复用出来的那一格先归位自转，不许带着上一件的尾巴', () => {
    const loot = mkLoot(new THREE.Scene());
    loot._spawn(v3(0, 0, 0), { souls: 1, gear: null });
    const first = loot.drops[0].mesh;
    for (let i = 0; i < 60; i++) loot.update(FRAME, farAway(), PICKUP_RADIUS);
    expect(first.rotation.y).not.toBe(0);
    loot.update(FRAME, v3(first.position.x, 0, first.position.z), PICKUP_RADIUS);
    expect(loot.pooled()).toBe(1);
    loot._spawn(v3(3, 0, 4), { souls: 2, gear: null });
    const second = loot.drops[0].mesh;
    expect(second, '回来的就是那一格').toBe(first);
    expect(second.rotation.y, '上一件留下的自转必须洗掉').toBe(0);
  });

  it('一次击杀仍然交出该交的东西，两件各自归还', () => {
    const scene = new THREE.Scene();
    const souls = [];
    const gears = [];
    // 0.4 < dropChance('elite') = 0.5 ⇒ 魂 + 一件装备
    const loot = new LootSystem(scene, { addSouls: (n) => souls.push(n) }, {
      rng: () => 0.4,
      onGear: (g) => gears.push(g),
    });
    const drops = loot.spawnKill(v3(0, 0, 0), 7, 'elite', 'hub');
    expect(drops).toHaveLength(2);
    expect(loot.drops).toHaveLength(2);
    loot.update(FRAME, v3(0, 0, 0), PICKUP_RADIUS);
    loot.update(FRAME, v3(0, 0, 0), PICKUP_RADIUS);
    expect(souls).toEqual([7]);
    expect(gears).toHaveLength(1);
    expect(typeof gears[0].base).toBe('string');
    expect(loot.drops).toHaveLength(0);
    expect(loot.pooled()).toBe(2);
    expect(scene.children.length).toBe(0);
  });
});

describe('掉落层还在主循环的接线位置上', () => {
  // 泄漏门禁若关于一个没人调用的类，就只是在读我的用例自己
  it('core/Game.js 仍然每帧推进 loot.update，掉落仍然由击杀入口交给它', () => {
    const game = readFileSync(join(SRC, 'core', 'Game.js'), 'utf8');
    expect(game).toMatch(/this\.loot\.update\(dt, this\.player\.position\)/);
    // W-D6 切片8：掉落层不再收 audio（声音走 game-cue），所以这里钉的是"没把 audio 塞回去"。
    // 塞回去的症状不是报错，而是"响了但没字幕"—— 两条输出各走各的门，谁也不校验谁。
    expect(game, 'Game.js 又把 audio 递给掉落层了：那条路上声音与字幕会重新分家')
      .not.toMatch(/new LootSystem\(this\.scene, this\.stats, this\.audio/);
    expect(game).toMatch(/new LootSystem\(this\.scene, this\.stats, \{/);
    const enemyManager = readFileSync(join(SRC, 'combat', 'EnemyManager.js'), 'utf8');
    // 派发处带可选链：`loot` 没装配起来的构造路径不该静默不掉落
    expect(enemyManager).toMatch(/loot\?\.spawnKill\(/);
  });
});
