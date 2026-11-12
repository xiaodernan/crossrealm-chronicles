/**
 * Wave14 POI ——「赛博深渊 · Cyber Neon Depths」（W-E8 切片1）
 *
 * 赛博母题目前只有三枚（霓虹巷 / 镀铬诊所 / 公司尖塔），全是魔法位面。
 * 这一片补三枚：浮空赌场 / 黑市舱 / 天台道场，拖进幻想大陆 ——
 * 在人类还没把位面理成模型图纸之前，那里已经是一个更安静的赌场、下注的人更多。
 *
 * 三件回声共享一份「霓虹不灭」的设计语言：发光 / 金属 / 无源三件套。
 * 与 Wave3–Wave13 同一套纪律：addPOI + fireEcho，找不到 zone 整块跳过。
 */
import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

export function attachPopCultureZonesWave14(game) {
  const world = game.world;
  if (!world?.zones) return;

  const magic = findZoneById(world.zones, ZONE_IDS.MAGIC);
  if (!magic) return;

  attachFloatingCasinoHomage(magic, world, game);
  attachBlackMarketPodHomage(magic, world, game);
  attachRooftopDojoHomage(magic, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}
function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 空中大赌场 · 浮空赌场（没人写过这个赌场的规矩，玩家进了就出不去） ──
function attachFloatingCasinoHomage(zone, world, game) {
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, metalness: 0.75, roughness: 0.35 });
  const neonMat = new THREE.MeshStandardMaterial({
    color: 0xff00aa, emissive: 0xff00aa, emissiveIntensity: 1.5, roughness: 0.5,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2a, metalness: 0.9, roughness: 0.05,
    transparent: true, opacity: 0.7,
  });
  const gy = zone.groundYAt(-30, 115);

  // 浮空赌场主体（六角浮空结构）
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.0, 1.1, 6), steelMat);
  base.position.set(-30, gy + 6.5, 115);
  zone.group.add(base);
  // 玻璃穹顶
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
  dome.position.set(-30, gy + 7.05, 115);
  zone.group.add(dome);
  // 霓虹灯管（六边形顶环）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.08, 6, 6), neonMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-30, gy + 7.1, 115);
  zone.group.add(ring);
  // 吊索
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 6.0, 4), steelMat);
    cable.position.set(-30 + Math.cos(angle) * 1.45, gy + 3.6, 115 + Math.sin(angle) * 1.45);
    zone.group.add(cable);
  }

  registerPoi(world, zone, { x: -30, y: 0, z: 115 }, 'echo_floating_casino_title', () => {
    game.dialog.show(t('echo_floating_casino_title'), t('echo_floating_casino_desc'));
    fireEcho(game, 'echo:floating-casino');
  }, { id: 'homage-cyber-floating-casino', color: 0xff00aa });
}

// ── 黑市舱 · 黑市舱（没有货架的仓库，里面装着不应该存在的东西） ──
function attachBlackMarketPodHomage(zone, world, game) {
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x252020, metalness: 0.6, roughness: 0.45 });
  const amberMat = new THREE.MeshStandardMaterial({
    color: 0x884400, emissive: 0xffaa22, emissiveIntensity: 0.9, roughness: 0.5,
  });
  const gy = zone.groundYAt(148, 140);

  // 舱体（圆筒形舱体半埋在土里）
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 2.2, 8, 1, true), hullMat);
  pod.position.set(148, gy + 1.1, 140);
  pod.rotation.z = 0.15; // 微微倾斜，没完全盖住的半埋
  zone.group.add(pod);
  // 底盖
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.92, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), hullMat);
  cap.position.set(148, gy + 2.21, 140);
  cap.rotation.x = Math.PI / 3;
  zone.group.add(cap);
  // 交易窗（暗黄发光）
  const window = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.22), amberMat);
  window.position.set(148.62, gy + 1.05, 140);
  window.rotation.y = Math.PI / 6;
  zone.group.add(window);

  registerPoi(world, zone, { x: 148, y: 0, z: 140 }, 'echo_black_market_pod_title', () => {
    game.dialog.show(t('echo_black_market_pod_title'), t('echo_black_market_pod_desc'));
    fireEcho(game, 'echo:black-market-pod');
  }, { id: 'homage-cyber-black-market-pod', color: 0xffaa22 });
}

// ── 天台道场 · 天台道场（没人教过的道场，来学的只有刀和道） ──
function attachRooftopDojoHomage(zone, world, game) {
  const plankMat = new THREE.MeshStandardMaterial({ color: 0x3d362e, roughness: 0.85 });
  const strawMat = new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.92 });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xb0b4bc, metalness: 0.9, roughness: 0.15, emissive: 0x1c1e24, emissiveIntensity: 0.3,
  });
  const gy = zone.groundYAt(-145, -85);

  // 木板平台（地面上搭的木台）
  const platform = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 1.9), plankMat);
  platform.position.set(-145, gy + 0.07, -85);
  zone.group.add(platform);
  // 榻榻米（三铺）
  for (const dx of [-0.55, 0.0, 0.55]) {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.85), strawMat);
    mat.position.set(-145 + dx, gy + 0.17, -85);
    zone.group.add(mat);
  }
  // 一把刀插在木台中央
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.9, 6), bladeMat);
  blade.position.set(-145, gy + 0.62, -84.7);
  zone.group.add(blade);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 6), plankMat);
  hilt.position.set(-145, gy + 1.16, -84.7);
  zone.group.add(hilt);

  registerPoi(world, zone, { x: -145, y: 0, z: -85 }, 'echo_rooftop_dojo_title', () => {
    game.dialog.show(t('echo_rooftop_dojo_title'), t('echo_rooftop_dojo_desc'));
    fireEcho(game, 'echo:rooftop-dojo');
  }, { id: 'homage-cyber-rooftop-dojo', color: 0xb0b4bc });
}
