import { LORE_FRAGMENTS } from '../game/LoreFragments.js';
import {
  CELL, BOSS_CELL, BOSS_SPAN, WALL_H, WALL_T, DOOR_WIDTH, BOSS_DOOR_WIDTH, SPAWN_SPAN_MARGIN,
  HOLE_WIDTH_CARRIERS,
} from './dungeonDimensions.js';

/** 四个方向 → 一格之内的偏移 */
export const DIR_STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
/** 一面墙的对面 */
export const DIR_OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
/** 遍历方向时的固定顺序（门的名单按这个序发，改动它等于换一座迷宫） */
export const DIRS = ['n', 'e', 's', 'w'];

/**
 * 格号 → 房心（米）。B86 的根就是这句话被说了两遍：生成器写 `(gx − gridW/2) * cellSize`
 * （网格居中），编辑器反推格号写 `round(x / cellSize)`（原点格），两条口径差 gridW/2 格，
 * 于是"位置一毫米没动"的一次拖动就把 `r_0_0` 改名成 `r_-3_-3`。现在两侧都问这一对函数。
 */
export const cellCenter = (g, gridCount, cellSize) => (g - gridCount / 2) * cellSize;
/** 房心 → 格号：`cellCenter` 的逆，两者必须同进同出 */
export const cellIndex = (world, gridCount, cellSize) => Math.round(world / cellSize + gridCount / 2);
/**
 * 一间房占的格。普通房就是它自己那一格；Boss 场占 2×2（`cells` 由 `generateMaze` 写下，
 * 关卡编辑器导入的 JSON 也可以带 —— 带了就得跟着走，见 `reconcileOccupancy` 的占用表）。
 */
export const cellsOf = (room) => room.cells ?? [[room.gx, room.gz]];
/**
 * 这一间房相对**锚格**的格子偏移（锚就是 `gx,gz`；1×1 的房就是 `[[0,0]]`）。
 * 编辑器把房间拖到一格时要连它占的那几格一起搬，靠的就是这份偏移。
 */
export const cellOffsets = (room) => cellsOf(room).map(([cx, cz]) => [cx - room.gx, cz - room.gz]);
/** 沿 `x` / `z` 轴跨的格数（1×1 的房两个数都是 1，`spanCenter` 因此逐字退回 `cellCenter`） */
export const spanOf = (room, axis) => {
  const 号 = cellsOf(room).map((c) => (axis === 'x' ? c[0] : c[1]));
  return Math.max(...号) - Math.min(...号) + 1;
};
/**
 * 跨格房**每一条格子边**的旗标：`cellWalls[\`${gx},${gz}\`][dir]`。
 * 为什么房间级那四面旗不够用：Boss 场占四格，它的一面"北墙"其实是两条格子边，
 * 迷宫里完全可能一条开着、一条封着。只看房间级就会两条都开 —— 多出来的那一扇不是门，
 * 是墙上一个走不通的洞（口径 1 说的那件事）。普通房没有这张表，读回落后的房间级。
 */
const 格键 = (cx, cz) => `${cx},${cz}`;
const 边旗 = (room, cx, cz, dir) => room.cellWalls?.[格键(cx, cz)]?.[dir] ?? room.walls[dir];
const 写边旗 = (room, cx, cz, dir, v) => {
  const 这一格 = room.cellWalls?.[格键(cx, cz)];
  if (这一格) 这一格[dir] = v;
  else room.walls[dir] = v;
};
/**
 * 逐格边的写口（关卡编辑器按**边**开旗，不自己再造一份"这一格有没有表"的分叉）。
 * 口径只在这里说一次：跨格的房一面"北墙"是两条格子边，按房间级那四面旗写就会把另一条也开，
 * 症状不是少一扇门，是墙上一个走不通的洞（见上面那段）。
 */
export const setEdgeFlag = 写边旗;
/**
 * 跨格房的房心：锚格房心 + 半个跨距。1×1 时逐毫米等于 `cellCenter`（那一对函数是它的特例，
 * B86 的"口径只有一对"因此没有被分成两套）。
 */
export const spanCenter = (anchor, span, gridCount, cellSize) => cellCenter(anchor, gridCount, cellSize) + ((span - 1) * cellSize) / 2;
/** `spanCenter` 的逆：从世界坐标反推**锚格**（1×1 时逐字等于 `cellIndex`） */
export const spanAnchorIndex = (world, gridCount, cellSize, span) => cellIndex(world - ((span - 1) * cellSize) / 2, gridCount, cellSize);
/**
 * 这扇门相对于**这一间房**在哪一面：门自己说的是"我从哪间房朝哪个方向开"，
 * 另一头看到的永远是那一面（`DIR_OPPOSITE`）。按坐标反推要带 epsilon，按声明反推不用。
 */
export const doorsOnSide = (layout, room, dir) => (layout.doors ?? []).filter(
  (d) => (d.fromRoomId === room.id && d.dir === dir)
    || (d.toRoomId === room.id && DIR_OPPOSITE[d.dir] === dir),
);

