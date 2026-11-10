import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

/**
 * Wave8 POI —— 幽暗林地 × 辉煌圣域巡礼补完（W-E3 切片104）
 *
 * Wave5 给两位补过一枚（九石环 / 圣曜武士之门），这一波各再添**两枚**，与 Wave6/7 的
 * 双位置体系一样：薄暮回响 / 辉煌残响各扩到三条回声——巡礼任务（`side-gloom-tour` / `side-radiant-tour`，
 * `countFranchise >= 3`）从此开得起来。纪律沿用 Wave3–Wave7：`addPOI` 由 zone 自己管、
 * 交互走 `fireEcho`、找不到 zone 就整块跳过。
 */
export function attachPopCultureZonesWave8(game) {
  const world = game.world;
  if (!world?.zones) return;

  const gloom = findZoneById(world.zones, ZONE_IDS.GLOOM);
  const radiant = findZoneById(world.zones, ZONE_IDS.RADIANT);

  if (gloom) {
    attachLanternsHomage(gloom, world, game);
    attachWishingTreeHomage(gloom, world, game);
  }
  if (radiant) {
    attachBannerHomage(radiant, world, game);
    attachOrbHomage(radiant, world, game);
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

// ── 幽暗林地：幽暗灯笼行 ──
function attachLanternsHomage(zone, world, game) {
  // 一排纸灯笼沿雾岸缓缓远去：十根朽木柱 + 十盏纸灯笼（氦气不热，凉光）
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.95 });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xd8c49a,
    emissive: 0xc09040,
    emissiveIntensity: 0.8,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const px = 140 + t * 60;
    const pz = 84 + Math.sin(t * Math.PI) * 26;
    const gy = zone.groundYAt(px, pz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 6), woodMat);
    post.position.set(px, gy + 1.2, pz);
    zone.group.add(post);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.6, 8, 1, true), paperMat);
    lantern.position.set(px, gy + 2.2, pz);
    lantern.rotation.y = i * 0.7;
    zone.group.add(lantern);
  }
  registerPoi(world, zone, { x: 170, y: 0, z: 108 }, 'echo_gloom_lanterns_title', () => {
    game.dialog.show(t('echo_gloom_lanterns_title'), t('echo_gloom_lanterns_desc'));
    fireEcho(game, 'echo:gloom-lanterns');
  }, { id: 'homage-gloom-lanterns', color: 0xd8c49a });
}

// ── 幽暗林地：幽暗许愿树 ──
function attachWishingTreeHomage(zone, world, game) {
  // 麻布缠进枯枝缝：一根扭曲的枯树干 + 四枝歪枝 + 挂满麻布条
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x241f1a, roughness: 0.97 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.9, side: THREE.DoubleSide });
  const gy = zone.groundYAt(232, 162);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 3.4, 9), barkMat);
  trunk.position.set(232, gy + 1.7, 162);
  zone.group.add(trunk);
  const branchDirs = [[0.9, 2.9, 0.2], [-0.8, 2.6, 0.4], [0.3, 3.15, -0.55], [-0.4, 3.05, 0.65]];
  for (let bi = 0; bi < branchDirs.length; bi++) {
    const [bx, by, bz] = branchDirs[bi];
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 1.6, 6), barkMat);
    branch.position.set(232 + bx, gy + by, 162 + bz);
    branch.rotation.z = bx > 0 ? -0.55 : 0.55;
    branch.rotation.x = bz * 0.4;
    zone.group.add(branch);
  }
  // 许愿麻布
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const r = 0.85 + (i % 3) * 0.35;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.45), clothMat);
    cloth.position.set(232 + Math.cos(angle) * r, gy + 2.35 + (i % 2) * 0.3, 162 + Math.sin(angle) * r);
    cloth.rotation.y = angle;
    cloth.rotation.x = 0.25;
    zone.group.add(cloth);
  }
  registerPoi(world, zone, { x: 232, y: 0, z: 162 }, 'echo_gloom_wishing_tree_title', () => {
    game.dialog.show(t('echo_gloom_wishing_tree_title'), t('echo_gloom_wishing_tree_desc'));
    fireEcho(game, 'echo:gloom-wishing-tree');
  }, { id: 'homage-gloom-wishing-tree', color: 0x6a5a4a });
}

// ── 辉煌圣域：辉煌残旗 ──
function attachBannerHomage(zone, world, game) {
  // 一排残垣旗杆：五面已经褪色的金垂布——但臂膀还认得出
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x776333, metalness: 0.6, roughness: 0.5 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xb09240, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x1a1405, emissiveIntensity: 0.3 });
  for (let i = 0; i < 5; i++) {
    const px = -300 + i * 11;
    const pz = -100 - i * 5;
    const gy = zone.groundYAt(px, pz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.6, 8), poleMat);
    pole.position.set(px, gy + 1.8, pz);
    zone.group.add(pole);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), clothMat);
    banner.position.set(px + 0.5, gy + 2.7, pz);
    banner.rotation.y = i * 0.4;
    banner.rotation.z = 0.08 * (i % 2 === 0 ? 1 : -1);
    zone.group.add(banner);
  }
  registerPoi(world, zone, { x: -278, y: 0, z: -110 }, 'echo_radiant_banner_title', () => {
    game.dialog.show(t('echo_radiant_banner_title'), t('echo_radiant_banner_desc'));
    fireEcho(game, 'echo:radiant-banner');
  }, { id: 'homage-radiant-banner', color: 0xb09240 });
}

// ── 辉煌圣域：辉煌悬铃 ──
function attachOrbHomage(zone, world, game) {
  // 晨风未动铃先鸣：两根柱子 + 悬铃，铃沿正下方留一圈浅金光晕
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf0e4c0, roughness: 0.7 });
  const bellMat = new THREE.MeshStandardMaterial({ color: 0xc9a959, metalness: 0.85, roughness: 0.25, emissive: 0x3a2c0a, emissiveIntensity: 0.5 });
  const gy = zone.groundYAt(-130, -175);
  const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3.1, 8), pillarMat);
  pillarL.position.set(-132.3, gy + 1.55, -175);
  const pillarR = pillarL.clone();
  pillarR.position.x = -127.7;
  zone.group.add(pillarL, pillarR);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 0.42), pillarMat);
  beam.position.set(-130, gy + 3.1, -175);
  zone.group.add(beam);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.18, 0.6, 10), bellMat);
  bell.position.set(-130, gy + 2.55, -175);
  zone.group.add(bell);
  const halo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 0.04, 16),
    new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xaa7716, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 })
  );
  halo.position.set(-130, gy + 0.02, -175);
  zone.group.add(halo);
  registerPoi(world, zone, { x: -130, y: 0, z: -175 }, 'echo_radiant_orb_title', () => {
    game.dialog.show(t('echo_radiant_orb_title'), t('echo_radiant_orb_desc'));
    fireEcho(game, 'echo:radiant-orb');
  }, { id: 'homage-radiant-orb', color: 0xc9a959 });
}
