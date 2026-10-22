/**
 * 关卡编辑器的导出载荷 —— **生产读法**（W-B11 切片4）。
 *
 * ## 这一片补的是什么
 *
 * 关卡编辑器（W-B11）能导出一份布局的**几何部分**（房间 / 门 / 六枚尺寸载体），
 * 它的头部就写着「导出 JSON（可被 `ProceduralDungeonGenerator` 读取）」——
 * 但**读的那条路当时不存在**：`ProceduralDungeonGenerator.generate` 只会自己摇一座迷宫，
 * 而「把一份几何补成可玩的布局」那段（出生点 / 出口 / Boss 场 / 门 / 怪 / 文献 / 边界）
 * 长在 `generateMaze` 里 ⇒ 编辑器导出的那份**永远补不全**。
 *
 * 补法：把那段**补完**从 `generateMaze` 里拆出来（`MazeLayout.补完布局`），
 * 于是「游戏自己摇的迷宫」与「编辑器导出的载荷」共用同一段 ⇒ 编辑器那份能进生产路径。
 *
 * ## 尺寸事实只有一份
 *
 * 六枚尺寸载体（`cellSize` / `bossCell` / `wallH` / `wallT` / `doorWidth` / `bossDoorWidth`）
 * 的**名册与回落值**原来写在 `LevelEditor.js` 里 ⇒ 那是**开发工具**的文件 ⇒ 生产路径读不到它。
 * 现在它们住在这里（编辑器反过来从这里取 ⇒ 仍是一份）。
 */
import { 补完布局, makeSeededRng, 校验遭遇表 } from './MazeLayout.js';
import {
  CELL, BOSS_CELL, WALL_H, WALL_T, DOOR_WIDTH, BOSS_DOOR_WIDTH,
} from './dungeonDimensions.js';

/**
 * 布局必须带全的六枚尺寸载体（切片4f 立的合同：尺寸事实声明在 `dungeonDimensions`，
 * 运行时载体在 `layout` 上）。名册与回落值都只在这里写一遍 ⇒ 导入、清场、导出载荷、
 * 生产读法四处都从这一张表走，于是「导出只带其中三枚」（B89）这种漂移没有第四条路可走。
 */
export const LAYOUT_SIZE_CARRIERS = {
  cellSize: CELL,
  bossCell: BOSS_CELL,
  wallH: WALL_H,
  wallT: WALL_T,
  doorWidth: DOOR_WIDTH,
  bossDoorWidth: BOSS_DOOR_WIDTH,
};

/** 六枚载体的名册（导入 / 导出 / 补完都按它走） */
export const 载体名册 = Object.keys(LAYOUT_SIZE_CARRIERS);

/**
 * 读一枚尺寸：缺（`undefined` / `null`）才回落到声明那一份，
 * 带来了就必须是**有限正数**（格数还得是整数），否则当场点名是哪一枚 ——
 * `||` 会把 0 悄悄变成 18，`??` 会把 0 原样收下再让吸附除出 Infinity，两种都比抛错难查（切片4f，⑤ 层）。
 */
export function 读尺寸(名, 值, 默认, 要整数 = false) {
  if (值 === undefined || 值 === null) return 默认;
  if (typeof 值 !== 'number' || !Number.isFinite(值) || 值 <= 0
    || (要整数 && !Number.isInteger(值))) {
    throw new TypeError(`布局里的 ${名} = ${JSON.stringify(值)} —— 得是有限正数${要整数 ? '整数' : ''}，或者干脆不带（那就用声明的那一份）`);
  }
  return 值;
}