/**
 * **墙与门由占用推导**（W-B11 切片1；跨格占位与"门落在共用边界上"由 W-B10 切片5d 补进来）。
 * 一句话：一面旗标只有在"那一边真的邻着别的房"时才算门，一条共用边界由两侧**共同**决定，
 * 门的位置是**两个房间相对那面的边的中点**（跨体垂直方向上还要真的重叠一段）。
 *
 * 为什么要有这一份：改前这条规则以两种形态各说一遍 —— 生成器在 `generateMaze` 里内联
 * 一段"扫每间房的 n/e 两面就造门"的循环，而关卡编辑器把它**抄成了一份看起来像常量的字面量**
 * （`walls: { n: true, e: true, s: true, w: true }`）再配两个空壳函数 `_updateAdjacentWalls` /
 * `_updateAllAdjacentWalls`。症状实测三条（`.tmp-20261006/wb11s1-census.mjs`）：
 * - 编辑器自己放的房间**四面全实、doors 恒为空** ⇒ 导出的 JSON 进副本就是一排封死的盒子；
 * - 删一间房之后那 3 扇门一扇没动（悬空指着不存在的房），而邻居留下的 3 面"朝空的洞"
 *   照旧被建成门洞 —— 墙上一个豁口，外面是虚空；
 * - 拖一间房之后门不跟着搬，房间改名，于是门的两端里那一端找不到了。
 *
 * 四条口径与理由：
 * 1. **旗标朝向的格子里没有一个真的邻居 ⇒ 收回成实墙**。空格子上不存在"另一侧"，那一边只能是墙；
 *    留着它的症状不是少一扇门，而是几何层真的在墙上开一个走不通的洞。归一与造门问的都是
 *    **每一条格子边**（`cellWalls`），不是房间级那四面旗：Boss 场占四格，它的"北墙"是两条边，
 *    迷宫里完全可能一条开一条封 —— 按房间级发就会把那一条封着的也开成洞（口径 1 说的正是这个洞）。
 *    房间级 `walls[dir]` 因此由格子边**推出来**（那一边有任何一条边开着就是 `false`），
 *    模板与几何读的还是房间级那一份。
 * 2. **共用边界两侧不一致时取"开着"那一侧**（并侧）。一句话说清为什么不是取"实墙"：
 *    两侧里任何一侧说"这里要开门"都是一个**意图**，抹掉意图的症状是修不出通路（作者看不见自己
 *    开的门，导出后那一边仍是实墙），而照意图补齐的症状只是多一扇门 —— 前者会让工具不可用。
 * 3. **门的位置 = 两个房间相对那条边界的那两面边的中点，垂直方向取两段跨体重叠区间的中点**。
 *    对一对同尺寸的相邻格子来说，这两句算出来的就是两房房心的正中，与改前逐毫米相同
 *    （537 扇门实测最大偏差 0，`.tmp-20261006/wb11s1-census.mjs` ⑦）。改成边与跨体之后，
 *    `cellSize` 从这条规则里彻底退出，而且**两房尺寸不同也认得清那条边界**：Boss 场真占 2×2
 *    （切片5d，修 B79 的因 / B85），它的墙线就是格线，所以朝向它的那扇门落在**场自己的墙上**，
 *    不再站进邻居屋里 —— 改前那九扇门站在 ±9 而场墙在 ±17，场四面墙一扇门板都没有。
 * 4. **一扇门说得出"自己的洞宽由哪一枚载体说话"**（`door.holeWidthCarrier` = `'doorWidth'` 或
 *    `'bossDoorWidth'`，尺寸本身留在 `layout` 上）。同一条墙线由两房合建，两侧各开一个不同宽度的洞，
 *    实际开口就是两者较窄的那个加一段墙屑 —— 所以宽度必须由**门**决定一次，两侧照着它开。
 *    朝向 Boss 场的那扇门认 `bossDoorWidth`，其余认 `doorWidth`。这里刻意**不抄数字**：
 *    切片4f 立的口径是"声明在 `dungeonDimensions`，运行时载体在 `layout`"，把 4 或 5 焊进门名单
 *    等于再造一份抄本 —— 导进一份 `doorWidth: 6` 的布局，门还按 4 走，正是那一片修掉的形状。
 *
 * `previousDoors` 只用来**继承运行时态**（`open` / `locked`）：门是按 `d_{格X}_{格Z}_{方向}` 命名的，
 * 房间一改名、一格拖动之后重新推导就会拿到同一枚 id，若无条件重置成"关着、锁着"，
 * 编辑器里打开过的那扇门会在每次编辑后自己关上。id 里的格子现在是**那条边界所在的格子**，
 * 对 1×1 的房来说与改前的"锚格"是同一个数。
 *
 * **返回的门名单顺序 = `rooms` 数组序 × 那一间的格子序 × `n` 再 `e`**，与改前的内层循环逐字同形
 * （普通房只有一格，格子序不承担东西）。这一条不是风格：`findFarthestRoom` 的 BFS 访问序吃门的
 * 数组序，访问序决定"哪间房是 Boss 场"，Boss 场决定整条随机流后面摇到什么 —— 顺序一动就换一座迷宫。
 */
