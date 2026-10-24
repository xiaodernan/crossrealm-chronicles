/**
 * 装饰层的穿模门禁（缺陷② 切片B2，W-B10 之后的 W-C2 余账）。
 *
 * ## 这一片防的是什么
 *
 * 玩家"行走时穿模"的成因不是镜头也不是动画，是**装饰层一块碰撞体都没有**。
 * W-C2 切片2 把散件合成 `InstancedMesh` 时，删掉的不只是每棵树一份网格，还有每棵树那块体
 * —— 合批之后"这一件在哪、多大"只剩实例矩阵里的 16 个数，而登记障碍要一份可读的坐标。
 * 于是真世界里**挡得住玩家身体的装饰件，482 件里 445 件零覆盖**（读数在计划 §9，脚本口径同
 * 本文件）：树、石、灯柱、门柱、摊、椅、断柱、水晶，走进去如入无人之境。
 *
 * 切片B1 把体按件登记回去了。这片把这件事**钉住**，因为它的死法很安静：
 * 少登记一族不会崩、不会报错，只会让玩家又开始穿墙 —— 而且**没人会为了"看不见的一堵墙"
 * 去查一次回归**。
 *
 * 上面那句"482 件里 445 件"是**修前**普查脚本的读数，用的是盒局部外接方形的足迹口径；
 * 本文件的④改用世界顶点在胸口带上的剪影（263/461 件带的是非 Y 轴朝向，局部方形会算错它们），
 * 所以②的反向控制量到的是另一个数 —— 那个数以断言里的实时读数为准，别把抄本当验收。
 *
 * ## 六条判据，各自独立
 *
 * ① **钉子**：布局由种子说了算；不钉种子的话②会轮换红（B125 同族）。
 * ② **覆盖**（缺陷本体）：每件挡得住身体的摆件，脚下那一格有体。反向控制：把装饰层的体摘掉
 *    （按 `owner` 身份摘，见③），零覆盖数必须**重新变大** —— 否则②的红绿灯是从别处借的。
 * ③ **认领**：体与网格互相点名（`owner` ↔ `mesh.name`），不认位置也不认下标；
 *    不自己登记、由别一族代挡的件写在豁免表里**逐行证明**，代挡那块漂走就红。
 * ④ **行为**：拿生产那三条判据（`unpenetrate` 脱困、`moveCircle` 行走、`blocksPoint` 埋没）
 *    走进件里。先把这一件**自己的**体（身份 + 落点重合）单独装一份格子 —— 邻居既不能替它挡、
 *    也不能替它挤 —— 再问"推出多少米"；下界用**体的内切半径 + 玩家半径**（凸体含住中心时的
 *    几何下界，圆与带朝向的盒同一条式子）。最后拿**真世界**再走一遍，只问停下时人有没有被
 *    埋在体里：静态②只说"那一格有体"，这几条说"那块体真的够大、真的沿对的方向推人"。
 * ⑤ **不误伤**：POI / 副本入口 / 营火 / 敌人出生点，装饰前站得下的格子，装饰后还得站得下
 *    （差分量：同一份世界在摆装饰前后各量一遍，只罚**新**被吃掉的点）。
 * ⑥ **拆卸**：`dispose()` 后不留一堵看不见的墙 —— 而且当场走一遍给人看（摘体要标脏哈希）。
 *
 * ## 三个数不抄，问生产侧要
 *
 * 玩家半径、上坎高度、胸口探点这三样决定④的成败与②的分母。写死在测试里就是"改了生产侧
 * 而门禁还在按旧数字放行"。`唯一数()` 从**声明处**取，取不到唯一一处就当场红（不是退回抄的数）。
 *
 * ## 变异臂：这把尺子在错的那一版上量得到东西吗（2026-10-25 一轮，脚本 `.tmp-deco-collision/arms.mjs`）
 *
 * 每把刀做一次**行为**替换，跑 ① ~ ⑥ 加 `collision` / `decoration-batching` /
 * `decoration-ground-landing` / `camera-occlusion` / `player-knockback` / `seeded-world-build`
 * 七个文件（94 例），把红的用例名逐条抄回来对账。**基线不动刀 = 0 红**，六把刀全部
 * "预测 = 命中、无漏、无超出"，每把之后逐字节还树（文件哈希比对）。
 *
 * | 刀 | 改的是哪一站 | 红的用例（点名） |
 * | --- | --- | --- |
 * | 1 法线退回恒等 | `Collision.rotatedNormal()` | ④ 站进件里被顶出来 / 走进去被挡住 / 不许被埋在体里；`collision.test` 斜墙直冲 + 嵌在斜墙里脱困 |
 * | 2 断柱一族不登记 | `_buildRuinClusters` 的半边长改 0 | ② 零覆盖 = 0 / ③ 逐族认领或代挡 / ④ 每一件都在自己的位子上 / ④ 走进去被挡住 |
 * | 3 树干体只有一半粗 | `_scatterTrees` 的 `r` 乘 0.5 | ④ 体不许比看得见的轮廓瘦（**只有这一条**：登记、身份、覆盖都还在，瘦的是尺寸） |
 * | 4 owner 不传进世界 | `_blockCyl` / `_blockBox` 那一站 | ① 真的登记了体 / ② 反向控制 / ③ 认领到网格名 + 逐族代挡 + 豁免表不过期 / ④ 每一件都在自己的位子上 + 轮廓瘦 + 走进去 / ⑤ 总块数 / ⑥ dispose 后总数 |
 * | 5 dispose 不摘体 | 摘体那一循环改成注释 | ⑥ dispose 后带 owner 的体一块不剩 |
 * | 6 装饰层看不见交互点 | `_clearOfInteractions` 的点清单改空 | ⑤ POI / 副本入口 / 营火 / 出生点站得下 |
 *
 * 臂4 一轮暴露出两处**空表白送**，当场改掉：③「认领得到一个网格名」原来用按 `owner` 筛出的种群
 * 审 `owner` 自己（抹掉 owner ⇒ 种群为空 ⇒ "没有孤儿"恒真），现在分母取自登记方自己的账本
 * `_blocks`，并要求两份账数到同一批体；③「豁免表不许过期」补了一条分母自证（有体的族 ≤ 5 就红）。
 * 也**不**预测②的"零覆盖 = 0"会随臂4 红：那条问的是整份世界的几何，体还在、只是没名字 ——
 * 钉住身份链的是上表那七处，不是它。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { CollisionWorld } from '../src/engine/Collision.js';
import { RestPointManager } from '../src/world/RestPointManager.js';
import { ENEMY_SPAWNS } from '../src/content/enemySpawns.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { installWindowShim } from './helpers/enemyHarness.js';
import { buildSeededWorld, buildSeededDecorations } from './helpers/seededWorld.js';

beforeAll(installWindowShim);

const ROOT = process.cwd();
const 读 = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** 布局与摆件各一颗种子（读的是真世界真布局 ⇒ 必须钉，见 tests/seeded-world-build.test.js ③） */
const 世界种子 = 7;
const 摆件种子 = 11;

