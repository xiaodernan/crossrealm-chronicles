import * as THREE from 'three';

/**
 * 处决 / 终结技 — 地面冲击环、血雾碎片、竖向斩击。
 *
 * 修 B43：这三条动画过去各自 `requestAnimationFrame` 递归，并把每帧时长写死成 `0.016`。
 * 于是"寿命"其实是按**帧数**走的 —— 144Hz 下一片碎片约 0.15 秒就没了（设计值 0.35~0.6 秒），
 * 30Hz 下拖到 0.7 秒，而且暂停与 hitstop 期间照常跑完。现在统一由主循环的 `update(dt)` 推进：
 * dt 已被 `timeScale` 与 hitstop 缩过，特效因此和它要强化的那一击同步。
 */

/** 旧写法是"每帧转 0.12 / 0.08 弧度"，换算成角速度（60fps 基准）以保持手感数值不变 */
const SHARD_SPIN_X = 0.12 * 60;
const SHARD_SPIN_Y = 0.08 * 60;
const SHARD_GRAVITY = 9.8;

export class ExecutionEffects {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.group = new THREE.Group();
    scene.add(this.group);
    /** 在飞的条目：由 `burst()` 创建，由 `update()` 到期移除并 dispose */
    this.live = [];
    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('combo-finisher', () => this.burst(null, 'finisher'));
    window.addEventListener('combat-riposte', () => this.burst(null, 'riposte'));
    window.addEventListener('combat-execution', (e) => {
      const pos = e.detail?.position;
      const v = pos instanceof THREE.Vector3 ? pos : pos ? new THREE.Vector3(pos.x, pos.y, pos.z) : null;
      this.burst(v, e.detail?.boss ? 'bossKill' : 'execution');
    });
  }

  /**
   * 主循环驱动的逐帧推进。倒序遍历，因为到期条目会在本轮里被移除。
   * @param {number} dt 缩放后的帧长（秒）
   */
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i -= 1) {
      if (!this.live[i].onTick(dt)) {
        const { mesh } = this.live.splice(i, 1)[0];
        this.group.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
  }

  _add(mesh, onTick) {
    this.group.add(mesh);
    this.live.push({ mesh, onTick });
  }

  burst(worldPos, kind = 'execution') {
    const pos = worldPos ?? this.game?.player?.combat?.lockTarget?.position ?? this.game?.player?.position;
    if (!pos) return;

    const colors = {
      finisher: 0xffcc44,
      riposte: 0xff8866,
      execution: 0xff4422,
      bossKill: 0xc9a962,
    };
    const color = colors[kind] ?? 0xffaa44;
    const scale = kind === 'bossKill' ? 5.5 : kind === 'finisher' ? 3.2 : 4.0;

    this._spawnRing(pos, color, scale, kind === 'bossKill' ? 0.55 : 0.38);
    this._spawnShards(pos, color, kind === 'bossKill' ? 28 : 16);
    if (kind === 'bossKill' || kind === 'execution') {
      this._spawnVerticalSlash(pos, color);
    }
  }

  _spawnRing(pos, color, maxR, ttl) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.5, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.2, pos.z);
    let t = 0;
    this._add(ring, (dt) => {
      t += dt;
      const p = t / ttl;
      ring.scale.setScalar(1 + p * maxR * 2);
      ring.material.opacity = Math.max(0, 0.85 * (1 - p));
      return p < 1;
    });
  }

  _spawnShards(pos, color, count) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      mesh.position.set(pos.x, pos.y + 1.2, pos.z);
      const vx = (Math.random() - 0.5) * 8;
      const vz = (Math.random() - 0.5) * 8;
      let vy = 2 + Math.random() * 5;
      let life = 0.35 + Math.random() * 0.25;
      this._add(mesh, (dt) => {
        life -= dt;
        mesh.position.x += vx * dt;
        mesh.position.y += vy * dt;
        vy -= SHARD_GRAVITY * dt;
        mesh.position.z += vz * dt;
        mesh.material.opacity = Math.max(0, life * 2);
        mesh.rotation.x += SHARD_SPIN_X * dt;
        mesh.rotation.y += SHARD_SPIN_Y * dt;
        return life > 0;
      });
    }
  }

  _spawnVerticalSlash(pos, color) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 2.8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    plane.position.set(pos.x, pos.y + 1.4, pos.z);
    plane.rotation.y = Math.random() * Math.PI;
    let life = 0.22;
    this._add(plane, (dt) => {
      life -= dt;
      plane.material.opacity = life * 3;
      plane.scale.x = 1 + (0.22 - life) * 4;
      return life > 0;
    });
  }
}
