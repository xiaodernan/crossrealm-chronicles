import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { makeUvBoxGeometry } from '../../engine/uvGeometry.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { paletteOf } from '../../content/materialPalette.js';

import { t } from '../../engine/i18n.js';
/** 第五主题：混沌边境 — 三界交汇后的不稳定位面 */
export class AbyssZone extends BaseZone {
  constructor(scene, center, dialog) {
    super(scene, center, {
      radius: 135,
      skyColor: 0x120810,
      mapColor: '#6a2040',
      info: {
        id: ZONE_IDS.ABYSS,
        name: ZONE_NAMES[ZONE_IDS.ABYSS],
        subtitle: 'zone_subtitle_abyss',
        description: 'zone_desc_abyss',
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
    this.buildChaosRifts();
    this.buildLandmarks();
    this.buildOuterWilds();
  }

  sampleHeight(lx, lz) {
    const dist = Math.sqrt(lx * lx + lz * lz) / this.radius;
    const chaos = Math.sin(lx * 0.07) * Math.cos(lz * 0.06) * 2.5;
    const edgeFade = 1 - Math.pow(dist, 2);
    return Math.max(0, chaos * edgeFade);
  }

  buildTerrain() {
    // 地面由 WorldTerrain 统一绘制
  }

  buildChaosRifts() {
    const riftMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0x880022,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.7,
    });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = 25 + (i % 3) * 12;
      const h = 6 + Math.random() * 4;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.5, h, 5), riftMat);
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      pillar.position.set(lx, 3, lz);
      this.group.add(pillar);
      this.addCylinderCollider(lx, lz, 0.55, this.groundYAt(lx, lz) + h * 0.5 + 3, { base: this.groundYAt(lx, lz) - 0.5 });
    }
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2, 0),
      new THREE.MeshStandardMaterial({ color: 0xff4488, emissive: 0xff0044, emissiveIntensity: 1, wireframe: true })
    );
    core.position.set(0, 5, 0);
    core.name = 'chaosCore';
    this.group.add(core);
  }

  buildLandmarks() {
    this.addPOI(
      { x: 0, y: 0, z: 62 },
      'zone_poi_abyss_boss_gate_label',
      () => {
        this.dialog.show(t('zone_poi_abyss_boss_gate_label'), t('zone_dlg_abyss_boss_gate_text'));
      },
      { id: 'abyss-boss-gate', color: 0xff2244 }
    );
    this.addPOI(
      { x: -20, y: 0, z: 10 },
      'zone_poi_chaos_core_label',
      () => {
        window.dispatchEvent(new CustomEvent('discovery', {
          detail: { id: 'chaos-core', title: t('obj_chaos_core_title'), text: t('zone_disc_chaos_core_text') },
        }));
        this.dialog.show(t('obj_chaos_core_title'), t('zone_dlg_chaos_core_text'));
      },
      { id: 'chaos-core', color: 0xff2244 }
    );
  }

  buildOuterWilds() {
    // W-C5 切片10：外野散石上 crag 岩面（1 米一铺的无格多面体噪声）。退路读数 0.95
    // 仍是改前那个常数 —— 贴图库就绪后由 `applySurfaces` 换成贴图态。
    const mat = this.addSurfaceMaterial({ color: paletteOf('stone.abyssRock'), roughness: 0.95 }, 'crag');
    // 24 块石头尺寸完全一样（1.5×2×1.5），原来每块各 new 一份几何 = 24 份一模一样的
    // BufferGeometry。米制 UV（逐面 = 该面自己的米数）之后更是同一份就够：拿出来共用。
    const geo = makeUvBoxGeometry(1.5, 2, 1.5);
    for (let i = 0; i < 24; i++) {
      const lx = (Math.random() - 0.5) * this.radius * 1.6;
      const lz = (Math.random() - 0.5) * this.radius * 1.6;
      const rock = new THREE.Mesh(geo, mat);
      rock.position.set(lx, this.groundYAt(lx, lz) + 1, lz);
      rock.rotation.y = Math.random() * Math.PI;
      this.group.add(rock);
      this.addBoxCollider(lx, lz, 0.75, 0.75, this.groundYAt(lx, lz) + 2, { base: this.groundYAt(lx, lz) - 0.5, rot: rock.rotation.y });
    }
  }

  update(dt) {
    super.update(dt);
    const core = this.group.getObjectByName('chaosCore');
    if (core) {
      core.rotation.x += dt * 0.5;
      core.rotation.y += dt * 0.8;
    }
  }
}
