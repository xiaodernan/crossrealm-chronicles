/**
 * 阴影普查的门禁 —— W-C2 切片10（B151）。
 *
 * ## 这把尺靠什么可信
 *
 * `src/engine/shadowCensus.js` 是在页面里跑的（`perf-smoke` 每一站渲染完调一次），node 里
 * 起不了 WebGL 上下文，所以这里能做的是三条腿，缺一条就有一段是猜的：
 *
 * 1. **几何数学与 three 对账**：六面平面与包围球的算式，用 three 自己的 `Frustum` / `Sphere` /
 *    `Matrix4` 在随机矩阵上比到 1e-9 —— 这两处是**唯一**能被 node 侧独立验证的东西
 *    （平面取法写错一位、半径少除一个 w，榜上就会多一簇或少一簇件）。
 * 2. **走法与 three 的源码对账**：直接读 `node_modules/three/build/three.module.js` 里
 *    `renderObject` 的那四条规则原文，钉住"我们还照着这版抄"。three 升级改了阴影趟的走法 ⇒ 这里红，
 *    而不是让榜悄悄变成另一回事。
 * 3. **与真渲染对账**：`npm run perf` 里那条"数出来的 == 冻结对减出来的"（页面侧，零容差）。
 *    这一条**不在本文件**，本文件绿不代表页面侧对上了。
 *
 * 外加判据本身的反面腿（`普查读数问题`：什么算不合格的一轮）与接线腿（脚本真的 import 了那把尺、
 * 真的在拧着"开"的那一帧调用它、`不推()` 里真的没有 `update()`）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import {
  SHADOW_MAP_TYPES,
  矩阵乘,
  阴影框平面,
  世界包围球,
  球在框内,
  件的阴影笔数,
  归属标签,
  阴影件普查,
  归因排名,
} from '../src/engine/shadowCensus.js';
import { 普查读数问题 } from '../scripts/harness-readings.mjs';

const ROOT = process.cwd();
const 脚本路径 = join(ROOT, 'scripts', 'perf-smoke.mjs');
const 脚本源 = existsSync(脚本路径) ? readFileSync(脚本路径, 'utf8') : '';
const 尺路径 = join(ROOT, 'src', 'engine', 'shadowCensus.js');
const 尺源 = existsSync(尺路径) ? readFileSync(尺路径, 'utf8') : '';
const 预算路径 = join(ROOT, 'src', 'engine', 'drawCallBudget.js');
const 预算源 = existsSync(预算路径) ? readFileSync(预算路径, 'utf8') : '';
const three路径 = join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');
const three源 = existsSync(three路径) ? readFileSync(three路径, 'utf8') : '';

/** 造一把"从上方俯视原点"的阴影相机，矩阵手动更新到位（与 `LightShadow.updateMatrices` 之后同形） */
function 阴影相机(半幅 = 10) {
  const 相机 = new THREE.OrthographicCamera(-半幅, 半幅, 半幅, -半幅, 0.1, 200);
  相机.position.set(0, 50, 0);
  相机.up.set(0, 0, -1);
  相机.lookAt(0, 0, 0);
  相机.updateProjectionMatrix();
  相机.updateMatrixWorld(true);
  相机.matrixWorldInverse.copy(相机.matrixWorld).invert();
  return 相机;
}

/** 一盏方向光 + 它的阴影相机（页面里那盏太阳就是这一族） */
function 一盏方向光(半幅) {
  const 光 = new THREE.DirectionalLight(0xffffff, 1);
  光.castShadow = true;
  光.shadow.camera = 阴影相机(半幅);
  return 光;
}

function 渲染器替身(覆盖 = {}) {
  return { shadowMap: { enabled: true, autoUpdate: true, needsUpdate: true, type: SHADOW_MAP_TYPES.PCF_SOFT, ...覆盖 } };
}

/**
 * **参照实现**：逐字照 three 的 `WebGLShadowMap.renderObject`（8678-8686）走一遍，
 * 剔除用的是 three 自己的 `Frustum.intersectsObject`（不是本仓那套平面数学）。
 * 两边同形 ⇒ 比的是数学；两边不同形 ⇒ 这一条就只是把 bug 抄了两遍。
 */
