import * as THREE from 'three';

export class RestPointManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.points = [];
  }

  addRestPoint(x, z, name, id) {
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
      id: id ?? name,
      name,
      position: new THREE.Vector3(x, 0, z),
      mesh: group,
      flame,
    };
    this.points.push(point);
    return point;
  }

  buildDefaults() {
    this.addRestPoint(0, 55, '世界之锚休息点', 'hub');
    this.addRestPoint(-200, 0, '灰白森林营火', 'fantasy');
    this.addRestPoint(0, -180, '魔法遗境营火', 'magic');
    this.addRestPoint(200, 80, '米勒荒原营火', 'space');
    this.addRestPoint(0, 210, '破碎时线营火', 'void');
    this.addRestPoint(-200, 210, '混沌边境营火', 'abyss');
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
