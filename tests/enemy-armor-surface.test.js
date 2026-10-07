/**
 * 敌人装甲板表面（W-C5 切片4）的门禁。
 *
 * ## 这一片交付了什么
 * 第四种烘焙表面 `plate`（0.5 米一铺、2×2 错缝装甲板，见 `content/materialSurfaces.js`）
 * 接到普通敌人**走 `mat` 的那些件**上：身体 / 盔 / 翼 / 肩甲 / 炮管 / 撞角。
 * 这些件此前用的是裸 three 几何（每面 0..1、逐索引均分的原生 UV），贴图挂上去只会被拉伸。
 * 所以先有一条**地基改动**：米制 UV 构造函数外提到 `engine/uvGeometry.js`（chunk-core 叶子，
 * 纯构造 —— `combat` 不能 import `world/dungeonAssets`，那会造出 chunk 环），
 * `dungeonAssets` 与 `Enemy` 各自的缓存与归属不动；敌人这边多一个
 * `makeUvCapsuleGeometry`（胶囊的 v 按剖面弧长）。
 *
 * ## 这里钉住的三层（坏法各不同）
 * 1. **构造函数本身**（不经过 Enemy.js）：u = 该行半径的周长（2πρ）、v = 剖面**弧长**（米）。
 *    最容易被写错的是 v —— three 原生 `uv.y` 是**索引均分**（34 个剖面行均分 0..1），
 *    直接乘总弧长当米用在圆柱段上偏 15 倍（1 米长的一格只摊到 0.068 米，砖在帽盖挤成一团）。
 *    反向对照：同一把尺量"索引均分 × 总弧长"必须红。
 * 2. **消费接线**（建真的 `Enemy`）：退路（库没就绪 / plate 没加载出来）时几何照样是米制 UV、
 *    材质回旧读数（roughness 0.75、无贴图）；贴图路径上材质挂着 `uvVariant('plate', 2, 2)`
 *    （repeat=2、roughness=1，贴图是唯一真源），且**材质每实例一份**（受击闪红改自家
 *    emissive，W-C2 口径不变）而纹理共享（GPU 只传一份）。
 * 3. **类型保持**：撞角走 `makeUvConeGeometry`（`ConeGeometry` 的壳）而不是包成
 *    `CylinderGeometry` —— `type` / `parameters` 原样，按 `type` 认锥体的地方不会看错。
 *
 * 与 `material-surfaces.test.js` 的分工：那边管"贴图本身对不对"（① 像素 / ② 读数 /
 * ③ 确定性 / ⑤ 副本接线），这里管"敌人的米制 UV 算得对不对、接得上不接得上"。
 *
 * ## 读数（r=0.4, len=1.0, cs=8, rs=16；探针 `.tmp-20261007/wc5s4-test-expectations.mjs`）
 * 578 顶点 = 17 环 × 34 剖面行；uMax = 2πr = 2.513274（精确）；圆柱段两端（y=∓0.5）v 差 = 1.0
 * 米（索引均分是 0.0684）；v 全域 ≈ [0, len+πr]，两极各差 1.4e-4 —— float32 位置量化
 * （y=±0.9 存不下，v 从位置反推就把这点误差带进来），所以全剖面范围按 3 位小数断言。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Enemy } from '../src/combat/Enemy.js';
import { TextureLibrary } from '../src/assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../src/content/materialSurfaces.js';
import { makeUvCapsuleGeometry } from '../src/engine/uvGeometry.js';
import { makeScene, makeWorld, installWindowShim } from './helpers/enemyHarness.js';

installWindowShim();

const R = 0.4, LEN = 1.0, CAP = 8, RAD = 16;
const TOTAL = LEN + Math.PI * R;
const 半 = LEN / 2;

/** 按行（y 取 4 位小数）分组：每行的 uMax / 实测半径 ρMax / v 极值 / 命中顶点数 */
function 行读数(g, range = null) {
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const 行 = new Map();
  const lo = range ? range.start : 0;
  const hi = range ? range.start + range.count : uv.count;
  for (let i = lo; i < hi; i++) {
    const vi = range ? g.index.getX(i) : i;
    const y = Math.round(pos.getY(vi) * 1e4) / 1e4;
    const rho = Math.hypot(pos.getX(vi), pos.getZ(vi));
    let r = 行.get(y);
    if (!r) { r = { uMax: 0, ρMax: 0, vMin: Infinity, vMax: -Infinity }; 行.set(y, r); }
    r.uMax = Math.max(r.uMax, uv.getX(vi));
    r.ρMax = Math.max(r.ρMax, rho);
    r.vMin = Math.min(r.vMin, uv.getY(vi));
    r.vMax = Math.max(r.vMax, uv.getY(vi));
  }
  return 行;
}

