import * as THREE from 'three';
import { Boss } from './Boss.js';

/** 第三 Boss：引力化身 — 星际位面 */
export class SpaceBoss extends Boss {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      hp: 900,
      posture: 130,
      damage: 20,
      speed: 5,
      name: '引力化身·奇点领主',
      // id 走 config：`Boss` 构造期就要按它查场地脚本，晚一步赋默认值会查到别人的表
      bossId: config.bossId ?? 'singularity-herald',
    });
    this.projectiles = config.projectiles;
    this.pullCooldown = 0;
    this.orbitAngle = 0;
    this.shootCooldown = 0;
  }

  createMesh() {
    const group = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x110022, emissiveIntensity: 0.8 })
    );
    core.position.y = 2.5;
    core.name = 'body';
    group.add(core);

    const disk = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.25, 8, 48),
      new THREE.MeshStandardMaterial({
        color: 0xff6622,
        emissive: 0xff4400,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.85,
      })
    );
    disk.rotation.x = Math.PI / 2;
    disk.position.y = 2.5;
    disk.name = 'disk';
    group.add(disk);

    return group;
  }

  /** 无底板、纯色填充（W-A3 之后由 `_buildHpBar` 统一创建） */
  hpBarSpec() {
    return { width: 2.4, height: 0.17, color: 0x4488ff, bg: null, offsetY: 4.8 };
  }

  update(dt, playerPos, playerRef) {
    if (!this.alive) return;

    const disk = this.mesh.getObjectByName('disk');
    const core = this.mesh.getObjectByName('body');
    const t = this.tuning();
    if (disk) disk.rotation.z += dt * t.diskSpin;
    if (core) core.rotation.y += dt * 0.8;

    this.orbitAngle += dt;
    this.mesh.position.y = this.world.getGroundHeight(this.position.x, this.position.z) + Math.sin(this.orbitAngle * 2) * 0.5;

    this.pullCooldown = Math.max(0, this.pullCooldown - dt);

    if (t.canPull && this.pullCooldown <= 0 && this.distanceTo(playerPos) < 30) {
      this.pullCooldown = t.pullCooldown;
      if (playerRef) {
        const dx = this.position.x - playerPos.x;
        const dz = this.position.z - playerPos.z;
        // 一记 6 米/秒的外部冲量：走玩家的冲量账，所以它按秒衰减、也不吃按键的整条改写
        playerRef.applyKnockback(dx, dz, t.pullImpulse);
      }
    }

    if (t.canVolley && this.shootCooldown <= 0) {
      this.shootCooldown = t.volleyCooldown;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.orbitAngle;
        const tx = this.position.x + Math.cos(a) * 15;
        const tz = this.position.z + Math.sin(a) * 15;
        this.projectiles?.spawn(
          this.position.clone(),
          new THREE.Vector3(tx, 0, tz),
          14,
          8,
          0x4488ff
        );
      }
    } else {
      this.shootCooldown = Math.max(0, (this.shootCooldown ?? 0) - dt);
    }

    super.update(dt, playerPos, playerRef);
  }
}
