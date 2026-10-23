import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { applyShadow } from '../../engine/shadowPolicy.js';
import { markNoBatch } from '../zoneBatching.js';
import { paletteOf } from '../../content/materialPalette.js';

/** 哈利波特风格 — 悬浮城堡、魔法光柱、禁林 */
export class MagicZone extends BaseZone {
  constructor(scene, center, dialog) {
    super(scene, center, {
      radius: 155,
      skyColor: 0x1a1530,
      mapColor: '#5a3a8a',
      info: {
        id: ZONE_IDS.MAGIC,
        name: ZONE_NAMES[ZONE_IDS.MAGIC],
        subtitle: 'zone_subtitle_magic',
        description: 'zone_desc_magic',
      },
    });

    this.dialog = dialog;
    this.magicParticles = [];
    this.buildTerrain();
    this.buildCastle();
    this.buildForbiddenForest();
    this.buildMagicEffects();
    this.buildLandmarks();
    this.buildQuidditchRing();
    this.buildGreenhouses();
    this.buildFloatingBooks();
    this.buildMagicBossGate();
    this.buildOuterWilds();
  }

  buildMagicBossGate() {
    const gate = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: paletteOf('crystal.magic'),
      emissive: 0x220044,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.8,
    });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(4, 0.2, 8, 32, Math.PI), mat);
    arch.rotation.z = Math.PI;
    arch.position.y = 4;
    gate.add(arch);

    const portal = new THREE.Mesh(
      new THREE.CircleGeometry(3.5, 32),
      new THREE.MeshBasicMaterial({ color: 0x8844ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
    );
    gate.position.set(0, 8, -25);
    gate.add(portal);
    this.group.add(gate);

    this.addPOI({ x: 0, y: 8, z: -25 }, 'zone_poi_magic_boss_gate_label', () => {
      this.dialog.show('奥术竞技场', '大奥术师·萨尔林 awaits。他的法球会追踪你——闪避，或用法术位面斩 ({skill}) 清理。');
    }, { id: 'magic-boss-gate', color: 0xaa44ff });
  }

  sampleHeight(lx, lz) {
    const dist = Math.sqrt(lx * lx + lz * lz) / this.radius;
    const flat = Math.sin(lx * 0.02) * Math.cos(lz * 0.02) * 0.8;
    const edgeFade = 1 - Math.pow(dist, 1.8);
    return Math.max(0, flat * edgeFade);
  }

  buildTerrain() {
    // 地面由 WorldTerrain 统一绘制
  }

  buildCastle() {
    const castle = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: paletteOf('stone.castleWall'), roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: paletteOf('stone.castleRoof'), roughness: 0.8 });

    const main = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 16), wallMat);
    main.position.y = 18;
    applyShadow(main, 'castOnly');
    castle.add(main);

    const towerPositions = [
      [-12, 0, -10],
      [12, 0, -10],
      [-12, 0, 10],
      [12, 0, 10],
    ];
    for (const [tx, , tz] of towerPositions) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 22, 8), wallMat);
      tower.position.set(tx, 22, tz);
      applyShadow(tower, 'castOnly');
      castle.add(tower);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 6, 8), roofMat);
      roof.position.set(tx, 35, tz);
      castle.add(roof);
    }

    castle.position.set(0, 8, 0);
    this.group.add(castle);

    for (let i = 0; i < 8; i++) {
      const candle = new THREE.PointLight(0xffaa44, 0.4, 8);
      candle.position.set((Math.random() - 0.5) * 18, 14 + Math.random() * 8, (Math.random() - 0.5) * 14);
      castle.add(candle);
    }
  }

  buildForbiddenForest() {
    // W-C2 切片5：改前这里逐棵 `tree.children[1].material = new …` —— 50 棵禁林树
    // 50 份同样的深绿材质，合批（按材质分桶）时每桶只剩一棵，等于合不动。
    // 现在一片林子一份材质，靠 `createTree` 的 `foliageMaterial` 递进去。
    const forbidden = new THREE.MeshStandardMaterial({
      color: paletteOf('foliage.forbidden'),
      roughness: 0.95,
    });
    for (let i = 0; i < 50; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 60;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      this.group.add(this.createTree(x, z, 1 + Math.random() * 0.5, { foliageMaterial: forbidden }));
    }
  }

  buildMagicEffects() {
    const beamGeo = new THREE.CylinderGeometry(0.5, 2, 40, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x6644cc,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 28, 0);
    this.group.add(beam);

    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaa88ff, size: 0.3, transparent: true, opacity: 0.8 });
    this.particles = new THREE.Points(geo, mat);
    this.group.add(this.particles);
  }

  buildLandmarks() {
    this.addPOI({ x: 0, y: 8, z: 5 }, 'zone_poi_magic_castle_label', () => {
      this.dialog.show(
        '悬浮城堡',
        '魔法屏障闪烁…「只有被选中的穿越者才能踏入。」城堡内部的时间似乎静止了——第二枚位面碎片就藏在移动楼梯的顶端。'
      );
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'magic-castle', title: '悬浮城堡', text: '第二枚位面碎片藏于楼梯顶端。' } }));
    }, { id: 'magic-castle', color: 0xaa66ff });

    this.addPOI({ x: 55, y: 0, z: 30 }, 'zone_poi_magic_forest_label', () => {
      this.dialog.show(
        '禁林低语',
        '独角兽的幻影一闪而过，留下一枚闪烁的羽毛。羽毛上的符文与霍格沃兹创始人的封印如出一辙——魔法与诸界本是一体。'
      );
      window.dispatchEvent(new CustomEvent('discovery', { detail: { id: 'magic-forest', title: '禁林低语', text: '独角兽留下了位面线索。' } }));
    }, { id: 'magic-forest', color: 0x44aa66 });
  }

  buildQuidditchRing() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.15, 8, 48),
      new THREE.MeshStandardMaterial({ color: paletteOf('metal.quidditchRing'), emissive: 0x443300, emissiveIntensity: 0.3, metalness: 0.6 })
    );
    ring.position.set(-35, 18, -20);
    ring.rotation.x = Math.PI / 2.2;
    this.group.add(ring);

    const hoopMat = new THREE.MeshStandardMaterial({ color: paletteOf('metal.quidditchHoop'), metalness: 0.8, roughness: 0.3 });
    for (const x of [-35, -27]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 24), hoopMat);
      hoop.position.set(x, 16, -20);
      this.group.add(hoop);
    }
  }

  buildGreenhouses() {
    const glassMat = new THREE.MeshStandardMaterial({
      color: paletteOf('crystal.greenhouse'),
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
      metalness: 0.2,
    });
    for (let g = 0; g < 3; g++) {
      const gh = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 5), glassMat);
      frame.position.y = 1.5;
      gh.add(frame);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5, 2, 4), glassMat);
      roof.position.y = 3.5;
      roof.rotation.y = Math.PI / 4;
      gh.add(roof);
      gh.position.set(-50 + g * 12, this.sampleHeight(-50 + g * 12, 50), 50);
      this.group.add(gh);
      const gx = -50 + g * 12;
      const gy = this.sampleHeight(gx, 50);
      this.addBoxCollider(gx, 50, 4, 2.5, gy + 4.5, { base: gy - 0.5 });
    }
  }

  buildFloatingBooks() {
    this.books = [];
    const bookMat = new THREE.MeshStandardMaterial({ color: paletteOf('wood.book'), roughness: 0.8 });
    for (let i = 0; i < 15; i++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.35), bookMat);
      book.position.set((Math.random() - 0.5) * 60, 5 + Math.random() * 15, (Math.random() - 0.5) * 60);
      book.rotation.set(Math.random(), Math.random(), Math.random());
      // 每帧浮 + 每帧转（`update` 里改 `mesh.position.y` / `rotation.y`）：合进批里
      // 顶点就被烘死了，`this.books` 里那些引用会变成"改了没人看"。
      this.group.add(markNoBatch(book));
      this.books.push({ mesh: book, baseY: book.position.y, phase: Math.random() * Math.PI * 2 });
    }
  }

  update(dt) {
    super.update(dt);
    if (this.particles) {
      this.particles.rotation.y += dt * 0.1;
    }
    if (this.books) {
      const t = this._时相;                 // `_时相` 由 `super.update(dt)` 累加（B118：改前这里是墙钟，漂浮书在定帧里照样上下飞）
      for (const b of this.books) {
        b.mesh.position.y = b.baseY + Math.sin(t + b.phase) * 0.6;
        b.mesh.rotation.y += dt * 0.5;
      }
    }
  }

  buildOuterWilds() {
    const crystalMat = new THREE.MeshStandardMaterial({
      color: paletteOf('crystal.magic'),
      emissive: 0x220044,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
    });
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + 0.2;
      const r = this.radius * 0.7 + (i % 5) * 8;
      const lx = Math.cos(angle) * r;
      const lz = Math.sin(angle) * r;
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.6 + Math.random() * 0.4), crystalMat);
      crystal.position.set(lx, 2 + Math.sin(i) * 2, lz);
      this.group.add(crystal);
    }
    const treeMat = new THREE.MeshStandardMaterial({ color: paletteOf('foliage.magicWild'), roughness: 0.95 });
    for (let i = 0; i < 20; i++) {
      const lx = (Math.random() - 0.5) * this.radius * 1.5;
      const lz = (Math.random() - 0.5) * this.radius * 1.5;
      if (Math.sqrt(lx * lx + lz * lz) < this.radius * 0.35) continue;
      const tree = new THREE.Mesh(new THREE.ConeGeometry(1.2, 5, 5), treeMat);
      tree.position.set(lx, 2.5, lz);
      this.group.add(tree);
      this.addCylinderCollider(lx, lz, 0.55, 5, { base: -0.5 });
    }
  }
}
