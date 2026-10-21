/**
 * 墙段口径 —— 副本与关卡编辑器**共用**的唯一一份（W-B11 切片3）。
 *
 * ## 为什么要把它抽出来
 *
 * 关卡编辑器此前只画房盒与标签（切片0 的实况），于是"这间房四面封死"这件事**在编辑器里
 * 看不见**：摆两间房挨着，编辑器给的是两个孤零零的方盒，看不出中间有没有门 —— 而导出的
 * 载荷里那两间房**确实是通的**（占用推导出了门）。玩家在编辑器里看到的与导出的对不上，
 * 门就成了一句"听说的"。
 *
 * 修法不是"给编辑器再写一份画墙的代码"（那正是切片0 之前的病：规则抄成字面量，
 * `walls: { n: true, e: true, s: true, w: true }`），而是**把墙段这件事本身抽成一份**：
 * 副本的几何层与编辑器的预览层都问它，于是"洞开在哪、洞多宽"这件事只有一处答案。
 *
 * ## 这一份管什么、不管什么
 *
 * - **管**：一面墙上"必须没有墙"的区间（洞位与洞宽）⇒ 挖洞之后剩下的墙段。
 *   纯几何的部分不碰 three。
 * - **不管**：墙段用什么材质、要不要记碰撞体、要不要投阴影 —— 那是**建**的那一步的事，
 *   两侧各有各的诉求（副本要真材质与碰撞体，编辑器要半透明的预览线框且不记碰撞）。
 *
 * ## 洞的来源只有一处
 *
 * `洞在面(room, layout, dir, 沿Z)`：这一面墙上"必须没有墙"的区间，**由门名单说话**。
 * 一条边的旗标是 false ⇒ 那一条边上一定有一扇以这面为 `dir` 的门（占用推导演示过这件事），
 * 所以"旗标说开着、名单里没有门"是名单与旗标脱节 —— 交给 `tests/dungeon-wall-gap.test.js`
 * 的 B79 那一条按半径逐扇量，这里不替它兜底。
 *
 * 为什么按"这一面"而不是"这一扇门"：占 2×2 的 Boss 场，它的"北墙"是**两条格子边**，
 * 可以各开一扇门 —— 改前 `findDoorForRoom` 只回第一扇，第二扇门的位置就没人凿洞。
 */
import * as THREE from 'three';
import { HOLE_WIDTH_CARRIERS } from './dungeonDimensions.js';
import { doorsOnSide } from './MazeLayout.js';
import { uvBox } from './dungeonAssets.js';
import { applyShadow } from '../engine/shadowPolicy.js';

/**
 * **这一扇门所在那个洞的宽度**（W-B10 切片5d，占用推导的口径 4）。
 *
 * 门只带载体名（`holeWidthCarrier` = `'doorWidth'` / `'bossDoorWidth'`），数字仍留在 `layout` 上 ——
 * 把 4 或 5 焊进门名单就是再造一份抄本：导一份 `doorWidth: 6` 的布局进来，墙上的洞是 6 米而门板
 * 还是 4 米，症状是每侧见光一米，跟切片4f 修掉的那 0.25 米同一族。
 * 两条读不到的路都要**当场抛**而不是兜到默认档：认不出档名说明这扇门不是这套几何造出来的
 * （手写 JSON 或旧版存档），兜默认档的症状是朝场的那扇门悄悄退回 4 米，而 537 扇门的宽度读数
 * 看起来"还挺整齐"。
 */
