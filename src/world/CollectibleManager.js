import * as THREE from 'three';

const CHESTS = [
  { id: 'chest-hub', x: 25, z: 70, souls: 50 },
  { id: 'chest-fantasy', x: -170, z: 50, souls: 80 },
  { id: 'chest-fantasy2', x: -240, z: -10, souls: 100 },
  { id: 'chest-magic', x: -40, z: -200, souls: 80 },
  { id: 'chest-magic2', x: 50, z: -160, souls: 120 },
  { id: 'chest-space', x: 170, z: 50, souls: 80 },
  { id: 'chest-space2', x: 210, z: 130, souls: 100 },
  { id: 'chest-secret', x: -30, z: -30, souls: 200 },
];

export class CollectibleManager {
  constructor(scene, world, stats, dialog) {
    this.scene = scene;
    this.world = world;
    this.stats = stats;
    this.dialog = dialog;
    this.chests = [];
    this.build();
  }

  build() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a5030, roughness: 0.8, metalness: 0.3 });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x8a7040, roughness: 0.7, metalness: 0.4 });

    for (const c of CHESTS) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.8), mat);
      body.position.y = 0.4;
      body.castShadow = true;
      group.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 0.85), lidMat);
      lid.position.y = 0.9;
      lid.name = 'lid';
      group.add(lid);

      const glow = new THREE.PointLight(0xffcc44, 0.3, 6);
      glow.position.y = 1.2;
      group.add(glow);

      const y = this.world.getGroundHeight(c.x, c.z);
      group.position.set(c.x, y, c.z);
      this.scene.add(group);

      this.chests.push({
        ...c,
        mesh: group,
        opened: this.stats.chestsOpened.has(c.id),
      });
      if (this.stats.chestsOpened.has(c.id)) group.visible = false;
    }
  }

  tryOpen(playerPos, range = 3) {
    for (const chest of this.chests) {
      if (chest.opened) continue;
      const d = Math.sqrt((playerPos.x - chest.mesh.position.x) ** 2 + (playerPos.z - chest.mesh.position.z) ** 2);
      if (d < range) return chest;
    }
    return null;
  }

  open(chest) {
    if (chest.opened) return;
    chest.opened = true;
    this.stats.chestsOpened.add(chest.id);
    this.stats.addSouls(chest.souls);
    chest.mesh.visible = false;
    this.dialog.toast(`宝箱：获得 ${chest.souls} 位面之魂`);
    window.dispatchEvent(new CustomEvent('chest-opened', { detail: { id: chest.id } }));
  }

  getOpenedCount() {
    return this.chests.filter((c) => c.opened).length;
  }
}
