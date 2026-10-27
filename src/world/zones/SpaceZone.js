import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { applyShadow } from '../../engine/shadowPolicy.js';
import { makeUvConeGeometry, makeUvFacetGeometry } from '../../engine/uvGeometry.js';
import { markNoBatch } from '../zoneBatching.js';
import { paletteOf } from '../../content/materialPalette.js';
import { shouldUpdate as frameShouldUpdate } from '../../engine/FrameBudget.js';

import { t } from '../../engine/i18n.js';
/** 星际穿越风格 — 冰云行星、引力透镜、五维书架彩蛋 */
export class SpaceZone extends BaseZone {
  constructor(scene, center, dialog) {
    super(scene, center, {
      radius: 160,
      skyColor: 0x050810,
      mapColor: '#2a4a6a',
      info: {
        id: ZONE_IDS.SPACE,
        name: ZONE_NAMES[ZONE_IDS.SPACE],
        subtitle: 'zone_subtitle_space',
        description: 'zone_desc_space',
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
    this.buildBlackHole();
    this.buildIceStructures();
    this.buildTesseract();
    this.buildLandmarks();
    this.buildWreckage();
    this.buildMonoliths();
    this.buildTimeDistortion();
    this.buildOuterWilds();
  }

  sampleHeight(lx, lz) {
    const dist = Math.sqrt(lx * lx + lz * lz) / this.radius;
    const waves = Math.sin(lx * 0.05) * Math.sin(lz * 0.04) * 1.2;
    const edgeFade = 1 - Math.pow(dist, 2);
    return Math.max(0, waves * edgeFade);
  }

  buildTerrain() {
    // 地面由 WorldTerrain 统一绘制
  }

  /**
   * 冰面的共享材质（W-C5 切片10）。`buildIceStructures`（15 座冰晶）与
   * `buildOuterWilds`（30 根冰刺）共用 —— 改前两处各建一份，读数还不一样
   * （0.15 vs 0.2）。参数取**原先较低的那一份**（0.15）：冰面贴图接管之后
   * 粗糙度由贴图说话，这个数只在不贴图时兜底，取原来更常见的那一档。
   *
   * 惰性建：两个 build 方法谁先被调用都能拿到，且只登记一次（同一份材质
   * 在 `applySurfaces` 里只该补挂一次）。
   */
  iceSurfaceMaterial() {
    if (!this._iceMat) {
      this._iceMat = this.addSurfaceMaterial({
        color: paletteOf('crystal.ice'),
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
      }, 'ice');
    }
    return this._iceMat;
  }

  buildBlackHole() {
    const bhGroup = new THREE.Group();

    const disk = new THREE.Mesh(
      new THREE.RingGeometry(8, 25, 64),
      new THREE.MeshBasicMaterial({
        color: 0xff8844,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      })
    );
    disk.rotation.x = -Math.PI / 2.5;
    bhGroup.add(disk);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(6, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    bhGroup.add(core);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(7, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4488ff,
        transparent: true,
        opacity: 0.15,
      })
    );
    bhGroup.add(glow);

    bhGroup.position.set(30, this.groundYAt(30, -40) + 80, -40);
    this.group.add(bhGroup);
    this.blackHole = markNoBatch(bhGroup);

    const starsGeo = new THREE.BufferGeometry();
    const starCount = 500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 400;
      starPos[i * 3 + 1] = 30 + Math.random() * 150;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.9 })
    );
    this.group.add(stars);
  }

  buildIceStructures() {
    // W-C5 切片10：冰面（`ice` 表面，1.5 米一铺、光滑起伏）。`buildOuterWilds` 的 30 根
    // 冰刺原来**又抄了一份一模一样的材质**（两份读数、两份 GPU 程序）。合成一份共用的：
    // 45 件冰现在共享同一份材质与同一份贴图变体，而贴图只由这一份挂/补挂。
    const iceMat = this.iceSurfaceMaterial();

    for (let i = 0; i < 15; i++) {
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      const h = 3 + Math.random() * 8;
      const crystal = new THREE.Mesh(makeUvConeGeometry(1 + Math.random(), h, 4), iceMat);
      crystal.position.set(x, this.groundYAt(x, z) + h * 0.5, z);
      crystal.rotation.y = Math.random() * Math.PI;
      applyShadow(crystal, 'castOnly');
      this.group.add(crystal);
      const gy = this.groundYAt(x, z);
      this.addCylinderCollider(x, z, 0.7, gy + h, { base: gy - 0.5 });
    }
  }

  buildTesseract() {
    const tesseract = new THREE.Group();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.7 });

    const s = 2;
    const verts = [
      [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
      [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s],
    ];
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    for (const [a, b] of edges) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...verts[a]),
        new THREE.Vector3(...verts[b]),
      ]);
      tesseract.add(new THREE.Line(geo, lineMat));
    }

    tesseract.position.set(-40, this.groundYAt(-40, -30) + 5, -30);
    this.group.add(tesseract);
    this.tesseract = tesseract;
  }

  buildLandmarks() {
    this.addPOI({ x: -40, y: 5, z: -30 }, 'zone_poi_space_tesseract_label', () => {
      this.dialog.show(t('echo_tesseract_title'), t('zone_dlg_space_tesseract_text'));
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'space-tesseract', title: t('echo_tesseract_title'), text: t('zone_disc_space_tesseract_text') } }));
    }, { id: 'space-tesseract', color: 0x66ccff });

    this.addPOI({ x: 20, y: 0, z: 40 }, 'zone_poi_space_lens_label', () => {
      this.dialog.show(t('obj_space_lens_title'), t('zone_dlg_space_lens_text'));
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'space-lens', title: t('obj_space_lens_title'), text: t('zone_disc_space_lens_text') } }));
    }, { id: 'space-lens', color: 0xff8844 });
  }

  buildWreckage() {
    const hullMat = new THREE.MeshStandardMaterial({ color: paletteOf('metal.hull'), roughness: 0.7, metalness: 0.5 });
    const wreck = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 6), hullMat);
    body.rotation.z = 0.15;
    body.position.y = 1.5;
    wreck.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 0.4, 3), hullMat);
    wing.position.set(-4, 2.5, 0);
    wing.rotation.z = -0.5;
    wreck.add(wing);
    const engine = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.2, 2, 8),
      new THREE.MeshStandardMaterial({ color: paletteOf('metal.engine'), emissive: 0x112244, emissiveIntensity: 0.5 })
    );
    engine.position.set(5, 1, 0);
    engine.rotation.z = Math.PI / 2;
    wreck.add(engine);
    wreck.position.set(50, this.groundYAt(50, -20), -20);
    wreck.rotation.y = -0.6;
    this.group.add(wreck);
    this.addBoxCollider(50, -20, 6, 3, this.groundYAt(50, -20) + 3.2, { base: this.groundYAt(50, -20) - 1, rot: -0.6 });

    this.addPOI({ x: 50, y: 0, z: -20 }, 'zone_poi_space_wreck_label', () => {
      this.dialog.show(t('zone_dlg_space_wreck_title'), t('zone_dlg_space_wreck_text'));
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'space-wreck', title: t('zone_dlg_space_wreck_title'), text: t('zone_disc_space_wreck_text') } }));
    }, { id: 'space-wreck', color: 0x88aacc });
  }

  buildMonoliths() {
    const mat = new THREE.MeshStandardMaterial({
      color: paletteOf('metal.monolith'),
      roughness: 0.2,
      metalness: 0.9,
    });
    for (let i = 0; i < 4; i++) {
      const mono = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6 + i, 0.4), mat);
      const x = -60 + i * 15;
      const z = 60;
      mono.position.set(x, this.groundYAt(x, z) + 3, z);
      mono.rotation.y = 0.2 * i;
      applyShadow(mono, 'castOnly');
      this.group.add(mono);
      this.addBoxCollider(x, z, 0.6, 0.25, this.groundYAt(x, z) + 6 + i, { base: this.groundYAt(x, z) - 0.5, rot: 0.2 * i });
    }
  }

  buildTimeDistortion() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5, 0.08, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.2, 0);
    const zone = new THREE.Group();
    zone.add(ring);
    zone.position.set(10, this.groundYAt(10, 0), 0);
    this.group.add(zone);
    // 今天它靠"半透明不合批"侥幸躲过；真正的事实是 `update` 每帧转它、还改它的
    // `material.opacity` —— 声明出来，别让它靠材质的偶然性保命。
    this.timeRing = markNoBatch(ring);
  }

  update(dt) {
    super.update(dt);
    // 远距离装饰 LOD：1/4 帧率更新
    if (!frameShouldUpdate(4)) return;
    if (this.blackHole) {
      this.blackHole.rotation.z += dt * 0.05;
    }
    if (this.tesseract) {
      this.tesseract.rotation.x += dt * 0.3;
      this.tesseract.rotation.y += dt * 0.5;
    }
    if (this.timeRing) {
      this.timeRing.rotation.z += dt * 0.8;
      // `_时相` 由 `super.update(dt)` 累加（B118）：改前这里吃墙钟 —— 时停时"时间环"自己还在闪，
      // 而那正是时停要演示的东西。0.002/毫秒 = 每秒 2 弧度。
      this.timeRing.material.opacity = 0.3 + Math.sin(this._时相 * 2) * 0.15;
    }
  }

  buildOuterWilds() {
    // W-C5 切片10：与 `buildIceStructures` 共用同一份冰面材质（改前这里是第二份抄本，
    // 读数还不一样 —— 0.2 vs 0.15）。半透明的表面事实照贴，透明度是材质自己的事。
    const iceMat = this.iceSurfaceMaterial();
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const r = this.radius * 0.65 + Math.random() * this.radius * 0.3;
      const lx = Math.cos(angle) * r;
      const lz = Math.sin(angle) * r;
      const spike = new THREE.Mesh(makeUvConeGeometry(0.8, 3 + Math.random() * 4, 4), iceMat);
      spike.position.set(lx, this.groundYAt(lx, lz) + 1.5, lz);
      spike.rotation.y = Math.random() * Math.PI;
      this.group.add(spike);
      const gy = this.groundYAt(lx, lz);
      this.addCylinderCollider(lx, lz, 0.6, gy + spike.geometry.parameters.height, { base: gy - 0.5 });
    }
    // W-C5 切片10：外野散岩上 crag 岩面（1 米一铺的无格多面体噪声），退路读数 0.95。
    // 十二面体走按面投影的米制 UV —— 球面投影的经线缝会切在劈裂面上。
    const rockMat = this.addSurfaceMaterial({ color: paletteOf('stone.spaceRock'), roughness: 0.95 }, 'crag');
    for (let i = 0; i < 12; i++) {
      const lx = (Math.random() - 0.5) * this.radius * 1.4;
      const lz = (Math.random() - 0.5) * this.radius * 1.4;
      const rock = new THREE.Mesh(makeUvFacetGeometry(new THREE.DodecahedronGeometry(1.5 + Math.random(), 0)), rockMat);
      rock.position.set(lx, this.groundYAt(lx, lz) + 0.8, lz);
      this.group.add(rock);
      const s = rock.geometry.parameters.radius;
      this.addCylinderCollider(lx, lz, s * 0.85, this.groundYAt(lx, lz) + s * 1.4, { base: this.groundYAt(lx, lz) - s });
    }
  }
}
