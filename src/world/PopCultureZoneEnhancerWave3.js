import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';
/** Wave3 POI — 西部 / 黑帮 / 深空科幻 */
export function attachPopCultureZonesWave3(game) {
  const world = game.world;
  if (!world?.zones) return;

  // 修 B36：按 id 取区（见 PopCultureZoneEnhancer 的同款注释）
  const fantasy = findZoneById(world.zones, ZONE_IDS.FANTASY);
  const abyss = findZoneById(world.zones, ZONE_IDS.ABYSS);
  const space = findZoneById(world.zones, ZONE_IDS.SPACE);

  if (fantasy) attachWesternHomage(fantasy, world, game);
  if (abyss) attachGangsterHomage(abyss, world, game);
  if (space) attachSciFiHomage(space, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}

function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

function attachWesternHomage(zone, world, game) {
  buildSaloon(zone);
  registerPoi(world, zone, { x: 48, y: 1, z: 32 }, 'echo_saloon_mirror_title', () => {
    game.dialog.show(t('echo_saloon_mirror_title'), t('echo_saloon_mirror_desc'));
    fireEcho(game, 'echo:saloon-mirror');
    game.triadVisualFx?.flash?.('western');
  }, { id: 'homage-saloon-mirror', color: 0xcc8844 });

  buildDuelCircle(zone);
  registerPoi(world, zone, { x: -52, y: 0, z: 22 }, 'echo_duel_noon_title', () => {
    game.dialog.show(t('echo_duel_noon_title'), t('pop_dlg_duel_noon_text'));
    fireEcho(game, 'echo:duel-noon');
  }, { id: 'homage-duel-noon', color: 0xddaa55 });

  buildGhostRails(zone);
  registerPoi(world, zone, { x: 72, y: 0, z: -28 }, 'echo_ghost_rails_title', () => {
    game.dialog.show(t('echo_ghost_rails_title'), t('echo_ghost_rails_desc'));
    fireEcho(game, 'echo:ghost-rails');
  }, { id: 'homage-ghost-rails', color: 0x887766 });
}

function attachGangsterHomage(zone, world, game) {
  buildSpeakeasyDoor(zone);
  registerPoi(world, zone, { x: 32, y: 1, z: 42 }, 'echo_speakeasy_title', () => {
    game.dialog.show(t('echo_speakeasy_title'), t('echo_speakeasy_desc'));
    fireEcho(game, 'echo:speakeasy');
    game.triadVisualFx?.flash?.('noir');
  }, { id: 'homage-speakeasy', color: 0x442233 });

  buildFamilyShrine(zone);
  registerPoi(world, zone, { x: -42, y: 0, z: -32 }, 'echo_family_shrine_title', () => {
    game.dialog.show(t('echo_family_shrine_title'), t('pop_dlg_family_shrine_text'));
    fireEcho(game, 'echo:family-shrine');
  }, { id: 'homage-family-shrine', color: 0x661122 });

  buildDockCrates(zone);
  registerPoi(world, zone, { x: 58, y: 0, z: -48 }, 'echo_dock_crates_title', () => {
    game.dialog.show(t('echo_dock_crates_title'), t('pop_dlg_dock_crates_text'));
    fireEcho(game, 'echo:dock-crates');
  }, { id: 'homage-dock-crates', color: 0x553344 });
}

function attachSciFiHomage(zone, world, game) {
  buildColonyDome(zone);
  registerPoi(world, zone, { x: -32, y: 2, z: -72 }, 'echo_colony_dome_title', () => {
    game.dialog.show(t('echo_colony_dome_title'), t('pop_dlg_colony_dome_text'));
    fireEcho(game, 'echo:colony-dome');
    game.triadVisualFx?.flash?.('scifi');
  }, { id: 'homage-colony-dome', color: 0x44aacc });

  buildAiCore(zone);
  registerPoi(world, zone, { x: 62, y: 1, z: 38 }, 'echo_ai_core_title', () => {
    game.dialog.show(t('echo_ai_core_title'), t('echo_ai_core_desc'));
    fireEcho(game, 'echo:ai-core');
  }, { id: 'homage-ai-core', color: 0x66ffcc });

  buildJumpGate(zone);
  registerPoi(world, zone, { x: 8, y: 3, z: 82 }, 'echo_jump_gate_title', () => {
    game.dialog.show(t('echo_jump_gate_title'), t('pop_dlg_jump_gate_text'));
    fireEcho(game, 'echo:jump-gate');
  }, { id: 'homage-jump-gate', color: 0x4488ff });
}

function buildSaloon(zone) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4433, roughness: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 3), wood);
  body.position.set(0, 1.25, 0);
  g.add(body);
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.8),
    new THREE.MeshStandardMaterial({ color: 0xaaaacc, metalness: 0.9, roughness: 0.1 })
  );
  mirror.position.set(0, 1.6, 1.52);
  g.add(mirror);
  g.position.set(48, zone.groundYAt(48, 32), 32);
  zone.group.add(g);
}

function buildDuelCircle(zone) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.5, 3.8, 32),
    new THREE.MeshStandardMaterial({ color: 0xddaa55, transparent: true, opacity: 0.45 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(-52, zone.groundYAt(-52, 22) + 0.06, 22);
  zone.group.add(ring);
}

function buildGhostRails(zone) {
  const rail = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7 });
  for (let i = 0; i < 8; i++) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 2.5), rail);
    tie.position.set(72 + i * 2.5, zone.groundYAt(72 + i * 2.5, -28) + 0.05, -28);
    zone.group.add(tie);
  }
}

function buildSpeakeasyDoor(zone) {
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.4, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x221118, roughness: 0.95 })
  );
  door.position.set(32, zone.groundYAt(32, 42) + 1.2, 42);
  zone.group.add(door);
}

function buildFamilyShrine(zone) {
  const g = new THREE.Group();
  const candleMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0xff6600, emissiveIntensity: 0.8 });
  for (let i = -1; i <= 1; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), candleMat);
    c.position.set(i * 0.5, 0.25, 0);
    g.add(c);
  }
  const mirror = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x110808, metalness: 0.6 })
  );
  mirror.position.set(0, 1.2, 0.1);
  g.add(mirror);
  g.position.set(-42, zone.groundYAt(-42, -32), -32);
  zone.group.add(g);
}

function buildDockCrates(zone) {
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), crateMat);
    c.position.set(58 + i * 1.6, zone.groundYAt(58, -48) + 0.6, -48);
    zone.group.add(c);
  }
}

function buildColonyDome(zone) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x336688, transparent: true, opacity: 0.4 })
  );
  dome.position.set(-32, zone.groundYAt(-32, -72) + 0.2, -72);
  zone.group.add(dome);
}

function buildAiCore(zone) {
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.2),
    new THREE.MeshStandardMaterial({ color: 0x66ffcc, emissive: 0x228866, emissiveIntensity: 0.9 })
  );
  core.position.set(62, zone.groundYAt(62, 38) + 1.5, 38);
  zone.group.add(core);
}

function buildJumpGate(zone) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x112244, emissiveIntensity: 0.7, transparent: true, opacity: 0.75 });
  for (let i = -1; i <= 1; i++) {
    const gate = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 8, 32), mat);
    gate.position.set(i * 4, 3, 0);
    g.add(gate);
  }
  g.position.set(8, zone.groundYAt(8, 82), 82);
  zone.group.add(g);
}
