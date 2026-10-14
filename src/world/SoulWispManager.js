import * as THREE from 'three';
import { addShake } from '../engine/Shake.js';
import { ZONE_IDS } from '../content/ZoneIdentity.js';

/**
 * 位面残响 — 漂浮魂火，靠近会被吸引并吸收
 *
 * id 里的位面前缀（`wisp-fantasy`…）只是历史巧合，不是契约 —— 位面归属写成显式一格
 * （W-B12 切片2），支线判据问 `collectedInZone(zone)`，不再自己拿 id 拼前缀。
 */
const WISP_SPOTS = [
  { id: 'wisp-hub', zone: ZONE_IDS.HUB, x: -15, z: 48, souls: 8 },
  { id: 'wisp-hub2', zone: ZONE_IDS.HUB, x: 18, z: 62, souls: 8 },
  { id: 'wisp-fantasy', zone: ZONE_IDS.FANTASY, x: -175, z: 25, souls: 12 },
  { id: 'wisp-fantasy2', zone: ZONE_IDS.FANTASY, x: -230, z: -20, souls: 15 },
  { id: 'wisp-magic', zone: ZONE_IDS.MAGIC, x: -25, z: -195, souls: 12 },
  { id: 'wisp-magic2', zone: ZONE_IDS.MAGIC, x: 40, z: -170, souls: 14 },
  { id: 'wisp-space', zone: ZONE_IDS.SPACE, x: 185, z: 70, souls: 12 },
  { id: 'wisp-space2', zone: ZONE_IDS.SPACE, x: 220, z: 120, souls: 15 },
  { id: 'wisp-void', zone: ZONE_IDS.VOID, x: 10, z: 205, souls: 18 },
  { id: 'wisp-void2', zone: ZONE_IDS.VOID, x: -15, z: 235, souls: 20 },
  { id: 'wisp-abyss', zone: ZONE_IDS.ABYSS, x: -210, z: 205, souls: 18 },
  { id: 'wisp-abyss2', zone: ZONE_IDS.ABYSS, x: -185, z: 250, souls: 22 },
];

const CHASE_RANGE = 38;
const COLLECT_RANGE = 2.8;
const CHASE_SPEED = 3.2;

export class SoulWispManager {
  constructor(scene, world, stats, dialog, audio) {
    this.scene = scene;
    this.world = world;
    this.stats = stats;
    this.dialog = dialog;
    this.audio = audio;
    this.wisps = [];
    this.collected = new Set();
    this._chaseSoundTimer = 0;
    /**
     * 世界时累计（秒）—— 漂浮与脉动的相位由它推出来（B118）。
     * 改前这里写 `performance.now()`，于是同一条 `update` 有两个时钟：`rotation.y += dt * 1.2`
     * 吃世界时，`sin(t*2 + phase)` 吃墙钟。实测（`.tmp-20261015/probe-visual-clock.mjs`）
     * 时停那一档（60 帧 × dt=0，真实时间照样过了 1 秒）魂火仍走出 **0.649 米** 的上下路径、
     * 光晕缩放累计 0.413、透明度累计 0.265 —— B/A 全是 1.000，"世界凝住"凝的只有别人。
     */
    this._时相 = 0;
    this.build();
  }

  build() {
    for (const spot of WISP_SPOTS) {
      const y = this.world.getGroundHeight(spot.x, spot.z);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 10),
        new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.9 })
      );
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 10, 10),
        new THREE.MeshBasicMaterial({
          color: 0x66ccff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending,
        })
      );
      const group = new THREE.Group();
      group.add(glow);
      group.add(core);
      group.position.set(spot.x, y + 1.2, spot.z);
      group.userData.wisp = spot;
      this.scene.add(group);
      this.wisps.push({
        spot, mesh: group, phase: Math.random() * Math.PI * 2, collected: false,
        px: spot.x, pz: spot.z, chasing: false,
      });
    }
  }

  update(dt, playerPos) {
    this._时相 += dt;
    const t = this._时相;
    let anyChasing = false;

    for (const w of this.wisps) {
      if (w.collected) {
        w.mesh.visible = false;
        continue;
      }

      const dx = playerPos.x - w.px;
      const dz = playerPos.z - w.pz;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < CHASE_RANGE && dist > COLLECT_RANGE) {
        const step = CHASE_SPEED * dt * (1 + (CHASE_RANGE - dist) / CHASE_RANGE * 0.6);
        w.px += (dx / dist) * step;
        w.pz += (dz / dist) * step;
        w.chasing = true;
        anyChasing = true;
        w.mesh.children[1].material.color.setHex(0xffcc66);
      } else {
        w.chasing = false;
        w.mesh.children[1].material.color.setHex(0x66ccff);
      }

      const gy = this.world.getGroundHeight(w.px, w.pz);
      w.mesh.position.set(w.px, gy + 1.2 + Math.sin(t * 2 + w.phase) * 0.35, w.pz);
      w.mesh.rotation.y += dt * (w.chasing ? 2.4 : 1.2);
      glowPulse(w.mesh.children[0], t, w.phase, w.chasing);

      if (dist < COLLECT_RANGE) this.collect(w);
    }

    if (anyChasing) {
      this._chaseSoundTimer -= dt;
      if (this._chaseSoundTimer <= 0) {
        this.audio?.wispChase?.();
        this._chaseSoundTimer = 0.35;
      }
    }
  }

  collect(w) {
    if (w.collected || this.collected.has(w.spot.id)) return;
    w.collected = true;
    this.collected.add(w.spot.id);
    this.stats.addSouls(w.spot.souls);
    this.audio?.wispAbsorb?.();
    this.dialog.toast(`吸收位面残响 +${w.spot.souls} 魂`);
    window.dispatchEvent(new CustomEvent('soul-wisp-collected', { detail: { id: w.spot.id, souls: w.spot.souls } }));
    window.dispatchEvent(new CustomEvent('discovery', {
      detail: { id: w.spot.id, title: '位面残响', text: '游荡在位面缝中的记忆碎片，会追踪靠近的行者。' },
    }));
    addShake(0.04);
  }

  toJSON() {
    return [...this.collected];
  }

  /**
   * 该位面已收下几枚萤火 —— 子系统自报的读数（支线判据的唯一问法，W-B12 切片2）。
   * `collected` 与存档往返（`toJSON`/`fromJSON`），所以读档后这个数不失真。
   */
  collectedInZone(zone) {
    return this.wisps.filter((w) => w.spot.zone === zone && this.collected.has(w.spot.id)).length;
  }

  fromJSON(list) {
    if (!list) return;
    for (const id of list) {
      this.collected.add(id);
      const w = this.wisps.find((x) => x.spot.id === id);
      if (w) w.collected = true;
    }
  }
}

function glowPulse(glowMesh, t, phase, chasing) {
  const pulse = chasing ? 0.22 : 0.15;
  glowMesh.scale.setScalar(1 + Math.sin(t * 3 + phase) * pulse);
  glowMesh.material.opacity = (chasing ? 0.35 : 0.25) + Math.sin(t * 4 + phase) * 0.12;
}
