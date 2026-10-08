import * as THREE from 'three';
import { BaseZone } from './BaseZone.js';
import { ZONE_IDS, ZONE_NAMES } from '../../content/ZoneIdentity.js';
import { applyShadow } from '../../engine/shadowPolicy.js';
import { paletteOf } from '../../content/materialPalette.js';

/** 新增：幽暗林地 — 迷雾缠绕的古老森林，介于幻想与虚空之间 */
export class GloomZone extends BaseZone {
  constructor(scene, center, dialog) {
    super(scene, center, {
      radius: 160,
      skyColor: 0x1a1a2a,
      mapColor: '#3a3a4a',
      info: {
        id: ZONE_IDS.GLOOM,
        name: ZONE_NAMES[ZONE_IDS.GLOOM],
        subtitle: '幽暗森林 · 迷雾之境',
        description: '永恒的薄雾笼罩着扭曲的树木。这里没有阳光，只有微弱的荧光苔藓指引方向。',
      },
    });
    this.dialog = dialog;
    this.buildTerrain();
    this.buildMistPillars();
    this.buildLandmarks();
    this.buildOuterWilds();
  }

  sampleHeight(lx, lz) {
    const dist = Math.sqrt(lx * lx + lz * lz) / this.radius;
    const mist = Math.sin(lx * 0.05) * Math.cos(lz * 0.04) * 1.5;
    const edgeFade = 1 - Math.pow(dist, 1.5);
    return Math.max(0, mist * edgeFade);
  }

  buildTerrain() {
    // 地面由 WorldTerrain 统一绘制
  }

  buildMistPillars() {
    const mistMat = new THREE.MeshStandardMaterial({
      color: 0x6a6a8a,
      emissive: 0x3a3a5a,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.6,
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 30 + (i % 2) * 15;
      const h = 8 + Math.random() * 5;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, h, 6), mistMat);
      const lx = Math.cos(a) * r;
      const lz = Math.sin(a) * r;
      pillar.position.set(lx, h * 0.5, lz);
      this.group.add(pillar);
      this.addCylinderCollider(lx, lz, 0.7, this.sampleHeight(lx, lz) + h * 0.5 + 3, { base: this.sampleHeight(lx, lz) - 0.5 });
    }
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x4a4a6a, emissive: 0x2a2a4a, emissiveIntensity: 0.8, wireframe: true })
    );
    core.position.set(0, 4, 0);
    core.name = 'mistCore';
    this.group.add(core);
  }

  buildLandmarks() {
    this.addPOI(
      { x: 0, y: 0, z: 70 },
      '幽暗林地深处',
      () => {
        this.dialog.show('幽暗林地深处', '迷雾最浓处藏着古老的秘密。\n\n坐标：X≈180, Z≈170 · 需完成相关支线才能进入核心区域。');
      },
      { id: 'gloom-deep-entrance', color: 0x4a4a6a }
    );
    this.addPOI(
      { x: -30, y: 0, z: 20 },
      '荧光苔藓群落',
      () => {
        window.dispatchEvent(new CustomEvent('discovery', {
          detail: { id: 'gloom-moss', title: '荧光苔藓', text: '只在幽暗林地生长的发光苔藓，能指引迷途者。' },
        }));
        this.dialog.show('荧光苔藓群落', '采集荧光苔藓可制作照明道具。\n\n在营火处可将其炼制为「迷雾灯笼」。');
      },
      { id: 'gloom-moss', color: 0x6a6a8a }
    );
  }

  buildOuterWilds() {
    const mat = new THREE.MeshStandardMaterial({ color: paletteOf('stone.gloomRock'), roughness: 0.95 });
    for (let i = 0; i < 20; i++) {
      const lx = (Math.random() - 0.5) * this.radius * 1.5;
      const lz = (Math.random() - 0.5) * this.radius * 1.5;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + Math.random() * 0.8, 0), mat);
      rock.position.set(lx, this.sampleHeight(lx, lz) + 1, lz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.scale.set(1, 0.7 + Math.random() * 0.5, 1);
      applyShadow(rock, 'castOnly');
      if (rock.geometry.parameters.radius >= 1) {
        this.addCylinderCollider(lx, lz, rock.geometry.parameters.radius * 0.8, rock.position.y + rock.geometry.parameters.radius * 1.1, { base: rock.position.y - rock.geometry.parameters.radius });
      }
      this.group.add(rock);
    }
  }

  update(dt) {
    super.update(dt);
    const core = this.group.getObjectByName('mistCore');
    if (core) {
      core.rotation.x += dt * 0.3;
      core.rotation.y += dt * 0.5;
    }
  }
}