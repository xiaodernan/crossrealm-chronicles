/**
 * 顶层组的名字（W-C2 切片17 + 切片18）—— 让阴影归属榜上 `(直属scene)` 那一格只剩"真的没人能认"的件。
 *
 * ## 症状（改前的实测读数，`.tmp-20261030-s20/live-void5.txt`，void 站 198 件投影）
 *
 * `shadowCensus.js` 的 `归属标签()` 印的是「顶层组名 / 件名」，而**顶层组自己没名**时一律读成
 * `(直属scene)` —— 切片16 只给合批产物起了名字，榜上剩下的 `(直属scene) / (无名)` 全是**没并进批的散件**：
 *
 * - 七座区的区根（`zone.group`）：void 站那棵 `子=78` 的组，`无名=15`（单件的圆柱、`markNoBatch` 留给动画的水晶）
 * - 五座 Boss 场（`buildBossArena` 的组）：每棵 `子=9 投影=8 无名=8` ⇒ 40 笔挤在同一格，问不出是哪一座
 * - 八座营火（`addRestPoint` 的组）：每棵 `投影=2 无名=2` ⇒ 底座与石圈在榜上不分彼此
 *
 * 切片18 接另外五族（改前读数 `.tmp-20261030-s21/census-space.txt`，space 站全场景 201 笔）：
 * 敌人本体组 67 笔 `(直属scene) / body`、8 口宝箱 + 3 个 NPC + 1 根枢纽石柱 12 笔
 * `(直属scene) / (无名)`、玩家 2 笔 `(直属scene) / vanguard_*`。
 *
 * ## 这一片钉住的是"名字有没有被乱用"，不是"名字好不好看"
 *
 * ① 三族各自的形状与唯一性（名字要能当把手用，撞号就等于没起）
 * ② **真读者**开了口：拿生产那把尺子 `阴影件普查` 数出来的榜，三族的行都以名字开头
 *    （附同一张榜里的反面控制：一件真没主的野件照样读 `(直属scene) / (无名)` ——
 *     没有它，② 可能只是因为榜换了别的说法）
 * ③ **命名不许动合批**：`被动过()` 先判 `p === root` 再看名字，所以给区根起名不该让整区退回散件。
 *    这条是"改了一行看似无害的赋值，性能账掉回切片5 之前"的唯一防线 —— 逐数比对（名字在/名字清空两棵树）
 * ④ **命名不许改材质路由**：`SceneEnhancer._upgradeProps` 里有一条按名字分支
 *    （`name.includes('trunk') || name.includes('pillar')`，走的是 `obj.name || obj.parent?.name`），
 *    祖先一旦有了名字，那条分支就可能开始捡到以前捡不到的件。差分跑两遍（带名 / 剥名）要求逐件同判
 * ⑤ 名字只有一个来源：区根那格取自 `zone.id`（造一个只在用例里出现过的 id，名字跟着走 = 没抄表）
 * ⑥ **切片18 · 敌人一族按类聚合**（`enemy:<bossId 或 type>`）：榜是按标签数笔数的，逐只编号会把前十格
 *    刷成流水号；因此"同类两只同名"是要钉住的**口径**，而宝箱 / NPC 反过来钉"不许同名"——
 *    两种口径各一条腿，免得将来有人顺手统一。后缀必须在出生点表里（名不是抄的第二份名册）。
 *    再加一条症状级的：挨打时那句 `getObjectByName('body')` 必须仍取到**件**而不是组
 * ⑦ 宝箱 / NPC / 玩家 / 枢纽标志逐个有名，且用名字问回来的正是那一个（位置对得上）
 * ⑧ 六族同上一张生产榜：除了故意放进去的野件，**没有任何一行**还以 `(直属scene)` 开头
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import { PlayerController } from '../src/player/PlayerController.js';
import { CollectibleManager } from '../src/world/CollectibleManager.js';
import { NPCManager } from '../src/world/NPCManager.js';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { SceneEnhancer } from '../src/effects/SceneEnhancer.js';
import { ENEMY_SPAWNS } from '../src/content/enemySpawns.js';
import { BaseZone } from '../src/world/zones/BaseZone.js';
import { AbyssZone } from '../src/world/zones/AbyssZone.js';
import { FantasyZone } from '../src/world/zones/FantasyZone.js';
import { GloomZone } from '../src/world/zones/GloomZone.js';
import { MagicZone } from '../src/world/zones/MagicZone.js';
import { RadiantZone } from '../src/world/zones/RadiantZone.js';
import { SpaceZone } from '../src/world/zones/SpaceZone.js';
import { VoidZone } from '../src/world/zones/VoidZone.js';
import { batchZoneStatics } from '../src/world/zoneBatching.js';
import { SHADOW_MAP_TYPES, 归属标签, 阴影件普查 } from '../src/engine/shadowCensus.js';
import { installWindowShim, makeWorld } from './helpers/enemyHarness.js';
import { buildSeededWorld } from './helpers/seededWorld.js';

const 世界种子 = 20261028;   // 与 perf 站点同一颗（B125 那族成因：布局走未播种的 Math.random）
const 对话桩 = () => ({ show() {}, toast() {} });
const 七区 = [AbyssZone, FantasyZone, GloomZone, MagicZone, RadiantZone, SpaceZone, VoidZone];
const 世界桩 = { getGroundHeight: () => 0 };

/** 建一座真区（构造器只构造，内容由 `build()` 建 —— 与 `WorldManager` 同序） */
function 建区(Zone, center = { x: -200, z: 0 }) {
  const scene = new THREE.Scene();
  const zone = new Zone(scene, center, 对话桩());
  zone.build();
  return { scene, zone };
}

