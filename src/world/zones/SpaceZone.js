import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { applyShadow } from '../../engine/shadowPolicy.js';

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
        subtitle: '星际位面 · 星际穿越',
        description:
          '引力异常扭曲的荒原。巨大的黑洞透镜悬于天际，冰云在地表流动。传说五维空间的书架藏于此处，记录着所有位面的命运。',
      },
    });

    this.dialog = dialog;
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

    bhGroup.position.set(30, 80, -40);
    this.group.add(bhGroup);
    this.blackHole = bhGroup;

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
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0xaaccff,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85,
    });

    for (let i = 0; i < 15; i++) {
      const x = (Math.random() - 0.5) * 160;
      const z = (Math.random() - 0.5) * 160;
      const h = 3 + Math.random() * 8;
      const crystal = new THREE.Mesh(new THREE.ConeGeometry(1 + Math.random(), h, 4), iceMat);
      crystal.position.set(x, this.sampleHeight(x, z) + h * 0.5, z);
      crystal.rotation.y = Math.random() * Math.PI;
      applyShadow(crystal, 'castOnly');
      this.group.add(crystal);
      const gy = this.sampleHeight(x, z);
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

    tesseract.position.set(-40, 5, -30);
    this.group.add(tesseract);
    this.tesseract = tesseract;
  }

  buildLandmarks() {
    this.addPOI({ x: -40, y: 5, z: -30 }, '触碰五维_tesseract', () => {
      this.dialog.show(
        '五维_tesseract',
        '无数时间线的画面涌入脑海…你看到了其他位面的自己。在 tesseract 的中心，第三枚位面碎片以引力波的形式震荡。'
      );
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'space-tesseract', title: '五维_tesseract', text: '第三枚碎片以引力波形式存在。' } }));
    }, { id: 'space-tesseract', color: 0x66ccff });

    this.addPOI({ x: 20, y: 0, z: 40 }, '观测引力透镜', () => {
      this.dialog.show(
        '引力透镜',
        '黑洞的吸积盘在时空中弯曲…这里的时间流速与其他区域不同。每过一秒，外界或许已流逝一小时——这正是位面碎片的力量。'
      );
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'space-lens', title: '引力透镜', text: '时间在此扭曲。' } }));
    }, { id: 'space-lens', color: 0xff8844 });
  }

  buildWreckage() {
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.7, metalness: 0.5 });
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
      new THREE.MeshStandardMaterial({ color: 0x2a3040, emissive: 0x112244, emissiveIntensity: 0.5 })
    );
    engine.position.set(5, 1, 0);
    engine.rotation.z = Math.PI / 2;
    wreck.add(engine);
    wreck.position.set(50, this.sampleHeight(50, -20), -20);
    wreck.rotation.y = -0.6;
    this.group.add(wreck);
    this.addBoxCollider(50, -20, 6, 3, this.sampleHeight(50, -20) + 3.2, { base: this.sampleHeight(50, -20) - 1, rot: -0.6 });

    this.addPOI({ x: 50, y: 0, z: -20 }, '搜索 Endurance 号残骸', () => {
      this.dialog.show('Endurance 号', '飞船日志最后一条记录：「不要温和地走进那个良夜。」船载 AI 的数据核心里，藏着通往五维空间的密钥。');
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'space-wreck', title: 'Endurance 号', text: '残骸中藏有五维密钥。' } }));
    }, { id: 'space-wreck', color: 0x88aacc });
  }

  buildMonoliths() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x111118,
      roughness: 0.2,
      metalness: 0.9,
    });
    for (let i = 0; i < 4; i++) {
      const mono = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6 + i, 0.4), mat);
      const x = -60 + i * 15;
      const z = 60;
      mono.position.set(x, this.sampleHeight(x, z) + 3, z);
      mono.rotation.y = 0.2 * i;
      applyShadow(mono, 'castOnly');
      this.group.add(mono);
      this.addBoxCollider(x, z, 0.6, 0.25, this.sampleHeight(x, z) + 6 + i, { base: this.sampleHeight(x, z) - 0.5, rot: 0.2 * i });
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
    zone.position.set(10, this.sampleHeight(10, 0), 0);
    this.group.add(zone);
    this.timeRing = ring;
  }

  update(dt) {
    super.update(dt);
    if (this.blackHole) {
      this.blackHole.rotation.z += dt * 0.05;
    }
    if (this.tesseract) {
      this.tesseract.rotation.x += dt * 0.3;
      this.tesseract.rotation.y += dt * 0.5;
    }
    if (this.timeRing) {
      this.timeRing.rotation.z += dt * 0.8;
      this.timeRing.material.opacity = 0.3 + Math.sin(performance.now() * 0.002) * 0.15;
    }
  }

  buildOuterWilds() {
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xaaccff, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const r = this.radius * 0.65 + Math.random() * this.radius * 0.3;
      const lx = Math.cos(angle) * r;
      const lz = Math.sin(angle) * r;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3 + Math.random() * 4, 4), iceMat);
      spike.position.set(lx, this.sampleHeight(lx, lz) + 1.5, lz);
      spike.rotation.y = Math.random() * Math.PI;
      this.group.add(spike);
      const gy = this.sampleHeight(lx, lz);
      this.addCylinderCollider(lx, lz, 0.6, gy + spike.geometry.parameters.height, { base: gy - 0.5 });
    }
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a3545, roughness: 0.95 });
    for (let i = 0; i < 12; i++) {
      const lx = (Math.random() - 0.5) * this.radius * 1.4;
      const lz = (Math.random() - 0.5) * this.radius * 1.4;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + Math.random()), rockMat);
      rock.position.set(lx, this.sampleHeight(lx, lz) + 0.8, lz);
      this.group.add(rock);
      const s = rock.geometry.parameters.radius;
      this.addCylinderCollider(lx, lz, s * 0.85, this.sampleHeight(lx, lz) + s * 1.4, { base: this.sampleHeight(lx, lz) - s });
    }
  }
}
