import * as THREE from 'three';
import { Enemy } from './Enemy.js';

/** 影界守护者 — 首个 Boss，三阶段 */
export class Boss extends Enemy {
  constructor(scene, world, config) {
    super(scene, world, {
      ...config,
      type: 'boss',
      hp: 800,
      posture: 120,
      damage: 18,
      speed: 4.5,
      aggroRange: 40,
      attackRange: 3.5,
      respawn: false,
      name: config.name ?? '影界守护者',
    });

    this.bossId = config.bossId ?? 'shadow-warden';
    this.phase = 1;
    this.arenaCenter = config.arenaCenter ?? this.position.clone();
    this.arenaRadius = config.arenaRadius ?? 22;
    this.enraged = false;
    this.slamTelegraph = null;
    this.phaseTriggered = { p2: false, p3: false };
  }

  createMesh(config) {
    const group = new THREE.Group();

    const cloakMat = new THREE.MeshStandardMaterial({
      color: 0x1a1028,
      emissive: 0x220044,
      emissiveIntensity: 0.4,
      roughness: 0.6,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.8, 12, 24), cloakMat);
    body.position.y = 2.0;
    body.castShadow = true;
    body.name = 'body';
    group.add(body);

    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.12, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xc9a962, emissive: 0x664400, emissiveIntensity: 0.6, metalness: 0.8 })
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 3.6;
    group.add(crown);

    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 2.2, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: 0x224466, emissiveIntensity: 0.5, metalness: 0.9 })
    );
    blade.position.set(1.0, 2.0, 0);
    blade.rotation.z = -0.4;
    blade.name = 'blade';
    group.add(blade);

    return group;
  }

  /** Boss 体型大一圈：血条更宽、离地更高（W-A3 之后由 `_buildHpBar` 统一创建） */
  hpBarSpec() {
    return { width: 2.4, height: 0.18, color: 0xaa2222, bg: 0x111111, offsetY: 4.5 };
  }

  takeDamage(amount, postureDamage = 0) {
    if (!this.alive) return false;
    // 必须把"是否致死"回传，否则处决/掉落判定对 Boss 永远不触发
    const killed = super.takeDamage(amount, postureDamage);
    this.checkPhase();
    this._emitHealth();
    return killed;
  }

  /** 仅在数值变化时广播，避免每帧一条事件（B10） */
  _emitHealth() {
    const sig = `${this.hp}|${this.phase}`;
    if (sig === this._healthSig) return;
    this._healthSig = sig;
    window.dispatchEvent(new CustomEvent('boss-health', {
      detail: { hp: this.hp, maxHp: this.maxHp, phase: this.phase, name: this.name },
    }));
  }

  checkPhase() {
    const ratio = this.hp / this.maxHp;
    if (ratio <= 0.5 && !this.phaseTriggered.p2) {
      this.phase = 2;
      this.phaseTriggered.p2 = true;
      this.speed = 5.5;
      window.dispatchEvent(new CustomEvent('boss-phase', { detail: { phase: 2, name: this.name, bossId: this.bossId } }));
    }
    if (ratio <= 0.25 && !this.phaseTriggered.p3) {
      this.phase = 3;
      this.phaseTriggered.p3 = true;
      this.speed = 7;
      this.damage = 24;
      this.attackCooldown = 0;
      window.dispatchEvent(new CustomEvent('boss-phase', { detail: { phase: 3, name: this.name, bossId: this.bossId } }));
    }
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.setBodyVisible(false);
    this.clearTelegraph();
    this._hideSlamRing();
    window.dispatchEvent(new CustomEvent('enemy-defeated', {
      detail: { name: this.name, type: 'boss', bossId: this.bossId },
    }));
    window.dispatchEvent(new CustomEvent('boss-defeated', { detail: { bossId: this.bossId } }));
  }

  startSlamTelegraph() {
    if (this.slamTelegraph) return;
    let ring = this._slamRing;
    if (!ring) {
      ring = new THREE.Mesh(
        new THREE.RingGeometry(0.5, 4, 32),
        new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      this._slamRing = ring;
    }
    ring.position.set(this.position.x, this.world.getGroundHeight(this.position.x, this.position.z) + 0.15, this.position.z);
    ring.scale.set(1, 1, 1);
    ring.visible = true;
    this.scene.add(ring);
    this.slamTelegraph = { mesh: ring, timer: 1.2, damage: 35 };
    this.state = 'slam';
    this.stateTimer = 0;
  }

  updateSlam(dt, playerPos, playerRef) {
    if (!this.slamTelegraph) return;
    this.slamTelegraph.timer -= dt;
    const s = 1 + (1.2 - this.slamTelegraph.timer) * 3;
    this.slamTelegraph.mesh.scale.set(s, s, s);
    this.slamTelegraph.mesh.material.opacity = 0.3 + Math.sin(this.stateTimer * 15) * 0.2;

    if (this.slamTelegraph.timer <= 0) {
      const dist = this.distanceTo(playerPos);
      if (dist < 4.5 && playerRef && !playerRef.combat.isInvulnerable()) {
        playerRef.combat.takeDamage(this.slamTelegraph.damage);
      }
      this._hideSlamRing();
      this.state = 'idle';
      this.attackCooldown = 2.5;
    }
  }

  /** 落 slam 圈常驻复用，退出时只摘出场景，不销毁 */
  _hideSlamRing() {
    const mesh = this.slamTelegraph?.mesh ?? this._slamRing;
    if (!mesh) return;
    mesh.visible = false;
    this.scene.remove(mesh);
    this.slamTelegraph = null;
  }

  update(dt, playerPos, playerRef) {
    if (!this.alive) return;

    if (this.state === 'slam') {
      this.stateTimer += dt;
      this.updateSlam(dt, playerPos, playerRef);
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    this.stateTimer += dt;

    if (this.staggerTimer > 0) {
      this.state = 'stagger';
      this.mesh.rotation.z = Math.sin(this.stateTimer * 18) * 0.12;
      return;
    }
    if (this.state === 'stagger') {
      this.state = 'idle';
      this.stateTimer = 0;
    }
    this.mesh.rotation.z = 0;

    const dist = this.distanceTo(playerPos);
    if (dist > this.aggroRange) {
      this.state = 'idle';
      this.updateMeshY();
      return;
    }

    if (this.state === 'windup') {
      if (this.stateTimer > 0.85) {
        this.state = 'strike';
        this.stateTimer = 0;
        if (dist < this.attackRange + 1 && playerRef && !playerRef.combat.isInvulnerable()) {
          playerRef.combat.takeDamage(this.damage);
        }
        this.clearTelegraph();
      }
      this.updateMeshY();
      return;
    }

    if (this.state === 'strike') {
      if (this.stateTimer > 0.4) {
        this.state = 'idle';
        this.attackCooldown = this.phase >= 3 ? 0.9 : this.phase >= 2 ? 1.2 : 1.6;
      }
      return;
    }

    if (dist > this.attackRange) {
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      this.position.x += (dx / len) * this.speed * dt;
      this.position.z += (dz / len) * this.speed * dt;
      this.mesh.rotation.y = Math.atan2(dx, dz);
    } else if (this.attackCooldown <= 0) {
      if (this.phase >= 2 && Math.random() < 0.35) {
        this.startSlamTelegraph();
      } else {
        this.state = 'windup';
        this.stateTimer = 0;
        this.showTelegraph();
      }
    }

    this.updateMeshY();
    this._emitHealth();
  }

  /** 预警圈常驻复用：旧实现每次出手新建几何 + 材质，清除时只 remove 不 dispose */
  showTelegraph() {
    if (!this.telegraphRing) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.3, 1.2, 16),
        new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      ring.name = 'telegraph';
      this.telegraphRing = ring;
      this.mesh.add(ring);
    }
    this.telegraphRing.visible = true;
  }

  clearTelegraph() {
    if (this.telegraphRing) this.telegraphRing.visible = false;
  }

  dispose() {
    super.dispose();
    if (this._slamRing) {
      this.scene.remove(this._slamRing);
      this._slamRing.geometry.dispose();
      this._slamRing.material.dispose();
      this._slamRing = null;
    }
    this.slamTelegraph = null;
  }
}