/** 五座 Boss 场：走生产那条路（`spawnDefaults` 里那五个中心），不抄坐标 */
function 造场() {
  const scene = new THREE.Scene();
  const mgr = new EnemyManager(scene, 世界桩, null);
  mgr.spawnDefaults();
  return { scene, mgr };
}

function 造火(scene = new THREE.Scene()) {
  const rp = new RestPointManager(scene, 世界桩);
  rp.buildDefaults();
  return rp;
}

/** 与 `perf-shadow-census.test.js` 同形的一盏俯视方向光（榜是真榜，不是自己拼字符串） */
function 俯视光(半幅) {
  const 相机 = new THREE.OrthographicCamera(-半幅, 半幅, 半幅, -半幅, 0.1, 2000);
  相机.position.set(0, 50, 0);
  相机.up.set(0, 0, -1);
  相机.lookAt(0, 0, 0);
  相机.updateProjectionMatrix();
  相机.updateMatrixWorld(true);
  相机.matrixWorldInverse.copy(相机.matrixWorld).invert();
  const 光 = new THREE.DirectionalLight(0xffffff, 1);
  光.castShadow = true;
  光.shadow.camera = 相机;
  return 光;
}

function 榜(场景) {
  const 主相机 = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  主相机.updateMatrixWorld(true);
  场景.updateMatrixWorld(true);
  const 出 = 阴影件普查(场景, 主相机, {
    shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true, type: SHADOW_MAP_TYPES.PCF_SOFT },
  });
  return 出;
}

/**
 * 把顶层组的名字一律剥掉（③④ 段的对照组：同一棵树，只是没起名字）。
 * 剥的是**全部**顶层名而不是只剥三族 —— 否则变异臂把区根改成 `trunk-*` 时，
 * 带名/剥名两遍都还带着那个名字，第④段就量不到"名字喂给了材质路由"这件事。
 */
function 剥名(场景) {
  const 剥 = [];
  for (const 顶 of 场景.children) {
    if (顶.name) { 剥.push([顶, 顶.name]); 顶.name = ''; }
  }
  return () => { for (const [顶, 名] of 剥) 顶.name = 名; };
}

beforeEach(() => installWindowShim());
afterEach(() => vi.restoreAllMocks());

