/**
 * 顶层组的名字（W-C2 切片17）—— 让阴影归属榜上 `(直属scene)` 那一格只剩"真的没人能认"的件。
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
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { SceneEnhancer } from '../src/effects/SceneEnhancer.js';
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
import { installWindowShim } from './helpers/enemyHarness.js';

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
