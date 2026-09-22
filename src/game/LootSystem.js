import * as THREE from 'three';

export class LootSystem {
  constructor(scene, stats, audio) {
    this.scene = scene;
    this.stats = stats;
    this.audio = audio;
    this.drops = [];
  }

  spawnDrop(pos, souls = 15) {
    const geo = new THREE.OctahedronGeometry(0.25, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x44ddff,
      emissive: 0x116688,
      emissiveIntensity: 0.9,
      metalness: 0.6,
      roughness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.y += 1;
    this.scene.add(mesh);
    this.drops.push({ mesh, souls, life: 30, phase: Math.random() * Math.PI * 2 });
  }

  update(dt, playerPos, pickupRadius = 2.5) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.life -= dt;
      d.phase += dt * 3;
      d.mesh.position.y = playerPos.y + 0.8 + Math.sin(d.phase) * 0.3;
      d.mesh.rotation.y += dt * 2;

      const dist = Math.sqrt(
        (playerPos.x - d.mesh.position.x) ** 2 + (playerPos.z - d.mesh.position.z) ** 2
      );
      if (dist < pickupRadius) {
        this.stats.addSouls(d.souls);
        this.audio?.pickup();
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
        continue;
      }
      if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }
  }
}