/** 载荷里的一间房：格号 / 房心 / 四面墙 + 跨格占用 */
function 读房间(r, 序) {
  if (!r || typeof r !== 'object') {
    throw new TypeError(`载荷里的第 ${序 + 1} 间房不是对象`);
  }
  const { gx, gz } = r;
  if (!Number.isInteger(gx) || !Number.isInteger(gz)) {
    throw new TypeError(`载荷里的第 ${序 + 1} 间房（${r.id ?? '无名'}）的格号不是整数：gx=${JSON.stringify(gx)} gz=${JSON.stringify(gz)}`);
  }
  const walls = r.walls ?? {};
  const 四面 = ['n', 'e', 's', 'w'];
  for (const d of 四面) {
    if (typeof walls[d] !== 'boolean') {
      throw new TypeError(`载荷里的第 ${序 + 1} 间房（${r.id ?? '无名'}）的墙 "${d}" 不是布尔：${JSON.stringify(walls[d])}`);
    }
  }
  for (const 名 of ['x', 'z', 'w', 'd']) {
    if (typeof r[名] !== 'number' || !Number.isFinite(r[名])) {
      throw new TypeError(`载荷里的第 ${序 + 1} 间房（${r.id ?? '无名'}）的 "${名}" 不是有限数：${JSON.stringify(r[名])}`);
    }
  }
  return {
    id: r.id ?? `r_${gx}_${gz}`,
    gx, gz,
    x: r.x, z: r.z, w: r.w, d: r.d,
    walls: { n: walls.n, e: walls.e, s: walls.s, w: walls.w },
    // 跨格占用（`cells` / `cellWalls`）只在房真的跨格时才带 —— 门与占位由同一条规则说话
    ...(r.cells ? { cells: r.cells } : {}),
    ...(r.cellWalls ? { cellWalls: r.cellWalls } : {}),
    cleared: false,
    visited: false,
    hasEnemies: true,
    enemySpawns: [],
    lore: null,
  };
}

/**
 * **生产读法**：把一份编辑器导出的载荷补成可玩的布局。
 *
 * 与 `generateMaze` 的差别只有"房间从哪来"：那边是摇出来的，这边是载荷带来的 ——
 * **补完那一段是同一段**（`补完布局`）⇒ 两边不会各自长出一套"什么算一关"的规则。
 *
 * @param {object} payload 编辑器导出的载荷（`LevelEditor._导出载荷()` 的形状）
 * @param {{encounters: object, seed?: number, gridW?: number, gridH?: number}} 选项
 * @returns {object} 可玩的完整布局（与 `generateMaze` 同形）
 */
export function 布局从载荷(payload, { encounters, seed = Date.now(), gridW, gridH }) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('布局载荷不是一个对象');
  }
  校验遭遇表(encounters, '布局从载荷');
  const W = 读尺寸('gridW', payload.gridW ?? gridW, 5, true);
  const H = 读尺寸('gridH', payload.gridH ?? gridH, 5, true);
  // 名册说清了几格几格：载荷自己带的那一格与调用方说的对不上 ⇒ 当场点名（两份真相不能各说一套）
  if (gridW !== undefined && W !== gridW) {
    throw new TypeError(`载荷里的 gridW = ${W}，但副本定义说的是 ${gridW} —— 两份真相对不上`);
  }
  if (gridH !== undefined && H !== gridH) {
    throw new TypeError(`载荷里的 gridH = ${H}，但副本定义说的是 ${gridH} —— 两份真相对不上`);
  }
  const 房们 = (payload.rooms ?? []).map(读房间);
  if (!房们.length) throw new TypeError('布局载荷里一间房都没有');
  // 种子：载荷自带的那一个优先（编辑器导出时带着它 ⇒ 读回来是**同一座**副本，
  // 不是"每次进来怪的位置都换一批"）。调用方给的 seed 只在载荷没带时兜底。
  const rnd = makeSeededRng(payload.seed ?? seed);
  const 布局 = 补完布局(房们, { gridW: W, gridH: H, rnd, encounters, seed });
  // 六枚尺寸载体：名册给回落值，载荷带了就照它走
  for (const 名 of 载体名册) {
    布局[名] = 读尺寸(名, payload[名], LAYOUT_SIZE_CARRIERS[名]);
  }
  return 布局;
}
