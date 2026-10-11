/**
 * 地下城墙段与门洞的形状（W-B10 切片4c，修 B78）
 *
 * ## 修的是什么
 * `ProceduralDungeonGenerator` 里东西向门洞的两处 `addWallWithGap` 把
 * `totalLen` 与 `thickness` 传反了：南北向写的是 `(rw, WT, …)`，东西向写的是 `(WT, rd, …)`。
 * 于是 `seg = (0.6 - 4) / 2 = -1.7` —— **门洞两侧的墙段建成宽 18 米、深 −1.7 米的盒子**，
 * 位置也落在门中心而不是墙的两端，碰撞盒半深 −0.85。
 *
 * 后果不是"看起来怪"而是**那面墙撞不到**：`hw/hd` 为负的 AABB 永远不成立
 * （改前实测 1936/5790 条 collider 半宽或半深为负，占 33%）。
 * 改前量测：`.tmp-20261003/wb10s4c-b78-measure.mjs`。
 *
 * ## 用例分六层
 *
 * 1. **负尺寸绝迹**（运行时扫真七座 × 8 颗种子）：没有任何网格的几何带 ≤0 的尺寸参数，
 *    也没有任何 collider 的 `hw`/`hd` ≤ 0。带样本下限 —— 空集合不能绿成"干净"。
 * 2. **门洞墙段的形状**（真读者）：门洞两侧那两段恒为 `(wallT, (边长 − doorW)/2)`，
 *    且东西向与南北向**同形**（这是错位那一版唯一对不上的一条）。
 * 3. **门洞真的通**（玩法层）：门中心没有被墙体 collider 盖住；
 *    而门洞两侧**确实有墙**（否则"通"可能是因为整面墙都没建）。
 * 4. **墙段位置**：两段分列门中心两侧，中点距门中心 == `(seg + gap) / 2`。
 * 5. **门板/门框对得上洞**（切片4f 重写的一档）：门板尺寸逐座逐门一致 **且** 每扇板的沿墙尺寸
 *    把**量出来的**洞盖到每侧只剩一条缝，缝不超过门框的收边。原先这一档写的是两个手抄三元组
 *    （`3.5×4.2×0.5` / `4.2×4.8×0.15`），于是"每扇门的板都比自己的洞窄 0.25 米"被钉成了绿灯。
 * 6. **布局不受影响**：房间与门的布局签名冻三颗 —— 本片动的是几何，不是迷宫。
 *
 * 期望的尺寸一律从 `layout` 读（`cellSize` / `doorWidth` / `bossDoorWidth` / `wallT` / `wallH`），
 * 这一片自己的那份抄本也在切片4f 里收掉了：写死 `4` / `5` 时，改宽门洞要改九处。
 *
 * 反向证据（"这把尺子在错位那一版上量得到东西"）不放在这里，由变异臂脚本
 * `.tmp-20261003/wb10s4c-arms.mjs` 承担：改回 `(WT, rd, …)` 后点名哪几条会红。
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { cellCenter, doorsOnSide } from '../src/world/MazeLayout.js';
import { DOOR_JAMB, HOLE_WIDTH_CARRIERS } from '../src/world/dungeonDimensions.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';

const SEEDS = [1, 42, 7, 12345, 999983, 2147483646, 555, 20261003];

/** 几何里所有"长度性质"的参数 —— 不同几何类型名字不同，逐个认 */
const DIM_KEYS = ['width', 'height', 'depth', 'radius', 'radiusTop', 'radiusBottom', 'tube'];

const meshesOf = (group) => {
  const out = [];
  group.traverse((o) => { if (o.isMesh) out.push(o); });
  return out;
};

function build(def, seed) {
  const layout = ProceduralDungeonGenerator.generate(def, seed);
  const group = new THREE.Group();
  ProceduralDungeonGenerator.buildGeometry(group, layout, def);
  return { layout, group, meshes: meshesOf(group) };
}

/** 墙段的两个水平尺寸：小的是厚度，大的是长度 */
const span = (g) => {
  const p = g.parameters ?? {};
  const w = p.width, d = p.depth;
  return { thin: Math.min(w, d), long: Math.max(w, d) };
};

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** 按"落在哪儿 + 多大"去重：位置与尺寸都相同的网格只算一份 */
function dedupeBySpot(meshes) {
  const seen = new Map();
  for (const m of meshes) {
    const p = m.geometry.parameters ?? {};
    const k = [m.position.x, m.position.y, m.position.z, p.width, p.height, p.depth]
      .map((v) => Math.round(v * 1e6)).join(',');
    if (!seen.has(k)) seen.set(k, m);
  }
  return [...seen.values()];
}

