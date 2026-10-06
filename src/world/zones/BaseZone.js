import * as THREE from 'three';
import { applyShadow } from '../../engine/shadowPolicy.js';

export class BaseZone {
  constructor(scene, center, config) {
    this.scene = scene;
    this.center = center;
    this.radius = config.radius ?? 120;
    this.group = new THREE.Group();
    this.group.position.set(center.x, 0, center.z);
    scene.add(this.group);

    this.info = config.info;
    /**
     * 区域的稳定身份（`world/ZoneIdentity.js`）。id 缺失是接线错误而不是可容忍的
     * 疏漏：所有按 id 找区、判分支的代码会静默落到 UNKNOWN，所以在这里当场喊出来。
     */
    this.id = this.info?.id ?? null;
    if (!this.id) console.warn(`[zone] ${this.constructor.name} 没有 info.id —— 逻辑将无法按区域分支（修 B36）`);
    this.fogColor = config.fogColor ?? 0x888888;
    this.fogDensity = config.fogDensity ?? 0.008;
    this.skyColor = config.skyColor ?? 0x87a8c4;
    this.mapColor = config.mapColor ?? '#4488aa';
    this.poiMarkers = [];
    this.pois = [];
    /** 本地坐标碰撞体，build 结束后由 WorldManager 平移到世界坐标 */
    this.colliders = [];
  }

  /** 登记一个本地坐标障碍；kind: solid | platform | ghost */
  addCollider(collider) {
    this.colliders.push(collider);
    return collider;
  }

  addCylinderCollider(x, z, r, top, { base = 0, kind = 'solid' } = {}) {
    return this.addCollider({ shape: 'cyl', x, z, r, base, top, kind });
  }

  addBoxCollider(x, z, hx, hz, top, { base = 0, rot = 0, kind = 'solid' } = {}) {
    return this.addCollider({ shape: 'box', x, z, hx, hz, base, top, rot, kind });
  }

  distanceToCenter(x, z) {
    const dx = x - this.center.x;
    const dz = z - this.center.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  inZone(x, z) {
    return this.distanceToCenter(x, z) < this.radius;
  }

  getHeightAt(worldX, worldZ) {
    if (!this.inZone(worldX, worldZ)) return -Infinity;

    const lx = worldX - this.center.x;
    const lz = worldZ - this.center.z;
    return this.sampleHeight(lx, lz);
  }

  sampleHeight(_lx, _lz) {
    return 0;
  }

  /**
   * 登记一个兴趣点。
   *
   * @param {{x:number,y?:number,z:number}} position 区域本地坐标
   * @param {string} label 交互提示文案 —— **只用于显示**
   * @param {() => void} onInteract
   * @param {{id?: string, type?: string, color?: number}} options 必须显式给 `id`
   */
  addPOI(position, label, onInteract, options = {}) {
    // 修 B45：id 曾经回退成 `${this.id}-${label}`，把显示名嵌进了稳定身份 ——
    // 改一句调查文案，这个 POI 的 id 就变，所有按 id 认领的下游静默断链。
    // 与 `RestPointManager.addRestPoint` 同一条契约：要么给真 id，要么在世界构建期炸给开发者看。
    const id = options.id;
    if (!id) throw new Error(`BaseZone.addPOI: 区域 ${this.id} 的 POI「${label}」缺少 id`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`BaseZone.addPOI: POI id「${id}」不符合 kebab-case（id 是稳定身份，不能带显示名或大写）`);
    }
    if (this.pois.some((p) => p.id === id)) throw new Error(`BaseZone.addPOI: 区域 ${this.id} 的 POI id ${id} 重复`);

    const lx = position.x;
    const lz = position.z;
    const ly = position.y ?? this.sampleHeight(lx, lz);

    const poi = {
      id,
      position: new THREE.Vector3(this.center.x + lx, ly, this.center.z + lz),
      label,
      onInteract,
      type: options.type ?? 'lore',
    };
    this.pois.push(poi);

    const marker = this.createPOIMarker(lx, ly, lz, options.color ?? 0xc9a962);
    marker.userData.poiId = poi.id;
    this.group.add(marker);
    this.poiMarkers.push({ marker, poi });

    return poi;
  }

  createPOIMarker(x, y, z, color) {
    const group = new THREE.Group();

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.2, 3, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
      })
    );
    beam.position.y = 1.5;
    group.add(beam);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);

    group.position.set(x, y, z);
    return group;
  }

  getPointsOfInterest() {
    return this.pois;
  }

  update(dt) {
    const t = performance.now() * 0.002;
    for (const { marker } of this.poiMarkers) {
      marker.position.y = marker.userData.baseY ?? marker.position.y;
      if (marker.userData.baseY === undefined) marker.userData.baseY = marker.position.y;
      marker.position.y = marker.userData.baseY + Math.sin(t + marker.position.x) * 0.08;
      marker.rotation.y += dt * 0.4;
    }
  }

  createTree(x, z, scale = 1) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 2 * scale, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.95 })
    );
    trunk.position.y = 1 * scale;
    applyShadow(trunk, 'castOnly');
    group.add(trunk);

    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(1.2 * scale, 3 * scale, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a5a30, roughness: 0.85 })
    );
    foliage.position.y = 3 * scale;
    applyShadow(foliage, 'castOnly');
    group.add(foliage);

    const groundY = this.sampleHeight(x, z);
    group.position.set(x, groundY, z);
    if (scale >= 0.6) {
      this.addCylinderCollider(x, z, Math.max(0.3, 0.42 * scale), groundY + 3 * scale, { base: groundY - 0.5 });
    }
    return group;
  }

  createRock(x, z, size = 1) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(size, 0),
      new THREE.MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.95, flatShading: true })
    );
    rock.position.set(x, this.sampleHeight(x, z) + size * 0.4, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(1, 0.7 + Math.random() * 0.5, 1);
    applyShadow(rock, 'castOnly');
    if (size >= 0.8) this.addCylinderCollider(x, z, size * 0.8, rock.position.y + size * 1.1, { base: rock.position.y - size });
    return rock;
  }
}
