import * as THREE from 'three';
import { Boss } from './Boss.js';

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
      // bossId 必须在 `super` 里定下：场地脚本按 id 取，晚一步赋值就会取到基类的那个
      bossId: config.bossId ?? 'archmagus',
    });
    this.projectiles = config.projectiles;
    this.shootCooldown = 0;
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

    // 三档的数都在 `content/bossPhases.js`（W-B8 切片5）：这里只问"这一档放不放"，
    // 不再现算 `12 + this.phase * 4` 那种算术 —— 那种写法让"二阶段是什么样"没有一处读得到
    const t = this.tuning();
    if (t.canVolley && this.shootCooldown <= 0 && this.distanceTo(playerPos) < 25) {
      this.projectiles?.spawn(
        this.position.clone(),
        playerPos.clone(),
        t.volleyDamage,
        t.volleySpeed,
        0xcc44ff
      );
      this.shootCooldown = t.volleyCooldown;
    }

    super.update(dt, playerPos, playerRef);
  }
}
