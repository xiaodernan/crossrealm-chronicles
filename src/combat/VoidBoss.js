import * as THREE from 'three';
import { Boss } from './Boss.js';
import { addShake } from '../engine/Shake.js';

/** Chapter 4 隐藏 Boss — 时线执政官 */
export class VoidBoss extends Boss {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      hp: 750,
      posture: 110,
      damage: 19,
      speed: 4.8,
      name: '时线执政官',
    });
    this.bossId = config.bossId ?? 'void-chronarch';
    this.timeStopCooldown = 0;
    this.timeStopActive = false;
    this.timeStopTimer = 0;
  }

  createMesh() {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a2535,
      emissive: 0xc9a962,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 1.6, 10, 20), bodyMat);
    body.position.y = 2;
    body.name = 'body';
    group.add(body);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.08, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0xc9a962, emissive: 0x664400, emissiveIntensity: 0.8 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.2;
    group.add(ring);

    return group;
  }

  /** 无底板、纯色填充（W-A3 之后由 `_buildHpBar` 统一创建） */
  hpBarSpec() {
    return { width: 2.4, height: 0.17, color: 0xc9a962, bg: null, offsetY: 4.5 };
  }

  update(dt, playerPos, playerRef) {
    if (!this.alive) return;

    this.timeStopCooldown = Math.max(0, this.timeStopCooldown - dt);

    if (this.timeStopActive) {
      this.timeStopTimer -= dt;
      if (playerRef) playerRef.timeSlow = 0.35;
      if (this.timeStopTimer <= 0) {
        this.timeStopActive = false;
        if (playerRef) playerRef.timeSlow = 1;
        window.dispatchEvent(new CustomEvent('time-stop-end'));
      }
      this.mesh.rotation.y += dt * 2;
      this.updateMeshY();
      return;
    }

    if (this.phase >= 2 && this.timeStopCooldown <= 0 && this.distanceTo(playerPos) < 22) {
      this.timeStopCooldown = 4;
      this.timeStopActive = true;
      this.timeStopTimer = 1.8;
      window.dispatchEvent(new CustomEvent('time-stop-start'));
      addShake(0.12);
    }

    super.update(dt, playerPos, playerRef);
  }

  takeDamage(amount, postureDamage = 0) {
    if (this.timeStopActive && amount > 40) {
      this.timeStopActive = false;
      this.timeStopTimer = 0;
      window.dispatchEvent(new CustomEvent('time-stop-end'));
      window.dispatchEvent(new CustomEvent('spell-toast', { detail: { message: '蓄力法术打断了时停！' } }));
    }
    super.takeDamage(amount, postureDamage);
  }
}
