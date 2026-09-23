import * as THREE from 'three';
import { Boss } from './Boss.js';
import { barrageLayout } from './BarragePattern.js';
import { GROUND_HAZARD } from '../content/tuning.js';

/** 第二 Boss：大奥术师 — 魔法位面 */
export class MagicBoss extends Boss {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      hp: 650,
      posture: 100,
      damage: 16,
      speed: 4,
      name: '大奥术师·萨尔林',
    });
    this.bossId = config.bossId ?? 'archmagus';
    this.projectiles = config.projectiles;
    this.shootCooldown = 0;
    /** 落点圈阵列自己的节奏（`GROUND_HAZARD.barrage.cooldown`），与单发弹体互不抢冷却 */
    this.barrageCooldown = 0;
  }

  createMesh() {
    const group = new THREE.Group();
    const robe = new THREE.MeshStandardMaterial({
      color: 0x2a1848,
      emissive: 0x330066,
      emissiveIntensity: 0.5,
      roughness: 0.7,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 1.6, 12, 24), robe);
    body.position.y = 1.8;
    body.castShadow = true;
    body.name = 'body';
    group.add(body);

    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.12, 3, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.8 })
    );
    staff.position.set(0.8, 2, 0);
    staff.rotation.z = -0.2;
    group.add(staff);

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xcc66ff,
        emissive: 0x8800ff,
        emissiveIntensity: 1.0,
        transparent: true,
        opacity: 0.9,
      })
    );
    orb.position.set(0.8, 3.2, 0);
    orb.name = 'orb';
    group.add(orb);

    return group;
  }

  /** 无底板、纯色填充（W-A3 之后由 `_buildHpBar` 统一创建） */
  hpBarSpec() {
    return { width: 2.4, height: 0.17, color: 0x8844cc, bg: null, offsetY: 4.5 };
  }

  update(dt, playerPos, playerRef) {
    if (!this.alive) return;
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);

    const orb = this.mesh.getObjectByName('orb');
    if (orb) {
      orb.rotation.y += dt * 2;
      orb.material.emissiveIntensity = 0.7 + Math.sin(performance.now() * 0.004) * 0.4;
    }

    if (this.phase >= 2 && this.shootCooldown <= 0 && this.distanceTo(playerPos) < 25) {
      this.projectiles?.spawn(
        this.position.clone(),
        playerPos.clone(),
        12 + this.phase * 4,
        10 + this.phase * 2,
        0xcc44ff
      );
      this.shootCooldown = this.phase >= 3 ? 1.2 : 2.0;
    }

    this.barrageCooldown = Math.max(0, this.barrageCooldown - dt);
    const barrage = GROUND_HAZARD.barrage;
    if (this.hazards && this.phase >= 2 && this.barrageCooldown <= 0
      && this.distanceTo(playerPos) < barrage.range) {
      this.startBarrage(playerPos);
    }

    super.update(dt, playerPos, playerRef);
  }

  /**
   * 落点圈阵列：以玩家**此刻**的位置为心，铺一片由内向外错时落下的紫圈。
   * 铺完就不再关心玩家往哪跑 —— 这一招买的是"你还站在原地没有"，逼的是持续移动。
   */
  startBarrage(playerPos) {
    const spec = GROUND_HAZARD.barrage;
    for (const p of barrageLayout(playerPos.x, playerPos.z, spec)) {
      const at = this.clampIntoArena(p.x, p.z, spec.radius);
      this.hazards.spawn({
        x: at.x,
        z: at.z,
        radius: spec.radius,
        telegraph: p.telegraph,
        damage: spec.damage,
        color: spec.color,
        owner: this,
      });
    }
    this.barrageCooldown = spec.cooldown;
  }
}