/** 从声明处取一个数：全文必须**恰好命中一处**，且捕获组真的是个数（取不到就红，不许退回抄的数） */
function 唯一数(文件, 式样, 名) {
  const 命中 = [...读(文件).matchAll(式样)];
  expect(
    命中.length,
    `"${名}" 在 ${文件} 里命中 ${命中.length} 处（应为 1 处）⇒ 这条门禁的判据口径漂了，` +
      '先对齐口径、再来改这条断言，不要在本文件里补一个抄的数'
  ).toBe(1);
  const 数 = Number(命中[0][1]);
  expect(Number.isFinite(数), `"${名}" 从 ${文件} 里读到 "${命中[0][1]}" —— 不是个数，判据整套会静默失效`).toBe(true);
  return 数;
}

/** 玩家碰撞半径（`PlayerController` 构造期声明，`moveCircle`/`unpenetrate` 两处都用它） */
const 玩家半径 = 唯一数('src/player/PlayerController.js', /this\.colliderRadius = ([\d.]+);/g, 'colliderRadius');
/** 能踩上去的高度（同一处声明，交给 `supportAt` 的 stepUp）：矮过这条线的摆件是**台阶**不是墙 */
const 上坎 = 唯一数('src/player/PlayerController.js', /this\.stepUp = ([\d.]+);/g, 'stepUp');
/** `moveCircle` 除脚下之外多探的那一拍（胸口）：低过这条线的摆件挡不住人 = 不算挡 */
const 胸口 = 唯一数('src/engine/Collision.js', /this\.blocks\(c, y \+ ([\d.]+)\)/g, 'moveCircle 的胸口探点');

/**
 * 不自己登记体、由**别一族的体**代挡的件（按身份点名，不按位置）。
 * 每一行都由 ③ 当场证明：那一族的体真的盖得住这一件的脚下格。
 * 加了新代挡件就往这里加一行，而不是把 ② 的断言改成"少几件也行"。
 */
const 代挡豁免 = [
  {
    件: 'hubStallAwning',
    代挡: 'hubStallBase',
    理由: '雨棚是摊底正上方那块薄板，挡人的是摊底；再登记一块只会把摊的外接半径撑大一圈看不见的墙',
  },
];

/** 四个直冲方向（+x、+z、−x、−z）：④ 逐向取证，② 只问"脚下那一格有没有体" */
const 方向们 = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * 逐件读出装饰层真正摆出来的东西：世界位置、**玩家身体那一条带上的视觉轮廓**、竖直范围、家族名。
 *
 * 为什么不抄几何参数、也不取本地盒：合批之后"这一件在哪、多大"只剩实例矩阵，而**朝向不只有绕 Y**。
 * 实测这一层 461 件挡身的摆件里 263 件带倾斜（树 161/298、石 80/80、断柱 23/48…）——
 * 拿本地 XZ 半宽当轮廓，对躺平的水池环会读出 3.12 米的**假墙**（它的顶面其实埋在地下一 1.47 米），
 * 对绕 Y 转 45° 的门柱又会漏读。所以逐顶点变换到世界，只统计
 * **低过胸口那一拍的那些顶点**（往上长的树冠、灯罩、横梁不是"走进去会撞上"的部分）。
 * 竖直范围取全部顶点的世界 Y：挡身与否看的是"这件有没有横在身体那一段里"。
 */
