/**
 * 墙段口径：副本与关卡编辑器**共用**一份（W-B11 切片3）。
 *
 * ## 这一片防的是什么
 *
 * 关卡编辑器此前只画房盒与标签，于是"这面墙上有没有门"**在编辑器里看不见** ——
 * 摆两间房挨着，看到的是两个孤零零的方盒，而导出的载荷里那两间房**确实是通的**（占用推导出了门）。
 * 看到的与导出的对不上，门就成了一句"听说的"。
 *
 * 修法不是"给编辑器再写一份画墙的代码"（那正是切片0 之前的病：规则抄成字面量
 * `walls: { n: true, e: true, s: true, w: true }`），而是**把墙段这件事本身抽成一份**
 * （`src/world/dungeonWalls.js`），副本的几何层与编辑器的预览层都问它。
 *
 * ## 三条判据各有一种死法
 *
 * 1. **两边画出来的墙段必须逐段相等** —— 口径分家时症状是"编辑器的门开在左边、副本的门开在右边"，
 *    两边各自都对、合起来对不上。所以判据不是"编辑器也画了墙"，而是**逐段比对位置与长度**。
 * 2. **有门的那面墙真的被挖开** —— 挖洞那一步若静默不生效，墙仍是一整条，
 *    于是"门"只是数据里的一行字、画面上什么都没有。
 * 3. **纯几何那层不许吞掉洞** —— 洞夹到墙的跨度内、相邻洞合并，这两条各有各的病：
 *    不夹 ⇒ 洞伸到墙外留一截"悬空的墙头"；不合并 ⇒ 两个洞之间夹一段几厘米的墙屑。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { 挖洞后的墙段, 房间墙面表, 洞在面, 门洞宽 } from '../src/world/dungeonWalls.js';
import { generateMaze, reconcileOccupancy } from '../src/world/MazeLayout.js';
import { DUNGEON_ENCOUNTERS, DUNGEON_ENCOUNTER_IDS } from '../src/content/dungeonEncounters.js';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { LevelEditor } from '../src/world/LevelEditor.js';
import { CELL, WALL_H, WALL_T, DOOR_WIDTH } from '../src/world/dungeonDimensions.js';

/** 一间房：占 1×1，墙四面全实（编辑器自己放的那一间） */
const mk房 = (id, gx, gz, gridW, gridH) => ({
  id, gx, gz,
  x: (gx - gridW / 2) * CELL + CELL / 2,
  z: (gz - gridH / 2) * CELL + CELL / 2,
  w: CELL, d: CELL,
  walls: { n: true, e: true, s: true, w: true },
  cleared: false, visited: false, hasEnemies: true, enemySpawns: [], lore: null,
});

/** 布局骨架：编辑器侧与副本侧共用同一份尺寸载体 */
const mk布局 = (gridW, gridH, rooms, doors = []) => ({
  gridW, gridH,
  cellSize: CELL, bossCell: CELL * 2,
  wallH: WALL_H, wallT: WALL_T,
  doorWidth: DOOR_WIDTH, bossDoorWidth: DOOR_WIDTH + 1,
  seed: 1,
  rooms, doors,
  colliders: [],
});

