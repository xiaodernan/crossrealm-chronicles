/**
 * 地下城尺寸事实的抄本收口（W-B10 切片4f，登记 B84/B85/B86）
 *
 * ## 修的是什么
 * 「一格 18 米」这一句话在役源码里有 **9 处**写法，「一扇门 4 米」有 **4 处**，门板 / 门框 /
 * 门离地高度 / 门碰撞半轴 / 出生散布内缩各抄了一份"看起来像常量"的字面量 —— 普查合计 **27 处**
 * （`.tmp-20261004/wb10s4f-census.mjs`，日志 `.log` ①）。抄本的症状不是今天算错（它们今天恰好
 * 同值），而是**改一个数要改九处，漏一处的症状是静默脱节**。这一片量到两条真实的脱节：
 *
 * - **编辑器的格长不跟布局走**（普查 ④）：喂它一份 `cellSize: 25` 的导入布局，放置房间仍按 18
 *   落位、拖动后按 `/18` 反推格号。本文件的 ⑤ 层拿 `cellSize=25` 与 `cellSize=18` 两侧各放一间，
 *   证明落位与格号真的跟着**这一份布局**的数走。
 * - **门板盖不住自己的门洞**（普查 ③）：`537` 扇门逐扇量出来的洞都是 4 米，而门板沿墙只有 3.5 米
 *   ⇒ 每侧见光 0.25 米。门板宽本来是"洞宽减两侧让缝"的派生量，抄成常量之后就漂了。
 *   `tests/dungeon-wall-gap.test.js` 的 ⑤ 层以前写的是 `[3.5, 4.2, 0.5]` 这种手抄三元组 ——
 *   它断言的是**逐门一致**，而"一致地盖不住洞"恰好能通过它。
 *
 * ## 两条口径（门禁的形状就是代码的形状）
 * - **声明在 `src/world/dungeonDimensions.js`，运行时载体在 `layout` 上**（② 层）：几何层与编辑器
 *   读**布局**而不是读常数，所以一份导入的布局才真的按自己的尺寸走。
 * - **派生量就地算**（④ 层）：门板沿墙 = 洞宽 − 每侧让缝，门框沿墙 = 洞宽 + 收边，门碰撞跨洞半轴 =
 *   洞宽 / 2。这一层不信常量，它把 `layout.doorWidth` 改成 6 与 2.5，然后**从墙段量出洞**再看
 *   门板、门框、碰撞有没有跟着走。
 *
 * ## 用例分七层
 * ① 声明层：名册那 14 枚各声明**恰好一次**，`src/world/` 里不许有第二份声明。
 * ② 载体层：21 场布局都带那六枚数字且等于声明；558 间房的尺寸落在 `cellSize`/`bossCell` 上；
 *    房间坐标按生产者的口径 `(gx − gridW/2) * cellSize` 成立。
 * ③ 拒收层：`buildGeometry` 缺哪一枚就当场点名哪一枚（逐字段四臂 + 缺两枚点名两枚 + 齐货不抛）。
 * ④ 派生层：门板/门框/门碰撞随 `layout.doorWidth` 一起走，且每扇关着的门盖得住量出来的洞。
 * ⑤ 编辑器层：吸附与反推格号吃 `layout.cellSize`，同一实例改数就改行为；真指针路径（投影回解）
 *    也走同一条 —— 只有那条路能量到 `_drag` 里的 B87。
 * ⑥ 绝迹层：18 处历史抄本在役源码里 0 命中，**同一把尺**在誊来的旧字节上数得到（armed）；
 *    幻影 API（`RoomTemplates` 转手的 `CELL`、端口的 `width` 键）都不在。
 * ⑦ 读数层：新量到的两条编辑器侧缺陷各钉一个数 —— B86（编辑器与迷宫的格坐标口径不同）
 *    的规模、B88（拖一次之后可视化与数据分家）。修好后这两处期望都改成 0 / 同位。
 *
 * 顺带修掉的一条：拖动路径 `_drag` 用 `Vector3.sub(Vector2)` 减抓点偏移，减完 `intersect.z`
 * 成 NaN，房间号直接变 `r_2_NaN`（**B87**）。这一片的 ⑤ 层要走真指针路径，非修不可；
 * 两条新用例（放置 + 拖动）就是它的读数。
 *
 * 反向证据由变异臂脚本 `.tmp-20261004/wb10s4f-arms.mjs` 承担：把门板宽改回 3.5、把编辑器的
 * `step` 改回 18、把守卫删掉，各点名哪几档会红。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import { ProceduralDungeonGenerator } from '../src/world/ProceduralDungeonGenerator.js';
import { generateMaze } from '../src/world/MazeLayout.js';
import { DUNGEON_DEFS } from '../src/content/dungeons.js';
import { dungeonEncounterOf } from '../src/content/dungeonEncounters.js';
import { ROOM_TEMPLATES } from '../src/world/RoomTemplates.js';
import * as RoomTemplatesModule from '../src/world/RoomTemplates.js';
import * as DIM from '../src/world/dungeonDimensions.js';
import { LevelEditor } from '../src/world/LevelEditor.js';
import {
  基准提交, 在役文件, 声明名册, 载体字段, 几何必需字段, 抄本表, 形状尺,
} from './helpers/wb10s4f-copies.js';

const SEEDS = [1, 42, 7];

/** 剥掉注释但保留行号（跟普查同一把帚，否则注释里复述的旧抄本会被当成命中） */
function 去注释(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (_all, head) => `${head}${' '.repeat(Math.max(0, _all.length - head.length))}`);
}

