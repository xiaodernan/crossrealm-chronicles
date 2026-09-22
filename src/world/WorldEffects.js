import * as THREE from 'three';

/** 区域天空、粒子、氛围光 */
export class WorldEffects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.fireflies = null;
    this.magicOrbs = null;
    this.starField = null;
    this.aurora = null;
    this.chaosEmbers = null;
    this.meteorStreaks = [];
    this.meteorTimer = 0;
    this.zoneLights = [];
    this.build();
  }

  build() {
    this.buildFireflies();
    this.buildMagicOrbs();
    this.buildStarField();
    this.buildAurora();
    this.buildChaosEmbers();
    this.buildMeteorPool();
  }

  buildMeteorPool() {
    this.meteorStreaks = [];
    for (let i = 0; i < 6; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -18, -8),
      ]);
      const streak = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xaaccff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      }));
      streak.visible = false;
      this.group.add(streak);
      this.meteorStreaks.push({ mesh: streak, life: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  spawnMeteor() {
    const slot = this.meteorStreaks.find((m) => m.life <= 0);
    if (!slot) return;
    slot.life = 0.9;
    slot.mesh.visible = true;
    slot.mesh.position.set(
      (Math.random() - 0.5) * 200,
      80 + Math.random() * 60,
      (Math.random() - 0.5) * 200,
    );
    slot.vx = (Math.random() - 0.5) * 20;
    slot.vy = -35 - Math.random() * 25;
    slot.vz = (Math.random() - 0.5) * 20;
    slot.mesh.material.opacity = 0.85;
  }

  updateMeteors(dt) {
    if (!this.starField?.visible) return;
    this.meteorTimer -= dt;
    if (this.meteorTimer <= 0) {
      this.meteorTimer = 1.5 + Math.random() * 3;
      this.spawnMeteor();
    }
    for (const m of this.meteorStreaks) {
      if (m.life <= 0) continue;
      m.life -= dt;
      m.mesh.position.x += m.vx * dt;
      m.mesh.position.y += m.vy * dt;
      m.mesh.position.z += m.vz * dt;
      m.mesh.material.opacity = Math.max(0, m.life);
      if (m.life <= 0) m.mesh.visible = false;
    }
  }

  buildFireflies() {
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 200;
      pos[i * 3 + 1] = 0.5 + Math.random() * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflies = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaaff66, size: 0.35, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
    }));
    this.fireflies.visible = false;
    this.group.add(this.fireflies);
  }

  buildMagicOrbs() {
    const n = 80;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 180;
      pos[i * 3 + 1] = 2 + Math.random() * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 180;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.magicOrbs = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xaa66ff, size: 0.45, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending,
    }));
    this.magicOrbs.visible = false;
    this.group.add(this.magicOrbs);
  }

  buildStarField() {
    const n = 800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 600;
      pos[i * 3 + 1] = 40 + Math.random() * 200;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 600;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starField = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.6, transparent: true, opacity: 0.9,
    }));
    this.starField.visible = false;
    this.group.add(this.starField);
  }

  buildAurora() {
    const geo = new THREE.PlaneGeometry(300, 80);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44ffaa,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.aurora = new THREE.Mesh(geo, mat);
    this.aurora.rotation.x = -Math.PI / 3;
    this.aurora.position.y = 60;
    this.aurora.visible = false;
    this.group.add(this.aurora);
  }

  buildChaosEmbers() {
    const n = 100;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 160;
      pos[i * 3 + 1] = 0.5 + Math.random() * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.chaosEmbers = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xff2244, size: 0.4, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending,
    }));
    this.chaosEmbers.visible = false;
    this.group.add(this.chaosEmbers);
  }

  setZone(zoneId, center) {
    this.fireflies.visible = zoneId === 'fantasy' || zoneId === 'hub';
    this.magicOrbs.visible = zoneId === 'magic';
    this.starField.visible = zoneId === 'space';
    this.aurora.visible = zoneId === 'space' || zoneId === 'fantasy' || zoneId === 'void';
    this.chaosEmbers.visible = zoneId === 'abyss';

    if (center) {
      this.group.position.set(center.x, 0, center.z);
    }

    this.clearZoneLights();
    if (zoneId === 'magic') {
      this.addZoneLight(0x6644cc, 0.4, 80);
    } else if (zoneId === 'space') {
      this.addZoneLight(0x2244aa, 0.3, 100);
    } else if (zoneId === 'fantasy') {
      this.addZoneLight(0x88aa66, 0.25, 90);
    } else if (zoneId === 'abyss') {
      this.addZoneLight(0xff2244, 0.3, 95);
    }
  }

  addZoneLight(color, intensity, distance) {
    const l = new THREE.PointLight(color, intensity, distance);
    l.position.set(0, 15, 0);
    this.group.add(l);
    this.zoneLights.push(l);
  }

  clearZoneLights() {
    for (const l of this.zoneLights) this.group.remove(l);
    this.zoneLights = [];
  }

  update(dt, playerPos) {
    const t = performance.now() * 0.001;
    if (this.fireflies?.visible) this.fireflies.rotation.y += dt * 0.02;
    if (this.magicOrbs?.visible) {
      this.magicOrbs.rotation.y += dt * 0.05;
      const arr = this.magicOrbs.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(t + i) * 0.002;
      }
      this.magicOrbs.geometry.attributes.position.needsUpdate = true;
    }
    if (this.aurora?.visible) {
      this.aurora.material.opacity = 0.06 + Math.sin(t * 0.5) * 0.04;
      this.aurora.rotation.z = Math.sin(t * 0.2) * 0.1;
    }
    if (this.chaosEmbers?.visible) {
      this.chaosEmbers.rotation.y += dt * 0.03;
      const arr = this.chaosEmbers.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(t * 1.2 + i * 0.1) * 0.003;
      }
      this.chaosEmbers.geometry.attributes.position.needsUpdate = true;
    }
    this.updateMeteors(dt);
    this.group.position.lerp(new THREE.Vector3(playerPos.x * 0.3, 0, playerPos.z * 0.3), dt * 0.5);
  }
}
