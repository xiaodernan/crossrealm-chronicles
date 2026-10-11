/**
 * 占用推导门禁（W-B11 切片1）
 *
 * ## 修的是什么
 * 关卡编辑器的墙/门旗标从"抄常量"改成"从占用推导"：一面墙只有在邻着房时才算门，
 * 共用边界由两侧共同决定，门的位置是两间房房心的正中。这一片量到四条真实缺陷并修掉：
 * - B86：编辑器与迷宫的格坐标口径不同 → 统一成 `cellCenter`/`cellIndex` 一对逆函数
 * - B88：拖一次之后可视化与数据分家 → `_updateRoomPosition` 单写者同步五处
 * - B89：导出/导入丢三枚尺寸载体（wallH/wallT/bossCell）且门的 open 字段被丢
 * - B90：`_updateGhostPosition` 从未实现 → TypeError 阻断拖动
 * - B91：射线打到 Group 而非子网格（非递归），房间不可拖/不可删；还需 `scene.updateMatrixWorld()`
 * - B92：DOM 标签挂到 THREE.Group（console.error），_clearVisuals/dispose 释放 0 资源
 *
 * ## 用例分六层
 * ① 规则层：`reconcileOccupancy` 的门规（并侧/不对称/空向强制实墙/n-e 只发/继承态）
 * ② 生成器等价层：两座 sha256 摘要（门序敏感 + 全布局结构）逐字吻合（数值就地钉在两条用例里，
 *    抄在文件头的那一份会跟着每一次换迷宫而撒谎）
 * ③ 编辑器放置层：放一间、连通性、删除回缩、带门拖动
 * ④ 真指针抓取层：raycaster 点中 exact room、删除精确命中、越界拒收
 * ⑤ 拒收层：同格双房、非布尔墙旗、缺格号、越界放置
 * ⑥ 资源生命周期层：共享资产不触发 'dispose'、dungeonAssetStats() 跨周期持平、dispose 后 0 网格残留
 *
 * ## W-B10 切片5d 给 ① 层补的几条
 * 占用推导从"格号算门位"改成"量两房各自的边"，于是多了四件必须被说出来的事：跨格的房得逐格交代
 * 每一条格子边（`cellWalls`）、场内部那三条边不是一门洞、一扇门说得出自己认哪一档洞宽
 * （`holeWidthCarrier`，数字仍留在 `layout` 上）、同一条墙线可以挂两个洞。
 * 摘要两条换了数：**5d 就是去换那座迷宫的**（场真占 2×2 ⇒ 合并掉的三间房与它们的门不再存在），
 * 新数由仓外脚本 `D:/tmp-wb10s5d/occ-digest.mjs` 在同一个 ref 上现导，不是手抄。
 *
 * ## 一处夹具教训（这一片踩到的）
 * ① 层原先从 `MazeLayout` 引 `CELL` —— 那一个模块**没有**这一枚导出（`CELL` 声明在
 * `dungeonDimensions`）。Node 会在链接期就 `SyntaxError`，而 vitest 的 SSR 转换把它变成
 * `undefined`：于是每间夹具房的 `w/d` 是 `undefined`、`x/z` 是 `NaN`，直到门位开始量边才炸出来。
 * 症状不是"少一个常数"，是**三扇站在虚空里的门**。现在从声明那一侧引。
 */
import { describe, it, expect } from 'vitest';
import {
  reconcileOccupancy,
  generateMaze,
  cellCenter,
  spanCenter,
  cellsOf,
} from '../src/world/MazeLayout.js';
import { CELL, BOSS_CELL, BOSS_SPAN, HOLE_WIDTH_CARRIERS } from '../src/world/dungeonDimensions.js';
import { dungeonEncounterOf } from '../src/content/dungeonEncounters.js';

/** 夹具用的格数：`cellCenter` / `spanCenter` 都吃它，夹具与生成器因此同一份居中口径 */
const 夹具格数 = 5;

/**
 * 一间 1×1 的夹具房。坐标问的是 `cellCenter` 那**一对**函数而不是自己乘一遍 `CELL`：
 * B86 的根就是这句话被说了两遍，夹具要是另起一套口径，量到的门位就只是夹具的位置。
 */