describe('① 纯几何：挖洞后的墙段', () => {
  it('没有洞 ⇒ 一整条墙', () => {
    expect(挖洞后的墙段(0, 18, [])).toEqual([{ c: 0, len: 18 }]);
  });

  it('中间一个洞 ⇒ 两段（洞宽就是挖掉的那一段）', () => {
    const 段 = 挖洞后的墙段(0, 18, [{ c: 0, w: 4 }]);
    expect(段).toHaveLength(2);
    expect(段[0]).toEqual({ c: -5.5, len: 7 });   // 墙 18 米跨 -9..9，洞 0 宽 4 ⇒ 剩 -9..-2
    expect(段[1]).toEqual({ c: 5.5, len: 7 });
  });

  it('洞伸到墙外 ⇒ 夹进跨度（不留悬空的墙头）', () => {
    const 段 = 挖洞后的墙段(0, 18, [{ c: 10, w: 8 }]);   // 洞跨 6..14，墙到 9
    expect(段).toEqual([{ c: -1.5, len: 15 }]);             // 洞跨 6..14 ⇒ 夹成 6..9，剩 -9..6
  });

  it('两个相邻的洞 ⇒ 合成一个（不留几厘米的墙屑）', () => {
    const 段 = 挖洞后的墙段(0, 18, [{ c: -2, w: 4 }, { c: 2, w: 4 }]);  // 洞 -4..0 与 0..4
    expect(段).toEqual([{ c: -6.5, len: 5 }, { c: 6.5, len: 5 }]);  // 两个洞并成 -4..4，中间那 0 宽的墙屑没了
  });
});

describe('② 洞的来源只有门名单一处', () => {
  it('四面全实 ⇒ 那一面没有洞', () => {
    const room = mk房('r_1_1', 1, 1, 5, 5);
    const layout = mk布局(5, 5, [room]);
    expect(洞在面(room, layout, 'n', false)).toEqual([]);
  });

  it('旗标说开着 ⇒ 那一面的洞由门名单说（位置与宽度都问那扇门）', () => {
    const a = mk房('r_1_1', 1, 1, 5, 5);
    const b = mk房('r_1_2', 1, 2, 5, 5);
    a.walls.s = false;
    b.walls.n = false;
    const layout = mk布局(5, 5, [a, b]);
    layout.doors = reconcileOccupancy(layout.rooms, []);
    const 洞 = 洞在面(a, layout, 's', false);
    expect(洞).toHaveLength(1);
    expect(洞[0].w).toBe(门洞宽(layout, layout.doors[0]));
  });

  it('门名册里没有门 ⇒ 旗标说开着也不算（名单与旗标脱节时不替它兜底）', () => {
    const a = mk房('r_1_1', 1, 1, 5, 5);
    a.walls.s = false;                      // 旗标说开着，但旁边没有房
    const layout = mk布局(5, 5, [a]);
    expect(洞在面(a, layout, 's', false)).toEqual([]);
  });
});

