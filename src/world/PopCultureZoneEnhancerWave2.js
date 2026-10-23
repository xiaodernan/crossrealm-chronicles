import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';



import { t } from '../engine/i18n.js';
/** Wave2 POI — 九分站台 / 虫洞 / 街机厅等 */

export function attachPopCultureZonesWave2(game) {

  const world = game.world;

  if (!world?.zones) return;



  const magic = findZoneById(world.zones, ZONE_IDS.MAGIC);

  const space = findZoneById(world.zones, ZONE_IDS.SPACE);

  const voidZ = findZoneById(world.zones, ZONE_IDS.VOID);



  if (magic) attachMagicWave2(magic, world, game);

  if (space) attachSpaceWave2(space, world, game);

  if (voidZ) attachVoidWave2(voidZ, world, game);

}



function registerPoi(world, zone, pos, label, fn, opts = {}) {

  const poi = zone.addPOI(pos, label, fn, opts);

  world.pointsOfInterest.push(poi);

  return poi;

}



function fireEcho(game, trigger) {

  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));

}



function attachMagicWave2(zone, world, game) {

  buildNinePlatform(zone);

  registerPoi(world, zone, { x: 58, y: 1, z: 52 }, 'echo_nine_platform_title', () => {

    game.dialog.show(t('echo_nine_platform_title'), t('pop_dlg_nine_platform_text'));

    fireEcho(game, 'echo:nine-platform');

  }, { id: 'homage-nine-platform', color: 0xcc8844 });



  buildPatronusLake(zone);

  registerPoi(world, zone, { x: -58, y: 0, z: -28 }, 'echo_patronus_lake_title', () => {

    game.dialog.show(t('echo_patronus_lake_title'), t('pop_dlg_patronus_lake_text'));

    fireEcho(game, 'echo:patronus-lake');

  }, { id: 'homage-patronus-lake', color: 0x88ccff });



  buildTriwizardCup(zone);

  registerPoi(world, zone, { x: 12, y: 2, z: -48 }, 'echo_triwizard_title', () => {

    game.dialog.show(t('echo_triwizard_title'), t('pop_dlg_triwizard_cup_text'));

    fireEcho(game, 'echo:triwizard-cup');

  }, { id: 'homage-triwizard-cup', color: 0xffaa22 });

}



function attachSpaceWave2(zone, world, game) {

  buildBrandBeacon(zone);

  registerPoi(world, zone, { x: 38, y: 2, z: 68 }, 'echo_brand_beacon_title', () => {

    game.dialog.show(t('echo_brand_beacon_title'), t('pop_dlg_brand_beacon_text'));

    fireEcho(game, 'echo:brand-beacon');

  }, { id: 'homage-brand-beacon', color: 0xaaccff });



  buildWormholeArch(zone);

  registerPoi(world, zone, { x: -68, y: 4, z: -48 }, 'echo_wormhole_title', () => {

    game.dialog.show(t('echo_wormhole_title'), t('echo_wormhole_desc'));

    fireEcho(game, 'echo:wormhole-arch');

  }, { id: 'homage-wormhole-arch', color: 0x4466ff });



  buildLoveSignal(zone);

  registerPoi(world, zone, { x: 5, y: 3, z: -62 }, 'echo_love_signal_title', () => {

    game.dialog.show(t('echo_love_signal_title'), t('echo_love_signal_desc'));

    fireEcho(game, 'echo:love-signal');

  }, { id: 'homage-love-signal', color: 0xffccaa });

}



function attachVoidWave2(zone, world, game) {

  buildBikeLights(zone);

  registerPoi(world, zone, { x: -48, y: 0, z: 38 }, 'echo_bike_trail_title', () => {

    game.dialog.show(t('echo_bike_trail_title'), t('echo_bike_trail_desc'));

    fireEcho(game, 'echo:bike-trail');

  }, { id: 'homage-bike-trail', color: 0xffee44 });



  buildArcadeCabinet(zone);

  registerPoi(world, zone, { x: 32, y: 0, z: -22 }, 'echo_arcade_title', () => {

    game.dialog.show(t('echo_arcade_title'), t('echo_arcade_desc'));

    fireEcho(game, 'echo:arcade');

  }, { id: 'homage-arcade', color: 0x44ffaa });



  buildVecnaClock(zone);

  registerPoi(world, zone, { x: 8, y: 0, z: -38 }, 'echo_vecna_clock_title', () => {

    game.dialog.show(t('echo_vecna_clock_title'), t('echo_vecna_clock_desc'));

    fireEcho(game, 'echo:vecna-clock');

    game.upsideDownFx?.enable?.();

  }, { id: 'homage-vecna-clock', color: 0xaa2244 });



  buildUndergroundLab(zone);

  registerPoi(world, zone, { x: -28, y: 0, z: 68 }, 'echo_underground_lab_title', () => {

    game.dialog.show(t('pop_dlg_underground_lab_title'), t('echo_underground_lab_desc'));

    fireEcho(game, 'echo:underground-lab');

  }, { id: 'homage-underground-lab', color: 0x668899 });

}



