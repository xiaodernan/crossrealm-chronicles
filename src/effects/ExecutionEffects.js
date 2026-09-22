import * as THREE from 'three';

/** 处决 / 终结技 — 地面冲击环、血雾粒子 */
export class ExecutionEffects {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.group = new THREE.Group();
    scene.add(this.group);
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

  _spawnRing(pos, color, maxR, life) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.5, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.2, pos.z);
    this.group.add(ring);
    let t = 0;
    const tick = (dt) => {
      t += dt;
      const p = t / life;
      ring.scale.setScalar(1 + p * maxR * 2);
      ring.material.opacity = Math.max(0, 0.85 * (1 - p));
      if (p >= 1) {
        this.group.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
        return;
      }
      requestAnimationFrame(() => tick(0.016));
    };
    tick(0);
  }

  _spawnShards(pos, color, count) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      m.position.set(pos.x, pos.y + 1.2, pos.z);
      const vx = (Math.random() - 0.5) * 8;
      let vy = 2 + Math.random() * 5;
      const vz = (Math.random() - 0.5) * 8;
      this.group.add(m);
      let life = 0.35 + Math.random() * 0.25;
      const tick = () => {
        life -= 0.016;
        m.position.x += vx * 0.016;
        m.position.y += vy * 0.016;
        m.position.z += vz * 0.016;
        vy -= 9.8 * 0.016;
        m.material.opacity = Math.max(0, life * 2);
        m.rotation.x += 0.12;
        m.rotation.y += 0.08;
        if (life <= 0) {
          this.group.remove(m);
          m.geometry.dispose();
          m.material.dispose();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    }
  }

  _spawnVerticalSlash(pos, color) {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 2.8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
    );
    plane.position.set(pos.x, pos.y + 1.4, pos.z);
    plane.rotation.y = Math.random() * Math.PI;
    this.group.add(plane);
    let life = 0.22;
    const tick = () => {
      life -= 0.016;
      plane.material.opacity = life * 3;
      plane.scale.x = 1 + (0.22 - life) * 4;
      if (life <= 0) {
        this.group.remove(plane);
        plane.geometry.dispose();
        plane.material.dispose();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  }
}
