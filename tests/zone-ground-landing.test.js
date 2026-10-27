/**
 * 区地标的落座口径 —— 修 B134（缺陷② 切片F）。
 *
 * ## 这条缺陷是什么
 *
 * 各区自己的 `sampleHeight(lx, lz)` 是**本区对高度场的贡献**，不是高度场本身；
 * 全局场（`TerrainHeight.sampleGlobalHeight`）取的是 `max(自然地, 各区贡献…)`，
 * 再叠枢纽广场整平与室内那一档的掺混。摆件按 `sampleHeight` 落座、地面按全局场铺 ——
 * 同一坐标上两份读数各说各话，于是地标埋进坡里看不见、或悬在半空没有脚。
 *
 * 修前普查（切片F 自己的尺，`.tmp-b134-census.mjs`）：641 次落座调用里
 * **埋没 254 次、悬空 24 次**，最狠一刀 **−22.96 米**（中洲外野的树长在地下二十三米）。
 *
 * ## 这门禁钉五件事
 *
 * ① **落座口唯一**（结构腿）：七座区与四族彩蛋里，`sampleHeight(` 一次都不许出现 ——
 *    它是"本区的贡献"，不是"这块地多高"。`BaseZone` 里它只许出现在两个方法体里：
 *    `getHeightAt`（区对场的贡献）与 `groundYAt` 的裸区退路。
 * ② **落座读数 = 玩家脚下那张场**（行为腿）：真世界里每一次落座用的高度，必须**严格等于**
 *    `world.getGroundHeight(那个世界坐标)` —— 同一张场、同一条读数口。
 * ③ **两阶段建区**：构造器只构造，内容由 `build()` 建 —— 因为世界场要七座区都在册才答得出来。
 * ④ **碰撞体与摆件同一组数字**（B130 的账）：摆件搬了、体没搬 = 多一道看不见的墙。
 * ⑤ **落座与眼睛看得见的那张网格对齐**：浮在皮上、埋在皮下都不许超过一个上坎。
 *
 * ## 为什么每条腿都配反向见证
 *
 * ① 的结构腿要证明"扫法不瞎"（喂人造源码必须命中）与"注释里的旧写法不是写者"
 * （不剥注释时命中、剥注释后不命中）；② 要配一臂**反向控制**（把落座换回旧口径，
 * 同一把尺必须判它红）；④ 要证明"不许悬空的墙"这条判据会咬（喂一条悬空的体必须红）。
 *
 * ## 读数（本门禁量到的，不是引用的）
 *
 * 落座 642 次 ⇒ 与玩家脚下那张场差 **0.000000 米**；与眼睛看得见的那张网格差 ≤ **0.068 米**
 * （B133 那条 0.12 米的脚−眼残差之内）；旧口径同一批点埋没 285 次／悬空 31 次，最狠 **−16.81 米**。
 * 碰撞体 364 条：344 条与落座读数同源（0 越界），剩下 20 条是"手写绝对 y"那一族
 * （中洲门拱 2 + 魔法区禁林 18）—— 那是另一个成因，已登记为 B136，不在本门禁口径内。
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { WorldManager } from '../src/world/WorldManager.js';
import { BaseZone } from '../src/world/zones/BaseZone.js';
import { attachPopCultureZones } from '../src/world/PopCultureZoneEnhancer.js';
import { sampleGlobalHeight } from '../src/world/TerrainHeight.js';
import { playerStepUp } from './helpers/productionReadings.js';

const 读 = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

/** 剥掉注释与块注释（"注释里的旧写法不是写者"） */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|[*/]).*$/gm, '');