/** 同一把尺：胶囊圆柱段两端（y=∓半）的 v 差 —— 按弧长算必须恰好 = LEN */
function 圆柱段弧长差(g) {
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  let 底 = null, 顶 = null;
  for (let i = 0; i < uv.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(y + 半) < 1e-6) 底 = uv.getY(i);
    else if (Math.abs(y - 半) < 1e-6) 顶 = uv.getY(i);
  }
  if (底 === null || 顶 === null) throw new Error('找不到 y=∓半 的剖面行 —— 胶囊布局变了，这把尺失效');
  return { 底, 顶, 差: 顶 - 底 };
}

/** 不分段盒的六面 UV 尺寸表（面序 px/nx/py/ny/pz/nz，每面 4 顶点）—— 与 uvGeometry 互为见证 */
const 盒面期望 = (w, h, d) => [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];

/** 一枚不分段盒的逐面实测 u/v 上限（每面 4 顶点，与 uvGeometry 的顶点序约定对齐） */
function 逐面盒实测(geometry) {
  const uv = geometry.attributes.uv;
  if (uv.count !== 24) throw new Error(`逐面盒实测只接受 24 顶点的盒，拿到 ${uv.count}`);
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

const 盒件 = (root) => {
  const list = [];
  root.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'BoxGeometry') list.push(o);
  });
  return list;
};

const mk = (over = {}) => new Enemy(makeScene(), makeWorld(), {
  type: 'soldier', x: 0, z: 0, respawn: false, ...over,
});