export function 门洞宽(layout, door) {
  const 载体 = door.holeWidthCarrier;
  if (!Object.values(HOLE_WIDTH_CARRIERS).includes(载体)) {
    throw new TypeError(
      `门 ${door.id ?? '(无 id)'} 的 holeWidthCarrier = ${JSON.stringify(载体)} —— 只认 `
      + `${JSON.stringify(Object.values(HOLE_WIDTH_CARRIERS))}（由 reconcileOccupancy 写下，W-B10 切片5d）`
    );
  }
  const 宽 = layout[载体];
  if (!(typeof 宽 === 'number' && Number.isFinite(宽) && 宽 > 0)) {
    throw new TypeError(
      `布局的尺寸载体 ${载体} = ${JSON.stringify(宽)} 不是一个正数 —— 门 ${door.id} 说不出自己的洞多宽`
      + '（`buildGeometry` 开头那份「缺哪一个尺寸字段」的同族，W-B10 切片5d）'
    );
  }
  return 宽;
}

/**
 * 这一间房朝 `dir` 的那一面墙上**必须没有墙**的区间（洞位与洞宽都由门名单说话）。
 *
 * @param {object} room 房间
 * @param {object} layout 布局
 * @param {'n'|'e'|'s'|'w'} dir 那一面
 * @param {boolean} 沿Z 这一面墙是否沿 z 走（e/w 面为 true，n/s 面为 false）
 * @returns {Array<{c:number,w:number}>} 洞（`c` = 沿墙坐标，`w` = 洞宽）
 */
export function 洞在面(room, layout, dir, 沿Z) {
  if (room.walls[dir] !== false) return [];
  return doorsOnSide(layout, room, dir).map((d) => ({ c: 沿Z ? d.z : d.x, w: 门洞宽(layout, d) }));
}

/**
 * 在一条墙线上"挖掉若干洞"之后剩下的墙段。
 * 洞先夹到墙的跨度内、再排序合并（相邻两个洞会合成一个更宽的洞 ——
 * 不合并的症状是两个洞之间夹一段几厘米的墙屑，既看不见又撞得到）。
 *
 * @param {number} 中心 墙线沿墙那一轴的坐标
 * @param {number} 长 墙的总长
 * @param {Array<{c:number,w:number}>} 洞们
 * @returns {Array<{c:number,len:number}>} 剩下的墙段（`c` = 段心，`len` = 段长）
 */
export function 挖洞后的墙段(中心, 长, 洞们) {
  const 起 = 中心 - 长 / 2;
  const 止 = 中心 + 长 / 2;
  const 区间 = [];
  for (const g of 洞们 ?? []) {
    const a = Math.max(起, g.c - g.w / 2);
    const b = Math.min(止, g.c + g.w / 2);
    if (b > a + 1e-9) 区间.push([a, b]);
  }
  区间.sort((p, q) => p[0] - q[0]);

  const 段 = [];
  let 游标 = 起;
  for (const [a, b] of 区间) {
    if (a > 游标 + 1e-9) 段.push({ c: (游标 + a) / 2, len: a - 游标 });
    游标 = Math.max(游标, b);
  }
  if (止 > 游标 + 1e-9) 段.push({ c: (游标 + 止) / 2, len: 止 - 游标 });
  return 段;
}

/**
 * 一间房四面墙的**面表** —— 每面给出：墙心（沿墙那一轴）、墙长、这一面的洞。
 *
 * 这是"墙线"这件事的唯一定义处：Boss 场（占 2×2）与普通房（1×1）的差别只体现在
 * `长` 与 `心` 上，**洞的来源完全相同**（都是 `洞在面`）。
 *
 * ## `原点` 与坐标系（两侧约定不同，这一格就是唯一的转换口）
 *
 * - **副本侧**（`ProceduralDungeonGenerator`）：房间组摆在原点，房间盒与墙段都用**世界坐标**。
 *   ⇒ `原点` 传 `null`。
 * - **编辑器侧**（`LevelEditor`）：那一组 `Group` 就摆在房心，盒子与墙段都是它的**孩子**
 *   （局部坐标）—— 改前 Group 被 `_drag` 搬到落点、盒子又按房间坐标摆在自己 inside，
 *   画面落在"落点 + 原位置"（B88 的双重偏移）。⇒ `原点` 传 `{ x: room.x, z: room.z }`。
 *
 * 两边的坐标约定不同是**既有事实**，硬把编辑器改成世界坐标只会把 B88 那条双重偏移请回来。
 * 于是转换点收在这一格：谁用哪边，由调用方说清。
 *
 * @param {object} room 房间
 * @param {object} layout 布局
 * @param {{x:number,z:number}|null} [原点] 墙心相对哪一点算；`null` = 世界坐标
 * @returns {Array<{dir:'n'|'e'|'s'|'w', 沿Z:boolean, 心x:number, 心z:number, 长:number, 洞:Array}>}
 */