const 方房 = (id, gx, gz, 旗 = {}) => ({
  id, gx, gz,
  x: cellCenter(gx, 夹具格数, CELL),
  z: cellCenter(gz, 夹具格数, CELL),
  w: CELL, d: CELL,
  walls: { n: true, e: true, s: true, w: true, ...旗 },
  cleared: false, visited: false, hasEnemies: false, enemySpawns: [],
});

/**
 * 一间 2×2 的 Boss 场（W-B10 切片5d 的那一形）：占位（`cells`）、跨体（`w/d` + 房心）、
 * 逐格边旗（`cellWalls`）三份必须互相认账 —— 缺任何一份，`reconcileOccupancy` 的校验就会
 * 点名，而它点名的正是那种"看起来只是一张图少了几个字"的载荷。
 * 房间级 `walls` 不用夹具交代：那一份由边旗**推出来**。
 */
const 场房 = (id, 锚x, 锚z, 逐格旗 = {}) => {
  const cells = [[锚x, 锚z], [锚x + 1, 锚z], [锚x, 锚z + 1], [锚x + 1, 锚z + 1]];
  const cellWalls = {};
  for (const [cx, cz] of cells) cellWalls[`${cx},${cz}`] = { n: true, e: true, s: true, w: true };
  for (const [格, 面] of Object.entries(逐格旗)) Object.assign(cellWalls[格], 面);
  return {
    id, gx: 锚x, gz: 锚z, cells, cellWalls, isBossArena: true,
    x: spanCenter(锚x, BOSS_SPAN, 夹具格数, CELL),
    z: spanCenter(锚z, BOSS_SPAN, 夹具格数, CELL),
    w: BOSS_CELL, d: BOSS_CELL,
    walls: { n: true, e: true, s: true, w: true },
    cleared: false, visited: false, hasEnemies: true, enemySpawns: [],
  };
};

// ─── ① 规则层：reconcileOccupancy 的门规 ──────────────────────────────

