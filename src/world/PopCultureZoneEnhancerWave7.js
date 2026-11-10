import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

/**
 * Wave7 POI —— 虚空断口 × 深渊之颚巡礼补完（W-E3 切片103）
 *
 * Wave6 给两位新母题各补一枚。这一波各补**两枚**，把每母题扩到三条回声——
 * 巡礼任务（`side-voidmaw-tour` / `side-abysssalt-tour`，`countFranchise >= 3`）从此开得起来。
 * 纪律沿用 Wave3–Wave6：`addPOI` 由 zone 自己管、交互走 `fireEcho`、找不到 zone 就整块跳过。
 */
export function attachPopCultureZonesWave7(game) {
  const world = game.world;
  if (!world?.zones) return;

  const voidZone = findZoneById(world.zones, ZONE_IDS.VOID);
  const abyss = findZoneById(world.zones, ZONE_IDS.ABYSS);

  if (voidZone) {
    attachSundialHomage(voidZone, world, game);
    attachPearlHomage(voidZone, world, game);
  }
  if (abyss) {
    attachConchHomage(abyss, world, game);
    attachBoneGateHomage(abyss, world, game);
  }
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}
function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 虚空断口：断口日晷 ──
function attachSundialHomage(zone, world, game) {
  // 一地永远指不准的阴影：石盘 + 歪指针 + 一圈短刻柱
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3644, roughness: 0.9 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x8f7a4a, metalness: 0.75, roughness: 0.4, emissive: 0x2a1f08, emissiveIntensity: 0.4 });
  const gy = zone.groundYAt(75, 265);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.4, 12), stoneMat);
  dial.position.set(75, gy + 0.2, 265);
  zone.group.add(dial);
  const gnomon = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 8), bronzeMat);
  gnomon.position.set(75, gy + 0.75, 265);
  gnomon.rotation.z = 0.6;
  zone.group.add(gnomon);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const px = 75 + Math.cos(angle) * 1.45;
    const pz = 265 + Math.sin(angle) * 1.45;
    const tick = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), bronzeMat);
    tick.position.set(px, zone.groundYAt(px, pz) + 0.15, pz);
    zone.group.add(tick);
  }
  registerPoi(world, zone, { x: 75, y: 0, z: 265 }, 'echo_void_sundial_title', () => {
    game.dialog.show(t('echo_void_sundial_title'), t('echo_void_sundial_desc'));
    fireEcho(game, 'echo:void-sundial');
  }, { id: 'homage-void-sundial', color: 0xb8b090 });
}

// ── 虚空断口：断口珍珠 ──
function attachPearlHomage(zone, world, game) {
  // 两根断柱夹一串环链，环链正中悬一颗苍白珍珠
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.5 });
  const gy = zone.groundYAt(48, 252);
  const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.3, 8), ironMat);
  postL.position.set(45.6, gy + 1.15, 252);
  const postR = postL.clone();
  postR.position.x = 50.4;
  zone.group.add(postL, postR);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.8, 6), ironMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(48, gy + 2.35, 252);
  zone.group.add(bar);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5), ironMat);
  chain.position.set(48, gy + 1.85, 252);
  zone.group.add(chain);
  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xaaccee, emissive: 0x335577, emissiveIntensity: 0.65, roughness: 0.25, metalness: 0.2 })
  );
  pearl.position.set(48, gy + 1.22, 252);
  zone.group.add(pearl);
  registerPoi(world, zone, { x: 48, y: 0, z: 252 }, 'echo_void_pearl_title', () => {
    game.dialog.show(t('echo_void_pearl_title'), t('echo_void_pearl_desc'));
    fireEcho(game, 'echo:void-pearl');
  }, { id: 'homage-void-pearl', color: 0xaaccee });
}

// ── 深渊之颚：深颚海螺 ──
function attachConchHomage(zone, world, game) {
  // 一圈圈盘起来的盐霜巨螺：三堆白石 + 螺尖朝天
  const shellMat = new THREE.MeshStandardMaterial({ color: 0xded6c4, roughness: 0.85 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.95 });
  const gy = zone.groundYAt(-245, 292);
  const tiers = [
    { r: 1.3, h: 0.28, y: 0.14 },
    { r: 0.95, h: 0.26, y: 0.4 },
    { r: 0.62, h: 0.24, y: 0.66 },
  ];
  for (const tier of tiers) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(tier.r * 0.75, tier.r, tier.h, 10), shellMat);
    ring.position.set(-245, gy + tier.y, 292);
    zone.group.add(ring);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 8), darkMat);
  tip.position.set(-245, gy + 1.2, 292);
  zone.group.add(tip);
  registerPoi(world, zone, { x: -245, y: 0, z: 292 }, 'echo_abyss_conch_title', () => {
    game.dialog.show(t('echo_abyss_conch_title'), t('echo_abyss_conch_desc'));
    fireEcho(game, 'echo:abyss-conch');
  }, { id: 'homage-abyss-conch', color: 0xded6c4 });
}

// ── 深渊之颚：深颚骨门 ──
function attachBoneGateHomage(zone, world, game) {
  // 两根鲸骨拱 + 一道骨梁——礁石吞了半个门
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xd4cbb6, roughness: 0.8 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x1f1a1e, roughness: 0.95 });
  const gy = zone.groundYAt(-210, 275);
  const ribL = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.45, 3.4, 8), boneMat);
  ribL.position.set(-212.2, gy + 1.7, 275);
  ribL.rotation.z = 0.22;
  const ribR = ribL.clone();
  ribR.position.x = -207.8;
  ribR.rotation.z = -0.22;
  zone.group.add(ribL, ribR);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 5.2, 8), boneMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(-210, gy + 3.35, 275);
  zone.group.add(beam);
  const rubble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6, 0), rockMat);
  rubble.position.set(-213.4, zone.groundYAt(-213.4, 274) + 0.35, 274);
  zone.group.add(rubble);
  const rubble2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), rockMat);
  rubble2.position.set(-206.6, zone.groundYAt(-206.6, 276.2) + 0.3, 276.2);
  zone.group.add(rubble2);
  registerPoi(world, zone, { x: -210, y: 0, z: 275 }, 'echo_abyss_bonegate_title', () => {
    game.dialog.show(t('echo_abyss_bonegate_title'), t('echo_abyss_bonegate_desc'));
    fireEcho(game, 'echo:abyss-bonegate');
  }, { id: 'homage-abyss-bonegate', color: 0xd4cbb6 });
}
