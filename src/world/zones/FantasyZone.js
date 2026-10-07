import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { applyShadow } from '../../engine/shadowPolicy.js';
import { makeUvCylinderGeometry } from '../../engine/uvGeometry.js';

/** 指环王风格 — 古老森林、灰白山峰、 ruins 遗迹 */
export class FantasyZone extends BaseZone {
  constructor(scene, center, dialog) {
    super(scene, center, {
      radius: 165,
      skyColor: 0x6a7a88,
      mapColor: '#3d5c3a',
      info: {
        id: ZONE_IDS.FANTASY,
        name: ZONE_NAMES[ZONE_IDS.FANTASY],
        subtitle: '中洲遗境 · 指环王',
        description:
          '古老的精灵森林覆盖着灰白山脉的缓坡。倒塌的石柱诉说着失落文明的传说。传说世界之锚的碎片沉眠于「至尊石环」之下。',
      },
    });

    this.dialog = dialog;
    this.buildTerrain();
    this.buildMountains();
    this.buildForest();
    this.buildRuins();
    this.buildLandmarks();
    this.buildRiver();
    this.buildWatchtower();
    this.buildElvenBridge();
    this.buildBossEntrance();
    this.buildOuterWilds();
  }

  sampleHeight(lx, lz) {
    const dist = Math.sqrt(lx * lx + lz * lz) / this.radius;
    const hills =
      Math.sin(lx * 0.04) * Math.cos(lz * 0.035) * 4.5 +
      Math.sin(lx * 0.09 + 1.2) * Math.cos(lz * 0.07) * 2.2 +
      Math.sin(lx * 0.02 - lz * 0.03) * 3;
    const edgeFade = 1 - Math.pow(dist, 1.8);
    return Math.max(0, hills * edgeFade);
  }

  buildTerrain() {
    // 地面由 WorldTerrain 统一绘制，避免双层 mesh 穿模/z-fighting
  }

