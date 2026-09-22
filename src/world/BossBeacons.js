import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MAP_BOSSES } from '../game/QuestSystem.js';

/** 全图可见 Boss 信标 — 光柱 + 标签 + 常驻竞技场环 */
export class BossBeacons {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'BossBeacons';
    scene.add(this.group);
  }

  build() {
    for (const b of MAP_BOSSES) {
      this._addBeacon(b.x, b.z, b.label, b.color, b.short);
    }
  }

  _addBeacon(x, z, name, colorHex, short) {
    const g = new THREE.Group();
    const gy = this.world.getGroundHeight(x, z);
    const color = typeof colorHex === 'string' ? parseInt(colorHex.replace('#', ''), 16) : colorHex;

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(18, 22, 64),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = gy + 0.12;
    g.add(ring);

    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(18, 64),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = gy + 0.1;
    g.add(inner);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.55, 14, 8),
      new THREE.MeshStandardMaterial({
        color: 0x2a2030,
        emissive: color,
        emissiveIntensity: 0.55,
        roughness: 0.4,
        metalness: 0.5,
      })
    );
    pillar.position.y = gy + 7;
    pillar.castShadow = true;
    g.add(pillar);

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: color,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9,
      })
    );
    orb.position.y = gy + 14.5;
    g.add(orb);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 1.2, 30, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    beam.position.y = gy + 15;
    g.add(beam);

    const labelDiv = document.createElement('div');
    labelDiv.className = 'boss-beacon-label';
    labelDiv.innerHTML = `<strong>💀 ${short}</strong><span>${name}</span>`;
    const label = new CSS2DObject(labelDiv);
    label.position.set(0, gy + 16, 0);
    g.add(label);

    g.position.set(x, 0, z);
    this.group.add(g);
  }
}