/** 命中的调用点落在哪个方法体里（按顶层两格缩进的方法声明回溯） */
const 所属方法 = (源, 位置) => {
  const 前 = 源.slice(0, 位置);
  const m = [...前.matchAll(/^ {2}(\w+)\s*\(/gm)].pop();
  return m ? m[1] : null;
};

/**
 * 源码里 `sampleHeight(` 的**调用点**（定义本身不算）。
 *
 * 定义长这样：`  sampleHeight(lx, lz) {` —— 它是这一族方法自己，不是"拿它当地基"。
 * 先把定义的位置标出来，再把落在那些位置上的命中剔掉；剩下的才是调用点。
 * 裸调用（不写 `this.`）照样能被抓到。
 */
const 调用点 = (源) => {
  const 定义 = new Set(
    [...源.matchAll(/^[ \t]*sampleHeight\s*\(/gm)].map((m) => m.index + m[0].indexOf('sampleHeight'))
  );
  return [...源.matchAll(/\bsampleHeight\s*\(/g)].filter((m) => !定义.has(m.index));
};

const 区文件 = [
  'src/world/zones/FantasyZone.js',
  'src/world/zones/MagicZone.js',
  'src/world/zones/SpaceZone.js',
  'src/world/zones/VoidZone.js',
  'src/world/zones/AbyssZone.js',
  'src/world/zones/GloomZone.js',
  'src/world/zones/RadiantZone.js',
];
const 彩蛋文件 = [
  'src/world/PopCultureZoneEnhancer.js',
  'src/world/PopCultureZoneEnhancerWave2.js',
  'src/world/PopCultureZoneEnhancerWave3.js',
  'src/world/PopCultureZoneEnhancerWave4.js',
];

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/**
 * 建一个真世界，并把每一次落座记下来。
 *
 * 记账打在 `BaseZone.prototype.groundYAt` 上（**不改源文件**）—— 落座口只有一个，
 * 在它上面记账就等于记下"有人拿这块地的高度当地基"这件事本身。
 *
 * `旧口径: true` 时把落座换成改前那个写法（问本区自己的那一档），
 * 供②的反向控制臂用。
 */
function 建世界并记账({ 旧口径 = false } = {}) {
  const 账 = [];
  const 原 = BaseZone.prototype.groundYAt;
  BaseZone.prototype.groundYAt = 旧口径
    ? function 旧(lx, lz) {
      const y = this.sampleHeight(lx, lz);
      账.push({ 区: this.id, lx, lz, y, 中心: this.center });
      return y;
    }
    : function 记(lx, lz) {
      const y = 原.call(this, lx, lz);
      账.push({ 区: this.id, lx, lz, y, 中心: this.center });
      return y;
    };
  try {
    const scene = makeScene();
    const dialog = makeDialog();
    const world = new WorldManager(scene, dialog);
    world.build();
    attachPopCultureZones({ world, dialog, scene });
    return { world, 账 };
  } finally {
    BaseZone.prototype.groundYAt = 原;
  }
}

describe('① 落座口唯一：区与彩蛋不许再拿"本区的贡献"当地基', () => {
  it('七座区与四族彩蛋里，剥注释后 `sampleHeight(` 一次都不许出现', () => {
    for (const f of [...区文件, ...彩蛋文件]) {
      const 源 = codeOnly(读(f));
      const 命中 = 调用点(源);
      expect(
        命中.length,
        `${f} 里还有 ${命中.length} 处 \`sampleHeight(\` —— 那是本区对高度场的**贡献**，不是这块地多高。` +
          '落座一律走 `groundYAt`（问世界那张场）'
      ).toBe(0);
    }
  });

  it('`BaseZone` 里 `sampleHeight(` 只许出现在两个方法体里：`getHeightAt`（贡献）与 `groundYAt`（裸区退路）', () => {
    const 源 = codeOnly(读('src/world/zones/BaseZone.js'));
    const 命中 = 调用点(源);
    expect(命中.length, '`BaseZone` 里 `sampleHeight(` 的调用点数量变了 —— 判据口径漂了').toBe(2);
    const 方法 = 命中.map((m) => 所属方法(源, m.index));
    expect(方法.sort()).toEqual(['getHeightAt', 'groundYAt']);
  });

  it('反向见证：扫法不瞎 —— 人造源码里的一处 `this.sampleHeight(` 必须被点名', () => {
    const 人造 = [
      'class 假区 {',
      '  buildOuterWilds() {',
      '    const y = this.sampleHeight(lx, lz);',
      '    return y;',
      '  }',
      '}',
    ].join('\n');
    const 命中 = 调用点(codeOnly(人造));
    expect(命中.length, '扫法连人造源码里的一处都抓不到 ⇒ 这条腿在空转').toBe(1);
    expect(所属方法(codeOnly(人造), 命中[0].index)).toBe('buildOuterWilds');
  });

  it('反向见证：方法定义不算写者', () => {
    const 只定义 = [
      'class 假区 {',
      '  sampleHeight(lx, lz) {',
      '    return 0;',
      '  }',
      '}',
    ].join('\n');
    expect(调用点(codeOnly(只定义)).length, '定义本身被当成了调用点 ⇒ 扫法不认定义').toBe(0);
  });

  it('反向见证：注释里的旧写法不是写者（不剥注释时命中、剥注释后不命中）', () => {
    const 带注释 = [
      'class 假区 {',
      '  // 改前写的是 this.sampleHeight(lx, lz)',
      '  buildOuterWilds() {',
      '    return 0;',
      '  }',
      '}',
    ].join('\n');
    expect(调用点(带注释).length, '不剥注释时那一处必须被看见').toBe(1);
    expect(调用点(codeOnly(带注释)).length, '剥掉注释后它不该算写者').toBe(0);
  });
});

describe('② 落座读数 = 玩家脚下那张场（同一条读数口）', () => {
  it('真世界里每一次落座的高度，严格等于 `world.getGroundHeight(那个世界坐标)`', () => {
    const { world, 账 } = 建世界并记账();
    expect(账.length, '落座账是空的 ⇒ 这条腿在空转（世界里一件东西都没落地？）').toBeGreaterThanOrEqual(500);
    for (const r of 账) {
      const wx = r.中心.x + r.lx;
      const wz = r.中心.z + r.lz;
      const 场 = world.getGroundHeight(wx, wz);
      expect(
        r.y,
        `区 ${r.区} 在本地 (${r.lx}, ${r.lz}) 落在 ${r.y}，而玩家脚下那块地是 ${场} —— 两份读数又分家了`
      ).toBe(场);
    }
  });

  it('落座覆盖七座区（不是只盯住某一座）', () => {
    const { 账 } = 建世界并记账();
    const 覆盖 = new Set(账.map((r) => r.区));
    expect(覆盖.size, `落座只覆盖了 ${[...覆盖].join('、')} —— 七座区里漏了谁`).toBe(7);
  });

  it('反向控制：把落座换回旧口径（`sampleHeight`），同一把尺必须判它红', () => {
    const { world, 账 } = 建世界并记账({ 旧口径: true });
    let 最狠 = 0;
    for (const r of 账) {
      const 场 = world.getGroundHeight(r.中心.x + r.lx, r.中心.z + r.lz);
      最狠 = Math.max(最狠, Math.abs(r.y - 场));
    }
    expect(账.length, '旧口径下没记到落座 ⇒ 反向控制臂自己空转了').toBeGreaterThanOrEqual(500);
    expect(最狠, '旧口径与玩家脚下那张场居然读数一样 ⇒ 这把尺量不出差别').toBeGreaterThan(1);
  });
});

describe('③ 两阶段建区：构造器只构造，内容由 `build()` 建', () => {
  it('裸区：构造完是空的，`build()` 之后才有内容', () => {
    class 裸区 extends BaseZone {
      constructor() {
        super(makeScene(), { x: 0, z: 0 }, { info: { id: 'probe-zone' } });
      }
      build() {
        this.group.add(new THREE.Group());
      }
    }
    const 区 = new 裸区();
    expect(区.group.children.length, '构造器里就有内容 —— 两阶段被拆掉了').toBe(0);
    区.build();
    expect(区.group.children.length, '`build()` 之后仍然没有内容 —— 内容构建那一段没了').toBeGreaterThan(0);
  });

  it('真世界：七座区都建出了内容，且每一座区的 `groundYAt` 都等于玩家脚下那张场', () => {
    const { world } = 建世界并记账();
    expect(world.zones).toHaveLength(7);
    for (const zone of world.zones) {
      expect(zone.group.children.length, `区 ${zone.id} 在世界里一件东西都没有 —— 内容没建`).toBeGreaterThan(0);
      const 场 = world.getGroundHeight(zone.center.x + 12, zone.center.z - 7);
      expect(zone.groundYAt(12, -7), `区 ${zone.id} 没挂着地面问手（落座退回本区自己那一档了）`).toBe(场);
    }
  });
});

describe('④ 碰撞体与摆件同一组数字（B130 的账）', () => {
  it('与落座同点的碰撞体：底与顶都是那一次落座读数派生的', () => {
    const { world, 账 } = 建世界并记账();
    const 表 = new Map();
    for (const r of 账) {
      const k = `${r.区}|${r.lx.toFixed(4)}|${r.lz.toFixed(4)}`;
      if (!表.has(k)) 表.set(k, r.y);
    }
    let 同源 = 0;
    for (const zone of world.zones) {
      for (const c of zone.colliders ?? []) {
        const k = `${zone.id}|${c.x.toFixed(4)}|${c.z.toFixed(4)}`;
        const y = 表.get(k);
        if (y === undefined) continue; // "手写绝对 y"那一族（B136），不在本门禁口径内
        同源++;
        expect(c.base, `区 ${zone.id} 的碰撞体底 ${c.base} 与同点落座读数 ${y} 差得太远 —— 体与摆件不是同一组数字`)
          .toBeGreaterThan(y - 4);
        expect(c.base, `区 ${zone.id} 的碰撞体底 ${c.base} 高过同点落座读数 ${y} 太多 —— 体与摆件不是同一组数字`)
          .toBeLessThan(y + 1);
        expect(c.top, `区 ${zone.id} 的碰撞体顶 ${c.top} 低于同点落座读数 ${y} —— 体整个埋在地里`).toBeGreaterThanOrEqual(y);
      }
    }
    expect(同源, '一条碰撞体都没能与落座读数对上 —— 判据的口径漂了').toBeGreaterThan(300);
  });

  it('不许有悬空的墙：任何一条碰撞体的底都不许高过当地地面一个上坎', () => {
    const { world } = 建世界并记账();
    const 上坎 = playerStepUp();
    for (const zone of world.zones) {
      for (const c of zone.colliders ?? []) {
        const 场 = world.getGroundHeight(zone.center.x + c.x, zone.center.z + c.z);
        expect(
          c.base,
          `区 ${zone.id} 的碰撞体底 ${c.base} 高过当地地面 ${场} 超过一个上坎（${上坎}）—— 空气里有一道看不见的墙`
        ).toBeLessThanOrEqual(场 + 上坎);
      }
    }
  });

  it('反向控制：喂一条悬空的体，那条判据必须判它红', () => {
    const 上坎 = playerStepUp();
    const 场 = 10;
    const 判红 = (c) => c.base > 场 + 上坎;
    expect(判红({ base: 场 + 3, top: 场 + 5 }), '判据放过了悬空的体 ⇒ 这条腿在空转').toBe(true);
    expect(判红({ base: 场 - 0.5, top: 场 + 5 }), '判据把正常埋半米的体也判红了 ⇒ 容差取错了').toBe(false);
  });
});

describe('⑤ 落座与眼睛看得见的那张网格对齐', () => {
  it('每一次落座与可见的那张网格差不超过一个上坎（不许浮在皮上、不许埋在皮下）', () => {
    const { world, 账 } = 建世界并记账();
    const 上坎 = playerStepUp();
    let 最狠 = 0;
    for (const r of 账) {
      const wx = r.中心.x + r.lx;
      const wz = r.中心.z + r.lz;
      const 皮 = sampleGlobalHeight(wx, wz, world.zones, world.internalSpaceManager);
      const 差 = Math.abs(r.y - 皮);
      最狠 = Math.max(最狠, 差);
      expect(差, `区 ${r.区} 在本地 (${r.lx}, ${r.lz}) 的落座高度与可见网格差 ${差} 米`).toBeLessThanOrEqual(上坎);
    }
    expect(最狠, '一条落座都没量到 —— 这条腿在空转').toBeGreaterThan(0);
  });
});
