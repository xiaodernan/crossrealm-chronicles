/**
 * 载荷的**样例**（W-B11 切片4）—— 一份按**关卡编辑器的导出格式**写的布局。
 *
 * 这一份的形状 = **关卡编辑器导出的载荷**（房间 / 六枚尺寸载体 / 网格 / 种子）
 * ⇒ 设计师能在编辑器里打开它、改完、导回来粘进下面那张表。
 *
 * 枢纽地下墓穴给它一份**固定**的地图：教学副本每次进来都是同一张图 ⇒ 认得路。
 *
 * 门不在这儿：门由**补完**按占位推导（`MazeLayout.补完布局`）—— 载荷里带门
 * 是编辑器自己显示用的，带进来反而是第二份真相。
 */
export const DUNGEON_LAYOUTS = {
  'hub-catacombs': {
    gridW: 5,
    gridH: 5,
    seed: 20261022,
    cellSize: 18,
    bossCell: 36,
    wallH: 5,
    wallT: 0.6,
    doorWidth: 4,
    bossDoorWidth: 5,
    rooms: [
      { id: 'r_0_0', gx: 0, gz: 0, x: -45, z: -45, w: 18, d: 18,
        walls: { n: true, e: true, s: false, w: true } },
      { id: 'r_1_0', gx: 1, gz: 0, x: -27, z: -45, w: 18, d: 18,
        walls: { n: true, e: false, s: false, w: true } },
      { id: 'r_2_0', gx: 2, gz: 0, x: -9, z: -45, w: 18, d: 18,
        walls: { n: true, e: false, s: true, w: false } },
      { id: 'r_3_0', gx: 3, gz: 0, x: 9, z: -45, w: 18, d: 18,
        walls: { n: true, e: false, s: false, w: false } },
      { id: 'r_4_0', gx: 4, gz: 0, x: 27, z: -45, w: 18, d: 18,
        walls: { n: true, e: true, s: false, w: false } },
      { id: 'r_0_1', gx: 0, gz: 1, x: -45, z: -27, w: 18, d: 18,
        walls: { n: false, e: true, s: false, w: true } },
      { id: 'r_1_1', gx: 1, gz: 1, x: -27, z: -27, w: 18, d: 18,
        walls: { n: false, e: false, s: true, w: true } },
      { id: 'r_2_1', gx: 2, gz: 1, x: -9, z: -27, w: 18, d: 18,
        walls: { n: true, e: true, s: true, w: false } },
      { id: 'r_3_1', gx: 3, gz: 1, x: 9, z: -27, w: 18, d: 18,
        walls: { n: false, e: true, s: false, w: true } },
      { id: 'r_4_1', gx: 4, gz: 1, x: 27, z: -27, w: 18, d: 18,
        walls: { n: false, e: true, s: false, w: true } },
      { id: 'r_0_2', gx: 0, gz: 2, x: -45, z: -9, w: 18, d: 18,
        walls: { n: false, e: true, s: false, w: true } },
      { id: 'r_1_2', gx: 1, gz: 2, x: -27, z: -9, w: 18, d: 18,
        walls: { n: true, e: false, s: false, w: true } },
      { id: 'r_2_2', gx: 2, gz: 2, x: -9, z: -9, w: 18, d: 18,
        walls: { n: true, e: false, s: true, w: false } },
      { id: 'r_3_2', gx: 3, gz: 2, x: 9, z: -9, w: 18, d: 18,
        walls: { n: false, e: true, s: true, w: false } },
      { id: 'r_4_2', gx: 4, gz: 2, x: 27, z: -9, w: 18, d: 18,
        walls: { n: false, e: true, s: false, w: true } },
      { id: 'r_0_3', gx: 0, gz: 3, x: -45, z: 9, w: 18, d: 18,
        walls: { n: false, e: false, s: true, w: true } },
      { id: 'r_1_3', gx: 1, gz: 3, x: -27, z: 9, w: 18, d: 18,
        walls: { n: false, e: true, s: true, w: false } },
      { id: 'r_2_3', gx: 2, gz: 3, x: -9, z: 9, w: 18, d: 18,
        walls: { n: true, e: false, s: false, w: true } },
      { id: 'r_3_3', gx: 3, gz: 3, x: 9, z: 9, w: 18, d: 18,
        walls: { n: true, e: true, s: false, w: false } },
      { id: 'r_4_3', gx: 4, gz: 3, x: 27, z: 9, w: 18, d: 18,
        walls: { n: false, e: true, s: false, w: true } },
      { id: 'r_0_4', gx: 0, gz: 4, x: -45, z: 27, w: 18, d: 18,
        walls: { n: true, e: false, s: true, w: true } },
      { id: 'r_1_4', gx: 1, gz: 4, x: -27, z: 27, w: 18, d: 18,
        walls: { n: true, e: false, s: true, w: false } },
      { id: 'r_2_4', gx: 2, gz: 4, x: -9, z: 27, w: 18, d: 18,
        walls: { n: false, e: true, s: true, w: false } },
      { id: 'r_3_4', gx: 3, gz: 4, x: 9, z: 27, w: 18, d: 18,
        walls: { n: false, e: false, s: true, w: true } },
      { id: 'r_4_4', gx: 4, gz: 4, x: 27, z: 27, w: 18, d: 18,
        walls: { n: false, e: true, s: true, w: false } },
    ],
  },
};
