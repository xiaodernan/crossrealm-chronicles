/**
 * 装饰件要站在自己那块地上（玩家可见缺陷② · 切片A：落脚点）。
 *
 * ## 这一片补的是什么
 *
 * 行走穿模实测有两笔账，这一片只修第一笔：
 *
 * - **① 看不见 ⇒ 撞不上**（本切片）：枢纽那一圈（八面幡 / 六个摊底 / 六片雨棚 / 十条长椅 /
 *   一座泉池）以前**整圈共用一次 `getGroundHeight(0, 55)`**。hub 中心实测 4.74 m，而它们站的
 *   10~18 m 那一圈地面是 12.46~18.14 m ⇒ 顶面低于当地地面 2.8~13.6 m。玩家既看不见这个集市，
 *   也就谈不上"走过去被挡住"。五座门拱按**拱中心一个采样**落座，跨坡那一侧的柱脚悬空
 *   （钉死布局实测最高 0.60 m）。
 * - **② 挡身体的件没有碰撞体**（切片B）：钉死布局实测 482 件挡得住玩家身体的装饰实例里
 *   **445 件零覆盖**。这一片不动它 —— 落脚点与登记是两种死法，别塞进同一条判据。
 *
 * ## 四条判据各有一种死法
 *
 * 1. **钉子是钉子**：同种子逐位相同、异种子不同。不钉，下面三条读的就是运气
 *    （树的散布、断柱的长宽高都是未播种的 `Math.random()`，与 B125 同口径）。
 * 2. **没有任何一件装饰整个埋在自己脚下的地面以下** —— 按**身份**豁免泉池，且豁免自带
 *    够得着的证据：它现在确实还埋着，读数写进断言。hub 广场 30 m 盘内起伏实测 20.11 m，
 *    一圈直径 6 米的扁平环带怎么坐都有一边埋着；那笔账在 #178C（广场整平），整平那天
 *    这一条会红着提醒删行。
 * 3. **替身坡地**（不读真地形，钉的是机制本身）：枢纽四族每件相对**自己脚下地面**的高差
 *    全等，且整族绝对高度不再一模一样 —— 整圈共用一次采样的旧写法同时违反这两半。
 *    线性坡 `gy=0.3x+0.2z` 钉"各问各的"（五点中点在纯线性坡上恰好等于中心值）；
 *    凸坡 `gy=0.01x²` 再钉一层"取的是中点，不是最高点/最低点"—— 后两种写法的高差会随
 *    摆件的 x 漂出**米**级散差，而中点写法给出与位置无关的常数。
 * 4. **门拱的每根柱脚都埋进自己那块地**：替身斜坡与钉死真世界各一把（悬空 0.6 m 的柱脚
 *    是玩家看得见的美术事故，而它不体现在"整件埋没"里，所以第 2 条盖不住它）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { CollisionWorld } from '../src/engine/Collision.js';
import { buildSeededWorld, buildSeededDecorations } from './helpers/seededWorld.js';
import { installWindowShim } from './helpers/enemyHarness.js';

beforeAll(() => {
  installWindowShim();
});

const 世界种子 = 7;
const 摆件种子 = 8;

/**
 * 第 2 条的身份豁免：仍埋着的件，等 #178C 广场整平后删行。
 * `埋到_` 是这条债务**当前的深度下限**（钉死布局实测泉池顶面 −1.47 m）：
 * 再深过它就不是"广场起伏"，而是落脚点又退回了整圈共用一次采样。
 */
const 整平债务 = [{ 名: 'hubFountain', 埋到: -2 }];

/** 第 3 条要逐族验的枢纽四族（按 `.name` 认领，不按位置序号） */
const 枢纽四族 = ['hubBanner', 'hubStallBase', 'hubStallAwning', 'hubBench'];

let world = null;
let deco = null;

afterAll(() => {
  deco?.dispose();
  deco = null;
  world?.dispose?.();
  world = null;
});

const _im = new THREE.Matrix4();
const _组合 = new THREE.Matrix4();

