/**
 * 主地面网格与「可行走地面」对齐的门禁（缺陷② 切片D2）。
 *
 * ## 这条量的是"看见的地面"与"脚踩的地面"分家
 *
 * 玩家的脚由 `world.getGroundHeight`（= `sampleGlobalHeightSmooth`）每帧直接定高；他**看见**的地面
 * 是 `WorldTerrain` 那一张 `PlaneGeometry` —— 顶点按 `sampleGlobalHeight` 采样，格内是**线性三角**。
 * 两者在一格之内必然不等：差的就是那条弦。晶格 5.4 米一格时最坏差落到一米级（集中在广场裙带外缘
 * 与区缘那两道膝上 —— 那里高度场的二阶导最大，弦差 ∝ 格边长²），按碰撞半径那么大的范围内有 1.4%
 * 的三角面重心超过 `stepUp`。那就是"我走进了山里"的画面，而行走见证量不到它：它比的两侧都是
 * 同一张解析场。所以这一条把**渲染那张网格**接进尺子里，加密倍数由 ② 那把尺定，不是挑的手感。
 *
 * ## 三条腿各自咬住一件事
 *
 * ① **顶点忠实**：每个顶点存的高度必须**等于**该顶点世界坐标上的生产读数（`sampleGlobalHeight`），
 *    并且这张皮至少铺满 `world.bounds`。这一条把"按局部坐标采样 ⇒ z 镜像"（本案的成因）、
 *    "顶点采样漏掉区表"、"换成玩家那条五抽头读数"、"尺寸各自为政"一次全抓住，
 *    容差只剩 float32 的位数。
 * ② **弦差有界**：逐个三角面在**重心**处比"网格的线性值"与"玩家的读数"，不许超过 `stepUp`。
 *    重心是线性插值误差的极值位置（二次项在那里离弦最远），不是抽样碰运气；
 *    只量落在 `world.bounds` 内的重心 —— 边界外玩家走不到，那张皮再歪也不穿模。
 * ③ **反面对照**：复刻改前的镜像采样造一张地面，同一把尺必须判它超线（否则 ② 的绿是假绿）。
 *
 * ## 变异臂（切片D2 的落刀记录）
 *
 * | 臂 | 刀 | 预测红 | 实测 | 超出预测的红 ⇒ 归因 |
 * |---|---|---|---|---|
 * | 臂8 | 不落刀 | — | 0 红 | 基线 |
 * | 臂1 | 晶格退回改前那一档（`288×336 → 96×112`） | 只有 ② | 1 红，无漏 | ① 不红是**对的**：顶点仍是同一个解析场读数，只是格更疏 ⇒ 454 个面的重心超线，最坏 1.496 米 @(-7.2,92.3) —— 加密倍数就是这一条定出来的 |
 * | 臂2 | 顶点采样退回局部坐标（z 镜像，本案的成因） | ①＋② | 2 红，无漏 | 整张皮翻了 180°，两条尺同时点名：① 最坏顶点偏差 20.24 米，② 有 150107 个面分家 |
 * | 臂3 | 顶点采样漏掉区表（只读自然地） | ①＋② | 2 红，无漏 | 覆盖层从网格上消失：① 14.05 米 @(-139.0,-9.2)，② 53446 个面超过一阶上坎 |
 * | 臂4 | 顶点采样换成玩家那条五抽头读数 | 只有 ① | 1 红，无漏 | ② 不红是**对的**：五抽头与裸读数的差本就不到 0.18 米，② 量的是弦差 —— 这条刀说明 ① 认得出采样函数，② 认得出晶格密度，两件事各归各的尺 |
 * | 臂5 | 地面缩到正好等于可玩区（`520×620 → 400×500`） | 只有 ① | 1 红，无漏 | 牙口在① 那句覆盖上："地面 x 只到 -200.0，可玩区要 -250"。只靠 ② 的八成面数下限拦不住缩皮 —— 晶格同步加密时界内面数照样够 |
 * | 臂6 | `stepUp 0.65 → 0.05`（尺子来自生产） | ②＋见证②④＋连续性四条腿 | 7 红，无漏 | 一把尺同时是三张门禁的尺：本门禁 ② 报 6055 个面分家（最坏 0.333 米），另两张各自红在它那一族 —— 没有一个红是撞上的 |
 * | 臂7 | 顶点色改回二次采样高度场（限度臂） | 0 红 | 0 红 | 本案量不到它：上色只碰 `slope`，碰不到几何。这一刀省的是每顶点一次高度场采样，是顺手改，不是被门禁逼出来的 —— 记在这儿免得日后当成"被钉住的写法" |
 *
 * ## 尺子全部来自生产
 *
 * - 上限 = `stepUp`（`PlayerController` 一帧吸收得下的竖直位移）—— 与连续性门禁、行走见证同一把尺。
 * - 网格本体 = `world.worldTerrain._meshes.ground`（真建出来的那一张），尺寸与细分只认
 *   `GROUND_MESH` 这一处定义 —— 抄第二份就会"生产搬了家、门禁还按旧的量"。
 * - 世界按 `tests/helpers/seededWorld.js` 的钉死种子建：区表进高度场，重心处读到的才是玩家那份。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { installWindowShim } from './helpers/enemyHarness.js';
import { buildSeededWorld } from './helpers/seededWorld.js';
import { playerStepUp } from './helpers/productionReadings.js';
import { GROUND_MESH } from '../src/world/WorldTerrain.js';
import { sampleGlobalHeight, sampleGlobalHeightSmooth } from '../src/world/TerrainHeight.js';

installWindowShim();

/** 一帧吸收得下的竖直位移：可见地面与脚底的差超过它，玩家就是"走进了地里" */
const 上坎 = playerStepUp();

