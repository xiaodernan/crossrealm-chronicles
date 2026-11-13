/**
 * Wave18 POI ——「深渊母题 voidmaw」三枚回声（W-E11 切片1）
 * voidmaw 此前只有三枚（触须方尖碑 / 疯狂抄写室 / 螺旋深井 → 其实是 COSMIC——回头看的前提：void 里至少要有这一枚
 * 母题有自己的脸——合唱 / 锚 / 暗手）本片补它三枚回声：深渊合唱 / 锚与解锚 / 暗手；
 * zone 全挂在 void，与 VoidZone 的深色调相互迭代。
 *
 * 与 Wave3–Wave17 同一套纪律：addPOI + fireEcho，找不到 zone 整块跳过，绝不抛错。
 */
import * as THREE from 'three';
import { ZONE_IDS, findZoneById } from '../content/ZoneIdentity.js';

import { t } from '../engine/i18n.js';

export function attachPopCultureZonesWave18(game) {
  const world = game.world;
  if (!world?.zones) return;

  const voidZ = findZoneById(world.zones, ZONE_IDS.VOID);
  if (!voidZ) return;

  attachVoidChoirHomage(voidZ, world, game);
  attachVoidAnchorHomage(voidZ, world, game);
  attachVoidHandHomage(voidZ, world, game);
}

function registerPoi(world, zone, pos, label, fn, opts = {}) {
  const poi = zone.addPOI(pos, label, fn, opts);
  world.pointsOfInterest.push(poi);
  return poi;
}

function fireEcho(game, trigger) {
  window.dispatchEvent(new CustomEvent('pop-culture-echo', { detail: { trigger } }));
}

// ── 深渊合唱：六块立石绕着升高的岩台，石尖指向深不见底的空 ──
function attachVoidChoirHomage(zone, world, game) {
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x211b2b, roughness: 0.92, emissive: 0x241830, emissiveIntensity: 0.35 });
  const gy = zone.groundYAt(-140, 20);

  // 中心岩台
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 0.5, 9), stoneMat);
  dais.position.set(-140, gy + 0.25, 20);
  zone.group.add(dais);
  // 六块环穹石柱
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.4, 7), stoneMat);
    pillar.position.set(-140 + Math.cos(angle) * 2.1, gy + 1.7, 20 + Math.sin(angle) * 2.1);
    pillar.rotation.set(0, angle, (i % 2 ? 1 : -1) * 0.08);
    zone.group.add(pillar);
    // 顶端削尖的石锥
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 7), stoneMat);
    spike.position.set(-140 + Math.cos(angle) * 2.1, gy + 3.85, 20 + Math.sin(angle) * 2.1);
    spike.rotation.z = (i % 2 ? 1 : -1) * 0.08;
    zone.group.add(spike);
  }
  // 中心漂浮光晕
  const haloMat = new THREE.MeshStandardMaterial({
    color: 0x8866cc,
    emissive: 0x6644dd,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    transparent: true,
    opacity: 0.85,
  });
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), haloMat);
  halo.position.set(-140, gy + 3.0, 20);
  zone.group.add(halo);

  registerPoi(world, zone, { x: -140, y: 0, z: 20 }, 'echo_void_choir_title', () => {
    game.dialog.show(t('echo_void_choir_title'), t('echo_void_choir_desc'));
    fireEcho(game, 'echo:void-choir');
  }, { id: 'homage-void-choir', color: 0x8866cc });
}

// ── 锚与解锚：一具生锈的巨锚横躺在坡上，链条半埋进石堆 ──
function attachVoidAnchorHomage(zone, world, game) {
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a42, metalness: 0.85, roughness: 0.55 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x6e3a1e, roughness: 0.95, emissive: 0x2a1408, emissiveIntensity: 0.3 });
  const gy = zone.groundYAt(75, -95);

  // 锚杆（主梁）
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 4.4, 8), ironMat);
  shank.rotation.set(Math.PI / 2, 0, 0.3);
  shank.position.set(75, gy + 0.35, -95);
  zone.group.add(shank);
  // 锚臂（双钩）
  const armL = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.18, 6, 16, Math.PI * 1.1), ironMat);
  armL.rotation.set(0, 0, Math.PI * 0.6);
  armL.position.set(75, gy + 0.6, -90);
  zone.group.add(armL);
  const armR = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.18, 6, 16, Math.PI * 1.1), ironMat);
  armR.rotation.set(0, 0, -Math.PI * 0.6);
  armR.position.set(75, gy + 0.6, -90);
  zone.group.add(armR);
  // 锚环（顶部）
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 6, 18), rustMat);
  ring.rotation.y = 0.2;
  ring.position.set(75, gy + 0.6, -97.5);
  zone.group.add(ring);
  // 半埋的锚链
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x555560, metalness: 0.7, roughness: 0.6 });
  for (let i = 0; i < 5; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 5, 10), chainMat);
    link.position.set(75 - i * 0.4, gy + 0.08, -99 - i * 0.7);
    link.rotation.x = Math.PI / 2;
    link.rotation.z = i * 0.6;
    zone.group.add(link);
  }

  registerPoi(world, zone, { x: 75, y: 0, z: -95 }, 'echo_void_anchor_title', () => {
    game.dialog.show(t('echo_void_anchor_title'), t('echo_void_anchor_desc'));
    fireEcho(game, 'echo:void-anchor');
  }, { id: 'homage-void-anchor', color: 0x3a3a42 });
}

// ── 暗手：五根石指从地面探出，像一只还没醒的巨手 ──
function attachVoidHandHomage(zone, world, game) {
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x2e2622, roughness: 0.95, emissive: 0x1a1410, emissiveIntensity: 0.4 });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x7744aa,
    emissive: 0x441166,
    emissiveIntensity: 1.2,
    roughness: 0.3,
  });
  const gy = zone.groundYAt(-15, 130);

  // 手掌底座（半埋的椭圆石台）
  const palm = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 0.5, 10), skinMat);
  palm.position.set(-15, gy + 0.25, 130);
  palm.scale.x = 1.3;
  zone.group.add(palm);
  // 五指：不同长度、略向内收
  const fingerAngles = [0, 0.45, -0.45, 0.9, -0.9];
  const fingerLengths = [3.2, 2.4, 2.6, 1.6, 1.3];
  for (let i = 0; i < 5; i++) {
    const angle = fingerAngles[i];
    const length = fingerLengths[i];
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, length, 6), skinMat);
    const reach = 1.6;
    finger.position.set(-15 + Math.cos(angle) * reach, gy + 0.5 + length / 2, 130 + Math.sin(angle) * reach);
    finger.rotation.z = -angle * 0.25;
    finger.rotation.x = 0.15;
    zone.group.add(finger);
    // 指尖微弱的紫光——它还醒着
    const emberTip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), emberMat);
    emberTip.position.set(-15 + Math.cos(angle) * reach + Math.sin(-angle * 0.25) * (length / 2), gy + 0.5 + length + 0.08, 130 + Math.sin(angle) * reach);
    zone.group.add(emberTip);
  }

  registerPoi(world, zone, { x: -15, y: 0, z: 130 }, 'echo_void_hand_title', () => {
    game.dialog.show(t('echo_void_hand_title'), t('echo_void_hand_desc'));
    fireEcho(game, 'echo:void-hand');
  }, { id: 'homage-void-hand', color: 0x7744aa });
}
