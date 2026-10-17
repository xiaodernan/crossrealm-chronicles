/**
 * 内部空间与竖向日程的契约（W-B9 切片3，补 B83 的门禁 + 修 B100）
 *
 * ## 为什么补这一片
 * `src/world/InternalSpace.js`（399 行）与 `src/world/VerticalSchedule.js`（290 行）是
 * W-B9 那两片的核心，有**唯一消费者**（`WorldManager.js` 起手 import、注册四座室内模板、
 * 按区建调度器、每帧 `update`），但 `tests/` 全域**零引用**（B83）。
 * 契约只长在代码里，坏了不报错 —— 与 B71 / B74 同形。
 *
 * ## 写门禁时当场抓到一个（B100）
 * `InternalSpaceManager.getCurrentInternalHeight(worldX, worldZ)` 的签名里**没有 zoneCenter**，
 * 它内部拿 `{ x: 0, y: 0, z: 0 }` 去算 —— 于是 `worldToLocal` 少减了区域中心，
 * 而 `zoneCenter.y` 整个丢了。四个模板里两个的高度函数是**非平凡**的
 * （幽暗神殿"中心凹陷 2 米"、晨曦大厅"中央隆起"），实测中心点差 **10~12.5 米**。
 * 玩家侧的说法是"走进室内，地面高度整个不对"。
 *
 * ## 用例分七层
 * 1. 坐标变换互为逆（localToWorld ∘ worldToLocal == 恒等）。
 * 2. `containsWorldPoint` 与半径一致（圆心在内、半径外在外）。
 * 3. **高度采样**：单空间的算式、以及 Manager 那条路与它**逐格一致**（钉 B100）。
 * 4. Manager 的查询：范围内查到那一座、范围外 null。
 * 5. 碰撞体的世界化：`x == 世界中心.x + 局部 x`。
 * 6. 竖向日程：`tryMove` 的每条拒绝理由、成功后三本账都记、往返存档一致。
 * 7. 样本下限：四座模板都在、每个有调度器的区都点名 —— 扫不到东西的"绝迹"会假绿。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  InternalSpaceManager, InternalSpaceTemplates,
} from '../src/world/InternalSpace.js';
import {
  FloorLevel, VerticalMoveMode, VerticalScheduler, VerticalSchedulePresets, createVerticalScheduler,
} from '../src/world/VerticalSchedule.js';

const SRC = join(process.cwd(), 'src');

/** 四个模板的名字（点得出名字，才谈得上"哪座模板注册了"） */
const TEMPLATE_NAMES = ['gloomAncientShrine', 'gloomTreeHollow', 'radiantGrandHall', 'radiantStarwatchTower'];
/** 区域中心：**故意不放在原点** —— 放原点的话 B100 那个 bug 会隐身 */
const ZC = { x: 180, y: 12, z: 100 };

const makeSpace = (name, zc = ZC) => InternalSpaceTemplates[name](zc);

