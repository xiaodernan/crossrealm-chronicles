import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from './ZoneIdentity.js';



export function attachPopCultureZonesWave4(game) {

  const world = game.world;

  if (!world?.zones) return;

  const magic = findZoneById(world.zones, ZONE_IDS.MAGIC);

  const fantasy = findZoneById(world.zones, ZONE_IDS.FANTASY);

  const voidZ = findZoneById(world.zones, ZONE_IDS.VOID);

  const space = findZoneById(world.zones, ZONE_IDS.SPACE);

  if (magic) attachCyber(magic, world, game);

  if (fantasy) attachSamurai(fantasy, world, game);

  if (voidZ) attachCosmic(voidZ, world, game);

  if (space) attachStarport(space, world, game);

}



function registerPoi(world, zone, pos, label, fn, opts = {}) {

  world.pointsOfInterest.push(zone.addPOI(pos, label, fn, opts));

}



function fireEcho(game, t) {

  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger: t } }));

}



function attachCyber(zone, world, game) {

  const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 0.8, 0.2), new THREE.MeshStandardMaterial({ color: 0xff22aa, emissive: 0xff0088, emissiveIntensity: 0.9 }));

  sign.position.set(-30, zone.sampleHeight(-30, -55) + 2.5, -55);

  zone.group.add(sign);

  registerPoi(world, zone, { x: -30, y: 1, z: -55 }, '霓虹后巷', () => {

    game.dialog.show('霓虹后巷', '全息广告短路 — 义眼记录的不一定是真相。');

    fireEcho(game, 'echo:neon-alley');

    game.wave4VisualFx?.flash?.('cyber');

  }, { id: 'homage-neon-alley', color: 0xff22aa });

  registerPoi(world, zone, { x: 50, y: 2, z: -20 }, '铬合金诊所', () => {

    game.dialog.show('铬合金诊所', '魔药与芯片同柜 — 升级有两种读音。');

    fireEcho(game, 'echo:chrome-clinic');

  }, { id: 'homage-chrome-clinic', color: 0x44ffcc });

  registerPoi(world, zone, { x: -10, y: 5, z: 60 }, '巨企尖塔投影', () => {

    game.dialog.show('巨企尖塔', 'Slogan 循环播放 — 魂火也算 KPI。');

    fireEcho(game, 'echo:corp-spire');

  }, { id: 'homage-corp-spire', color: 0xff4488 });

}



function attachSamurai(zone, world, game) {

  const g = new THREE.Group();

  const red = new THREE.MeshStandardMaterial({ color: 0xcc3322 });

  const beam = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 0.3), red);

  beam.position.set(0, 2.5, 0);

  g.add(beam);

  g.position.set(-35, zone.sampleHeight(-35, 45), 45);

  zone.group.add(g);

  registerPoi(world, zone, { x: -35, y: 0, z: 45 }, '鸟居残门', () => {

    game.dialog.show('鸟居残门', '门后不是神域，是未结束的决斗。');

    fireEcho(game, 'echo:torii-gate');

    game.wave4VisualFx?.flash?.('samurai');

  }, { id: 'homage-torii-gate', color: 0xcc3322 });

  registerPoi(world, zone, { x: 25, y: 0, z: -55 }, '道场废墟', () => {

    game.dialog.show('道场废墟', '木桩刀痕比树年轮密。');

    fireEcho(game, 'echo:dojo-ruins');

  }, { id: 'homage-dojo-ruins', color: 0x886644 });

  registerPoi(world, zone, { x: -65, y: 0, z: -15 }, '樱落刃冢', () => {

    game.dialog.show('樱落刃冢', '落樱盖住断刃 — 杀气像未散。');

    fireEcho(game, 'echo:sakura-blade');

  }, { id: 'homage-sakura-blade', color: 0xffaacd });

}



function attachCosmic(zone, world, game) {

  registerPoi(world, zone, { x: 40, y: 0, z: -55 }, '触须方尖碑', () => {

    game.dialog.show('触须方尖碑', '铭文是盯着你的角度。');

    fireEcho(game, 'echo:tentacle-obelisk');

    game.wave4VisualFx?.flash?.('cosmic');

  }, { id: 'homage-tentacle-obelisk', color: 0x224433 });

  registerPoi(world, zone, { x: -55, y: 0, z: 15 }, '疯癫抄写室', () => {

    game.dialog.show('疯癫抄写室', '羽毛笔自己写 — 墨水像海水与铁锈。');

    fireEcho(game, 'echo:mad-scribe');

  }, { id: 'homage-mad-scribe', color: 0x445544 });

  registerPoi(world, zone, { x: 15, y: 0, z: 65 }, '螺旋深井', () => {

    game.dialog.show('螺旋深井', '井底回声在数数 — 数到你。');

    fireEcho(game, 'echo:spiral-well');

  }, { id: 'homage-spiral-well', color: 0x112211 });

}



function attachStarport(zone, world, game) {

  registerPoi(world, zone, { x: -45, y: 1, z: 45 }, '星港酒肆', () => {

    game.dialog.show('星港酒肆', '赏金、走私、跃迁合同在同一张桌。');

    fireEcho(game, 'echo:star-cantina');

    game.wave4VisualFx?.flash?.('starport');

  }, { id: 'homage-star-cantina', color: 0xffaa44 });

  registerPoi(world, zone, { x: 75, y: 0, z: 20 }, '走私码头', () => {

    game.dialog.show('走私码头', '集装箱编号是位面坐标。');

    fireEcho(game, 'echo:smuggler-dock');

  }, { id: 'homage-smuggler-dock', color: 0x889944 });

  registerPoi(world, zone, { x: -15, y: 2, z: -75 }, '全息星图室', () => {

    game.dialog.show('全息星图室', '航线是谈判出来的。');

    fireEcho(game, 'echo:holo-chart');

  }, { id: 'homage-holo-chart', color: 0x66ccff });

}


