/**
 * 房间模板层的几何契约与可重现性（W-B10 切片4e，修 B80/B81/B82）
 *
 * ## 修的是什么
 * 切片4（`fb428aa`）把"房间长什么样"从生成器里搬进模板库，搬过来的同时带了三簇缺陷：
 *
 * - **B80 尺寸契约有两套拼法**。两个房间生产者（`MazeLayout` 与 `LevelEditor._addRoomAt`）
 *   往房间上写的都是 `w`/`d`，模板层读的却是 `room.width`/`room.depth` —— 于是每间房的
 *   地面是 `PlaneGeometry(NaN, NaN)`、墙是 `BoxGeometry(NaN, …)`、碰撞盒是 `{hw: NaN}`。
 *   21 场普查（`.tmp-20261004/wb10s4e-census.mjs`）：**参数 NaN 网格 537、顶点 NaN 537、
 *   NaN 碰撞盒 1095、同一处叠了两层地面的房间 537**。NaN 半宽的 AABB 永不成立，所以那面墙
 *   根本撞不到 —— 与 B78 那一发同一族的后果，不同的来源。
 * - **B81 模板分配吃 `Math.random()`**。同一颗种子两次进入副本会拿到不同的模板 ——
 *   切片4a（修 B75）整片的立论是"种子决定这座迷宫"，那一步把立论从门缝里漏掉了。
 * - **B82 连接规则没人读，室内又叠了一层**。`canConnect`/`buildDoorGap`/`listTemplatesByTag`
 *   零消费者，`_buildStandardRoom` 写了没人调，`_doorClosedMat/_doorOpenMat` 只写不读，
 *   `wallTheme` 拼成 `walkTheme`；9 个模板里 4 个从未被拿到，其中一条三元式的两个分支一模一样。
 *
 * 还有一簇是这一片重写时**新量到的**（见 ③ 的最后一档）：室内摆设贴着某一边放，那一边一旦
 * 其实是门，东西就正站在门洞中间。实测 4 扇普通门被 `lore:double-door` 的读经台堵死，
 * 把 B78 门禁里"门洞走得出人"那一档改红 —— 所以模板的端口声明从"必须开哪几扇"扩成
 * "必须开哪几扇 + 必须实哪几边"（`solid`）。
 *
 * ## 用例分四层
 *
 * ① **尺寸契约**：网格尺寸与碰撞盒全部有限且为正；**这层不许按 `width`/`depth` 问房间尺寸**
 *    （B80 的字段名那一半，有限性尺子接不住的样子见那条用例的注释）；每间普通房**恰好一块**地面；
 *    所有几何与材质都来自共享库，且七座副本反复 build 时缓存零增长（B76 的账）。
 * ② **可重现**：同种子两次 build 的"房号→模板"串与整份网格清单逐字段相同；
 *    只换 `layout.seed` 就能换分配（证明种子真的在管分配，而不是"恰好两次一样"）；
 *    决策级的 `Math.random()` 一发不见，且以 three 发号那批调用作**arming 下限**
 *    （桩没挂上时 0 也绿，所以要看见 UUID 那一类确实在计数）。
 * ③ **贴合与可达**：真副本里每一次分配都满足模板自己的 required/solid；六种模板各由一间
 *    按规则造出来的房间点名拿到（四门路口在真迷宫里 71600 间才出 16 间，构造它而不是祈祷扫到）；
 *    尺寸不贴合的房间当场抛错并点名；Boss 场不套模板。
 * ④ **B82 的账**：零消费者的那三个 API、死的 `_buildStandardRoom`、只写不读的两个
 *    `_doorXxxMat` 都不再存在；注册表恰好是那六个键；重复注册、缺 `buildInterior`、
 *    一边同时 required+solid 都在注册当场拒绝。
 *
 * 反向证据由变异臂脚本 `.tmp-20261004/wb10s4e-arms.mjs` 承担：把 `room.w` 改回 `room.width`、
 * 把分配改回 `Math.random()`、让模板再铺一块地面、绕过 `templateFitsRoom`，各点名哪几档会红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import * as RoomTemplatesModule from '../src/world/RoomTemplates.js';
import {
  ROOM_TEMPLATES, templateFitsRoom, requiredPortCount, openPorts, registerRoomTemplate,
} from '../src/world/RoomTemplates.js';
// 一格边长从尺寸那一份声明里读（切片4f 之前这里问的是 `RoomTemplates` 转手的 `CELL`）。
import { CELL } from '../src/world/dungeonDimensions.js';
import { dungeonAssetStats, isSharedAsset } from '../src/world/dungeonAssets.js';

const SEEDS = [1, 42, 7, 12345, 999983, 2147483646, 555, 20261003];
const DIM_KEYS = ['width', 'height', 'depth', 'radius', 'radiusTop', 'radiusBottom', 'tube'];

function build(def, seed) {
  const layout = ProceduralDungeonGenerator.generate(def, seed);
  const group = new THREE.Group();
  ProceduralDungeonGenerator.buildGeometry(group, layout, def);
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { layout, group, meshes };
}

const r6 = (v) => Math.round(v * 1e6) / 1e6;
/** 整份网格清单：位置 + 尺寸 + 朝向 + 材质外观，**不含 uuid**（three 给每个对象发的身份证号
 *  吃 `Math.random()`，它天生不可重现，也不该被任何玩法读） */
