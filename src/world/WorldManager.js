import * as THREE from 'three';
import { FantasyZone } from './zones/FantasyZone.js';
import { MagicZone } from './zones/MagicZone.js';
import { SpaceZone } from './zones/SpaceZone.js';
import { VoidZone } from './zones/VoidZone.js';
import { AbyssZone } from './zones/AbyssZone.js';
import { GloomZone } from './zones/GloomZone.js';
import { RadiantZone } from './zones/RadiantZone.js';
import { WorldTerrain } from './WorldTerrain.js';
import { InternalSpaceManager, InternalSpaceTemplates } from './InternalSpace.js';
import { createVerticalScheduler } from './VerticalSchedule.js';
import { sampleGlobalHeightSmooth, sampleGroundNormal } from './TerrainHeight.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { CollisionWorld } from '../engine/Collision.js';
import { releaseSubtree } from '../engine/releaseSubtree.js';
import { makeUvCylinderGeometry } from '../engine/uvGeometry.js';
import { makeRegionSurfaceMaterial, applyRegionSurface } from './regionSurfaces.js';
import { ZONE_IDS, HUB_ZONE, CORRIDOR_ZONE, zoneIdAt, resolveZone } from '../content/ZoneIdentity.js';
import { paletteOf } from '../content/materialPalette.js';
import { applyShadow } from '../engine/shadowPolicy.js';

/** 地形网格 520×620，可通行边界留 10 单位余量 */
export const WORLD_BOUNDS = { minX: -250, maxX: 250, minZ: -300, maxZ: 300 };

export class WorldManager {
  constructor(scene, dialog) {
    this.scene = scene;
    this.dialog = dialog;
    this.zones = [];
    this.pointsOfInterest = [];
    /**
     * 当前区域：一定是带 `id` 的区域对象（五个位面之一，或 `HUB_ZONE` / `CORRIDOR_ZONE`）。
     * 外部只该问 `zoneId` 与 `zoneInfo`，不要伸手进这个字段改它。
     */
    this.currentZone = null;
    this.hubPOIs = [];
    /** 世界之锚石柱的石构材质（W-C5 切片6）：贴图库就绪后由 `applySurfaceTextures` 补挂 */
    this._hubSurfaceMat = null;
    this.bounds = WORLD_BOUNDS;
    this.internalSpaceManager = new InternalSpaceManager();
    this.verticalSchedulers = new Map(); // zoneId -> VerticalScheduler
  }

  /** 当前区域的稳定 id（修 B36：逻辑判据不再是中文显示名） */
  get zoneId() {
    return this.currentZone?.id ?? ZONE_IDS.UNKNOWN;
  }

  /** 当前区域的显示文案（UI 专用；`name` 与 `subtitle` 允许随时改字） */
  get zoneInfo() {
    return this.currentZone?.info ?? null;
  }

  /** 当前内部空间（若玩家在室内/建筑内则返回 InternalSpace 实例，否则 null） */
  get currentInternalSpace() {
    return this.internalSpaceManager?.currentSpace ?? null;
  }

  /** 当前内部空间的楼层（无则 0） */
  get internalSpaceFloor() {
    return this.internalSpaceManager?.getCurrentFloor() ?? 0;
  }

  /** 当前内部空间的雾效配置（若有） */
  get currentInternalFog() {
    return this.internalSpaceManager?.getCurrentFog() ?? null;
  }

  /** 当前区域的竖向调度器（W-B9 切片3） */
  get verticalScheduler() {
    return this.verticalSchedulers?.get(this.zoneId) ?? null;
  }

  /** 当前楼层（由竖向调度器管理） */
  get currentFloor() {
    return this.verticalScheduler?.currentFloor ?? 0;
  }

