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
 *
 * ## 切片E（修 B126）改了两条的**口径**，没削它们的牙口
 *
 * 室内那一档此前只在占地里整体替换地面，现在它是**全局高度场的一项**，占地外多出一条
 * smoothstep 过渡带（`InternalSpace.rimBand`）。于是：
 * - ② 原来一次比到底（`getGroundHeight(中心)` 精确等于那一层地板）。现在**精确**归**裸读数**
 *   `sampleGlobalHeight`（占地内权重恒 1，混合是原子的），脚那条五抽头读数只许与地板差不过
 *   一阶上坎 —— 抽头把带外的自然地掺进来一点是场的口径，不是"室内不认"。实测差 0.120 米。
 * - ③ 原来的取样点写在"半径外 5 米"，那一格如今落在过渡带里。点挪到 `radius + rimBand + 5`，
 *   比的仍是**不带花名册**的那一份：带外交回自然地这件事一个字没松。
 * - ④ 反倒多了一个免费见证：占地外、带宽 40 % 那一点，**归属**已经归零（缓存 null、雾 null），
 *   **地面**却还掺着室内那一档（差值非零）。两条判据各走各的，谁也没顺着谁放宽。
 *   取样点按带宽的比例取、不按米取，并当场验一次"权重确实在 0 与 1 之间"——
 *   写死"半径外 5 米"的话，带宽哪天改窄过 5 米，这一条会悄悄跑到带外去量（臂11 实测红过一回）。
 *
 * ## 切片E 的落刀记录（本片吃到的）
 *
 * 整批五刀在 `tests/interior-ground-field.test.js` 头部那张表。这里只记本片：
 * 臂12（`blendInterior` 不再掺）⇒ ② 两条用例 ＋ ④ 那一句"带内还掺着"共 **3 红，无漏无超出**；
 * 臂11（四条带统一砍半）修口径之前红在 ④，改成带宽比例取样之后 **0 红** ——
 * 那一条量的从来不是带宽够不够宽，那是 `interior-ground-field` ③ 的活。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorldManager, WORLD_BOUNDS } from '../src/world/WorldManager.js';
import { sampleGlobalHeight, sampleGlobalHeightSmooth } from '../src/world/TerrainHeight.js';
import { playerStepUp } from './helpers/productionReadings.js';
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
    it('每座空间**都认得出**：裸读数正是那一层地板，玩家那条五抽头读数与它差不过一阶上坎', () => {
      const 全部 = [...world.internalSpaceManager.spacesByZone.values()].flat();
      expect(全部.length, '四座模板都要注册进真世界').toBe(4);
      const 上坎 = playerStepUp();
      let 认出 = 0;
      for (const space of 全部) {
        const wc = 空间中心(world, space);
        const 期望 = 室内地板(world, space);
        // B126 之后室内那一档是**全局高度场的一项**，玩家脚下走的是五抽头平滑那一份：
        // 平台中心精确等于地板这件事归**裸读数**管（weight 在占地内恒 1，混合是原子的），
        // 抽头把带外的自然地掺进来一点，是场的口径，不是"室内不认"。
        const 裸 = sampleGlobalHeight(wc.x, wc.z, world.zones, world.internalSpaceManager);
        expect(裸, `${space.id} 中心点裸读数`).toBeCloseTo(期望, 9);
        const 实际 = world.getGroundHeight(wc.x, wc.z);
        // 脚这条路的接线：玩家读的就是**带花名册的**那条平滑场，漏递一项这里当场分家
        expect(实际, `${space.id} 中心点：getGroundHeight 没把室内递进高度场`)
          .toBeCloseTo(sampleGlobalHeightSmooth(wc.x, wc.z, world.zones, world.internalSpaceManager), 9);
        expect(Math.abs(实际 - 期望), `${space.id} 中心点：五抽头与那一层地板分了 ${Math.abs(实际 - 期望).toFixed(3)} 米 `
          + `> 一阶上坎 ${上坎} ⇒ 平滑把过渡带自然地掺过了头，玩家站在室内地板上却飘着一阶台阶`)
          .toBeLessThan(上坎);
        // B121 曾在这里留一格豁免：`gloom-ancient-shrine` 的世界中心 (200, 70) 离 space 心只有
        // 10.0 米、离 gloom 心 36.1 米，"先把点收敛成一个区"把它整片足迹判给了 space，
        // 于是那座神殿的地板永远不回答。豁免已随修复删除 —— 四座就是四座。
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
    it('过渡带外 5 米那个点 == 不带花名册的 `sampleGlobalHeightSmooth`，同区内也不带室内地板', () => {
      const hall = 大厅(world);
      const wc = 空间中心(world, hall);
      // B126 之前"半径外"就等于室外；现在半径外那一圈是**地面过渡带**，地上还掺着室内那一档。
      // 这条要量的是"带外交回自然地"，所以取样点必须走到 `radius + rimBand` 之外。
      const 外 = { x: wc.x + hall.radius + hall.rimBand + 5, z: wc.z };
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

      const 外 = { x: wc.x + hall.radius + hall.rimBand * 0.4, z: wc.z };
      // 这一点刻意留在**地面过渡带**里（占地半径之外、带宽之内，按带宽的比例取，不按米取 ——
      // 写死"半径外 5 米"的话，带宽一旦改窄过 5 米这条就悄悄跑到带外去了）：
      // 归属认的是占地，地面认的是 `[radius, radius + rimBand]` 那一段混合。两条判据分家这件事
      // 要有人看着 —— 顺着带宽把归属也放宽，玩家站在厅外就还泡在室内雾里。
      const 权重 = hall.groundWeightAt(外.x, 外.z, 区的载体(world, hall.zoneId).center);
      expect(权重 > 0 && 权重 < 1, `${hall.id} 那个点应当真在过渡带中段（权重 ${权重}）：`
        + '带外就退回"交回自然地"那一条，腹地则归属也还在室内').toBe(true);
      world.update(1 / 60, 外);
      // 改前：这一帧 `zoneIdAt` 还是 radiant、`zone === this.currentZone` 直接早退，
      // 缓存里留着玩家已经离开的那座大厅 —— 雾、层号、地面法向全按室内回答。
      expect(world.internalSpaceManager.currentSpace, '走出去了，缓存必须归零').toBe(null);
      expect(world.currentInternalFog, '归属归零了，雾也必须归零（带宽不参与归属判据）').toBe(null);
      // 同一帧的地面却**还掺着**室内那一档：把这一档从场上抹掉，下面这个差就变成 0
      expect(Math.abs(world.getGroundHeight(外.x, 外.z)
        - sampleGlobalHeightSmooth(外.x, 外.z, world.zones)),
      '带内那一点的地面应当掺着室内那一档（归属与地面两条判据各走各的）').toBeGreaterThan(0);
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