function censusOf(meshes) {
  return meshes.map((m) => [
    m.geometry.type,
    JSON.stringify(Object.entries(m.geometry.parameters ?? {}).sort()),
    m.position.toArray().map(r6).join(','),
    r6(m.rotation.x), r6(m.rotation.y), r6(m.rotation.z),
    m.material?.type ?? '?',
    m.material?.color?.getHexString?.() ?? '?',
  ].join(' | ')).sort().join('\n');
}
const templateStringOf = (layout) =>
  layout.rooms.map((r) => `${r.id}=${r.template ? r.template.key : '(none)'}`).sort().join(',');

/** 一间按模板规则造出来的房：开着的门由 dirs 给出，其余三面是实墙 */
function roomOf(id, dirs, extra = {}) {
  const walls = { n: true, e: true, s: true, w: true };
  for (const d of dirs) walls[d] = false;
  return { id, gx: 0, gz: 0, x: 0, z: 0, w: CELL, d: CELL, walls, ...extra };
}
/** 单间房的分配：拿到的就是那间房的模板（唯一候选时不必碰运气） */
function assignOnly(room, seed = 7) {
  const layout = { seed, rooms: [room] };
  ProceduralDungeonGenerator._assignRoomTemplates(layout);
  return layout.rooms[0].template;
}