describe('① 胶囊几何的米制 UV（直接量构造函数，不经过 Enemy.js）', () => {
  it('布局签名 + 类型/参数原样：578 顶点 = 17 环 × 34 剖面行', () => {
    const g = makeUvCapsuleGeometry(R, LEN, CAP, RAD);
    expect(g.type).toBe('CapsuleGeometry');
    expect(g.parameters).toMatchObject({ radius: R, length: LEN, capSegments: CAP, radialSegments: RAD });
    // 两条四分之一弧各 2×8+1=17 点 ⇒ 34 剖面行；radialSegments+1 = 17 环
    expect(g.attributes.uv.count, '顶点布局不是"17 环 × 34 行"了 —— 先看 three 的 CapsuleGeometry 是否改了剖面')
      .toBe((RAD + 1) * 2 * (2 * CAP + 1));
    expect(行读数(g).size).toBe(34);
  });

  it('u 按行半径的周长：逐行 uMax = 2πρ（ρ 从顶点位置独立量），圆柱行再对 2π·0.4', () => {
    const g = makeUvCapsuleGeometry(R, LEN, CAP, RAD);
    const 行 = 行读数(g);
    for (const [y, r] of 行) {
      const 期望 = 2 * Math.PI * r.ρMax;
      expect(r.uMax, `y=${y} 行 uMax=${r.uMax.toFixed(4)}，不是该行周长 2πρ=${期望.toFixed(4)}`)
        .toBeCloseTo(期望, 4);
    }
    // 圆柱段两行的 ρ 由构造参数（不是位置）独立给出 —— u 用成"底圈周长"或原生 0..1 都红在这
    for (const y of [-半, 半]) {
      expect(行.get(y).uMax, `y=${y} 圆柱行 uMax 不是 2πr`).toBeCloseTo(2 * Math.PI * R, 4);
    }
  });

  it('v 按剖面弧长：圆柱段两端（y=∓0.5）差 = 1.0 米；全域 ≈ [0, len+πr]、逐行单值、行间单调', () => {
    const g = makeUvCapsuleGeometry(R, LEN, CAP, RAD);
    const { 底, 顶, 差 } = 圆柱段弧长差(g);
    expect(差, `圆柱段 v 差=${差} —— 索引均分当米用会给出 ${(TOTAL / 33).toFixed(4)}（1 米对 0.068 米）`)
      .toBeCloseTo(LEN, 4);
    expect(底).toBeCloseTo((Math.PI / 2) * R, 4);
    expect(顶).toBeCloseTo((Math.PI / 2) * R + LEN, 4);

    const 行 = 行读数(g);
    const ys = [...行.keys()].sort((a, b) => a - b);
    // 两极（y≈∓0.9）：±1.4e-4 的偏差来自 float32 位置量化，按 3 位小数即可
    expect(行.get(ys[0]).vMax, '下极的 v 不是 ≈0').toBeCloseTo(0, 3);
    expect(行.get(ys[ys.length - 1]).vMin, '上极的 v 不是 ≈len+πr').toBeCloseTo(TOTAL, 3);
    // 逐行 v 单值（同一行 17 个环顶点 v 相同）、行间只增不减（弧长沿剖面单调）
    let 上 = -Infinity;
    for (const y of ys) {
      const r = 行.get(y);
      expect(r.vMax - r.vMin, `y=${y} 行的 v 在行内不一致`).toBeLessThan(1e-6);
      expect(r.vMin, `y=${y} 行的 v 没有比上一行更远`).toBeGreaterThanOrEqual(上);
      上 = r.vMax;
    }
  });

  it('反向对照：同一把尺量"索引均分 × 总弧长"必须红（否则这把尺没在量弧长）', () => {
    const naive = new THREE.CapsuleGeometry(R, LEN, CAP, RAD);
    const uv = naive.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * TOTAL);
    const 差 = 圆柱段弧长差(naive).差;
    expect(差, `索引均分差 ${差.toFixed(4)}，居然过了同一把尺`).toBeLessThan(LEN / 4);
  });
});

