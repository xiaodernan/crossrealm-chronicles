import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

/**
 * Wave11 POI ——「返乡 / 归航」（W-E4 切片1）
 *
 * 结局呼应的一组回声：**走完所有位面之后，有人还记得回家的路**。
 * 四枚回声各自钉在自己的位面里（薄暮 / 辉煌 / 星际 / 深颚盐海）——
 * 玩家一扇一扇关上门之后，每一扇门背后都有一句"你回得来"。
 *
 * 与 Wave3–Wave8 同一套纪律：`addPOI` 由 zone 自己管交互，
 * `fireEcho` 广播 `pop-culture-echo`，找不到 zone 就整块跳过，绝不抛。
 * 四枚回声共用**返乡母题**（homecoming）——它钉在回声页签里自成一格。
 */
export function attachPopCultureZonesWave11(game) {
  const world = game.world;
  if (!world?.zones) return;

  const gloom = findZoneById(world.zones, ZONE_IDS.GLOOM);
  const radiant = findZoneById(world.zones, ZONE_IDS.RADIANT);
  const space = findZoneById(world.zones, ZONE_IDS.SPACE);
  const abyss = findZoneById(world.zones, ZONE_IDS.ABYSS);

  if (gloom) attachCairnHomage(gloom, world, game);
  if (radiant) attachDawnBellHomage(radiant, world, game);
  if (space) attachSecondBeaconHomage(space, world, game);
  if (abyss) attachHomeTideHomage(abyss, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}
function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 幽暗林地：归烬之碑（没烧尽的炭 + 旧姓石碑） ──
function attachCairnHomage(zone, world, game) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a423c, roughness: 0.92 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.9 });
  const gy = zone.groundYAt(262, 78);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.86, 0.26, 9), stoneMat);
  base.position.set(262, gy + 0.13, 78);
  zone.group.add(base);
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.22, 8), stoneMat);
  mid.position.set(262, gy + 0.37, 78);
  zone.group.add(mid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.2, 8), stoneMat);
  top.position.set(262, gy + 0.58, 78);
  zone.group.add(top);

  const ember = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), emberMat);
  ember.position.set(262, gy + 0.82, 78);
  zone.group.add(ember);

  registerPoi(world, zone, { x: 262, y: 0, z: 78 }, 'echo_homecoming_cairn_title', () => {
    game.dialog.show(t('echo_homecoming_cairn_title'), t('echo_homecoming_cairn_desc'));
    fireEcho(game, 'echo:homecoming-cairn');
  }, { id: 'homage-homecoming-cairn', color: 0xff8844 });
}

// ── 辉煌圣域：晨曦回铃（黄昏自鸣的铜铃） ──
function attachDawnBellHomage(zone, world, game) {
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a3a,
    emissive: 0x553300,
    emissiveIntensity: 0.55,
    metalness: 0.75,
    roughness: 0.35,
  });
  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.9 });
  const gy = zone.groundYAt(-205, -205);

  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 1.1), pedestalMat);
  pedestal.position.set(-205, gy + 0.75, -205);
  zone.group.add(pedestal);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 6, 16, Math.PI), bronzeMat);
  arch.position.set(-205, gy + 1.95, -205);
  zone.group.add(arch);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), bronzeMat);
  bell.position.set(-205, gy + 1.72, -205);
  zone.group.add(bell);
  const clapper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), pedestalMat);
  clapper.position.set(-205, gy + 1.4, -205);
  zone.group.add(clapper);

  registerPoi(world, zone, { x: -205, y: 0, z: -205 }, 'echo_homecoming_bell_title', () => {
    game.dialog.show(t('echo_homecoming_bell_title'), t('echo_homecoming_bell_desc'));
    fireEcho(game, 'echo:homecoming-bell');
  }, { id: 'homage-homecoming-bell', color: 0xffd98a });
}

// ── 星际空间站：第二信标（念你名字的应答信标） ──
function attachSecondBeaconHomage(zone, world, game) {
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x2c3540, metalness: 0.7, roughness: 0.4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.95 });
  const gy = zone.groundYAt(178, 130);

  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.2, 0.55), pylonMat);
  pylon.position.set(178, gy + 3.1, 130);
  zone.group.add(pylon);
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.09, 0.7), pylonMat);
    band.position.set(178, gy + 1.2 + i * 1.9, 130);
    zone.group.add(band);
  }
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), glowMat);
  orb.position.set(178, gy + 6.85, 130);
  zone.group.add(orb);

  registerPoi(world, zone, { x: 178, y: 0, z: 130 }, 'echo_homecoming_beacon_title', () => {
    game.dialog.show(t('echo_homecoming_beacon_title'), t('echo_homecoming_beacon_desc'));
    fireEcho(game, 'echo:homecoming-beacon');
  }, { id: 'homage-homecoming-beacon', color: 0x88ccff });
}

// ── 深颚盐海：盐海归潮（搁浅多年的旧船壳，船头指向枢纽） ──
function attachHomeTideHomage(zone, world, game) {
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3d332a, roughness: 0.9 });
  const sailMat = new THREE.MeshBasicMaterial({ color: 0x8a7d6e, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const gy = zone.groundYAt(-158, 175);

  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.75, 1.15), hullMat);
  hull.position.set(-158, gy + 0.38, 175);
  hull.rotation.y = 0.5;
  zone.group.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.1, 6), hullMat);
  bow.rotation.z = Math.PI / 2;
  bow.rotation.y = 0.5;
  bow.position.set(-156.4, gy + 0.42, 174.1);
  zone.group.add(bow);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 2.4, 6), hullMat);
  mast.position.set(-158, gy + 1.6, 175);
  mast.rotation.z = 0.28;
  zone.group.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), sailMat);
  sail.position.set(-157.55, gy + 1.7, 174.7);
  sail.rotation.y = 0.5;
  sail.rotation.z = 0.28;
  zone.group.add(sail);

  registerPoi(world, zone, { x: -158, y: 0, z: 175 }, 'echo_homecoming_tide_title', () => {
    game.dialog.show(t('echo_homecoming_tide_title'), t('echo_homecoming_tide_desc'));
    fireEcho(game, 'echo:homecoming-tide');
  }, { id: 'homage-homecoming-tide', color: 0x66aa99 });
}