function 实例清单(deco, world) {
  deco.group.updateMatrixWorld(true);
  const 顶点缓存 = new Map();
  const 出 = [];
  const _m = new THREE.Matrix4();
  const _p = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const 本地顶点 = (geo) => {
    let 列 = 顶点缓存.get(geo);
    if (!列) {
      const pos = geo.attributes.position;
      列 = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i += 1) {
        列[i * 3] = pos.getX(i);
        列[i * 3 + 1] = pos.getY(i);
        列[i * 3 + 2] = pos.getZ(i);
      }
      顶点缓存.set(geo, 列);
    }
    return 列;
  };
  const 记 = (网格, 矩阵) => {
    // 中心只取矩阵的平移列：轮廓与上下都由**变换到世界的顶点**量出来，朝向（含倾斜）自动带上
    _p.setFromMatrixPosition(矩阵);
    const 列 = 本地顶点(网格.geometry);
    const gy = world.getGroundHeight(_p.x, _p.z);
    let 顶 = -Infinity;
    let 底 = Infinity;
    let 外接 = 0;
    let 带下顶点 = 0;
    const 支撑 = [0, 0, 0, 0];
    for (let i = 0; i < 列.length; i += 3) {
      _v.set(列[i], 列[i + 1], 列[i + 2]).applyMatrix4(矩阵);
      if (_v.y > 顶) 顶 = _v.y;
      if (_v.y < 底) 底 = _v.y;
      if (_v.y > gy + 胸口) continue;
      const dx = _v.x - _p.x;
      const dz = _v.z - _p.z;
      带下顶点 += 1;
      外接 = Math.max(外接, Math.hypot(dx, dz));
      for (let k = 0; k < 4; k += 1) {
        支撑[k] = Math.max(支撑[k], dx * 方向们[k][0] + dz * 方向们[k][1]);
      }
    }
    出.push({
      家族: 网格.name,
      x: _p.x,
      z: _p.z,
      gy,
      底,
      顶,
      外接,
      支撑,
      带下顶点,
      // 挡身 = 顶面高过"能被跨上去"的那条线，且底面低过"胸口"那一拍：两件都在生产里有主
      挡身: 顶 > gy + 上坎 && 底 < gy + 胸口,
    });
  };
  const 走 = (节点, 父矩阵) => {
    const 世界 = 父矩阵.clone().multiply(节点.matrix);
    if (节点.isInstancedMesh) {
      for (let i = 0; i < 节点.count; i += 1) {
        节点.getMatrixAt(i, _m);
        记(节点, 世界.clone().multiply(_m));
      }
    } else if (节点.isMesh) {
      记(节点, 世界);
    }
    for (const 子 of 节点.children) 走(子, 世界);
  };
  const 根 = deco.group.matrixWorld.clone();
  for (const 子 of deco.group.children) 走(子, 根);
  return 出;
}

/**
 * 一块体沿某个世界方向的支撑距离（盒按自己的朝向展开，圆就是半径）。
 * 世界→局部的转置与 `blockersAt()`/`supportAt()` 同一套朝向，不再抄第三份。
 */
function 体支撑(c, dx, dz) {
  if (c.shape === 'cyl') return c.r;
  const cos = Math.cos(c.rot || 0);
  const sin = Math.sin(c.rot || 0);
  return c.hx * Math.abs(dx * cos + dz * sin) + c.hz * Math.abs(dz * cos - dx * sin);
}

/** 体的内切半径：凸体含住中心时，被推出去的圆心到中心的距离**至少**是它 + 玩家半径（④ 的下界） */
function 体内切(c) {
  return c.shape === 'cyl' ? c.r : Math.min(c.hx, c.hz);
}

/** 体的外接半径：停下的人不该比这更远（再远就是**看不见的墙**，不是这件摆件） */
function 体外接(c) {
  return c.shape === 'cyl' ? c.r : Math.hypot(c.hx, c.hz);
}

/** 一件摆件**自己的**体：身份（owner）+ 落点重合 —— 登记时用的是同一对 x/z，所以漂开就是没登记 */
function 本体们(体们, 件) {
  return 体们.filter((c) => c.owner === 件.家族 && Math.hypot(c.x - 件.x, c.z - 件.z) < 0.05);
}

