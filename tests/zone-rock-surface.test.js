/**
 * 五区外野岩/冰表面上贴的门禁（W-C5 切片10）。
 *
 * ## 这一片交付了什么
 * 第三种图案族 `craggy`（无格多面体噪声：fbm + 量化台阶）与它的两行规格 ——
 * `crag`（1 米一铺、6 级劈裂面，外野散石）与 `ice`（1.5 米一铺、不量化，太空位的冰）。
 * 接到五座区域的外野工件上：Abyss 24 块盒岩 / Gloom 20 块十二面体岩 / Void 20 块 /
 * Radiant 18 座沙岩锥 / Space 12 块十二面体岩 + 45 件冰（15 座冰晶 + 30 根冰刺），
 * 外加 `BaseZone.createRock`（灰白森林两处散石共用）。
 *
 * ## 为什么值得单独立一个门禁
 * 切片6 起"两段式上贴"已经有 `region-surface.test.js` 钉着，但那一条量的是**drum 三处石构**。
 * 这一片新添的坏法与前一片不同，而且都**不报错**：
 * - **表面接错**：把 crag 的变体贴到冰的材质上 —— 铺数与 roughness 都是合法值，只是不对。
 * - **UV 不是米**：多面体若走球面投影，投影本身合法，但 1 米一铺会随石头大小变；
 *   更糟的是球面的经线缝会切在劈裂面上（见 `makeUvFacetGeometry` 的文件头）。
 * - **共享退化成抄本**：每块石头各建一份材质/几何 —— 24 块石头 24 份 BufferGeometry，
 *   没人报错，只有显存与 draw call 在涨。
 * - **退路读数漂走**：`applySurfaces` 之前材质就该保持改前的常数（0.95 / 0.85 / 0.15）。
 *
 * ## 这里钉住的五层
 * ③ **两段式**（排在最前：`TextureLibrary` 是同文件单例，一旦 ready 这条支就无法复现）：
 *    `loaded()` 为空时构造 ⇒ 旧读数、无贴图；`applySurfaces(lib)` 之后同一份材质被上贴 ——
 *    这就是 `WorldManager.build()` → `load().then` 那条真缝。
 * ① **接线与上贴**（同步支）：五区的 crag / 冰的 ice 都拿到**自己那个表面**的变体
 *    （拿错表面也是红），roughness 置 1、normalScale 0.8，颜色与透明度原样不动。
 * ② **UV 以米计**：盒逐面 = 该面自己的尺寸；多面体逐三角形 = 该面投影的两个非主轴坐标；
 *    锥逐行 = 该行半径的周长、v = 高。反向对照：盒/锥量"裸几何 uMax = 1"；
 *    多面体量"裸几何过不了投影尺"（它的 UV 是球面投影，range 与米制同量级，分不出）。
 * ④ **共享与计数**：24 块盒岩共用一份几何一份材质；45 件冰共用一份材质；
 *    补挂幂等、`uvVariantCount` 不随补挂次数增长。
 * ⑤ **`makeUvFacetGeometry` 本体**：非索引化、type/parameters 保住、逐三角形按主轴投影。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AbyssZone } from '../src/world/zones/AbyssZone.js';
import { GloomZone } from '../src/world/zones/GloomZone.js';
import { VoidZone } from '../src/world/zones/VoidZone.js';
import { RadiantZone } from '../src/world/zones/RadiantZone.js';
import { SpaceZone } from '../src/world/zones/SpaceZone.js';
import { FantasyZone } from '../src/world/zones/FantasyZone.js';
import { TextureLibrary } from '../src/assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../src/content/materialSurfaces.js';
import { makeUvFacetGeometry, makeUvConeGeometry, makeUvBoxGeometry } from '../src/engine/uvGeometry.js';
import { paletteOf } from '../src/content/materialPalette.js';
import { applyRegionSurface } from '../src/world/regionSurfaces.js';

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });
const 假纹理 = (v) => new THREE.DataTexture(new Uint8Array(48).fill(v), 4, 4);

/** 给所有烘焙组假槽（判据取 URL 里的 `/gen/`，理由见 region-surface.test.js 的同名桩） */
const 装烘焙桩 = () => { TextureLibrary.prototype._loadSet = async function (def) {
  const set = { map: null, normalMap: null, roughnessMap: null, roughness: def.roughness ?? 0.85 };
  if (def?.normalMap?.[0]?.includes('/gen/')) {
    set.normalMap = 假纹理(130);
    set.roughnessMap = 假纹理(190);
  }
  return set;
}; };

