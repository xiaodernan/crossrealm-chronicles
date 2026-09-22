import * as THREE from 'three';

/** 区域天气 — 雨 / 雪 / 灰烬 / 奥术 drizzle，跟随玩家 */
const ZONE_PRESETS = {
  hub: { kind: 'mist', count: 420, color: 0xaabbcc, speed: 6, wind: 0.4, fogBoost: 0.0004 },
  fantasy: { kind: 'rain', count: 900, color: 0x8899aa, speed: 28, wind: 1.2, fogBoost: 0.0008 },
  magic: { kind: 'arcane', count: 650, color: 0xaa66ff, speed: 16, wind: 0.6, fogBoost: 0.0006 },
  space: { kind: 'snow', count: 750, color: 0xccddee, speed: 5, wind: 0.35, fogBoost: 0.0003 },
  void: { kind: 'ash', count: 580, color: 0x998877, speed: 8, wind: 0.5, fogBoost: 0.0007 },
  abyss: { kind: 'ember', count: 520, color: 0xff4422, speed: 12, wind: 0.8, fogBoost: 0.0005 },
};

export class WeatherSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.zone = 'hub';
    this.preset = ZONE_PRESETS.hub;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.particles = null;
    this.velocities = null;
    this.splashGroup = new THREE.Group();
    this.group.add(this.splashGroup);

    this._follow = new THREE.Vector3();
    this._box = { x: 55, y: 32, z: 55 };
    this._buildParticles(this.preset);
  }

  _buildParticles(preset) {
    if (this.particles) {
      this.group.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
    }

    const n = preset.count;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this._randomizeParticle(pos, vel, i, preset, true);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const size = preset.kind === 'snow' ? 0.22 : preset.kind === 'mist' ? 0.45 : 0.14;
    const mat = new THREE.PointsMaterial({
      color: preset.color,
      size,
      transparent: true,
      opacity: preset.kind === 'mist' ? 0.35 : 0.72,
      blending: preset.kind === 'ember' || preset.kind === 'arcane' ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geo, mat);
    this.velocities = vel;
    this.group.add(this.particles);
  }

  _randomizeParticle(pos, vel, i, preset, initial = false) {
    const bx = this._box.x;
    const by = this._box.y;
    const bz = this._box.z;
    const cx = this._follow.x;
    const cz = this._follow.z;
    pos[i * 3] = cx + (Math.random() - 0.5) * bx * 2;
    pos[i * 3 + 1] = initial ? by * Math.random() : by + 4;
    pos[i * 3 + 2] = cz + (Math.random() - 0.5) * bz * 2;

    const w = preset.wind * (0.6 + Math.random() * 0.8);
    vel[i * 3] = w * (Math.random() - 0.3);
    vel[i * 3 + 1] = -preset.speed * (0.7 + Math.random() * 0.6);
    vel[i * 3 + 2] = w * 0.4 * (Math.random() - 0.5);

    if (preset.kind === 'ember') {
      vel[i * 3 + 1] = Math.abs(vel[i * 3 + 1]) * 0.5 + 4;
      vel[i * 3] *= 1.4;
    }
    if (preset.kind === 'snow') {
      vel[i * 3 + 1] *= 0.35;
      vel[i * 3] += Math.sin(i) * 0.8;
    }
    if (preset.kind === 'mist') {
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
      vel[i * 3] *= 0.5;
    }
  }

  setZone(zoneName) {
    const preset = ZONE_PRESETS[zoneName] ?? ZONE_PRESETS.hub;
    if (preset.kind === this.preset?.kind && zoneName === this.zone) return;
    this.zone = zoneName;
    this.preset = preset;
    this._buildParticles(preset);

    const fog = this.scene.fog;
    if (fog?.isFogExp2) {
      const base = zoneName === 'space' ? 0.0028 : zoneName === 'abyss' ? 0.0045 : 0.0038;
      fog.density = base + (preset.fogBoost ?? 0);
    }
  }

  update(dt, playerPos) {
    if (!this.particles || !this.velocities) return;

    this._follow.lerp(playerPos, dt * 2.5);
    this.group.position.set(this._follow.x, 0, this._follow.z);

    const arr = this.particles.geometry.attributes.position.array;
    const vel = this.velocities;
    const preset = this.preset;
    const groundBase = this.world.getGroundHeight(playerPos.x, playerPos.z);

    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3] += vel[i * 3] * dt;
      arr[i * 3 + 1] += vel[i * 3 + 1] * dt;
      arr[i * 3 + 2] += vel[i * 3 + 2] * dt;

      const px = arr[i * 3];
      const py = arr[i * 3 + 1];
      const pz = arr[i * 3 + 2];
      const gy = this.world.getGroundHeight(px, pz) + 0.5;

      const outOfBox =
        Math.abs(px - this._follow.x) > this._box.x
        || Math.abs(pz - this._follow.z) > this._box.z
        || py < gy - 2
        || py > this._box.y + 8;

      if (outOfBox) {
        this._randomizeParticle(arr, vel, i, preset, false);
        arr[i * 3 + 1] = this._box.y + Math.random() * 6;
      }

      if (preset.kind === 'snow') {
        vel[i * 3] += Math.sin(performance.now() * 0.001 + i) * dt * 0.4;
      }
    }

    this.particles.geometry.attributes.position.needsUpdate = true;

    if (preset.kind === 'rain' && Math.random() < dt * 18) {
      this._spawnSplash(
        playerPos.x + (Math.random() - 0.5) * 20,
        playerPos.z + (Math.random() - 0.5) * 20,
        groundBase
      );
    }
  }

  _spawnSplash(x, z, gy) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.02, 0.12, 6),
      new THREE.MeshBasicMaterial({ color: 0x8899aa, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, gy + 0.05, z);
    this.splashGroup.add(ring);
    let life = 0.25;
    const tick = () => {
      life -= 0.016;
      ring.material.opacity = life * 2;
      ring.scale.multiplyScalar(1.08);
      if (life <= 0) {
        this.splashGroup.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
    if (this.splashGroup.children.length > 40) {
      const old = this.splashGroup.children[0];
      this.splashGroup.remove(old);
      old.geometry?.dispose();
      old.material?.dispose();
    }
  }
}