describe('reconcileOccupancy 规则', () => {
  it('并侧：一侧说开门（false），另一侧跟着开', () => {
    const rooms = [
      { id: 'r_0_0', gx: 0, gz: 0, x: cellCenter(0, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: true, e: false, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
      { id: 'r_1_0', gx: 1, gz: 0, x: cellCenter(1, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: true, e: true, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
    ];
    const doors = reconcileOccupancy(rooms);
    expect(doors).toHaveLength(1);
    expect(doors[0].dir).toBe('e');
    expect(doors[0].fromRoomId).toBe('r_0_0');
    expect(doors[0].toRoomId).toBe('r_1_0');
    // 门在两房房心中点
    expect(doors[0].x).toBe((rooms[0].x + rooms[1].x) / 2);
    expect(doors[0].z).toBe((rooms[0].z + rooms[1].z) / 2);
    // 另一侧的墙旗标也被归一
    expect(rooms[1].walls.w).toBe(false);
  });

  it('不对称：空向强制实墙', () => {
    const rooms = [
      { id: 'r_0_0', gx: 0, gz: 0, x: cellCenter(0, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: false, e: true, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
    ];
    const doors = reconcileOccupancy(rooms);
    expect(doors).toHaveLength(0);
    expect(rooms[0].walls.n).toBe(true); // 北侧没房，收回成实墙
  });

  it('n/e 只发：一条边界不发两遍', () => {
    const rooms = [
      { id: 'r_0_0', gx: 0, gz: 0, x: cellCenter(0, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: false, e: false, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
      { id: 'r_1_0', gx: 1, gz: 0, x: cellCenter(1, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: true, e: true, s: true, w: false }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
      { id: 'r_0_1', gx: 0, gz: 1, x: cellCenter(0, 5, CELL), z: cellCenter(1, 5, CELL), w: CELL, d: CELL, walls: { n: false, e: true, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
    ];
    const doors = reconcileOccupancy(rooms);
    // r_0_0 的 n 被收回（空向），e 发一扇；r_0_0 的 s 由 r_0_1 以 n 的名义发
    expect(doors.filter(d => d.fromRoomId === 'r_0_0')).toHaveLength(1); // 只发 e
    // 门 ID 由发出者的格号命名：r_0_0 发 e → d_0_0_e，r_0_1 发 n → d_0_1_n
    expect(doors.map(d => d.id)).toEqual(['d_0_0_e', 'd_0_1_n']);
  });

  it('继承态：open/locked 按 id 结转', () => {
    const rooms = [
      { id: 'r_0_0', gx: 0, gz: 0, x: cellCenter(0, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: true, e: false, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
      { id: 'r_1_0', gx: 1, gz: 0, x: cellCenter(1, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: true, e: true, s: true, w: false }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
    ];
    const previousDoors = [
      { id: 'd_0_0_e', open: true, locked: false },
    ];
    const doors = reconcileOccupancy(rooms, previousDoors);
    expect(doors).toHaveLength(1);
    expect(doors[0].open).toBe(true);
    expect(doors[0].locked).toBe(false);
  });

  it('拒收：同格双房抛错', () => {
    const rooms = [
      { id: 'r_0_0_a', gx: 0, gz: 0, x: cellCenter(0, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: true, e: true, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
      { id: 'r_0_0_b', gx: 0, gz: 0, x: cellCenter(0, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: true, e: true, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
    ];
    expect(() => reconcileOccupancy(rooms)).toThrow(/两间房站在同一格/);
  });

  it('拒收：非布尔墙旗抛错', () => {
    const rooms = [
      { id: 'r_0_0', gx: 0, gz: 0, x: cellCenter(0, 5, CELL), z: cellCenter(0, 5, CELL), w: CELL, d: CELL, walls: { n: undefined, e: true, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
    ];
    expect(() => reconcileOccupancy(rooms)).toThrow(/walls\.n = undefined/);
  });

  it('拒收：缺格号抛错', () => {
    const rooms = [
      { id: 'r_bad', gx: NaN, gz: 0, x: 0, z: 0, w: CELL, d: CELL, walls: { n: true, e: true, s: true, w: true }, cleared: false, visited: false, hasEnemies: false, enemySpawns: [] },
    ];
    expect(() => reconcileOccupancy(rooms)).toThrow(/没有格号的房/);
  });

  it('拒收：跨体不是有限正数（门位现在量的是边，NaN 只会摇出一扇虚空里的门）', () => {
    const 缺 = { ...方房('r_0_0', 0, 0), w: undefined };
    expect(() => reconcileOccupancy([缺])).toThrow(/r_0_0\.w = undefined/);
  });

  // ─── W-B10 切片5d：跨格的房 ──────────────────────────────────────

  it('拒收：跨格的房没逐格交代边旗（缺这张表就兜不出"北墙两条边一条开一条封"）', () => {
    const 场 = 场房('r_0_0', 0, 0);
    delete 场.cellWalls['1,1'];
    expect(() => reconcileOccupancy([场, 方房('r_-1_0', -1, 0)])).toThrow(/1,1 的 \.cellWalls\.n/);
    // 只缺一面也要点名到那一面，而不是整格退回房间级旗标
    场.cellWalls['1,1'] = { n: true, e: true, s: true };
    expect(() => reconcileOccupancy([场, 方房('r_-1_0', -1, 0)])).toThrow(/1,1 的 \.cellWalls\.w/);
  });

  it('场内部那三条边不是一门洞（2×2 那块里相邻的两格不是邻居）', () => {
    const 场 = 场房('r_0_0', 0, 0);
    // 故意把块内的一条隔墙写成"开着"：这是自相矛盾的载荷，但它不该变成一扇指着自家客厅的门
    场.cellWalls['0,0'].e = false;
    const doors = reconcileOccupancy([场]);
    expect(doors).toHaveLength(0);
  });

  it('洞宽由**门**说：朝场的那扇认 boss 档、普通那扇认 normal 档，数字留在 layout 上', () => {
    const 场 = 场房('r_0_0', 0, 0);
    const 西 = 方房('r_-1_0', -1, 0, { e: false });
    const 远 = 方房('r_3_2', 3, 2, { e: false });
    const 邻 = 方房('r_4_2', 4, 2);
    const doors = reconcileOccupancy([场, 西, 远, 邻]);
    const 进场门 = doors.find((d) => d.fromRoomId === 西.id);
    const 普通门 = doors.find((d) => d.fromRoomId === 远.id);
    expect(进场门.holeWidthCarrier).toBe(HOLE_WIDTH_CARRIERS.boss);
    expect(普通门.holeWidthCarrier).toBe(HOLE_WIDTH_CARRIERS.normal);
    // 两端都不是场的门不许蹭 boss 档：否则每一座迷宫都会悄悄多出一档洞宽来
    expect(普通门.toRoomId).toBe(邻.id);
  });

  it('同一条墙线可以挂**两个**洞：场占两格，它的"西墙"是两条格子边', () => {
    const 场 = 场房('r_0_0', 0, 0);
    const 甲 = 方房('r_-1_0', -1, 0, { e: false });
    const 乙 = 方房('r_-1_1', -1, 1, { e: false });
    const doors = reconcileOccupancy([场, 甲, 乙]);
    const 西 = doors.filter((d) => d.fromRoomId === 甲.id || d.fromRoomId === 乙.id);
    expect(西.map((d) => d.id).sort()).toEqual(['d_-1_0_e', 'd_-1_1_e']);
    // 两条边逐毫米在同一条墙线上（那是格线，也是场的西墙）
    const 场西墙 = 场.x - 场.w / 2;
    for (const d of 西) {
      expect(d.x, `${d.id} 没落在场的西墙线上`).toBeCloseTo(场西墙, 10);
      expect(d.holeWidthCarrier).toBe(HOLE_WIDTH_CARRIERS.boss);
    }
    // 垂直方向取的是**邻居自己那一段**的重叠中点：所以洞在邻居的墙正中，不在场的正中
    expect(西.find((d) => d.fromRoomId === 甲.id).z).toBeCloseTo(甲.z, 10);
    expect(西.find((d) => d.fromRoomId === 乙.id).z).toBeCloseTo(乙.z, 10);
  });

  it('拒收：旗标说这里有门、坐标说够不着（两段的跨体在墙轴上不重叠）', () => {
    // 这就是口径 3 末尾说的那一份自相矛盾载荷：`cells` 伸到了一格，而 `w/d` 那份跨体没跟着长
    const 场 = 场房('r_0_0', 0, 0);
    场.cells.push([2, 2]);
    场.cellWalls['2,2'] = { n: true, e: false, s: true, w: true };
    const 邻 = 方房('r_3_2', 3, 2);
    expect(() => reconcileOccupancy([场, 邻])).toThrow(/共用一条边界，但两间房的跨体在墙上轴上不重叠/);
  });

  it('并侧写回的是**对着那条边的那一格**（跨格的另一侧不能整面墙一起开）', () => {
    const 场 = 场房('r_0_0', 0, 0);
    const 西 = 方房('r_-1_0', -1, 0, { e: false }); // 只朝 (0,0) 那一格开
    const doors = reconcileOccupancy([场, 西]);
    expect(doors).toHaveLength(1);
    expect(场.cellWalls['0,0'].w).toBe(false);
    // 另一条西边原样留着：改前按房间级写会把 '0,1' 那条也开，多出来的那一扇是走不通的洞
    expect(场.cellWalls['0,1'].w).toBe(true);
    expect(场.cellWalls['1,0'].w).toBe(true);
    expect(场.cellWalls['1,1'].w).toBe(true);
    // 房间级那份旗是推出来的：那一边有任何一条格子边开着就是 false
    expect(场.walls.w).toBe(false);
    expect(场.walls.e).toBe(true);
  });
});

// ─── ② 生成器等价层：两座 sha256 摘要 ──────────────────────────────

describe('生成器等价', async () => {
  const { createHash } = await import('node:crypto');

  function digest(obj) {
    return createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
  }

  it('门序敏感摘要（5×5 seed=42）钉住当前顺序', () => {
    const encounters = dungeonEncounterOf('ruin-crypt');
    const layout = generateMaze(5, 5, 42, encounters);
    // 门序：rooms 数组序 × 那一间的格子序 × n 再 e —— 这个顺序决定 BFS 访问序，进而决定 Boss 场
    // 换数的原因就写在 ② 层下面那两条：5d 把场真占 2×2，合并掉的三间房连同它们的门不再出现。
    const doorOrderDigest = digest(layout.doors.map(d => d.id));
    expect(doorOrderDigest).toBe('361fa26f790fd14c');
  });

  it('全布局摘要（5×5 seed=42）钉住当前结构', () => {
    const encounters = dungeonEncounterOf('ruin-crypt');
    const layout = generateMaze(5, 5, 42, encounters);
    // 去掉运行时态（doors 的 open/locked 可能随编辑器改变）
    // 投影比 5d 之前宽了三处：`cells` / 场的 `cellWalls` / 门的 `holeWidthCarrier` ——
    // 那三份**就是**切片5d 要钉住的结构（场占四格、每条边自己交代、门认档）。
    const stable = {
      seed: layout.seed,
      gridW: layout.gridW,
      gridH: layout.gridH,
      cellSize: layout.cellSize,
      bossCell: layout.bossCell,
      doorWidth: layout.doorWidth,
      bossDoorWidth: layout.bossDoorWidth,
      rooms: layout.rooms.map(r => ({
        id: r.id, gx: r.gx, gz: r.gz, x: r.x, z: r.z, w: r.w, d: r.d,
        ...(r.cells ? { cells: r.cells } : {}),
        ...(r.isBossArena ? { isBossArena: true, cellWalls: r.cellWalls } : {}),
      })),
      doors: layout.doors.map(d => ({
        id: d.id, dir: d.dir, x: d.x, z: d.z, fromRoomId: d.fromRoomId, toRoomId: d.toRoomId,
        holeWidthCarrier: d.holeWidthCarrier,
      })),
      spawn: layout.spawn.id,
      exit: layout.exit.id,
    };
    const fullDigest = digest(stable);
    expect(fullDigest).toBe('179672785d636abc');
  });

  it('5d 之后那座迷宫的形状：一间房换掉三间，墙线就是格线', () => {
    const layout = generateMaze(5, 5, 42, dungeonEncounterOf('ruin-crypt'));
    const 场 = layout.rooms.find(r => r.isBossArena);
    // 合并掉的那三间不再回来：每 2×2 的场比"一格一房"少 (BOSS_SPAN² − 1) 间
    expect(layout.rooms).toHaveLength(5 * 5 - (BOSS_SPAN * BOSS_SPAN - 1));
    expect(cellsOf(场)).toHaveLength(BOSS_SPAN * BOSS_SPAN);
    expect([场.w, 场.d]).toEqual([BOSS_CELL, BOSS_CELL]);
    // 房的跨体认的是 `BOSS_CELL` 而不是那一个 34 的字面量（B102 的结构性依据）
    expect(场.w).toBe(BOSS_SPAN * layout.cellSize);
    // 出生间不会被并进场里（否则开局站在墙外面）
    expect(cellsOf(场).some(([cx, cz]) => cx === layout.spawn.gx && cz === layout.spawn.gz)).toBe(false);
    // 每一扇朝场的门都逐毫米站在场的某一面墙线上（B85：改前它们站在邻居的格线上）
    const 墙线 = [场.x - 场.w / 2, 场.x + 场.w / 2, 场.z - 场.d / 2, 场.z + 场.d / 2];
    const 进场门 = layout.doors.filter(d => d.fromRoomId === 场.id || d.toRoomId === 场.id);
    expect(进场门.length, '一座 5×5 摇不出朝场的门？').toBeGreaterThan(0);
    for (const d of 进场门) {
      const 距墙 = Math.min(...墙线.map(线 => Math.min(Math.abs(d.x - 线), Math.abs(d.z - 线))));
      expect(距墙, `${d.id} 没站在场的墙线上（B85 的形状）`).toBeLessThan(1e-9);
      expect(d.holeWidthCarrier).toBe(HOLE_WIDTH_CARRIERS.boss);
    }
  });
});
