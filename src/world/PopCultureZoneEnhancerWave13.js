/**
 * Wave13 POI ——「中洲回响 · Echoes of Middle-earth」（W-E7 切片1）
 *
 * 中洲母题（MIDDLE_EARTH）长期是回声页签里最单薄的一格——只有一枚「至尊之戒」。
 * 这一片补它三枚：亡者之路断剑、幽谷竖琴、秘银矿碎片。三枚与既有的那一枚（中洲最初的回声）
 * 共同把中洲母题钉满、并配上一条收尾成就「中洲低语」（集齐全部四枚）。
 *
 * 与 Wave3–Wave12 同一套纪律：addPOI + fireEcho，找不到 zone 整块跳过，绝不抛。
 */
import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

export function attachPopCultureZonesWave13(game) {
  const world = game.world;
  if (!world?.zones) return;

  const fantasy = findZoneById(world.zones, ZONE_IDS.FANTASY);
  if (!fantasy) return;

  attachBrokenSwordHomage(fantasy, world, game);
  attachElvenHarpHomage(fantasy, world, game);
  attachMithrilShardHomage(fantasy, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}
function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 亡者之路 · 断剑（Narsil —— 折断的圣剑插在黑石中，没人敢拔） ──
function attachBrokenSwordHomage(zone, world, game) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3d3833, roughness: 0.92 });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x8a8d94,
    metalness: 0.85,
    roughness: 0.35,
    emissive: 0x1a1c22,
    emissiveIntensity: 0.25,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc9a962,
    metalness: 0.8,
    roughness: 0.25,
    emissive: 0x3a2d12,
    emissiveIntensity: 0.4,
  });
  const gy = zone.groundYAt(-180, 30);

  // 黑石基座
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 1.05, 9), stoneMat);
  plinth.position.set(-180, gy + 0.52, 30);
  zone.group.add(plinth);
  // 断剑下半截嵌在石里
  const shard = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.85, 6), steelMat);
  shard.position.set(-180, gy + 1.45, 30);
  zone.group.add(shard);
  // 剑柄露出来（金色护手）
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.16), goldMat);
  guard.position.set(-180, gy + 1.9, 30);
  zone.group.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.28, 6), steelMat);
  grip.position.set(-180, gy + 2.08, 30);
  zone.group.add(grip);

  registerPoi(world, zone, { x: -180, y: 0, z: 30 }, 'echo_broken_sword_title', () => {
    game.dialog.show(t('echo_broken_sword_title'), t('echo_broken_sword_desc'));
    fireEcho(game, 'echo:broken-sword');
  }, { id: 'homage-middle-earth-broken-sword', color: 0x8a8d94 });
}

// ── 幽谷 · 竖琴（裂缝里传出的 Elven-harp 旋律，没人看得见弹奏的人） ──
function attachElvenHarpHomage(zone, world, game) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 0.85 });
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xe8d6a8, transparent: true, opacity: 0.75 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.4 });
  const gy = zone.groundYAt(-60, -165);

  // 立式竖琴框（扁盒腔 + 琴颈 + 琴柱）
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.15, 0.28), woodMat);
  body.position.set(-60, gy + 0.72, -165);
  zone.group.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.12), woodMat);
  neck.position.set(-60, gy + 1.33, -165);
  zone.group.add(neck);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.5, 6), woodMat);
  pillar.position.set(-59.62, gy + 0.9, -165);
  zone.group.add(pillar);
  // 琴弦（细亮线）
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.95), stringMat);
    s.position.set(-60 + (i - 2) * 0.055, gy + 0.82, -164.86);
    zone.group.add(s);
  }
  // 幽蓝辉光（没人的琴架）
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), glowMat);
  glow.position.set(-60, gy + 1.5, -165);
  zone.group.add(glow);

  registerPoi(world, zone, { x: -60, y: 0, z: -165 }, 'echo_elven_harp_title', () => {
    game.dialog.show(t('echo_elven_harp_title'), t('echo_elven_harp_desc'));
    fireEcho(game, 'echo:elven-harp');
  }, { id: 'homage-middle-earth-elven-harp', color: 0xaaddff });
}

// ── 秘银矿 · 碎片（Moria 深处散出来的秘银——重的、亮的、安静的） ──
function attachMithrilShardHomage(zone, world, game) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.95 });
  const mithrilMat = new THREE.MeshStandardMaterial({
    color: 0xc0c8d4,
    metalness: 0.95,
    roughness: 0.1,
    emissive: 0x3a4455,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  const gy = zone.groundYAt(140, 195);

  // 矿石堆
  const mound = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 9), rockMat);
  mound.position.set(140, gy + 0.45, 195);
  zone.group.add(mound);
  // 几块秘银碎片
  const shardOffsets = [[-0.5, 0.9], [0.4, 0.75], [-0.1, 1.3], [0.9, 1.1]];
  for (const [dx, h] of shardOffsets) {
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), mithrilMat);
    shard.scale.set(1.2, 0.7, 1.0);
    shard.position.set(140 + dx, gy + h, 195 + dx * 0.6);
    zone.group.add(shard);
  }
  // 矿洞入口（深色拱门）
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.16, 6, 12, Math.PI), rockMat);
  arch.position.set(140, gy + 0.95, 193.6);
  zone.group.add(arch);

  registerPoi(world, zone, { x: 140, y: 0, z: 195 }, 'echo_mithril_shard_title', () => {
    game.dialog.show(t('echo_mithril_shard_title'), t('echo_mithril_shard_desc'));
    fireEcho(game, 'echo:mithril-shard');
  }, { id: 'homage-middle-earth-mithril-shard', color: 0xc0c8d4 });
}
