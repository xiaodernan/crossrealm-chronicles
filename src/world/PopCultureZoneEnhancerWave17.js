/**
 * Wave16 POI ——「深空孔径 · Deep Sky Aperture」（W-E10 切片1）
 * 宇宙母题（COSMIC）此前只有三枚（触须方尖碑 / 疯狂抄写室 / 螺旋深井），全在 void。
 * 这一片补它三枚：黑砂石碑 / 坠锚飞行员 / 将熄的星骸，全在 void 位面；
 * 与「黑砂石碑」一起把位面的"与时间和衰亡交手"的色调收成一个更完整的故事。
 *
 * 与 Wave3–Wave15 同一套纪律：addPOI + fireEcho，找不到 zone 整块跳过，绝不抛错。
 */
import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

export function attachPopCultureZonesWave17(game) {
  const world = game.world;
  if (!world?.zones) return;

  const voidZ = findZoneById(world.zones, ZONE_IDS.VOID);
  if (!voidZ) return;

  attachGrainObeliskHomage(voidZ, world, game);
  attachPilotCrashHomage(voidZ, world, game);
  attachStarDerelictHomage(voidZ, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}

function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 黑砂石碑（太空中最早的石刻——比任何文明都更早）──
function attachGrainObeliskHomage(zone, world, game) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x171410, roughness: 0.95, emissive: 0x3a2a1f, emissiveIntensity: 0.2 });
  const grainMat = new THREE.MeshStandardMaterial({ color: 0x3d322a, roughness: 0.7, emissive: 0x221a14, emissiveIntensity: 0.3 });
  const gy = zone.groundYAt(-55, -72);

  // 碑体（四方石柱，压矮的顶长八面体——古老但仍在）
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.5, 1.0), stoneMat);
  body.position.set(-55, gy + 2.25, -72);
  zone.group.add(body);
  // 八面体顶盖
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(1.0), grainMat);
  cap.position.set(-55, gy + 4.9, -72);
  cap.rotation.set(0.3, 0.3, 0.3);
  zone.group.add(cap);
  // 碑根残砂堆
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.7, 0.18, 9), grainMat);
  base.position.set(-55, gy + 0.09, -72);
  zone.group.add(base);

  registerPoi(world, zone, { x: -55, y: 0, z: -72 }, 'echo_grain_obelisk_title', () => {
    game.dialog.show(t('echo_grain_obelisk_title'), t('echo_grain_obelisk_desc'));
    fireEcho(game, 'echo:grain-obelisk');
  }, { id: 'homage-cosmic-grain-obelisk', color: 0x3a2a1f });
}

// ── 坠锚飞行员（引力带仍在以不安的周期降落——距坠五百年了）──
function attachPilotCrashHomage(zone, world, game) {
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, metalness: 0.75, roughness: 0.3 });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff5522,
    emissive: 0xff3300,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const gy = zone.groundYAt(40, 85);

  // 坠落的碎环
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 24, Math.PI * 1.3), steelMat);
  ring.rotation.set(0.4, 0.2, 0);
  ring.position.set(40, gy + 0.5, 85);
  zone.group.add(ring);
  // 碎石片阵
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.18 + Math.random() * 0.22), steelMat);
    shard.position.set(40 + Math.cos(angle) * 2.2, gy + 0.1 + Math.random() * 0.2, 85 + Math.sin(angle) * 2.2);
    shard.rotation.set(Math.random(), Math.random(), Math.random());
    zone.group.add(shard);
  }
  // 核心残渣（还带余热）
  const ember = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.3), emberMat);
  ember.position.set(40, gy + 0.15, 85);
  zone.group.add(ember);

  registerPoi(world, zone, { x: 40, y: 0, z: 85 }, 'echo_pilot_crash_title', () => {
    game.dialog.show(t('echo_pilot_crash_title'), t('echo_pilot_crash_desc'));
    fireEcho(game, 'echo:pilot-crash');
  }, { id: 'homage-cosmic-pilot-crash', color: 0xff5522 });
}

// ── 将熄的星骸（只剩最后一次呼吸的星，忍着不亮下去）──
function attachStarDerelictHomage(zone, world, game) {
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2a2214, roughness: 0.95, emissive: 0x1a0e04, emissiveIntensity: 0.3 });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff8866,
    emissive: 0xff2200,
    emissiveIntensity: 2.4,
    roughness: 0.35,
  });
  const gy = zone.groundYAt(110, -30);

  // 星核残骸（不完全椭球体——被放大一圈，远看像一颗碎星）
  const hull = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), hullMat);
  hull.scale.set(1.25, 0.82, 0.9);
  hull.position.set(110, gy + 0.95, -30);
  hull.rotation.set(0.3, 0, 0.2);
  zone.group.add(hull);
  // 余烬点（还在缓缓搏动）
  const ember = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), emberMat);
  ember.position.set(110, gy + 0.9, -29.6);
  zone.group.add(ember);
  // 周围散落的小碎片
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const flake = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12 + Math.random() * 0.18), hullMat);
    flake.position.set(110 + Math.cos(angle) * 2.4, gy + 0.1 + Math.random() * 0.3, -30 + Math.sin(angle) * 2.4);
    flake.rotation.set(Math.random(), Math.random(), Math.random());
    zone.group.add(flake);
  }

  registerPoi(world, zone, { x: 110, y: 0, z: -30 }, 'echo_star_derelict_title', () => {
    game.dialog.show(t('echo_star_derelict_title'), t('echo_star_derelict_desc'));
    fireEcho(game, 'echo:star-derelict');
  }, { id: 'homage-cosmic-star-derelict', color: 0xff6644 });
}
