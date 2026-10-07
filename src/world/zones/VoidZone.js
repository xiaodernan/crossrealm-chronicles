import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { makeUvCylinderGeometry } from '../../engine/uvGeometry.js';
import { paletteOf } from '../../content/materialPalette.js';

/** 第四主题：破碎时线 — 指环王 + 星际穿越时间主题融合 */
export class VoidZone extends BaseZone {
  constructor(scene, center, dialog) {
    super(scene, center, {
      radius: 140,
      skyColor: 0x121018,
      mapColor: '#8a7a50',
      info: {
        id: ZONE_IDS.VOID,
        name: ZONE_NAMES[ZONE_IDS.VOID],
        subtitle: '第四位面 · 时间裂隙',
        description:
          '世界之锚飞升后才会显现的隐藏位面。金色时环悬浮于虚空，过去与未来在此重叠。时线执政官守护着「第四枚碎片」。',
      },
    });
    this.dialog = dialog;
    this.buildTerrain();
    this.buildTimeRings();
    this.buildShards();
    this.buildLandmarks();
    this.buildOuterWilds();
  }

  sampleHeight(lx, lz) {
    const dist = Math.sqrt(lx * lx + lz * lz) / this.radius;
    const ripple = Math.sin(lx * 0.06) * Math.cos(lz * 0.05) * 1.8;
    const edgeFade = 1 - Math.pow(dist, 2.2);
    return Math.max(0, ripple * edgeFade);
  }

  buildTerrain() {
    // 地面由 WorldTerrain 统一绘制
  }

  buildTimeRings() {
    const gold = new THREE.MeshStandardMaterial({
      color: paletteOf('metal.gilt'),
      emissive: 0x664400,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.25,
    });
    for (let i = 0; i < 5; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(8 + i * 4, 0.08, 8, 64), gold);
      ring.rotation.x = Math.PI / 2 + i * 0.15;
      ring.position.y = 6 + i * 2;
      ring.name = `timeRing${i}`;
      this.group.add(ring);
    }
  }

  buildShards() {
    const shardMat = new THREE.MeshStandardMaterial({
      color: paletteOf('crystal.shard'),
      emissive: 0x223355,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.75,
    });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 30 + (i % 4) * 8;
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(1.2 + Math.random()), shardMat);
      shard.position.set(Math.cos(a) * r, 3 + Math.sin(i) * 2, Math.sin(a) * r);
      shard.rotation.set(Math.random(), Math.random(), Math.random());
      this.group.add(shard);
    }
  }

  buildLandmarks() {
    const obelisk = new THREE.Group();
    // W-C5 切片6：柱身换 drum 表面（与废墟石柱同一套鼓形石段），几何随之换
    // `makeUvCylinderGeometry`（UV 以米计）。八面体顶盖保持原样的自带材质 ——
    // 球面参数化的 UV 不是米制，贴上去石块会随角度拉伸。
    const 退路 = { color: paletteOf('stone.voidPillar'), emissive: 0xc9a962, emissiveIntensity: 0.15, roughness: 0.85 };
    const pillarMat = this.addSurfaceMaterial(退路);
    const pillar = new THREE.Mesh(makeUvCylinderGeometry(0.8, 1.2, 12, 8), pillarMat);
    pillar.position.y = 6;
    obelisk.add(pillar);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(1.5), new THREE.MeshStandardMaterial(退路));
    cap.position.y = 13;
    obelisk.add(cap);
    obelisk.position.set(0, this.sampleHeight(0, 0), 0);
    this.group.add(obelisk);
    this.addCylinderCollider(0, 0, 1.5, this.sampleHeight(0, 0) + 14.5, { base: this.sampleHeight(0, 0) - 0.5 });

    this.addPOI(
      { x: 0, y: 0, z: -15 },
      '调查时线裂隙',
      () => {
        this.dialog.show(
          '时线裂隙',
          '第四枚位面碎片在时环中心闪烁。完成 Chapter 3 飞升后，时线执政官才会完全苏醒。\n\n蓄力法术（长按 {spell1}/{spell2}/{spell3}）可打断其「时停」攻击。'
        );
        window.dispatchEvent(new CustomEvent('discovery', {
          detail: { id: 'void-rift', title: '时线裂隙', text: '隐藏的第四碎片。' },
        }));
      },
      { id: 'void-rift', color: 0xc9a962 }
    );

    this.addPOI(
      { x: 25, y: 0, z: 20 },
      '阅读五维碑文',
      () => {
        window.dispatchEvent(new CustomEvent('discovery', {
          detail: { id: 'void-tablet', title: '五维碑文', text: '「Love is the one thing that transcends time and space.」' },
        }));
      },
      { id: 'void-tablet', color: 0x6688aa }
    );
  }

  buildOuterWilds() {
    const mat = new THREE.MeshStandardMaterial({ color: paletteOf('stone.voidRock'), roughness: 0.95 });
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const r = this.radius * 0.75 + Math.random() * 20;
      const lx = Math.cos(angle) * r;
      const lz = Math.sin(angle) * r;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random()), mat);
      rock.position.set(lx, this.sampleHeight(lx, lz) + 0.5, lz);
      this.group.add(rock);
    }
  }

  update(dt) {
    super.update(dt);
    for (let i = 0; i < 5; i++) {
      const ring = this.group.getObjectByName(`timeRing${i}`);
      if (ring) ring.rotation.z += dt * (0.3 + i * 0.1);
    }
  }
}
