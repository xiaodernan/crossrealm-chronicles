import * as THREE from 'three';
import { attachPopCultureZonesWave2 } from './PopCultureZoneEnhancerWave2.js';
import { attachPopCultureZonesWave3 } from './PopCultureZoneEnhancerWave3.js';
import { attachPopCultureZonesWave4 } from './PopCultureZoneEnhancerWave4.js';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

/** 各位面追加致敬 POI / 装饰 — 不修改 Zone 源文件 */
export function attachPopCultureZones(game) {
  const world = game.world;
  if (!world?.zones) return;

  // 修 B36：这里曾用 `name.includes('霍格') || subtitle.includes('哈利')` 找区 ——
  // 一整片致敬 POI 的存在取决于两句字幕文案有没有被改过
  const magic = findZoneById(world.zones, ZONE_IDS.MAGIC);
  const space = findZoneById(world.zones, ZONE_IDS.SPACE);
  const voidZ = findZoneById(world.zones, ZONE_IDS.VOID);
  const fantasy = findZoneById(world.zones, ZONE_IDS.FANTASY);

  if (magic) attachMagicHomage(magic, world, game);
  if (space) attachSpaceHomage(space, world, game);
  if (voidZ) attachStrangerHomage(voidZ, world, game);
  if (fantasy) attachFantasyHomage(fantasy, world, game);
  attachHubPoster(world, game);
  attachPopCultureZonesWave2(game);
  attachPopCultureZonesWave3(game);
  attachPopCultureZonesWave4(game);
  // 致敬层是最后写入 pointsOfInterest 的一方，所以身份自检在这里再跑一次（修 B45）
  world.assertPoiIdentity();
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}

function attachMagicHomage(zone, world, game) {
  buildBroomRing(zone);
  registerPoi(world, zone, { x: 35, y: 2, z: 40 }, 'echo_broom_ring_title', () => {
    game.dialog.show(
      '飞天环赛',
      '三根悬浮金环是旧时代「扫帚竞速」的赛道。\n\n传说有学徒曾在这里追一颗会飞的鬼火 — 那其实是位面渗漏的魂火萤。'
    );
    fireEcho(game, 'echo:broom-ring');
  }, { id: 'homage-broom-ring', color: 0xffdd44 });

  buildGreenhouseDome(zone);
  registerPoi(world, zone, { x: -45, y: 1, z: 50 }, 'echo_potion_lab_title', () => {
    game.dialog.show('魔药温室', '玻璃下种着会尖叫的根 — 别在满月夜靠近。');
    fireEcho(game, 'echo:potion-lab');
  }, { id: 'homage-potion-lab', color: 0x88ff88 });

  registerPoi(world, zone, { x: -15, y: 4, z: -10 }, 'echo_sorting_hall_title', () => {
    game.dialog.show('分院残厅', '四色横幅已褪色 — 分院帽低语：「去冒险，别回头。」');
    fireEcho(game, 'echo:sorting-hall');
  }, { id: 'homage-sorting-hall', color: 0xaa66ff });
}

function attachSpaceHomage(zone, world, game) {
  buildMurphyShelf(zone);
  registerPoi(world, zone, { x: -20, y: 3, z: 55 }, 'echo_murphy_title', () => {
    game.dialog.show('墨菲书架', '引力在书页间留下幽灵笔迹 — 像在说 Stay。');
    fireEcho(game, 'echo:murphy-shelf');
  }, { id: 'homage-murphy-shelf', color: 0xffccaa });

  buildHourglass(zone);
  registerPoi(world, zone, { x: 70, y: 2, z: -40 }, 'echo_miller_title', () => {
    game.dialog.show('米勒沙漏', '这里的一小时，可能是枢纽的七年。');
    fireEcho(game, 'echo:miller-hourglass');
  }, { id: 'homage-miller-hourglass', color: 0x66ccff });

  buildDockingRing(zone);
  registerPoi(world, zone, { x: -55, y: 6, z: -10 }, 'echo_docking_title', () => {
    game.dialog.show('对接舱旋转', '两艘船必须以相同转速相遇 — 否则就是金属的葬礼。');
    fireEcho(game, 'echo:docking-spin');
  }, { id: 'homage-docking-spin', color: 0x8899cc });
}

