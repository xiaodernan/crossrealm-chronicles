import * as THREE from 'three';

const _dir = new THREE.Vector3();

export class ProjectileManager {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.projectiles = [];
  }

  spawn(from, target, damage, speed = 12, color = 0xaa44ff) {
    const geometry = new THREE.SphereGeometry(0.35, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(from);
    mesh.position.y += 2;
    this.scene.add(mesh);
    this.projectiles.push({
      mesh,
      geometry,
      material,
      target: target.clone(),
      damage,
      speed,
      life: 6,
    });
  }

  _recycle(i) {
    const p = this.projectiles[i];
    this.projectiles.splice(i, 1);
    this.scene.remove(p.mesh);
    p.geometry.dispose();
    p.material.dispose();
  }

  /** 存活弹体数 — 观察者接口，避免外部翻内部数组 */
  count() {
    return this.projectiles.length;
  }

  update(dt, playerPos, playerRef) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      _dir.subVectors(p.target, p.mesh.position);
      _dir.y = 0;
      const len = _dir.length();
      if (len > 0.5) {
        _dir.normalize();
        p.mesh.position.addScaledVector(_dir, p.speed * dt);
      }
      p.mesh.position.y = 1.5 + Math.sin(p.life * 8) * 0.3;

      const dist = Math.sqrt(
        (playerPos.x - p.mesh.position.x) ** 2 + (playerPos.z - p.mesh.position.z) ** 2
      );
      if (dist < 1.2 && playerRef && !playerRef.combat.isInvulnerable()) {
        playerRef.combat.takeDamage(p.damage);
        this._recycle(i);
        continue;
      }
      if (p.life <= 0 || len < 0.5) this._recycle(i);
    }
  }
}