/**
 * 把装饰层摊成"每一件的世界 AABB + 身份名"。
 *
 * 合批一族的世界位置藏在**实例矩阵**里（父群本地空间），门拱一族挂在子 Group 下 ——
 * 两种都要换算到世界空间，且几何盒要先算好。用几何自身的 boundingBox 而不是猜
 * "半径/半高"，是因为幡是竖着的平面、泉池是躺着的环：按几何类型推朝向迟早会推错一个族。
 */
function 摊开(layer) {
  layer.group.updateMatrixWorld(true);
  const out = [];
  const 收 = (mesh, 世界矩阵, 名) => {
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    out.push({ 名, 盒: geo.boundingBox.clone().applyMatrix4(世界矩阵) });
  };
  for (const child of layer.group.children) {
    if (child.isInstancedMesh) {
      const 名 = child.name || `未名:${child.geometry.type}`;
      for (let i = 0; i < child.count; i++) {
        child.getMatrixAt(i, _im);
        收(child, _组合.clone().multiplyMatrices(child.matrixWorld, _im), 名);
      }
    } else if (child.isGroup) {
      const 名 = `${child.name || '未名Group'}`;
      for (const m of child.children) if (m.isMesh) 收(m, m.matrixWorld.clone(), 名);
    } else if (child.isMesh) {
      收(child, child.matrixWorld.clone(), child.name || `未名:${child.geometry.type}`);
    }
  }
  return out;
}

/** 世界 AABB 的中心脚下的地面 */
function 当地地面(g, 件) {
  return g.getGroundHeight((件.盒.min.x + 件.盒.max.x) / 2, (件.盒.min.z + 件.盒.max.z) / 2);
}

/** 顶面相对于自己脚下地面的高度：负数 = 整件埋在地底下，玩家看不见 */
function 顶出地面(g, 件) {
  return 件.盒.max.y - 当地地面(g, 件);
}