// 构造器只构造（缺陷② 切片F，修 B134）：内容由 `build()` 建 —— 生产里这一段由
// `WorldManager` 在挂好地面问手之后调用，裸区在这里自己补上同一句。
const 建区 = (C, x = 0, z = 0) => {
  const zone = new C(makeScene(), { x, z }, makeDialog());
  zone.build();
  return zone;
};

/** 按表面名取本区登记过的材质（切片10 起一个区不止一种表面，下标会漂） */
function 本区表面(zone, surface) {
  const 命中 = zone._surfaceMats.filter((r) => r.surface === surface).map((r) => r.mat);
  expect(命中.length, `${zone.constructor.name} 没有登记 ${surface} 表面`).toBeGreaterThan(0);
  return 命中;
}

function 找材质网格(root, mat) {
  const out = [];
  root.traverse((o) => { if (o.isMesh && o.material === mat) out.push(o); });
  return out;
}

function uv范围(g) {
  const uv = g.attributes.uv;
  let uMax = -Infinity, vMax = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    uMax = Math.max(uMax, uv.getX(i));
    vMax = Math.max(vMax, uv.getY(i));
  }
  return { uMax, vMax };
}

/** 不分段盒的逐面 (u,v) 上限（面序 px/nx/py/ny/pz/nz，每面 4 顶点） */
function 逐面盒(g) {
  const uv = g.attributes.uv;
  const out = [];
  for (let f = 0; f < 6; f++) {
    let u = 0, v = 0;
    for (let i = f * 4; i < f * 4 + 4; i++) {
      u = Math.max(u, uv.getX(i));
      v = Math.max(v, uv.getY(i));
    }
    out.push([u, v]);
  }
  return out;
}

/** 锥/柱躯干逐行（group 0）uMax */
function 锥行实测(g) {
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const { start, count } = g.groups[0];
  const 行 = new Map();
  for (let i = start; i < start + count; i++) {
    const vi = g.index.getX(i);
    const y = Math.round(pos.getY(vi) * 1e4) / 1e4;
    行.set(y, Math.max(行.get(y) ?? 0, uv.getX(vi)));
  }
  return 行;
}

/**
 * 多面体按面投影的**独立复算**：对每个三角形重算法线、取最大分量轴，
 * 逐个顶点断言 (u,v) 就是另外两维的坐标。与 `逐面盒实测` 同一路子 ——
 * 测试端自己算一遍期望值，而不是把实现抄进来。
 */
function 逐面投影复核(g) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  expect(g.index, '按面投影要求非索引几何（顶点不能跨面共用）').toBe(null);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let 检查 = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const [eu, ev] = (ax >= ay && ax >= az) ? [pos.getZ(vi), pos.getY(vi)]
        : (ay >= az) ? [pos.getX(vi), pos.getZ(vi)]
          : [pos.getX(vi), pos.getY(vi)];
      expect(uv.getX(vi), `顶点 ${vi} 的 u 不是投影坐标`).toBeCloseTo(eu, 6);
      expect(uv.getY(vi), `顶点 ${vi} 的 v 不是投影坐标`).toBeCloseTo(ev, 6);
      检查++;
    }
  }
  expect(检查, '一个三角形都没复核到 —— 这把尺在量空气').toBeGreaterThan(0);
}

