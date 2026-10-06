import * as THREE from 'three';
import { sharedBox, sharedCylinder } from './dungeonAssets.js';
import { CELL } from './dungeonDimensions.js';
import { applyShadow } from '../engine/shadowPolicy.js';

/**
 * 房间模板库 —— 「这一类房间摆什么」只有一份答案（W-B10 切片4）。
 *
 * ## 这一层的合同（切片4e 重写时定下的，之前是含糊的）
 * 1. **模板只管室内装饰**。地面、外墙、门洞、碰撞由 `ProceduralDungeonGenerator._buildRoomGeometry`
 *    建（切片4c 才把门洞那处参数错位修好，`tests/dungeon-wall-gap.test.js` 钉着它的形状）。
 *    模板里再建一遍地面/墙 = 同一块地上叠两层（z-fighting）+ 同一面墙两份碰撞盒。
 * 2. **尺寸读房间，不读模板**。迷宫与关卡编辑器这两个生产者都只往房间上写 `w`/`d`
 *    （`MazeLayout.js` 的 `w: CELL, d: CELL`、`LevelEditor._addRoomAt` 的 `w: template.width`），
 *    所以室内函数读 `room.w`/`room.d`。`tpl.width`/`tpl.depth` 表达的是"这个模板假设的房间大小"，
 *    只在分配时筛掉不贴合的模板（`templateFitsRoom`），不当坐标用。
 * 3. **门的位置由迷宫说了算，模板只声明"这类房间哪几边必须是门、哪几边必须是墙"**。
 *    `ports[dir].required` 要求那一边真的开门，`.solid` 要求那一边真的是实墙 —— 两个都要，
 *    因为室内摆设是**贴着某一边放的**：`lore:double-door` 的读经台靠东西墙，若那一边其实
 *    是门，它就正好站在门洞中间（实测把 4 扇门的洞口堵死，`.tmp-20261004/wb10s4e-door-blockers.mjs`）。
 *    这不是第二套连接规则 —— 墙与门只由 `MazeLayout` 生成一次，模板这边只是筛选候选。
 * 4. **室内不加灯**。每间房一盏火把已由 `_buildRoomGeometry` 放好；模板再加灯就是把实时光
 *    数量交回随机分配（切片1 普查：每场 25/36 盏，全部来自房间本体）。
 * 5. **室内不 `new` 几何**。一律走 `dungeonAssets` 的共享缓存，尺寸写成常量。
 */

/** 模板注册表：key = `id:variant` */
export const ROOM_TEMPLATES = {};

/**
 * 注册一个房间模板。
 * @param {object} tpl
 * @param {string} tpl.id
 * @param {string} tpl.variant
 * @param {number} tpl.width - 假设的房间宽度（米），只供 `templateFitsRoom` 比对，不用于坐标
 * @param {number} tpl.depth
 * @param {object} tpl.ports - { n,e,s,w: { required, solid } }；required 那一边必须真的开门，
 *   solid 那一边必须是实墙。**门宽不在这里**：洞多宽由 `dungeonDimensions` 说一次，模板无权改
 * @param {(group, room, layout, def, ctx) => void} tpl.buildInterior - 只摆室内装饰
 * @param {string[]} [tpl.tags]
 */
export function registerRoomTemplate(tpl) {
  const key = `${tpl.id}:${tpl.variant ?? 'base'}`;
  if (ROOM_TEMPLATES[key]) throw new Error(`Room template ${key} already registered`);
  if (typeof tpl.buildInterior !== 'function') {
    throw new Error(`Room template ${key} 缺 buildInterior —— 模板只负责室内，没有室内函数就没有存在的理由`);
  }
  const ports = {};
  for (const dir of ['n', 'e', 's', 'w']) {
    const p = tpl.ports?.[dir];
    if (p?.required && p?.solid) {
      throw new Error(`Room template ${key} 的 ${dir} 边同时声明 required 与 solid —— 一边不可能既必须是门又必须是墙`);
    }
    ports[dir] = p ? { required: p.required ?? false, solid: p.solid ?? false } : null;
  }
  ROOM_TEMPLATES[key] = { ...tpl, key, ports, tags: tpl.tags ?? [] };
  return key;
}

/** 取模板（variant 省略时认 'base'） */
export function getRoomTemplate(id, variant) {
  return ROOM_TEMPLATES[`${id}:${variant ?? 'base'}`] ?? null;
}

/** 这房间真实开着的门（`walls[dir] === false` 才是门） */
export const openPorts = (room) => ['n', 'e', 's', 'w'].filter((d) => !room.walls?.[d]);

/**
 * 贴合判据：模板假设的房间尺寸等于房间实际尺寸，且模板声明的每一边都对得上 ——
 * `required` 的边真的开着门，`solid` 的边真的是实墙。
 * 这是本层「连接规则」唯一的消费者 —— 分配只从贴合的候选里挑。
 */
export function templateFitsRoom(tpl, room) {
  if (tpl.width !== room.w || tpl.depth !== room.d) return false;
  for (const dir of ['n', 'e', 's', 'w']) {
    const p = tpl.ports[dir];
    if (!p) continue;
    if (p.required && room.walls[dir]) return false;
    if (p.solid && !room.walls[dir]) return false;
  }
  return true;
}

