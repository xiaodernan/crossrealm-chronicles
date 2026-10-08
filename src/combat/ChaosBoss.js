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
      // id 走 config：`Boss` 构造期就要按它查场地脚本
      bossId: config.bossId ?? 'chaos-overlord',
    });
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

    return group;
  }

  /** 无底板、纯色填充（W-A3 之后由 `_buildHpBar` 统一创建） */
  hpBarSpec() {
    return { width: 2.4, height: 0.17, color: 0xff2244, bg: null, offsetY: 4.6 };
  }

  update(dt, playerPos, playerRef) {
    if (!this.alive) return;
    this.chaosPulse += dt;

    const t = this.tuning();
    if (t.canPulse && this.chaosPulse > t.pulseInterval) {
      this.chaosPulse = 0;
      if (playerRef?.combat && this.distanceTo(playerPos) < t.pulseRange) {
        playerRef.combat.takeDamage(t.pulseDamage, null, null, { from: this.position });
        addShake(0.12);
      }
    }

    super.update(dt, playerPos, playerRef);
  }
}