/** 同一把投影尺下，顶点违规的条数（不抛异常，只计数 —— 反向对照要用它量"裸几何不过尺"） */
function 投影违规数(g) {
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let 违规 = 0;
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const vi = i + k;
      const [eu, ev] = (ax >= ay && ax >= az) ? [pos.getZ(vi), pos.getY(vi)]
        : (ay >= az) ? [pos.getX(vi), pos.getZ(vi)]
          : [pos.getX(vi), pos.getY(vi)];
      if (Math.abs(uv.getX(vi) - eu) > 1e-6 || Math.abs(uv.getY(vi) - ev) > 1e-6) 违规++;
    }
  }
  return 违规;
}

describe('③ 两段式：世界先建好、贴图后到（必须最先跑）', () => {
  it('loaded() 为空时构造 ⇒ 旧读数无贴图；applySurfaces 后同一份材质被上贴', async () => {
    expect(TextureLibrary.loaded(), '本用例必须最先跑：单例一旦 ready 延迟支无法复现').toBe(null);
    const 真桩 = TextureLibrary.prototype._loadSet;
    装烘焙桩();
    try {
      const 旧读数 = { AbyssZone: 0.95, GloomZone: 0.95, VoidZone: 0.95, RadiantZone: 0.85 };
      const 区 = [AbyssZone, GloomZone, VoidZone, RadiantZone].map((C) => 建区(C));
      for (const zone of 区) {
        const mat = 本区表面(zone, 'crag')[0];
        expect(mat.normalMap, '库未就绪时不该凭空有法线图').toBe(null);
        expect(mat.roughness, `${zone.constructor.name} 未上贴时该是旧读数 ${旧读数[zone.constructor.name]}`)
          .toBe(旧读数[zone.constructor.name]);
      }
      // 冰：改前两处读数是 0.15 / 0.2，合成后统一取 0.15（见 SpaceZone.iceSurfaceMaterial）
      const space = 建区(SpaceZone);
      expect(本区表面(space, 'ice')[0].roughness).toBe(0.15);

      // —— 库到位：同一份材质被补挂（这就是 WorldManager.build() 的 load().then 那条缝）
      const lib = await TextureLibrary.load();
      const 铺 = 1 / SURFACE_SPECS.crag.tileMeters;
      const crag = lib.uvVariant('crag', 铺, 铺);
      for (const zone of 区) {
        const mat = 本区表面(zone, 'crag')[0];
        expect(zone.applySurfaces(lib), `${zone.constructor.name} 的补挂份数不对`)
          .toBe(zone._surfaceMats.length);
        expect(mat.normalMap, `${zone.constructor.name} 补挂没挂上`).toBe(crag.normalMap);
        expect(mat.roughness).toBe(1);
      }
      expect(space.applySurfaces(lib)).toBe(space._surfaceMats.length);
      expect(本区表面(space, 'ice')[0].roughness).toBe(1);
    } finally { TextureLibrary.prototype._loadSet = 真桩; }
  });
});

describe('① 五区外野岩/冰的接线与上贴（库已就绪时的同步支）', () => {
  it('crag / ice 各拿到自己那个表面的变体，颜色与透明度不动', () => {
    const lib = TextureLibrary.loaded();
    expect(lib, '③ 没把库加载好？顺序被人动了').not.toBe(null);
    const crag = lib.uvVariant('crag', 1 / SURFACE_SPECS.crag.tileMeters, 1 / SURFACE_SPECS.crag.tileMeters);
    const ice = lib.uvVariant('ice', 1 / SURFACE_SPECS.ice.tileMeters, 1 / SURFACE_SPECS.ice.tileMeters);

    for (const C of [AbyssZone, GloomZone, VoidZone, RadiantZone]) {
      const zone = 建区(C);
      const mat = 本区表面(zone, 'crag')[0];
      expect(mat.normalMap, `${zone.constructor.name} 的 crag 没挂上法线图`).toBe(crag.normalMap);
      expect(mat.roughnessMap).toBe(crag.roughnessMap);
      expect(mat.roughness, '贴图在时 roughness 必须是 1（贴图是唯一真源）').toBe(1);
      expect(mat.normalScale.x).toBe(0.8);
      expect(找材质网格(zone.group, mat).length, `${zone.constructor.name} 一份 crag 材质都没挂到网格上`)
        .toBeGreaterThan(0);
    }

    // 冰：15 座冰晶 + 30 根冰刺共用同一份材质，且拿到的是 ice 而不是 crag
    const space = 建区(SpaceZone);
    const 冰 = 本区表面(space, 'ice')[0];
    expect(冰.normalMap, '冰面没挂上贴图').toBe(ice.normalMap);
    expect(冰.normalMap, '冰面挂成了 crag —— 表面接错').not.toBe(crag.normalMap);
    expect(冰.roughness).toBe(1);
    expect(冰.transparent, '冰还是半透明的（表面事实不改变透明度）').toBe(true);
    expect(冰.color.getHex(), '冰的颜色该仍是 crystal.ice 那一格').toBe(paletteOf('crystal.ice'));
    expect(找材质网格(space.group, 冰).length, '冰的网格数不是 45').toBe(45);
    expect(本区表面(space, 'crag')[0].normalMap, '同一区的散岩该拿 crag').toBe(crag.normalMap);
  });
});

