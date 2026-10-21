import * as THREE from 'three';
import { ZONE_IDS } from '../content/ZoneIdentity.js';
import { shouldUpdate as frameShouldUpdate } from '../engine/FrameBudget.js';
import { releaseSubtree } from '../engine/releaseSubtree.js';

/**
 * 光球 / 余烬每秒的浮动速率（米/秒）。
 *
 * 改前写的是 `arr[i + 1] += Math.sin(墙钟 + i) * 0.002` —— 既**不乘 dt**，量的是"每一帧"，
 * 而帧与帧之间隔多久由机器说了算。实测同一秒世界时：60 帧漂移 0.00030，180 帧漂移 0.00093
 * （`.tmp-20261015/probe-visual-clock.log`，3.1 倍）。换算成每秒值之后，60 fps 下的逐帧增量
 * 与改前一字不差（`0.002 × 60`），帧率与它无关了。同一条口径的先例见
 * `WeatherSystem` 的 `SPLASH_GROWTH_PER_SEC`（W-A1 切片4 / B43）。
 */
const 光球浮速 = 0.002 * 60;
const 余烬浮速 = 0.003 * 60;

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
    /** 世界时累计（秒）：极光等振荡的相位源（B118，同 `SoulWispManager._时相` 的口径） */
    this._时相 = 0;
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
    // 用 `ZONE_IDS` 符号而不是字面量：id 若改名，这里必须编译期就跟着变（字面量只会静默不再匹配）
    this.fireflies.visible = zoneId === ZONE_IDS.FANTASY || zoneId === ZONE_IDS.HUB;
    this.magicOrbs.visible = zoneId === ZONE_IDS.MAGIC;
    this.starField.visible = zoneId === ZONE_IDS.SPACE;
    this.aurora.visible = zoneId === ZONE_IDS.SPACE || zoneId === ZONE_IDS.FANTASY || zoneId === ZONE_IDS.VOID;
    this.chaosEmbers.visible = zoneId === ZONE_IDS.ABYSS;

    if (center) {
      this.group.position.set(center.x, 0, center.z);
    }

    this.clearZoneLights();
    if (zoneId === ZONE_IDS.MAGIC) {
      this.addZoneLight(0x6644cc, 0.4, 80);
    } else if (zoneId === ZONE_IDS.SPACE) {
      this.addZoneLight(0x2244aa, 0.3, 100);
    } else if (zoneId === ZONE_IDS.FANTASY) {
      this.addZoneLight(0x88aa66, 0.25, 90);
    } else if (zoneId === ZONE_IDS.ABYSS) {
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
    // 相位累积每帧做（B118：慢动作里视觉相位不传送、不冻结），
    // 几何更新降频到 1/2 帧（W-C2 切片4 余项：纯装饰性视觉不需每帧跑）。
    const 几何帧 = frameShouldUpdate(2);
    this._时相 += dt;
    const t = this._时相;
    if (this.fireflies?.visible && 几何帧) this.fireflies.rotation.y += dt * 0.02;
    if (this.magicOrbs?.visible && 几何帧) {
      this.magicOrbs.rotation.y += dt * 0.05;
      const arr = this.magicOrbs.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(t + i) * 光球浮速 * dt;
      }
      this.magicOrbs.geometry.attributes.position.needsUpdate = true;
    }
    if (this.aurora?.visible && 几何帧) {
      this.aurora.material.opacity = 0.06 + Math.sin(t * 0.5) * 0.04;
      this.aurora.rotation.z = Math.sin(t * 0.2) * 0.1;
    }
    if (this.chaosEmbers?.visible && 几何帧) {
      this.chaosEmbers.rotation.y += dt * 0.03;
      const arr = this.chaosEmbers.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(t * 1.2 + i * 0.1) * 余烬浮速 * dt;
      }
      this.chaosEmbers.geometry.attributes.position.needsUpdate = true;
    }
    this.updateMeteors(dt);
    this.group.position.lerp(new THREE.Vector3(playerPos.x * 0.3, 0, playerPos.z * 0.3), dt * 0.5);
  }

  /**
   * 拆干净：把世界特效那一组从场景里摘掉，释放流星 / 萤火 / 奥术球 / 星野 / 极光 / 余烬的
   * 几何与材质。
   *
   * 为什么现在才有（W-C1 切片3e）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，它造的那些几何与材质**一份都不还**。
   */
  dispose() {
    this.scene.remove(this.group);
    releaseSubtree(this.group);
  }
}
