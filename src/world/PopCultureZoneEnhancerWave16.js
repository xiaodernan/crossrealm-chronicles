/**
 * Wave15 POI ——「武士残响 · Samurai Echo」（W-E9 切片1）
 * 武士母题（SAMURAI）此前只有三枚（鸟居残门 / 道场废墟 / 樱落刃冢），全是幻想大陆。
 * 这一片补它三枚：浪然桥头 / 战鼓残腔 / 残席茶器，全在 fantasy 位面；
 * 与「残席茶器」一起把日式庭院/茶道/战国的气质挂上中式幻想的同时，又把武士三叠补回。
 *
 * 与 Wave3–Wave14 同一套纪律：addPOI + fireEcho，找不到 zone 整块跳过，绝不抛错。
 */
import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

export function attachPopCultureZonesWave16(game) {
  const world = game.world;
  if (!world?.zones) return;

  const fantasy = findZoneById(world.zones, ZONE_IDS.FANTASY);
  if (!fantasy) return;

  attachRoninBridgeHomage(fantasy, world, game);
  attachWarDrumHomage(fantasy, world, game);
  attachTeaWareHomage(fantasy, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}

function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 浪人桥头（浪人 · 断桥 — 主人不在，但桥还在）──
function attachRoninBridgeHomage(zone, world, game) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3d3833, roughness: 0.92 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3221, roughness: 0.85 });
  const gy = zone.groundYAt(-95, 150);

  // 两座桥墩
  for (const dx of [-1.6, 1.6]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.3, 0.55), stoneMat);
    pillar.position.set(-95 + dx, gy + 1.15, 150);
    zone.group.add(pillar);
  }
  // 桥身（稍微震坏的一块板）
  const plank = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.05), woodMat);
  plank.position.set(-95, gy + 2.41, 150);
  plank.rotation.z = 0.12;
  zone.group.add(plank);
  // 挂着的旧斗笠（浪人留下的）
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.18, 8), stoneMat);
  hat.position.set(-95, gy + 2.62, 150);
  zone.group.add(hat);

  registerPoi(world, zone, { x: -95, y: 0, z: 150 }, 'echo_ronin_bridge_title', () => {
    game.dialog.show(t('echo_ronin_bridge_title'), t('echo_ronin_bridge_desc'));
    fireEcho(game, 'echo:ronin-bridge');
  }, { id: 'homage-samurai-ronin-bridge', color: 0x7a5230 });
}

// ── 战鼓残腔（战场遗址 — 旗倒了，但鼓还在自己敲）──
function attachWarDrumHomage(zone, world, game) {
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x5a2d1e, roughness: 0.78 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd8b87a, roughness: 0.6 });
  const gy = zone.groundYAt(140, -120);

  // 战鼓主体（木架 + 鼓身）
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), drumMat);
  base.position.set(140, gy + 0.15, -120);
  zone.group.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.05, 10), drumMat);
  body.position.set(140, gy + 0.82, -120);
  zone.group.add(body);
  // 两圈牛皮鼓面
  for (const dy of [1.28, 0.35]) {
    const skin = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.05, 10), ropeMat);
    skin.position.set(140, gy + dy, -120);
    zone.group.add(skin);
  }
  // 倒地的战旗杆
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), drumMat);
  pole.position.set(140.9, gy + 0.18, -119.4);
  pole.rotation.z = Math.PI / 2.2;
  zone.group.add(pole);

  registerPoi(world, zone, { x: 140, y: 0, z: -120 }, 'echo_war_drum_title', () => {
    game.dialog.show(t('echo_war_drum_title'), t('echo_war_drum_desc'));
    fireEcho(game, 'echo:war-drum');
    game.wave4VisualFx?.flash?.('samurai');
  }, { id: 'homage-samurai-war-drum', color: 0x8a3a26 });
}

// ── 残席茶器（战后茶会 — 没人敢先动）──
function attachTeaWareHomage(zone, world, game) {
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.9 });
  const celadonMat = new THREE.MeshStandardMaterial({
    color: 0x9db8a8,
    metalness: 0.15,
    roughness: 0.32,
    emissive: 0x1c2a1c,
    emissiveIntensity: 0.25,
  });
  const gy = zone.groundYAt(110, 80);

  // 低案（茶席桌面）
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.95), trayMat);
  tray.position.set(110, gy + 0.42, 80);
  zone.group.add(tray);
  for (const dx of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.9), trayMat);
    leg.position.set(110 + dx, gy + 0.21, 80);
    zone.group.add(leg);
  }
  // 两只茶碗（一只是完整的，一只裂了）
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.14, 8), celadonMat);
  bowl.position.set(109.62, gy + 0.56, 79.84);
  zone.group.add(bowl);
  const bowlCracked = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.12, 8, 1, true), celadonMat);
  bowlCracked.position.set(110.42, gy + 0.55, 80.18);
  bowlCracked.rotation.z = 0.45;
  zone.group.add(bowlCracked);

  registerPoi(world, zone, { x: 110, y: 0, z: 80 }, 'echo_tea_ware_title', () => {
    game.dialog.show(t('echo_tea_ware_title'), t('echo_tea_ware_desc'));
    fireEcho(game, 'echo:tea-ware');
  }, { id: 'homage-samurai-tea-ware', color: 0x9db8a8 });
}