/** 一件摆件的视觉轮廓有没有被它的体盖住：四个直冲方向上都不许体比看得见的瘦 */
function 轮廓漏点(件, 本体) {
  const 漏 = [];
  for (let k = 0; k < 4; k += 1) {
    const [dx, dz] = 方向们[k];
    const 得 = Math.max(...本体.map((c) => 体支撑(c, dx, dz)));
    if (得 < 件.支撑[k] - 0.06) {
      漏.push(`方向(${dx},${dz}) 体只到 ${得.toFixed(3)}m，看得见的那圈要到 ${件.支撑[k].toFixed(3)}m`);
    }
  }
  return 漏;
}

/** 把给定的几块体单独装进一份新格子 —— 孤立地测这一件的体，邻居不能替它挡，也不能替它挤 */
function 只装体(体列表) {
  const 临 = new CollisionWorld(16);
  for (const c of 体列表) 临.add({ ...c });
  临.build();
  return 临;
}

/** 只保留满足过滤器的碰撞体装进一份新格子，再问生产那一份判据 —— 不在测试里复刻几何 */
function 只装(世界, 过滤器) {
  return 只装体(世界.collision.colliders.filter(过滤器));
}

/** 一件摆件脚下那一格，**有没有**体挡得住站着的玩家（生产谓词 blocksPoint：脚或胸口任一拍） */
function 挡住(判据世界, 件) {
  return (
    判据世界.blocksPoint(件.x, 件.z, 件.gy, 件.外接) ||
    判据世界.blocksPoint(件.x, 件.z, 件.gy + 胸口, 件.外接)
  );
}