describe('② UV 以米计：三类几何各量各的', () => {
  it('盒岩逐面 = 该面自己的尺寸；裸盒量出 0..1', () => {
    const g = makeUvBoxGeometry(1.5, 2, 1.5);
    // three 的盒面序 px/nx/py/ny/pz/nz，每面 (u,v) = 该面自己的两个尺寸
    expect(逐面盒(g)).toEqual([[1.5, 2], [1.5, 2], [1.5, 1.5], [1.5, 1.5], [1.5, 2], [1.5, 2]]);
    const 裸 = uv范围(new THREE.BoxGeometry(1.5, 2, 1.5));
    expect(裸.uMax, '裸盒 uMax 不是 1 —— 这把尺量不出"米"与"0..1"之别').toBeCloseTo(1, 6);
  });

  it('十二面体逐三角形 = 该面投影的两个非主轴坐标；裸十二面体不是这套坐标', () => {
    const r = 1.3;
    const g = makeUvFacetGeometry(new THREE.DodecahedronGeometry(r, 0));
    逐面投影复核(g);
    const { uMax, vMax } = uv范围(g);
    expect(Math.abs(uMax), `uMax ${uMax} 超出半径`).toBeLessThanOrEqual(r + 1e-6);
    expect(Math.abs(vMax), `vMax ${vMax} 超出半径`).toBeLessThanOrEqual(r + 1e-6);
    // 反向对照：裸十二面体不是这套坐标 —— three 给多面体的是球面投影
    // （u = 方位角/2π+0.5），跨经线缝的顶点还被 correctSeam +1（uMax 1.125 略过 1）。
    // 这里**不能**拿 range 当尺：米制投影的 uMax ≈ 1.2144，与 1.125 同量级、同小于 r，
    // range 分不出两者。能分出的是投影规则本身 —— 裸的 108 个顶点全违规。
    expect(投影违规数(new THREE.DodecahedronGeometry(r, 0)),
      '裸十二面体居然过了投影尺 —— 这把尺量不出"米"与"球面"之别').toBeGreaterThan(0);
  });

  it('锥岩逐行 = 该行半径的周长、v = 高；裸锥量出 0..1', () => {
    const g = makeUvConeGeometry(1.7, 4.2, 6);
    const p = g.parameters;
    const { uMax, vMax } = uv范围(g);
    expect(uMax, '锥的 uMax 不是绕底圈的米数 2π·1.7').toBeCloseTo(2 * Math.PI * 1.7, 3);
    expect(vMax, '锥的 vMax 不是高 4.2').toBeCloseTo(4.2, 3);
    for (const [y, u] of 锥行实测(g)) {
      const r = (p.height / 2 - y) / p.height * p.radius;
      expect(u, `y=${y} 行 uMax=${u.toFixed(4)} ≠ 2π·${r.toFixed(4)}`).toBeCloseTo(2 * Math.PI * r, 3);
    }
    const 裸 = uv范围(new THREE.ConeGeometry(1.7, 4.2, 6));
    expect(裸.uMax, '裸锥 uMax 居然不是 1').toBeCloseTo(1, 6);
  });
});

