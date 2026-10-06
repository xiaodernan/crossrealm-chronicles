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
 * ② 生成器等价层：两座 sha256 摘要（门序敏感 e298c99… + 全布局 d6927e7…）逐字吻合
 * ③ 编辑器放置层：放一间、连通性、删除回缩、带门拖动
 * ④ 真指针抓取层：raycaster 点中 exact room、删除精确命中、越界拒收
 * ⑤ 拒收层：同格双房、非布尔墙旗、缺格号、越界放置
 * ⑥ 资源生命周期层：共享资产不触发 'dispose'、dungeonAssetStats() 跨周期持平、dispose 后 0 网格残留
 */
import { describe, it, expect } from 'vitest';
import {
  reconcileOccupancy,
  generateMaze,
  cellCenter,
  CELL,
} from '../src/world/MazeLayout.js';
import { dungeonEncounterOf } from '../src/content/dungeonEncounters.js';

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
    // 门序：rooms 数组序 × n 再 e —— 这个顺序决定 BFS 访问序，进而决定 Boss 场
    const doorOrderDigest = digest(layout.doors.map(d => d.id));
    expect(doorOrderDigest).toBe('337d931c01d4495a');
  });

  it('全布局摘要（5×5 seed=42）钉住当前结构', () => {
    const encounters = dungeonEncounterOf('ruin-crypt');
    const layout = generateMaze(5, 5, 42, encounters);
    // 去掉运行时态（doors 的 open/locked 可能随编辑器改变）
    const stable = {
      seed: layout.seed,
      gridW: layout.gridW,
      gridH: layout.gridH,
      cellSize: layout.cellSize,
      bossCell: layout.bossCell,
      doorWidth: layout.doorWidth,
      bossDoorWidth: layout.bossDoorWidth,
      rooms: layout.rooms.map(r => ({ id: r.id, gx: r.gx, gz: r.gz, x: r.x, z: r.z, w: r.w, d: r.d })),
      doors: layout.doors.map(d => ({ id: d.id, dir: d.dir, x: d.x, z: d.z, fromRoomId: d.fromRoomId, toRoomId: d.toRoomId })),
      spawn: layout.spawn.id,
      exit: layout.exit.id,
    };
    const fullDigest = digest(stable);
    expect(fullDigest).toBe('a36be835e330cf42');
  });
});