export function reconcileOccupancy(rooms, previousDoors = []) {
  const byCell = new Map();
  for (const room of rooms) {
    if (!Number.isFinite(room?.gx) || !Number.isFinite(room?.gz)) {
      throw new TypeError(
        `占用推导收到一间没有格号的房（下标 ${rooms.indexOf(room)}，gx=${显示(room?.gx)} gz=${显示(room?.gz)}）`
        + ' —— 布局里每一间房都得站在一个有限的整数格上（W-B11 切片1）'
      );
    }
    for (const dir of DIRS) {
      if (typeof room.walls?.[dir] !== 'boolean') {
        throw new TypeError(
          `${room.id ?? `下标 ${rooms.indexOf(room)}`}.walls.${dir} = ${显示(room.walls?.[dir])} —— 墙得写成布尔：`
          + '写成 `undefined` 时"这一面是墙还是门"没有答案，而 `templateFitsRoom` 会把"没有答案'
          + '"当成"开着门"（W-B11 切片1）'
        );
      }
    }
    // 跨体（口径 3 的那把尺）：门位量的是两房各自的边，`NaN` 在这里不崩，只摇出一扇站在虚空里的门。
    // 这一条为什么现在才有：改前门位由格号算，`w/d` 只是给几何层看的；改成量边之后它是输入。
    for (const 轴 of ['w', 'd']) {
      const 值 = room[轴];
      if (typeof 值 !== 'number' || !Number.isFinite(值) || 值 <= 0) {
        throw new TypeError(
          `${room.id ?? `下标 ${rooms.indexOf(room)}`}.${轴} = ${显示(值)} —— 跨体得是有限正数`
          + '（W-B10 切片5d，口径 3）'
        );
      }
    }
    for (const [cx, cz] of cellsOf(room)) {
      if (!Number.isInteger(cx) || !Number.isInteger(cz)) {
        throw new TypeError(
          `${room.id}.cells 里有一格 (${显示(cx)}, ${显示(cz)}) 不是整数 —— 跨格的房也得站在整数格上（W-B10 切片5d）`
        );
      }
      const 键 = 格键(cx, cz);
      const 已 = byCell.get(键);
      if (已) {
        throw new TypeError(
          `两间房站在同一格 ${键}（${已.id} 与 ${room.id}）—— 占用推导只认一间，先删掉重复的那间（W-B11 切片1）`
        );
      }
      byCell.set(键, room);
    }
    // 跨格的房必须逐格交代每一条边：房间级那四面旗说不出"北墙的两条边一条开一条封"。
    // 缺这张表的 JSON 不兜底 —— 兜出来的是把一条边复制到四条边上，正是口径 1 要禁的那个洞。
    if (cellsOf(room).length > 1) {
      for (const [cx, cz] of cellsOf(room)) {
        for (const dir of DIRS) {
          if (typeof room.cellWalls?.[格键(cx, cz)]?.[dir] !== 'boolean') {
            throw new TypeError(
              `${room.id} 占 ${cellsOf(room).length} 格，但 ${格键(cx, cz)} 的 .cellWalls.${dir} = `
              + `${显示(room.cellWalls?.[格键(cx, cz)]?.[dir])} —— 跨格的房每一条格子边都得写成布尔`
              + '（`_导出载荷` 带 `cells` 与 `cellWalls` 两份，W-B10 切片5d）'
            );
          }
        }
      }
    }
  }

  // 1 + 2：先归一**每一条格子边**的旗标，再按归一后的旗标造门 —— 两步分开写，顺序不能倒
  for (const room of rooms) {
    for (const [cx, cz] of cellsOf(room)) {
      for (const dir of DIRS) {
        if (边旗(room, cx, cz, dir) !== false) continue;
        const [dx, dz] = DIR_STEP[dir];
        const 邻 = 邻边(room, cx, cz, dir, byCell);
        if (!邻) {
          写边旗(room, cx, cz, dir, true);
          continue;
        }
        const back = DIR_OPPOSITE[dir];
        // 并侧：两侧任何一侧说"这里要开门"都是一个意图（跨格的另一侧要写回**它对着这一条边的那一格**）
        写边旗(邻, cx + dx, cz + dz, back, false);
      }
    }
  }
  // 房间级的旗标由格子边推出来（模板与几何读的是房间级：那一边"有没有门"= 任何一条格子边开着）
  for (const room of rooms) {
    for (const dir of DIRS) {
      room.walls[dir] = cellsOf(room).every(([cx, cz]) => 边旗(room, cx, cz, dir) !== false);
    }
  }

  const 状态 = new Map();
  for (const d of previousDoors) {
    if (d && d.id) 状态.set(d.id, { open: d.open === true, locked: d.locked !== false });
  }

  const doors = [];
  for (const room of rooms) {
    for (const [格x, 格z] of cellsOf(room)) {
      // 只发 n/e 两面：一条共用边界有两个房各自的一面，发两遍就是同一扇门的门板与碰撞各两份。
      // 西侧/南侧那两面已经由邻居以 n/e 的名义发过了。
      for (const dir of ['n', 'e']) {
        if (边旗(room, 格x, 格z, dir) !== false) continue;
        const [dx, dz] = DIR_STEP[dir];
        const to = byCell.get(格键(格x + dx, 格z + dz));
        if (!to || to === room) continue; // 跨格房的自己那一格：场内部不存在门（切片5d）
        const id = `d_${格x}_${格z}_${dir}`;
        const 旧 = 状态.get(id);
        doors.push({
          id, dir,
          ...共用边界(格x, 格z, dir, room, to),
          fromRoomId: room.id,
          toRoomId: to.id,
          holeWidthCarrier: 邻我皆场(room, to) ? HOLE_WIDTH_CARRIERS.boss : HOLE_WIDTH_CARRIERS.normal,
          locked: 旧 ? 旧.locked : true,
          open: 旧 ? 旧.open : false,
        });
      }
    }
  }
  return doors;
}

/** 门的两端里任何一端是 Boss 场 ⇒ 这一扇是"进场的门"，洞宽认场那一档载体 */
const 邻我皆场 = (a, b) => a.isBossArena === true || b.isBossArena === true;

/**
 * 这一间房在 (`cx`,`cz`) 那一格朝 `dir` 的**那一条边**对过去的邻居；
 * 没有占用者、或者占用者是它自己（跨格房的两格相邻）都算"那一边邻着空处"。
 */