const world = buildSeededWorld(7);
const 区表 = world.zones;
const 界 = world.bounds;
const 网格 = world.worldTerrain._meshes.ground;

/** 顶点世界坐标：平面绕 X 轴 -90° 摊平 ⇒ 世界 (局部x, 局部z, −局部y) */
function 顶点(pos, i) {
  return { x: pos.getX(i), y: pos.getZ(i), z: -pos.getY(i) };
}

/**
 * 一张地面网格在"重心这把尺"上的读数：最坏弦差、超线上坎的面数、界内面数。
 * 线性面在重心处的值就是三个顶点高度的平均，所以不必再求重心坐标。
 */
function 量弦差(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  expect(idx, '地面不是索引几何？重心那把尺读不了顶点').toBeTruthy();
  let 最坏 = 0, 坏点 = null, 超线 = 0, 界内 = 0;
  for (let t = 0; t < idx.count; t += 3) {
    const a = 顶点(pos, idx.getX(t));
    const b = 顶点(pos, idx.getX(t + 1));
    const c = 顶点(pos, idx.getX(t + 2));
    const x = (a.x + b.x + c.x) / 3;
    const z = (a.z + b.z + c.z) / 3;
    if (x < 界.minX || x > 界.maxX || z < 界.minZ || z > 界.maxZ) continue;
    界内++;
    const 看见 = (a.y + b.y + c.y) / 3;
    const 差 = Math.abs(看见 - sampleGlobalHeightSmooth(x, z, 区表));
    if (差 > 最坏) { 最坏 = 差; 坏点 = [x, z, 看见]; }
    if (差 > 上坎) 超线++;
  }
  return { 最坏, 坏点, 超线, 界内, 面数: idx.count / 3 };
}