const 数 = (re, s) => (s.match(re) ?? []).length;

const SRC = join(process.cwd(), 'src');
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}
const 世界文件 = walk(join(SRC, 'world'));

/** 编辑器要 window/document：`_initUI` 建面板、`_createRoomVisual` 建房间标签 */
let 原console = null;
function 桩() {
  global.window = {
    document: {
      body: { appendChild: () => {}, removeChild: () => {} },
      createElement: () => ({
        style: {}, innerHTML: '', value: '', textContent: '', href: '', download: '',
        querySelector: () => ({ addEventListener: () => {}, value: '' }),
        querySelectorAll: () => [],
        addEventListener: () => {}, appendChild: () => {}, remove: () => {}, click: () => {},
      }),
      addEventListener: () => {}, removeEventListener: () => {},
    },
    addEventListener: () => {}, removeEventListener: () => {},
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
  };
  global.document = global.window.document;
  // 编辑器把 DOM 标签 `group.add(label)` 塞进 THREE.Group，three 会为那一句话 console.error
  // —— 那是 W-B11 切片1 的活（见 #115 与 ⑦ 层的 B86）。这里只吞那一句，别的一律放行。
  if (!原console) {
    原console = console.error;
    console.error = (...a) => {
      if (!String(a[0]).startsWith('THREE.Object3D.add')) 原console(...a);
    };
  }
}
function 拆桩() {
  if (原console) { console.error = 原console; 原console = null; }
  delete global.window;
  delete global.document;
}

/**
 * 带**真指针换算**的编辑器：俯视相机 + `getBoundingClientRect`，于是 `_placeRoom` / `_drag`
 * 可以自己把 client 坐标解回地平面 —— ⑤ 那两条走的就是这条路（私有方法直调量不到 `_drag` 里
 * 那一发 `Vector3.sub(Vector2)`，见 B87）。
 */
const 视口 = { left: 0, top: 0, width: 800, height: 600 };
function 编辑器带指针(scene) {
  const cam = new THREE.PerspectiveCamera(75, 视口.width / 视口.height, 0.1, 1000);
  cam.position.set(0, 100, 0);
  cam.up.set(0, 0, -1);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const ed = new LevelEditor(
    scene, cam,
    { dispose: () => {}, domElement: { addEventListener: () => {} } },
    { addEventListener: () => {}, getContext: () => ({}), getBoundingClientRect: () => 视口 },
  );
  const 客户端 = (wx, wz) => {
    const ndc = new THREE.Vector3(wx, 0, wz).project(cam);
    return {
      clientX: ((ndc.x + 1) / 2) * 视口.width,
      clientY: ((1 - ndc.y) / 2) * 视口.height,
    };
  };
  return { ed, cam, 客户端 };
}

function build(def, seed, 改布局) {
  const layout = ProceduralDungeonGenerator.generate(def, seed);
  if (改布局) 改布局(layout);
  const group = new THREE.Group();
  ProceduralDungeonGenerator.buildGeometry(group, layout, def);
  const meshes = [];
  group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { layout, group, meshes };
}