function 邻边(room, cx, cz, dir, byCell) {
  const [dx, dz] = DIR_STEP[dir];
  const n = byCell.get(格键(cx + dx, cz + dz));
  return n && n !== room ? n : null;
}

/**
 * 一扇门在它那条共用边界上的位置（口径 3）。
 *
 * - **沿轴**（分隔面垂直的那一轴）：两房各自朝对方那一面边的中点。同尺寸相邻两房算出来
 *   就是两房心的正中 —— 与改前逐毫米相同。
 * - **垂直轴**：两段跨体重叠区间的中点。Boss 场跨两格而邻居只有一格，重叠区间就是
 *   邻居自己那一段，中点即邻居的房心 —— 所以门仍然在邻居的墙正中，但**沿轴**那一句把它
 *   从"两房心之间"搬到了"场墙上"（B85）。
 * - 跨体在垂直方向上根本不重叠 ⇒ 旗标说这里有门而坐标说这里没有，抛。够不着的情况只可能
 *   来自一份自相矛盾的 JSON（`cells` 与 `w/d` 互不相认），而 JSON 导入是这个模块唯一的外部入口。
 */
function 共用边界(格x, 格z, dir, room, to) {
  const 横 = dir === 'e' || dir === 'w';
  const [甲, 乙] = dir === 'e' || dir === 's' ? [room, to] : [to, room];
  const 线 = 横
    ? (甲.x + 甲.w / 2 + 乙.x - 乙.w / 2) / 2
    : (甲.z + 甲.d / 2 + 乙.z - 乙.d / 2) / 2;
  const 叠 = 横 ? 重叠中点(甲.z, 甲.d, 乙.z, 乙.d) : 重叠中点(甲.x, 甲.w, 乙.x, 乙.w);
  if (叠 === null) {
    throw new TypeError(
      `${room.id} 与 ${to.id} 在 ${格x},${格z} 的 ${dir} 方向共用一条边界，但两间房的跨体在墙上轴上`
      + `不重叠（${横 ? `z ${甲.z}±${甲.d / 2} 与 ${乙.z}±${乙.d / 2}` : `x ${甲.x}±${甲.w / 2} 与 ${乙.x}±${乙.w / 2}`}）`
      + ' —— 旗标说这里有一扇门，坐标说这里够不着（W-B10 切片5d）'
    );
  }
  return 横 ? { x: 线, z: 叠 } : { x: 叠, z: 线 };
}

/** 两段 [心 ± 半长] 重叠区间的中点；不重叠回 null */
function 重叠中点(心1, 长1, 心2, 长2) {
  const 起 = Math.max(心1 - 长1 / 2, 心2 - 长2 / 2);
  const 止 = Math.min(心1 + 长1 / 2, 心2 + 长2 / 2);
  return 止 > 起 ? (起 + 止) / 2 : null;
}

/**
 * 递归回溯迷宫 → 房间+门+墙+Boss 大房
 *
 * 「这一座出哪几类、一间房出几只」由调用方递进来的遭遇表说话（`content/dungeonEncounters.js`，
 * W-B10 切片3b）。这一句以前写死在这里：`['soldier','golem','drone'][摇 3]` 配 `1 + 摇 2` 只，
 * 于是五座副本打的是同一场仗（普查 `.tmp-20260930/wb10s1-census.mjs` M2 —— 各跑 200 个种子，
 * 直方图 34 / 34 / 33，无怪房 0 间）。第 4 个参数**必填**：留一个默认池等于把
 * "这座副本忘了登记" 变成 "这座副本悄悄用了别座的敌人"，而后者不是报错，是没人注意的换仗。
 */
/**
 * 造迷宫：**只有房间**（递归回溯 + 每格一间房）。
 *
 * 为什么要单独拆出来（W-B11 切片4）：关卡编辑器导出的是**布局的几何部分**
 * （房间 / 门 / 六枚尺寸载体），而生产路径还要在这份几何之上**补完**
 * （出生点 / 出口 / Boss 场 / 门 / 怪 / 文献 / 边界）—— 那段此前长在 `generateMaze` 里，
 * 于是「编辑器导出的载荷」与「游戏自己摇的迷宫」走的是两条路，编辑器那份永远补不全。
 *
 * 拆开之后两边共用同一段**补完** ⇒ 编辑器导出的载荷也能进生产路径。
 *
 * @param {number} gridW @param {number} gridH @param {() => number} rnd 种子流
 * @returns {object[]} 每格一间房（还没补完）
 */
export function 造迷宫房间(gridW, gridH, rnd) {
  const visited = Array.from({ length: gridH }, () => Array(gridW).fill(false));
  const walls = Array.from({ length: gridH }, () =>
    Array.from({ length: gridW }, () => ({ n: true, e: true, s: true, w: true }))
  );

  const stack = [[0, 0]];
  visited[0][0] = true;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const neighbors = [];
    if (cz > 0 && !visited[cz - 1][cx]) neighbors.push([cx, cz - 1, 'n', 's']);
    if (cx < gridW - 1 && !visited[cz][cx + 1]) neighbors.push([cx + 1, cz, 'e', 'w']);
    if (cz < gridH - 1 && !visited[cz + 1][cx]) neighbors.push([cx, cz + 1, 's', 'n']);
    if (cx > 0 && !visited[cz][cx - 1]) neighbors.push([cx - 1, cz, 'w', 'e']);
    if (!neighbors.length) { stack.pop(); continue; }
    const pick = neighbors[Math.floor(rnd() * neighbors.length)];
    const [nx, nz, dir, opp] = pick;
    walls[cz][cx][dir] = false;
    walls[nz][nx][opp] = false;
    visited[nz][nx] = true;
    stack.push([nx, nz]);
  }

  const rooms = [];
  for (let gz = 0; gz < gridH; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      rooms.push({
        id: `r_${gx}_${gz}`,
        gx, gz,
        x: cellCenter(gx, gridW, CELL),
        z: cellCenter(gz, gridH, CELL),
        w: CELL, d: CELL,
        walls: { ...walls[gz][gx] },
        cleared: false,
        visited: false,
        hasEnemies: true,
        enemySpawns: [],
        lore: null,
      });
    }
  }
  return rooms;
}