/** 实例身份 + 世界盒八角的散列：布局漂了就必然不同 */
function 布局指纹(件们) {
  let h = 0x811c9dc5;
  for (const 件 of 件们) {
    const b = 件.盒;
    const 串 = `${件.名}|${b.min.x.toFixed(3)}|${b.min.y.toFixed(3)}|${b.min.z.toFixed(3)}|${b.max.x.toFixed(3)}|${b.max.y.toFixed(3)}|${b.max.z.toFixed(3)}`;
    for (let i = 0; i < 串.length; i += 1) {
      h ^= 串.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h;
}

/** 线性坡：gy = 0.3x + 0.2z。"周围 5 点取中点"在这种坡上**恰好等于中心值** */
function 斜坡世界(kx = 0.3, kz = 0.2) {
  const scene = new THREE.Scene();
  return { scene, collision: new CollisionWorld(16), getGroundHeight: (x, z) => kx * x + kz * z };
}

/**
 * 凸坡：gy = 0.01x²。这一把专治"取中点还是取最高/最低"：
 * 对称五点在凸面上取中点 = 中心值 + k·r²（与摆在坡上哪一处无关），
 * 而取最高点 = k(2xr + r²)、取最低点 = k(−2xr + r²) —— 都随 x 漂，
 * 于是"高差全等"这一半当场把 min/max 两种写法抓出来。线性坡抓不到（三种写法都给出常数）。
 */
function 凸坡世界(k = 0.01) {
  const scene = new THREE.Scene();
  return { scene, collision: new CollisionWorld(16), getGroundHeight: (x) => k * x * x };
}

function 准备() {
  if (!world) {
    world = buildSeededWorld(世界种子);
    deco = buildSeededDecorations(world, 摆件种子);
  }
  return { world, deco };
}

describe('① 钉子是钉子：装饰层的布局由种子说了算', () => {
  it('同一颗种子两次摆出的实例逐位相同', () => {
    const { world: w } = 准备();
    const a = 摊开(buildSeededDecorations(w, 摆件种子));
    const b = 摊开(buildSeededDecorations(w, 摆件种子));
    expect(布局指纹(a), '同种子摆出两份不同布局 ⇒ 随机源没有钉住').toBe(布局指纹(b));
    expect(a.length).toBeGreaterThan(0);
  });

  it('不同种子摆出不同布局（否则上面那条钉的是空气）', () => {
    const { world: w } = 准备();
    const a = 摊开(buildSeededDecorations(w, 摆件种子));
    const b = 摊开(buildSeededDecorations(w, 摆件种子 + 1));
    expect(布局指纹(a)).not.toBe(布局指纹(b));
  });

  it('分母：这一层真的摆出了东西（不是一句空转的全称判据）', () => {
    const { deco: d } = 准备();
    const 件们 = 摊开(d);
    const 名字们 = new Set(件们.map((件) => 件.名));
    expect(件们.length, '装饰实例总数下穿').toBeGreaterThanOrEqual(800);
    for (const 族 of 枢纽四族.concat(整平债务.map((债务) => 债务.名), 'zoneGate')) {
      expect([...名字们], `一族也没扫到 ⇒ 认领身份的 .name 断了`).toContain(族);
    }
    const 有名字的 = 件们.filter((件) => !件.名.startsWith('未名')).length;
    expect(有名字的, '有名身份只占零头 ⇒ 绝大多数族还在靠位置认领').toBeGreaterThanOrEqual(31);
  });
});

describe('② 真世界（钉死布局）：没有任何一件装饰整个埋在自己脚下', () => {
  it('埋没清单为空（豁免项另有条目自证）', () => {
    const { world: w, deco: d } = 准备();
    const 埋没 = 摊开(d)
      .map((件) => ({ 件, 露出: 顶出地面(w, 件) }))
      .filter((r) => r.露出 < 0)
      .sort((a, b) => a.露出 - b.露出);
    const 豁免名 = new Set(整平债务.map((债务) => 债务.名));
    const 意外 = 埋没.filter((r) => !豁免名.has(r.件.名));
    const 点名 = 埋没
      .slice(0, 8)
      .map((r) => `  ${r.件.名} 顶面低于地面 ${r.露出.toFixed(2)} m @(${((r.件.盒.min.x + r.件.盒.max.x) / 2).toFixed(1)},${((r.件.盒.min.z + r.件.盒.max.z) / 2).toFixed(1)})`)
      .join('\n');
    expect(意外, `这些摆件整个埋在地底下（玩家看不见，也撞不上）：\n${点名 || '  （无）'}`).toEqual([]);
  });

  it('豁免自带证据：债务项确实还埋着、且只埋到登记的深度（#178C 广场整平后请删这一行）', () => {
    const { world: w, deco: d } = 准备();
    const 件们 = 摊开(d);
    for (const 债务 of 整平债务) {
      const 这一族 = 件们.filter((件) => 件.名 === 债务.名);
      expect(这一族.length, `债务项 ${债务.名} 已经不在装饰层里了 ⇒ 这行豁免该删`).toBeGreaterThan(0);
      const 露出最多 = Math.max(...这一族.map((件) => 顶出地面(w, 件)));
      expect(露出最多, `债务项 ${债务.名} 的顶面已露出地面 ${露出最多.toFixed(2)} m ⇒ 广场已整平，删掉这行豁免`).toBeLessThan(0);
      expect(露出最多, `债务项 ${债务.名} 埋得比登记的 ${债务.埋到} m 还深（顶面 ${露出最多.toFixed(2)} m）⇒ 落脚点不再是按整圈起伏取中点`).toBeGreaterThanOrEqual(债务.埋到);
    }
  });
});

describe('③ 替身坡地上：枢纽各族问的是自己脚下那块地，而且取的是中点', () => {
  /**
   * 判据本体：一族件相对**自己脚下地面**的高差必须全等（按当地落脚），
   * 整族绝对高度必须有跨度（不是整圈共用一次采样）。
   * 两种坡各跑一遍：线性坡钉"各问各的"，凸坡钉"取中点而不是取最高/最低"。
   */
  function 各族各问各地(替身) {
    const d = buildSeededDecorations(替身, 摆件种子);
    const 件们 = 摊开(d);
    const 读数 = [];
    for (const 族 of 枢纽四族) {
      const 这一族 = 件们.filter((件) => 件.名 === 族);
      expect(这一族.length, `族 ${族} 只剩 ${这一族.length} 件，"高差全等"会被单件骗过去`).toBeGreaterThanOrEqual(6);
      const 高差 = 这一族.map((件) => (件.盒.min.y + 件.盒.max.y) / 2 - 替身.getGroundHeight((件.盒.min.x + 件.盒.max.x) / 2, (件.盒.min.z + 件.盒.max.z) / 2));
      const 散差 = Math.max(...高差) - Math.min(...高差);
      const 高低跨度 = Math.max(...这一族.map((件) => 件.盒.min.y)) - Math.min(...这一族.map((件) => 件.盒.min.y));
      // 容差 1 毫米：实例矩阵存进 Float32Array，14 米外的位置带着 ~2 微米的尾数，
      // 换算成坡上的高度就是微米级散差。旧写法的散差是**米**级（坡上那圈地面差 3.5 m）。
      expect(散差, `族 ${族} 各件相对自己脚下地面的高差散了 ${散差.toFixed(6)} m ⇒ 有件没按自己那块地落脚（或落脚点取的不是中点）`).toBeLessThan(1e-3);
      expect(高低跨度, `族 ${族} 整族绝对高度一模一样（跨度 ${(高低跨度 * 1000).toFixed(2)} mm）⇒ 整圈共用了一次地面采样`).toBeGreaterThan(0.01);
      读数.push(`${族}: 高差散 ${散差.toExponential(1)} m / 绝对高度跨度 ${高低跨度.toFixed(2)} m`);
    }
    d.dispose();
    return 读数;
  }

  it('线性坡 gy=0.3x+0.2z：各件按自己脚下落脚，且整圈不再同一个高度', () => {
    各族各问各地(斜坡世界());
  });

  it('凸坡 gy=0.01x²：落脚点取的是五点中点，不是最高/最低点', () => {
    各族各问各地(凸坡世界());
  });
});

describe('④ 门拱：每根柱脚都埋进自己那块地，不许悬空', () => {
  /** 柱 = 竖直跨度 ≥ 4 米的件（梁只有 0.5 米厚，靠尺寸而不是靠位置区分） */
  const 是柱子 = (件) => 件.盒.max.y - 件.盒.min.y >= 4;

  it('斜坡替身世界上，五座门的柱脚都不高于各自脚下的地面', () => {
    const 替身 = 斜坡世界();
    const d = buildSeededDecorations(替身, 摆件种子);
    const 柱们 = 摊开(d).filter((件) => 件.名 === 'zoneGate' && 是柱子(件));
    expect(柱们.length, '门柱数目不对 ⇒ 门拱这一族的结构变了').toBe(10);
    const 悬空 = 柱们
      .map((件) => ({ 件, 底: 件.盒.min.y - 当地地面(替身, 件) }))
      .filter((r) => r.底 > 1e-6);
    expect(悬空.map((r) => `${r.底.toFixed(2)}m`).join(' '), '这些柱脚悬在坡面上方（拱中心一个采样的旧写法就会这样）').toBe('');
    d.dispose();
  });

  it('钉死真世界上，五座门的柱脚都不悬空（实测旧写法最高悬 0.60 m）', () => {
    const { world: w, deco: d } = 准备();
    const 柱们 = 摊开(d).filter((件) => 件.名 === 'zoneGate' && 是柱子(件));
    expect(柱们.length).toBe(10);
    const 读数 = 柱们.map((件) => ({ x: 件.盒.min.x, 底: 件.盒.min.y - 当地地面(w, 件) })).sort((a, b) => b.底 - a.底);
    expect(读数[0].底, `最高的那根柱脚悬空 ${读数[0].底.toFixed(3)} m ⇒ 拱脚没有按最低那块地落座`).toBeLessThanOrEqual(1e-6);
  });
});
