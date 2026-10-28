/**
 * 世界装饰合批的门禁（W-C2 切片2）。
 *
 * ## 修前是什么样子
 *
 * `_scatterTrees` 每棵树两份**随机参数**几何 + 一份随机颜色材质；`_scatterRocks` 80 块石头
 * 80 份几何；`_buildRuinClusters` 48 根断柱 48 份几何；路灯、长椅、幡、摊位同理 ——
 * 全部每实例新建。真实页面 558 个 draw call 里，装饰占的是"看得见几棵树就几百个调用"。
 *
 * ## 这一片改成了什么
 *
 * 同形的东西只剩一份几何：树 = 单位树干 + 单位树冠两个 InstancedMesh（随机高矮胖瘦走
 * 每实例矩阵、随机叶色走 instanceColor）；石头/断柱同理"单位几何 + 矩阵缩放"。
 * 整张装饰层从 ~800 个网格塌缩到 11 个 InstancedMesh + 16 个独立网格（门拱、喷泉）。
 *
 * ## 为什么要播种 Math.random
 *
 * 建多少棵树、几块石头落在出生点 exclusion 里被跳过，全是 `Math.random` 决定的 ——
 * 不播种，连"树干与树冠实例数一致"这种断言都没法稳定写。LCG 替身让整次 build 可复现。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { WorldDecorations } from '../src/world/WorldDecorations.js';
import { WINDING_ROUTES } from '../src/content/windingRoutes.js';
import { CollisionWorld } from '../src/engine/Collision.js';

/** 线性同余替换 Math.random：同一种子同序列，build 结果可复现 */
function seedRandom(seed = 42) {
  let s = seed >>> 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  });
}

/**
 * 替身世界。**碰撞世界是真的**（`CollisionWorld`）：切片B 起装饰层边摆边登记障碍，
 * 一个 `collision: null` 的替身会让 build 当场抛 —— 那不是这一片要测的事，而是替身
 * 少给了一件生产一定给的东西。判据在 `tests/decoration-collider-coverage.test.js`。
 */
const makeWorld = () => ({ getGroundHeight: () => 0, collision: new CollisionWorld(16) });

function buildDecorations() {
  const restore = seedRandom();
  try {
    const scene = new THREE.Scene();
    const deco = new WorldDecorations(scene, makeWorld());
    deco.build();
    return deco;
  } finally {
    restore.mockRestore();
  }
}