/**
 * 补完：给一份**只有房间**的布局补上出生点 / 出口 / Boss 场 / 门 / 怪 / 文献 / 边界。
 *
 * 这是「几何」与「可玩」之间那一段（W-B11 切片4）：
 * - **出生点** = (0,0) 那一格；**出口（Boss 场）** = 离出生点最远的那一间；
 * - **Boss 场真占 2×2 格位**（合并成一间 36×36 的场，块内的隔墙先封掉）；
 * - **门与占位**由同一条规则说话（`reconcileOccupancy` 是这条规则的唯一一份）；
 * - 每间房出几只、出哪一类，由递进来的**遭遇表**说话；
 * - **文献**在洗过的池子里按概率发（同一颗种子连摇两次落点一字不差）。
 *
 * @param {object[]} rooms 只有房间的布局（`造迷宫房间` 的产物，或编辑器导出的那份）
 * @param {{gridW:number, gridH:number, rnd:() => number, encounters:object, seed:number}} 选项
 * @returns {object} 可玩的完整布局
 */
export function 补完布局(rooms, { gridW, gridH, rnd, encounters, seed }) {
  // 门与占位由同一条规则说话（`reconcileOccupancy` 是这条规则的唯一一份，关卡编辑器问的是同一个函数）。
  // 改前这里是内联的 `if (!w.n && gz > 0) doors.push(makeDoor(...))` 循环：它对生成的迷宫
  // 恰好等价（每格都有房、两侧旗标同时被回溯步写下），所以摘要是同一个数 —— 这正是
  // "把它提成共享规则而不是再造一份"的依据。
  const spawn = rooms.find((r) => r.gx === 0 && r.gz === 0) ?? rooms[0];
  // 合并**之前**的那一份门名单只喂 BFS：谁离出生间最远 = 哪一间是 Boss 场，这一步必须在缩点之前问
  const exit = findFarthestRoom(spawn, rooms, reconcileOccupancy(rooms));
  spawn.hasEnemies = false;
  spawn.cleared = true;
  spawn.visited = true;

  exit.isExit = true;
  exit.isBossArena = true;
  exit.hasEnemies = true;
  // **Boss 场真占 2×2 格位**（W-B10 切片5d，修 B79 的因 / B85 / B102）：把 `exit` 所在那一格与它
  // 邻着的三格并成一间 36×36 的场，块内的三条隔墙在进占用推导**之前**封掉，于是场的墙线与格线
  // 逐毫米重合 —— 朝场开的那些门落在场自己的墙上，而不是站进邻居屋里。
  const 场房 = 合并成场(rooms, 选场块(exit, spawn, gridW, gridH), exit, gridW, gridH);
  // 场的尺寸与房心由 `合并成场` 写下，**必须早于**这一次推导：`共用边界` 量的是两房各自的边，
  // 场还按 18×18 参与的话，朝它开的那些门就会落在合并前的旧墙线上（B86 那一族"同一个位置两套口径"）。
  const doors = reconcileOccupancy(场房);
  exit.enemySpawns = [];
  exit.bossSpawn = { x: exit.x, z: exit.z };

  for (const room of 场房) {
    if (room.id === spawn.id || room.isExit) continue;
    // 一次几只、出哪一类：两个数都从遭遇表来。编组公式与切片3b 之前逐字同形
    // （`min + 摇 (max-min+1)` 在 min=1,max=2 时就是原来的 `1 + 摇 2`），
    // 因为这一片改的是"**出谁**"而不是"难度曲线"——同时动两个变量就没法归因。
    const { min, max } = encounters.group;
    const n = min + Math.floor(rnd() * (max - min + 1));
    // 每只多硬、叫什么，W-B10 切片2 已经交给 `content/enemies.js` 那一名册，所以这里不写 hp。
    for (let i = 0; i < n; i++) {
      room.enemySpawns.push({
        x: room.x + (rnd() - 0.5) * (CELL - SPAWN_SPAN_MARGIN),
        z: room.z + (rnd() - 0.5) * (CELL - SPAWN_SPAN_MARGIN),
        type: drawFromPool(encounters.pool, rnd),
      });
    }
  }

  // 洗的是文献池与"发文献的房序"两份**副本**：`rooms` 本体保持网格序（见 `shuffle` 的说明）。
  const lorePool = shuffle(LORE_FRAGMENTS, rnd);
  let li = 0;
  for (const room of shuffle(场房, rnd)) {
    if (room.isExit || room.id === spawn.id) continue;
    if (rnd() > 0.55 && li < lorePool.length) {
      room.lore = { ...lorePool[li++], discovered: false };
    }
  }

  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const room of 场房) {
    minX = Math.min(minX, room.x - room.w / 2);
    maxX = Math.max(maxX, room.x + room.w / 2);
    minZ = Math.min(minZ, room.z - room.d / 2);
    maxZ = Math.max(maxZ, room.z + room.d / 2);
  }

  return {
    seed, gridW, gridH, cellSize: CELL, bossCell: BOSS_CELL,
    // 门洞宽跟着布局走：几何层与编辑器读**这一份**，不再各自抄一个 4（切片4f）。
    doorWidth: DOOR_WIDTH, bossDoorWidth: BOSS_DOOR_WIDTH,
    rooms: 场房, doors, spawn, exit,
    bounds: { minX, maxX, minZ, maxZ },
    wallH: WALL_H, wallT: WALL_T,
  };
}