  buildMountains() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7a8088,
      roughness: 0.95,
      flatShading: true,
    });

    const peaks = [
      [-60, -40, 18, 12],
      [-80, 20, 22, 14],
      [50, -60, 15, 10],
      [70, 30, 20, 13],
    ];

    for (const [x, z, h, r] of peaks) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat);
      m.position.set(x, this.sampleHeight(x, z) + h * 0.5 - 2, z);
      applyShadow(m, 'castOnly');
      this.group.add(m);
      this.addCylinderCollider(x, z, r * 0.78, this.sampleHeight(x, z) + h * 0.7, { base: this.sampleHeight(x, z) - 3 });
    }
  }

  buildForest() {
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 15 + Math.random() * (this.radius - 20);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      if (Math.abs(x) < 12 && Math.abs(z + 20) < 15) continue;
      this.group.add(this.createTree(x, z, 0.8 + Math.random() * 0.6));
    }
  }

  buildRuins() {
    // W-C5 切片6：石柱换 drum 表面（1 米见方的鼓形石段）。几何换 `makeUvCylinderGeometry` ——
    // UV 以米计（u 绕该行周长、v 沿高），0.6↔0.8 的收分不会把石块拉成楔形。
    // 材质经 `addSurfaceMaterial` 登记，贴图库就绪后由 `WorldManager` 的 `load().then` 补挂。
    const stoneMat = this.addSurfaceMaterial({ color: 0x8a8580, roughness: 0.9 });

    for (let i = 0; i < 6; i++) {
      const h = 4 + Math.random() * 3;
      const col = new THREE.Mesh(makeUvCylinderGeometry(0.6, 0.8, h, 8), stoneMat);
      const x = -20 + i * 8 + (Math.random() - 0.5) * 4;
      const z = -15 + (Math.random() - 0.5) * 10;
      col.position.set(x, this.sampleHeight(x, z) + 2, z);
      col.rotation.z = (Math.random() - 0.5) * 0.3;
      applyShadow(col, 'castOnly');
      this.group.add(col);
      this.addCylinderCollider(x, z, 0.85, this.sampleHeight(x, z) + 2 + h * 0.5, { base: this.sampleHeight(x, z) - 0.5 });
    }

    for (let i = 0; i < 12; i++) {
      const x = (Math.random() - 0.5) * 100;
      const z = (Math.random() - 0.5) * 100;
      this.group.add(this.createRock(x, z, 0.5 + Math.random()));
    }
  }

  buildLandmarks() {
    const ringGroup = new THREE.Group();
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xc9a030,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x443300,
      emissiveIntensity: 0.3,
    });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.15, 8, 32), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3;
    ringGroup.add(ring);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.5, 6, 8),
      new THREE.MeshStandardMaterial({ color: 0x6a6560, roughness: 0.85 })
    );
    pillar.position.y = 3;
    ringGroup.add(pillar);

    ringGroup.position.set(-30, this.sampleHeight(-30, 10), 10);
    this.group.add(ringGroup);

    this.addPOI({ x: -30, y: 0, z: 10 }, '调查至尊石环', () => {
      this.dialog.show(
        '至尊石环',
        '你发现了一枚古老的铭文：「One Realm to bind them all...」石环微微发热——这是第一枚位面碎片的回响。'
      );
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'fantasy-ring', title: '至尊石环', text: '第一枚位面碎片的回响。' } }));
    }, { id: 'fantasy-ring', color: 0xc9a030 });

    this.addPOI({ x: -20, y: 0, z: -15 }, '探索精灵遗迹', () => {
      this.dialog.show(
        '精灵遗迹',
        '残破的壁画描绘着跨位面旅行的场景。精灵们曾在此记录诸界交汇的坐标——其中一条路径指向星空深处。'
      );
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'fantasy-ruins', title: '精灵遗迹', text: '壁画记录了跨位面坐标。' } }));
    }, { id: 'fantasy-ruins', color: 0x88aa88 });
  }

  buildRiver() {
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x3a6a8a,
      roughness: 0.15,
      metalness: 0.4,
      transparent: true,
      opacity: 0.85,
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(6, 90, 1, 1), waterMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(40, this.sampleHeight(40, 0) + 0.08, 0);
    this.group.add(river);

    for (let i = 0; i < 8; i++) {
      const rock = this.createRock(38 + (Math.random() - 0.5) * 4, -35 + i * 10, 0.3 + Math.random() * 0.3);
      this.group.add(rock);
    }
  }

  buildWatchtower() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6560, roughness: 0.9 });
    const tower = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 8, 8), stoneMat);
    base.position.y = 4;
    applyShadow(base, 'castOnly');
    tower.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 4, 8), stoneMat);
    top.position.y = 10;
    tower.add(top);
    const fire = new THREE.PointLight(0xff6622, 0.8, 15);
    fire.position.y = 12;
    tower.add(fire);
    tower.position.set(60, this.sampleHeight(60, -50), -50);
    this.group.add(tower);
    this.addCylinderCollider(60, -50, 3.2, this.sampleHeight(60, -50) + 8, { base: this.sampleHeight(60, -50) - 0.5 });

    this.addPOI({ x: 60, y: 0, z: -50 }, '攀登守望塔', () => {
      this.dialog.show('灰白守望塔', '从塔顶望去，三条位面之路清晰可见。北方是霍格沃兹遗境的紫色光柱，东方是米勒荒原的引力透镜。');
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'fantasy-tower', title: '灰白守望塔', text: '可俯瞰三界交汇。' } }));
    }, { id: 'fantasy-tower', color: 0xff6622 });
  }

  buildElvenBridge() {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.85 });
    const bridge = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.15, 0.8), woodMat);
      plank.position.set(i * 2.2 - 12, 1.2 + Math.sin(i * 0.4) * 0.2, 0);
      applyShadow(plank, 'castOnly');
      bridge.add(plank);
    }
    const railMat = new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.9 });
    const railL = new THREE.Mesh(new THREE.BoxGeometry(24, 0.8, 0.15), railMat);
    railL.position.set(0, 2, -1.2);
    bridge.add(railL);
    const railR = railL.clone();
    railR.position.z = 1.2;
    bridge.add(railR);
    bridge.position.set(-10, this.sampleHeight(-10, 35), 35);
    bridge.rotation.y = 0.4;
    this.group.add(bridge);
  }

  buildBossEntrance() {
    const arch = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a2838, emissive: 0x110022, emissiveIntensity: 0.3, roughness: 0.85 });
    const left = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.5), mat);
    left.position.set(-4, 3, 0);
    const right = left.clone();
    right.position.x = 4;
    const top = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 1.5), mat);
    top.position.y = 6;
    arch.add(left, right, top);
    arch.position.set(-55, this.sampleHeight(-55, -35), -35);
    this.group.add(arch);
    const gy = arch.position.y;
    this.addBoxCollider(-59, -35, 0.75, 0.75, gy + 6, { base: gy - 0.5 });
    this.addBoxCollider(-51, -35, 0.75, 0.75, gy + 6, { base: gy - 0.5 });

    this.addPOI({ x: -55, y: 0, z: -35 }, '进入 Boss 竞技场', () => {
      this.dialog.show('影界竞技场', '踏入此门，影界守护者将苏醒。确保已掌握：\n· 观察敌人脚下红圈，0.75 秒后攻击落地\n· {roll} 闪避可躲开\n· 重击快速打满架势条造成硬直');
    }, { id: 'fantasy-boss-gate', color: 0xff2244 });
  }

  buildOuterWilds() {
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x2a4030, roughness: 0.95 });
    for (let i = 0; i < 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const r = this.radius * 0.75 + Math.random() * this.radius * 0.2;
      const lx = Math.cos(angle) * r;
      const lz = Math.sin(angle) * r;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 4 + Math.random() * 3, 5), treeMat);
      trunk.position.set(lx, this.sampleHeight(lx, lz) + 2, lz);
      applyShadow(trunk, 'castOnly');
      this.group.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5 + Math.random(), 3, 6), treeMat);
      crown.position.set(lx, trunk.position.y + 3, lz);
      this.group.add(crown);
      this.addCylinderCollider(lx, lz, 0.5, trunk.position.y + 2 + trunk.geometry.parameters.height * 0.5, { base: this.sampleHeight(lx, lz) - 0.5 });
    }
    const ruinMat = new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.9 });
    for (let i = 0; i < 8; i++) {
      const lx = (Math.random() - 0.5) * this.radius * 1.6;
      const lz = (Math.random() - 0.5) * this.radius * 1.6;
      if (Math.sqrt(lx * lx + lz * lz) < this.radius * 0.4) continue;
      const block = new THREE.Mesh(new THREE.BoxGeometry(2, 1 + Math.random(), 2), ruinMat);
      block.position.set(lx, this.sampleHeight(lx, lz) + 0.5, lz);
      block.rotation.y = Math.random() * Math.PI;
      this.group.add(block);
      this.addBoxCollider(lx, lz, 1, 1, block.position.y + block.geometry.parameters.height * 0.5, { base: this.sampleHeight(lx, lz) - 0.4, rot: block.rotation.y });
    }
  }
}
