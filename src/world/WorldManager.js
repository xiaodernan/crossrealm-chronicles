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

/** 地形网格 520×620，可通行边界留 10 单位余量 */
export const WORLD_BOUNDS = { minX: -250, maxX: 250, minZ: -300, maxZ: 300 };

export class WorldManager {
  constructor(scene, dialog) {
    this.scene = scene;
    this.dialog = dialog;
    this.zones = [];
    this.pointsOfInterest = [];
    this.currentZone = null;
    this.hubPOIs = [];
    this.bounds = WORLD_BOUNDS;
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

    this.currentZone = null;
    this.applyHubAtmosphere(true);
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

    const signData = [
      { label: '灰白森林', dir: Math.PI * 0.85, color: 0x3d5c3a },
      { label: '魔法遗境', dir: Math.PI * 1.55, color: 0x5a3a8a },
      { label: '米勒荒原', dir: Math.PI * 0.15, color: 0x2a4a6a },
      { label: '破碎时线', dir: Math.PI * 1.0, color: 0x6a5a30 },
      { label: '混沌边境', dir: Math.PI * 1.25, color: 0x6a2040 },
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

    hub.position.set(0, this.getGroundHeight(0, 55), 55);
    this.scene.add(hub);

    const anchorY = this.getGroundHeight(0, 55);
    this.hubPOIs.push({
      id: 'hub-anchor',
      position: new THREE.Vector3(0, anchorY, 55),
      label: '触摸世界之锚',
      discovered: false,
      type: 'main',
      onInteract: () => {
        this.dialog.show(
          '世界之锚',
          '三块位面碎片在此交汇。穿越者的使命，是重铸锚点，阻止诸界崩塌。向西进入灰白森林，向南踏入魔法遗境，向东前往米勒荒原——每一处都藏有一枚位面碎片。'
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
    world.addCylinder({ x: 0, z: 55, r: 1.9, base: -1, top: 12 });
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

    let bestZone = null;
    let bestDist = Infinity;

    for (const zone of this.zones) {
      zone.update(dt);
      const d = zone.distanceToCenter(playerPos.x, playerPos.z);
      if (d < zone.radius && d < bestDist) {
        bestDist = d;
        bestZone = zone;
      }
    }

    const hubDist = Math.sqrt(playerPos.x ** 2 + (playerPos.z - 55) ** 2);
    if (hubDist < 50) {
      if (this.currentZone?.info?.name !== '交汇枢纽') {
        this.applyHubAtmosphere();
      }
    } else if (bestZone && bestZone !== this.currentZone) {
      this.applyZoneAtmosphere(bestZone);
    } else if (!bestZone && this.currentZone?.info?.name !== '交汇枢纽') {
      // 区际走廊：不属于任何位面，回到中性大气，避免上一个区域的雾色粘连
      this.applyZoneAtmosphere(null);
    }
  }

  applyHubAtmosphere(initial = false) {
    this.currentZone = { info: { name: '交汇枢纽', subtitle: '位面中心', description: '三条古径通向不同的位面碎片。世界之锚在此闪烁，等待被修复。' } };
    const fog = this.scene.fog;
    if (fog) {
      fog.color.setHex(0x7a92aa);
      fog.density = 0.0042;
    }
    window.dispatchEvent(new CustomEvent('zone-changed', { detail: { zone: this.currentZone.info, initial } }));
  }

  applyZoneAtmosphere(zone, initial = false) {
    if (!zone) {
      this.currentZone = null;
      const fog = this.scene.fog;
      if (fog) {
        fog.color.setHex(0x7a8ea6);
        fog.density = 0.004;
      }
      window.dispatchEvent(
        new CustomEvent('zone-changed', {
          detail: { zone: { name: '区际走廊', subtitle: '位面之间', description: '碎片之间的空旷走廊，风声代替区域的主题。' }, initial },
        })
      );
      return;
    }
    this.currentZone = zone;
    const fog = this.scene.fog;
    if (fog) {
      fog.color.setHex(zone.fogColor);
      fog.density = zone.fogDensity * 0.85;
    }

    window.dispatchEvent(
      new CustomEvent('zone-changed', {
        detail: { zone: zone.info, initial },
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
    const data = [
      { center: { x: 0, z: 55 }, radius: 45, color: '#888866', name: '交汇枢纽' },
      ...this.zones.map((z) => ({
        center: z.center,
        radius: z.radius,
        color: z.mapColor,
        name: z.info.name,
      })),
    ];
    return data;
  }

  setDungeonManager(dungeonManager) {
    this.dungeonManager = dungeonManager;
  }
}