describe('① 三族的顶层组有名可查，且名字天生不撞号', () => {
  it('七座区的区根都叫 `zone:<自己的 id>`，互不相同', () => {
    const 名 = [];
    for (const Zone of 七区) {
      const { zone } = 建区(Zone, { x: 名.length * 60 - 200, z: 0 });
      expect(zone.id, '区没有 id —— 名字会退化成 `zone:null`，七座撞成一格').toBeTruthy();
      expect(zone.group.name, `${zone.constructor.name} 的区根没起名`).toBe(`zone:${zone.id}`);
      名.push(zone.group.name);
    }
    expect(名.length, '七座区没建全（这一条会空转）').toBe(7);
    expect(new Set(名).size, `区根名字撞号：${名.join(' ')}`).toBe(7);
  });

  it('五座 Boss 场的名字带中心坐标 ⇒ 一座一格，且形状能从名字问回坐标', () => {
    const { mgr } = 造场();
    const 名 = mgr.arenas.map((a) => a.group.name);
    expect(名.length, '五座场没造全（这一条会空转）').toBe(5);
    for (const [i, 一] of mgr.arenas.entries()) {
      expect(名[i], `${i} 号场没起名`).toMatch(/^boss-arena@-?\d+,-?\d+$/);
      const [x, z] = 名[i].slice('boss-arena@'.length).split(',').map(Number);
      // 名字里的坐标必须就是场自己的中心 —— 否则"从榜找回那一件"会领到隔壁那座
      expect(x, `${名[i]} 的 x 不是场中心 ${Math.round(一.center.x)}`).toBe(Math.round(一.center.x));
      expect(z, `${名[i]} 的 z 不是场中心 ${Math.round(一.center.z)}`).toBe(Math.round(一.center.z));
    }
    expect(new Set(名).size, `两座场中心重合 ⇒ 榜上两族会并进同一格：${名.join(' ')}`).toBe(5);
  });

  it('八座营火的名字就是 `rest:<营火 id>`（id 已在生产里核过非空且不重复）', () => {
    const rp = 造火();
    expect(rp.points.length, '八座营火没建全（这一条会空转）').toBe(8);
    const 名 = rp.points.map((p) => p.mesh.name);
    expect(名, '营火组没起名').toEqual(rp.points.map((p) => `rest:${p.id}`));
    expect(new Set(名).size).toBe(8);
  });
});

