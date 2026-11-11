import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

/**
 * Wave12 POI ——「星灯祭 · 灯节放归航」（W-E5 切片1）
 *
 * Wave11 是"走完所有位面之后，有人还记得回家的路"。
 * Wave12 是"当所有位面同时亮起同一盏灯"——星灯祭，四枚回声钉在
 * 魔法 / 深渊 / 虚空 / 幻想 四个位面里，每一枚都是灯会放归航的一种形态：
 * 升空的孔明灯、顺水而下的水灯、折满千只的千羽鹤、灰烬里落下的第一场雪。
 *
 * 与 Wave3–Wave11 同一套纪律：`addPOI` 由 zone 自己管交互，
 * `fireEcho` 广播 `pop-culture-echo`，找不到 zone 就整块跳过，绝不抛。
 * 四枚回声共用返乡母题（homecoming）——星灯祭是返乡的下篇。
 */
export function attachPopCultureZonesWave12(game) {
  const world = game.world;
  if (!world?.zones) return;

  const magic = findZoneById(world.zones, ZONE_IDS.MAGIC);
  const abyss = findZoneById(world.zones, ZONE_IDS.ABYSS);
  const voidZ = findZoneById(world.zones, ZONE_IDS.VOID);
  const fantasy = findZoneById(world.zones, ZONE_IDS.FANTASY);

  if (magic) attachSkyLanternHomage(magic, world, game);
  if (abyss) attachRiverLampHomage(abyss, world, game);
  if (voidZ) attachPaperCraneHomage(voidZ, world, game);
  if (fantasy) attachFirstSnowHomage(fantasy, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}
function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 魔法位面：升空的孔明灯（算术师在塔顶放飞的方向标） ──
function attachSkyLanternHomage(zone, world, game) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.9 });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xf2c879,
    emissive: 0xffb37a,
    emissiveIntensity: 1.35,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const gy = zone.groundYAt(75, -135);

  // 放飞台
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 2.1, 8), woodMat);
  post.position.set(75, gy + 1.05, -135);
  zone.group.add(post);
  const cradle = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.09, 10), woodMat);
  cradle.position.set(75, gy + 2.15, -135);
  zone.group.add(cradle);

  // 正在升空的孔明灯（半空，带一点点发光）
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.72, 10, 1, true), lanternMat);
  lantern.position.set(75.8, gy + 3.6, -134.3);
  zone.group.add(lantern);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.28, 10), lanternMat);
  cap.position.set(75.8, gy + 4.08, -134.3);
  zone.group.add(cap);

  registerPoi(world, zone, { x: 75, y: 0, z: -135 }, 'echo_homecoming_sky_lantern_title', () => {
    game.dialog.show(t('echo_homecoming_sky_lantern_title'), t('echo_homecoming_sky_lantern_desc'));
    fireEcho(game, 'echo:homecoming-sky-lantern');
  }, { id: 'homage-homecoming-sky-lantern', color: 0xffb37a });
}

// ── 深渊盐海：顺水而下的水灯（压着不敢说出口名字的那条河） ──
function attachRiverLampHomage(zone, world, game) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.95 });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xcfe4ee,
    emissive: 0x66ccee,
    emissiveIntensity: 1.1,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  const gy = zone.groundYAt(140, -60);

  // 石沿水盆
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.42, 12), stoneMat);
  basin.position.set(140, gy + 0.21, -60);
  zone.group.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.15, metalness: 0.6 }));
  water.position.set(140, gy + 0.43, -60);
  zone.group.add(water);

  // 三盏水灯
  for (const [dx, dz] of [[-0.55, 0.2], [0.1, -0.42], [0.55, 0.32]]) {
    const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 6), paperMat);
    lamp.position.set(140 + dx, gy + 0.68, -60 + dz);
    zone.group.add(lamp);
  }

  // 芦苇
  for (const [dx, dz, h] of [[-1.6, 0.4, 1.5], [1.7, -0.3, 1.9], [1.2, 1.1, 1.3]]) {
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h, 5), stoneMat);
    reed.position.set(140 + dx, gy + h / 2, -60 + dz);
    zone.group.add(reed);
  }

  registerPoi(world, zone, { x: 140, y: 0, z: -60 }, 'echo_homecoming_river_lamp_title', () => {
    game.dialog.show(t('echo_homecoming_river_lamp_title'), t('echo_homecoming_river_lamp_desc'));
    fireEcho(game, 'echo:homecoming-river-lamp');
  }, { id: 'homage-homecoming-river-lamp', color: 0x88ddff });
}