/**
 * 递归回溯迷宫 → 房间 + 门 + Boss 大房。
 *
 * 「这一座出哪几类、一间房出几只」由调用方递进来的遭遇表说话（`content/dungeonEncounters.js`，
 * W-B10 切片3b）。这一句以前写死在这里：`['soldier','golem','drone'] × 3` + `1 + ?2` 只，
 * 于是五座副本打的是同一场仗（各跑 200 个种子，直方图 34 / 34 / 33，无怪房 0 间）。
 * 第 4 个参**必填**：留一个默认池等于「这座副本忘了登记」变成「这座副本悄悄用了别座的敌人」，
 * 而后者不是报错，是没人注意的换仗。
 *
 * 这一版由**两段**组成（`造迷宫房间` + `补完布局`）—— 拆开是为了让
 * **关卡编辑器的导出载荷**也能走同一段「补完」（W-B11 切片4）。
 */
/**
 * 「这一座出哪几类、一间房出几只」必须由调用方申领 —— 留一个默认池等于
 * 「这座副本忘了登记」变成「这座副本悄悄用了别座的敌人」，而后者不是报错，是没人注意的换仗。
 *
 * 两条路都过这道闸（W-B11 切片4）：游戏自己摇的迷宫（`generateMaze`）与
 * **关卡编辑器导出的载荷**（`布局从载荷`）—— 载荷那条路以前根本没有「出谁」这件事，
 * 于是编辑器那份副本会**一只怪都不出**（不是报错，是一座空城）。
 */
export function 校验遭遇表(encounters, 谁 = 'generateMaze') {
  if (!encounters?.pool?.length || !encounters.group) {
    throw new TypeError(
      `${谁} 需要一张遭遇表 { pool: [{ type, weight }], group: { min, max } }，`
      + '由 `dungeonEncounterOf(def.id)` 申领（W-B10 切片3b）'
    );
  }
  return encounters;
}

export function generateMaze(gridW, gridH, seed = Date.now(), encounters) {
  校验遭遇表(encounters);
  const rnd = makeSeededRng(seed);
  const rooms = 造迷宫房间(gridW, gridH, rnd);
  return 补完布局(rooms, { gridW, gridH, rnd, encounters, seed });
}

/**
 * Boss 场那块 2×2 占位的**左上角**（W-B10 切片5d）。
 *
 * 四种摆法按固定顺序试（锚格的 `[0,0] / [-1,0] / [0,-1] / [-1,-1]`），取第一枚**既不出网格、
 * 也不把出生间吞进场里**的。顺序写死是因为它吃的是 `exit` 与 `spawn` 的格号，跟 `rnd()` 无关 ——
 * 同一颗种子必须永远得到同一个场块，否则"存档里的种子复现同一座迷宫"（切片4a 修 B75 立的口径）
 * 就在这一刀上断掉。
 *
 * 为什么"不许吞出生间"而不是"吞了就挪玩家"：出生间在玩法上有三件事挂着（`cleared`/`visited`
 * 已经置真、进副本的落点、开局不遇敌），把它并进场等于让开局站在 Boss 脸上。
 * 四枚候选全不可用只可能发生在某条轴 ≤ 2 格的网格上（副本定义的注册表下限是 3），
 * 那里当场抛 —— 静默缩回一格占位就是 B79 与 B102 重新长回来的样子。
 */