describe('房间模板层的几何契约与可重现性（B80/B81/B82）', () => {
  describe('① 尺寸契约：房间只有一套拼法（B80）', () => {
    it('每一个网格的每个尺寸参数都是有限正数', () => {
      let scanned = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          for (const m of build(def, seed).meshes) {
            scanned++;
            const p = m.geometry.parameters ?? {};
            for (const k of DIM_KEYS) {
              // `<= 0` 放过 NaN —— 缺席判据必须问"有限"，否则 NaN 尺寸一路绿到运行时
              if (p[k] !== undefined && !(Number.isFinite(p[k]) && p[k] > 0)) {
                bad.push(`${def.id}/${seed}: ${m.geometry.type}.${k}=${p[k]}`);
              }
            }
          }
        }
      }
      expect(scanned, '扫到的网格数（空集合不能绿成"干净"）').toBeGreaterThan(15000);
      expect(bad.slice(0, 5)).toEqual([]);
      expect(bad.length).toBe(0);
    });

    it('每个网格与每个碰撞盒的坐标都是有限数（NaN 的位置同样建不出东西）', () => {
      // 与上一条分开设：上一条量"几何的尺寸"，这一条量"摆在哪"。模板把坐标写成
      // `room.x + room.width / 2` 时，尺寸仍是常量、只有位置变 NaN —— 只查尺寸的那把尺子
      // 对它是瞎的（变异臂 A1 就是这一发）。
      let 网格 = 0, 盒 = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          const { layout, meshes } = build(def, seed);
          for (const m of meshes) {
            网格++;
            for (const k of ['x', 'y', 'z']) {
              if (!Number.isFinite(m.position[k])) bad.push(`${def.id}/${seed}: 网格位置 ${k}=${m.position[k]}`);
            }
          }
          for (const c of layout.colliders ?? []) {
            盒++;
            if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) bad.push(`${def.id}/${seed}: 碰撞盒中心 (${c.x}, ${c.z})`);
          }
        }
      }
      expect(网格).toBeGreaterThan(15000);
      expect(盒).toBeGreaterThan(10000);
      expect(bad.slice(0, 5)).toEqual([]);
    });

    it('每个碰撞盒的半宽半深都是有限正数（NaN 的 AABB 永远撞不到）', () => {
      let scanned = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          for (const c of build(def, seed).layout.colliders ?? []) {
            scanned++;
            if (!(Number.isFinite(c.hw) && c.hw > 0) || !(Number.isFinite(c.hd) && c.hd > 0)) {
              bad.push(`${def.id}/${seed}: hw=${c.hw} hd=${c.hd}`);
            }
          }
        }
      }
      expect(scanned, '扫到的碰撞盒数').toBeGreaterThan(10000);
      expect(bad).toEqual([]);
    });

    /**
     * B80 的根因不是 NaN，是**一个字段名**：两个生产者写的都是 `w`/`d`，模板层当年读 `width`/`depth`。
     * 上面那两档有限性尺子只接得住这件事的一半 —— `room.width / 2` 参与算术会留下 NaN，
     * 而 `new THREE.BoxGeometry(room.width, 4, 0.8)` 里那个 `undefined` 会被 three 的默认参数
     * 接成 `width = 1`：尺寸有限、位置有限、材质共享，唯一不对的是房间其实只有一米宽
     * （变异臂 A13 就是这一发，它红不出上面任何一档）。所以这里按**拼法**再钉一道。
     */
    const 地下城层 = ['RoomTemplates.js', 'ProceduralDungeonGenerator.js', 'MazeLayout.js',
      'LevelEditor.js', 'DungeonManager.js', 'dungeonAssets.js']
      .map((f) => new URL(`../src/world/${f}`, import.meta.url));
    const 剥注释 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    it('这一层从不按 `room.width`/`room.depth` 问房间的尺寸（B80 的字段名那一半）', () => {
      expect(地下城层.length).toBe(6);
      let 正读 = 0;
      const 越界 = [];
      for (const url of 地下城层) {
        const src = 剥注释(readFileSync(url, 'utf8'));
        正读 += [...src.matchAll(/\broom\.(w|d)\b/g)].length;
        for (const m of src.matchAll(/\broom\.(width|depth)\b/g)) {
          越界.push(`${String(url).split('/').pop()}: ${m[0]}`);
        }
      }
      // arming 下限：人群里确实有人在按正确的拼法问尺寸（30 处，实测值），
      // 否则"0 处越界"可能只是读到了空集合。
      expect(正读, '这层读房间尺寸的次数（0 就意味着扫描没读到东西）').toBeGreaterThanOrEqual(20);
      expect(越界, '按 width/depth 问房间尺寸的地方').toEqual([]);
    });

    it('每间普通房恰好一块地面，且只有生成器那一块（模板不许再铺）', () => {
      const isFloor = (m) => m.geometry.type === 'PlaneGeometry'
        && Math.abs(m.rotation.x + Math.PI / 2) < 1e-9 && Math.abs(m.position.y - 0.02) < 1e-9;
      let rooms = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          const { layout, meshes } = build(def, seed);
          const floors = meshes.filter(isFloor);
          for (const room of layout.rooms) {
            if (room.isBossArena) continue;
            rooms++;
            // 地面按房中心认领：隔壁房那块不算这间房的
            const n = floors.filter((f) => Math.abs(f.position.x - room.x) < 1e-6
              && Math.abs(f.position.z - room.z) < 1e-6).length;
            if (n !== 1) bad.push(`${def.id}/${seed} ${room.id}: ${n} 块地面`);
          }
        }
      }
      expect(rooms).toBeGreaterThan(1000);
      expect(bad.slice(0, 5)).toEqual([]);
    });

    it('几何与材质全部来自共享库，反复 build 时缓存零增长（B76 的账）', () => {
      let meshes = 0, 不共享 = 0;
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          for (const m of build(def, seed).meshes) {
            meshes++;
            if (!isSharedAsset(m.geometry)) 不共享++;
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            for (const mt of mats) if (mt && !isSharedAsset(mt)) 不共享++;
          }
        }
      }
      expect(meshes).toBeGreaterThan(15000);
      expect(不共享, '模板室内 new 出来的几何/材质').toBe(0);

      const 第一轮 = dungeonAssetStats();
      for (const def of DUNGEON_DEFS) build(def, 42);
      const 第二轮 = dungeonAssetStats();
      expect(第二轮).toEqual(第一轮);
    });
  });

  describe('② 可重现：这座迷宫由种子决定（B81）', () => {
    it('同一颗种子两次 build：模板分配与整份网格清单逐字段相同', () => {
      for (const def of [DUNGEON_DEFS[0], DUNGEON_DEFS.find((d) => d.gridW >= 6) ?? DUNGEON_DEFS[1]]) {
        const a = build(def, 20261003);
        const b = build(def, 20261003);
        expect(templateStringOf(b.layout), `${def.id} 第二次的分配`)
          .toBe(templateStringOf(a.layout));
        expect(censusOf(b.meshes), `${def.id} 第二次的网格清单`).toBe(censusOf(a.meshes));
        // 这条用例不许在空清单上绿
        expect(a.meshes.length).toBeGreaterThan(200);
        expect(templateStringOf(a.layout)).toContain('=');
      }
    });

    it('只换 layout.seed 就换分配 —— 种子真的在管，不是"恰好两次一样"', () => {
      // 同一座迷宫（结构完全相同），只把 layout.seed 换掉再分配一次。
      // 若分配不吃种子，这两串会一模一样 —— 那才是 B81 的原样。
      const layout = ProceduralDungeonGenerator.generate(DUNGEON_DEFS[0], 42);
      const 串 = new Map();
      for (const s of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const r of layout.rooms) r.template = null;
        layout.seed = s;
        ProceduralDungeonGenerator._assignRoomTemplates(layout);
        串.set(s, templateStringOf(layout));
      }
      const 不同 = new Set(串.values());
      expect(不同.size, '八颗种子至少该给出两种分配').toBeGreaterThan(1);
      for (const [s, v] of 串) expect(v.length, `seed ${s} 的分配串`).toBeGreaterThan(0);
    });

    it('决策级的 Math.random 一发不见（three 发号那一类除外，并拿它当 arming 下限）', () => {
      const 真 = Math.random;
      let uuid发号 = 0, 决策级 = 0;
      const 样例 = [];
      Math.random = function hooked() {
        // 紧邻的那一帧决定性质：`generateUUID` 是 three 给对象发身份证号，与布局无关；
        // 其它任何调用点都是"玩法/几何的决策吃了无种子的随机" —— 那是要禁的。
        const 上 = (new Error().stack.split('\n')[2] ?? '').trim();
        if (/^at generateUUID /.test(上)) uuid发号++;
        else { 决策级++; if (样例.length < 3) 样例.push(上); }
        return 真.call(Math);
      };
      try {
        // 2 座 × 2 颗 = 4 场：捕获栈帧很贵（每发一次都要拆一次栈），四场已经能发上万号。
        for (const def of DUNGEON_DEFS.slice(0, 2)) {
          for (const seed of SEEDS.slice(0, 2)) {
            const layout = ProceduralDungeonGenerator.generate(def, seed);
            ProceduralDungeonGenerator.buildGeometry(new THREE.Group(), layout, def);
          }
        }
      } finally {
        Math.random = 真;
      }
      expect(uuid发号, '桩一个都没看见调用 ⇒ 判据量的是空集合').toBeGreaterThan(1000);
      expect(样例, `无种子随机来自：${样例.join(' / ')}`).toEqual([]);
      expect(决策级).toBe(0);
    });
  });

  describe('③ 贴合与可达：模板说的话必须真的成立（B82 + 新量到的堵门）', () => {
    it('真副本里每一次分配都满足模板自己的 required/solid', () => {
      let 分配 = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          const { layout } = build(def, seed);
          for (const room of layout.rooms) {
            if (!room.template) continue;
            分配++;
            const opened = new Set(openPorts(room));
            for (const [dir, p] of Object.entries(room.template.ports)) {
              if (!p) continue;
              if (p.required && !opened.has(dir)) bad.push(`${def.id}/${seed} ${room.id}: ${room.template.key} 要 ${dir} 开门，那一边却是实墙`);
              if (p.solid && opened.has(dir)) bad.push(`${def.id}/${seed} ${room.id}: ${room.template.key} 要 ${dir} 是墙，那一边却开着门`);
            }
          }
        }
      }
      expect(分配).toBeGreaterThan(1000);
      expect(bad.slice(0, 5)).toEqual([]);
    });

    it('室内摆设不往门洞里放东西（普通门全部走得出人，B79 那一族除外）', () => {
      // 与 `tests/dungeon-wall-gap.test.js` 的③同一把空间尺子（玩家半径 1.2），
      // 但它盯的是**另一种来路**：那一片钉墙段与门洞的几何，这里钉模板室内的 footprint。
      // 这一档在切片4e 落地前是红的 —— `lore:double-door` 的读经台贴着"东西墙"放，
      // 而那两边当时只被声明成"不必开"而不是"必须是墙"，于是 4 扇门的洞口被堵死
      // （`.tmp-20261004/wb10s4e-door-blockers.mjs`）。
      const R = 1.2;
      let 门 = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42, 12345, 20261003]) {
          const { layout } = build(def, seed);
          const arena = layout.rooms.find((r) => r.isBossArena);
          for (const door of layout.doors) {
            if (arena && Math.abs(door.x - arena.x) < arena.w / 2 + 2
              && Math.abs(door.z - arena.z) < arena.d / 2 + 2) continue;
            门++;
            const 压 = (layout.colliders ?? []).filter(
              (c) => Math.abs(c.x - door.x) < c.hw + R && Math.abs(c.z - door.z) < c.hd + R);
            if (压.length) bad.push(`${def.id}/${seed} ${door.id}: ${压.length} 个盒子`);
          }
        }
      }
      expect(门).toBeGreaterThan(500);
      expect(bad.slice(0, 5)).toEqual([]);
    });

    it('六种模板各有一间按规则造出来的房点名拿到它', () => {
      // 四门路口在真迷宫里 71600 间才出 16 间（`.tmp-20261004/wb10s4e-port-degree.mjs`），
      // 所以可达性用**构造**而不是扫种子：按模板自己的 required/solid 造一间一定贴合的房。
      const 拿到 = new Map();
      拿到.set('chamber:square', assignOnly(roomOf('r1', ['n'])));          // 只北门，谁都不要实墙/必开门 → 方厅兜底
      拿到.set('treasure:small', assignOnly(roomOf('r2', ['s'])));          // 只南门 → 宝藏房（必开门 1 > 方厅 0）
      拿到.set('junction:tee', assignOnly(roomOf('r3', ['n', 'e', 's'])));  // 西墙实着，壁龛贴它
      拿到.set('junction:cross', assignOnly(roomOf('r4', ['n', 'e', 's', 'w'])));
      // hall 与 lore 都要求"南北开门、其余不限/为墙"，必开门数同为 2 → 并列，由种子定
      const 并列 = new Set();
      for (let s = 1; s <= 24; s++) 并列.add(assignOnly(roomOf('r5', ['n', 's']), s)?.key);
      expect([...并列].sort()).toEqual(['hall:straight', 'lore:double-door']);
      // 那个"由种子定"必须建立在**真的打平**上：两条的必开门数相等，且等于那间房全部候选的最大值。
      // 没有这一条，上面那 24 颗种子的并列可能只是"排序碰巧轮到"，而不是规则说它们同格。
      const 候选r5 = Object.values(ROOM_TEMPLATES).filter((t) => templateFitsRoom(t, roomOf('r5', ['n', 's'])));
      const 最高 = Math.max(...候选r5.map(requiredPortCount));
      expect(候选r5.filter((t) => requiredPortCount(t) === 最高).map((t) => t.key).sort())
        .toEqual(['hall:straight', 'lore:double-door']);

      for (const [key, got] of 拿到) expect(got?.key, `${key} 没被拿到`).toBe(key);
      // 单候选时不该靠运气：兜底那一档确实只有方厅贴合
      const 候选 = Object.values(ROOM_TEMPLATES).filter((t) => templateFitsRoom(t, roomOf('r1', ['n'])));
      expect(候选.map((t) => t.key)).toEqual(['chamber:square']);
    });

    it('尺寸不贴合的房间当场抛错，消息点名房间与它的尺寸', () => {
      const odd = { ...roomOf('r_9_9', ['n', 's']), w: CELL + 7, d: CELL };
      expect(() => assignOnly(odd)).toThrow(/r_9_9/);
      expect(() => assignOnly(odd)).toThrow(new RegExp(`${CELL + 7}×${CELL}`));
    });

    it('Boss 场不套模板（它由 _buildBossArena 自己建，34×34 不在模板的尺寸假设里）', () => {
      for (const def of DUNGEON_DEFS) {
        const { layout } = build(def, 42);
        const arena = layout.rooms.find((r) => r.isBossArena);
        expect(arena, `${def.id} 没有 Boss 场`).toBeTruthy();
        expect(arena.template).toBeNull();
        expect(arena.w).not.toBe(CELL);
      }
    });

    it('模板的室内函数不加灯（合同第 4 条：每间房恰好一盏，且一盏不多）', () => {
      // 量法：灯按**房间组**认领。`_buildRoomGeometry` 给每间房放一盏（Boss 场那一盏在
      // `_buildBossArena`），模板若自己加灯，那一间就变两盏；若有灯游离在房间组之外，
      // 全场总数就对不上 Σ每房。两头一起钉。
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42]) {
          const { layout, group } = build(def, seed);
          let 全场灯 = 0;
          group.traverse((o) => { if (o.isLight) 全场灯++; });
          const 每房 = layout.rooms.map((r) => {
            let n = 0;
            r.group?.traverse?.((o) => { if (o.isLight) n++; });
            return n;
          });
          expect(每房.filter((n) => n !== 1).length, `${def.id}/${seed} 有房间不是恰好一盏灯`)
            .toBe(0);
          expect(全场灯, `${def.id}/${seed} 有灯不落在任何房间组里`).toBe(每房.length);
        }
      }
    });
  });

  describe('④ B82 的账：零消费者的 API 与只写不读的字段不再存在', () => {
    it('注册表恰好是这十一款模板（切片6 补了转角四款与东西向走廊一款）', () => {
      // 这一条钉的是"库里有哪些款"这件事本身 —— 加一款就要在这里加一个名字，
      // 顺带逼着加的人回答"它在迷宫里什么时候会被选中"（见 ⑤ 那两条读数门禁）。
      expect(Object.keys(ROOM_TEMPLATES).sort()).toEqual([
        'chamber:square', 'corner:en', 'corner:es', 'corner:nw', 'corner:sw',
        'hall:crosswise', 'hall:straight', 'junction:cross', 'junction:tee',
        'lore:double-door', 'treasure:small',
      ]);
    });

    it('连接规则的三个零消费者 API 与死掉的 DIR/OPPOSITE 都从模块上消失', () => {
      for (const gone of ['canConnect', 'buildDoorGap', 'listTemplatesByTag', 'DIR', 'OPPOSITE']) {
        expect(RoomTemplatesModule[gone], `${gone} 还在导出`).toBeUndefined();
      }
    });

    it('生成器不再有死的 _buildStandardRoom/_getEntranceDirection，layout 不再有只写不读的门材质字段', () => {
      expect(ProceduralDungeonGenerator._buildStandardRoom).toBeUndefined();
      expect(ProceduralDungeonGenerator._getEntranceDirection).toBeUndefined();
      const { layout } = build(DUNGEON_DEFS[0], 42);
      expect(layout._doorClosedMat).toBeUndefined();
      expect(layout._doorOpenMat).toBeUndefined();
    });

    it('注册闸门：重复注册、缺 buildInterior、一边同时 required+solid 都当场拒绝', () => {
      expect(() => registerRoomTemplate({
        id: 'chamber', variant: 'square', width: CELL, depth: CELL, ports: {}, buildInterior() {},
      })).toThrow(/already registered/);

      expect(() => registerRoomTemplate({
        id: 'probe-no-interior', variant: 'base', width: CELL, depth: CELL, ports: {},
      })).toThrow(/buildInterior/);

      expect(() => registerRoomTemplate({
        id: 'probe-contradiction', variant: 'base', width: CELL, depth: CELL,
        ports: { n: { required: true, solid: true } }, buildInterior() {},
      })).toThrow(/既是门又必须是墙|不可能/);

      // 三个拒绝都不该留下半个模板
      expect(Object.keys(ROOM_TEMPLATES).length).toBe(11);
    });
  });

  describe('⑤ 模板库覆盖迷宫真正长出来的形状（W-B10 切片6）', () => {
    /** 7 座 × 40 颗种子扫一遍，按"实际被选中的模板"计数（判据与生产同路：`buildGeometry` 会分配） */
    const sweep = () => {
      const 用量 = new Map();
      const 形状 = new Map(); // 开口组合 → 房间数
      let 总 = 0;
      for (const def of DUNGEON_DEFS) {
        for (let i = 1; i <= 40; i++) {
          const { layout } = build(def, i * 7919);
          for (const r of layout.rooms) {
            if (r.isBossArena || r.id === layout.spawn.id) continue;
            总++;
            const k = r.template?.key ?? '(无)';
            用量.set(k, (用量.get(k) ?? 0) + 1);
            const 键 = openPorts(r).sort().join('') || '(封死)';
            形状.set(键, (形状.get(键) ?? 0) + 1);
          }
        }
      }
      return { 用量, 形状, 总 };
    };

    it('通用兜底房不再是主旋律：`chamber:square` 占比从 51% 降到 20% 以内', () => {
      // 改前读数（`.tmp-20261010/room-template-census.mjs`，6880 间）：
      // chamber:square **3512 间 = 51.05%** —— 因为转角（49.6%）与东西向走廊（15.5%）
      // 两款形状**一款模板都没有**，全落回它。玩家侧的说法是"每间房长得一样"。
      const { 用量, 总 } = sweep();
      const 兜底 = 用量.get('chamber:square') ?? 0;
      expect(总, '一间房都没扫到，这条是空转').toBeGreaterThan(3000);
      expect(兜底 / 总, `通用兜底房占 ${(兜底 / 总 * 100).toFixed(1)}% —— 模板库又跟不上迷宫了`)
        .toBeLessThan(0.20);
    });

    it('两款最常见的两开口形状都有专属模板（转角四款 + 东西向走廊一款）', () => {
      // 两开口房间占 81%，其中四种转角 49.6%、东西向 15.5%。**每一款两开口形状都必须有
      // 一个"必开门数 ≥ 2"的模板贴合它** —— 否则那一整族房间就只能落回兜底房（改前正是如此）。
      const 两开口 = ['en', 'es', 'nw', 'sw', 'ew', 'ns'];
      const 未覆盖 = [];
      for (const 形状 of 两开口) {
        const dirs = [...形状];
        const 命中 = Object.values(ROOM_TEMPLATES)
          .filter((t) => templateFitsRoom(t, roomOf('probe', dirs)) && requiredPortCount(t) >= 2);
        if (!命中.length) 未覆盖.push(形状);
      }
      expect(未覆盖, `这两开口形状没有专属模板：${未覆盖.join(' / ')}`).toEqual([]);
    });

    it('每一款注册的模板都真的被选中过（写了没人读的模板 = 死内容）', () => {
      const { 用量 } = sweep();
      const 零 = Object.keys(ROOM_TEMPLATES).filter((k) => !(用量.get(k) > 0));
      expect(零, `这些模板在 7 座 × 40 颗种子里一次都没被选中：${零.join(' / ')}`).toEqual([]);
      // `junction:cross` 是天然稀有（四开口房 6880 间里 1 间）—— 它的读数一并钉住，
      // 免得哪天它真的掉到 0 而没人发现（"稀有"与"死掉"在读数上必须分得开）。
      expect(用量.get('junction:cross'), '四开口路口那款模板掉了').toBeGreaterThanOrEqual(1);
    });
  });
});