describe('② 消费接线：建真的敌人（退路与贴图两条路）', () => {
  it('退路（库没就绪 / plate 没加载出来）：几何照样是米制 UV，材质回到旧读数', () => {
    // 本用例在库加载前/后都可能执行：先抹掉 plate，两种顺序下都走退路（uvVariant 先看 set 在不在）
    const lib = TextureLibrary.loaded();
    if (lib) delete lib.sets.plate;

    const e = mk();
    const body = e.mesh.getObjectByName('body');
    expect(body.geometry.type).toBe('CapsuleGeometry');
    const uv = body.geometry.attributes.uv;
    let uMax = 0;
    for (let i = 0; i < uv.count; i++) uMax = Math.max(uMax, uv.getX(i));
    expect(uMax, `退路下身体 uMax=${uMax}，不是 2πr —— 几何换用没发生`).toBeCloseTo(2 * Math.PI * R, 3);
    expect(圆柱段弧长差(body.geometry).差, '退路下身体的 v 不是弧长 —— 几何换用没发生').toBeCloseTo(LEN, 4);
    expect(body.material.normalMap).toBe(null);
    expect(body.material.roughnessMap).toBe(null);
    expect(body.material.roughness, '无贴图时该回到旧读数 0.75').toBe(0.75);
    expect(body.material.color.getHex(), '颜色仍归类型自己的 color').toBe(0x553333);
  });

  it('贴图路径：材质挂 uvVariant(plate, 2, 2)（repeat=2、roughness=1）；纹理共享、材质每实例一份', async () => {
    const lib = await TextureLibrary.load();
    const dt = (bytes, v) => new THREE.DataTexture(new Uint8Array(bytes).fill(v), 4, 4);
    lib.sets.plate = { map: null, normalMap: dt(48, 130), roughnessMap: dt(16, 190), roughness: 1 };

    const a = mk();
    const b = mk();
    const bodyA = a.mesh.getObjectByName('body');
    const bodyB = b.mesh.getObjectByName('body');
    const 砖 = 1 / SURFACE_SPECS.plate.tileMeters;
    expect(砖, 'plate 一铺 0.5 米 —— 铺数 2 是派生量').toBe(2);
    const 变体 = lib.uvVariant('plate', 砖, 砖);

    expect(bodyA.material.normalMap, '身体没挂上 plate 法线（没问 uvVariant？）').toBe(变体.normalMap);
    expect(bodyA.material.roughnessMap, '身体没挂上 plate 粗糙度').toBe(变体.roughnessMap);
    expect(变体.normalMap.repeat.x, '铺数与 tileMeters 脱节').toBe(砖);
    expect(变体.normalMap.repeat.y).toBe(砖);
    expect(bodyA.material.roughness, '贴图在时 roughness 必须是 1（贴图是唯一真源）').toBe(1);
    expect(bodyA.material.normalScale.x).toBeCloseTo(0.8, 9);

    // 同一只敌人：mat 系的件共用这一份材质（受击闪红改的是它）
    expect(盒件(a.mesh)[0].material, '盔与身体该共用同一份材质').toBe(bodyA.material);
    // 每实例一份材质（闪红不能互串，W-C2 口径）；纹理是共享壳（GPU 只传一份）
    expect(bodyB.material, '两只敌人的材质该各归各的').not.toBe(bodyA.material);
    expect(bodyB.material.normalMap).toBe(bodyA.material.normalMap);
  });

  it('盒件（盔）：逐面 UV = 该面自己的尺寸（米）—— 全局 max 被同维盖住的那张脸也照得到', () => {
    const helm = 盒件(mk().mesh)[0];
    expect(helm, '士兵身上没找到盒件盔').toBeTruthy();
    const p = helm.geometry.parameters;
    expect(p).toMatchObject({ width: 0.5, height: 0.35, depth: 0.5 });
    const 实测面 = 逐面盒实测(helm.geometry);
    const 期望面 = 盒面期望(p.width, p.height, p.depth);
    for (let f = 0; f < 6; f++) {
      expect(实测面[f][0], `盔第 ${f} 面 uMax=${实测面[f][0]}，不是该面自己的尺寸`).toBeCloseTo(期望面[f][0], 4);
      expect(实测面[f][1], `盔第 ${f} 面 vMax=${实测面[f][1]}，不是该面自己的尺寸`).toBeCloseTo(期望面[f][1], 4);
    }
  });

  it('重兵撞角：类型保持 ConeGeometry、逐行 uMax = 2πr（r 按行高线性给）、锥尖行 uMax=0', () => {
    const e = mk({ type: 'juggernaut' });
    let ram = null;
    e.mesh.traverse((o) => {
      if (o.isMesh && o.geometry.type === 'ConeGeometry') ram = o;
    });
    expect(ram, '重兵身上没有锥件撞角').toBeTruthy();
    const g = ram.geometry;
    expect(g.parameters).toMatchObject({ radius: 0.26, height: 0.5, radialSegments: 6 });
    expect(ram.material, '撞角与前胸肩甲该共用同一份 mat').toBe(e.mesh.getObjectByName('body').material);

    const 行 = 行读数(g, g.groups[0]); // group 0 = 躯干；底盖（group 1）不参与米制换算
    expect(行.size, '躯干该有两行顶点（圆底 / 锥尖）').toBe(2);
    for (const [y, r] of 行) {
      const r行 = ((g.parameters.height / 2 - y) / g.parameters.height) * g.parameters.radius;
      expect(r.uMax, `y=${y} 行 uMax=${r.uMax.toFixed(4)}，不是该行周长 2π·${r行.toFixed(4)}=${(2 * Math.PI * r行).toFixed(4)}`)
        .toBeCloseTo(2 * Math.PI * r行, 3);
    }
    const 尖 = 行.get(0.25);
    expect(尖.uMax, '锥尖整行半径 0 ⇒ uMax 必须是 0（u 用常数底半径就红在这）').toBeCloseTo(0, 6);
    expect(尖.vMin, '锥尖的 v 不是高 0.5').toBeCloseTo(0.5, 6);
    expect(行.get(-0.25).vMax, '圆底行的 v 不是 0').toBeCloseTo(0, 6);
  });
});
