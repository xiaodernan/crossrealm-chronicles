/**
 * 关卡编辑器的导出载荷 —— **生产读法**（W-B11 切片4）。
 *
 * ## 这一片补的是什么
 *
 * 关卡编辑器能导出一份布局的**几何部分**（房间 / 门 / 六枚尺寸载体），它的头部就写着
 * 「导出 JSON（可被 `ProceduralDungeonGenerator` 读取）」—— 但**读的那条路当时不存在**：
 * 生成器只会自己摇一座迷宫，而「把一份几何补成可玩的布局」那段（出生点 / 出口 / Boss 场 /
 * 门 / 怪 / 文献 / 边界）长在 `generateMaze` 里 ⇒ 编辑器导出的那份**永远补不全**。
 *
 * 补法：把那段**补完**拆出来（`MazeLayout.补完布局`），两条路共用同一段。
 *
 * ## 这一片要钉住的
 *
 * ① **两条路走的是同一段补完** ⇒ 同一份房间，走载荷那条与走摇出来那条，**逐格相同**；
 * ② **坏载荷当场点名**（缺格 / 非整数 / 墙不是布尔 / 房没有格号 / 没有遭遇表）——
 *    静默兜底就是"一座空城"（没有报错，只有玩家发现里面没有怪）；
 * ③ **副本定义里那份布局真的被用上了**（不是"写了没人读"）；
 * ④ 载荷读出来的布局**能过几何层那道合同**（六枚尺寸载体都在）。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { 布局从载荷, 读尺寸, LAYOUT_SIZE_CARRIERS, 载体名册 } from '../src/world/dungeonLayoutPayload.js';
import { 造迷宫房间, makeSeededRng, 补完布局 } from '../src/world/MazeLayout.js';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { DUNGEON_LAYOUTS } from './fixtures/dungeonLayouts.fixture.js';
import { dungeonEncounterOf } from '../src/content/dungeonEncounters.js';

const 种子 = 20261022;
const 载荷 = DUNGEON_LAYOUTS['hub-catacombs'];

describe('① 两条路走的是同一段「补完」', () => {
  it('同一份房间：走载荷那条与走摇出来那条，**逐格相同**', () => {
    const 遭遇 = dungeonEncounterOf('hub-catacombs');
    // 摇出来的那条
    const 摇的 = 补完布局(造迷宫房间(5, 5, makeSeededRng(种子)), {
      gridW: 5, gridH: 5, rnd: makeSeededRng(种子), encounters: 遭遇, seed: 种子,
    });
    // 走载荷的那条
    const 载的 = 布局从载荷(载荷, { encounters: 遭遇, seed: 种子, gridW: 5, gridH: 5 });
    expect(载的.rooms.map((r) => r.id)).toEqual(摇的.rooms.map((r) => r.id));
    expect(载的.doors.map((d) => d.id)).toEqual(摇的.doors.map((d) => d.id));
    expect(载的.spawn.id).toBe(摇的.spawn.id);
    expect(载的.exit.id).toBe(摇的.exit.id);
    expect(载的.bounds).toEqual(摇的.bounds);
    // 怪与文献：同一颗种子 ⇒ 同一份编组（逐间房比）
    for (let i = 0; i < 载的.rooms.length; i += 1) {
      expect(载的.rooms[i].enemySpawns, `第 ${i} 间房的怪不一样`).toEqual(摇的.rooms[i].enemySpawns);
    }
  });

  it('载荷自带的种子优先（编辑器导出时带着它 ⇒ 读回来是**同一座**副本）', () => {
    const 遭遇 = dungeonEncounterOf('hub-catacombs');
    const 第一次 = 布局从载荷(载荷, { encounters: 遭遇, seed: 1, gridW: 5, gridH: 5 });
    const 第二次 = 布局从载荷(载荷, { encounters: 遭遇, seed: 999, gridW: 5, gridH: 5 });
    expect(第一次.rooms.map((r) => r.enemySpawns)).toEqual(第二次.rooms.map((r) => r.enemySpawns));
  });
});

describe('② 坏载荷当场点名（不静默兜底）', () => {
  const 遭遇 = dungeonEncounterOf('hub-catacombs');
  const 读 = (改) => 布局从载荷({ ...载荷, ...改 }, { encounters: 遭遇, seed: 种子, gridW: 5, gridH: 5 });

  it('载荷不是一个对象 ⇒ 点名', () => {
    expect(() => 布局从载荷(null, { encounters: 遭遇 })).toThrow(/不是一个对象/);
  });

  it('一间房都没有 ⇒ 点名', () => {
    expect(() => 读({ rooms: [] })).toThrow(/一间房都没有/);
  });

  it('格数不是整数 ⇒ 点名（`||` 会把 0 悄悄变成 18）', () => {
    expect(() => 读({ gridW: 5.5 })).toThrow(/gridW/);
    expect(() => 读({ gridW: 0 })).toThrow(/gridW/);
  });

  it('载荷的格数与副本定义说的对不上 ⇒ 点名（两份真相）', () => {
    expect(() => 布局从载荷(载荷, { encounters: 遭遇, seed: 种子, gridW: 6, gridH: 5 })).toThrow(/gridW/);
  });

  it('房的墙不是布尔 ⇒ 点名', () => {
    const 坏 = { ...载荷, rooms: [{ ...载荷.rooms[0], walls: { n: 'yes', e: false, s: false, w: false } }] };
    expect(() => 布局从载荷(坏, { encounters: 遭遇, seed: 种子, gridW: 5, gridH: 5 })).toThrow(/墙/);
  });

  it('房的格号不是整数 ⇒ 点名', () => {
    const 坏 = { ...载荷, rooms: [{ ...载荷.rooms[0], gx: 1.5 }] };
    expect(() => 布局从载荷(坏, { encounters: 遭遇, seed: 种子, gridW: 5, gridH: 5 })).toThrow(/格号/);
  });

  it('没有遭遇表 ⇒ 点名（载荷那条路以前根本没有"出谁"这件事）', () => {
    expect(() => 布局从载荷(载荷, { encounters: null, seed: 种子, gridW: 5, gridH: 5 })).toThrow(/遭遇表/);
  });

  it('尺寸读法：缺才回落，带来就必须有限正数', () => {
    expect(读尺寸('wallH', undefined, 5)).toBe(5);
    expect(读尺寸('wallH', 7, 5)).toBe(7);
    expect(() => 读尺寸('wallH', 0, 5)).toThrow(/wallH/);
    expect(() => 读尺寸('wallH', 'x', 5)).toThrow(/wallH/);
  });
});

describe('③ 生成器认得 `def.layout`（机制已就位，生产副本还没用上它）', () => {
  it('把载荷挂到定义上 ⇒ 生成器走的是它（不是摇）', () => {
    const def = DUNGEON_DEFS.find((d) => d.id === 'hub-catacombs');
    const 带上 = { ...def, layout: DUNGEON_LAYOUTS['hub-catacombs'] };
    const 布局 = ProceduralDungeonGenerator.generate(带上, 种子);
    // Boss 场把四格并成了一间 ⇒ 补完之后的房间比载荷**少三**（25 → 22）
    expect(布局.rooms.length, '房间数与载荷对不上').toBe(DUNGEON_LAYOUTS['hub-catacombs'].rooms.length - 3);
    // 出生点与出口都出自载荷里的房间（补完是从这份房间推出来的）
    const 载荷的 = new Set(DUNGEON_LAYOUTS['hub-catacombs'].rooms.map((r) => r.id));
    expect(载荷的.has(布局.spawn.id), '出生点不在载荷的房间里').toBe(true);
    expect(载荷的.has(布局.exit.id), '出口不在载荷的房间里').toBe(true);
    // 没有它 ⇒ 摇出来的那座**不一样**（换个种子）⇒ 这一条证明"走的是载荷那条"
    const 摇的 = ProceduralDungeonGenerator.generate(def, 种子 + 1);
    expect(摇的.rooms.map((r) => r.id), '摇出来的那座与载荷一样 ⇒ 这一条证明不了什么')
      .not.toEqual(DUNGEON_LAYOUTS['hub-catacombs'].rooms.map((r) => r.id));
  });

  it('**九座副本都还没用上它**（机制就位，第一位设计者交来第一张图时才挂上去）', () => {
    for (const def of DUNGEON_DEFS) {
      expect(def.layout, `${def.id} 不知怎么带了一份布局 —— 这一条要改成"哪一座带设计布局"`).toBeFalsy();
    }
  });
});

describe('④ 载荷读出来的布局能过几何层那道合同', () => {
  it('六枚尺寸载体都在（几何层缺一格就抛 —— B89）', () => {
    const 布局 = 布局从载荷(载荷, { encounters: dungeonEncounterOf('hub-catacombs'), seed: 种子, gridW: 5, gridH: 5 });
    for (const 名 of 载体名册) {
      expect(typeof 布局[名], `布局缺 ${名}`).toBe('number');
      expect(Number.isFinite(布局[名]), `布局的 ${名} 不是有限数`).toBe(true);
    }
    expect(载体名册).toEqual(Object.keys(LAYOUT_SIZE_CARRIERS));
    expect(载体名册).toHaveLength(6);
  });

  it('几何层真的拿这份布局建得出东西（不抛）', () => {
    const def = DUNGEON_DEFS.find((d) => d.id === 'hub-catacombs');
    const 布局 = ProceduralDungeonGenerator.generate(def, 种子);
    const group = new THREE.Group();
    expect(() => ProceduralDungeonGenerator.buildGeometry(group, 布局, def)).not.toThrow();
    expect(group.children.length, '几何层什么也没建出来').toBeGreaterThan(0);
  });
});