describe('内部空间与竖向日程的契约（B83 / B100）', () => {
  describe('① 坐标变换互为逆', () => {
    it('localToWorld ∘ worldToLocal == 恒等（四座模板 × 多组点）', () => {
      for (const name of TEMPLATE_NAMES) {
        const s = makeSpace(name);
        for (const [lx, lz] of [[0, 0], [5, -3], [-12.5, 7.25], [0.001, -0.001]]) {
          const w = s.localToWorld(lx, lz, ZC);
          const back = s.worldToLocal(w.x, w.z, ZC);
          expect(back.x, `${name} lx`).toBeCloseTo(lx, 9);
          expect(back.z, `${name} lz`).toBeCloseTo(lz, 9);
        }
      }
    });

    it('世界中心 == 区域中心 + 本地中心', () => {
      for (const name of TEMPLATE_NAMES) {
        const s = makeSpace(name);
        const wc = s.getWorldCenter(ZC);
        expect(wc.x).toBeCloseTo(ZC.x + s.localCenter.x, 9);
        expect(wc.z).toBeCloseTo(ZC.z + s.localCenter.z, 9);
      }
    });
  });

  describe('② containsWorldPoint 与半径一致', () => {
    it('中心在内、半径外一点在外、半径内一点在内', () => {
      for (const name of TEMPLATE_NAMES) {
        const s = makeSpace(name);
        const wc = s.getWorldCenter(ZC);
        expect(s.containsWorldPoint(wc.x, wc.z, ZC), `${name} 中心`).toBe(true);
        expect(s.containsWorldPoint(wc.x + s.radius * 0.9, wc.z, ZC), `${name} 0.9R`).toBe(true);
        expect(s.containsWorldPoint(wc.x + s.radius * 1.1, wc.z, ZC), `${name} 1.1R`).toBe(false);
      }
    });
  });

  describe('③ 高度采样（B100 就钉在这里）', () => {
    it('单空间：中心点高度 == 基准高度 + 局部采样(0,0)', () => {
      for (const name of TEMPLATE_NAMES) {
        const s = makeSpace(name);
        const wc = s.getWorldCenter(ZC);
        const want = s.getWorldBaseHeight(ZC) + s.sampleHeightInternal(0, 0);
        expect(s.getInternalHeightAt(wc.x, wc.z, ZC), `${name}`).toBeCloseTo(want, 9);
      }
    });

    it('Manager 那条路与单空间**逐格一致** —— 不丢区域中心', () => {
      const mgr = new InternalSpaceManager();
      for (const name of TEMPLATE_NAMES) mgr.register(makeSpace(name));
      // B121：区域中心由问手现问（这里每座都登记在 ZC 那个区下）
      mgr.attachZoneCenterResolver(() => ZC);

      for (const name of TEMPLATE_NAMES) {
        const s = makeSpace(name);
        const wc = s.getWorldCenter(ZC);
        const viaManager = mgr.getInternalHeightAtWorldPoint(wc.x, wc.z);
        const viaSpace = s.getInternalHeightAt(wc.x, wc.z, ZC);
        expect(viaManager, `${name} 中心点：Manager 与单空间`).toBeCloseTo(viaSpace, 9);
      }
    });

    it('区域中心的高度（y）真的参与计算 —— 挪 y 就挪结果', () => {
      const mgr = new InternalSpaceManager();
      const s = makeSpace('radiantStarwatchTower');
      mgr.register(s);
      const wc = s.getWorldCenter(ZC);
      mgr.attachZoneCenterResolver(() => ZC);
      const a = mgr.getInternalHeightAtWorldPoint(wc.x, wc.z);
      mgr.attachZoneCenterResolver(() => ({ ...ZC, y: ZC.y + 7 }));
      const b = mgr.getInternalHeightAtWorldPoint(wc.x, wc.z);
      expect(b - a).toBeCloseTo(7, 9);
    });

    it('登记区问不到中心就当场抛 —— 不许把 NaN 交给玩家的下坠（B120）', () => {
      const mgr = new InternalSpaceManager();
      const s = makeSpace('radiantGrandHall');
      mgr.register(s);
      const wc = s.getWorldCenter(ZC);
      // 生产的区域中心曾经就是这张 `{x, z}`（`BaseZone` 直接存调用方递的字面量），
      // 于是 `zoneCenter.y + baseHeight + floor*floorHeight` 恒为 NaN。
      mgr.attachZoneCenterResolver(() => ({ x: ZC.x, z: ZC.z }));
      expect(() => mgr.getInternalHeightAtWorldPoint(wc.x, wc.z)).toThrow(/有限的 y/);
      mgr.attachZoneCenterResolver(() => ({ x: ZC.x, y: NaN, z: ZC.z }));
      expect(() => mgr.getInternalHeightAtWorldPoint(wc.x, wc.z)).toThrow(/有限的 y/);
      // 缺 y 的那个区要点名得出：静默跳过得到的就是 B121（一座永远不回答的空间）
      expect(() => mgr.getInternalHeightAtWorldPoint(wc.x, wc.z))
        .toThrow(new RegExp(`getInternalHeight（${s.zoneId}）`));
    });

    it('不在任何内部空间时返回 null', () => {
      const mgr = new InternalSpaceManager();
      mgr.register(makeSpace('gloomAncientShrine'));
      mgr.attachZoneCenterResolver(() => ZC);
      expect(mgr.getInternalHeightAtWorldPoint(99999, 99999)).toBe(null);
    });

    it('按**点**回答，不按缓存的 currentSpace 回答（B120 的另一半）', () => {
      const mgr = new InternalSpaceManager();
      const hall = makeSpace('radiantGrandHall');
      mgr.register(hall);
      // B121：`updateCurrent` 不再收调用方递进来的区 id，改为向问手现问登记区的中心
      mgr.attachZoneCenterResolver(() => ZC);
      const wc = hall.getWorldCenter(ZC);
      // 玩家站在大厅里：缓存指向那座空间
      expect(mgr.updateCurrent(wc.x, wc.z)).toBe(hall);
      expect(mgr.currentSpace, '缓存应当还在那座大厅').toBe(hall);
      // 问一个 600 米外的点 —— 那是快速旅行目的地/敌人脚下那一类问法，
      // 改前拿的是缓存，于是"整个区的地板都是大厅那一块"
      const 远处 = { x: wc.x + 600, z: wc.z };
      expect(mgr.getInternalHeightAtWorldPoint(远处.x, 远处.z), '点不在大厅里就不该给大厅的地板')
        .toBe(null);
    });
  });

  describe('④ Manager 的查询：占地自己认领这个点', () => {
    it('范围内查到那一座（连带说出登记在谁名下）、范围外 null', () => {
      const mgr = new InternalSpaceManager();
      const shrine = makeSpace('gloomAncientShrine');
      mgr.register(shrine);
      mgr.attachZoneCenterResolver(() => ZC);
      const wc = shrine.getWorldCenter(ZC);
      expect(mgr.spaceAtWorldPoint(wc.x, wc.z)?.space.id).toBe(shrine.id);
      expect(mgr.spaceAtWorldPoint(wc.x, wc.z)?.zoneId).toBe('gloom');
      expect(mgr.spaceAtWorldPoint(wc.x + 500, wc.z)).toBe(null);
    });

    it('占地是用**登记区**的中心换算的：那个中心挪了，认得这个点的地方跟着挪', () => {
      const mgr = new InternalSpaceManager();
      const shrine = makeSpace('gloomAncientShrine');
      mgr.register(shrine);
      const 另一个区心 = { x: ZC.x + 500, y: ZC.y, z: ZC.z - 400 };
      mgr.attachZoneCenterResolver((zoneId) => (zoneId === 'gloom' ? 另一个区心 : ZC));
      const 新心 = shrine.getWorldCenter(另一个区心);
      expect(mgr.spaceAtWorldPoint(新心.x, 新心.z)?.space.id, '挪过之后占地也挪了').toBe(shrine.id);
      const 旧心 = shrine.getWorldCenter(ZC);
      expect(mgr.spaceAtWorldPoint(旧心.x, 旧心.z), '旧位置不再是那座空间（换算没有硬编码 0）').toBe(null);
    });

    it('updateCurrent 会把 currentSpace 更新成 null（走出去了）', () => {
      const mgr = new InternalSpaceManager();
      const shrine = makeSpace('gloomAncientShrine');
      mgr.register(shrine);
      mgr.attachZoneCenterResolver(() => ZC);
      const wc = shrine.getWorldCenter(ZC);
      expect(mgr.updateCurrent(wc.x, wc.z)).toBeTruthy();
      expect(mgr.updateCurrent(wc.x + 500, wc.z)).toBe(null);
      expect(mgr.currentSpace).toBe(null);
    });
  });

  describe('⑤ 碰撞体的世界化', () => {
    it('圆柱碰撞体：世界 x == 世界中心.x + 局部 lx', () => {
      const mgr = new InternalSpaceManager();
      const s = makeSpace('gloomAncientShrine');
      s.addCylinderCollider(3, -4, 1.5, 3);
      mgr.register(s);
      const wc = s.getWorldCenter(ZC);
      mgr.attachZoneCenterResolver(() => ZC);
      mgr.updateCurrent(wc.x, wc.z);
      const cols = mgr.getCurrentCollidersWorld(ZC);
      const cyl = cols.find((c) => c.shape === 'cyl');
      expect(cyl).toBeTruthy();
      expect(cyl.x).toBeCloseTo(wc.x + 3, 9);
      expect(cyl.z).toBeCloseTo(wc.z - 4, 9);
      expect(cyl.r).toBeCloseTo(1.5, 9);
      // base/top 只加一次 worldBase（= ZC.y + baseHeight + floor*floorHeight = 12-3-5 = 4），
      // 不许再叠一次 baseHeight（双击 baseHeight 的回归 bug，切片6 修）。
      expect(cyl.base).toBeCloseTo(4, 9);
      expect(cyl.top).toBeCloseTo(7, 9);
    });

    it('盒碰撞体：base/top 同样只加一次 worldBase（反向控制双击 baseHeight）', () => {
      const mgr = new InternalSpaceManager();
      const s = makeSpace('gloomAncientShrine');
      s.addBoxCollider(-2, -1, 1, 1, 4, { base: 1, rot: 0.3, kind: 'trigger' });
      mgr.register(s);
      const wc = s.getWorldCenter(ZC);
      mgr.attachZoneCenterResolver(() => ZC);
      mgr.updateCurrent(wc.x, wc.z);
      const box = mgr.getCurrentCollidersWorld(ZC).find((c) => c.shape === 'box');
      expect(box).toBeTruthy();
      expect(box.x).toBeCloseTo(wc.x - 2, 9);
      expect(box.z).toBeCloseTo(wc.z - 1, 9);
      expect(box.base).toBeCloseTo(4 + 1, 9); // worldBase 4 + 局部 base 1
      expect(box.top).toBeCloseTo(4 + 4, 9);
      expect(box.rot).toBeCloseTo(0.3, 9);
      expect(box.kind).toBe('trigger');
    });

    it('不在空间里时碰撞体列表是空的', () => {
      const mgr = new InternalSpaceManager();
      expect(mgr.getCurrentCollidersWorld(ZC)).toEqual([]);
    });
  });

  describe('⑥ 竖向日程', () => {
    const mkScheduler = () => {
      // 字段名是 `unlockRequirements`（**数组**）：空数组的 `every()` 恒真，
      // 所以"无条件楼层"与"条件未满足的楼层"必须分得清 —— 写错字段名会让三层全解锁。
      const floors = [
        new FloorLevel({ floor: 0, name: '地面' }),
        new FloorLevel({ floor: 1, name: '树洞', unlockRequirements: ['key-tree'] }),
        new FloorLevel({ floor: 2, name: '树顶', unlockRequirements: ['key-top'] }),
      ];
      const has = (req) => req === 'key-tree';
      return new VerticalScheduler({ floors, hasRequirement: has });
    };

    it('未解锁的楼层移不过去，且说得出理由', () => {
      const sc = mkScheduler();
      sc.refresh();
      const r = sc.tryMove(2, VerticalMoveMode.PORTAL, 0);
      expect(r.success).toBe(false);
      expect(r.reason).toMatch(/未解锁/);
    });

    it('不存在的楼层移不过去', () => {
      const sc = mkScheduler();
      const r = sc.tryMove(9, VerticalMoveMode.PORTAL, 0);
      expect(r.success).toBe(false);
      expect(r.reason).toMatch(/不存在/);
    });

    it('未知移动模式被拒', () => {
      const sc = mkScheduler();
      sc.refresh();
      const r = sc.tryMove(1, 'teleport', 0);
      expect(r.success).toBe(false);
      expect(r.reason).toMatch(/未知移动模式/);
    });

    it('电梯要有入口才给走', () => {
      const floors = [new FloorLevel({ floor: 0, name: '地面' }), new FloorLevel({ floor: 1, name: '二层' })];
      const sc = new VerticalScheduler({ floors, hasRequirement: () => true });
      sc.refresh();
      const r = sc.tryMove(1, VerticalMoveMode.ELEVATOR, 0);
      expect(r.success).toBe(false);
      expect(r.reason).toMatch(/无电梯入口/);
    });

    it('楼梯有冷却：连按两次只成一次', () => {
      const floors = [new FloorLevel({ floor: 0, name: '地面' }), new FloorLevel({ floor: 1, name: '二层' })];
      const sc = new VerticalScheduler({ floors, hasRequirement: () => true, stairsCooldown: 1.5 });
      sc.refresh();
      expect(sc.tryMove(1, VerticalMoveMode.STAIRS, 10).success).toBe(true);
      const second = sc.tryMove(0, VerticalMoveMode.STAIRS, 10.5);
      expect(second.success).toBe(false);
      expect(second.reason).toMatch(/冷却/);
      expect(sc.tryMove(0, VerticalMoveMode.STAIRS, 12).success).toBe(true);
    });

    it('成功后：当前层、解锁、发现三本账都记，且历史留痕', () => {
      const sc = mkScheduler();
      sc.refresh();
      const r = sc.tryMove(1, VerticalMoveMode.PORTAL, 5);
      expect(r.success).toBe(true);
      expect(sc.currentFloor).toBe(1);
      expect(sc.isUnlocked(1)).toBe(true);
      expect(sc.isDiscovered(1)).toBe(true);
      const h = sc.getHistory();
      expect(h.length).toBe(1);
      expect(h[0]).toMatchObject({ from: 0, to: 1, mode: VerticalMoveMode.PORTAL });
    });

    it('getReachableFloors 只列相邻且已解锁的层', () => {
      const sc = mkScheduler();
      sc.refresh(); // 只有 0 与 1 解锁
      expect(sc.getReachableFloors()).toEqual([1]);
      sc.tryMove(1, VerticalMoveMode.PORTAL, 0);
      expect(sc.getReachableFloors()).toEqual([0]); // 2 还没解锁，不列
    });

    it('存档往返一致（含 -Infinity 那一格）', () => {
      const sc = mkScheduler();
      sc.refresh();
      sc.tryMove(1, VerticalMoveMode.STAIRS, 3);
      const json = JSON.parse(JSON.stringify(sc.toJSON()));
      const sc2 = mkScheduler();
      sc2.fromJSON(json);
      expect(sc2.currentFloor).toBe(sc.currentFloor);
      expect([...sc2.unlockedFloors].sort()).toEqual([...sc.unlockedFloors].sort());
      expect([...sc2.discoveredFloors].sort()).toEqual([...sc.discoveredFloors].sort());
      expect(sc2.lastStairsMove).toBeCloseTo(sc.lastStairsMove, 9);
      expect(sc2.getHistory().length).toBe(sc.getHistory().length);
    });

    it('fromJSON(null) 不炸，回到初值', () => {
      const sc = mkScheduler();
      sc.fromJSON(null);
      expect(sc.currentFloor).toBe(0);
      expect(sc.isUnlocked(0)).toBe(true);
    });

    it('createVerticalScheduler 按预置建得出、且带 zoneId', () => {
      for (const zoneId of Object.keys(VerticalSchedulePresets)) {
        const sc = createVerticalScheduler(zoneId, () => true);
        expect(sc, `${zoneId} 应当建得出`).toBeTruthy();
        expect(sc.floors.length, `${zoneId} 的楼层数`).toBeGreaterThan(0);
      }
    });
  });

  describe('⑧ WorldManager 那一侧的接线（B100 → B120）', () => {
    // 这一层是变异臂 A2 逼出来的：把 `getGroundHeight` 传的 zoneCenter 改成丢 y 的版本，
    // 上面七层**全绿** —— 因为它们都直接驱动 Manager，**一次也没经过 WorldManager**。
    // "改对了调用点"与"调用点被门禁看着"是两件事。
    // B120 又给这一层加了一条：七层的 fixture 中心自带 `y`，生产的不带 —— 所以这一层
    // 现在按**生产源码的形状**量（`internal-space-ground-height.test.js` 管行为，这里管接线）。
    // EOL：仓库里源码是 CRLF 检出，正则里的 `\n` 会对不上 —— 先归一化（切片14 同族教训）。
    const wmSrc = () => readFileSync(join(SRC, 'world', 'WorldManager.js'), 'utf8').replace(/\r\n/g, '\n');

    /** 整行注释从尺子里去掉：量的是代码，不是"注释里提到了这句" */
    const 去注释 = (体) => 体.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

    /** 从方法头切到"收在两格缩进的那一个 `}`"：类里的方法都收在这一层缩进 */
    const 切方法 = (src, 头) => {
      const 起 = src.indexOf(头);
      expect(起, `WorldManager 里应当有 ${头}`).toBeGreaterThan(-1);
      const 止 = src.indexOf('\n  }', 起);
      expect(止 > 起, `${头} 找不到收尾`).toBe(true);
      return 去注释(src.slice(起, 止));
    };

    // 判据：室内高度必须**按这个点自己**问。两条弯路都不许走回去 ——
    // 读玩家缓存是 B120，先把点收敛成一个区、再去那个区名下找空间是 B121（重叠的区半径
    // 会把整座空间判给邻区，实测 space × gloom 的重叠带宽 291.7 米）。
    const ASKS_BY_POINT = /getInternalHeightAtWorldPoint\(\s*x,\s*z\s*,?\s*\)/;

    /** 室内归属的刷新必须排在"区没变就早退"之前 */
    const 刷新早于早退 = (体) => {
      const 刷新 = 体.indexOf('updateCurrent(');
      const 早退 = 体.indexOf('zone === this.currentZone');
      return 刷新 >= 0 && 早退 >= 0 && 刷新 < 早退;
    };

    it('getGroundHeight 按点问室内高度，且**不把这个点交给区半径去收敛**', () => {
      const 体 = 切方法(wmSrc(), 'getGroundHeight(x, z) {');
      expect(体, 'WorldManager 的高度分支里应当有 getInternalHeightAtWorldPoint 调用').toMatch(ASKS_BY_POINT);
      // 反面：这条路上不许再读缓存、不许留着"按玩家问"的旧入口、
      // 也不许把区 id / 区中心递进室内查询（那正是 B121 的那一步收敛）
      for (const 坏字样 of [
        'currentSpace', 'getCurrentInternalHeight', 'this.currentZone',
        'zoneIdAt', 'zone.id', 'zoneCenter', 'querySpaceAt',
      ]) {
        expect(体.includes(坏字样), `getGroundHeight 的高度分支里不该出现 ${坏字样}`).toBe(false);
      }
    });

    it('update() 每帧刷归属：`updateCurrent` 排在"区没变就早退"之前，且不递区 id', () => {
      const 体 = 切方法(wmSrc(), 'update(dt, playerPos) {');
      expect(刷新早于早退(体)).toBe(true);
      const 刷新 = 体.slice(体.indexOf('updateCurrent('), 体.indexOf(')', 体.indexOf('updateCurrent(')));
      expect(刷新, '把大气归属递给室内查询就是 B121 的形状（室内归属会被区半径收敛）')
        .not.toMatch(/zoneId|zone\.center|zone\?\.center|\bid\b/);
    });

    it('反面证据：两把尺子都量得出坏写法，也放得过好写法', () => {
      const 坏高度写法 = [
        // B100 那一版的接线：按玩家缓存问
        'getCurrentInternalHeight(x, z, this.currentZone?.center ?? { x: 0, y: 0, z: 0 })',
        // 名字改对了、仍然拿"玩家所在的区"回答外部点（B120 的本体）
        'getInternalHeightAtPoint(x, z, this.currentZone?.id, this.currentZone?.center)',
        // B121 那一版：先按大气归属把点收敛成一个区，再去那个区名下找空间
        'getInternalHeightAtPoint(x, z, zone.id, zone.center)',
        // 新的按点入口又递回区 id：收敛那一步没拆掉，只是换了个函数名
        'getInternalHeightAtWorldPoint(x, z, id)',
        // 少了坐标：问不成这个点
        'getInternalHeightAtWorldPoint(z, x)',
      ];
      for (const b of 坏高度写法) {
        expect(ASKS_BY_POINT.test(b), `应当认出坏写法：${b.slice(0, 46)}…`).toBe(false);
      }
      // 好写法（跨行）要放行
      const good = 'this.internalSpaceManager.getInternalHeightAtWorldPoint(\n        x, z,\n      )';
      expect(ASKS_BY_POINT.test(good)).toBe(true);

      const 晚刷新 = 'const zone = resolveZone(this.zones, id);\n    if (!zone || zone === this.currentZone) return;\n    this.internalSpaceManager.updateCurrent(playerPos.x, playerPos.z);';
      expect(刷新早于早退(晚刷新), '早退之后才刷新的写法应当被认出').toBe(false);
      const 没有早退 = 'this.internalSpaceManager.updateCurrent(playerPos.x, playerPos.z);';
      expect(刷新早于早退(没有早退), '找不到早退那句时不许算通过').toBe(false);

      // 去注释这一层自己也要两头量得出：本片的 B120 说明里正好抄了那句早退
      const 注释里的早退 = [
        'update(dt, playerPos) {',
        '  // 改前这一句写在 `zone === this.currentZone` 的早退之后',
        '  this.internalSpaceManager.updateCurrent(x, z);',
        '  if (!zone || zone === this.currentZone) return;',
        '}',
      ].join('\n');
      expect(刷新早于早退(去注释(注释里的早退)), '注释里提到早退那句不该算顺序').toBe(true);
      expect(刷新早于早退(注释里的早退), '不去注释时会被注释里的顺序骗到').toBe(false);
    });
  });

  describe('⑦ 样本下限（扫不到东西的"绝迹"会假绿）', () => {
    it('四座模板都在，且各自带 id / zoneId / 正半径', () => {
      expect(TEMPLATE_NAMES.length).toBe(4);
      const ids = new Set();
      for (const name of TEMPLATE_NAMES) {
        const s = makeSpace(name);
        expect(s.id, `${name} 的 id`).toBeTruthy();
        expect(s.zoneId, `${name} 的 zoneId`).toBeTruthy();
        expect(s.radius).toBeGreaterThan(0);
        ids.add(s.id);
      }
      expect(ids.size).toBe(4); // id 不许撞
    });

    it('预置表里至少两个区有竖向日程', () => {
      expect(Object.keys(VerticalSchedulePresets).length).toBeGreaterThanOrEqual(2);
    });

    it('每座模板都能被 Manager 查到（不是"注册了但查不到"）', () => {
      const mgr = new InternalSpaceManager();
      for (const name of TEMPLATE_NAMES) mgr.register(makeSpace(name));
      mgr.attachZoneCenterResolver(() => ZC);
      let found = 0;
      for (const name of TEMPLATE_NAMES) {
        const s = makeSpace(name);
        const wc = s.getWorldCenter(ZC);
        if (mgr.spaceAtWorldPoint(wc.x, wc.z)?.space.id === s.id) found++;
      }
      expect(found).toBe(4);
    });
  });
});