describe('④ 共享与计数', () => {
  it('24 块盒岩共用一份几何一份材质；45 件冰共用一份材质；补挂幂等', () => {
    const lib = TextureLibrary.loaded();
    const abyss = 建区(AbyssZone);
    const mat = 本区表面(abyss, 'crag')[0];
    const 岩 = 找材质网格(abyss.group, mat);
    expect(岩.length, 'AbyssZone 外野不是 24 块岩 —— 这条用例没量到全部散石').toBe(24);
    expect(new Set(岩.map((m) => m.geometry)).size,
      '24 块一模一样的盒岩建了多份几何 —— 每块一份 BufferGeometry').toBe(1);

    const space = 建区(SpaceZone);
    const 冰 = 本区表面(space, 'ice')[0];
    expect(找材质网格(space.group, 冰).length, '冰的网格数不是 45').toBe(45);

    const 前 = lib.uvVariantCount();
    abyss.applySurfaces(lib);
    space.applySurfaces(lib);
    expect(lib.uvVariantCount(), '补挂又建了新变体 —— uvVariant 缓存没生效').toBe(前);
    expect(本区表面(abyss, 'crag')[0].normalMap).toBe(lib.uvVariant('crag', 1, 1).normalMap);
  });

  it('createRock 的石头共享一份材质（一座区几十块石头不该有几十份材质）', () => {
    const fantasy = 建区(FantasyZone);
    const 石 = 本区表面(fantasy, 'crag');
    expect(石.length, 'createRock 每调一次就登记一份材质 —— 共享没发生').toBe(1);
    expect(找材质网格(fantasy.group, 石[0]).length, '共享材质没挂到石头上').toBeGreaterThan(1);
    // 同时 drum 那一份（废墟断柱）仍是独立登记、互不干扰
    expect(本区表面(fantasy, 'drum').length).toBe(1);
  });
});

describe('⑤ makeUvFacetGeometry 本体', () => {
  it('拆成非索引、type/parameters 保住、逐三角形按主轴投影', () => {
    const 原 = new THREE.DodecahedronGeometry(1.25, 0);
    // three 的 PolyhedronGeometry 本来就是非索引的（108 = 12 面 × 3 三角片 × 3）；
    // 进索引几何时先拆 —— 用 BoxGeometry（36 索引 / 24 顶点）走那条支
    expect(原.index, '十二面体本就是非索引的 —— 这条前置事实变了，下面的括号要注意').toBe(null);
    const g = makeUvFacetGeometry(原);
    expect(g.index).toBe(null);
    expect(g.type, 'type 丢了 —— 别处按 type 认几何').toBe('DodecahedronGeometry');
    expect(g.parameters?.radius, 'parameters 丢了 —— 调用方靠它算碰撞体').toBe(1.25);
    expect(g.attributes.position.count, '顶点数不该因本函数变化（本来就非索引）').toBe(原.attributes.position.count);
    逐面投影复核(g);

    const 盒 = makeUvFacetGeometry(new THREE.BoxGeometry(2, 1, 1));
    expect(盒.index, '索引几何没被拆成非索引').toBe(null);
    expect(盒.type).toBe('BoxGeometry');
    expect(盒.attributes.position.count, '盒该有 36 个非索引顶点（12 三角片 × 3）').toBe(36);
    逐面投影复核(盒);
  });

  it('未知表面名当场抛（接线错误不该静默变成"这次没贴图"）', () => {
    const lib = TextureLibrary.loaded();
    expect(() => applyRegionSurface(new THREE.MeshStandardMaterial(), lib, 'ghost'))
      .toThrow(/未知的表面/);
    // 反向：已知表面名且库在手 ⇒ 不该抛
    expect(() => applyRegionSurface(new THREE.MeshStandardMaterial(), lib, 'crag')).not.toThrow();
  });
});