describe('③ 编辑器与副本画出来的墙段逐段相等', () => {
  /** 真迷宫：走 `generateMaze` 那一条路（占用推导出真实门名单） */
  const 真布局 = () => {
    // 遭遇表用真表里的一张（W-B10 切片3b：门名单由占用推导，遭遇表与它无关但 generateMaze 要它）
    const 遭遇 = DUNGEON_ENCOUNTERS[DUNGEON_ENCOUNTER_IDS[0]];
    const layout = generateMaze(5, 5, 20261021, 遭遇);
    expect(layout.rooms.length).toBeGreaterThan(3);
    expect(layout.doors.length).toBeGreaterThan(2);
    return layout;
  };

  /** 从一棵子树里挑出墙段（`userData.isWall` 是墙段自己的记号）
   *  遍历整棵子树而不是只看直接子项：副本侧墙段挂在 `room.group` 里，那是顶层组的孙子。 */
  const 墙段读数 = (root) => {
    const 段 = [];
    root.traverse((o) => { if (o.userData?.isWall) 段.push(o); });
    return 段.map((o) => ({
      x: Number(o.position.x.toFixed(6)),
      y: Number(o.position.y.toFixed(6)),
      z: Number(o.position.z.toFixed(6)),
      w: Number(o.geometry.parameters.width.toFixed(6)),
      d: Number(o.geometry.parameters.depth.toFixed(6)),
    })).sort((a, b) => (a.x - b.x) || (a.z - b.z) || (a.w - b.w));
  };

  it('副本几何层画的墙段 = 编辑器预览层画的墙段（逐段位置与长度）', () => {
    const layout = 真布局();

    // 副本侧：真 `buildGeometry`（房间组摆在原点，墙段用世界坐标）
    const 副本组 = new THREE.Group();
    ProceduralDungeonGenerator.buildGeometry(副本组, layout, { id: 'probe', theme: '#886644', accent: '#ffcc66' });
    const 副本墙 = 墙段读数(副本组);

    // 编辑器侧：同一份 layout，按 `房间墙面表` 的局部坐标建（Group 摆在房心）
    const 编辑器墙 = [];
    for (const room of layout.rooms) {
      const 组 = new THREE.Group();
      组.position.set(room.x, 0, room.z);
      for (const 面 of 房间墙面表(room, layout, { x: room.x, z: room.z })) {
        建编辑器墙(组, 面);
      }
      编辑器墙.push(...墙段读数(组).map((w) => ({
        ...w,
        x: Number((w.x + room.x).toFixed(6)),
        z: Number((w.z + room.z).toFixed(6)),
      })));
    }
    编辑器墙.sort((a, b) => (a.x - b.x) || (a.z - b.z) || (a.w - b.w));

    expect(副本墙.length, '副本侧没画出墙段 —— 判据在空集上恒真').toBeGreaterThan(10);
    expect(编辑器墙, '编辑器侧没画出墙段 —— 判据在空集上恒真').toHaveLength(副本墙.length);
    expect(编辑器墙).toEqual(副本墙);
  });

  it('两间相邻的房 ⇒ 中间那道墙真的被挖开（副本与编辑器都是两段）', () => {
    const layout = 真布局();
    // 找一对有门的邻居
    const 门 = layout.doors[0];
    const a = layout.rooms.find((r) => r.id === 门.fromRoomId);
    const b = layout.rooms.find((r) => r.id === 门.toRoomId);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();

    // 副本侧：那一对之间的那道墙该是两段（挖掉门洞那一截）
    const 副本组 = new THREE.Group();
    ProceduralDungeonGenerator.buildGeometry(副本组, layout, { id: 'probe', theme: '#886644', accent: '#ffcc66' });
    const 那一面 = 房间墙面表(a, layout).find((面) => 面.dir === 门.dir);
    expect(那一面.洞.length, '这一面墙上一个洞都没有 —— 门名单与旗标脱节').toBeGreaterThan(0);
    const 段数 = 挖洞后的墙段(那一面.沿Z ? 那一面.心z : 那一面.心x, 那一面.长, 那一面.洞).length;
    expect(段数, '有洞的那面墙仍然是一整条 —— 洞没被挖开').toBe(2);
  });
});

/** 编辑器侧那一份"建"：与 `dungeonWalls.建一面墙` 同参（这里不引 three 的材质，用几何即可） */
function 建编辑器墙(group, 面) {
  const 中心 = 面.沿Z ? 面.心z : 面.心x;
  const 段表 = 面.洞.length ? 挖洞后的墙段(中心, 面.长, 面.洞) : [{ c: 中心, len: 面.长 }];
  for (const 段 of 段表) {
    const x = 面.沿Z ? 面.心x : 段.c;
    const z = 面.沿Z ? 段.c : 面.心z;
    const w = 面.沿Z ? WALL_T : 段.len;
    const d = 面.沿Z ? 段.len : WALL_T;
    const geo = new THREE.BoxGeometry(w, WALL_H, d);
    const m = new THREE.Mesh(geo);
    m.position.set(x, WALL_H / 2, z);
    m.userData.isWall = true;
    group.add(m);
  }
}

/* ---------------------------------------------------------- ④ 编辑器真的画出了墙 */