describe('主地面网格与可行走地面对齐（WorldTerrain 那一张平面）', () => {
  it('① 顶点忠实：每个顶点存的就是该点的世界读数，且这张皮至少铺满可玩区', () => {
    expect(网格, '世界没建出主地面网格？').toBeTruthy();
    const 参 = 网格.geometry.parameters;
    expect({ w: 参.width, d: 参.height, segW: 参.widthSegments, segD: 参.heightSegments })
      .toEqual({ w: GROUND_MESH.w, d: GROUND_MESH.d, segW: GROUND_MESH.segW, segD: GROUND_MESH.segD });

    // 铺满可玩区：② 只重量落在 bounds 内的重心，平面若缩到 bounds 里，那条就量到一片空气
    网格.geometry.computeBoundingBox();
    const bb = 网格.geometry.boundingBox;
    const 盖 = { minX: bb.min.x, maxX: bb.max.x, minZ: -bb.max.y, maxZ: -bb.min.y };
    expect(盖.minX, `地面 x 只到 ${盖.minX.toFixed(1)}，可玩区要 ${界.minX}`).toBeLessThanOrEqual(界.minX);
    expect(盖.maxX, `地面 x 只到 ${盖.maxX.toFixed(1)}，可玩区要 ${界.maxX}`).toBeGreaterThanOrEqual(界.maxX);
    expect(盖.minZ, `地面 z 只到 ${盖.minZ.toFixed(1)}，可玩区要 ${界.minZ}`).toBeLessThanOrEqual(界.minZ);
    expect(盖.maxZ, `地面 z 只到 ${盖.maxZ.toFixed(1)}，可玩区要 ${界.maxZ}`).toBeGreaterThanOrEqual(界.maxZ);

    const pos = 网格.geometry.attributes.position;
    expect(pos.count).toBe((GROUND_MESH.segW + 1) * (GROUND_MESH.segD + 1));
    let 最坏 = 0, 坏点 = null;
    for (let i = 0; i < pos.count; i++) {
      const v = 顶点(pos, i);
      const 差 = Math.abs(v.y - sampleGlobalHeight(v.x, v.z, 区表));
      if (差 > 最坏) { 最坏 = 差; 坏点 = v; }
    }
    // 存的必须是同一个浮点数：float32 只有十进制 7 位
    expect(最坏, `最坏顶点偏差 ${最坏.toFixed(6)} 米 @(${坏点.x.toFixed(1)},${坏点.z.toFixed(1)}) 存 ${坏点.y.toFixed(3)}`).toBeLessThan(1e-3);
  });

  it('② 弦差有界：逐三角面重心比"看见的"与"踩着的"，不许超过一阶上坎', () => {
    const r = 量弦差(网格.geometry);
    // 空跑保护：可玩区几乎铺满那张平面，界内面数若掉下八成，这条就是在量空气
    expect(r.界内, `界内只量到 ${r.界内}/${r.面数} 个三角面 ⇒ 覆盖不够，这条等于没跑`)
      .toBeGreaterThan(Math.floor(r.面数 * 0.8));
    expect(r.超线, `可见地面与脚底分家超过一阶上坎（${上坎} 米）的三角面有 ${r.超线} 个，`
      + `最坏 ${r.最坏.toFixed(3)} 米 @(${r.坏点[0].toFixed(1)},${r.坏点[1].toFixed(1)} 看见 ${r.坏点[2].toFixed(2)})`
      + ` ⇒ 主地面晶格（${GROUND_MESH.segW}×${GROUND_MESH.segD}）太粗，玩家走进看得见却踩不到的坡里`).toBe(0);
  }, 120_000);

  it('③ 反面对照：改前那份镜像采样被同一把尺判为分家', () => {
    const { w, d, segW, segD } = GROUND_MESH;
    const geo = new THREE.PlaneGeometry(w, d, segW, segD);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // 旧写法：按局部坐标采样高度，摊平后世界 z 被整张镜像
      pos.setZ(i, sampleGlobalHeight(pos.getX(i), pos.getY(i), 区表));
    }
    const 面 = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    面.rotation.x = -Math.PI / 2;
    面.updateMatrixWorld(true);
    const r = 量弦差(面.geometry);
    expect(r.最坏, `镜像版最坏只差 ${r.最坏.toFixed(3)} 米 ⇒ 这把尺咬不住 z 镜像`).toBeGreaterThan(上坎);
  }, 120_000);
});