/**
 * 从**墙段**量出这扇门所在那个洞的宽度（切片4f）：沿门所在的墙线，取贴着该线、
 * 厚度等于 wallT、高度居中的盒段，洞宽 = 右侧最近段的内端 − 左侧最近段的内端。
 * 量不出来回 null —— 那本身就是一条要报的读数（这一侧根本没有墙段收尾）。
 */
function 量门洞(layout, meshes, door) {
  const 侧向 = door.dir === 'n' || door.dir === 's' ? 'x' : 'z';
  const 轴向 = 侧向 === 'x' ? 'z' : 'x';
  const 段 = [];
  for (const m of meshes) {
    if (m.geometry.type !== 'BoxGeometry') continue;
    const p = m.geometry.parameters;
    const 长 = 侧向 === 'x' ? p.width : p.depth;
    const 厚 = 侧向 === 'x' ? p.depth : p.width;
    if (Math.abs(厚 - layout.wallT) > 1e-6) continue;
    if (Math.abs(m.position[轴向] - door[轴向]) > 1e-6) continue;
    if (Math.abs(m.position.y - layout.wallH / 2) > 1e-6) continue;
    const c = m.position[侧向];
    段.push([c - 长 / 2, c + 长 / 2]);
  }
  const 左 = 段.filter(([a, b]) => b <= door[侧向] + 1e-6).map(([, b]) => b);
  const 右 = 段.filter(([a]) => a >= door[侧向] - 1e-6).map(([a]) => a);
  if (!左.length || !右.length) return null;
  return Math.min(...右) - Math.max(...左);
}