function 指纹(件们, 体们) {
  let h = 0x811c9dc5;
  const 吃 = (串) => {
    for (let i = 0; i < 串.length; i += 1) {
      h ^= 串.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const 件 of 件们) 吃(`${件.家族}|${件.x.toFixed(3)}|${件.z.toFixed(3)}|${件.挡身 ? 1 : 0}`);
  for (const c of 体们) 吃(`${c.owner}|${c.shape}|${c.x.toFixed(3)}|${c.z.toFixed(3)}|${c.base.toFixed(3)}|${c.top.toFixed(3)}`);
  return h;
}

/** 装饰层的体 = 带 `owner` 的那几块（这一层是唯一写 `owner` 的人，见③的互认断言） */
const 是装饰体 = (c) => typeof c.owner === 'string' && c.owner.length > 0;

let 备 = null;
/** 一份钉死的世界：先量装饰前，再把装饰层摆上同一份世界，量装饰后 —— ⑤ 的差分必须是同一份地形 */
function 准备() {
  if (备) return 备;
  const world = buildSeededWorld(世界种子);
  const 点们 = 交互点清单(world);
  const 装饰前 = 量交互点(world, 点们);
  const 体前数 = world.collision.colliders.length;
  const deco = buildSeededDecorations(world, 摆件种子);
  const 件们 = 实例清单(deco, world);
  const 装饰体们 = world.collision.colliders.filter(是装饰体);
  备 = {
    world,
    deco,
    件们,
    挡身们: 件们.filter((件) => 件.挡身),
    装饰体们,
    体前数,
    点们,
    装饰前,
    装饰后: 量交互点(world, 点们),
    只装非装饰: 只装(world, (c) => !是装饰体(c)),
  };
  return 备;
}

/** 玩家必须站得下、且交互点本身不许被埋进摆件里的那些格子 */
function 交互点清单(world) {
  const 出 = [];
  for (const p of world.pointsOfInterest ?? []) {
    if (p.position) 出.push({ 类: 'POI', 名: p.id ?? p.label, x: p.position.x, z: p.position.z });
  }
  for (const d of DUNGEON_DEFS) 出.push({ 类: '副本入口', 名: d.id, x: d.entrance.x, z: d.entrance.z });
  for (const s of ENEMY_SPAWNS) 出.push({ 类: '敌人出生点', 名: s.type, x: s.x, z: s.z });
  const 营火 = new RestPointManager(new THREE.Scene(), world);
  营火.buildDefaults();
  for (const rp of 营火.points) 出.push({ 类: '营火', 名: rp.id, x: rp.position.x, z: rp.position.z });
  return 出;
}

/** 一格"站得下人"= 胸口不在实体里，且生产侧的脱困不需要把它挪走 */
function 量交互点(world, 点们) {
  return 点们.map((p) => {
    const gy = world.getGroundHeight(p.x, p.z);
    const 出 = world.collision.unpenetrate(p.x, p.z, 玩家半径, gy);
    return {
      ...p,
      gy,
      埋住: world.collision.blocksPoint(p.x, p.z, gy + 胸口, 玩家半径),
      挪开: Math.hypot(出.x - p.x, 出.z - p.z),
    };
  });
}

describe('① 钉子是钉子：这一片的读数由种子说了算', () => {
  it('同一对种子两次摆出的覆盖判定逐位相同', () => {
    const a = 准备();
    const world = buildSeededWorld(世界种子);
    const deco = buildSeededDecorations(world, 摆件种子);
    const 件们 = 实例清单(deco, world);
    expect(
      指纹(件们, world.collision.colliders.filter(是装饰体)),
      '同种子两次建出的"哪几件挡身 + 装饰层登记了哪些体"不一样 ⇒ 布局在漂，② 的读数不能信'
    ).toBe(指纹(a.件们, a.装饰体们));
  });

  it('装饰层真的登记了体（空表上"零覆盖"是白送的）', () => {
    const a = 准备();
    expect(a.装饰体们.length, '装饰层一块体都没登记 —— ②③④全在空转').toBeGreaterThan(200);
    expect(a.挡身们.length, '一件挡得住身体的摆件都没扫到 ⇒ 实例清单读不到合批网格').toBeGreaterThan(200);
  });
});

describe('② 挡得住身体的摆件，一件都不许能走进去', () => {
  it('零覆盖 = 0（缺陷本体：改前 482 件里 445 件无人挡）', () => {
    const a = 准备();
    const 漏 = a.挡身们.filter((件) => !挡住(a.world.collision, 件));
    const 每族 = new Map();
    for (const 件 of 漏) 每族.set(件.家族, (每族.get(件.家族) ?? 0) + 1);
    const 样子 = 漏.slice(0, 12).map((件) =>
      `${件.家族}@(${件.x.toFixed(1)},${件.z.toFixed(1)}) 顶高出地面 ${(件.顶 - 件.gy).toFixed(2)}m 足迹 ${件.外接.toFixed(2)}m`);
    expect(
      漏.length,
      `${漏.length} 件摆件挡得住玩家身体却没有任何体（可以直穿）。按族：` +
        [...每族].map(([k, n]) => `${k}×${n}`).join('、') +
        `\n头几件：\n${样子.join('\n')}`
    ).toBe(0);
  });

  it('反向控制：摘掉装饰层登记的体，同一把判据必须立刻量回一大堆零覆盖', () => {
    const a = 准备();
    const 漏 = a.挡身们.filter((件) => !挡住(a.只装非装饰, 件));
    expect(
      漏.length,
      `摘掉装饰体的世界里只剩 ${漏.length} 件零覆盖 —— ② 的"0"其实来自区里的既有障碍，不是来自装饰层`
    ).toBeGreaterThan(100);
  });

  it('分母自证：挡身件覆盖到八族里的多数，且逐族读数不为空转', () => {
    const a = 准备();
    const 族 = new Set(a.挡身们.map((件) => 件.家族));
    const 抄本 = new Map();
    for (const 件 of a.挡身们) 抄本.set(件.家族, (抄本.get(件.家族) ?? 0) + 1);
    expect(族.size, `挡身的家族只有 ${族.size} 个（${[...族].join('、')}）⇒ 实例清单漏了一族`).toBeGreaterThanOrEqual(6);
    expect([...抄本].map(([k, n]) => `${k}×${n}`).join('、'), '树干一族是穿模的大头，不该从分母里消失')
      .toMatch(/wildTreeTrunk/);
    expect(抄本.get('wildTreeTrunk'), '树干件数与 298 棵的散布量级对不上').toBeGreaterThan(150);
  });
});

describe('③ 体与网格互相点名（身份，不是位置也不是下标）', () => {
  it('每一块装饰体都认领得到一个网格名', () => {
    const a = 准备();
    /**
     * 分母取自**登记方自己的账本** `_blocks`（注册时推入的引用），不是取自媒体被审的那个字段。
     * 为什么不能用 `a.装饰体们`（按 owner 筛）当种群：臂4 实测把 `owner` 抹掉之后，
     * 那个种群变成空表，"没有孤儿"就在空表上白送了 —— 审一个字段的那条判据，
     * 不能靠同一个字段挑出要审的东西。这里两份账必须数到同一批体，空转当场露形。
     */
    const 登记账 = a.deco._blocks;
    expect(登记账.length, '装饰层自己的账本 `_blocks` 是空的 ⇒ 后面三条全在空转').toBeGreaterThan(200);
    const 无名 = 登记账.filter((c) => !c.owner);
    expect(
      无名.length,
      `${无名.length} 块体没带家族名（登记的 owner 在 _blockCyl/_blockBox 那一站被丢掉了）` +
        ' ⇒ 按族认领的门禁整套空转，摘体也只认得引用'
    ).toBe(0);
    expect(a.装饰体们.length, '`_blocks` 数到一块、按 owner 认领到的却是另一块数 ⇒ 有体没带名字').toBe(登记账.length);
    const 网格名 = new Set(a.件们.map((件) => 件.家族));
    const 孤儿 = [...new Set(登记账.map((c) => c.owner))].filter((o) => !网格名.has(o));
    expect(孤儿, `这些 owner 在本层找不到同名网格（拼错的体永远摘不掉、也没法按族算账）：${孤儿.join('、')}`).toEqual([]);
  });

  it('每个实例都带着家族名（无名合批网格会从认领账上静默消失）', () => {
    const a = 准备();
    const 无名件们 = a.件们.filter((件) => !件.家族);
    expect(
      无名件们.length,
      无名件们.slice(0, 5).map((件) => `未命名网格@(${件.x.toFixed(1)},${件.z.toFixed(1)})`).join('、') +
        ' —— 没有 .name 的网格认领不到体，也不会进②的分母'
    ).toBe(0);
  });

  it('挡身的每一族要么自己有体，要么在豁免表里点名由谁代挡 —— 且代挡那块真的盖得住', () => {
    const a = 准备();
    const 有体的族 = new Set(a.装饰体们.map((c) => c.owner));
    const 挡身族 = [...new Set(a.挡身们.map((件) => 件.家族))];
    const 没人认领 = [];
    for (const 族名 of 挡身族) {
      if (有体的族.has(族名)) continue;
      const 豁 = 代挡豁免.find((行) => 行.件 === 族名);
      if (!豁) {
        没人认领.push(族名);
        continue;
      }
      // 豁免不是免检：这一件必须被**点名的那一族**的体盖住（用生产判据，只装那一族的体）
      const 代 = 只装(a.world, (c) => c.owner === 豁.代挡);
      const 漏 = a.挡身们.filter((件) => 件.家族 === 族名 && !挡住(代, 件));
      const 首 = 漏[0];
      expect(
        漏.length,
        `豁免行 "${豁.件}" ← "${豁.代挡}" 已经盖不住它了（${漏.length} 件漏${首 ? `，第一件在 (${首.x.toFixed(1)},${首.z.toFixed(1)})` : ''}）` +
          ' ⇒ 代挡那族的尺寸或落点漂了，要么自己登记体、要么删这行'
      ).toBe(0);
    }
    expect(没人认领, `这些挡身的族既没有自己的体，也不在代挡豁免表里：${没人认领.join('、')}`).toEqual([]);
  });

  it('豁免表不许过期：已经自己登记了体的一族不许继续躺在表里', () => {
    const a = 准备();
    const 有体的族 = new Set(a.装饰体们.map((c) => c.owner));
    // 分母自证：这条判据在空表上恒真，所以先要求"有体的族"不是空的（臂4 抹掉 owner 时它才是 0）
    expect(有体的族.size, '一块体都没认领到族 ⇒ "没有过期的豁免行"是白送的').toBeGreaterThan(5);
    const 过期 = 代挡豁免.filter((行) => 有体的族.has(行.件)).map((行) => 行.件);
    expect(过期, `这些族已经自己登记体了，豁免行该删：${过期.join('、')}`).toEqual([]);
  });
});

describe('④ 行为见证：件**自己的**体真的挡得住走进去的人', () => {
  const 每族取样 = (件们, 上限) => {
    const 计数 = new Map();
    return 件们.filter((件) => {
      const n = 计数.get(件.家族) ?? 0;
      if (n >= 上限) return false;
      计数.set(件.家族, n + 1);
      return true;
    });
  };
  /** 代挡豁免那一族不进④：雨棚比摊底宽（伞檐），拿它的轮廓去要"推出多少米"是问错了对象 */
  const 自有件的体 = (a) => a.挡身们.filter((件) => !代挡豁免.some((行) => 行.件 === 件.家族));

  it('每一件都在自己的位子上认领到一块体（身份 + 落点重合）', () => {
    const a = 准备();
    const 件们 = 自有件的体(a);
    const 无体 = 件们.filter((件) => 本体们(a.装饰体们, 件).length === 0)
      .slice(0, 10)
      .map((件) => `${件.家族}@(${件.x.toFixed(1)},${件.z.toFixed(1)}) 看得见的一圈 ${件.外接.toFixed(2)}m`);
    expect(无体.length, `这些件在自己脚下找不到同族的体（体漂开了或压根没登记）：\n${无体.join('\n')}`).toBe(0);
    expect(件们.length, '④ 一个可测的件都没有 ⇒ 全在空转').toBeGreaterThan(100);
  });

  it('体不许比看得见的轮廓瘦：四个直冲方向逐向比支撑', () => {
    const a = 准备();
    const 坏 = [];
    const 族数 = new Set();
    for (const 件 of 每族取样(自有件的体(a), 12)) {
      const 本体 = 本体们(a.装饰体们, 件);
      if (!本体.length) continue;
      族数.add(件.家族);
      const 漏 = 轮廓漏点(件, 本体);
      if (漏.length) 坏.push(`${件.家族}@(${件.x.toFixed(1)},${件.z.toFixed(1)}) ${漏.join('；')}`);
    }
    expect(坏.length, `这些件的体瘦于视觉轮廓，玩家会**看起来撞上了却走过去**：\n${坏.slice(0, 8).join('\n')}`).toBe(0);
    expect(族数.size, `逐向尺寸账只量到 ${族数.size} 族 ⇒ 取样漂了`).toBeGreaterThanOrEqual(6);
  });

  it('孤立地站进件里会被顶出来：脱困落点至少离中心「体的内切 + 玩家半径」', () => {
    const a = 准备();
    const 坏 = [];
    for (const 件 of 每族取样(自有件的体(a), 10)) {
      const 本体 = 本体们(a.装饰体们, 件);
      if (!本体.length) continue;
      const 独 = 只装体(本体);
      const 出 = 独.unpenetrate(件.x, 件.z, 玩家半径, 件.gy);
      const 距 = Math.hypot(出.x - 件.x, 出.z - 件.z);
      const 需 = Math.min(...本体.map(体内切)) + 玩家半径;
      if (距 < 需 - 0.01) 坏.push(`${件.家族}@(${件.x.toFixed(1)},${件.z.toFixed(1)}) 只推出 ${距.toFixed(3)}m，需 ≥ ${需.toFixed(3)}m`);
    }
    expect(坏.length, `这些件挡不住"已经站在它上面"的玩家（体缺失或比视觉轮廓小）：\n${坏.slice(0, 10).join('\n')}`).toBe(0);
  });

  it('孤立地从外面走进去会被挡住：一帧的位移也穿不过这件摆件', () => {
    const a = 准备();
    const 坏 = [];
    const 测过 = new Set();
    for (const 件 of 每族取样(自有件的体(a), 10)) {
      const 本体 = 本体们(a.装饰体们, 件);
      if (!本体.length) continue;
      const 独 = 只装体(本体);
      const 需 = Math.min(...本体.map(体内切)) + 玩家半径;
      const 上界 = Math.max(...本体.map(体外接)) + 玩家半径 + 0.6;
      测过.add(件.家族);
      for (const [dx, dz] of 方向们) {
        const 起距 = 件.外接 + 玩家半径 + 1.2;
        const 出 = 独.moveCircle(件.x + dx * 起距, 件.z + dz * 起距, 玩家半径, -dx * (起距 + 0.5), -dz * (起距 + 0.5), 件.gy);
        const 距 = Math.hypot(出.x - 件.x, 出.z - 件.z);
        if (距 < 需 - 0.01) {
          坏.push(`${件.家族}@(${件.x.toFixed(1)},${件.z.toFixed(1)}) 沿(${dx},${dz}) 直冲 ${(起距 + 0.5).toFixed(1)}m 后停在 ${距.toFixed(3)}m（需 ≥ ${需.toFixed(3)}m）`);
        } else if (距 > 上界) {
          坏.push(`${件.家族}@(${件.x.toFixed(1)},${件.z.toFixed(1)}) 沿(${dx},${dz}) 被推到 ${距.toFixed(3)}m 外（比这件还大出一圈看不见的墙）`);
        }
      }
    }
    expect(坏.length, `这些件的体行为上不合格：\n${坏.slice(0, 10).join('\n')}`).toBe(0);
    const 没测 = [...new Set(自有件的体(a).map((件) => 件.家族))].filter((族名) => !测过.has(族名));
    expect(没测, `这些族一件都没走到 ⇒ 行为腿对它们失明：${没测.join('、')}`).toEqual([]);
  });

  it('拿真世界（所有体一起）走进去：停下时人不许被埋在体里 —— 带朝向的盒法线的见证', () => {
    const a = 准备();
    const 坏 = [];
    let 测过 = 0;
    const 族们 = new Set();
    for (const 件 of 每族取样(自有件的体(a), 10)) {
      族们.add(件.家族);
      const 起距 = 件.外接 + 玩家半径 + 1.2;
      for (const [dx, dz] of 方向们) {
        const sx = 件.x + dx * 起距;
        const sz = 件.z + dz * 起距;
        // 起手格必须干净，否则测的就不是"走进这一件"
        if (a.world.collision.blocksPoint(sx, sz, 件.gy, 玩家半径) || a.world.collision.blocksPoint(sx, sz, 件.gy + 胸口, 玩家半径)) continue;
        const 出 = a.world.collision.moveCircle(sx, sz, 玩家半径, -dx * (起距 + 0.5), -dz * (起距 + 0.5), 件.gy);
        测过 += 1;
        const 埋 = a.world.collision.blocksPoint(出.x, 出.z, 件.gy, -0.06)
          || a.world.collision.blocksPoint(出.x, 出.z, 件.gy + 胸口, -0.06);
        if (埋) 坏.push(`${件.家族}@(${件.x.toFixed(1)},${件.z.toFixed(1)}) 沿(${dx},${dz}) 停在了体里（离中心 ${Math.hypot(出.x - 件.x, 出.z - 件.z).toFixed(3)}m）`);
      }
    }
    expect(坏.length, `这些次行走把人埋进了碰撞体 —— 推出方向算错或格子没收敛：\n${坏.slice(0, 10).join('\n')}`).toBe(0);
    expect(测过, '一次都没走到 ⇒ 这条在空转').toBeGreaterThan(40);
    expect(族们.size, '④ 真世界腿只量到寥寥几族').toBeGreaterThanOrEqual(6);
  });
});

/**
 * 差分量判据：只罚装饰层**新**吃掉的点（装饰前就站不下的不归这一片）。
 *
 * 枢纽广场（`HUB_PLAZA`，缺陷② 切片C）整平台面时这条抓到过一笔旧账：训练木桩出生点
 * @(15,45) 被 `hubBench` 那一体挤开 0.538 m。它不是广场弄坏的 —— 以前木桩站在比长椅低近十米的
 * 沟里，纵向差遮住了横向重叠；台面把两者拉到同一层，人才第一次真的被椅子顶住。修法是让位账本
 * 补上敌人出生点（`WorldDecorations._避让点们()`），枢纽摊圈与椅圈改走同一条 `_clearOfInteractions`。
 *
 * 变异臂（与 `terrain-height` 那批同一次跑）：臂7 把账本退回只读 POI、臂8 让椅圈退回直接按
 * 极坐标落位 —— 两把都只红这一条，无漏无超出。
 */
describe('⑤ 不误伤：装饰层不许吃掉原本站得下的交互点', () => {
  it('POI / 副本入口 / 营火 / 出生点，装饰前站得下的格子装饰后还站得下', () => {
    const a = 准备();
    const 新增 = [];
    for (let i = 0; i < a.点们.length; i += 1) {
      const 前 = a.装饰前[i];
      const 后 = a.装饰后[i];
      const 原本干净 = !前.埋住 && 前.挪开 < 0.01;
      const 现在被吃 = 后.埋住 || 后.挪开 >= 0.01;
      if (原本干净 && 现在被吃) {
        新增.push(`${后.类} "${后.名}" @(${后.x.toFixed(1)},${后.z.toFixed(1)})` +
          `（埋=${后.埋住} 脱困挪了 ${后.挪开.toFixed(3)}m，装饰前都=0）`);
      }
    }
    expect(新增.length, `这些点被装饰层吃掉了：\n${新增.join('\n')}`).toBe(0);
  });

  it('分母自证：四类点都真的量到了（少一类就是取名字的式子漂了）', () => {
    const a = 准备();
    const 每类 = new Map();
    for (const p of a.点们) 每类.set(p.类, (每类.get(p.类) ?? 0) + 1);
    for (const 类名 of ['POI', '副本入口', '敌人出生点', '营火']) {
      expect(每类.get(类名) ?? 0, `"${类名}" 一个点都没取到 ⇒ 差分在空转`).toBeGreaterThan(0);
    }
    expect(a.点们.length).toBeGreaterThanOrEqual(40);
    // 装饰前的读数不许"本来就全被吃掉"：那样⑤的第一条恒真
    const 前干净 = a.装饰前.filter((p) => !p.埋住 && p.挪开 < 0.01).length;
    expect(前干净, `装饰前就只有 ${前干净} 格站得住 —— 差分只能证明"没更坏"，先修量大的那条账`)
      .toBeGreaterThanOrEqual(Math.floor(a.点们.length * 0.5));
  });

  it('登记不吞既有体：总块数 = 装饰前 + 装饰层自己那几块', () => {
    const a = 准备();
    expect(a.world.collision.colliders.length, '装饰层登记体时把已有的挤掉了（add 走了覆盖而不是追加）')
      .toBe(a.体前数 + a.装饰体们.length);
  });
});

describe('⑥ 拆卸不留一堵看不见的墙', () => {
  it('dispose 后带 owner 的体一块不剩，总数回到装饰前', () => {
    const world = buildSeededWorld(世界种子);
    const 体前数 = world.collision.colliders.length;
    const deco = buildSeededDecorations(world, 摆件种子);
    const 一件 = 实例清单(deco, world).find((件) => 件.挡身 && 件.家族 === 'wildTreeTrunk');
    expect(一件, '没扫到一棵挡身的树 ⇒ 这条的"走进去"没得测').toBeTruthy();
    expect(world.collision.colliders.filter(是装饰体).length).toBeGreaterThan(0);
    deco.dispose();
    expect(world.collision.colliders.filter(是装饰体).length, 'dispose 后仍有装饰层登记的体 ⇒ 网格没了、墙还在').toBe(0);
    expect(world.collision.colliders.length).toBe(体前数);
    // 当场走一遍：摘体必须把空间哈希标脏，否则查询还读到旧格子
    const 起距 = 一件.外接 + 玩家半径 + 1.2;
    const 出 = world.collision.moveCircle(一件.x + 起距, 一件.z, 玩家半径, -起距 - 0.5, 0, 一件.gy);
    const 距 = Math.hypot(出.x - 一件.x, 出.z - 一件.z);
    expect(
      距,
      `拆完装饰层后那棵树的位置仍挡得住人（停在离中心 ${距.toFixed(3)}m，没能穿过 ${一件.外接.toFixed(2)}m 宽的轮廓）` +
        ' —— 体摘了但空间哈希没标脏，查询读的还是旧格子'
    ).toBeLessThan(一件.外接 + 玩家半径);
    deco.dispose();
    expect(world.collision.colliders.length, '二次 dispose 摘掉了别人的体').toBe(体前数);
  });
});