describe('② 真读者（阴影归属榜）开了口', () => {
  it('同一张榜里：三族的行都以名字开头，而没主的野件照样读 (直属scene) / (无名)', () => {
    const 场景 = new THREE.Scene();
    场景.add(俯视光(600));
    const 区 = new SpaceZone(场景, { x: 200, z: 80 }, 对话桩());
    区.build();
    造火(场景);
    const mgr = new EnemyManager(场景, 世界桩, null);
    mgr.buildBossArena({ x: -100, z: -100 });
    mgr.buildBossArena({ x: -100, z: 100 });
    // 反面控制：一件真没主的投影件（切片16 之前那种 `(无名)` 的来源之一，今天仍然合法存在）
    const 野件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    野件.castShadow = true;
    场景.add(野件);

    const 出 = 榜(场景);
    expect(出.问题, `尺子自己没量到：${JSON.stringify(出.问题)}`).toEqual([]);
    const 标签 = 出.榜.map(([t]) => t);
    expect(标签.length, '一笔都没数到（这一条会空转）').toBeGreaterThan(3);
    expect(标签, '野件的反面控制丢了 —— 榜不再会说"没主"，那 ② 就成了恒真').toContain('(直属scene) / (无名)');
    for (const t of 标签) {
      if (t === '(直属scene) / (无名)') continue;
      expect(t, `榜上有一行读不出归属：${t}`).not.toMatch(/^\(直属scene\)/);
    }
    expect(标签.some((t) => t.startsWith('zone:')), '区根的名字没进榜').toBe(true);
    expect(标签.some((t) => t.startsWith('rest:')), '营火的名字没进榜').toBe(true);
    expect(标签.some((t) => t.startsWith('boss-arena@')), '场的名字没进榜').toBe(true);
    // 名字必须还能当把手用：榜上的标签指得回那一件
    expect(归属标签(野件, 场景)).toBe('(直属scene) / (无名)');
  });

  it('区里没并进批的散件，从榜上能问出是哪座区（切片17 要的就是这一格）', () => {
    const { scene, zone } = 建区(SpaceZone, { x: 200, z: 80 });
    const 散件 = [];
    zone.group.traverse((o) => { if (o.isMesh && o.castShadow && !o.userData.zoneBatch) 散件.push(o); });
    expect(散件.length, '这座区一个没合批的投影散件都没有（这一条会空转）').toBeGreaterThan(0);
    let 读得出区 = 0, 读得出无名 = 0;
    for (const 件 of 散件) {
      const 条 = 归属标签(件, scene);
      expect(条, `散件仍读不出归属：${条}`).toMatch(/^zone:space \//);
      读得出区 += 1;
      if (条.endsWith('(无名)')) 读得出无名 += 1;
    }
    // `(无名)` 那一半仍然诚实存在：件自己没名时榜照说没名，只是**归属那一格从此认得出是哪座区**
    expect(读得出无名, '一个"件自己没名"的散件都没有 —— 那 ①② 段就没量到切片17 真正修掉的东西').toBeGreaterThan(0);
    expect(读得出区).toBe(散件.length);
  });
});

describe('③④ 名字不改行为：合批照旧、材质路由照旧', () => {
  it('合成区：区根有没有名字，合批的每一个数都逐位相同', () => {
    const 摆 = (root) => {
      for (let 桶 = 0; 桶 < 2; 桶++) {
        const mat = new THREE.MeshStandardMaterial();
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
          m.position.set(桶 * 20 + i * 3, 0, 0);
          root.add(m);
        }
      }
    };
    const 跑 = (名) => {
      const scene = new THREE.Scene();
      const group = new THREE.Group();
      group.name = 名;
      scene.add(group);
      摆(group);
      return { 计: batchZoneStatics({ zones: [{ id: 'synthetic', group }] }), 名 };
    };
    const 有名 = 跑('zone:synthetic');
    const 没名 = 跑('');
    expect(有名.计.区[0].批数, '区根起了名字就不合批了 —— 这正是切片5 整片白做的那种坏法').toBeGreaterThan(0);
    expect(有名.计).toEqual(没名.计);
  });

  it('真区（Fantasy，最大那一座）：带着生产名字照样整片合批（绝对下限，不是差分）', () => {
    // 差分那一段只走合成区：真区的布局是**未播种的 Math.random()** 摆的（见
    // `helpers/seededWorld.js` 的头注），两次独立建造本来就不是同一棵树，
    // 拿它做逐数比对会量到随机而不是量到名字。真区这一侧要防的是"命名把整区的批打回散件"，
    // 那一件事用绝对下限就足够判。
    const { scene, zone } = 建区(FantasyZone);
    expect(zone.group.name, '生产区根没起名（下面的下限就成了空转）').toBe(`zone:${zone.id}`);
    expect(scene.getObjectByName(`zone:${zone.id}`)).toBe(zone.group);
    const 计 = batchZoneStatics({ zones: [zone] });
    expect(计.区[0].批数, '区根起了名字就不合批了 —— 切片5 整片白做的那种坏法').toBeGreaterThan(5);
    expect(计.合入件数, '真区只合了个位数 —— 命名把散件挡在桶外了').toBeGreaterThan(50);
    expect(计.回退, '这一条不测回退，回退 nonzero 说明别的坏了').toBe(0);
  });

  it('SceneEnhancer 的按名字路由：带名与剥名两遍逐件同判（新名字一个都不落进 trunk/pillar）', () => {
    const 场景 = new THREE.Scene();
    const 区 = new FantasyZone(场景, { x: -200, z: 0 }, 对话桩());
    区.build();
    造火(场景);
    const mgr = new EnemyManager(场景, 世界桩, null);
    mgr.buildBossArena({ x: 0, z: 0 });
    const 记录 = () => {
      const 出 = new Map();
      const texLib = { applyToMesh(件, surface) { 出.set(件, surface); } };
      new SceneEnhancer({})._upgradeProps(场景, texLib);
      return 出;
    };
    const 带名 = 记录();
    expect(带名.size, '一件都没被路由（这一条会空转）').toBeGreaterThan(0);
    const 恢复 = 剥名(场景);
    const 没名 = 记录();
    恢复();
    expect([...没名.keys()].length).toBe([...带名.keys()].length);
    for (const [件, surface] of 带名) expect(没名.get(件), `命名改变了 ${件.geometry?.type} 的材质路由`).toBe(surface);
    for (const [件, surface] of 没名) expect(带名.get(件), '剥名版多路由了件').toBe(surface);
    // 三族真名逐字过一遍那条分支：不许含 trunk / pillar（大小写不敏感，判据与源里同一条）
    const 名清单 = [
      ...场景.children.filter((o) => o.name.startsWith('zone:')).map((o) => o.name),
      ...场景.children.filter((o) => o.name.startsWith('rest:')).map((o) => o.name),
      ...场景.children.filter((o) => o.name.startsWith('boss-arena@')).map((o) => o.name),
    ];
    expect(名清单.length, '三族的名字一棵都没扫到（这一条会空转）').toBeGreaterThan(0);
    for (const 一 of 名清单) {
      expect(一.toLowerCase(), `${一} 会被 _upgradeProps 的 trunk/pillar 分支捡到`).not.toMatch(/trunk|pillar/);
    }
  });
});

