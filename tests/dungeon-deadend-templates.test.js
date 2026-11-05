/**
 * 死路房与四向 T 口（W-E3 切片53）—— 迷宫里最后两种还在"长得一样"的房间。
 *
 * ## 这一片修的是什么
 * 切片6 把转角（49.6%）与东西向走廊（15.5%）接住之后，`chamber:square` 仍占 ~18.7%。
 * 切片53 动手前的普查（10 座 × 8 颗种子，1896 间普通房）把它拆成两半：
 * - **一开口（死路）11.3%**：`s` / `e` / `n` / `w` 四向，模板库一款都没有；
 * - **三开口里的三向 7.4%**：`junction:tee` 只认"西墙实着"那一款，`enw` / `nsw` / `ens` 没辙。
 * 于是"探到尽头"与"从岔路口拐进去"这两种最常被记住的走法，看到的都是同一间四角柱方厅。
 *
 * ## 这一片做了什么
 * 死路四款（`deadend:<开门方向>`）+ T 口补到四向。旧名 `junction:tee` 保留 = 西墙那款：
 * 关卡编辑器导出的布局把房间的 `templateKey` 字面量一起存了，改名会让那些布局找不到模板。
 *
 * ## 用例分五层
 * 1. **端口**：死路恰 1 必开门 + 3 实墙、T 口恰 3 必开门 + 1 实墙，方向与变体名一致；
 * 2. **不挡路**：八款模板的室内碰撞体都不落进**门洞那条通道**（宽 = `DOOR_WIDTH`，从房心到开门那面墙）；
 * 3. **全形状覆盖**：四种开口数（1~4）× 所有组合，都有"必开门数 = 开口数"的模板；
 * 4. **真迷宫读数**：80 座迷宫里兜底房 0 间，八款新模板各至少被选中一次。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { ROOM_TEMPLATES, templateFitsRoom, requiredPortCount } from '../src/world/RoomTemplates.js';
import { CELL, DOOR_WIDTH } from '../src/world/dungeonDimensions.js';

const DIRS = ['n', 'e', 's', 'w'];
/** 与迷宫、室内摆设同一套方向：(n 是 −z) */
const DIR_VEC = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

const roomOf = (id, dirs) => {
  const walls = { n: true, e: true, s: true, w: true };
  for (const d of dirs) walls[d] = false;
  return { id, gx: 0, gz: 0, x: 0, z: 0, w: CELL, d: CELL, walls };
};

const openDirsOf = (tpl) => DIRS.filter((d) => tpl.ports[d]?.required);

/** 跑一款模板的室内函数，收回它交给碰撞表的盒子 */
function collidersOf(tpl) {
  const 盒 = [];
  const ctx = {
    wallMat: new THREE.MeshBasicMaterial(),
    accentMat: new THREE.MeshBasicMaterial(),
    addCollider: (x, z, w, d) => 盒.push({ x, z, hw: w / 2, hd: d / 2 }),
  };
  // 房间用模板自己的必开门方向造 —— 夹具与模板自洽，量的是"摆设放哪儿"，不是"能不能贴合"
  const room = roomOf('probe', openDirsOf(tpl));
  tpl.buildInterior(new THREE.Group(), room, { wallH: 5, wallT: 0.6 }, { accent: 0xffffff }, ctx);
  return { 盒, room };
}

/** 门洞通道：从房心沿开门方向到那面墙（多留 0.2 米），横向宽 = 门洞 */
function laneOf(room, dir) {
  const [vx, vz] = DIR_VEC[dir];
  const 深 = (vx ? room.w : room.d) / 2 + 0.2;
  const 横 = DOOR_WIDTH / 2;
  return {
    x: room.x + vx * 深 / 2,
    z: room.z + vz * 深 / 2,
    hw: vx ? 深 / 2 : 横,
    hd: vz ? 深 / 2 : 横,
  };
}

const 相交 = (a, b) => Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.z - b.z) < a.hd + b.hd;

/** 从 DIRS 里取 n 个的全部组合 */
function 组合(dirs, n) {
  if (n === 0) return [[]];
  if (dirs.length < n) return [];
  const [头, ...尾] = dirs;
  return [
    ...组合(尾, n - 1).map((rest) => [头, ...rest]),
    ...组合(尾, n),
  ];
}

const 新模板名 = [
  'deadend:n', 'deadend:e', 'deadend:s', 'deadend:w',
  'junction:tee', 'junction:tee-n', 'junction:tee-e', 'junction:tee-s',
];

