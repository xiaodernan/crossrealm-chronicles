import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';



import { t } from '../engine/i18n.js';
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

  registerPoi(world, zone, { x: -30, y: 1, z: -55 }, 'echo_neon_alley_title', () => {

    game.dialog.show(t('echo_neon_alley_title'), t('pop_dlg_neon_alley_text'));

    fireEcho(game, 'echo:neon-alley');

    game.wave4VisualFx?.flash?.('cyber');

  }, { id: 'homage-neon-alley', color: 0xff22aa });

  registerPoi(world, zone, { x: 50, y: 2, z: -20 }, 'echo_chrome_clinic_title', () => {

    game.dialog.show(t('echo_chrome_clinic_title'), t('pop_dlg_chrome_clinic_text'));

    fireEcho(game, 'echo:chrome-clinic');

  }, { id: 'homage-chrome-clinic', color: 0x44ffcc });

  registerPoi(world, zone, { x: -10, y: 5, z: 60 }, 'echo_corp_spire_title', () => {

    game.dialog.show(t('pop_dlg_corp_spire_title'), t('pop_dlg_corp_spire_text'));

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

  registerPoi(world, zone, { x: -35, y: 0, z: 45 }, 'echo_torii_gate_title', () => {

    game.dialog.show(t('echo_torii_gate_title'), t('pop_dlg_torii_gate_text'));

    fireEcho(game, 'echo:torii-gate');

    game.wave4VisualFx?.flash?.('samurai');

  }, { id: 'homage-torii-gate', color: 0xcc3322 });

  registerPoi(world, zone, { x: 25, y: 0, z: -55 }, 'echo_dojo_ruins_title', () => {

    game.dialog.show(t('echo_dojo_ruins_title'), t('pop_dlg_dojo_ruins_text'));

    fireEcho(game, 'echo:dojo-ruins');

  }, { id: 'homage-dojo-ruins', color: 0x886644 });

  registerPoi(world, zone, { x: -65, y: 0, z: -15 }, 'echo_sakura_blade_title', () => {

    game.dialog.show(t('echo_sakura_blade_title'), t('pop_dlg_sakura_blade_text'));

    fireEcho(game, 'echo:sakura-blade');

  }, { id: 'homage-sakura-blade', color: 0xffaacd });

}



function attachCosmic(zone, world, game) {

  registerPoi(world, zone, { x: 40, y: 0, z: -55 }, 'echo_tentacle_obelisk_title', () => {

    game.dialog.show(t('echo_tentacle_obelisk_title'), t('pop_dlg_tentacle_obelisk_text'));

    fireEcho(game, 'echo:tentacle-obelisk');

    game.wave4VisualFx?.flash?.('cosmic');

  }, { id: 'homage-tentacle-obelisk', color: 0x224433 });

  registerPoi(world, zone, { x: -55, y: 0, z: 15 }, 'echo_mad_scribe_title', () => {

    game.dialog.show(t('echo_mad_scribe_title'), t('pop_dlg_mad_scribe_text'));

    fireEcho(game, 'echo:mad-scribe');

  }, { id: 'homage-mad-scribe', color: 0x445544 });

  registerPoi(world, zone, { x: 15, y: 0, z: 65 }, 'echo_spiral_well_title', () => {

    game.dialog.show(t('echo_spiral_well_title'), t('pop_dlg_spiral_well_text'));

    fireEcho(game, 'echo:spiral-well');

  }, { id: 'homage-spiral-well', color: 0x112211 });

}



function attachStarport(zone, world, game) {

  registerPoi(world, zone, { x: -45, y: 1, z: 45 }, 'echo_star_cantina_title', () => {

    game.dialog.show(t('echo_star_cantina_title'), t('pop_dlg_star_cantina_text'));

    fireEcho(game, 'echo:star-cantina');

    game.wave4VisualFx?.flash?.('starport');

  }, { id: 'homage-star-cantina', color: 0xffaa44 });

  registerPoi(world, zone, { x: 75, y: 0, z: 20 }, 'echo_smuggler_dock_title', () => {

    game.dialog.show(t('echo_smuggler_dock_title'), t('pop_dlg_smuggler_dock_text'));

    fireEcho(game, 'echo:smuggler-dock');

  }, { id: 'homage-smuggler-dock', color: 0x889944 });

  registerPoi(world, zone, { x: -15, y: 2, z: -75 }, 'echo_holo_chart_title', () => {

    game.dialog.show(t('echo_holo_chart_title'), t('pop_dlg_holo_chart_text'));

    fireEcho(game, 'echo:holo-chart');

  }, { id: 'homage-holo-chart', color: 0x66ccff });

}


