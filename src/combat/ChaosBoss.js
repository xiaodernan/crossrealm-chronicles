import * as THREE from 'three';
import { Boss } from './Boss.js';
import { addShake } from '../engine/Shake.js';

/** Chapter 5 Boss — 混沌裂隙领主 */
export class ChaosBoss extends Boss {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      hp: 820,
      posture: 115,
      damage: 21,
      speed: 5.2,
      name: '混沌裂隙领主',
    });
    this.bossId = config.bossId ?? 'chaos-overlord';
    this.chaosPulse = 0;
  }

  createMesh() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a0818,
      emissive: 0xff2244,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.6, 10, 20), mat);
    body.position.y = 2;
    body.name = 'body';
    group.add(body);

    const spikes = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), mat);
    spikes.position.y = 3.5;
    group.add(spikes);

    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(2.36, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xff2244 })
    );
    hpFill.position.set(0, 4.6, 0.01);
    hpFill.name = 'hpBar';
    group.add(hpFill);

    return group;
  }

  update(dt, playerPos, playerRef) {
    if (!this.alive) return;
    this.chaosPulse += dt;

    if (this.phase >= 2 && this.chaosPulse > 2.5) {
      this.chaosPulse = 0;
      if (playerRef?.combat && this.distanceTo(playerPos) < 9) {
        playerRef.combat.takeDamage(12);
        addShake(0.12);
      }
    }

    if (this.phase >= 3 && Math.random() < dt * 0.06) {
      this.startSlamTelegraph();
    }

    super.update(dt, playerPos, playerRef);
  }
}
