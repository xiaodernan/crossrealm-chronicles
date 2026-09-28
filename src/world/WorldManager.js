import * as THREE from 'three';
import { FantasyZone } from './zones/FantasyZone.js';
import { MagicZone } from './zones/MagicZone.js';
import { SpaceZone } from './zones/SpaceZone.js';
import { VoidZone } from './zones/VoidZone.js';
import { AbyssZone } from './zones/AbyssZone.js';
import { WorldTerrain } from './WorldTerrain.js';
import { sampleGlobalHeight, sampleGlobalHeightSmooth, sampleGroundNormal } from './TerrainHeight.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { CollisionWorld } from '../engine/Collision.js';
import { ZONE_IDS, HUB_ZONE, CORRIDOR_ZONE, zoneIdAt, resolveZone } from '../content/ZoneIdentity.js';

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
    this.bounds = WORLD_BOUNDS;
  }

  /** 当前区域的稳定 id（修 B36：逻辑判据不再是中文显示名） */
  get zoneId() {
    return this.currentZone?.id ?? ZONE_IDS.UNKNOWN;
  }

  /** 当前区域的显示文案（UI 专用；`name` 与 `subtitle` 允许随时改字） */
  get zoneInfo() {
    return this.currentZone?.info ?? null;
  }

  build() {
    const fantasy = new FantasyZone(this.scene, { x: -200, z: 0 }, this.dialog);
    const magic = new MagicZone(this.scene, { x: 0, z: -180 }, this.dialog);
    const space = new SpaceZone(this.scene, { x: 200, z: 80 }, this.dialog);
    const voidZone = new VoidZone(this.scene, { x: 0, z: 220 }, this.dialog);
    const abyss = new AbyssZone(this.scene, { x: -200, z: 220 }, this.dialog);

    this.zones = [fantasy, magic, space, voidZone, abyss];

    this.worldTerrain = new WorldTerrain(this.scene, this);
    this.worldTerrain.build();
    TextureLibrary.load().then((texLib) => {
      this.worldTerrain.applyTextures(texLib);
      window.dispatchEvent(new CustomEvent('textures-ready', { detail: { texLib } }));
    });

    this.buildHubLandmarks();
    this.buildCollision();

    this.pointsOfInterest = [
      ...this.hubPOIs,
      ...fantasy.getPointsOfInterest(),
      ...magic.getPointsOfInterest(),
      ...space.getPointsOfInterest(),
      ...voidZone.getPointsOfInterest(),
      ...abyss.getPointsOfInterest(),
    ];
    this.assertPoiIdentity();

    this.currentZone = null;
    this.applyHubAtmosphere(true);
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

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.8, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.85 })
    );
    pillar.position.y = 5;
    pillar.castShadow = true;
    hub.add(pillar);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4, 0),
      new THREE.MeshStandardMaterial({
        color: 0x88ccff,
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
        color: 0xc9a962,
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
        new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.9 })
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
      label: '触摸世界之锚',
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

  getGroundHeight(x, z) {
    if (this.dungeonManager?.isInside()) {
      return this.dungeonManager.getGroundHeight(x, z);
    }
    return sampleGlobalHeightSmooth(x, z, this.zones);
  }

  getGroundNormal(x, z) {
    if (this.dungeonManager?.isInside()) {
      return { x: 0, y: 1, z: 0 };
    }
    return sampleGroundNormal(x, z, this.zones);
  }

  update(dt, playerPos) {
    if (this.hubCore) {
      this.hubCore.rotation.y += dt * 0.6;
      this.hubCore.rotation.x += dt * 0.2;
    }
    for (const zone of this.zones) zone.update(dt);

    // 归属由几何反推（`zoneIdAt`：枢纽优先 → 最近区 → 走廊），不再各处手写一遍距离比较
    const id = zoneIdAt(playerPos, this.zones);
    const zone = resolveZone(this.zones, id);
    if (!zone || zone === this.currentZone) return;
    if (id === ZONE_IDS.HUB) this.applyHubAtmosphere();
    else this.applyZoneAtmosphere(zone);
  }

  applyHubAtmosphere(initial = false) {
    // 修 B35：这里以前塞的是临时伪造对象 `{ info: { name: '交汇枢纽' } }`，
    // 于是枢纽内任何按 `zone.id / radius / colliders` 取用的代码都静默拿到 undefined
    this.currentZone = HUB_ZONE;
    const fog = this.scene.fog;
    if (fog) {
      fog.color.setHex(0x7a92aa);
      fog.density = 0.0042;
    }
    window.dispatchEvent(new CustomEvent('zone-changed', {
      detail: { zone: HUB_ZONE.info, zoneId: HUB_ZONE.id, initial },
    }));
  }

  applyZoneAtmosphere(zone, initial = false) {
    const fog = this.scene.fog;
    if (!zone || zone === CORRIDOR_ZONE) {
      // 区际走廊：不属于任何位面，回到中性大气，避免上一个区域的雾色粘连。
      // 它同样是一份真描述对象（带 id），而不是 null —— 读方要能问出"我在哪"
      this.currentZone = CORRIDOR_ZONE;
      if (fog) {
        fog.color.setHex(0x7a8ea6);
        fog.density = 0.004;
      }
      window.dispatchEvent(new CustomEvent('zone-changed', {
        detail: { zone: CORRIDOR_ZONE.info, zoneId: CORRIDOR_ZONE.id, initial },
      }));
      return;
    }
    this.currentZone = zone;
    if (fog) {
      fog.color.setHex(zone.fogColor);
      fog.density = zone.fogDensity * 0.85;
    }

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
}
