import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

/**
 * Wave5 POI —— 幽暗林地 × 辉煌圣域（W-E3 切片99）
 *
 * Wave1-4 把四族的致敬都铺上了，幽暗林地与辉煌圣域一条都没有。
 * 这一波补各自**一处**：算式、落点、自检沿用 Wave3 同一套纪律（`addPOI` 由 zone 自己管、
 * 交互再 `fireEcho`）。任何一块的 `findZoneById` 找不到就整块跳过，不报错。
 */
export function attachPopCultureZonesWave5(game) {
  const world = game.world;
  if (!world?.zones) return;

  const gloom = findZoneById(world.zones, ZONE_IDS.GLOOM);
  const radiant = findZoneById(world.zones, ZONE_IDS.RADIANT);

  if (gloom) attachNineStonesHomage(gloom, world, game);
  if (radiant) attachToriiHomage(radiant, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}
function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 幽暗林地：九石环（中土·幽暗林母题）──
function attachNineStonesHomage(zone, world, game) {
  // 9 块立石围成的石环 —— 雾气里单层环形，光标 hover 到 POI 时才显亮环
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d3d55, roughness: 0.92 });
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const px = 210 + Math.cos(angle) * 7.5;
    const pz = 125 + Math.sin(angle) * 7.5;
    const h = 1.9 + (Math.sin(i * 2.4) * 0.5 + 0.6);
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.9, h, 0.55), mat);
    stone.position.set(px, zone.groundYAt(px, pz) + h / 2, pz);
    stone.rotation.y = angle + Math.sin(i * 1.7) * 0.4;
    zone.group.add(stone);
  }
  // 环心地板石碑（纯装饰）
  const altarMat = new THREE.MeshStandardMaterial({ color: 0x50506e, roughness: 0.8 });
  const altar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 1.4), altarMat);
  altar.position.set(210, zone.groundYAt(210, 125) + 0.18, 125);
  zone.group.add(altar);

  registerPoi(world, zone, { x: 210, y: 0, z: 125 }, 'echo_gloom_stones_title', () => {
    game.dialog.show(t('echo_gloom_stones_title'), t('echo_gloom_stones_desc'));
    fireEcho(game, 'echo:gloom-nine-stones');
  }, { id: 'homage-gloom-stones', color: 0x6a9a7a });
}

// ── 辉煌圣域：圣曜武士之门（武士母题）──
function attachToriiHomage(zone, world, game) {
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8a2b1c, roughness: 0.7, metalness: 0.15 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.5, metalness: 0.3 });
  // 两根暗红柱 + 两道顶梁
  const px = -290, pz = -130;
  const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.6, 10), pillarMat);
  pillarL.position.set(px - 1.6, zone.groundYAt(px - 1.6, pz) + 1.8, pz);
  const pillarR = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.6, 10), pillarMat);
  pillarR.position.set(px + 1.6, zone.groundYAt(px + 1.6, pz) + 1.8, pz);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.34, 0.42), beamMat);
  beam.position.set(px, zone.groundYAt(px, pz) + 3.45, pz);
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 0.34), beamMat);
  beam2.position.set(px, zone.groundYAt(px, pz) + 2.55, pz);
  zone.group.add(pillarL, pillarR, beam, beam2);
  // 前头两盏石灯笼
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xb0a990, roughness: 0.85 });
  for (const side of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.9, 8), lanternMat);
    base.position.set(px + side * 2.6, zone.groundYAt(px + side * 2.6, pz + 1.4) + 0.45, pz + 1.4);
    zone.group.add(base);
  }

  registerPoi(world, zone, { x: px, y: 0, z: pz }, 'echo_radiant_torii_title', () => {
    game.dialog.show(t('echo_radiant_torii_title'), t('echo_radiant_torii_desc'));
    fireEcho(game, 'echo:radiant-torii');
  }, { id: 'homage-radiant-torii', color: 0xffdd88 });
}