/**
 * 洞宽**从墙段量出来**：沿门所在的墙线，取厚度 == wallT、高度居中的盒段，
 * 洞 = 右侧最近段的内端 − 左侧最近段的外端。不按任何常量猜（`.tmp-20261004/wb10s4f-census.mjs` ③）。
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
  const 左 = 段.filter(([, b]) => b <= door[侧向] + 1e-6).map(([, b]) => b);
  const 右 = 段.filter(([a]) => a >= door[侧向] - 1e-6).map(([a]) => a);
  if (!左.length || !右.length) return null;
  return Math.min(...右) - Math.max(...左);
}

describe('地下城尺寸事实的抄本收口（切片4f）', () => {
  it('誊写基准是实存在册的（这几份文件都还在役）', () => {
    expect(基准提交).toMatch(/^[0-9a-f]{7,40}$/);
    expect(在役文件.length).toBeGreaterThanOrEqual(4);
    for (const rel of 在役文件) {
      expect(() => readFileSync(join(SRC, rel), 'utf8'), `扫不到 ${rel}`).not.toThrow();
    }
    expect(世界文件.length, '`src/world` 一个 js 都没有，绝迹层就是在读空集').toBeGreaterThan(20);
  });

  describe('① 声明层：每枚尺寸只声明一次', () => {
    it(`名册那 ${声明名册.length} 枚都在 ` + 'dungeonDimensions.js' + ' 里且各恰好一次', () => {
      const 源 = 去注释(readFileSync(join(SRC, 'world/dungeonDimensions.js'), 'utf8'));
      for (const 名 of 声明名册) {
        expect(数(new RegExp(`export const ${名} = [^;]+;`), 源), `${名} 声明了几次`).toBe(1);
        expect(typeof DIM[名], `${名} 得是个值`).toBe('number');
        expect(Number.isFinite(DIM[名]) && DIM[名] > 0, `${名} 得是个有限正数`).toBe(true);
      }
      // 名册不许漏：那份文件里所有 export 的数都必须有名有姓
      const 实际 = Object.keys(DIM).filter((k) => typeof DIM[k] === 'number').sort();
      expect(实际).toEqual([...声明名册].sort());
    });

    it('src/world 里没有第二份尺寸声明（同一把尺在旧字节上数得到）', () => {
      const 尺 = 形状尺[0];
      const 见 = [];
      for (const f of 世界文件) {
        const 命中 = 数(尺.尺, 去注释(readFileSync(f, 'utf8')));
        const rel = relative(SRC, f).replaceAll('\\', '/');
        if (命中 && rel !== 尺.只许出现在) 见.push(`${rel}: ${命中}`);
      }
      expect(见, '出现了第二处声明').toEqual([]);
      // arming：这把尺在誊来的旧字节上必须数得到 —— 数不到的尺子扫出 0 是分文不值的
      expect(数(尺.尺, 尺.旧文本.join('\n'))).toBe(尺.期望旧命中);
    });

    it('布局默认值与门洞宽都没有字面量兜底（0 与 undefined 都不许悄悄变成 18）', () => {
      for (const 尺 of 形状尺.slice(1)) {
        const 见 = 世界文件
          .map((f) => [relative(SRC, f).replaceAll('\\', '/'), 数(尺.尺, 去注释(readFileSync(f, 'utf8')))])
          .filter(([, n]) => n > 0);
        expect(见, 尺.标题).toEqual([]);
        expect(数(尺.尺, 尺.旧文本.join('\n'))).toBe(尺.期望旧命中);
      }
    });
  });

  describe('② 载体层：布局把尺寸带在身上', () => {
    it('七座 × 三颗种子的每张布局都带着那六枚，值等于声明', () => {
      let 场 = 0;
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          const layout = ProceduralDungeonGenerator.generate(def, seed);
          场++;
          for (const 名 of 载体字段) {
            expect(typeof layout[名], `${def.id}/${seed} 的 ${名}`).toBe('number');
            expect(Number.isFinite(layout[名]), `${def.id}/${seed} 的 ${名} 不是有限数`).toBe(true);
          }
          expect(layout.cellSize).toBe(DIM.CELL);
          expect(layout.bossCell).toBe(DIM.BOSS_CELL);
          expect(layout.wallH).toBe(DIM.WALL_H);
          expect(layout.wallT).toBe(DIM.WALL_T);
          expect(layout.doorWidth).toBe(DIM.DOOR_WIDTH);
          expect(layout.bossDoorWidth).toBe(DIM.BOSS_DOOR_WIDTH);
        }
      }
      expect(场).toBe(DUNGEON_DEFS.length * SEEDS.length);
    });

    it('每间房的边长就是它那一档（普通房 cellSize、Boss 场 bossCell），坐标按生产者的口径落格', () => {
      let 普通 = 0, 场 = 0;
      for (const def of DUNGEON_DEFS) {
        for (const seed of SEEDS) {
          const layout = generateMaze(def.gridW, def.gridH, seed, dungeonEncounterOf(def.id));
          for (const r of layout.rooms) {
            const 边 = r.isBossArena ? layout.bossCell : layout.cellSize;
            expect(r.w, `${def.id}/${seed} ${r.id} 的宽`).toBe(边);
            expect(r.d, `${def.id}/${seed} ${r.id} 的深`).toBe(边);
            // 生产者的口径是"网格居中"：x = (gx − gridW/2) * cellSize。
            // 编辑器用的是另一套（x = gx * cellSize）—— 那两条对不上就是 ⑦ 层要钉的 B86。
            expect(r.x, `${def.id}/${seed} ${r.id} 的 x`).toBeCloseTo((r.gx - def.gridW / 2) * layout.cellSize, 6);
            expect(r.z, `${def.id}/${seed} ${r.id} 的 z`).toBeCloseTo((r.gz - def.gridH / 2) * layout.cellSize, 6);
            if (r.isBossArena) 场++; else 普通++;
          }
        }
      }
      expect(普通, '普通房一间都没有').toBeGreaterThan(300);
      expect(场).toBe(DUNGEON_DEFS.length * SEEDS.length);
    });
  });

  describe('③ 拒收层：缺尺寸的布局当场点名', () => {
    it('几何层消费的每一枚缺席都会抛，且消息里写着缺席的那一枚', () => {
      expect(几何必需字段.length).toBe(4);
      for (const 名 of 几何必需字段) {
        const layout = ProceduralDungeonGenerator.generate(DUNGEON_DEFS[0], 42);
        delete layout[名];
        expect(() => ProceduralDungeonGenerator.buildGeometry(new THREE.Group(), layout, DUNGEON_DEFS[0]),
          `缺 ${名} 居然没抛`).toThrow(new RegExp(名));
      }
    });

    it('缺两枚就点名两枚，齐货不抛（守卫不许是"永远说缺一个"的装饰）', () => {
      const layout = ProceduralDungeonGenerator.generate(DUNGEON_DEFS[0], 42);
      delete layout.wallT;
      layout.doorWidth = Number.NaN; // NaN 也算缺：往下就是一堆 NaN 几何（B80 的形状）
      let 消息 = '';
      try {
        ProceduralDungeonGenerator.buildGeometry(new THREE.Group(), layout, DUNGEON_DEFS[0]);
      } catch (e) {
        消息 = e.message;
      }
      expect(消息).toContain('wallT');
      expect(消息).toContain('doorWidth');
      expect(消息).not.toContain('wallH');
      expect(消息).not.toContain('bossDoorWidth');
      const 齐 = ProceduralDungeonGenerator.generate(DUNGEON_DEFS[0], 42);
      expect(() => ProceduralDungeonGenerator.buildGeometry(new THREE.Group(), 齐, DUNGEON_DEFS[0])).not.toThrow();
    });
  });

  describe('④ 派生层：门板 / 门框 / 门碰撞跟着洞宽走', () => {
    it.each([[4], [6], [2.5]])('doorWidth = %s 时，量出来的洞、门板让缝、门框收边与碰撞半轴全部自洽', (洞宽) => {
      const { layout, meshes } = build(DUNGEON_DEFS[0], 42, (l) => { l.doorWidth = 洞宽; });
      expect(layout.doors.length).toBeGreaterThan(20);
      for (const door of layout.doors) {
        const 洞 = 量门洞(layout, meshes, door);
        expect(洞, `${door.id} 量不到洞`).not.toBeNull();
        // 洞宽真的由布局说了算：不是"改了字段而几何照旧"
        expect(洞, `${door.id} 的洞没跟着 layout.doorWidth 走`).toBeCloseTo(洞宽, 6);

        const 板 = layout.doorMeshes.find((m) => m.userData.door?.id === door.id).geometry.parameters.width;
        const 框 = meshes.find((m) => m.userData.isFrame
          && Math.abs(m.position.x - door.x) < 1e-6 && Math.abs(m.position.z - door.z) < 1e-6)
          .geometry.parameters.width;
        const 每侧见光 = (洞 - 板) / 2;
        const 每侧收边 = (框 - 洞) / 2;
        expect(每侧见光, `${door.id} 门板跟墙段端面共面`).toBeGreaterThan(0);
        expect(每侧见光, `${door.id} 关着的门漏光 ${每侧见光.toFixed(3)} 米（改前 0.250）`)
          .toBeLessThanOrEqual(0.06);
        expect(每侧收边, `${door.id} 门框没盖到洞口`).toBeGreaterThan(0);
        expect(每侧收边, `${door.id} 门框收边盖不住门板让出的缝`).toBeGreaterThanOrEqual(每侧见光);
        // 门碰撞跨洞那一轴的半轴 = 洞的一半（轴向不分南北东西是 B84，见下一条）
        expect(door.collider.hw, `${door.id} 的碰撞跨洞半轴`).toBeCloseTo(洞 / 2, 6);
      }
    });

    it('已知缺陷 B84 的形状钉住：门碰撞的长轴恒在 x，不随门的朝向转', () => {
      // 门板与门框会按 dir 旋转，碰撞盒不会：n/s 向门的跨洞半轴正好是洞的一半，
      // e/w 向门则变成"沿通道 2 米、跨洞只有 DOOR_COLLIDER_HALF_DEPTH"，
      // 那 1.55 米靠墙段自己的碰撞盒补住（实测 `.tmp-20261004/wb10s4f-census.log` ③：
      // 537 扇里 291 扇盖满 / 246 扇差 1.55 米）。这一条**不是在说它对**，是把形状钉成一个读数。
      const { layout } = build(DUNGEON_DEFS[0], 42);
      const 半 = layout.doorWidth / 2;
      let n = 0, e = 0;
      for (const door of layout.doors) {
        const c = door.collider;
        if (door.dir === 'n' || door.dir === 's') {
          expect(c.hw, `${door.id} 南北向门的 x 半轴`).toBeCloseTo(半, 6);
          expect(c.hd, `${door.id} 南北向门的 z 半轴`).toBeCloseTo(DIM.DOOR_COLLIDER_HALF_DEPTH, 6);
          n++;
        } else {
          expect(c.hw, `${door.id} 东西向门的 x 半轴（本该是通道那一侧）`).toBeCloseTo(半, 6);
          expect(c.hd, `${door.id} 东西向门的 z 半轴（跨洞那一侧，B84）`).toBeCloseTo(DIM.DOOR_COLLIDER_HALF_DEPTH, 6);
          e++;
        }
      }
      expect(n, '南北向门没见过').toBeGreaterThan(0);
      expect(e, '东西向门没见过').toBeGreaterThan(0);
    });
  });

  describe('⑤ 编辑器层：吸附与反推吃这一份布局的格长', () => {
    let editor;
    beforeAll(() => {
      桩();
      editor = new LevelEditor(
        new THREE.Scene(),
        new THREE.PerspectiveCamera(75, 1, 0.1, 1000),
        { dispose: () => {}, domElement: { addEventListener: () => {} } },
        { addEventListener: () => {}, getContext: () => ({}) },
      );
    });
    afterAll(拆桩);

    it('空白布局带三枚尺寸；导入的布局带来就照它走，没带才回落到声明', () => {
      editor.clearAll();
      expect(editor.layout.cellSize).toBe(DIM.CELL);
      expect(editor.layout.doorWidth).toBe(DIM.DOOR_WIDTH);
      expect(editor.layout.bossDoorWidth).toBe(DIM.BOSS_DOOR_WIDTH);

      editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [] });
      expect(editor.layout.cellSize, '缺 cellSize 时没回落到声明那一份').toBe(DIM.CELL);
      expect(editor.layout.doorWidth).toBe(DIM.DOOR_WIDTH);

      editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [], cellSize: 25, doorWidth: 6 });
      expect(editor.layout.cellSize, '导入的 cellSize 被编辑器的抄本盖掉了').toBe(25);
      expect(editor.layout.doorWidth).toBe(6);
      expect(editor.layout.bossDoorWidth, '没带 bossDoorWidth 时该回落').toBe(DIM.BOSS_DOOR_WIDTH);
    });

    it('导入布局里的尺寸要么是数、要么干脆没有：0 / 负数 / NaN / 字符串都当场点名', () => {
      // 这一条量的是 `||` 与 `??` 都接不住的那一档：
      // `cellSize: 0` 在 `||` 下悄悄变成 18（导入的人以为自己带的那一枚生效了），
      // 在 `??` 下原样收下、下一次吸附就除出 Infinity。两种都比抛错难查（切片4f）。
      for (const 坏 of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, '18', {}, []]) {
        expect(() => editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [], cellSize: 坏 }),
          `cellSize=${JSON.stringify(坏)} 居然被收下了`).toThrow(/cellSize/);
      }
      // 缺才是缺：不带就回落到声明那一份，不该抛
      expect(() => editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [] })).not.toThrow();
      expect(editor.layout.cellSize).toBe(DIM.CELL);
      expect(() => editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [], doorWidth: 0 }),
        'doorWidth=0 被收下了').toThrow(/doorWidth/);
      expect(() => editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [], bossDoorWidth: -1 }),
        'bossDoorWidth=-1 被收下了').toThrow(/bossDoorWidth/);
      // 拒收不能留下半口的布局：抛在赋值之前，this.layout 还是上一份完整的
      editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [], cellSize: 25, doorWidth: 6 });
      expect(() => editor._importLayoutData({ gridW: 4, gridH: 4, rooms: [], doors: [], doorWidth: 'x' })).toThrow();
      expect([editor.layout.cellSize, editor.layout.doorWidth], '拒收之后布局被换成半口的了')
        .toEqual([25, 6]);
    });

    it('放置落位与拖动反推都按这一份布局的格长（同一实例改数就改行为）', () => {
      const 放 = (cellSize) => {
        editor._importLayoutData({ gridW: 5, gridH: 5, rooms: [], doors: [], cellSize });
        editor._addRoomAt(2, 1, 'chamber:square');
        return editor.layout.rooms.find((r) => r.id === 'r_2_1');
      };
      // 改前实测：cellSize=25 那一发给的是 36（编辑器自己的 `const CELL = 18`）
      expect(放(25).x, 'cellSize=25 时 (2,1) 该落在 50').toBe(50);
      expect(放(25).z).toBe(25);
      const 十八 = 放(18);
      expect(十八.x, '同一格在 cellSize=18 下必须落在另一个数，否则上面那条是巧合').toBe(36);

      // 拖完之后反推格号：60 米在 25 的格子里是第 2 格，在 18 的格子里是第 3 格。
      // 第二次调用得拿**改名后的** id 去找那间房 —— 用旧 id 会 `if (!room) return` 安静地什么都不做。
      const 拖 = (cellSize, 起id) => {
        editor.layout.cellSize = cellSize;
        editor._updateRoomPosition(起id, 60, 0);
        return editor.layout.rooms[0];
      };
      expect(拖(25, 放(25).id).gx, '60 / 25 该是 2').toBe(2);
      expect(拖(18, 'r_2_0').gx, '60 / 18 该是 3').toBe(3);
    });

    it('真指针路径：放置与拖动的落格都吃这一份布局的格长（B87 之后 z 不再是 NaN）', () => {
      // 上面那条是**直接调私有方法**的读数；这一条走真的鼠标坐标：把世界点投影成 client 坐标，
      // 让 `_placeRoom` / `_drag` 自己解回平面、自己吸格。三步都要过：
      //   `_updateMouse`（rect 换算）→ `setFromCamera` → `intersectPlane` → `/ step * step`。
      // 只有这条路径能量到 `_drag` 里那一发 `Vector3.sub(Vector2)`（修 B87）：
      // Vector2 没有 `.z`，减完平面交点的 z 直接成 NaN，房间号跟着变成 `r_2_NaN`
      // （实测 `.tmp-20261004/wb10s4f-drag.mjs` ①）。
      const { ed, cam, 客户端 } = 编辑器带指针(new THREE.Scene());
      // 自证尺子：投影必须能把平面上的点原样解回来，否则下面量的就是我的换算而不是编辑器
      for (const [wx, wz] of [[60, 50], [-25, 0]]) {
        const e = 客户端(wx, wz);
        const mouse = new THREE.Vector2(
          ((e.clientX - 视口.left) / 视口.width) * 2 - 1,
          -((e.clientY - 视口.top) / 视口.height) * 2 + 1,
        );
        const rc = new THREE.Raycaster();
        rc.setFromCamera(mouse, cam);
        const back = new THREE.Vector3();
        expect(rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), back),
          '解不到平面，这条用例就是在读空集').not.toBeNull();
        expect(Math.abs(back.x - wx), '投影换算把 x 解歪了').toBeLessThan(1e-6);
        expect(Math.abs(back.z - wz), '投影换算把 z 解歪了').toBeLessThan(1e-6);
      }

      const 放 = (cellSize) => {
        ed._importLayoutData({ gridW: 7, gridH: 7, rooms: [], doors: [], cellSize });
        ed.selectedTemplateId = 'chamber:square';
        ed._placeRoom(客户端(60, 50));
        return ed.layout.rooms[ed.layout.rooms.length - 1];
      };
      const 廿五 = 放(25);
      expect([廿五.gx, 廿五.gz], 'cellSize=25：指针下的 (60,50) 该吸到第 (2,2) 格').toEqual([2, 2]);
      expect([廿五.x, 廿五.z]).toEqual([50, 50]);
      const 十八 = 放(18);
      expect([十八.gx, 十八.gz], '同一指针在 18 的格子里必须是别的格，否则上面那条是巧合').toEqual([3, 3]);
      expect(十八.id).toBe('r_3_3');

      ed._importLayoutData({ gridW: 7, gridH: 7, rooms: [], doors: [], cellSize: 25 });
      ed._addRoomAt(1, 1, 'chamber:square');
      ed.enabled = true;
      ed.dragTarget = 'r_1_1';
      ed.dragOffset.set(0, 0);
      ed._drag(客户端(60, 50));
      const 拖完 = ed.layout.rooms[0];
      expect(拖完.id, `拖一次房间号漂成 ${拖完.id} —— B87 的形状`).toBe('r_2_2');
      expect([拖完.x, 拖完.z], '落点必须是吸过格的有限数，不是 NaN').toEqual([50, 50]);
      const 网格 = ed.roomMeshes.get('r_1_1');
      // 键**不随改名走**（B88 的第一格）：房间已经叫 r_2_2，可视化还挂在 r_1_1 上。
      // 这一条不是在说它对，是把 W-B11 切片1 要修的读数钉住 —— 修好后这里应改成 get('r_2_2')。
      expect(网格, '拖一次之后可视化丢了键就不是 B88 那一格').toBeDefined();
      expect(网格.mesh.position.z, '落点那一份 group 的 z 也必须是数').toBe(50);
    });

    it('拖动偏移跟着指针一起走（B87 的另一半：抓住的不是格点而是当初按住的那一点）', () => {
      const { ed, 客户端 } = 编辑器带指针(new THREE.Scene());
      ed._importLayoutData({ gridW: 7, gridH: 7, rooms: [], doors: [], cellSize: 25 });
      ed._addRoomAt(0, 0, 'chamber:square');
      ed.enabled = true;
      ed.dragTarget = 'r_0_0';
      // 抓在房间里偏 (+3, +4) 的位置：拖到 (60,50) 时先减偏移再吸格 → (57,46) → 第 (2,2) 格。
      // 偏移减错方向或漏减 z，格子就会跳到别处去 —— 这一条钉的是"减的那一维对不对"。
      ed.dragOffset.set(3, 4);
      ed._drag(客户端(60, 50));
      expect(ed.layout.rooms[0].id, '抓点偏移没有两维都减（B87 的另一半）').toBe('r_2_2');
      expect([ed.layout.rooms[0].x, ed.layout.rooms[0].z]).toEqual([50, 50]);
    });

    it('导出的 JSON 带着三枚尺寸，绕一圈回来不被编辑器的默认值盖掉', () => {
      editor._importLayoutData({
        gridW: 3, gridH: 3, cellSize: 25, doorWidth: 6, bossDoorWidth: 7,
        rooms: [], doors: [], seed: 7,
      });
      editor._addRoomAt(1, 1, 'chamber:square');

      const 原Blob = globalThis.Blob;
      const 原URL = globalThis.URL;
      let 写下 = '';
      try {
        globalThis.Blob = class { constructor(parts) { 写下 = parts.join(''); } };
        globalThis.URL = { createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} };
        editor.exportLayout();
      } finally {
        globalThis.Blob = 原Blob;
        globalThis.URL = 原URL;
      }
      const 导出 = JSON.parse(写下);
      expect([导出.cellSize, 导出.doorWidth, 导出.bossDoorWidth], '导出漏了哪一枚').toEqual([25, 6, 7]);
      editor._importLayoutData(导出);
      expect(editor.layout.cellSize).toBe(25);
      expect(editor.layout.doorWidth).toBe(6);
      expect(editor.layout.bossDoorWidth).toBe(7);
    });
  });

  describe('⑥ 绝迹层：18 处抄本在役源码里 0 命中，同一把尺在旧字节上数得到', () => {
    it.each(抄本表.map((c) => [c.标题, c]))('%s', (_标题, c) => {
      const 在役 = 去注释(readFileSync(join(SRC, c.文件), 'utf8'));
      const 同一把 = new RegExp(c.尺.source, c.尺.flags);
      expect(数(同一把, 在役), `${_标题}：在役源码里还写着它`).toBe(0);
      // arming 下限：同一把尺必须在誊来的旧字节摘录上数得到登记的那几处
      expect(c.旧文本.length, `${_标题}：没有誊任何旧字节，这条就是自说自话`).toBeGreaterThan(0);
      for (const 段 of c.旧文本) {
        expect(段.trim(), `${_标题}：誊了一条空白摘录`).not.toBe('');
      }
      expect(数(new RegExp(c.尺.source, c.尺.flags), c.旧文本.join('\n')),
        `${_标题}：这把尺连旧写法都认不出，那句"绝迹"就不值钱`).toBe(c.期望旧命中);
      // 摘录必须逐条都认得出：某一条数到 0 就是誊错了字节或尺认不出那一 shape，
      // 而"整段拼接数得到"仍可能靠别的条蒙对（挨不挨着另说，见 helpers 文件头）
      for (const 段 of c.旧文本) {
        expect(数(new RegExp(c.尺.source, c.尺.flags), 段),
          `${_标题}：这一段摘录自己的命数对不上：${段}`).toBeGreaterThanOrEqual(1);
      }
      expect(c.现在, `${_标题}：没写现在改读哪一份`).toBeTruthy();
    });

    it('RoomTemplates 不再转手格长，端口也不再声明门宽', () => {
      expect('CELL' in RoomTemplatesModule, '那个零消费者的转手出口还在').toBe(false);
      const 键 = new Set();
      for (const t of Object.values(ROOM_TEMPLATES)) {
        for (const p of Object.values(t.ports)) {
          if (!p) continue;
          for (const k of Object.keys(p)) 键.add(k);
        }
      }
      // 端口只说两件事：哪边必须开门、哪边必须是墙。洞多宽由尺寸那一份说。
      expect([...键].sort()).toEqual(['required', 'solid']);
      // 模板自己的 footprint 仍然是那句话（它问的是"这间房多大"，不是"洞多宽"）
      const 尺寸 = Object.values(ROOM_TEMPLATES).map((t) => `${t.width}×${t.depth}`);
      expect(new Set(尺寸)).toEqual(new Set([`${DIM.CELL}×${DIM.CELL}`]));
    });
  });

  describe('⑦ 读数层：B86 与 B88 —— 编辑器的坐标口径与可视化对账', () => {
    it('把一份真迷宫布局导入编辑器、原地拖动一间房，房间号会跳到别的格（规模钉住）', () => {
      // 迷宫放房用 `(gx − gridW/2) * cellSize`（网格居中），编辑器反推格号用 `round(x / cellSize)`
      // （原点格）。两条口径差 gridW/2 格，所以**位置一个毫米都没动**的一次拖动就把 r_0_0 改成
      // r_-3_-3。实测 `.tmp-20261004/wb10s4f-editor-coords.mjs`：那座 36 间全被改名。
      //
      // 这条用例不是在说它对：W-B11 切片1 让墙与门由占用推导时，必须先把这一套口径并成一套，
      // 那时这里的期望数改成 0。在此之前它是一条不许漂的读数。
      桩();
      const editor = new LevelEditor(
        new THREE.Scene(),
        new THREE.PerspectiveCamera(75, 1, 0.1, 1000),
        { dispose: () => {}, domElement: { addEventListener: () => {} } },
        { addEventListener: () => {}, getContext: () => ({}) },
      );
      const layout = ProceduralDungeonGenerator.generate(DUNGEON_DEFS[0], 42);
      editor._importLayoutData({
        gridW: layout.gridW, gridH: layout.gridH,
        cellSize: layout.cellSize, doorWidth: layout.doorWidth, bossDoorWidth: layout.bossDoorWidth,
        rooms: layout.rooms, doors: layout.doors, seed: layout.seed,
      });
      let 改名 = 0;
      for (let i = 0; i < editor.layout.rooms.length; i++) {
        const r = editor.layout.rooms[i];
        const before = { id: r.id, gx: r.gx, gz: r.gz };
        editor._updateRoomPosition(r.id, r.x, r.z);
        const after = editor.layout.rooms[i];
        if (after.id !== before.id || after.gx !== before.gx || after.gz !== before.gz) 改名++;
      }
      const 总数 = editor.layout.rooms.length;
      expect(总数, '一间房都没导入，这条就成了空转').toBeGreaterThan(20);
      expect(改名, 'B86 的规模漂了 —— 修好后这里应改为 0').toBe(总数);
      delete global.window;
      delete global.document;
    });

    it('已知缺陷 B88 的形状钉住：拖一次之后可视化与数据分家（双重偏移 + 键不随改名走）', () => {
      // `_createRoomVisual` 把盒子放在 `group` **里面**、并按房间坐标摆好 (room.x, 1, room.z)；
      // `_drag` 又把 `group` 整体搬到落点 —— 于是画面上的盒子在「落点 + 原位置」，一格起步。
      // 同时 `roomMeshes` 的键与内层 mesh 的 `userData.roomId` 都还停在旧 id 上，
      // 第二次拖动 `_updateRoomPosition(旧 id, …)` 找不到房间就 `return`：**图在动，数据不动**。
      // 实测 `.tmp-20261004/wb10s4f-visual.mjs`：拖一次 数据(50,50) / 图(75,75)，
      // 再拖一次 数据仍 (50,50) / 图(125,125)。
      //
      // 这一条不是在说它对：W-B11 切片1 把墙与门改成由占用推导时，可视化必须整个重建一遍口径，
      // 那时这里的期望改成"图与数据同位"。在此之前它是一条不许漂的读数。
      桩();
      const { ed, 客户端 } = 编辑器带指针(new THREE.Scene());
      ed._importLayoutData({ gridW: 7, gridH: 7, rooms: [], doors: [], cellSize: 25 });
      ed._addRoomAt(1, 1, 'chamber:square');
      ed.enabled = true;
      ed.dragTarget = 'r_1_1';
      ed.dragOffset.set(0, 0);
      ed._drag(客户端(60, 50));

      const 房 = ed.layout.rooms[0];
      const 组 = ed.roomMeshes.get('r_1_1').mesh;
      const 盒 = 组.children.find((c) => c.isMesh);
      盒.updateWorldMatrix(true, true);
      const 世界 = new THREE.Vector3();
      盒.getWorldPosition(世界);
      // 数据说它在 (50,50)，画面把它画在 (75,75) —— 差恰好一格
      expect([房.x, 房.z]).toEqual([50, 50]);
      expect(世界.z - 房.z, '可视化相对数据的偏移').toBeCloseTo(25, 6);
      expect(盒.userData.roomId, '内层 mesh 还挂在旧 id 上').toBe('r_1_1');

      // 第二次拖动：按旧 id 认领得到（图照搬），数据却因为找不到房间而原地不动
      ed.dragTarget = 盒.userData.roomId;
      ed._drag(客户端(100, 100));
      expect(ed.layout.rooms[0].x, '数据跟着动了 —— B88 修好后这条期望要改').toBe(50);
      expect(组.position.x, '图却搬到了第二个落点').toBe(100);
      delete global.window;
      delete global.document;
    });
  });
});