function attachStrangerHomage(zone, world, game) {
  buildRadioTower(zone);
  registerPoi(world, zone, { x: 50, y: 0, z: 30 }, 'echo_radio_tower_title', () => {
    game.dialog.show('旧镇广播塔', '1983 年的电台仍在循环 — 你听见的是另一个维度的 SOS。');
    fireEcho(game, 'echo:radio-tower');
  }, { id: 'homage-radio-tower', color: 0xff4466 });

  buildUpsideRift(zone);
  registerPoi(world, zone, { x: -35, y: 1, z: -40 }, 'echo_upside_rift_title', () => {
    game.dialog.show('逆相裂口', '天空像被撕开，红色孢子飘落 — 逆相界的风是冷的。');
    fireEcho(game, 'echo:upside-rift');
    game.upsideDownFx?.enable?.();
  }, { id: 'homage-upside-rift', color: 0xcc2244 });

  buildNeonMall(zone);
  registerPoi(world, zone, { x: 20, y: 0, z: 55 }, 'echo_neon_mall_title', () => {
    game.dialog.show('霓虹商场', '粉色与青色霓虹 — 像从未关门的 80 年代。');
    fireEcho(game, 'echo:neon-mall');
  }, { id: 'homage-neon-mall', color: 0xff66cc });

  registerPoi(world, zone, { x: -10, y: 0, z: 10 }, 'echo_rift_hound_title', () => {
    game.dialog.show('裂隙猎犬', '爪印通向没有星星的方向 — 别在夜里单独追。');
    fireEcho(game, 'echo:rift-hound');
  }, { id: 'homage-rift-hound', color: 0x882222 });
}

function attachFantasyHomage(zone, world, game) {
  registerPoi(world, zone, { x: -30, y: 0, z: -50 }, 'pop_poi_fantasy_ring_echo_label', () => {
    game.dialog.show('至尊石环', 'One Realm to bind them all… 戒指已碎，石环仍在。');
    window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'fantasy-ring', title: '至尊石环', text: '石环铭文。' } }));
  }, { id: 'fantasy-ring-echo', color: 0xc9a962 });
}

function attachHubPoster(world, game) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3540, roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.2), mat);
  back.position.set(0, 2, 0);
  g.add(back);
  [0xaa66ff, 0x66ccff, 0xcc2244, 0x88aa66, 0xff2244, 0xc9a962, 0xcc8844, 0x661122, 0x4488ff].forEach((c, i) => {
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, 0.95),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.65 })
    );
    poster.position.set(-2.6 + i * 0.65, 2.2, 0.15);
    g.add(poster);
  });
  const y = world.getGroundHeight(42, 48);
  g.position.set(42, y, 48);
  game.scene.add(g);

  world.pointsOfInterest.push({
    id: 'hub-poster-wall',
    position: new THREE.Vector3(42, y, 48),
    label: 'echo_poster_wall_title',
    type: 'lore',
    onInteract: () => {
      game.dialog.show(
        '位面海报墙',
        '九张褪色海报：咒术学院 · 米勒沙漏 · 逆相裂口 · 至尊石环 · 混沌边境 · 世界之锚 · 边境往事 · 幽冥帮派 · 深空纪元\n\nJ → 次元回声 按系列筛选已共鸣条目。'
      );
      fireEcho(game, 'echo:poster-wall');
    },
  });
}

function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

function buildBroomRing(zone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffdd44, emissive: 0x664400, emissiveIntensity: 0.4, metalness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3 + i * 1.2, 0.08, 8, 32), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 8 + i * 3;
    g.add(ring);
  }
  g.position.set(35, zone.sampleHeight(35, 40), 40);
  zone.group.add(g);
}

function buildGreenhouseDome(zone) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x448844, transparent: true, opacity: 0.35 })
  );
  dome.position.set(-45, zone.sampleHeight(-45, 50) + 0.5, 50);
  zone.group.add(dome);
}

function buildMurphyShelf(zone) {
  const shelf = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.8), wood);
    plank.position.y = 1 + i * 0.6;
    shelf.add(plank);
  }
  shelf.position.set(-20, zone.sampleHeight(-20, 55), 55);
  zone.group.add(shelf);
}

function buildHourglass(zone) {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xaaccff, transparent: true, opacity: 0.5 });
  const top = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2, 8), glass);
  top.position.set(0, 2.5, 0);
  g.add(top);
  const bot = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2, 8), glass);
  bot.rotation.x = Math.PI;
  bot.position.y = 0.5;
  g.add(bot);
  g.position.set(70, zone.sampleHeight(70, -40), -40);
  zone.group.add(g);
}

function buildDockingRing(zone) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(4, 0.12, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: 0x223344, emissiveIntensity: 0.5 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-55, zone.sampleHeight(-55, -10) + 6, -10);
  zone.group.add(ring);
}

function buildRadioTower(zone) {
  const tower = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15, 0.25, 14, 6),
    new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6 })
  );
  pole.position.set(0, 7, 0);
  tower.add(pole);
  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 1, 8),
    new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  cap.position.set(0, 14, 0);
  tower.add(cap);
  tower.position.set(50, zone.sampleHeight(50, 30), 30);
  zone.group.add(tower);
}

function buildUpsideRift(zone) {
  const rift = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 12),
    new THREE.MeshBasicMaterial({ color: 0x440011, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
  );
  rift.position.set(-35, zone.sampleHeight(-35, -40) + 6, -40);
  rift.rotation.y = 0.4;
  zone.group.add(rift);
}

function buildNeonMall(zone) {
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(6, 1.2, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xff66cc, emissive: 0xff2288, emissiveIntensity: 0.8 })
  );
  sign.position.set(20, zone.sampleHeight(20, 55) + 3, 55);
  zone.group.add(sign);
}