function buildNinePlatform(zone) {

  const g = new THREE.Group();

  const brick = new THREE.MeshStandardMaterial({ color: 0x884422, roughness: 0.9 });

  const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.4), brick);

  wall.position.set(0, 1.5, 0);

  g.add(wall);

  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 8, 24, Math.PI), brick);

  arch.rotation.z = Math.PI;

  arch.position.set(0, 2.2, 0.25);

  g.add(arch);

  g.position.set(58, zone.sampleHeight(58, 52), 52);

  zone.group.add(g);

}



function buildPatronusLake(zone) {

  const water = new THREE.Mesh(

    new THREE.CircleGeometry(5, 32),

    new THREE.MeshStandardMaterial({ color: 0x224466, transparent: true, opacity: 0.55, metalness: 0.3 })

  );

  water.rotation.x = -Math.PI / 2;

  water.position.set(-58, zone.sampleHeight(-58, -28) + 0.05, -28);

  zone.group.add(water);

}



function buildTriwizardCup(zone) {

  const cup = new THREE.Mesh(

    new THREE.CylinderGeometry(0.3, 0.5, 1.2, 12),

    new THREE.MeshStandardMaterial({ color: 0xffaa22, emissive: 0x664400, emissiveIntensity: 0.5, metalness: 0.8 })

  );

  cup.position.set(12, zone.sampleHeight(12, -48) + 1.2, -48);

  zone.group.add(cup);

}



function buildBrandBeacon(zone) {

  const pole = new THREE.Mesh(

    new THREE.CylinderGeometry(0.2, 0.3, 5, 8),

    new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: 0x224466, emissiveIntensity: 0.6 })

  );

  pole.position.set(38, zone.sampleHeight(38, 68) + 2.5, 68);

  zone.group.add(pole);

}



function buildWormholeArch(zone) {

  const ring = new THREE.Mesh(

    new THREE.TorusGeometry(3.5, 0.25, 12, 48),

    new THREE.MeshStandardMaterial({ color: 0x4466ff, emissive: 0x112244, emissiveIntensity: 0.8, transparent: true, opacity: 0.75 })

  );

  ring.position.set(-68, zone.sampleHeight(-68, -48) + 4, -48);

  zone.group.add(ring);

}



function buildLoveSignal(zone) {

  const star = new THREE.Mesh(

    new THREE.OctahedronGeometry(0.8),

    new THREE.MeshStandardMaterial({ color: 0xffccaa, emissive: 0xff6644, emissiveIntensity: 0.7 })

  );

  star.position.set(5, zone.sampleHeight(5, -62) + 3, -62);

  zone.group.add(star);

}



function buildBikeLights(zone) {

  const g = new THREE.Group();

  const lamp = new THREE.MeshStandardMaterial({ color: 0xffee44, emissive: 0xffaa00, emissiveIntensity: 1 });

  for (let i = 0; i < 4; i++) {

    const light = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), lamp);

    light.position.set(i * 1.5 - 2.25, 0.8, 0);

    g.add(light);

  }

  g.position.set(-48, zone.sampleHeight(-48, 38), 38);

  zone.group.add(g);

}



function buildArcadeCabinet(zone) {

  const cab = new THREE.Mesh(

    new THREE.BoxGeometry(1.2, 2, 0.8),

    new THREE.MeshStandardMaterial({ color: 0x224433, emissive: 0x44ffaa, emissiveIntensity: 0.4 })

  );

  cab.position.set(32, zone.sampleHeight(32, -22) + 1, -22);

  zone.group.add(cab);

}



function buildVecnaClock(zone) {

  const tower = new THREE.Group();

  const shaft = new THREE.Mesh(

    new THREE.BoxGeometry(1.5, 6, 1.5),

    new THREE.MeshStandardMaterial({ color: 0x443333 })

  );

  shaft.position.set(0, 3, 0);

  tower.add(shaft);

  const face = new THREE.Mesh(

    new THREE.CircleGeometry(0.6, 16),

    new THREE.MeshStandardMaterial({ color: 0xaa2244, emissive: 0x440011, emissiveIntensity: 0.5 })

  );

  face.position.set(0, 5.5, 0.76);

  tower.add(face);

  tower.position.set(8, zone.sampleHeight(8, -38), -38);

  zone.group.add(tower);

}



function buildUndergroundLab(zone) {

  const door = new THREE.Mesh(

    new THREE.BoxGeometry(2.5, 2.8, 0.2),

    new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.5 })

  );

  door.position.set(-28, zone.sampleHeight(-28, 68) + 1.4, 68);

  zone.group.add(door);

}