/** 装饰层里的全部对象，按是否合批分组 */
function inventory(deco) {
  const instanced = [];
  const plain = [];
  deco.group.traverse((o) => {
    if (o.isInstancedMesh) instanced.push(o);
    else if (o.isMesh) plain.push(o);
  });
  return { instanced, plain };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('装饰层合批（W-C2 切片2）', () => {
  it('树 = 树干/树冠两个 InstancedMesh，实例数一致、约 300 棵', () => {
    const deco = buildDecorations();
    const { instanced } = inventory(deco);
    // 按**族名**认领，不按几何类型：切片H 给幡补了幡杆（也是 CylinderGeometry），
    // 按类型认领会撞上两个候选 —— 认谁全看 children 的顺序，那是巧合不是契约。
    const trunks = instanced.find((m) => m.name === 'wildTreeTrunk');
    const foliage = instanced.find((m) => m.name === 'wildTreeCrown');
    expect(trunks, '树干合批网格不见了').toBeTruthy();
    expect(foliage, '树冠合批网格不见了').toBeTruthy();
    // 9 环/线共 301 个点位，出生点 exclusion 只跳过零星几棵
    expect(trunks.count).toBe(foliage.count);
    expect(trunks.count).toBeGreaterThanOrEqual(280);
    expect(trunks.count).toBeLessThanOrEqual(301);
  });

  it('石 80 / 灯 逐辐条现推 / 幡 8 / 摊 6 对 / 椅 10 / 柱 48 / 晶 6 —— 实例数一个不少', () => {
    const deco = buildDecorations();
    const { instanced } = inventory(deco);
    const sumOf = (type) => instanced.filter((m) => m.geometry.type === type).reduce((a, m) => a + m.count, 0);
    // 石头有出生点 exclusion（修前修后同一规则），只可能是 [70, 80] 区间
    const rocks = instanced.find((m) => m.geometry.type === 'DodecahedronGeometry');
    expect(rocks.count).toBeGreaterThanOrEqual(70);
    expect(rocks.count).toBeLessThanOrEqual(80);
    /**
     * 灯罩数**从 `WINDING_ROUTES` 现推**（点位取法与 `WorldDecorations._buildPathLanterns` 同一条：
     * 非环辐条的奇数位折点）。这一格原本写死 20 = 5 条辐条 × 4，而 W-E3 切片33 把辐条补到 7 条
     * ⇒ 全量套件红在这条与那片毫无关系的腿上（读到 28 对 20）。抄一个从表里数得出来的数，
     * 表一变就是一次假红 —— 与 B134 / B136 / B143 / B150 同一族，只是这次抄在测试里。
     */
    const 灯位 = [];
    for (const r of WINDING_ROUTES) {
      if (r.id === 'hub-ring') continue;
      const p = r.points;
      for (let i = 1; i < p.length - 1; i += 2) 灯位.push(p[i]);
    }
    expect(灯位.length, '反向控制：点位表自己数出来是 0 ⇒ 这条腿在空跑').toBeGreaterThan(0);
    expect(sumOf('SphereGeometry'), `灯罩 ${灯位.length} 盏（辐条 ${WINDING_ROUTES.filter((r) => r.id !== 'hub-ring').length} 条）`).toBe(灯位.length);
    expect(sumOf('PlaneGeometry')).toBe(8);              // 幡
    expect(sumOf('BoxGeometry')).toBe(70);               // 摊底6 + 雨棚6 + 长椅10 + 断柱48
    expect(sumOf('OctahedronGeometry')).toBe(6);         // 野生生物水晶
    // 幡杆（切片H 补上的那一族）：也是 CylinderGeometry，8 根 —— 一个不少
    const poles = instanced.find((m) => m.name === 'hubBannerPole');
    expect(poles, '幡杆合批网格不见了').toBeTruthy();
    expect(poles.count).toBe(8);
    // 灯柱与灯罩必须同数（同一份点位表落两个合批网格；只涨一个就是"柱子有、灯头没了"）
    const posts = instanced.find((m) => m.name === 'pathLanternPost');
    const lamps = instanced.find((m) => m.name === 'pathLanternLamp');
    expect(posts, '灯柱合批网格不见了').toBeTruthy();
    expect(lamps, '灯罩合批网格不见了').toBeTruthy();
    expect(posts.count, '灯柱与灯罩不同数').toBe(lamps.count);
  });

  it('整层只剩 12 个合批网格 + 16 个独立网格（门拱/喷泉），几何 15 份（上限 20）', () => {
    const deco = buildDecorations();
    const { instanced, plain } = inventory(deco);
    // 12 = 树干/树冠/石/灯柱/灯罩/幡/幡杆/摊底/雨棚/长椅/断柱/水晶
    // （幡杆是切片H 补上的那一族 —— 它也是合批的，8 根共用一份几何）
    expect(instanced).toHaveLength(12);
    expect(plain).toHaveLength(16);                      // 5 座门拱 × 3 + 喷泉
    const geos = new Set();
    deco.group.traverse((o) => {
      if (o.geometry) geos.add(o.geometry);
    });
    // 修前是 800+ 份（每棵树/每块石/每根柱一份）；合批后同形只剩一份
    expect(geos.size).toBeLessThanOrEqual(20);
  });

  it('随机形状进了矩阵、随机颜色进了 instanceColor —— 不再每实例建几何/材质', () => {
    const deco = buildDecorations();
    const { instanced } = inventory(deco);
    const foliage = instanced.find((m) => m.geometry.type === 'ConeGeometry');
    // 叶色：最多 4 种（leafColors 表），不可能是"每棵树一份材质"
    const seen = new Set();
    for (let i = 0; i < foliage.count; i++) {
      seen.add(foliage.instanceColor.getX(i) + ',' + foliage.instanceColor.getY(i));
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(seen.size).toBeLessThanOrEqual(4);
    // 树高随机的证据：同一合批网格里实例矩阵的 y 缩放各不相同（元素[5] = y 缩放）
    const heights = new Set();
    const m = new THREE.Matrix4();
    for (let i = 0; i < foliage.count; i++) {
      foliage.getMatrixAt(i, m);
      heights.add(m.elements[5]);
    }
    expect(heights.size).toBeGreaterThan(10);
  });

  it('每个合批网格都算了整群包围球 —— 不算的话视锥会拿几何小球把整群裁掉', () => {
    const deco = buildDecorations();
    const { instanced } = inventory(deco);
    for (const m of instanced) {
      expect(m.boundingSphere, `${m.geometry.type} 没算包围球`).not.toBeNull();
    }
    const trunks = instanced.find((m) => m.name === 'wildTreeTrunk');
    // 树撒在 520×620 米的地图上，整群包围球必须盖住这个尺度
    expect(trunks.boundingSphere.radius).toBeGreaterThan(100);
  });

  it('阴影类别没丢：树/柱 castOnly、石 prop、长椅 castOnly', () => {
    const deco = buildDecorations();
    const { instanced } = inventory(deco);
    const trunks = instanced.find((m) => m.name === 'wildTreeTrunk');
    const rocks = instanced.find((m) => m.name === 'wildRock');
    const columns = instanced.find((m) => m.count === 48 && m.geometry.type === 'BoxGeometry');
    expect(trunks.castShadow && !trunks.receiveShadow).toBe(true);
    expect(rocks.castShadow && rocks.receiveShadow).toBe(true);
    expect(columns.castShadow && !columns.receiveShadow).toBe(true);
  });

  it('树干合批网格就在 `_treeTrunk` 上 —— applyTreeTextures 换材质的入口没断', () => {
    const deco = buildDecorations();
    const { instanced } = inventory(deco);
    const trunks = instanced.find((m) => m.geometry.type === 'CylinderGeometry');
    expect(deco._treeTrunk).toBe(trunks);
  });
});