export function 房间墙面表(room, layout, 原点 = null) {
  const rw = room.w;
  const rd = room.d;
  const ox = 原点 ? 原点.x : 0;
  const oz = 原点 ? 原点.z : 0;
  return [
    { dir: 'n', 沿Z: false, 心x: room.x - ox, 心z: room.z - rd / 2 - oz, 长: rw },
    { dir: 's', 沿Z: false, 心x: room.x - ox, 心z: room.z + rd / 2 - oz, 长: rw },
    { dir: 'w', 沿Z: true, 心x: room.x - rw / 2 - ox, 心z: room.z - oz, 长: rd },
    { dir: 'e', 沿Z: true, 心x: room.x + rw / 2 - ox, 心z: room.z - oz, 长: rd },
  ].map((面) => {
    const 洞 = 洞在面(room, layout, 面.dir, 面.沿Z);
    // 洞的沿墙坐标要**跟着换到同一个坐标系** —— 门名单给的是世界坐标，而墙心此刻
    // 已经是局部的（编辑器侧）。不平移的话洞永远落不到墙上：症状是"编辑器里每面墙都是
    // 一整条、门一个都不开"，而门名单与旗标都对着（因为它们读的是**另一份**坐标）。
    const 平移 = 面.沿Z ? oz : ox;
    return { ...面, 洞: 洞.map((g) => ({ ...g, c: g.c - 平移 })) };
  });
}

/**
 * 把一面墙的段表建进 three —— 副本侧与编辑器侧共用这一段**建**的代码，
 * 差别只在传进来的材质与"要不要记碰撞体"。
 *
 * @param {THREE.Object3D} group 挂进去的那一层
 * @param {THREE.Material} mat 墙段材质
 * @param {{心x:number,心z:number,长:number,沿Z:boolean}} 面 那一面
 * @param {Array<{c:number,w:number}>} 洞们 这一面要挖的洞
 * @param {object} 选项
 * @param {number} 选项.高 墙高
 * @param {number} 选项.厚 墙厚
 * @param {(x:number,z:number,w:number,d:number)=>void} [选项.记碰撞] 记一个碰撞盒（编辑器不记）
 * @param {boolean} [选项.投阴影] 造出来的段要不要按 `prop` 投阴影（编辑器预览不投）
 * @returns {THREE.Mesh[]} 建出来的墙段
 */
export function 建一面墙(group, mat, 面, 洞们, 选项) {
  const { 心x, 心z, 长, 沿Z } = 面;
  const 中心 = 沿Z ? 心z : 心x;
  const 段表 = 洞们?.length ? 挖洞后的墙段(中心, 长, 洞们) : [{ c: 中心, len: 长 }];
  const 建 = [];
  for (const 段 of 段表) {
    const x = 沿Z ? 心x : 段.c;
    const z = 沿Z ? 段.c : 心z;
    const w = 沿Z ? 选项.厚 : 段.len;
    const d = 沿Z ? 段.len : 选项.厚;
    // uvBox：墙段宽度从整墙（18 米）到门旁那截不等，UV 以米计它们才是同一个砖尺寸
    const mesh = new THREE.Mesh(uvBox(w, 选项.高, d), mat);
    mesh.position.set(x, 选项.高 / 2, z);
    mesh.userData.isWall = true;
    if (选项.投阴影 !== false) applyShadow(mesh, 'prop');
    group.add(mesh);
    选项.记碰撞?.(x, z, w, d);
    建.push(mesh);
  }
  return 建;
}