describe('④ 编辑器接线：预览里真的有墙，门洞真的开着', () => {
  /** 编辑器要一块 `document`（面板与标签层）与一个 `window`（键位监听） */
  const 装DOM = () => {
    const el = () => ({
      style: { cssText: '' }, innerHTML: '', value: '', dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      querySelector: () => ({ addEventListener() {}, value: '', style: {} }),
      querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    });
    globalThis.document = { body: { appendChild() {}, removeChild() {} }, createElement: el, getElementById: () => null };
    globalThis.window = {
      document: globalThis.document,
      addEventListener() {}, removeEventListener() {},
      URL: { createObjectURL: () => '', revokeObjectURL() {} },
    };
  };

  const 拆DOM = () => { delete globalThis.document; delete globalThis.window; };

  it('两间相邻的房 ⇒ 编辑器预览里那面墙被挖成两段（门洞看得见）', () => {
    装DOM();
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const dom = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
      const editor = new LevelEditor(scene, camera, { dispose() {} }, dom);

      // 两间房上下相邻：a 的南墙与 b 的北墙是同一道墙线，中间开一扇门
      const a = mk房('r_1_1', 1, 1, 5, 5);
      const b = mk房('r_1_2', 1, 2, 5, 5);
      a.walls.s = false;
      b.walls.n = false;
      const layout = mk布局(5, 5, [a, b]);
      layout.doors = reconcileOccupancy(layout.rooms, []);
      expect(layout.doors.length, '两间相邻的房之间应当有一扇门').toBe(1);

      editor.setLayout(layout);

      // a 的南墙（编辑器侧是**局部**坐标：组摆在房心 ⇒ z = -CELL/2）
      const 房组 = editor.roomMeshes.get('r_1_1')?.mesh;
      expect(房组, '编辑器没有把那间房画出来').toBeTruthy();
      const 墙 = [];
      房组.traverse((o) => { if (o.userData?.isWall) 墙.push(o); });
      // 四面墙：n/s 各一段（无洞），w/e 各一段 —— 加上 s 面那一个洞 ⇒ 5 段
      expect(墙.length, '编辑器只画了房盒没画墙 —— 切片3 的正身').toBe(5);

      // s 面（b 在 a 的南边 ⇒ a 的南墙；编辑器侧是**局部**坐标：组摆在房心 ⇒ z = +CELL/2）
      const s面 = 墙.filter((o) => Math.abs(o.position.z - (CELL / 2)) < 1e-6);
      expect(s面.length, '南墙没有被挖开（门洞看不见）').toBe(2);
      // 两截加起来 = 整墙长减去洞宽
      const 总长 = s面.reduce((s, o) => s + o.geometry.parameters.width, 0);
      expect(总长).toBeCloseTo(CELL - DOOR_WIDTH, 6);

      editor.dispose();
    } finally {
      拆DOM();
    }
  });

  it('编辑器的墙是**局部**坐标（组摆在房心）—— 拖动时墙跟着盒子走', () => {
    装DOM();
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const dom = { addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
      const editor = new LevelEditor(scene, camera, { dispose() {} }, dom);

      const a = mk房('r_1_1', 1, 1, 5, 5);
      const layout = mk布局(5, 5, [a]);
      editor.setLayout(layout);

      const 房组 = editor.roomMeshes.get('r_1_1').mesh;
      expect(房组.position.x).toBeCloseTo(a.x, 6);
      expect(房组.position.z).toBeCloseTo(a.z, 6);
      // 墙段是组的孩子 ⇒ 位置是局部的（|z| ≤ 半格），不是世界坐标（那会大出一整个布局偏移）
      const 墙 = [];
      房组.traverse((o) => { if (o.userData?.isWall) 墙.push(o); });
      for (const o of 墙) {
        expect(Math.abs(o.position.x), '墙段用了世界坐标（与盒子不在同一坐标系 ⇒ B88 的双重偏移）')
          .toBeLessThanOrEqual(CELL);
        expect(Math.abs(o.position.z), '墙段用了世界坐标（与盒子不在同一坐标系 ⇒ B88 的双重偏移）')
          .toBeLessThanOrEqual(CELL);
      }

      editor.dispose();
    } finally {
      拆DOM();
    }
  });
});