// ── 虚空边缘：折满千只的千羽鹤（等一个迷路的人回家） ──
function attachPaperCraneHomage(zone, world, game) {
  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.9 });
  const paperMat = new THREE.MeshStandardMaterial({
    color: 0xf4f2f8,
    emissive: 0xbba8ff,
    emissiveIntensity: 0.55,
    roughness: 0.5,
    flatShading: true,
  });
  const gy = zone.groundYAt(-95, 45);

  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.9), pedestalMat);
  pedestal.position.set(-95, gy + 0.52, 45);
  zone.group.add(pedestal);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), pedestalMat);
  stick.position.set(-95, gy + 2.25, 45);
  zone.group.add(stick);

  // 一串千羽鹤（扁八面体 + 小尾）
  const craneOffsets = [[-0.5, 1.35], [0.45, 1.8], [-0.3, 2.5], [0.4, 3.0]];
  for (const [dx, h] of craneOffsets) {
    const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), paperMat);
    body.scale.set(1.35, 0.7, 1);
    body.position.set(-95 + dx, gy + h, 45 + dx * 0.4);
    zone.group.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), paperMat);
    tail.rotation.z = Math.PI / 2;
    tail.position.set(-95 + dx + 0.16, gy + h + 0.03, 45 + dx * 0.4);
    zone.group.add(tail);
  }

  registerPoi(world, zone, { x: -95, y: 0, z: 45 }, 'echo_homecoming_paper_crane_title', () => {
    game.dialog.show(t('echo_homecoming_paper_crane_title'), t('echo_homecoming_paper_crane_desc'));
    fireEcho(game, 'echo:homecoming-paper-crane');
  }, { id: 'homage-homecoming-paper-crane', color: 0xe8e8ff });
}

// ── 幻想大陆：灰烬里的第一场雪（闻起来像很多很多年前的一顿饭） ──
function attachFirstSnowHomage(zone, world, game) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x54402e, roughness: 0.9 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fa, roughness: 0.85 });
  const warmMat = new THREE.MeshStandardMaterial({
    color: 0xffd9a0,
    emissive: 0xff9a40,
    emissiveIntensity: 1.2,
    roughness: 0.5,
  });
  const gy = zone.groundYAt(-240, 95);

  // 雪地（薄盘）
  const snowfall = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.07, 16), snowMat);
  snowfall.position.set(-240, gy + 0.04, 95);
  zone.group.add(snowfall);

  // 旧长椅 + 一盏温暖的灯
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.5), woodMat);
  bench.position.set(-240, gy + 0.46, 95);
  zone.group.add(bench);
  for (const dx of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.42), woodMat);
    leg.position.set(-240 + dx, gy + 0.21, 95);
    zone.group.add(leg);
  }
  const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.7, 6), woodMat);
  lampPost.position.set(-238.6, gy + 0.85, 94.2);
  zone.group.add(lampPost);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), warmMat);
  lamp.position.set(-238.6, gy + 1.78, 94.2);
  zone.group.add(lamp);

  registerPoi(world, zone, { x: -240, y: 0, z: 95 }, 'echo_homecoming_first_snow_title', () => {
    game.dialog.show(t('echo_homecoming_first_snow_title'), t('echo_homecoming_first_snow_desc'));
    fireEcho(game, 'echo:homecoming-first-snow');
  }, { id: 'homage-homecoming-first-snow', color: 0xffffff });
}
