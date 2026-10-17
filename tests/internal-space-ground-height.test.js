/**
 * W-B9 切片7（修 B120）：室内高度这一条路的**生产形状**门禁
 *
 * ## 为什么上一片的门禁没拦住
 * `tests/internal-space.test.js` 那八层全绿，玩家侧的现象却是"在霍格沃兹遗境驻留后主视锥
 * 看见一切、draw call 常驻 1448"。差在**形状**：那片门禁喂给高度函数的区域中心是自己造的
 * `{ x: 180, y: 12, z: 100 }`，**带了 y**；生产的区域中心从来没有 y ——
 * 于是 `zoneCenter.y + baseHeight + floor * floorHeight` 在生产里恒为 NaN、在测试里恒为有限。
 * 契约在 fixture 里成立、在世界上不成立（B100 修的是"少传一个参数"，它的尺子恰好把
 * "这个参数该长什么样"一起放过去了）。
 *
 * ## 这一片只问生产里真实存在的东西
 * 全部用例都跑在 `WorldManager.build()` 出来的真世界上（node 侧用桩 scene/dialog/window），
 * 区域中心从世界本身拿，不出现手造的坐标。四层判据：
 * 1. **基准面的载体**：`zone.center` 必须带有限的 `y`。而"哪个对象是 `zone.center`"有两条路 ——
 *    `this.zones` 里的 Zone 实例，与 `resolveZone` 优先返回的 `ZoneIdentity` 静态描述
 *    （幽暗林地、辉煌圣域真正走的是后者）。两份载体必须逐分量相等，否则搬区时只改烂一份。
 * 2. **按点回答**：`getGroundHeight(x, z)` 对**这个点**求室内空间，不再问玩家上一帧留下的缓存。
 * 3. **每帧刷新归属**：走出去那一帧不许因为"区没变"就早退。
 * 4. **处处有限**：整张可通行网格上 `getGroundHeight` 都是有限数。这一条是玩家侧那半条链的
 *    现场证据 —— NaN 地面 → 落不实地 → 任意一次以地面为基准的传送把 NaN 写进 `position` →
 *    阻尼相机从 NaN 出发再也回不来 → 视锥六个面全 NaN → 剔除整体失效。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorldManager, WORLD_BOUNDS } from '../src/world/WorldManager.js';
import { sampleGlobalHeightSmooth } from '../src/world/TerrainHeight.js';
import { HUB_ZONE, ZONE_IDS, resolveZone, zoneIdAt } from '../src/content/ZoneIdentity.js';

const makeScene = () => ({ add() {}, remove() {} });
const makeDialog = () => ({ show() {}, toast() {} });

/** 拥有室内空间的区，由世界自己的登记表推导（不手抄区名） */
const 有室内的区 = (world) => [...world.internalSpaceManager.spacesByZone.keys()];

/** 生产里站在某区时真正拿到的那个 `zone.center` —— 不一定是实例（① 就是钉这件事） */
const 区的载体 = (world, id) => resolveZone(world.zones, id);

/** 某座空间在世界里的中心，用**它所属区**在生产里真正拿到的那个 center 算 */
const 空间中心 = (world, space) => space.getWorldCenter(区的载体(world, space.zoneId).center);

/** 这座空间那一层地板在世界里的高度（从模板自己的字段推出来，不抄数字） */
const 室内地板 = (world, space) => {
  const center = 区的载体(world, space.zoneId).center;
  return center.y + space.baseHeight + space.floor * space.floorHeight + space.sampleHeightInternal(0, 0);
};

const 大厅 = (world) => world.internalSpaceManager.spacesByZone.get('radiant')
  .find((s) => s.id === 'radiant-grand-hall');

