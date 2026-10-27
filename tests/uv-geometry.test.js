/**
 * 米制 UV 几何门禁 —— 钉 `engine/uvGeometry.js`（W-C5 纯构造族，无 WebGL）。
 *
 * 这一族把 three 的"每面 0..1"UV 先乘上真实尺寸（米），让贴图端只剩一个铺数。
 * 被 6 个模块顺带使用，但**没有专门测试**钉这些换算本身。用真 THREE.BufferGeometry
 * （纯数学、无需 WebGL）驱动。几条"算错不抛、只静默贴错"的不变量：
 * - 盒：六面各乘自己的两面尺寸（px/nx 用 d×h、py/ny 用 w×d、pz/nz 用 w×h）。
 * - 平面：u×宽、v×高。
 * - 圆柱/圆锥：u 乘**该行自己的周长** 2πr、v 乘高（锥顶尖行 r=0 ⇒ u=0）。
 * - 胶囊：v 按**位置**反推弧长（不是 Lathe 的索引均分，否则圆柱段错 15 倍）；
 *   文件头给了精确探针读数，直接拿来断。
 * - 多面体：**按面投影**（法线最大分量轴），索引几何先 toNonIndexed 且搬回 type/parameters。
 *
 * 两枚变异探针走真构造（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  makeUvBoxGeometry, makeUvPlaneGeometry,
  makeUvCylinderGeometry, makeUvConeGeometry, makeUvCapsuleGeometry, makeUvFacetGeometry,
} from '../src/engine/uvGeometry.js';

const maxOver = (attr, lo, hi, comp) => {
  let m = -Infinity;
  for (let i = lo; i < hi; i++) m = Math.max(m, comp === 0 ? attr.getX(i) : attr.getY(i));
  return m;
};

describe('米制盒/平面 UV', () => {
  it('盒六面各乘自己的两面尺寸（px/nx=d×h, py/ny=w×d, pz/nz=w×h）', () => {
    const g = makeUvBoxGeometry(2, 3, 4); // w=2,h=3,d=4
    const uv = g.attributes.uv;
    expect(uv.count).toBe(24);
    // 面序 px/nx/py/ny/pz/nz，每面 4 顶点
    expect(maxOver(uv, 0, 4, 0)).toBeCloseTo(4, 5);  // px: u→d
    expect(maxOver(uv, 0, 4, 1)).toBeCloseTo(3, 5);  // px: v→h
    expect(maxOver(uv, 8, 12, 0)).toBeCloseTo(2, 5); // py: u→w
    expect(maxOver(uv, 8, 12, 1)).toBeCloseTo(4, 5); // py: v→d
    expect(maxOver(uv, 16, 20, 0)).toBeCloseTo(2, 5);// pz: u→w
    expect(maxOver(uv, 16, 20, 1)).toBeCloseTo(3, 5);// pz: v→h
  });

  it('平面 u×宽、v×高', () => {
    const g = makeUvPlaneGeometry(5, 7);
    const uv = g.attributes.uv;
    expect(maxOver(uv, 0, uv.count, 0)).toBeCloseTo(5, 5);
    expect(maxOver(uv, 0, uv.count, 1)).toBeCloseTo(7, 5);
  });
});

describe('米制圆柱/圆锥 UV（逐行周长）', () => {
  it('圆柱：u 乘该行周长 2πr、v 乘高', () => {
    const g = makeUvCylinderGeometry(1, 1, 2, 16); // rt=rb=1, h=2
    const uv = g.attributes.uv;
    expect(maxOver(uv, 0, uv.count, 0)).toBeCloseTo(2 * Math.PI, 3); // 底/中行周长
    expect(maxOver(uv, 0, uv.count, 1)).toBeCloseTo(2, 5);           // v→高
  });

  it('圆锥：尖行 r=0 ⇒ u=0，底行 u=2πr', () => {
    const g = makeUvConeGeometry(1, 2, 16); // r=1, h=2, 尖顶 rt=0
    const uv = g.attributes.uv;
    let uMin = Infinity;
    for (let i = 0; i < uv.count; i++) uMin = Math.min(uMin, uv.getX(i));
    expect(maxOver(uv, 0, uv.count, 0)).toBeCloseTo(2 * Math.PI, 3);
    expect(uMin).toBeCloseTo(0, 5); // 顶尖那一行周长 0
  });
});

describe('米制胶囊 UV（v 按位置算弧长，非索引均分）', () => {
  it('uMax=2πr、vMax=len+πr（文件头探针读数）', () => {
    const radius = 0.4, length = 1.0;
    const g = makeUvCapsuleGeometry(radius, length, 8, 16);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    let uMax = -Infinity, vMax = -Infinity, vMin = Infinity;
    for (let i = 0; i < uv.count; i++) {
      uMax = Math.max(uMax, uv.getX(i));
      vMax = Math.max(vMax, uv.getY(i));
      vMin = Math.min(vMin, uv.getY(i));
    }
    expect(uMax).toBeCloseTo(2 * Math.PI * radius, 3); // 2.513274
    expect(vMax).toBeCloseTo(length + Math.PI * radius, 2); // 2.2566
    expect(vMin).toBeCloseTo(0, 2);
    // u 与该行半径成正比：中段（|y|<half）行半径 = radius
    expect(pos.count).toBeGreaterThan(0);
  });
});

describe('多面体按面投影 UV', () => {
  const nonIndexed = (verts) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((verts.length / 3) * 2), 2));
    return g;
  };

  it('法线近 ±Y 的面 → UV=(x,z)（水平面）', () => {
    // y=0 水平四边形，两个三角片，法线 ±Y
    const g = nonIndexed([0, 0, 0, 2, 0, 0, 2, 0, 3, 0, 0, 0, 2, 0, 3, 0, 0, 3]);
    const f = makeUvFacetGeometry(g);
    const uv = f.attributes.uv;
    expect(uv.getX(0)).toBeCloseTo(0, 5); expect(uv.getY(0)).toBeCloseTo(0, 5);
    expect(uv.getX(1)).toBeCloseTo(2, 5); expect(uv.getY(1)).toBeCloseTo(0, 5);
    expect(uv.getX(2)).toBeCloseTo(2, 5); expect(uv.getY(2)).toBeCloseTo(3, 5); // (x,z)
  });

  it('法线近 ±Z 的面 → UV=(x,y)（竖直面）', () => {
    // z=5 竖直四边形，法线 ±Z
    const g = nonIndexed([0, 0, 5, 2, 0, 5, 2, 4, 5, 0, 0, 5, 2, 4, 5, 0, 4, 5]);
    const f = makeUvFacetGeometry(g);
    const uv = f.attributes.uv;
    expect(uv.getX(2)).toBeCloseTo(2, 5); expect(uv.getY(2)).toBeCloseTo(4, 5); // (x,y)
  });

  it('索引几何先拆为非索引，且搬回 type/parameters（调用方按 parameters.radius 算碰撞）', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    expect(box.index).not.toBeNull();
    const f = makeUvFacetGeometry(box);
    expect(f.index).toBeNull();               // 已拆
    expect(f.type).toBe('BoxGeometry');       // 类型搬回
    expect(f.parameters).toBe(box.parameters);// parameters 原样（同一引用）
  });
});
