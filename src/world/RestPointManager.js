import * as THREE from 'three';
import { ZONE_IDS, ZONE_NAMES } from './ZoneIdentity.js';

export class RestPointManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.points = [];
  }

  /**
   * @param {number} x @param {number} z @param {string} name UI 文案
   * @param {string} id 稳定 id（`ZONE_IDS` 之一，或该营火自己的唯一名）
   */
  addRestPoint(x, z, name, id) {
    // 修 B36：id 曾经悄悄回落成显示名 —— 那等于把"目的地按什么认领"又交回文案手上。
    // 现在要么给真 id，要么在世界构建期就炸给开发者看，不留静默的第二真源。
    if (!id) throw new Error(`RestPointManager: 营火「${name}」缺少 id，快速旅行将无法认领目的地`);
    if (this.points.some((p) => p.id === id)) throw new Error(`RestPointManager: 营火 id ${id} 重复，快速旅行会跳错地方`);
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.2, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.9, metalness: 0.1 })
    );
    base.position.y = 0.2;
    base.castShadow = true;
    group.add(base);

    const stone = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.08, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.85 })
    );
    stone.rotation.x = Math.PI / 2;
    stone.position.y = 0.35;
    group.add(stone);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.9, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffaa44,
        emissive: 0xff6622,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9,
      })
    );
    flame.position.y = 1.0;
    flame.name = 'flame';
    group.add(flame);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.05, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0xc9a962, emissive: 0x443300, emissiveIntensity: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05;
    group.add(ring);

    group.position.set(x, this.world.getGroundHeight(x, z), z);
    this.scene.add(group);

    const point = {
      id,
      name,
      position: new THREE.Vector3(x, 0, z),
      mesh: group,
      flame,
    };
    this.points.push(point);
    return point;
  }

  buildDefaults() {
    // 营火与它所在的位面共用一个 id（快速旅行、NPC 归属、地图标记都认它）；
    // 名字里的区名取 `ZONE_NAMES`，改区域文案时不会留下一座叫旧名的营火
    this.addRestPoint(0, 55, '世界之锚休息点', ZONE_IDS.HUB);
    this.addRestPoint(-200, 0, `${ZONE_NAMES[ZONE_IDS.FANTASY]}营火`, ZONE_IDS.FANTASY);
    this.addRestPoint(0, -180, `${ZONE_NAMES[ZONE_IDS.MAGIC]}营火`, ZONE_IDS.MAGIC);
    this.addRestPoint(200, 80, `${ZONE_NAMES[ZONE_IDS.SPACE]}营火`, ZONE_IDS.SPACE);
    this.addRestPoint(0, 210, `${ZONE_NAMES[ZONE_IDS.VOID]}营火`, ZONE_IDS.VOID);
    this.addRestPoint(-200, 210, `${ZONE_NAMES[ZONE_IDS.ABYSS]}营火`, ZONE_IDS.ABYSS);
  }

  getNearest(pos, range = 4) {
    let best = null;
    let min = range;
    for (const p of this.points) {
      const d = Math.sqrt((pos.x - p.position.x) ** 2 + (pos.z - p.position.z) ** 2);
      if (d < min) { min = d; best = p; }
    }
    return best;
  }

  /** 营火 id 清单（图鉴筛选、成就统计都从这里取，不再各自抄一份表） */
  ids() {
    return this.points.map((p) => p.id);
  }

  /** id → 显示名。找不到返回 null，由调用方决定兜底文案（不许拿 id 冒充名字） */
  nameOf(id) {
    return this.points.find((p) => p.id === id)?.name ?? null;
  }

  update(dt) {
    const t = performance.now() * 0.003;
    for (const p of this.points) {
      if (p.flame) {
        p.flame.scale.y = 1 + Math.sin(t + p.position.x) * 0.15;
        p.flame.material.emissiveIntensity = 0.9 + Math.sin(t * 2) * 0.3;
      }
    }
  }
}
