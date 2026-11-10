import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

/**
 * Wave6 POI —— 虚空断口 × 深渊之颚（W-E3 切片102）
 *
 * Wave5 给幽暗林地 / 辉煌圣域补了两位母题（薄暮回响 / 辉煌残响）。虚空断口与深渊之颚
 * 一直只有既有名族（UPSIDE / COSMIC / FAMILY）的致敬，没有"本作原创神话"的一笔。
 * 这一波补各自**一枚**：算式、落点、自检沿用 Wave3–Wave5 同一套纪律（`addPOI` 由 zone 自己管、
 * 交互走 `fireEcho`）。任何一块的 `findZoneById` 找不到就整块跳过，不报错。
 */
export function attachPopCultureZonesWave6(game) {
  const world = game.world;
  if (!world?.zones) return;

  const voidZone = findZoneById(world.zones, ZONE_IDS.VOID);
  const abyss = findZoneById(world.zones, ZONE_IDS.ABYSS);

  if (voidZone) attachAstrolabeHomage(voidZone, world, game);
  if (abyss) attachSaltSteleHomage(abyss, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}
function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 虚空断口：断口星盘（Armillary 母题）──
function attachAstrolabeHomage(zone, world, game) {
  // 断口边缘卧着一座断了的星盘：石座 + 三环歪斜 + 蓝环核心
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2e2e3c, roughness: 0.92 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.35, 0.55, 12), baseMat);
  base.position.set(58, zone.groundYAt(58, 272) + 0.28, 272);
  zone.group.add(base);

  const ringSpecs = [
    { r: 1.05, tube: 0.075, color: 0xb8c4d4, rot: [0.4, 0, 0] },
    { r: 0.82, tube: 0.065, color: 0x8899aa, rot: [0, 1.1, 0.6] },
    { r: 0.58, tube: 0.055, color: 0x667788, rot: [1.9, 0, 0] },
  ];
  const gy = zone.groundYAt(58, 272) + 1.25;
  for (const spec of ringSpecs) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(spec.r, spec.tube, 10, 40),
      new THREE.MeshStandardMaterial({ color: spec.color, metalness: 0.8, roughness: 0.35, emissive: 0x223344, emissiveIntensity: 0.35 })
    );
    ring.position.set(58, gy, 272);
    ring.rotation.set(...spec.rot);
    zone.group.add(ring);
  }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x99ccff, emissive: 0x4477aa, emissiveIntensity: 0.7, roughness: 0.4 })
  );
  core.position.set(58, gy, 272);
  zone.group.add(core);

  registerPoi(world, zone, { x: 58, y: 0, z: 272 }, 'echo_void_astrolabe_title', () => {
    game.dialog.show(t('echo_void_astrolabe_title'), t('echo_void_astrolabe_desc'));
    fireEcho(game, 'echo:void-astrolabe');
  }, { id: 'homage-void-astrolabe', color: 0x99ccff });
}

// ── 深渊之颚：深颚盐碑（Salt Stele 母题）──
function attachSaltSteleHomage(zone, world, game) {
  // 三根盐蚀玄武岩石碑 + 顶上结霜 + 一块倒塌的石板
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x211c24, roughness: 0.9 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.85 });
  const specs = [
    { x: -222, z: 285, h: 2.4 },
    { x: -223.6, z: 287, h: 1.6 },
    { x: -220.4, z: 286.6, h: 2.7 },
  ];
  for (const s of specs) {
    const gy = zone.groundYAt(s.x, s.z);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, s.h, 8), pillarMat);
    pillar.position.set(s.x, gy + s.h / 2, s.z);
    zone.group.add(pillar);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.44, 0.28, 8), capMat);
    cap.position.set(s.x, gy + s.h + 0.14, s.z);
    zone.group.add(cap);
  }
  // 倒塌的碑体（半截埋在沙里）
  const gy = zone.groundYAt(-221.2, 288.5);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.1), pillarMat);
  slab.position.set(-221.2, gy + 0.18, 288.5);
  slab.rotation.z = 0.32;
  slab.rotation.y = 0.45;
  zone.group.add(slab);
  // 碑脚的盐霜
  const saltMat = new THREE.MeshStandardMaterial({ color: 0xded8c8, roughness: 0.95 });
  for (const [dx, dz, r] of [[-0.8, 1.0, 0.3], [0.9, 0.6, 0.22], [0.1, 1.6, 0.26]]) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, 0.06, 10), saltMat);
    disc.position.set(-222 + dx, zone.groundYAt(-222 + dx, 285 + dz) + 0.03, 285 + dz);
    zone.group.add(disc);
  }

  registerPoi(world, zone, { x: -222, y: 0, z: 285 }, 'echo_abyss_stele_title', () => {
    game.dialog.show(t('echo_abyss_stele_title'), t('echo_abyss_stele_desc'));
    fireEcho(game, 'echo:abyss-stele');
  }, { id: 'homage-abyss-stele', color: 0xd8d2c0 });
}