describe('死路房与四向 T 口（W-E3 切片53）', () => {
  it('死路四款：恰一扇门 + 三面实墙，变体名就是开门那一边', () => {
    for (const dir of DIRS) {
      const tpl = ROOM_TEMPLATES[`deadend:${dir}`];
      expect(tpl, `deadend:${dir} 没注册`).toBeTruthy();
      expect(DIRS.filter((d) => tpl.ports[d]?.required)).toEqual([dir]);
      expect(DIRS.filter((d) => tpl.ports[d]?.solid).sort())
        .toEqual(DIRS.filter((d) => d !== dir).sort());
      expect(requiredPortCount(tpl)).toBe(1);
      // 贴合只对"一开口且就是这一向"的房间成立：多开一扇门就不该再套死路
      expect(templateFitsRoom(tpl, roomOf('p', [dir]))).toBe(true);
      for (const 另一向 of DIRS.filter((d) => d !== dir)) {
        expect(templateFitsRoom(tpl, roomOf('p', [dir, 另一向])), `deadend:${dir} 套到了两开口房`).toBe(false);
      }
    }
  });

  it('T 口四向：恰三扇门 + 一面实墙；旧名 `junction:tee` 仍是西墙那款（编辑器布局里存着这个字面量）', () => {
    expect(ROOM_TEMPLATES['junction:tee'], '旧名被改名了 —— 编辑器导出的布局会找不到模板').toBeTruthy();
    expect(ROOM_TEMPLATES['junction:tee'].ports.w.solid).toBe(true);
    const 名 = { w: 'junction:tee', n: 'junction:tee-n', e: 'junction:tee-e', s: 'junction:tee-s' };
    for (const solid of DIRS) {
      const tpl = ROOM_TEMPLATES[名[solid]];
      expect(tpl, `${名[solid]} 没注册`).toBeTruthy();
      expect(DIRS.filter((d) => tpl.ports[d]?.required).sort())
        .toEqual(DIRS.filter((d) => d !== solid).sort());
      expect(DIRS.filter((d) => tpl.ports[d]?.solid)).toEqual([solid]);
      expect(requiredPortCount(tpl)).toBe(3);
      expect(templateFitsRoom(tpl, roomOf('p', DIRS.filter((d) => d !== solid)))).toBe(true);
    }
  });

  it('门洞那条通道一个字不占：八款模板的摆设全在通道之外', () => {
    let 扫过 = 0;
    for (const key of 新模板名) {
      const tpl = ROOM_TEMPLATES[key];
      const { 盒, room } = collidersOf(tpl);
      expect(盒.length, `${key} 一件碰撞体都没摆 —— 这条腿会空转`).toBeGreaterThan(0);
      for (const dir of openDirsOf(tpl)) {
        const lane = laneOf(room, dir);
        for (const c of 盒) {
          expect(相交(c, lane), `${key} 的摆设 (${c.x}, ${c.z}) 压进了 ${dir} 门洞通道`).toBe(false);
        }
        扫过++;
      }
    }
    expect(扫过, '一条通道都没量到').toBe(16);
  });

  it('每一种开口形状都有"必开门数 = 开口数"的模板（兜底房已无形状可接）', () => {
    for (let n = 1; n <= 4; n++) {
      for (const 边 of 组合(DIRS, n)) {
        const room = roomOf('p', 边);
        const 命中 = Object.values(ROOM_TEMPLATES)
          .filter((t) => templateFitsRoom(t, room) && requiredPortCount(t) === n);
        expect(命中.length, `开 ${边.join('') || '无'} 的房间没有必开门 ${n} 的模板`).toBeGreaterThan(0);
      }
    }
  });

  it('真迷宫读数：80 座里兜底房 0 间，八款新模板各至少被选中一次', () => {
    const 用量 = new Map();
    let 总 = 0;
    for (const def of DUNGEON_DEFS) {
      for (let i = 1; i <= 8; i++) {
        const layout = ProceduralDungeonGenerator.generate(def, i * 7919);
        ProceduralDungeonGenerator.buildGeometry(new THREE.Group(), layout, def);
        for (const r of layout.rooms) {
          if (r.isBossArena || r.id === layout.spawn.id) continue;
          总++;
          用量.set(r.template?.key ?? '(无)', (用量.get(r.template?.key ?? '(无)') ?? 0) + 1);
        }
      }
    }
    expect(总, '一间房都没扫到').toBeGreaterThan(1500);
    expect(用量.get('chamber:square') ?? 0, '兜底房又接住真形状了 —— 模板库跟不上迷宫').toBe(0);
    const 零 = 新模板名.filter((k) => !(用量.get(k) > 0));
    expect(零, `这八款里有模板一次都没被选中：${零.join(' / ')}`).toEqual([]);
  });
});