describe('地下城墙段与门洞的形状（B78）', () => {
  describe('① 负尺寸绝迹', () => {
    it('没有任何网格的几何带 ≤0 的尺寸参数', () => {
      let scanned = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          const { meshes } = build(def, seed);
          for (const m of meshes) {
            scanned++;
            const p = m.geometry.parameters ?? {};
            for (const k of DIM_KEYS) {
              if (typeof p[k] === 'number' && p[k] <= 0) bad.push(`${def.id}/${seed}: ${m.geometry.type}.${k}=${p[k]}`);
            }
          }
        }
      }
      // 样本下限：扫不到东西的"绝迹"是假绿
      expect(scanned).toBeGreaterThan(8000);
      expect(bad).toEqual([]);
    });

    it('没有任何 collider 的半宽或半深 ≤ 0', () => {
      let scanned = 0;
      const bad = [];
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          const { layout } = build(def, seed);
          for (const c of layout.colliders ?? []) {
            scanned++;
            if (c.hw <= 0 || c.hd <= 0) bad.push(`${def.id}/${seed}: hw=${c.hw} hd=${c.hd}`);
          }
        }
      }
      expect(scanned).toBeGreaterThan(4000);
      expect(bad).toEqual([]);
    });
  });

  describe('② 门洞墙段的形状', () => {
    it('普通房的门洞墙段恒为 (wallT, (沿边长 − 这扇门的洞宽)/2)，东西向与南北向同形', () => {
      const def = DUNGEON_DEFS.find((d) => d.gridW >= 5 && d.gridH >= 5);
      for (const seed of [1, 42, 12345]) {
        const { layout, meshes } = build(def, seed);
        const WT = layout.wallT;

        for (const room of layout.rooms) {
          if (room.isBossArena) continue;
          const sides = [
            { dir: 'n', axis: 'z', at: room.z - room.d / 2, dim: 'd' },
            { dir: 's', axis: 'z', at: room.z + room.d / 2, dim: 'd' },
            { dir: 'w', axis: 'x', at: room.x - room.w / 2, dim: 'w' },
            { dir: 'e', axis: 'x', at: room.x + room.w / 2, dim: 'e' },
          ];
          for (const s of sides) {
            if (room.walls[s.dir] !== false) continue;
            // 洞宽**由这一侧那扇门自己说**（切片5d 的口径 4）：朝 Boss 场开的那一面按 `bossDoorWidth`，
            // 其余按 `doorWidth`。改前这里整条边抄一个 `layout.doorWidth`，于是量出来的洞（5 米）
            // 与期望（4 米）对不上，而那正好是 B85 的形状 —— 场墙上一扇门板都没有。
            const 这侧的门 = doorsOnSide(layout, room, s.dir);
            expect(这侧的门.length, `${room.id} 的 ${s.dir} 侧门数（普通房一格一边至多一扇）`).toBe(1);
            const 洞宽 = layout[这侧的门[0].holeWidthCarrier];
            const 沿长 = s.axis === 'x' ? room.d : room.w;
            const expectLong = (沿长 - 洞宽) / 2;
            const 屋心 = s.axis === 'x' ? room.z : room.x;
            const 门沿 = s.axis === 'x' ? 这侧的门[0].z : 这侧的门[0].x;
            const 角 = [屋心 - 沿长 / 2, 屋心 + 沿长 / 2];
            const 内沿 = [门沿 - 洞宽 / 2, 门沿 + 洞宽 / 2];
            // 落在这条边上、且沿边坐标在本房间跨度内的墙段。
            // 相邻房间共用同一条墙线，不按房间跨度收窄就会把隔壁那面墙也算进来 ——
            // 而切片5d 之后**这还不够**：场的墙线与格线重合，隔壁那间（可能就是场）的墙段
            // 也会落进这一格的跨度里（实测多出一段 13 米的，`uniq.length` 从 2 变 3）。
            // 所以"这两段是这一间自己的"要说得出口：一端在**自己的房角**，另一端在**自己的门洞边**。
            const segs = meshes.filter((m) => {
              if (m.geometry.type !== 'BoxGeometry') return false;
              const v = s.axis === 'x' ? m.position.x : m.position.z;
              if (!near(v, s.at, 1e-6)) return false;
              if (!near(m.position.y, layout.wallH / 2, 1e-6)) return false;
              const along = s.axis === 'x' ? m.position.z : m.position.x;
              const half = 沿长 / 2;
              return along >= 屋心 - half - 1e-6 && along <= 屋心 + half + 1e-6;
            });
            // **按落点去重**：一扇门是两个房间共用的，两个房间各建了一遍
            // 那两段、位置逐毫米重合（重复建墙这件事归 B76 的复用那一档，这里只论形状）。
            const 这一间的 = dedupeBySpot(segs).filter((m) => {
              const along = s.axis === 'x' ? m.position.z : m.position.x;
              const L = span(m.geometry).long;
              const 两端 = [along - L / 2, along + L / 2];
              return 两端.some((e) => 角.some((c) => near(e, c, 1e-6)))
                && 两端.some((e) => 内沿.some((i) => near(e, i, 1e-6)));
            });
            expect(这一间的.length, `${def.id}/${seed} ${room.id} 的 ${s.dim} 侧门洞墙段数`).toBe(2);
            for (const m of 这一间的) {
              const sp = span(m.geometry);
              expect(sp.thin, `厚度（${s.dim} 侧）`).toBeCloseTo(WT, 6);
              expect(sp.long, `长度（${s.dim} 侧）`).toBeCloseTo(expectLong, 6);
            }
          }
        }
      }
    });

    it('Boss 场的墙：自己的门开着，且让开迷宫里已有的门洞（B79 修好之后的形状）', () => {
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42]) {
          const { layout, meshes } = build(def, seed);
          const arena = layout.rooms.find((r) => r.isBossArena);
          if (!arena) continue;
          const WT = layout.wallT;

          for (const s of [
            { open: !arena.walls.w, dim: 'w', axis: 'x', at: arena.x - arena.w / 2, len: arena.d },
            { open: !arena.walls.e, dim: 'e', axis: 'x', at: arena.x + arena.w / 2, len: arena.d },
            { open: !arena.walls.n, dim: 'n', axis: 'z', at: arena.z - arena.d / 2, len: arena.w },
            { open: !arena.walls.s, dim: 's', axis: 'z', at: arena.z + arena.d / 2, len: arena.w },
          ]) {
            if (!s.open) continue;
            // 这一面墙的"固定坐标"（axis='x' 的 w/e 墙定在 x 上）与"沿墙中心"
            const 墙心 = s.axis === 'x' ? arena.z : arena.x;
            const 半 = s.len / 2;
            const segs = meshes.filter((m) => {
              if (m.geometry.type !== 'BoxGeometry') return false;
              const v = s.axis === 'x' ? m.position.x : m.position.z;
              if (!near(v, s.at, 1e-6)) return false;
              if (!near(m.position.y, layout.wallH / 2, 1e-6)) return false;
              const along = s.axis === 'x' ? m.position.z : m.position.x;
              return along >= 墙心 - 半 - 1e-6 && along <= 墙心 + 半 + 1e-6;
            });
            const uniq = dedupeBySpot(segs);
            // 切片4i 起这一段墙不再恒为两段：B79 的修法是"让开迷宫里已有的门洞"，
            // 于是这一面墙上可能还有第二、第三个洞（别人的门穿过它）。钉的是三条不变量：
            // ① 至少有一段（整面墙都不建也能让"门洞是空的"成立，那是假绿）；
            // ② 每段的厚度是 wallT、长度为正；
            // ③ **它自己的门位没有被任何一段盖住**（门洞真的开着）。
            expect(uniq.length, `${def.id}/${seed} ${arena.id} 的 ${s.dim} 侧一段墙都没有`).toBeGreaterThan(0);
            for (const m of uniq) {
              const sp = span(m.geometry);
              expect(sp.thin, `厚度（${s.dim} 侧）`).toBeCloseTo(WT, 6);
              expect(sp.long, `长度（${s.dim} 侧）`).toBeGreaterThan(0);
            }
            // 切片5d 起这一面墙可以有**两**扇门（场占两格，它的一面"北墙"是两条格子边）。
            // 改前 `layout.doors.find(...)` 只回第一扇，于是第二扇门的位置从没被量过 ——
            // 而那正是 B85 躲过门禁的方式：墙段与"那一个洞"对得上，跟第二扇门无关。
            const 这侧的门 = doorsOnSide(layout, arena, s.dim);
            expect(这侧的门.length, `${def.id}/${seed} ${arena.id} 的 ${s.dim} 侧门数`).toBeGreaterThanOrEqual(1);
            for (const door of 这侧的门) {
              const 门位 = s.axis === 'x' ? door.z : door.x;
              // 门必须在这一面墙的跨度内（不然它根本不在场自己的墙上 —— B85 的形状）
              expect(Math.abs(门位 - 墙心), `${def.id}/${seed} 门 ${door.id} 不在 ${s.dim} 侧墙线上`)
                .toBeLessThanOrEqual(半 + 1e-6);
              for (const m of uniq) {
                const along = s.axis === 'x' ? m.position.z : m.position.x;
                const half = span(m.geometry).long / 2;
                expect(Math.abs(along - 门位), `${def.id}/${seed} ${arena.id} 的 ${s.dim} 侧门位被墙段盖住`)
                  .toBeGreaterThanOrEqual(half - 1e-6);
              }
            }
            // 有洞才谈得上"开"。改前这一条量的是"这一面所有墙段的覆盖总长 < 面长"，
            // 而场的墙线现在**与格线重合** —— 同一列上邻居的东西墙也在这条线里，
            // 覆盖总长会把别人的墙一起加进来（实测 55.5 > 36，红得毫无信息量）。
            // 换成直接问每一扇门：从墙段量出来的洞宽 == 这扇门自己认的那一档。
            for (const door of 这侧的门) {
              const 洞宽 = 量门洞(layout, meshes, door);
              expect(洞宽, `${def.id}/${seed} 门 ${door.id} 在场墙的 ${s.dim} 侧量不到洞`).not.toBeNull();
              expect(洞宽, `${def.id}/${seed} 门 ${door.id} 的洞宽与它认的那一档不符`)
                .toBeCloseTo(layout[door.holeWidthCarrier], 6);
            }
          }
        }
      }
    });
  });

  describe('③ 门洞真的通（玩法层）', () => {
    it('门洞走得出人（按玩家半径判，不是判门中心那一个点）', () => {
      // 判据用「玩家半径」而不是门中心一个点：一个点太容易被边界擦过去 ——
      // 墙段算错时两段可以在门中心**恰好相接**，点判据擦着等号过去而玩家照样走不过去。
      //
      // 切片4i 起这里**不再排除任何门**：改前那一段 `if (arena && …) continue;` 是为了绕开
      // B79（Boss 场的墙压住邻居的门）。B79 修好之后（0/537），那条豁免留着只会掩盖回归 ——
      // 现在**每一扇门**都要过这一关。
      const R = 1.2;
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42, 12345]) {
          const { layout } = build(def, seed);
          for (const door of layout.doors) {
            const hits = (layout.colliders ?? []).filter(
              (c) => Math.abs(c.x - door.x) < c.hw + R && Math.abs(c.z - door.z) < c.hd + R
            );
            expect(hits.length, `${def.id}/${seed} 门 ${door.id} 的洞口过不去人`).toBe(0);
          }
        }
      }
    });

    it('Boss 场的墙让开迷宫里已有的门洞（B79 已修：被压的门 83 → 0）', () => {
      // 因是"场写死 34 米却只占一个格位"—— 四条边各伸进邻屋 8 米，把那些房间朝向它的门
      // **整扇压住**。改前实测 83/537 = 15.5% 的门走不过去，逐扇归因 75 扇被整墙压、
      // 8 扇被入口两侧那两段压（`.tmp-20261009/b79-census.mjs`）。
      //
      // 两步修的：切片4i 在几何层"让开迷宫里已有的门洞"（症状侧，83 → 0），
      // 切片5d 让场真占 2×2 格位（因，B102 那一米不剩，见下一条用例）。
      // 这条用例钉的是**玩家侧的说法**："走到某扇门跟前才发现过不去"= 0 扇，
      // 它比"布局对不对"更接近用户，所以两步之后都还得留着。
      const R = 1.2;
      let blocked = 0, doors = 0;
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42, 12345]) {
          const { layout } = build(def, seed);
          for (const door of layout.doors) {
            doors++;
            const hit = (layout.colliders ?? []).some(
              (c) => Math.abs(c.x - door.x) < c.hw + R && Math.abs(c.z - door.z) < c.hd + R
            );
            if (hit) blocked++;
          }
        }
      }
      expect(doors).toBeGreaterThan(400); // 分母下限：门少了这条会绿成空转
      expect(blocked, 'B79 又回来了 —— Boss 场的墙没让开门洞').toBe(0);
    });

    it('B102 归零：场的墙线就是格线，场的墙一米都不伸在邻居屋里（W-B10 切片5d）', () => {
      // B79 修的是症状（门走不过去），B102 是它的因：改前场写死 34 米却只占**一个格位**（18 米），
      // 四条边各伸进邻屋 8 米，玩家看得见一截墙横在房间中段（实测 21 场合计 1803 米）。
      // 切片5d 让场真占 2×2 格位，`BOSS_CELL` 由 `BOSS_SPAN × CELL` 派生 ⇒ 场的墙线**逐毫米就是格线**。
      //
      // 一把尺：只量**属于这场的那四面墙**（段心沿墙轴落在场的跨度内），与别人屋子的沿轴区间求交。
      // 为什么必须收窄到"属于这场"：墙线现在与格线重合，隔壁两间房共用的那面墙**也在这条线上**，
      // 不按场的跨度收窄就会把别人的墙算成场伸出去的墙（改前那 1803 米里就混着这类，
      // 而那一批读数用的轴口径还是反的 —— 见下面 `线.axis === 'x'` 那句注释）。
      const 重叠长 = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
      const 伸进邻居米 = (layout, meshes, arena) => {
        const 面 = [
          // axis = 这条墙线**固定**在哪一轴上（w/e 墙定在 x 上，沿 z 走）
          { axis: 'x', at: arena.x - arena.w / 2 }, { axis: 'x', at: arena.x + arena.w / 2 },
          { axis: 'z', at: arena.z - arena.d / 2 }, { axis: 'z', at: arena.z + arena.d / 2 },
        ];
        let 米 = 0;
        for (const m of dedupeBySpot(meshes)) {
          if (!m.userData.isWall || m.geometry.type !== 'BoxGeometry') continue;
          if (!near(m.position.y, layout.wallH / 2, 1e-6)) continue;
          const 线 = 面.find((l) => near(l.axis === 'x' ? m.position.x : m.position.z, l.at, 1e-6));
          if (!线) continue;
          const 沿X = 线.axis === 'x';
          // 沿墙那一轴的坐标与垂直那一轴的坐标（与上面 `线.axis` 的口径一致：定在 x 的线沿 z 走）
          const 沿 = 沿X ? m.position.z : m.position.x;
          const 垂直 = 沿X ? m.position.x : m.position.z;
          const 场沿心 = 沿X ? arena.z : arena.x;
          const 场沿半 = (沿X ? arena.d : arena.w) / 2;
          // 只认这场自己的墙段
          if (Math.abs(沿 - 场沿心) > 场沿半 + 1e-6) continue;
          const 长 = span(m.geometry).long;
          for (const r of layout.rooms) {
            if (r.id === arena.id) continue;
            const 屋心 = 沿X ? r.x : r.z;
            const 屋半 = (沿X ? r.w : r.d) / 2;
            if (Math.abs(垂直 - 屋心) >= 屋半 - 1e-6) continue;
            const 沿心 = 沿X ? r.z : r.x;
            const 沿半 = (沿X ? r.d : r.w) / 2;
            米 += 重叠长(沿 - 长 / 2, 沿 + 长 / 2, 沿心 - 沿半, 沿心 + 沿半);
          }
        }
        return 米;
      };
      const 每场 = [];
      let 总米 = 0;
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42, 12345]) {
          const { layout, meshes } = build(def, seed);
          const arena = layout.rooms.find((r) => r.isBossArena);
          if (!arena) continue;
          // 结构性的那一条：场的四条墙线都落在**格线**上。格子 g 的两条边在
          // `(g − 格数/2)·格长 ± 格长/2`，所以判据是"减掉半格之后是格长的整数倍"。
          // 这一句是"布局层面再也写不出比自己的占位更宽的场"的读数口径。
          const 格线 = (v, 格数) => {
            const 偏 = v - layout.cellSize / 2 + (格数 / 2) * layout.cellSize;
            return Math.abs(偏 % layout.cellSize) < 1e-9;
          };
          for (const [v, 格数] of [
            [arena.x - arena.w / 2, layout.gridW], [arena.x + arena.w / 2, layout.gridW],
            [arena.z - arena.d / 2, layout.gridH], [arena.z + arena.d / 2, layout.gridH],
          ]) {
            expect(格线(v, 格数), `${def.id}/${seed}：场的墙线 ${v.toFixed(2)} 不在格线上`).toBe(true);
          }
          const 米 = 伸进邻居米(layout, meshes, arena);
          每场.push(米);
          总米 += 米;
        }
      }
      expect(总米, 'B102：场的墙伸进邻居屋的总米数 —— 大于 0 说明场又比自己的占位宽了').toBe(0);
      expect(每场.length, '分母：量到几场').toBeGreaterThan(0);

      // 这条断言今天期望的是**零**，所以它自己得先被证明"数得到"：把场改回旧的形状
      // （占一格、边长 34 米），同一把尺必须量出 > 0。没有这一臂，"归零"就只是"尺坏了"的别名。
      const def = DUNGEON_DEFS[0];
      const 旧 = ProceduralDungeonGenerator.generate(def, 1);
      const 旧场 = 旧.rooms.find((r) => r.isBossArena);
      旧场.cells = undefined; // 退回一格占位
      旧场.w = 旧场.d = 34;
      旧场.x = cellCenter(旧场.gx, 旧.gridW, 旧.cellSize);
      旧场.z = cellCenter(旧场.gz, 旧.gridH, 旧.cellSize);
      const 旧组 = new THREE.Group();
      ProceduralDungeonGenerator.buildGeometry(旧组, 旧, def);
      const 旧米 = 伸进邻居米(旧, meshesOf(旧组), 旧场);
      expect(旧米, 'arming 失败：把场改回"34 米占一格"这把尺还数得到米吗？数不到就说明上面那个 0 是空转')
        .toBeGreaterThan(50);
    });

    it('门洞两侧确实有墙（不是因为整面墙都没建才"通"）', () => {
      const def = DUNGEON_DEFS[0];
      const { layout } = build(def, 42);
      // 沿每扇门所在的那条边，在门中心左右各 (doorW/2 + 1) 米处应当撞得到墙
      let checked = 0;
      for (const door of layout.doors) {
        const isEW = door.dir === 'e' || door.dir === 'w';
        const off = layout.doorWidth / 2 + 1.5;
        for (const sign of [-1, 1]) {
          const px = isEW ? door.x : door.x + sign * off;
          const pz = isEW ? door.z + sign * off : door.z;
          const hit = (layout.colliders ?? []).some(
            (c) => Math.abs(c.x - px) < c.hw && Math.abs(c.z - pz) < c.hd
          );
          expect(hit, `${def.id} 门 ${door.id} 的 ${sign > 0 ? '正' : '负'} 侧没有墙`).toBe(true);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(10);
    });
  });

  describe('④ 墙段位置', () => {
    it('每一扇门洞的**两条内沿**恰好落在这扇门自己说的洞宽上', () => {
      // 改前这一档钉的是"两段分列门中心，中点距门心 == (seg + gap)/2"，而 seg 与 gap 都从
      // `layout.cellSize / doorWidth` 抄来 —— 那对普通房成立，对占两格的场不成立（它的墙段
      // 长由**这一面有几个洞**决定，不是半格）。现在钉的是与跨度无关的那件事：
      // 洞的左内沿 == 门心 − 洞宽/2，右内沿 == 门心 + 洞宽/2，且洞宽由**这扇门**自己认档。
      // 两侧都量：只量一侧的话，另一侧的段算错（比如两个洞并成一个）这条永远绿。
      const def = DUNGEON_DEFS[0];
      const { layout, meshes } = build(def, 42);
      let 量到 = 0;
      for (const door of layout.doors) {
        const gap = layout[door.holeWidthCarrier];
        const isEW = door.dir === 'e' || door.dir === 'w';
        const coord = isEW ? 'z' : 'x';
        const segs = meshes.filter((m) => {
          if (m.geometry.type !== 'BoxGeometry') return false;
          const along = isEW ? m.position.x : m.position.z;
          if (!near(along, isEW ? door.x : door.z, 1e-6)) return false;
          return near(m.position.y, layout.wallH / 2, 1e-6);
        });
        expect(segs.length, `${def.id} 门 ${door.id} 所在墙线上一个墙段都没有`).toBeGreaterThan(0);
        const 左内沿 = segs
          .filter((m) => m.position[coord] + span(m.geometry).long / 2 <= door[coord] + 1e-6)
          .map((m) => m.position[coord] + span(m.geometry).long / 2);
        const 右内沿 = segs
          .filter((m) => m.position[coord] - span(m.geometry).long / 2 >= door[coord] - 1e-6)
          .map((m) => m.position[coord] - span(m.geometry).long / 2);
        expect(左内沿.length, `${def.id} 门 ${door.id} 左侧没有墙收尾`).toBeGreaterThan(0);
        expect(右内沿.length, `${def.id} 门 ${door.id} 右侧没有墙收尾`).toBeGreaterThan(0);
        expect(Math.max(...左内沿), `${def.id} 门 ${door.id} 的洞左内沿不对`).toBeCloseTo(door[coord] - gap / 2, 6);
        expect(Math.min(...右内沿), `${def.id} 门 ${door.id} 的洞右内沿不对`).toBeCloseTo(door[coord] + gap / 2, 6);
        量到++;
      }
      expect(量到, '这一档量到的门太少，成了空转').toBeGreaterThan(10);
    });
  });

  describe('⑤ 门板与门框对得上自己那个洞', () => {
    it('门板尺寸逐座逐门一致，且关上的板把量出来的洞盖到只剩一条门框收边之内的缝', () => {
      // 这一档在切片4f 之前长的是另一个样子：`[3.5, 4.2, 0.5]` / `[4.2, 4.8, 0.15]` 两个手抄的
      // 三元组。逐门一致这条把"每扇门的板都比自己的洞窄 0.25 米"钉成了绿灯 —— 它钉的是**一致性**，
      // 而一致性恰好是这个缺陷的形状（一处抄错，处处跟着错）。所以现在问的是**与洞的关系**：
      // 洞宽从墙段量（不是猜常量），门板沿墙必须把洞盖到每侧只剩一条缝，且那条缝不超过门框的收边。
      const 每侧见光上限 = 0.06; // 一扇关着的门不许漏出可见的光缝；改前实测 0.25 米
      for (const def of DUNGEON_DEFS) {
        for (const seed of [42, 7]) {
          const { layout, meshes } = build(def, seed);
          const panels = meshes.filter((m) => m.name.startsWith('door_'));
          const frames = meshes.filter((m) => m.userData.isFrame);
          expect(panels.length).toBe(layout.doors.length);
          expect(frames.length).toBe(layout.doors.length);

          // 门板的尺寸种数 == **这一份布局里洞宽的档数**（切片5d 起是两档：朝场的门认 `bossDoorWidth`）。
          // 改前这一条钉的是 `toHaveLength(1)`，而"每扇门的板都一样宽"恰好是抄本缺陷的形状：
          // 门自己说不出宽度，几何层就一律按普通档做，朝场那五米的洞永远配四米的板 —— 一致性绿着，
          // 洞与板差一米。所以这里不许写死 1 或 2，要跟着门名单走。
          const 档 = [...new Set(layout.doors.map((d) => d.holeWidthCarrier))].sort();
          expect(档.length, `${def.id}/${seed} 门名单里的洞宽档数（少于 2 说明 carrier 没写对）`)
            .toBeGreaterThanOrEqual(1);
          const 板尺寸 = new Set(panels.map((p) => {
            const q = p.geometry.parameters;
            return [q.width, q.height, q.depth].join(',');
          }));
          expect([...板尺寸], `${def.id}/${seed} 门板尺寸种数没跟着洞宽档数走`)
            .toHaveLength(档.length);
          for (const door of layout.doors) {
            const 板 = panels.find((m) => m.name === `door_${door.id}`);
            expect(板.geometry.parameters.width, `${door.id} 的板宽不是"自己那个洞减两侧让缝"`)
              .toBeCloseTo(layout[door.holeWidthCarrier] - 2 * DOOR_JAMB, 6);
          }

          let 量到 = 0;
          for (const door of layout.doors) {
            const 洞 = 量门洞(layout, meshes, door);
            expect(洞, `${def.id}/${seed} 门 ${door.id}（${door.dir}）量不到洞`).not.toBeNull();
            量到++;
            const 板 = panels.find((m) => m.name === `door_${door.id}`);
            const 框 = frames.find((m) => near(m.position.x, door.x, 1e-6)
              && near(m.position.z, door.z, 1e-6));
            // 门板沿墙那一轴 = 局部 width（e/w 的板旋转 90°，旋转后局部 x 正落在墙线方向上）
            const 每侧见光 = (洞 - 板.geometry.parameters.width) / 2;
            expect(每侧见光, `${def.id}/${seed} 门 ${door.id} 门板跟墙段端面共面`).toBeGreaterThan(0);
            expect(每侧见光, `${def.id}/${seed} 门 ${door.id} 关着的门漏光 ${每侧见光.toFixed(3)} 米`)
              .toBeLessThanOrEqual(每侧见光上限);
            // 门框沿墙比洞多出来的那一圈必须至少把板让的缝盖住，否则光缝还在，只是换了个来源
            const 每侧收边 = (框.geometry.parameters.width - 洞) / 2;
            expect(每侧收边, `${def.id}/${seed} 门 ${door.id} 门框没盖到洞口边缘`).toBeGreaterThan(0);
            expect(每侧收边, `${def.id}/${seed} 门 ${door.id} 门框收边盖不住门板让出的缝`)
              .toBeGreaterThanOrEqual(每侧见光);
          }
          expect(量到, `${def.id}/${seed} 量到的门太少，这一档成了空转`).toBeGreaterThan(8);
        }
      }
    });

    it('两档洞宽**真的各有门认**（每一座都有朝场的门，其余档也不为空）', () => {
      // 上面那条把"门板种数 == 门名单里的档数"跟着名单走，所以它自己不会红于"名单只剩一档"。
      // 这一条补的就是那一档：全七座的门名单里，`doorWidth` 与 `bossDoorWidth` **都得有门**，
      // 而且每一座都至少有**一扇**朝 Boss 场的门（一扇都没有 = 场被孤岛化了，那是另一族的错）。
      const 计 = new Map(Object.values(HOLE_WIDTH_CARRIERS).map((k) => [k, 0]));
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42, 12345]) {
          const { layout } = build(def, seed);
          const arena = layout.rooms.find((r) => r.isBossArena);
          let 进场门 = 0;
          for (const door of layout.doors) {
            计.set(door.holeWidthCarrier, (计.get(door.holeWidthCarrier) ?? 0) + 1);
            if (door.fromRoomId === arena.id || door.toRoomId === arena.id) 进场门++;
          }
          expect(进场门, `${def.id}/${seed}：没有一扇门通向 Boss 场`).toBeGreaterThan(0);
        }
      }
      expect(计.size, '洞宽的档数与 `HOLE_WIDTH_CARRIERS` 的名册不符').toBe(2);
      for (const [档, 数] of 计) {
        expect(数, `${档} 这一档一扇门都没有 —— carrier 的写法与名册脱节了`).toBeGreaterThan(0);
      }
    });
  });

  describe('⑥ 布局签名', () => {
    it('房间与门的布局签名三颗不变（切片5d 换过一次钉值，理由见下面那段）', () => {
      // 这一档原本是切片4c 立的"动的是几何，不是迷宫"——三颗种子各签一份 rooms×doors 的名字与朝向。
      // **切片5d 动的就是迷宫**：Boss 场真占 2×2 格位，一座 6×6 从此是 33 间房 / 32~33 扇门
      // （合并掉的三间连着它们的怪、文献、模板一起没了），所以三颗签名一起换过。
      // 同一片里还有一次**重排**：`合并成场` 把场排回它**锚格**那一席（改前它留在"最远那一格"的原位，
      // id 说 `r_0_4` 却坐在 (5,4) 那格上 —— B86 那套"一个位置两套口径"），门名单跟着数组序走，
      // 于是 seed=42 那颗又换了一次数，另外两颗本来就站在锚席上、一字未动。
      // 换钉值的口径与切片4a/4b 同一份：**同一颗种子必须永远得到同一座迷宫**，
      // 而门名单的**数组序**是这条承诺的一部分（`findFarthestRoom` 的 BFS 吃它，BFS 定出 Boss 场，
      // Boss 场定出后面每一发随机数摇到什么）。签名里只放 id / 格号 / 朝向，不放坐标 ——
      // 坐标那一档由 ②③④⑤ 逐毫米量，把两套口径混进一个哈希就再也说不出"是位置漂了还是名字漂了"。
      // 读数两条路各算一遍且逐颗相等（`.tmp 仓外脚本 D:/tmp-wb10s5d/sig.mjs`：一条走用例同款的
      // `ProceduralDungeonGenerator.generate`，一条直接 `generateMaze`，`ruin-crypt`）：
      // seed 1 → 2b1e37c7（33 房 / 32 门）、42 → 73e7b4c3（33/33）、12345 → 6faf100b（33/33）。
      const GOLDEN = {
        1: '2b1e37c7',
        42: '73e7b4c3',
        12345: '6faf100b',
      };
      // 签名只取布局，不取几何
      const sigOf = (def, seed) => {
        const { layout } = build(def, seed);
        const s = JSON.stringify({
          rooms: layout.rooms.map((r) => [r.id, r.gx, r.gz, r.walls]),
          doors: layout.doors.map((d) => [d.id, d.dir]),
        });
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return h.toString(16);
      };
      const def = DUNGEON_DEFS[0];
      for (const seed of Object.keys(GOLDEN)) {
        const got = sigOf(def, Number(seed));
        expect(got, `seed ${seed} 的布局签名`).toBe(GOLDEN[seed]);
      }
    });
  });
});