  /** 检查竖向日程解锁条件（任务/道具/等级） */
  _checkVerticalRequirement(req) {
    // 支持：任务完成、道具拥有、等级达到
    if (req.startsWith('quest:')) {
      const questId = req.slice(6);
      return this.game?.quests?.isCompleted?.(questId) ?? false;
    }
    if (req.startsWith('item:')) {
      const itemId = req.slice(5);
      return this.game?.player?.inventory?.has?.(itemId) ?? false;
    }
    if (req.startsWith('level:')) {
      const level = parseInt(req.slice(6), 10);
      return (this.game?.stats?.level ?? 0) >= level;
    }
    // 兼容支线任务 id 直接写
    if (req.startsWith('side-')) {
      return this.game?.quests?.isSideCompleted?.(req) ?? false;
    }
    return false;
  }

  build() {
    const fantasy = new FantasyZone(this.scene, { x: -200, z: 0 }, this.dialog);
    const magic = new MagicZone(this.scene, { x: 0, z: -180 }, this.dialog);
    const space = new SpaceZone(this.scene, { x: 200, z: 80 }, this.dialog);
    const voidZone = new VoidZone(this.scene, { x: 0, z: 220 }, this.dialog);
    const abyss = new AbyssZone(this.scene, { x: -200, z: 220 }, this.dialog);
    const gloom = new GloomZone(this.scene, { x: 180, z: 100 }, this.dialog);
    const radiant = new RadiantZone(this.scene, { x: -180, z: -160 }, this.dialog);

    this.zones = [fantasy, magic, space, voidZone, abyss, gloom, radiant];

    this.worldTerrain = new WorldTerrain(this.scene, this);
    this.worldTerrain.build();
    TextureLibrary.load().then((texLib) => {
      this.worldTerrain.applyTextures(texLib);
      // W-C5 切片6：世界构建不等贴图（上面所有区域与下面的地标都是同步立的），
      // 石构材质在这里补挂 —— basezones 各自登记、hub 石柱单独一份。
      this.applySurfaceTextures(texLib);
      // node 测试里真世界也会建（poi-identity 那一路），那里没有 window 可发事件 ——
      // 守卫在这里，否则这个 .then 会变成一发没人接的 unhandled rejection（整跑 exit 1）
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('textures-ready', { detail: { texLib } }));
      }
    });

    this.buildHubLandmarks();
    this.buildCollision();

    // 注册并构建内部空间（W-B9 切片2）
    // 模板拿到 `zoneCenter` 但**并不存它**（空间只记 `localCenter`，摆位发生在查询时），
    // 所以这里必须传区对象自己的那个 center —— 传手抄字面量就是第二份坐标，
    // 搬区时它会烂在原地（B120 同族：契约在调用处看着成立，其实没人读）。
    this.internalSpaceManager.register(InternalSpaceTemplates.gloomAncientShrine(gloom.center));
    this.internalSpaceManager.register(InternalSpaceTemplates.gloomTreeHollow(gloom.center));
    this.internalSpaceManager.register(InternalSpaceTemplates.radiantGrandHall(radiant.center));
    this.internalSpaceManager.register(InternalSpaceTemplates.radiantStarwatchTower(radiant.center));

    // W-B9 切片9（修 B121）：室内归属问的是**这座空间自己登记在谁名下**，所以要给它一个
    // "按区 id 现问中心"的问手 —— 挂的是问手不是坐标（同一个 `resolveZone` 出口，大气归属与
    // 室内归属拿到的是同一个载体，不会漂成两份）。
    this.internalSpaceManager.attachZoneCenterResolver((zoneId) => resolveZone(this.zones, zoneId)?.center ?? null);

    // 为每个区域构建内部空间
    for (const zone of this.zones) {
      this.internalSpaceManager.buildZone(zone.id, zone.center);
    }

    // 初始化竖向调度器（W-B9 切片3）
    for (const zone of this.zones) {
      const scheduler = createVerticalScheduler(zone.id, (req) => this._checkVerticalRequirement(req));
      if (scheduler) {
        this.verticalSchedulers.set(zone.id, scheduler);
      }
    }

    this.pointsOfInterest = [
      ...this.hubPOIs,
      ...fantasy.getPointsOfInterest(),
      ...magic.getPointsOfInterest(),
      ...space.getPointsOfInterest(),
      ...voidZone.getPointsOfInterest(),
      ...abyss.getPointsOfInterest(),
      ...gloom.getPointsOfInterest(),
      ...radiant.getPointsOfInterest(),
    ];
    this.assertPoiIdentity();

    this.currentZone = null;
    this.applyHubAtmosphere(true);
  }

  /**
   * 贴图库就绪后给石构补挂表面（W-C5 切片6，由 `build()` 里那个 `load().then` 调用）。
   * 世界构建是同步的、贴图是异步的：区域石柱在 `addSurfaceMaterial` 时多半拿着退路读数，
   * 这里把登记过的材质补成贴图态。返回挂上的总份数（hub 石柱 + 各区登记）。
   */
  applySurfaceTextures(texLib) {
    let 数 = applyRegionSurface(this._hubSurfaceMat, texLib) ? 1 : 0;
    for (const zone of this.zones) 数 += zone.applySurfaces(texLib);
    return 数;
  }

  /**
   * POI 身份自检（修 B45）。
   *
   * `BaseZone.addPOI` 已经要求每个 POI 显式带 kebab-case id，但它只看得到本区；
   * 位面之间撞 id、或致敬层绕过 addPOI 直接 push，都要在这里兜住。
   * 由 `build()` 与 `attachPopCultureZones()` 各调用一次 —— 两个"内容已完整"的点，
   * 同一段逻辑，不是两道会各自漂移的门。
   */
  assertPoiIdentity() {
    const seen = new Map();
    for (const poi of this.pointsOfInterest) {
      if (!poi.id) throw new Error(`WorldManager: POI「${poi.label}」没有 id，任务与日志将无法按 id 认领它`);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(poi.id)) {
        throw new Error(`WorldManager: POI id「${poi.id}」不符合 kebab-case —— id 是稳定身份，不得由显示名拼出`);
      }
      if (seen.has(poi.id)) {
        throw new Error(`WorldManager: POI id ${poi.id} 重复（「${seen.get(poi.id).label}」与「${poi.label}」），交互会打到另一个对象上`);
      }
      seen.set(poi.id, poi);
    }
    return seen.size;
  }

  buildHubLandmarks() {
    const hub = new THREE.Group();
    // 枢纽组挂在 `this` 上：`dispose()` 要拆得到它 —— 改前它是这一处的局部变量，
    // 外面谁也拿不到（"造了没人能拆"的一种）。
    this.hubGroup = hub;

    // W-C5 切片6：中央石柱换 drum 表面（与区域断柱同一套鼓形石段），几何换
    // `makeUvCylinderGeometry`（UV 以米计）。它是唯一不归 BaseZone 管的石构 ——
    // 材质存一份在这里，`TextureLibrary.load().then` 回来时由 `applySurfaceTextures` 补挂。
    this._hubSurfaceMat = makeRegionSurfaceMaterial({ color: paletteOf('stone.gray'), roughness: 0.85 });
    const pillar = new THREE.Mesh(makeUvCylinderGeometry(1.2, 1.8, 10, 8), this._hubSurfaceMat);
    pillar.position.y = 5;
    applyShadow(pillar, 'castOnly');
    hub.add(pillar);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4, 0),
      new THREE.MeshStandardMaterial({
        color: paletteOf('crystal.hub'),
        emissive: 0x224466,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.5,
      })
    );
    core.position.y = 10.5;
    hub.add(core);
    this.hubCore = core;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.12, 8, 48),
      new THREE.MeshStandardMaterial({
        color: paletteOf('metal.gilt'),
        emissive: 0x443300,
        emissiveIntensity: 0.4,
        metalness: 0.7,
        roughness: 0.3,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 10.5;
    hub.add(ring);

    // 同 `WorldDecorations._buildZoneGates`：这五行曾经各抄一个 `label` 区名，而牌是纯色块，
    // 谁也没读过 —— W-B4 切片3 删掉（显示用的区名只有一处：`content/ZoneIdentity.js`）
    const signData = [
      { dir: Math.PI * 0.85, color: 0x3d5c3a },
      { dir: Math.PI * 1.55, color: 0x5a3a8a },
      { dir: Math.PI * 0.15, color: 0x2a4a6a },
      { dir: Math.PI * 1.0, color: 0x6a5a30 },
      { dir: Math.PI * 1.25, color: 0x6a2040 },
    ];
    for (const s of signData) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 2.5, 6),
        new THREE.MeshStandardMaterial({ color: paletteOf('wood.post'), roughness: 0.9 })
      );
      post.position.set(Math.sin(s.dir) * 8, 1.25, Math.cos(s.dir) * 8);
      hub.add(post);

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.6, 0.1),
        new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.8 })
      );
      sign.position.set(Math.sin(s.dir) * 8, 2.5, Math.cos(s.dir) * 8);
      sign.lookAt(0, 2.5, 0);
      hub.add(sign);
    }

    hub.position.set(HUB_ZONE.center.x, this.getGroundHeight(HUB_ZONE.center.x, HUB_ZONE.center.z), HUB_ZONE.center.z);
    this.scene.add(hub);

    const anchorY = this.getGroundHeight(HUB_ZONE.center.x, HUB_ZONE.center.z);
    this.hubPOIs.push({
      id: 'hub-anchor',
      position: new THREE.Vector3(HUB_ZONE.center.x, anchorY, HUB_ZONE.center.z),
      label: 'hub_poi_anchor_label',
      type: 'main',
      onInteract: () => {
        this.dialog.show(
          '世界之锚',
          '三块位面碎片在此交汇。穿越者的使命，是重铸锚点，阻止诸界崩塌。向西进入灰白森林，向南踏入霍格沃兹遗境，向东前往米勒荒原——每一处都藏有一枚位面碎片。'
        );
        window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'hub-anchor', title: '世界之锚', text: '三界交汇的核心。' } }));
      },
    });
  }

  /**
   * 汇总所有区域与枢纽的碰撞体（区域用本地坐标，这里平移到世界坐标），
   * 加上世界边界，构建一次性的空间哈希。
   */
  buildCollision() {
    const world = new CollisionWorld(16);
    this.collision = world;
    for (const zone of this.zones) {
      for (const c of zone.colliders ?? []) {
        world.add({ ...c, x: c.x + zone.center.x, z: c.z + zone.center.z, rotated: !!c.rot });
      }
    }
    // W-B9 切片2：添加内部空间碰撞体
    for (const zone of this.zones) {
      const spaces = this.internalSpaceManager?.spacesByZone?.get(zone.id) ?? [];
      for (const space of spaces) {
        for (const c of space.colliders ?? []) {
          const wc = space.getWorldCenter(zone.center);
          const worldBase = space.getWorldBaseHeight(zone.center);
          if (c.shape === 'cyl') {
            world.addCylinder({
              x: wc.x + c.lx,
              z: wc.z + c.lz,
              r: c.r,
              base: worldBase + c.base,
              top: worldBase + c.top,
              kind: c.kind,
            });
          } else if (c.shape === 'box') {
            world.addBox({
              x: wc.x + c.lx,
              z: wc.z + c.lz,
              hx: c.hx,
              hz: c.hz,
              base: worldBase + c.base,
              top: worldBase + c.top,
              rot: c.rot,
              kind: c.kind,
            });
          }
        }
      }
    }
    // 世界之锚石柱
    world.addCylinder({ x: HUB_ZONE.center.x, z: HUB_ZONE.center.z, r: 1.9, base: -1, top: 12 });
    // 边界墙：贴在地形网格内侧，避免走出虚空
    const T = 40;
    const b = WORLD_BOUNDS;
    const wallTop = 400;
    world.addBox({ x: 0, z: b.minZ - T / 2, hx: (b.maxX - b.minX) / 2 + T, hz: T / 2, base: -200, top: wallTop });
    world.addBox({ x: 0, z: b.maxZ + T / 2, hx: (b.maxX - b.minX) / 2 + T, hz: T / 2, base: -200, top: wallTop });
    world.addBox({ x: b.minX - T / 2, z: 0, hx: T / 2, hz: (b.maxZ - b.minZ) / 2 + T, base: -200, top: wallTop });
    world.addBox({ x: b.maxX + T / 2, z: 0, hx: T / 2, hz: (b.maxZ - b.minZ) / 2 + T, base: -200, top: wallTop });
    world.build();
  }

  /**
   * 室内归属**不再**经过"先把这个点收敛成一个区、再去那个区名下找空间"（W-B9 切片9，修 B121）。
   * 改前那两步就是症状：区半径互相重叠（space × gloom 的重叠带宽实测 291.7 米），`zoneIdAt`
   * 取最近 ⇒ `gloom-ancient-shrine` 整片足迹被判给 space，而 space 名下零座室内 ⇒ 那座神殿的
   * 地板永远不回答。现在的判据只有一条：这个点落不落进**某座空间自己的范围**，
   * 用登记它的那个区的中心换算 —— 由 `internalSpaceManager.spaceAtWorldPoint` 回答（问手在
   * `build()` 里挂上，见 `attachZoneCenterResolver`）。
   */
  getGroundHeight(x, z) {
    if (this.dungeonManager?.isInside()) {
      return this.dungeonManager.getGroundHeight(x, z);
    }
    // W-B9 切片7（修 B120）：室内高度按**这个点**回答。
    // 改前问的是"玩家上一帧站的那座空间"那份缓存 —— 它只按玩家的上一帧位置刷新，而这条路径要回答的
    // 点常常不是玩家站的地方：快速旅行的目的地、副本出口、敌人脚下、装饰落位、天气粒子。
    // 于是"玩家刚站过晨曦大厅"会让几百米外那个点也拿到大厅的地板高度，
    // 而生产的区域中心又不带 `y`，那个高度还是 NaN。两条叠在一起就是玩家侧的说法：
    // NaN 地面 → 传送把 NaN 写进 `position` → 阻尼相机 `lerp` 从 NaN 出发再也回不来 →
    // 视锥六个面全 NaN → 整场剔除失效。
    const internalHeight = this.internalSpaceManager.getInternalHeightAtWorldPoint(x, z);
    if (internalHeight !== null) return internalHeight;
    return sampleGlobalHeightSmooth(x, z, this.zones);
  }

  getGroundNormal(x, z) {
    if (this.dungeonManager?.isInside()) {
      return { x: 0, y: 1, z: 0 };
    }
    // 内部空间内地面法向暂时返回向上（可按需扩展）—— 按点问、不问玩家上一帧（B120），
    // 且归属由空间自己的范围回答（B121，与 `getGroundHeight` 同一条判据）
    if (this.internalSpaceManager?.spaceAtWorldPoint(x, z)) return { x: 0, y: 1, z: 0 };
    return sampleGroundNormal(x, z, this.zones);
  }

  update(dt, playerPos) {
    if (this.hubCore) {
      this.hubCore.rotation.y += dt * 0.6;
      this.hubCore.rotation.x += dt * 0.2;
    }
    for (const zone of this.zones) zone.update(dt);
    this.internalSpaceManager.update(dt);

    // 刷新竖向调度器（W-B9 切片3）
    for (const scheduler of this.verticalSchedulers.values()) {
      scheduler.refresh();
    }

    // 归属由几何反推（`zoneIdAt`：枢纽优先 → 最近区 → 走廊），不再各处手写一遍距离比较
    const id = zoneIdAt(playerPos, this.zones);
    const zone = resolveZone(this.zones, id);

    // W-B9 切片7（修 B120）：室内归属**每帧**刷新。
    // 改前这一句在 `zone === this.currentZone` 的早退之后 —— 于是"走进大厅再走出来"这种
    // 不跨区的移动永远不会重算，`currentSpace` 就把玩家已经离开的那座空间一直留着，
    // 而它回答的是雾（`currentInternalFog`）、层号（`internalSpaceFloor`）、地面法向。
    // W-B9 切片9（修 B121）：这里不再把 `id`（大气归属）递给管理器 —— 递过去就等于把室内归属
    // 交给区半径去收敛，站在神殿里判给 space、于是 `currentSpace` 永远是 null，雾与层号一起丢。
    this.internalSpaceManager.updateCurrent(playerPos.x, playerPos.z);

    if (!zone || zone === this.currentZone) return;

    if (id === ZONE_IDS.HUB) this.applyHubAtmosphere();
    else this.applyZoneAtmosphere(zone);
  }

  applyHubAtmosphere(initial = false) {
    // 修 B35：这里以前塞的是临时伪造对象 `{ info: { name: '交汇枢纽' } }`，
    // 于是枢纽内任何按 `zone.id / radius / colliders` 取用的代码都静默拿到 undefined
    this.currentZone = HUB_ZONE;
    // 雾不再由这里写（W-C4 切片2）：区域大气参数表在 content/zoneAtmosphere.js，
    // 落 fog 归 effects/ZoneFog.js 每帧平滑驱动 —— 改前这里写的值会被
    // zone-changed 同步链上下一个写入者（WeatherSystem）覆盖
    window.dispatchEvent(new CustomEvent('zone-changed', {
      detail: { zone: HUB_ZONE.info, zoneId: HUB_ZONE.id, initial },
    }));
  }

  applyZoneAtmosphere(zone, initial = false) {
    if (!zone || zone === CORRIDOR_ZONE) {
      // 区际走廊：不属于任何位面，回到中性大气，避免上一个区域的雾色粘连。
      // 它同样是一份真描述对象（带 id），而不是 null —— 读方要能问出"我在哪"
      this.currentZone = CORRIDOR_ZONE;
      window.dispatchEvent(new CustomEvent('zone-changed', {
        detail: { zone: CORRIDOR_ZONE.info, zoneId: CORRIDOR_ZONE.id, initial },
      }));
      return;
    }
    this.currentZone = zone;
    // 雾不再由这里写（W-C4 切片2）：zone.fogColor / fogDensity 的直写退场，
    // 参数收口进 content/zoneAtmosphere.js 的表（改前那组值连同 0.85 那个
    // 没有出处的系数，被 WeatherSystem 的覆盖写当帧冲掉，从没生效过）

    window.dispatchEvent(
      new CustomEvent('zone-changed', {
        detail: { zone: zone.info, zoneId: zone.id ?? ZONE_IDS.UNKNOWN, initial },
      })
    );
  }

  getNearestPointOfInterest(pos, radius) {
    let nearest = null;
    let minDist = radius;

    for (const poi of this.pointsOfInterest) {
      const dx = pos.x - poi.position.x;
      const dz = pos.z - poi.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= minDist) {
        minDist = dist;
        nearest = poi;
      }
    }
    return nearest;
  }

  getZoneMapData() {
    return [
      {
        id: HUB_ZONE.id,
        center: HUB_ZONE.center,
        radius: HUB_ZONE.mapRadius,
        color: HUB_ZONE.mapColor,
        name: HUB_ZONE.info.name,
      },
      ...this.zones.map((z) => ({
        id: z.id ?? ZONE_IDS.UNKNOWN,
        center: z.center,
        radius: z.radius,
        color: z.mapColor,
        name: z.info.name,
      })),
    ];
  }

  setDungeonManager(dungeonManager) {
    this.dungeonManager = dungeonManager;
  }

  /**
   * 拆干净：地形 + 七座区 + 枢纽组（W-C1 切片3f）。
   *
   * 为什么现在才有：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
   * 而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
   * **整个世界**造的资源（地表 / 崖壁 / 七座区的树石桥塔 / 致敬层那四族增强器挂在区上的装饰）
   * **一份都不还**。
   *
   * **七座区的装饰归位面管**：致敬层那四个增强器（`world/PopCultureZoneEnhancer*`）
   * 是**函数**，它们的网格挂在区的那一组上 ⇒ 位面的 `dispose()` 一并释放 ✓
   * （`BaseZone.dispose()` 是继承来的 —— 七座区共用同一口径）。
   *
   * **四座内部空间**（神堂 / 树洞 / 大厅 / 星望塔）的网格同样挂在区的那一组上，
   * 它们自己的 `group` 是空的 ⇒ 不必单独拆。
   */
  dispose() {
    this.worldTerrain?.dispose?.();
    for (const zone of this.zones) zone.dispose?.();
    this.zones.length = 0;
    if (this.hubGroup) {
      this.scene.remove(this.hubGroup);
      releaseSubtree(this.hubGroup);
      this.hubGroup = null;
    }
  }
}