function 选场块(exit, spawn, gridW, gridH) {
  const 可用 = [];
  for (const [ox, oz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const x = exit.gx + ox;
    const z = exit.gz + oz;
    if (x < 0 || z < 0 || x + BOSS_SPAN > gridW || z + BOSS_SPAN > gridH) continue;
    const 含出生 = (gx, gz) => gx <= spawn.gx && spawn.gx < gx + BOSS_SPAN
      && gz <= spawn.gz && spawn.gz < gz + BOSS_SPAN;
    if (含出生(x, z)) continue;
    可用.push({ x, z });
  }
  if (!可用.length) {
    throw new TypeError(
      `Boss 场放不下：${gridW}×${gridH} 的网格里，以 (${exit.gx},${exit.gz}) 为中心的 `
      + `${BOSS_SPAN}×${BOSS_SPAN} 块没有一枚既不出网格又不吞掉出生间 (${spawn.gx},${spawn.gz})`
      + ' —— 场跨的格数必须小于网格两条轴（W-B10 切片5d）'
    );
  }
  return 可用[0];
}

/**
 * 把那一块并成一间 Boss 场，返回**新的房间数组**（不改传进来的那一个）。
 *
 * 三件事：
 * 1. **块内的隔墙在进 `reconcileOccupancy` 之前封掉** —— 场内部不存在门。合并后的四格各自的
 *    旗标逐格留在 `cellWalls` 上（口径 1：场的一面"北墙"是两条格子边，一条开一条封是常态）。
 * 2. **另外三格从房间名单里退出**：它们的怪、文献、模板随房一起没了。这是"场真占四格"的价格，
 *    如实记账：一座 5×5 的副本从此是 22 间房，`DungeonManager` 那句 `480 + rooms.length × 25`
 *    的 Boss 血量因此每座少 75。
 * 3. **房心与尺寸按跨格口径搬**：锚格 = 块的左上角，房心 = `spanCenter(锚, 2)`，边长 = `BOSS_CELL`。
 *    于是场的四条墙线逐毫米就是那四格的格线 —— 这是 B102 归零的结构性依据，也是 B85 的修法
 *    （朝场开的那九扇门从"站在邻居的 ±9"搬到"场墙的 ±18 那条线上"，门板与门碰撞跟着进洞）。
 *
 * **连通性不受影响**：合并是这张生成树上的**缩点**（把 4 个结点并成 1 个），进出块的边全部保留，
 * 而块内原本就是连通的（生成树限制到一块上仍连通，或经块外绕回块内 —— 两种都在同一间房里）。
 * id 改成锚格那个 `r_块x_块z`：那一格的原房间已被并进来、名字空出来了，而"id 说的是它锚在哪格"
 * 这条口径（B86）对跨格的房也得成立，否则编辑器拖一次场就把数据与图分成两套。
 */
function 合并成场(rooms, 块, exit, gridW, gridH) {
  const 格们 = [];
  for (let dz = 0; dz < BOSS_SPAN; dz++) {
    for (let dx = 0; dx < BOSS_SPAN; dx++) 格们.push([块.x + dx, 块.z + dz]);
  }
  const 在场内 = (gx, gz) => 格们.some(([x, z]) => x === gx && z === gz);
  const 原样 = new Map(rooms.map((r) => [格键(r.gx, r.gz), r]));
  const cellWalls = {};
  for (const [cx, cz] of 格们) {
    const 原 = 原样.get(格键(cx, cz));
    if (!原) {
      throw new TypeError(
        `Boss 场要并的格 (${cx},${cz}) 上没有房间 —— 合并的前提是这块四格都有房（W-B10 切片5d）`
      );
    }
    const 旗 = { ...原.walls };
    for (const dir of DIRS) {
      const [dx, dz] = DIR_STEP[dir];
      if (在场内(cx + dx, cz + dz)) 旗[dir] = true;
    }
    cellWalls[格键(cx, cz)] = 旗;
  }
  const walls = {};
  for (const dir of DIRS) {
    walls[dir] = !格们.some(([cx, cz]) => cellWalls[格键(cx, cz)][dir] === false);
  }

  exit.gx = 块.x;
  exit.gz = 块.z;
  exit.id = `r_${块.x}_${块.z}`;
  exit.cells = 格们;
  exit.cellWalls = cellWalls;
  exit.walls = walls;
  exit.x = spanCenter(块.x, BOSS_SPAN, gridW, CELL);
  exit.z = spanCenter(块.z, BOSS_SPAN, gridH, CELL);
  exit.w = BOSS_CELL;
  exit.d = BOSS_CELL;

  return rooms
    .filter((r) => r === exit || !在场内(r.gx, r.gz))
    // 名单继续按网格序（`gz` 外、`gx` 内）排，只不过场站在**它自己锚格**那一席上。
    // 不排的话场会留在"最远那一格"的原位（id 说 `r_3_3`，下标却是 (4,4) 那格），
    // 于是同一间房有两套坐标口径 —— 正是 B86 要杀的东西；而 ⑤ 层冻的那句
    // "下标 i ⇒ gx=i%宽、gz=⌊i/宽⌋"也只能跟着作废。合并动了名单的成员，顺序归顺序，不改口径。
    .sort((a, b) => (a.gz * gridW + a.gx) - (b.gz * gridW + b.gx));
}

/**
 * `s = (s * 16807) % 2147483647; return (s - 1) / 2147483646;`。
 *
 * 它承诺 `[0,1)`，实际给的是 `[-4.66e-10, 0.9999999995]`，而消费方一律写 `Math.floor(rnd() * 长度)`：
 * 那一发**负零头**取到 `[-1]`（undefined），下一行解构就抛。普查 `.tmp-20260930/wb10s4a-census2.mjs`
 * 把坏的定义域量成了三块，而不是一块：
 * - `seed ≡ 0 (mod 2^31-1)` 整族崩（0 / 2147483647 / 4294967294 / 6442450941 四颗全崩）；
 * - `seed < 0` **整片**崩（随机 100 颗负种子里 100 颗第一发就不可用）—— JS 的 `%` 保留符号，
 *   所以那是半个平面，不是台账原话里那种"个别边界值"；
 * - `NaN` / `Infinity` 崩。
 *
 * 反过来，台账那句"进副本当场崩"在生产侧今天并不成立：唯一的调用点递 `Date.now()`，实测它前后
 * 各 500 万毫秒里 **0 颗**落进坏值。所以这一片修的不是"现在会崩"，是**"种子的定义域没人管"**——
 * 下一个不递 `Date.now()` 的调用方（存档里的种子、掷出来的负数、URL 上的字符串）才会把它变成门口的一次崩溃。
 *
 * 新做法：**有限整数种子 → 32 位整数状态**（mulberry32 那一步）。全是整数算术，积不会越过 2^53，
 * 所以没有"乘法丢低位"那一档；`>>> 0` 之后每一发都落在 `[0,1)` 里 —— 这是构造出来的，不是祈祷的。
 * 状态是 32 位，种子因此以 2^32 为周期。非有限与非数字**不兜底**（B71 口径，与 `dungeonEncounterOf`
 * 同一把尺子）：静默把 `NaN` 折成 0 号种子等于把"调用方递错了"变成"这座副本悄悄用了别座的布局"。
 */
export function makeSeededRng(seed) {
  if (typeof seed !== 'number' || !Number.isFinite(seed)) {
    throw new TypeError(
      `迷宫的种子必须是一个有限数字（收到 ${typeof seed} ${显示(seed)}）—— `
      + 'NaN / Infinity / 非数字都摇不出可重现的迷宫（W-B10 切片4a，修 B75）'
    );
  }
  let a = fold32(Math.floor(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 报错消息里要把收到的东西说出来，而 `String()` 自己也会抛（Symbol 进了模板、BigInt 进 JSON） */
function 显示(v) {
  try { return String(v); } catch { return Object.prototype.toString.call(v); }
}

/**
 * 把任意有限整数搅成一个 32 位状态：右移—异或—乘大奇素数三段，于是种子的每一位都影响状态，
 * 相邻种子不会只差一位。`>>> 0` 只看得见低 32 位，所以超过 2^32 的种子（`Date.now()` 就是）
 * 把高位乘进来，`seed` 与 `seed + 2^32` 因此不并档。
 */
function fold32(n) {
  const 低 = n >>> 0;
  const 高 = Math.floor(n / 4294967296);
  let x = (低 ^ Math.imul(高, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * 洗一份**副本**：Fisher–Yates（W-B10 切片4b，修 B77）。换掉的是
 * `arr.sort(() => rnd() - 0.5)` 那种"比较器掷硬币"的洗法，它坏在两层，第二层比第一层难查：
 *
 * 1. **分布不匀**。实测 n=5 的 120 种排列全出现过，但恒等排列 `01234` 占 9.54%、最稀的只占
 *    0.18%（理论 0.83%）；同一把流下 Fisher–Yates 的最大偏差是 0.07 个百分点
 *    （`.tmp-20261002/wb10s4b-census.mjs` P1）。落到玩法上是"哪间房带文献"有偏好：
 *    n=25 里 0 号元素挤进前 8 的概率 45.1%，理论 32%（P4）—— 这种洗法把靠前的东西留在靠前。
 * 2. **洗完之后流走到哪儿，由排序实现决定**。那个比较器每比一次吃两发，而比较次数随数据漂：
 *    n=25 实测 61..90 发（P2）。引擎换个排序、数组换个规模，后面每一发（文献落点、池子抽样）
 *    都跟着挪位 —— 于是"同一颗种子给同一座迷宫"只对当前这一个 V8 成立。
 *    Fisher–Yates 恒为 n−1 次交换、n−1 发，流的位置只由规模决定。
 *
 * 返回新数组、不碰传进来的那一个：`LORE_FRAGMENTS` 是模块级共享的表，就地洗它等于
 * 让第二次 `generateMaze` 洗的是已被上一次的种子重排过的那一份。
 * 同样地，迷宫的 `rooms` 也不再被打乱本体 —— 消费者按数组序遍历房间，而那个序不承担任何玩法
 * （房间身份是 `r_x_z`），它今天随机、明天可能又不随机，只是没人说过它该是什么样。
 */
export function shuffle(arr, rnd) {
  const out = Array.from(arr);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/**
 * 按权重从池子里抽一类。权重是**相对值**（不必凑成 100）：抽法是把 `rnd()` 落在的
 * `[0, 总权重)` 摊到累计区间上，先跨过的那一类胜出。这样"往池子里加一类"不必重算全表，
 * 而切片1 普查到的那种均匀三分也能用等权表达。
 */
function drawFromPool(pool, rnd) {
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let t = rnd() * total;
  for (const entry of pool) {
    t -= entry.weight;
    if (t < 0) return entry.type;
  }
  // 走到这里说明 `rnd()` 给出了不小于 1 的读数 —— 那不是设计里的抽样，让它交到
  // `enemyRosterOf(undefined)` 手上抛（B71 口径：认不出就当场红，不许兜到某一类）
  throw new RangeError(`遭遇池抽样越界：rnd() 给出 ${t + total} / 总权重 ${total}`);
}

function findFarthestRoom(spawn, rooms, doors) {
  const dist = new Map([[spawn.id, 0]]);
  const q = [spawn.id];
  while (q.length) {
    const id = q.shift();
    const d = dist.get(id);
    for (const door of doors) {
      let next = null;
      if (door.fromRoomId === id) next = door.toRoomId;
      if (door.toRoomId === id) next = door.fromRoomId;
      if (next && !dist.has(next)) {
        dist.set(next, d + 1);
        q.push(next);
      }
    }
  }
  let best = spawn;
  let bestD = 0;
  for (const [id, d] of dist) {
    if (d > bestD) {
      bestD = d;
      best = rooms.find((r) => r.id === id) ?? best;
    }
  }
  return best;
}

export function getRoomAt(layout, wx, wz) {
  for (const room of layout.rooms) {
    if (
      wx >= room.x - room.w / 2 + 0.5
      && wx <= room.x + room.w / 2 - 0.5
      && wz >= room.z - room.d / 2 + 0.5
      && wz <= room.z + room.d / 2 - 0.5
    ) return room;
  }
  return null;
}

export function clampToBounds(layout, wx, wz, margin = 0.8) {
  const b = layout.bounds;
  return {
    x: Math.max(b.minX + margin, Math.min(b.maxX - margin, wx)),
    z: Math.max(b.minZ + margin, Math.min(b.maxZ - margin, wz)),
  };
}