describe('⑤ 名字只有一个来源', () => {
  it('区根那格取自 `zone.id`：造一个仓里没有的 id，名字跟着走（没有第二份名册）', () => {
    const scene = new THREE.Scene();
    const zone = new BaseZone(scene, { x: 0, z: 0 }, { info: { id: 'made-up-zone-7' } });
    expect(zone.group.name).toBe('zone:made-up-zone-7');
    expect(scene.getObjectByName('zone:made-up-zone-7')).toBe(zone.group);
  });

  it('七座区的名字都能用 `zone:<id>` 从场景里问回来，且问到的就是那座区自己的根', () => {
    for (const Zone of 七区) {
      const { scene, zone } = 建区(Zone, { x: 0, z: 0 });
      const 找到 = scene.getObjectByName(`zone:${zone.id}`);
      expect(找到, `${Zone.name} 的区根用 zone:${zone.id} 问不回来`).toBe(zone.group);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 切片18：剩下五族顶层组 —— 敌人本体 / 宝箱 / NPC / 玩家 / 枢纽标志。
 * 改前实测（`.tmp-20261030-s21/census-space.txt`，全场景 201 笔投影件，榜用生产 `归属标签`）：
 *   67  `(直属scene) / body`        ← 敌人本体组（`Enemy.createMesh` 的 group，直接挂 scene）
 *   12  `(直属scene) / (无名)`      ← 8 口宝箱（Box）+ 3 个 NPC（Capsule）+ 1 根枢纽石柱（Cylinder）
 *    2  `(直属scene) / vanguard_*`  ← 玩家（GLB 节点名是资产带来的，不是归属键）
 * 口径与切片17 不同的那一半：**敌人按类聚合**（榜按标签数笔数，一只一格会把前十格刷成流水号），
 * **宝箱与 NPC 逐个点名**（就那么几个，且 id 本来就是它们的键）。两种口径各钉一条腿，
 * 免得将来有人"顺手统一"成逐只编号，把榜的聚合性洗掉。
 * ------------------------------------------------------------------ */
describe('⑥ 敌人本体组按类有名（切片18）', () => {
  it('每只怪的本体组都叫 `enemy:<bossId 或 type>`，后缀逐个在内容表里（不许 `enemy:undefined`）', () => {
    const { mgr } = 造场();
    const 类型 = new Set(ENEMY_SPAWNS.map((s) => s.type));
    expect(mgr.enemies.length, '一只怪都没造（这一条会空转）').toBeGreaterThan(10);
    for (const e of mgr.enemies) {
      expect(e.mesh.name, `${e.constructor.name} 的本体组没起名`).toMatch(/^enemy:[\w-]+$/);
      const 后缀 = e.mesh.name.slice('enemy:'.length);
      if (e.isBoss) expect(后缀, `Boss 的名没取 bossId：${e.mesh.name}`).toBe(e.bossId);
      else expect(类型.has(后缀), `${e.mesh.name} 的类型不在出生点表里 —— 名是从第二份名册抄的`).toBe(true);
    }
  });

  it('同类两只**故意同名**：榜要的是按类聚合，不是逐只流水号', () => {
    const { mgr } = 造场();
    const 计数 = new Map();
    for (const e of mgr.enemies) if (!e.isBoss) 计数.set(e.mesh.name, (计数.get(e.mesh.name) ?? 0) + 1);
    const 共享 = [...计数.entries()].filter(([名, n]) => n > 1 && /^enemy:[\w-]+$/.test(名));
    expect(共享.length, '没有一只怪的名字形状对而又有两只共享 —— 这条在空转（或压根没起名）').toBeGreaterThan(0);
    const [名, 只数] = 共享[0];
    expect(只数, `${名} 只出现一次，量不出"共享"这个口径`).toBeGreaterThan(1);
    // 反向对照：宝箱与 NPC 是逐个点名的，不许也共享
    const 场景 = new THREE.Scene();
    const 箱 = new CollectibleManager(场景, 世界桩, { chestsOpened: new Set() }, 对话桩());
    const 箱名 = 箱.chests.map((c) => c.mesh.name);
    expect(new Set(箱名).size, `宝箱同名了：${箱名.join(' ')}`).toBe(箱名.length);
  });

  it('五座 Boss 各占一格（名取 `bossId`，不并成 `enemy:boss`）', () => {
    const { mgr } = 造场();
    const 名 = mgr.enemies.filter((e) => e.isBoss).map((e) => e.mesh.name);
    expect(名.length, '五座 Boss 没造全（这一条会空转）').toBe(5);
    expect(new Set(名).size, `两座 Boss 并进同一格：${名.join(' ')}`).toBe(5);
    for (const 一 of 名) expect(一, `Boss 的名前缀不对`).toMatch(/^enemy:/);
  });

  it('名字不许把"挨打闪红取 body"那条生产路挡掉', () => {
    const { mgr } = 造场();
    const e = mgr.enemies.find((x) => !x.isBoss);
    expect(e.alive, '这只怪出生就没活着 —— 后面那条闪红就没量头').toBe(true);
    // `takeDamage` 的返回值说的是"这一刀打死没有"（打不死 ⇒ false），这里要的是它的**副作用**：
    // 挨打时那句 `getObjectByName('body')` 取不取得到件
    e.takeDamage(1);
    const body = e.bodyMesh;
    expect(body, '`takeDamage` 里那句 `getObjectByName(\'body\')` 取空了 —— 组名顶掉子节点就是这种坏法').toBeTruthy();
    expect(body.isMesh, `取到的是组不是件：${body.constructor.name}`).toBe(true);
    expect(body.name).toBe('body');
    expect(e.mesh.name, '组名与子节点名撞了 —— 撞了上面那条就永远量不到').not.toBe('body');
    // 症状级：闪红确实发生在这件的材质上（共享材质的话会串色，那是另一条门管的事）
    expect(body.material.emissive.getHex(), '挨打没让 body 闪红 —— 取到的件不是那块材质').toBe(0xff0000);
  });
});

describe('⑦ 宝箱 / NPC / 玩家 / 枢纽标志逐个有名（切片18）', () => {
  it('宝箱逐口点名 `chest:<id>`，用名字问回来的正是那一口（位置对得上 ⇒ 没抄第二份名册）', () => {
    const 场景 = new THREE.Scene();
    const 箱 = new CollectibleManager(场景, 世界桩, { chestsOpened: new Set() }, 对话桩());
    expect(箱.chests.length, '一口箱都没造（这一条会空转）').toBeGreaterThan(3);
    for (const c of 箱.chests) {
      expect(c.mesh.name, `${c.id} 那口箱没起名`).toBe(`chest:${c.id}`);
      const 问回 = 场景.getObjectByName(c.mesh.name);
      expect(问回, `chest:${c.id} 问不回来`).toBe(c.mesh);
      expect(Math.round(问回.position.x), `${c.mesh.name} 的 x 与表上不是同一口`).toBe(Math.round(c.x));
      expect(Math.round(问回.position.z), `${c.mesh.name} 的 z 与表上不是同一口`).toBe(Math.round(c.z));
    }
  });

  it('NPC 逐个点名 `npc:<id>`，id 不撞号', () => {
    const 场景 = new THREE.Scene();
    const 人 = new NPCManager(场景, 世界桩, 对话桩());
    expect(人.npcs.length, '一个 NPC 都没造（这一条会空转）').toBeGreaterThan(0);
    const 名 = 人.npcs.map((n) => n.mesh.name);
    for (const [i, n] of 人.npcs.entries()) {
      expect(名[i], `${n.id} 没起名`).toBe(`npc:${n.id}`);
      expect(场景.getObjectByName(名[i]), `npc:${n.id} 问不回来`).toBe(n.mesh);
    }
    expect(new Set(名).size, `NPC 撞号：${名.join(' ')}`).toBe(名.length);
  });

  it('玩家组叫 `player`、枢纽标志组叫 `hub:landmarks`（都走生产构造路）', () => {
    const 场景 = new THREE.Scene();
    const 相机 = new THREE.PerspectiveCamera(60, 1.6, 0.1, 200);
    const p = new PlayerController(场景, 相机, makeWorld(), { restScene: null });
    expect(p.mesh.name, '玩家本体组没起名（GLB 节点名是资产给的，不是归属键）').toBe('player');
    expect(p.mesh.parent, '玩家组没挂在进来的那份场景上 —— 这条就不在生产路上了').toBe(场景);
    expect(场景.getObjectByName('player'), 'player 问不回来').toBe(p.mesh);

    const 世界 = buildSeededWorld(世界种子);
    expect(世界.hubGroup.name, '枢纽标志组没起名（切片17 的 `zone:` 前缀盖不到不归 BaseZone 管的这一族）')
      .toBe('hub:landmarks');
    expect(世界.scene.getObjectByName('hub:landmarks'), 'hub:landmarks 问不回来').toBe(世界.hubGroup);
  });
});

describe('⑧ 真读者：六族一起上榜，`(直属scene)` 只剩野件（切片18）', () => {
  it('一张生产榜里，敌人 / 宝箱 / NPC / 枢纽都有名字开头', () => {
    const 世界 = buildSeededWorld(世界种子);
    const 场景 = 世界.scene;
    场景.add(俯视光(600));   // 没这盏能投影的光，尺子会报"这一帧没有任何 castShadow 的光源"
    const mgr = new EnemyManager(场景, 世界, null);
    mgr.spawnDefaults();
    new CollectibleManager(场景, 世界, { chestsOpened: new Set() }, 对话桩());
    new NPCManager(场景, 世界, 对话桩());
    造火(场景);
    // 反面控制：一件真没主的投影件 —— 榜必须还会说"没主"，否则上面那些"以名字开头"是恒真
    const 野件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    野件.castShadow = true;
    场景.add(野件);

    const 出 = 榜(场景);
    expect(出.问题, `尺子自己没量到：${JSON.stringify(出.问题)}`).toEqual([]);
    const 标签 = 出.榜.map(([t]) => t);
    expect(标签.length, '一笔都没数到（这一条会空转）').toBeGreaterThan(5);
    expect(标签, '野件的反面控制丢了 —— 榜不再会说"没主"').toContain('(直属scene) / (无名)');
    for (const t of 标签) {
      if (t === '(直属scene) / (无名)') continue;
      expect(t, `榜上还有一行读不出归属：${t}`).not.toMatch(/^\(直属scene\)/);
    }
    for (const 前 of ['enemy:', 'chest:', 'npc:', 'hub:landmarks /', 'zone:', 'rest:', 'boss-arena@']) {
      expect(标签.some((t) => t.startsWith(前)), `${前} 那一族没进榜（要么没造出来，要么名字没被读者用上）`).toBe(true);
    }
  });

  it('新名字一律不落进材质路由的 trunk/pillar 分支；带名与剥名两遍逐件同判', () => {
    const 场景 = new THREE.Scene();
    // 得放一座真区：`_upgradeProps` 路由的是断柱 / 树干那一族件，只放怪与箱子的话
    // 一件都不会被路由，这条差分就成了空转（切片17 那条同一口径）
    const 区 = new FantasyZone(场景, { x: -200, z: 0 }, 对话桩());
    区.build();
    const mgr = new EnemyManager(场景, 世界桩, null);
    mgr.spawnDefaults();
    new CollectibleManager(场景, 世界桩, { chestsOpened: new Set() }, 对话桩());
    new NPCManager(场景, 世界桩, 对话桩());
    const 记录 = () => {
      const 出 = new Map();
      new SceneEnhancer({})._upgradeProps(场景, { applyToMesh(件, surface) { 出.set(件, surface); } });
      return 出;
    };
    const 带名 = 记录();
    expect(带名.size, '一件都没被路由（这一条会空转）').toBeGreaterThan(0);
    const 恢复 = 剥名(场景);
    const 没名 = 记录();
    恢复();
    for (const [件, surface] of 带名) expect(没名.get(件), `命名改变了 ${件.geometry?.type} 的材质路由`).toBe(surface);
    for (const [件, surface] of 没名) expect(带名.get(件), '剥名版多路由了件').toBe(surface);
    const 名清单 = 场景.children.filter((o) => o.name).map((o) => o.name);
    expect(名清单.length, '一棵有名字的都没扫到（这一条会空转）').toBeGreaterThan(10);
    for (const 一 of 名清单) {
      expect(一.toLowerCase(), `${一} 会被 _upgradeProps 的 trunk/pillar 分支捡到`).not.toMatch(/trunk|pillar/);
    }
  });
});
