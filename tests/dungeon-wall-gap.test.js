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
    it('普通房的门洞墙段恒为 (wallT, (cellSize − doorW)/2)，东西向与南北向同形', () => {
      const def = DUNGEON_DEFS.find((d) => d.gridW >= 5 && d.gridH >= 5);
      for (const seed of [1, 42, 12345]) {
        const { layout, meshes } = build(def, seed);
        const WT = layout.wallT;
        const expectLong = (layout.cellSize - layout.doorWidth) / 2;

        for (const room of layout.rooms) {
          if (room.isBossArena) continue;
          const sides = [
            { open: !room.walls.n, axis: 'z', at: room.z - room.d / 2, dim: 'd' },
            { open: !room.walls.s, axis: 'z', at: room.z + room.d / 2, dim: 'd' },
            { open: !room.walls.w, axis: 'x', at: room.x - room.w / 2, dim: 'w' },
            { open: !room.walls.e, axis: 'x', at: room.x + room.w / 2, dim: 'w' },
          ];
          for (const s of sides) {
            if (!s.open) continue;
            // 落在这条边上、且沿边坐标在本房间跨度内的墙段（门洞两侧各一段）。
            // 相邻房间共用同一条墙线，不按房间跨度收窄就会把隔壁那面墙也算进来。
            const segs = meshes.filter((m) => {
              if (m.geometry.type !== 'BoxGeometry') return false;
              const v = s.axis === 'x' ? m.position.x : m.position.z;
              if (!near(v, s.at, 1e-6)) return false;
              if (!near(m.position.y, layout.wallH / 2, 1e-6)) return false;
              const along = s.axis === 'x' ? m.position.z : m.position.x;
              const center = s.axis === 'x' ? room.z : room.x;
              const half = (s.axis === 'x' ? room.d : room.w) / 2;
              return along >= center - half - 1e-6 && along <= center + half + 1e-6;
            });
            // 门洞两侧各一段。**按落点去重**：一扇门是两个房间共用的，两个房间各建了一遍
            // 那两段、位置逐毫米重合（重复建墙这件事归 B76 的复用那一档，这里只论形状）。
            const uniq = dedupeBySpot(segs);
            expect(uniq.length, `${def.id}/${seed} ${room.id} 的 ${s.dim} 侧门洞墙段数`).toBe(2);
            for (const m of uniq) {
              const sp = span(m.geometry);
              expect(sp.thin, `厚度（${s.dim} 侧）`).toBeCloseTo(WT, 6);
              expect(sp.long, `长度（${s.dim} 侧）`).toBeCloseTo(expectLong, 6);
            }
          }
        }
      }
    });

    it('Boss 场的门洞墙段按它自己的边长与自己的门洞宽算', () => {
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42]) {
          const { layout, meshes } = build(def, seed);
          const arena = layout.rooms.find((r) => r.isBossArena);
          if (!arena) continue;
          const WT = layout.wallT;
          const 洞宽 = layout.bossDoorWidth;

          for (const s of [
            { open: !arena.walls.w, axis: 'x', at: arena.x - arena.w / 2, len: arena.d },
            { open: !arena.walls.e, axis: 'x', at: arena.x + arena.w / 2, len: arena.d },
            { open: !arena.walls.n, axis: 'z', at: arena.z - arena.d / 2, len: arena.w },
            { open: !arena.walls.s, axis: 'z', at: arena.z + arena.d / 2, len: arena.w },
          ]) {
            if (!s.open) continue;
            const segs = meshes.filter((m) => {
              if (m.geometry.type !== 'BoxGeometry') return false;
              const v = s.axis === 'x' ? m.position.x : m.position.z;
              if (!near(v, s.at, 1e-6)) return false;
              if (!near(m.position.y, layout.wallH / 2, 1e-6)) return false;
              const along = s.axis === 'x' ? m.position.z : m.position.x;
              const center = s.axis === 'x' ? arena.z : arena.x;
              const half = (s.axis === 'x' ? arena.d : arena.w) / 2;
              return along >= center - half - 1e-6 && along <= center + half + 1e-6;
            });
            const uniq = dedupeBySpot(segs);
            expect(uniq.length).toBe(2);
            for (const m of uniq) {
              const sp = span(m.geometry);
              expect(sp.thin).toBeCloseTo(WT, 6);
              // Boss 场沿这条边的全长是 s.len，门洞是布局带的那个宽度，两侧各 (len − 洞)/2
              expect(sp.long).toBeCloseTo((s.len - 洞宽) / 2, 6);
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
      // 排除被 Boss 场长墙压住的门 —— 那是另一条缺陷（B79，见下一条用例），
      // 与本片的门洞几何无关。排除是**显式的**：判据只问"这扇门自己的墙把洞留对了吗"。
      const R = 1.2;
      for (const def of DUNGEON_DEFS) {
        for (const seed of [1, 42, 12345]) {
          const { layout } = build(def, seed);
          for (const door of layout.doors) {
            // 排除落在 Boss 场几何覆盖里的门 —— 那是 B79。用**空间判据**（这扇门是不是
            // 在 Boss 场 34×34 的范围内）而不是按 collider 尺寸猜：普通整墙半长 9、
            // Boss 场边半长 17，按尺寸分档会把普通墙也算成 Boss 场的。
            const arena = layout.rooms.find((r) => r.isBossArena);
            if (arena && Math.abs(door.x - arena.x) < arena.w / 2 + 2
              && Math.abs(door.z - arena.z) < arena.d / 2 + 2) continue;
            const hits = (layout.colliders ?? []).filter(
              (c) => Math.abs(c.x - door.x) < c.hw + R && Math.abs(c.z - door.z) < c.hd + R
            );
            expect(hits.length, `${def.id}/${seed} 门 ${door.id} 的洞口过不去人`).toBe(0);
          }
        }
      }
    });

    it('已知缺陷 B79 的规模被钉住：Boss 场的长墙越界压住了多少扇门', () => {
      // Boss 场是 34×34（跨两格），但在迷宫里只占一个格位 —— 它的四条边会伸进相邻
      // 普通房间，把那些房间朝向它的门**整扇压住**（改前实测 83/537 = 15.5% 的门走不过去）。
      //
      // 这条用例**不是**在断言"这是对的"，而是把症状钉成一个数：
      // B79 修好之后这个数应当归零，那时把这里的期望改成 0。在此之前它是一条不许漂的读数。
      const R = 1.2;
      const KNOWN_B79_BLOCKED = 83;
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
      expect(doors).toBeGreaterThan(400);
      expect(blocked, 'B79 的规模 —— 修好后这里应改为 0').toBe(KNOWN_B79_BLOCKED);
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
    it('两段分列门中心两侧，中点距门中心 == (seg + gap)/2', () => {
      const def = DUNGEON_DEFS[0];
      const { layout, meshes } = build(def, 42);
      const gap = layout.doorWidth;

      for (const door of layout.doors) {
        const isEW = door.dir === 'e' || door.dir === 'w';
        const coord = isEW ? 'z' : 'x';
        // 只取这扇门**两侧**的墙段：贴着门所在那条墙线，且沿边方向落在门洞之外、
        // 又不超出这一格（gap/2 ≤ 偏移 ≤ gap/2 + seg）。放宽到整条边会把相邻房间的墙也算进来。
        const outer = gap / 2 + (layout.cellSize - gap) / 2;
        const segs = meshes.filter((m) => {
          if (m.geometry.type !== 'BoxGeometry') return false;
          const along = isEW ? m.position.x : m.position.z;
          const edge = isEW ? m.position.z : m.position.x;
          if (!near(along, isEW ? door.x : door.z, 1e-6)) return false;
          const off = Math.abs(edge - door[coord]);
          return off >= gap / 2 - 1e-6 && off <= outer + 1e-6;
        });
        // 段数不对就是几何层的错，不许 `continue` 静默跳过 —— 那样"墙段数变了"永远绿
        expect(segs.length, `${def.id} 门 ${door.id} 侧墙段数`).toBeGreaterThan(0);
        const uniqSegs = dedupeBySpot(segs);
        expect(uniqSegs.length, `${def.id} 门 ${door.id} 去重后的侧墙段数`).toBe(2);

        const seg = (layout.cellSize - gap) / 2;
        const expectOffset = (seg + gap) / 2;
        for (const m of uniqSegs) {
          const d = Math.abs(m.position[coord] - door[coord]);
          expect(d, `门 ${door.id} 侧墙段偏移`).toBeCloseTo(expectOffset, 6);
        }
        // 两段在门的两侧，不是同一侧
        const signs = uniqSegs.map((m) => Math.sign(m.position[coord] - door[coord]));
        expect(signs[0] * signs[1]).toBe(-1);
      }
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

          const 板尺寸 = new Set(panels.map((p) => {
            const q = p.geometry.parameters;
            return [q.width, q.height, q.depth].join(',');
          }));
          expect([...板尺寸], `${def.id}/${seed} 门板不止一种尺寸`).toHaveLength(1);

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
  });

  describe('⑥ 布局不受影响', () => {
    it('房间与门的布局签名三颗不变（本片动的是几何，不是迷宫）', () => {
      const GOLDEN = {
        1: '68db0ef0',
        42: 'b9cfca00',
        12345: 'aaab4080',
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