describe('B120：室内高度在生产形状下成立', () => {
  let world;

  beforeEach(() => {
    globalThis.window = { addEventListener() {}, dispatchEvent() { return true; } };
    globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
    world = new WorldManager(makeScene(), makeDialog());
    world.build();
  });

  afterEach(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });

  describe('① 基准面的载体', () => {
    it('七个区的实例中心都带有限的 y（室内高度那条加法要读它）', () => {
      expect(world.zones.length).toBe(7);
      for (const zone of world.zones) {
        expect(Number.isFinite(zone.center?.y), `${zone.id} 的 center.y 不是有限数`).toBe(true);
      }
    });

    it('室内高度真正读的是 `resolveZone` 那个对象，它也带有限的 y', () => {
      const ids = 有室内的区(world);
      // 样本下限：这条判据不许在"一座空间都没注册"的空世界上假绿
      expect(ids.length, '登记表里的区数').toBeGreaterThanOrEqual(2);
      expect(ids).toEqual(expect.arrayContaining(['gloom', 'radiant']));
      for (const id of ids) {
        const carrier = 区的载体(world, id);
        expect(Number.isFinite(carrier.center?.y),
          `站在 ${id} 时 zone.center 就是 ${carrier.id} 这份描述，缺 y 得到的不是"差一点"而是 NaN`).toBe(true);
      }
    });

    it('两份载体逐分量相等（搬区时不会只改烂一份）', () => {
      for (const id of 有室内的区(world)) {
        const instance = world.zones.find((z) => z.id === id);
        const carrier = 区的载体(world, id);
        expect(carrier, `${id} 应当解析得出`).toBeTruthy();
        for (const k of ['x', 'y', 'z']) {
          expect(carrier.center[k], `${id} 的 center.${k}：描述对象与实例不是同一个数`)
            .toBe(instance.center[k]);
        }
      }
    });
  });

  describe('② 走进室内：高度由本层基准 + 局部采样推出来', () => {
    it('每座空间**都认得出**，中心点高度 == 区域基准 y + baseHeight + floor*层高 + 局部采样(0,0)', () => {
      const 全部 = [...world.internalSpaceManager.spacesByZone.values()].flat();
      expect(全部.length, '四座模板都要注册进真世界').toBe(4);
      let 认出 = 0;
      for (const space of 全部) {
        const wc = 空间中心(world, space);
        const 期望 = 室内地板(world, space);
        const 实际 = world.getGroundHeight(wc.x, wc.z);
        // B121 曾在这里留一格豁免：`gloom-ancient-shrine` 的世界中心 (200, 70) 离 space 心只有
        // 10.0 米、离 gloom 心 36.1 米，"先把点收敛成一个区"把它整片足迹判给了 space，
        // 于是那座神殿的地板永远不回答。豁免已随修复删除 —— 四座就是四座。
        expect(实际, `${space.id} 中心点高度`).toBeCloseTo(期望, 9);
        认出++;
      }
      expect(认出, '认得出的室内空间数').toBe(全部.length);
    });

    it('大厅中心的高度**不等于**全球地形采样（室内分支真的活着，不是恒走室外）', () => {
      const hall = 大厅(world);
      const wc = 空间中心(world, hall);
      expect(world.getGroundHeight(wc.x, wc.z))
        .not.toBeCloseTo(sampleGlobalHeightSmooth(wc.x, wc.z, world.zones), 6);
    });
  });

  describe('③ 走到室外：立刻回到全球地形，玩家站过的缓存不回答别人的点', () => {
    it('半径外 5 米那个点 == `sampleGlobalHeightSmooth`，同区内也不带室内地板', () => {
      const hall = 大厅(world);
      const wc = 空间中心(world, hall);
      const 外 = { x: wc.x + hall.radius + 5, z: wc.z };
      expect(区的载体(world, hall.zoneId).center, '室外那点仍在本区（否则这条测的是走廊）')
        .toBeTruthy();
      expect(world.getGroundHeight(外.x, 外.z))
        .toBeCloseTo(sampleGlobalHeightSmooth(外.x, 外.z, world.zones), 9);
    });

    it('缓存落在大厅时，几百米外那个点拿的不是大厅地板', () => {
      const hall = 大厅(world);
      const wc = 空间中心(world, hall);
      world.internalSpaceManager.updateCurrent(wc.x, wc.z);
      expect(world.internalSpaceManager.currentSpace, '先把缓存落到大厅').toBe(hall);
      const 远处 = { x: wc.x + 600, z: wc.z + 600 };
      const 地面 = world.getGroundHeight(远处.x, 远处.z);
      expect(Number.isFinite(地面), '远处的地面必须是有限数').toBe(true);
      expect(地面).not.toBeCloseTo(室内地板(world, hall), 6);
    });
  });

  describe('④ 每帧刷新归属（不是只在跨区那一帧）', () => {
    it('走进大厅再走到同区的室外：`currentSpace` 归零，室内雾跟着退场', () => {
      const hall = 大厅(world);
      const wc = 空间中心(world, hall);
      world.update(1 / 60, wc);
      expect(world.internalSpaceManager.currentSpace, '站在大厅里，缓存应当是那座大厅').toBe(hall);
      expect(world.currentInternalFog, '室内雾应当认得出').toBeTruthy();

      const 外 = { x: wc.x + hall.radius + 5, z: wc.z };
      world.update(1 / 60, 外);
      // 改前：这一帧 `zoneIdAt` 还是 radiant、`zone === this.currentZone` 直接早退，
      // 缓存里留着玩家已经离开的那座大厅 —— 雾、层号、地面法向全按室内回答。
      expect(world.internalSpaceManager.currentSpace, '走出去了，缓存必须归零').toBe(null);
      expect(world.currentInternalFog).toBe(null);
    });
  });

  describe('⑤ 处处有限（玩家侧那半条链的现场证据）', () => {
    it('整张可通行网格上 `getGroundHeight` 没有一处 NaN / Inf', () => {
      const 坏 = [];
      let 采样 = 0;
      for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 25) {
        for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 25) {
          采样++;
          const h = world.getGroundHeight(x, z);
          if (!Number.isFinite(h)) 坏.push({ x, z, h: String(h) });
        }
      }
      // 样本下限：扫不到点的"全绿"不算证据
      expect(采样).toBeGreaterThanOrEqual(500);
      expect(坏.slice(0, 8), `非有限地面的前 8 个采样点（共 ${坏.length} 个）`).toEqual([]);
    });

    it('四座空间的中心点各自单独再查一次（网格步长未必正好落在中心上）', () => {
      for (const space of [...world.internalSpaceManager.spacesByZone.values()].flat()) {
        const wc = 空间中心(world, space);
        expect(Number.isFinite(world.getGroundHeight(wc.x, wc.z)), `${space.id} 中心点`).toBe(true);
      }
    });
  });

  describe('⑥ 枢纽那份二维描述不许喂进室内高度那条加法', () => {
    it('枢纽的 center 仍然只有 x/z —— 所以闸门只能用"该区有没有注册空间"，不能用"有没有 y"', () => {
      expect(HUB_ZONE.center.y, '枢纽本来就没有室内，这里刻意不补 y').toBeUndefined();
    });

    it('站在枢纽中心：拿的是全球地形，且不因为缺 y 当场抛', () => {
      const 枢纽内 = { x: HUB_ZONE.center.x, z: HUB_ZONE.center.z };
      expect(zoneIdAt(枢纽内, world.zones)).toBe(ZONE_IDS.HUB);
      expect(world.getGroundHeight(枢纽内.x, 枢纽内.z))
        .toBeCloseTo(sampleGlobalHeightSmooth(枢纽内.x, 枢纽内.z, world.zones), 9);
    });
  });
});