function 参照阴影笔数(件, 主相机, 阴影框, 类型) {
  if (件.visible === false) return 0;
  let 笔 = 0;
  if (件.layers.test(主相机.layers) && (件.isMesh || 件.isLine || 件.isPoints)) {
    if ((件.castShadow || (件.receiveShadow && 类型 === THREE.VSMShadowMap))
      && (!件.frustumCulled || 阴影框.intersectsObject(件))) {
      const 材 = 件.material;
      if (Array.isArray(材)) {
        for (const 组 of (件.geometry ? 件.geometry.groups : [])) {
          const 分材 = 材[组.materialIndex];
          if (分材 && 分材.visible) 笔 += 1;
        }
      } else if (材 && 材.visible) 笔 = 1;
    }
  }
  for (const 子 of 件.children) 笔 += 参照阴影笔数(子, 主相机, 阴影框, 类型);
  return 笔;
}

function 参照全场景(场景, 主相机, 阴影相机列表, 类型) {
  const 框列表 = 阴影相机列表.map((c) => new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)));
  return 框列表.reduce((总, 框) => 总 + 参照阴影笔数(场景, 主相机, 框, 类型), 0);
}

describe('阴影普查（切片10，B151）', () => {
  it('三个阴影类型常量与 three 同值（写死的数必须能被机器发现过期）', () => {
    expect({
      BASIC: THREE.BasicShadowMap,
      PCF: THREE.PCFShadowMap,
      PCF_SOFT: THREE.PCFSoftShadowMap,
      VSM: THREE.VSMShadowMap,
    }).toEqual({ ...SHADOW_MAP_TYPES });
  });

  it('六面平面与 three 的 Frustum.setFromProjectionMatrix 逐面同式（含归一化）', () => {
    let 比过 = 0;
    for (let 轮 = 0; 轮 < 40; 轮 += 1) {
      const 投 = new THREE.Matrix4().makePerspective(-3 - 轮, 4 + 轮, -2, 3, 0.2, 500 + 轮);
      const 视 = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(轮 * 0.3, 轮 * 0.7, 轮 * 1.1));
      视.setPosition(轮, -轮 * 2, 轮 * 0.5);
      const 逆 = 视.clone().invert();
      const 我 = 阴影框平面(投.elements, 逆.elements);
      const 它 = new THREE.Frustum().setFromProjectionMatrix(投.clone().multiply(逆));
      for (let i = 0; i < 6; i += 1) {
        const 面 = 它.planes[i];
        const 它面 = [面.normal.x, 面.normal.y, 面.normal.z, 面.constant];
        for (let j = 0; j < 4; j += 1) {
          expect(Math.abs(我[i][j] - 它面[j]) < 1e-9,
            `第 ${i} 面第 ${j} 项：我 ${我[i][j]} / three ${它面[j]}`).toBe(true);
        }
        比过 += 1;
      }
      // 谓词也比一遍：随机球与 three 的 intersectsObject 同真同假（系数的符号反了会在这里露出来）
      for (let k = 0; k < 30; k += 1) {
        const 球 = new THREE.Sphere(new THREE.Vector3((k % 7) - 3, (k % 5) - 2.5, (k % 11) - 5.5), ((k % 4) + 1) * 0.9);
        const 件 = { isMesh: true, matrixWorld: new THREE.Matrix4(), boundingSphere: 球, geometry: null, children: [] };
        expect(球在框内(我, { x: 球.center.x, y: 球.center.y, z: 球.center.z, r: 球.radius }),
          `球 ${k}：我数框内 / three ${它.intersectsObject(件)}`).toBe(它.intersectsObject(件));
      }
    }
    expect(比过).toBe(240);
  });

  it('矩阵乘与 three 的 multiplyMatrices 同式（顺序反了、行列反了都会在这条红）', () => {
    for (let 轮 = 0; 轮 < 20; 轮 += 1) {
      const a = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0.5, 轮), 轮 * 0.37);
      const b = new THREE.Matrix4().makeTranslation(轮, -轮 * 0.3, 1 + 轮 * 0.2).scale(new THREE.Vector3(1 + 轮, 2 - 轮 * 0.1, 0.5));
      const 它 = a.clone().multiplyMatrices(a, b).elements;
      const 我 = 矩阵乘(a.elements, b.elements);
      for (let i = 0; i < 16; i += 1) {
        expect(Math.abs(我[i] - 它[i]) < 1e-12, `第 ${i} 项：我 ${我[i]} / three ${它[i]}`).toBe(true);
      }
    }
  });

  it('世界包围球与 three 的 Sphere.applyMatrix4 同式（半径不除 w、心要除）', () => {
    const 几何 = new THREE.SphereGeometry(1, 8, 6);
    几何.computeBoundingSphere();
    for (const [sx, sy, sz] of [[1, 1, 1], [3, 0.25, 0.5], [0.1, 7, 2], [-2, -2, -2]]) {
      const 件 = new THREE.Mesh(几何, new THREE.MeshBasicMaterial());
      件.scale.set(sx, sy, sz);
      件.position.set(12, -7, 33);
      件.rotation.set(0.7, 1.3, 0.2);
      件.updateMatrixWorld(true);
      const 我 = 世界包围球(件);
      const 它 = new THREE.Sphere().copy(几何.boundingSphere).applyMatrix4(件.matrixWorld);
      expect(Math.abs(我.x - 它.center.x) < 1e-9, `x（缩放 ${sx}/${sy}/${sz}）`).toBe(true);
      expect(Math.abs(我.y - 它.center.y) < 1e-9, `y（缩放 ${sx}/${sy}/${sz}）`).toBe(true);
      expect(Math.abs(我.z - 它.center.z) < 1e-9, `z（缩放 ${sx}/${sy}/${sz}）`).toBe(true);
      expect(Math.abs(我.r - 它.radius) < 1e-9, `半径（缩放 ${sx}/${sy}/${sz}）`).toBe(true);
    }
    /**
     * **上面四组全是仿射矩阵**（w 恒 1）—— 光有它们，"半径除不除 w"这一腿是空跑的：
     * 变异臂乙（`r: (球.radius / w) * max`）在四组仿射缩放下逐字节等价，退出码 0。
     * 这一组把一枚**透视**矩阵当 matrixWorld 塞进去（阴影趟里不会出现，但规则要能被证伪）：
     * 心的 w ≠ 1 时 three 除、半径不除 —— 两条数因此分家，臂乙必须红。
     */
    const 透视 = new THREE.Matrix4().makePerspective(-2, 2, 3, -3, 4, 40);
    const 偏心 = new THREE.SphereGeometry(1, 8, 6);
    偏心.translate(0.4, -0.2, -3); // 球心 z ≠ 0：透视那一路的 w = -center.z，恒 0 会撞上 `|| 1` 的兜底
    偏心.computeBoundingSphere();
    const 件 = new THREE.Mesh(偏心, new THREE.MeshBasicMaterial());
    件.matrixWorld = 透视.clone();
    const 我 = 世界包围球(件);
    const 它 = new THREE.Sphere().copy(偏心.boundingSphere).applyMatrix4(件.matrixWorld);
    const e = 透视.elements, c = 偏心.boundingSphere.center;
    const w = e[3] * c.x + e[7] * c.y + e[11] * c.z + e[15];
    expect(Math.abs(w - 1) > 0.5, `这一组的 w 必须真的不是 1（读到 ${w}）—— 否则这条腿又在空跑`).toBe(true);
    expect(Math.abs(我.x - 它.center.x) < 1e-9, '透视下的心（要除 w）').toBe(true);
    expect(Math.abs(我.r - 它.radius) < 1e-9, '透视下的半径（不除 w）').toBe(true);
    // 反证：把半径也除以 w 会得到的那个数，必须与 three 的那个数**不同**（差异大到不会被容差吃掉）
    expect(Math.abs(它.radius / w - 它.radius) > 1e-6, '除以 w 与不除在这一组里没分开 ⇒ 这条腿白写').toBe(true);
  });

  it('合成场景：数出来的笔数 == 用 three 自己的 Frustum 剔出来的笔数', () => {
    const 主相机 = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    主相机.position.set(0, 2, 20);
    主相机.updateMatrixWorld(true);
    const 半幅 = 10;
    const 光 = 一盏方向光(半幅);
    const 场景 = new THREE.Scene();
    场景.add(光);
    const 几何 = new THREE.BoxGeometry(1, 1, 1);
    const 材 = () => new THREE.MeshBasicMaterial();

    const 加 = (件) => { 场景.add(件); return 件; };
    // ① 框内的投影件
    const 在框 = new THREE.Mesh(几何, 材()); 在框.position.set(0, 0, 0); 在框.castShadow = true; 加(在框);
    // ② 框外的投影件（正交框 ±10，这个在 z=120）
    const 出框 = new THREE.Mesh(几何, 材()); 出框.position.set(0, 0, 120); 出框.castShadow = true; 加(出框);
    // ③ 框外但不参加剔除（frustumCulled = false）
    const 不剔 = new THREE.Mesh(几何, 材()); 不剔.position.set(0, 0, 120); 不剔.castShadow = true; 不剔.frustumCulled = false; 加(不剔);
    // ④ frustumCulled 是 undefined（three 的判据是 falsy 就不剔）
    const 没设 = new THREE.Mesh(几何, 材()); 没设.position.set(0, 0, 120); 没设.castShadow = true; delete 没设.frustumCulled; 加(没设);
    // ⑤ 不可见父件底下的框内件（剪枝递归：整个子树不进阴影趟）
    const 藏 = new THREE.Group(); 藏.visible = false; 场景.add(藏);
    const 藏在里面 = new THREE.Mesh(几何, 材()); 藏在里面.castShadow = true; 藏.add(藏在里面);
    // ⑥ 层不过的件不画，但**照样往下递归**（子件在层上且投影）
    const 异层父 = new THREE.Mesh(几何, 材()); 异层父.layers.set(1); 异层父.castShadow = true; 加(异层父);
    const 同层子 = new THREE.Mesh(几何, 材()); 同层子.castShadow = true; 异层父.add(同层子);
    // ⑦ 不投影的件（castShadow 假）
    const 不投 = new THREE.Mesh(几何, 材()); 不投.position.set(1, 0, 1); 加(不投);
    // ⑧ 多材质：盒 6 组 materialIndex 0..5，给 2 个材质 ⇒ 只有前两组成笔
    const 多材 = new THREE.Mesh(几何, [材(), 材()]); 多材.castShadow = true; 加(多材);
    // ⑨ 多材质里有一张关了 visible
    const 半隐 = new THREE.Mesh(几何, [材(), 材()]); 半隐.material[1].visible = false; 半隐.castShadow = true; 加(半隐);
    // ⑩ 实例批（走 object.boundingSphere 那条分支）
    const 实例 = new THREE.InstancedMesh(几何, 材(), 3);
    实例.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 1, 0));
    实例.setMatrixAt(1, new THREE.Matrix4().makeTranslation(-1, 1, 0));
    实例.setMatrixAt(2, new THREE.Matrix4().makeTranslation(0, 1, 0));
    实例.instanceMatrix.needsUpdate = true;
    实例.castShadow = true;
    加(实例);
    const 实例出框 = new THREE.InstancedMesh(几何, 材(), 2);
    实例出框.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 300));
    实例出框.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1, 0, 300));
    实例出框.instanceMatrix.needsUpdate = true;
    实例出框.castShadow = true;
    加(实例出框);
    // ⑪ 线框件（three 的判据含 isLine）
    const 线 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)]), 材());
    线.castShadow = true; 加(线);
    // ⑫ Sprite：三个类之外 ⇒ 一笔不画（哪怕 castShadow 为真）
    const 片 = new THREE.Sprite(new THREE.SpriteMaterial()); 片.castShadow = true; 加(片);
    // ⑬ 挂在有名子树下的件（归属标签用得上）
    const 族 = new THREE.Group(); 族.name = 'WorldDecorations'; 场景.add(族);
    const 有名 = new THREE.Mesh(几何, 材()); 有名.name = 'wildRock'; 有名.castShadow = true; 族.add(有名);
    const 无名 = new THREE.Mesh(几何, 材()); 无名.castShadow = true; 族.add(无名);
    场景.updateMatrixWorld(true);

    const 我 = 阴影件普查(场景, 主相机, 渲染器替身());
    const 它 = 参照全场景(场景, 主相机, [光.shadow.camera], SHADOW_MAP_TYPES.PCF_SOFT);
    expect(我.问题, `尺子自己没量到：${JSON.stringify(我.问题)}`).toEqual([]);
    expect(我.预测, `数出来 ${我.预测} 笔 / three 的 Frustum 剔出 ${它} 笔`).toBe(它);
    // 手数的期望值：①1 ③1 ④1 ⑥子1 ⑧2 ⑨1 ⑩1 ⑪1 ⑬2 = 11（②⑤⑦⑩出框⑫不进来）
    expect(它).toBe(11);
    expect(我.光源).toEqual([{ 名: 'DirectionalLight', 类: '方向光', 绘: 11, 框: 10 }]);
    expect(归属标签(有名, 场景)).toBe('WorldDecorations / wildRock');
    expect(归属标签(无名, 场景)).toBe('WorldDecorations / (无名)');
    expect(归属标签(实例, 场景)).toBe('(直属scene) / (无名)〔实例批〕');
    expect(件的阴影笔数(多材)).toBe(2);
    expect(件的阴影笔数(半隐)).toBe(1);
  });

  it('归属标签：就近的中间层名字算，顶层那个名字不重复算', () => {
    const 场景 = new THREE.Scene();
    const 顶 = new THREE.Group(); 顶.name = 'WorldDecorations'; 场景.add(顶);
    const 中 = new THREE.Group(); 中.name = 'campA'; 顶.add(中);
    const 无名件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    中.add(无名件);
    const 有名件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    有名件.name = 'base'; 中.add(有名件);
    const 直挂 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    场景.add(直挂);
    expect(归属标签(无名件, 场景)).toBe('WorldDecorations / campA');
    expect(归属标签(有名件, 场景)).toBe('WorldDecorations / base');
    expect(归属标签(直挂, 场景)).toBe('(直属scene) / (无名)');
    // 顶层名字被重复计入 = 榜上一族里认不出某一件。magic 站那 23 笔要的就是这个形状。
    const 只到顶 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    顶.add(只到顶);
    expect(归属标签(只到顶, 场景)).toBe('WorldDecorations / (无名)');
  });

  it('一盏灯数一遍、两盏灯数两遍（多光源各自一趟阴影，榜按笔数合计）', () => {
    const 主相机 = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    主相机.updateMatrixWorld(true);
    const 场景 = new THREE.Scene();
    const 光A = 一盏方向光(10);
    const 光B = 一盏方向光(1); // 半幅 1 的小框：原点那件（半径 ~0.87）仍在框内
    场景.add(光A, 光B);
    const 件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    件.castShadow = true;
    场景.add(件);
    场景.updateMatrixWorld(true);
    const 我 = 阴影件普查(场景, 主相机, 渲染器替身());
    expect(我.预测).toBe(2);
    expect(我.榜).toEqual([['(直属scene) / (无名)', 2]]);
    expect(我.光源.map((L) => L.绘)).toEqual([1, 1]);
    expect(我.预测).toBe(参照全场景(场景, 主相机, [光A.shadow.camera, 光B.shadow.camera], SHADOW_MAP_TYPES.PCF_SOFT));
  });

  it('点光 / VSM / 阴影趟没发 —— 模型不覆盖的东西一律点名拒绝，不返回"猜出来的数"', () => {
    const 主相机 = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    主相机.updateMatrixWorld(true);

    const 场景 = new THREE.Scene();
    const 点 = new THREE.PointLight(0xffffff, 1);
    点.castShadow = true;
    场景.add(点);
    const 件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    件.castShadow = true;
    场景.add(件);
    场景.updateMatrixWorld(true);
    const 点测 = 阴影件普查(场景, 主相机, 渲染器替身());
    expect(点测.问题.join('')).toContain('点光');
    expect(点测.预测).toBe(0);

    const 只有方向光 = new THREE.Scene();
    只有方向光.add(一盏方向光(10), 件.clone());
    只有方向光.updateMatrixWorld(true);
    expect(阴影件普查(只有方向光, 主相机, 渲染器替身({ type: THREE.VSMShadowMap })).问题.join('')).toContain('VSM');
    expect(阴影件普查(只有方向光, 主相机, 渲染器替身({ enabled: false })).问题.join('')).toContain('enabled');
    expect(阴影件普查(只有方向光, 主相机, 渲染器替身({ autoUpdate: false, needsUpdate: false })).问题.join('')).toContain('autoUpdate');
    expect(阴影件普查(只有方向光, 主相机, { }).问题.join('')).toContain('shadowMap');
    expect(阴影件普查(null, 主相机, 渲染器替身()).问题.join('')).toContain('没拿到场景');

    // 一盏灯没有阴影相机（没 updateMatrices）⇒ 没有框就没有剔除，点名而不是当"全进框"
    const 瞎光 = new THREE.DirectionalLight(0xffffff, 1);
    瞎光.castShadow = true;
    瞎光.shadow.camera.projectionMatrix = undefined;
    const 瞎场景 = new THREE.Scene();
    瞎场景.add(瞎光, 件.clone());
    瞎场景.updateMatrixWorld(true);
    expect(阴影件普查(瞎场景, 主相机, 渲染器替身()).问题.join('')).toContain('读不到 projectionMatrix');
  });

  it('整趟跳过的光源计 0 笔并把原因留在光源行里（three 8457）', () => {
    const 主相机 = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    主相机.updateMatrixWorld(true);
    const 场景 = new THREE.Scene();
    const 光 = 一盏方向光(10);
    光.shadow.autoUpdate = false;
    光.shadow.needsUpdate = false;
    场景.add(光);
    const 件 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    件.castShadow = true;
    场景.add(件);
    场景.updateMatrixWorld(true);
    const 我 = 阴影件普查(场景, 主相机, 渲染器替身());
    expect(我.预测).toBe(0);
    expect(我.光源[0].跳过).toContain('8457');
    // 等式 0 == 0 在这里不红（模型与减法都忠实：这一帧就是没画阴影趟）。
    // "阴影列是 0"那一拒由 draw读数问题 接住 —— 两处各判各的，不在这条上重复。
    expect(普查读数问题('hub', 我, 0)).toEqual([]);
  });

  it('归因排名：多的在前、同笔数字典序、可截断、脏条目被丢掉', () => {
    const 条 = [['B族 / 石头', 3], ['A族 / 树', 3], ['C族 / 灯', 7], ['D族 / 零', 0], ['E族 / 非整数', 1.5], ['F族 / 缺', undefined]];
    expect(归因排名(条).map(([k]) => k)).toEqual(['C族 / 灯', 'A族 / 树', 'B族 / 石头']);
    expect(归因排名(条, 2).map(([k]) => k)).toEqual(['C族 / 灯', 'A族 / 树']);
    expect(归因排名([])).toEqual([]);
    expect(归因排名(undefined)).toEqual([]);
  });

  it('普查读数问题：等式成立时沉默，六种坏形状各红一次（空数组 = 通过）', () => {
    const 好 = { 预测: 62, 框内件数: 62, 可投件数: 133, 榜: [['WorldDecorations / wildRock〔实例批〕', 1]], 光源: [], 问题: [] };
    expect(普查读数问题('hub', 好, 62)).toEqual([]);
    expect(普查读数问题('hub', null, 62).join('')).toContain('没交出阴影普查');
    expect(普查读数问题('hub', { ...好, 问题: ['这一帧没有任何 castShadow 的光源'] }, 62).join('')).toContain('尺子没量到');
    expect(普查读数问题('hub', { ...好, 预测: NaN }, 62).join('')).toContain('不是整数');
    expect(普查读数问题('hub', 好, undefined).join('')).toContain('冻结对');
    expect(普查读数问题('hub', 好, 61).join('')).toContain('不可解释');
    expect(普查读数问题('hub', { ...好, 榜: [] }, 62).join('')).toContain('榜被丢了');
    // 预测 0 且冻结 0：等式成立但不该有榜 —— 这条形状交给"阴影趟为 0"那一拒，这里不重复红
    expect(普查读数问题('hub', { ...好, 预测: 0, 榜: [] }, 0)).toEqual([]);
  });

  it('three 的阴影趟规则原文还在被抄的那四条上（升级改了走法就要在这里红一次）', () => {
    expect(existsSync(three路径), `找不到 ${three路径} —— 这条对账要有 three 的构建产物`).toBe(true);
    const 起 = three源.indexOf('function renderObject( object, camera, shadowCamera, light, type )');
    expect(起, 'three 的 renderObject（阴影趟那个）签名变了：本仓复刻的走法需要重抄').toBeGreaterThan(-1);
    const 段 = three源.slice(起, 起 + 3000);
    expect(段).toContain('if ( object.visible === false ) return;');
    expect(段).toContain('object.layers.test( camera.layers )');
    expect(段).toContain('! object.frustumCulled || _frustum.intersectsObject( object )');
    expect(段).toContain('if ( groupMaterial && groupMaterial.visible )');
    // 剔除用的框来自阴影相机，层的测试用的是**主相机** —— 抄反了会多数/少数（本仓第一版撞过一次）
    expect(three源).toContain('renderObject( scene, camera, shadow.camera, light, this.type )');
    expect(three源).toContain('_frustum = shadow.getFrustum();');
  });

  it('六面平面的取法与顺序，钉在 three.core.js 的那六行上（换了顺序也要在这里红一次）', () => {
    const core路径 = join(ROOT, 'node_modules', 'three', 'build', 'three.core.js');
    expect(existsSync(core路径), `找不到 ${core路径}`).toBe(true);
    const core = readFileSync(core路径, 'utf8');
    for (const 行 of [
      'planes[ 0 ].setComponents( me3 - me0, me7 - me4, me11 - me8, me15 - me12 ).normalize();',
      'planes[ 1 ].setComponents( me3 + me0, me7 + me4, me11 + me8, me15 + me12 ).normalize();',
      'planes[ 2 ].setComponents( me3 + me1, me7 + me5, me11 + me9, me15 + me13 ).normalize();',
      'planes[ 3 ].setComponents( me3 - me1, me7 - me5, me11 - me9, me15 - me13 ).normalize();',
      'planes[ 4 ].setComponents( me3 - me2, me7 - me6, me11 - me10, me15 - me14 ).normalize();',
      'planes[ 5 ].setComponents( me3 + me2, me7 + me6, me11 + me10, me15 + me14 ).normalize();',
    ]) expect(core, `three 的取面行变了：${行}`).toContain(行);
    // 半径那条最容易抄错的也钉住：乘 getMaxScaleOnAxis，不除 w
    expect(core).toContain('this.radius = this.radius * matrix.getMaxScaleOnAxis();');
    // 阴影趟用的是默认坐标系（WebGL）；WebGPU 那一支的第 5 面取法不一样，别到时候以为是我们算错
    expect(core).toContain('planes[ 5 ].setComponents( me2, me6, me10, me14 ).normalize();');
    expect(core).toContain('setFromProjectionMatrix( m, coordinateSystem = WebGLCoordinateSystem )');
  });

  it('这把尺零依赖：它得能在页面里被 import，也得能在 node 里被 import', () => {
    expect(尺源, 'shadowCensus.js 引入了依赖 —— 页面里 await import 它会把整条依赖链拖进 perf 腿')
      .not.toMatch(/^import .*\bfrom\b/m);
    expect(尺源).toMatch(/^export function 阴影件普查/m);
    expect(尺源).toMatch(/^export const SHADOW_MAP_TYPES/m);
  });

  it('接线：脚本真的在拧着"开"的那一帧调用这把尺，冻结对里一次 update() 都不推', () => {
    expect(脚本源, 'perf-smoke 没有 import 页面侧那把尺').toContain("await import('/src/engine/shadowCensus.js')");
    expect(脚本源, 'perf-smoke 没有调用 阴影件普查').toContain('阴影件普查(g.scene, g.camera, g.renderer)');
    expect(脚本源, 'perf-smoke 没有问 普查读数问题').toContain('普查读数问题(站id, r.普查, r.冻结阴影)');
    expect(脚本源).toContain('的阴影普查对不上账');
    expect(脚本源).toContain('[阴影普查|${站id}]');
    expect(脚本源).toContain('[阴影归属|${站id}]');

    // 冻结对的定义：只钉时刻 + 重置计数 + 渲染，**不许**推帧（推了就把主趟的抖动算进阴影列）
    const 起 = 脚本源.indexOf('const 不推 = () => {');
    expect(起, 'perf-smoke 里没有 不推() —— 冻结对不在了').toBeGreaterThan(-1);
    const 段 = 脚本源.slice(起, 脚本源.indexOf('const 冻结开', 起));
    expect(段.includes('g.update()'), '不推() 里出现了 g.update() —— 那就不是冻结对').toBe(false);
    expect(段).toContain('i.reset();');
    expect(段).toContain('g.render();');

    // 普查必须在拧着"开"的那一帧做、第二趟之前才拧关：关着数会 0 == 0 空对空
    const 普查调用 = 脚本源.indexOf('阴影件普查(g.scene');
    expect(脚本源.slice(脚本源.lastIndexOf('shadowMap.enabled = true;', 普查调用), 普查调用))
      .not.toContain('shadowMap.enabled = false;');
    const 冻结关 = 脚本源.indexOf('const 冻结关 = 不推();');
    expect(冻结关, '冻结对没有第二趟').toBeGreaterThan(普查调用);
    expect(脚本源.slice(普查调用, 冻结关)).toContain('shadowMap.enabled = false;');
    const 拧回开 = 脚本源.indexOf('shadowMap.enabled = true;', 冻结关);
    expect(拧回开, '冻结对之后没把阴影开关拧回来').toBeGreaterThan(冻结关);
    expect(脚本源.slice(拧回开, 脚本源.indexOf('const 区 =', 拧回开))).toContain('没拧回来');
  });

  /**
   * 切片11（B152）把切片10 留下的那半步走完了：**越预算的阴影那一格改吃数出来的那一列**。
   *
   * 这一条同时钉两件**相反**的事，缺任何一件都只是半个口径：
   * - 报告列还在被算（`阴影 = 整帧 − 本体`）：`draw读数问题` 的三列自洽问的是它，账本也记它；
   * - 报告列不再决定红绿：交给上限的那一列叫 `阴影趟`，值 = `普查.预测`。字段名与报告列**不同名**
   *   是有意的 —— 脚本少交一个字段就会被 `overCeiling` 的"不是整数"那一拒点出来，
   *   而不是把 `undefined > 上限`（恒 false）读成"这一站很干净"。
   */
  it('阴影那一格越预算吃的是数出来的那一列（B152），报告列降级成对账', () => {
    expect(脚本源, '报告列的算法被改了：阴影列必须还是 整帧 − 本体').toContain('阴影: 整帧.calls - 本体.calls');
    expect(脚本源, '逐站上限不再从名册里取').toContain('名册.ceilings[站id]');
    expect(脚本源, '交给上限的阴影那一列不是数出来的笔数').toMatch(/阴影趟:\s*普查\.预测/);
    /**
     * 切片13 把这一行拆成两步（同一份记录从此有**两个读者**：上限与地板）。两条都得钉：
     * 只构造不入桶 ⇒ 覆盖对账看不见这一站；只 `push(读数)` 不构造 ⇒ 上限与地板都吃不到数出来的那一列。
     */
    expect(脚本源, '数出来的笔数没并进读数记录（spread 断了 ⇒ 上限与地板都吃不到它）').toMatch(/const 读数 = \{ 站: 站id, \.\.\.r \};/);
    expect(脚本源, '那份读数记录没被交进 draw读数 桶').toMatch(/draw读数\.push\(读数\)/);
    expect(脚本源).toMatch(/for \(const r of draw读数\)[\s\S]{0,400}overCeiling\(r, 预算\.drawCalls\.ceilings\)/);
    // 判定那一侧也得写明吃的是哪一列（两头同名才算换到位；只改脚本不改判定 = 两处定义）
    expect(预算源, 'overCeiling 的读数形状里第三列不再叫 阴影趟').toMatch(/阴影趟:\s*number/);
    expect(预算源, '阴影那一格又比回差值了').toMatch(/比\('阴影趟', 读数\.阴影趟, 上\.shadow\)/);
  });
});
