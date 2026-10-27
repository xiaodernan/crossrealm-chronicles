import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { applyShadow } from '../../engine/shadowPolicy.js';
import { makeUvConeGeometry } from '../../engine/uvGeometry.js';
import { paletteOf } from '../../content/materialPalette.js';

import { t } from '../../engine/i18n.js';
/** 新增：辉煌圣域 — 金色沙海中的光辉神殿，连接魔法与深渊 */
export class RadiantZone extends BaseZone {
  constructor(scene, center, dialog) {
    super(scene, center, {
      radius: 150,
      skyColor: 0xffeeaa,
      mapColor: '#ffd700',
      info: {
        id: ZONE_IDS.RADIANT,
        name: ZONE_NAMES[ZONE_IDS.RADIANT],
        subtitle: 'zone_subtitle_radiant',
        description: 'zone_desc_radiant',
      },
    });
    this.dialog = dialog;
  }

  /**
   * 内容构建（缺陷② 切片F，修 B134）—— 构造器只构造，内容由 `WorldManager` 在挂好
   * 地面问手之后统一调用（见 `BaseZone.build()` 的注）。
   */
  build() {
    this.buildTerrain();
    this.buildSunPillars();
    this.buildLandmarks();
    this.buildOuterWilds();
  }

  sampleHeight(lx, lz) {
    const dist = Math.sqrt(lx * lx + lz * lz) / this.radius;
    const dune = Math.sin(lx * 0.04) * Math.cos(lz * 0.03) * 2.0;
    const edgeFade = 1 - Math.pow(dist, 2);
    return Math.max(0, dune * edgeFade);
  }

  buildTerrain() {
    // 地面由 WorldTerrain 统一绘制
  }

  buildSunPillars() {
    const sunMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0xffaa00,
      emissiveIntensity: 0.8,
      metalness: 0.7,
      roughness: 0.2,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 20 + (i % 3) * 10;
      const h = 10 + Math.random() * 6;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, h, 8), sunMat);
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      pillar.position.set(lx, h * 0.5, lz);
      this.group.add(pillar);
      this.addCylinderCollider(lx, lz, 0.9, this.groundYAt(lx, lz) + h * 0.5 + 3, { base: this.groundYAt(lx, lz) - 0.5 });
    }
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(2, 0),
      new THREE.MeshStandardMaterial({ color: 0xffee00, emissive: 0xffcc00, emissiveIntensity: 1, metalness: 0.8, roughness: 0.1 })
    );
    core.position.set(0, 6, 0);
    core.name = 'sunCore';
    this.group.add(core);
  }

  buildLandmarks() {
    this.addPOI(
      { x: 0, y: 0, z: 65 },
      'zone_poi_radiant_main_gate_label',
      () => {
        this.dialog.show(t('zone_poi_radiant_main_gate_label'), t('zone_dlg_radiant_main_gate_text'));
      },
      { id: 'radiant-main-gate', color: 0xffcc00 }
    );
    this.addPOI(
      { x: 25, y: 0, z: -15 },
      'wp_label_radiant_altar',
      () => {
        window.dispatchEvent(new CustomEvent('discovery', {
          detail: { id: 'radiant-altar', title: t('wp_label_radiant_altar'), text: t('zone_disc_radiant_altar_text') },
        }));
        this.dialog.show(t('wp_label_radiant_altar'), t('zone_dlg_radiant_altar_text'));
      },
      { id: 'radiant-altar', color: 0xffee00 }
    );
  }

  buildOuterWilds() {
    // W-C5 切片10：外野沙岩锥上 crag 岩面（1 米一铺的无格多面体噪声），退路读数 0.85。
    // 锥体走 `makeUvConeGeometry`：u 逐行乘该行周长、v 乘高 —— 粗锥细锥的岩面细节同一尺寸。
    const mat = this.addSurfaceMaterial({ color: paletteOf('stone.radiantRock'), roughness: 0.85, metalness: 0.2 }, 'crag');
    for (let i = 0; i < 18; i++) {
      const lx = (Math.random() - 0.5) * this.radius * 1.4;
      const lz = (Math.random() - 0.5) * this.radius * 1.4;
      const dune = new THREE.Mesh(
        makeUvConeGeometry(1.5 + Math.random(), 3 + Math.random() * 2, 6),
        mat
      );
      dune.position.set(lx, this.groundYAt(lx, lz) + 1.5, lz);
      dune.rotation.y = Math.random() * Math.PI;
      applyShadow(dune, 'castOnly');
      this.group.add(dune);
      this.addCylinderCollider(lx, lz, 1.5, dune.position.y + 3, { base: dune.position.y - 1 });
    }
  }

  update(dt) {
    super.update(dt);
    const core = this.group.getObjectByName('sunCore');
    if (core) {
      core.rotation.x += dt * 0.2;
      core.rotation.y += dt * 0.4;
    }
  }
}
