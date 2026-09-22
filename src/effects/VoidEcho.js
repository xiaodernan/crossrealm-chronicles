import * as THREE from 'three';

/** 破碎时线 — 玩家时间回响残影 */
export class VoidEcho {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.echoes = [];
    this.timer = 0;
    this.active = false;
    this.mat = new THREE.MeshStandardMaterial({
      color: 0xc9a962,
      transparent: true,
      opacity: 0.35,
      emissive: 0x664400,
      emissiveIntensity: 0.5,
      depthWrite: false,
    });
  }

  setActive(v) {
    this.active = v;
    if (!v) this.clear();
  }

  clear() {
    for (const e of this.echoes) this.group.remove(e.mesh);
    this.echoes = [];
  }

  spawn(pos, yaw) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 6, 12), this.mat.clone());
    body.position.copy(pos);
    body.position.y += 0.9;
    body.rotation.y = yaw;
    this.group.add(body);
    this.echoes.push({ mesh: body, life: 1.4 });
    if (this.echoes.length > 12) {
      const old = this.echoes.shift();
      this.group.remove(old.mesh);
    }
  }

  update(dt, playerPos, playerYaw, inVoid) {
    if (!inVoid) {
      if (this.active) this.setActive(false);
      return;
    }
    this.active = true;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.16;
      this.spawn(playerPos.clone(), playerYaw);
    }
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      e.life -= dt;
      e.mesh.material.opacity = Math.max(0, e.life * 0.3);
      e.mesh.position.y += dt * 0.15;
      if (e.life <= 0) {
        this.group.remove(e.mesh);
        this.echoes.splice(i, 1);
      }
    }
  }
}