/** 模板声明了几个必开门 —— 分配时「最具体的那个赢」，用它排序 */
export const requiredPortCount = (tpl) =>
  ['n', 'e', 's', 'w'].filter((d) => tpl.ports[d]?.required).length;

/* ===== 室内装饰 ===== */

/** 一件装饰：摆进房间，并把 footprint 交给生成器那一份碰撞表 */
function decor(ctx, group, geometry, material, x, z, y, cw, cd) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  applyShadow(m, 'castOnly');
  group.add(m);
  if (cw && cd) ctx.addCollider(x, z, cw, cd);
  return m;
}

function buildHallStraight(group, room, layout, def, ctx) {
  // 直厅：两侧实墙根各两根壁柱，n↔s 那条通道留着
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      decor(ctx, group, sharedBox(0.8, 4, 0.8), ctx.wallMat,
        room.x + sx * (room.w / 2 - 0.7), room.z + sz * (room.d / 4), 2, 0.8, 0.8);
    }
  }
}

function buildChamberSquare(group, room, layout, def, ctx) {
  // 方厅：四角柱，两条中线让给路
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      decor(ctx, group, sharedCylinder(0.45, 0.55, 3.6, 8), ctx.wallMat,
        room.x + sx * (room.w / 2 - 2.2), room.z + sz * (room.d / 2 - 2.2), 1.8, 1.1, 1.1);
    }
  }
}

function buildJunctionCross(group, room, layout, def, ctx) {
  // 十字口：四只火盆摆在四个对角，正中让给往四面的路
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      decor(ctx, group, sharedCylinder(0.5, 0.35, 1.1, 8), ctx.accentMat,
        room.x + sx * (room.w / 2 - 3), room.z + sz * (room.d / 2 - 3), 0.55, 1, 1);
    }
  }
}

function buildJunctionTee(group, room, layout, def, ctx) {
  // T 口：n/e/s 三面开门，唯一那堵实墙在西侧 —— 壁龛就靠它，两只火盆摆在北门口两侧
  decor(ctx, group, sharedBox(1.6, 2.4, 0.6), ctx.wallMat,
    room.x - (room.w / 2 - 0.6), room.z, 1.2, 0.6, 1.6);
  for (const sx of [-1, 1]) {
    decor(ctx, group, sharedCylinder(0.5, 0.35, 1.1, 8), ctx.accentMat,
      room.x + sx * 3, room.z - (room.d / 2 - 1.6), 0.55, 1, 1);
  }
}

function buildTreasureSmall(group, room, layout, def, ctx) {
  // 宝藏房：必开门在南，基座与宝箱摆在靠北那一侧的中间
  const z = room.z - room.d / 4;
  decor(ctx, group, sharedCylinder(0.7, 0.9, 0.7, 8), ctx.accentMat, room.x, z, 0.35, 1.8, 1.8);
  decor(ctx, group, sharedBox(1.4, 0.9, 1), ctx.accentMat, room.x, z, 1.15, 1.4, 1);
}

function buildLoreDoubleDoor(group, room, layout, def, ctx) {
  // LORE 房：南北对开，两座读经台靠在东西实墙上
  for (const sx of [-1, 1]) {
    decor(ctx, group, sharedBox(0.6, 1.2, 0.6), ctx.wallMat,
      room.x + sx * (room.w / 2 - 0.9), room.z, 0.6, 0.6, 0.6);
  }
}

/** 预置模板注册（模块加载即执行；注册表是数据，谁 import 谁拿到完整的库） */
function registerBaseTemplates() {
  registerRoomTemplate({
    id: 'hall', variant: 'straight', width: CELL, depth: CELL,
    tags: ['hall', 'connector'],
    ports: { n: { required: true }, s: { required: true } },
    buildInterior: buildHallStraight,
  });
  registerRoomTemplate({
    id: 'chamber', variant: 'square', width: CELL, depth: CELL,
    tags: ['chamber', 'combat'],
    ports: { n: {}, e: {}, s: {}, w: {} },
    buildInterior: buildChamberSquare,
  });
  registerRoomTemplate({
    id: 'junction', variant: 'cross', width: CELL, depth: CELL,
    tags: ['junction', 'connector'],
    ports: { n: { required: true }, e: { required: true }, s: { required: true }, w: { required: true } },
    buildInterior: buildJunctionCross,
  });
  registerRoomTemplate({
    id: 'junction', variant: 'tee', width: CELL, depth: CELL,
    tags: ['junction', 'connector'],
    // 三面开门、西侧那堵实墙 —— 壁龛就贴它，所以 w 必须是墙
    ports: { n: { required: true }, e: { required: true }, s: { required: true }, w: { solid: true } },
    buildInterior: buildJunctionTee,
  });
  registerRoomTemplate({
    id: 'treasure', variant: 'small', width: CELL, depth: CELL,
    tags: ['treasure', 'reward'],
    ports: { s: { required: true } },
    buildInterior: buildTreasureSmall,
  });
  registerRoomTemplate({
    id: 'lore', variant: 'double-door', width: CELL, depth: CELL,
    tags: ['lore', 'chamber'],
    // 南北对开 + 东西两堵实墙：读经台贴着东西墙放，那两边一旦是门就正堵门洞（切片4e 实测 4 扇）
    ports: { n: { required: true }, s: { required: true }, e: { solid: true }, w: { solid: true } },
    buildInterior: buildLoreDoubleDoor,
  });
}

registerBaseTemplates();

