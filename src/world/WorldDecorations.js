import * as THREE from 'three';

import { WINDING_ROUTES } from '../content/windingRoutes.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
export class WorldDecorations {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'WorldDecorations';
    scene.add(this.group);
    this._treeGroups = [];
  }

  build() {
    this._scatterTrees();
    this._scatterRocks();
    this._buildPathLanterns();
    this._buildZoneGates();
    this._buildHubDetails();
    this._buildHubMarket();
    this._buildRuinClusters();
    this._buildWildlifeMarkers();
  }

  /**
   * 给树干换贴图（W-C1 切片3）。
   *
   * 修前这里是**在循环里** `createMaterial` —— 每棵树一份材质，而所有树干本来共用
   * `_scatterTrees` 里那一份 `trunkMat`（`color 0x6a5040` 对每棵树都是同一个值）。
   * 于是"有多少棵树"就变成"多少份材质"，与 B73 记的另外两处同形；
   * 而换下来的那一份 `trunkMat` 连 `dispose` 都没有，一起漏掉。
   *
   * 两条都改掉：共享一份（`sharedMaterial`）+ 换完之后把没人持有的旧材质拆掉。
   * 旧材质能安全拆的前提是它**只属于树干** —— `trunkMat` 全文件只出现在 `_scatterTrees`
   * 的赋值与建树干那一行，循环跑完每一棵树都已改指共享材质，它确实没有持有者了。
   */
  applyTreeTextures(texLib = null) {
    const apply = (lib) => {
      if (!lib?.ready) return;
      const shared = lib.sharedMaterial('bark', 0x6a5040);
      const replaced = new Set();
      for (const tree of this._treeGroups) {
        const trunk = tree.children[0];
        if (!trunk?.isMesh) continue;
        if (trunk.material && trunk.material !== shared) replaced.add(trunk.material);
        trunk.material = shared;
      }
      for (const old of replaced) old.dispose();
    };
    // 可注入：不注入时自己 `load()`（生产路径），注入时同步跑完（用例路径）——
    // 这一处要断言的正是"建了几份材质、拆了几份"，而真去加载贴图的用例跑不稳也跑不快
    if (texLib) { apply(texLib); return; }
    TextureLibrary.load().then(apply);
  }

  _scatterTrees() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.95 });
    const leafColors = [0x3a5a32, 0x2d4a28, 0x456838, 0x5a7040];
    const spots = [
      ...this._ring(-200, 0, 120, 55),
      ...this._ring(0, -180, 110, 45),
      ...this._ring(200, 80, 115, 42),
      ...this._ring(0, 220, 100, 35),
      ...this._ring(-200, 220, 100, 35),
      ...this._ring(0, 55, 45, 18),
      ...this._line(0, 55, -200, 0, 25),
      ...this._line(0, 55, 0, -180, 22),
      ...this._line(0, 55, 200, 80, 24),
    ];
    for (const s of spots) {
      if (Math.abs(s.x) < 8 && Math.abs(s.z - 55) < 12) continue;
      const tree = new THREE.Group();
      const h = 2.5 + Math.random() * 2.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, h, 6), trunkMat);
      trunk.position.y = h * 0.5;
      trunk.castShadow = true;
      tree.add(trunk);
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(0.9 + Math.random() * 0.5, 2.2 + Math.random(), 7),
        new THREE.MeshStandardMaterial({
          color: leafColors[Math.floor(Math.random() * leafColors.length)],
          roughness: 0.85,
        })
      );
      foliage.position.y = h + 0.8;
      foliage.castShadow = true;
      tree.add(foliage);
      tree.position.set(s.x, this.world.getGroundHeight(s.x, s.z), s.z);
      tree.rotation.y = Math.random() * Math.PI * 2;
      tree.scale.setScalar(0.85 + Math.random() * 0.4);
      this.group.add(tree);
      this._treeGroups.push(tree);
    }
  }

  _ring(cx, cz, radius, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.35 + Math.random() * 0.65);
      out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r });
    }
    return out;
  }

  _scatterRocks() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5558, roughness: 0.92 });
    for (let i = 0; i < 80; i++) {
      const x = (Math.random() - 0.5) * 480;
      const z = (Math.random() - 0.5) * 520;
      if (Math.abs(x) < 6 && Math.abs(z - 55) < 8) continue;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.6, 0),
        mat
      );
      const gy = this.world.getGroundHeight(x, z);
      rock.position.set(x, gy + 0.15, z);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.scale.y = 0.5 + Math.random() * 0.5;
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
    }
  }

  _buildPathLanterns() {
    for (const route of WINDING_ROUTES) {
      if (route.id === 'hub-ring') continue;
      const pts = route.points;
      for (let i = 1; i < pts.length - 1; i += 2) {
        const [x, z] = pts[i];
        this._addLantern(x, z);
      }
    }
  }

  _addLantern(x, z) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 })
    );
    const gy = this.world.getGroundHeight(x, z);
    post.position.set(x, gy + 1.1, z);
    post.castShadow = true;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffcc66,
        emissive: 0xff9922,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9,
      })
    );
    lamp.position.set(x, gy + 2.35, z);
    this.group.add(post);
    this.group.add(lamp);
  }

  _buildZoneGates() {
    // 这五张牌上没有文字：曾经每行一个 `label` 抄着区名，而从 `arch` 到材质没人读过它
    // （颜色就是座位面的颜色）。W-B4 切片3 把它删掉 —— 抄一份不会上屏的名字，只会在改口时
    // 留下没人注意的旧文案。要加文字，接 `content/ZoneIdentity.js` 的 `ZONE_NAMES`。
    const gates = [
      { x: -95, z: 5, ry: 0, color: 0x668855 },
      { x: 5, z: -95, ry: Math.PI / 2, color: 0x6644aa },
      { x: 95, z: 45, ry: -0.35, color: 0x4466bb },
      { x: 5, z: 130, ry: 0, color: 0xaa8844 },
      { x: -95, z: 130, ry: -0.5, color: 0xaa2244 },
    ];
    for (const g of gates) {
      const arch = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: g.color,
        emissive: g.color,
        emissiveIntensity: 0.15,
        roughness: 0.7,
        metalness: 0.3,
      });
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), mat);
      left.position.set(-2.5, 2.5, 0);
      const right = left.clone();
      right.position.x = 2.5;
      const top = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.5, 0.5), mat);
      top.position.y = 5;
      arch.add(left, right, top);
      arch.position.set(g.x, this.world.getGroundHeight(g.x, g.z), g.z);
      arch.rotation.y = g.ry;
      this.group.add(arch);
    }
  }

  _buildHubDetails() {
    const gy = this.world.getGroundHeight(0, 55);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 2.5),
        new THREE.MeshStandardMaterial({
          color: 0xc9a962,
          emissive: 0x443300,
          emissiveIntensity: 0.3,
          side: THREE.DoubleSide,
        })
      );
      banner.position.set(Math.cos(a) * 14, gy + 3, 55 + Math.sin(a) * 14);
      banner.lookAt(0, gy + 3, 55);
      this.group.add(banner);
    }
    const fountain = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.12, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x88ccff,
        emissive: 0x224466,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.7,
      })
    );
    fountain.rotation.x = Math.PI / 2;
    fountain.position.set(0, gy + 0.15, 48);
    this.group.add(fountain);
  }

  _line(x1, z1, x2, z2, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      out.push({
        x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * 6,
        z: z1 + (z2 - z1) * t + (Math.random() - 0.5) * 6,
      });
    }
    return out;
  }

  _buildHubMarket() {
    const gy = this.world.getGroundHeight(0, 55);
    const stallMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.85 });
    const awningColors = [0x884422, 0x225588, 0x446633];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const r = 10 + (i % 2) * 2;
      const x = Math.cos(a) * r;
      const z = 55 + Math.sin(a) * r;
      const stall = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.8), stallMat);
      base.position.y = 0.6;
      stall.add(base);
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.08, 2.2),
        new THREE.MeshStandardMaterial({ color: awningColors[i % 3], roughness: 0.7 })
      );
      awning.position.y = 1.35;
      stall.add(awning);
      stall.position.set(x, gy, z);
      stall.rotation.y = -a + Math.PI;
      this.group.add(stall);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.35, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.9 })
      );
      bench.position.set(Math.cos(a) * 18, gy + 0.2, 55 + Math.sin(a) * 18);
      bench.rotation.y = -a;
      bench.castShadow = true;
      this.group.add(bench);
    }
  }

  _buildRuinClusters() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a756e, roughness: 0.92 });
    const clusters = [
      [-160, 15, 8], [-230, -20, 6], [30, -160, 7], [-20, -240, 5],
      [170, 60, 6], [240, 120, 5], [-10, 200, 6], [-170, 240, 5],
    ];
    for (const [cx, cz, n] of clusters) {
      for (let i = 0; i < n; i++) {
        const col = new THREE.Mesh(
          new THREE.BoxGeometry(0.5 + Math.random(), 1.5 + Math.random() * 2, 0.5 + Math.random()),
          stoneMat
        );
        const x = cx + (Math.random() - 0.5) * 12;
        const z = cz + (Math.random() - 0.5) * 12;
        col.position.set(x, this.world.getGroundHeight(x, z) + 0.8, z);
        col.rotation.y = Math.random() * Math.PI;
        col.castShadow = true;
        this.group.add(col);
      }
    }
  }

  _buildWildlifeMarkers() {
    const crystals = [
      [-175, 25], [-220, -15], [40, -190], [190, 75], [15, 210], [-185, 215],
    ];
    for (const [x, z] of crystals) {
      const c = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.5 + Math.random() * 0.4, 0),
        new THREE.MeshStandardMaterial({
          color: 0xaaddff,
          emissive: 0x4488cc,
          emissiveIntensity: 0.8,
          transparent: true,
          opacity: 0.85,
        })
      );
      c.position.set(x, this.world.getGroundHeight(x, z) + 0.8, z);
      c.rotation.y = Math.random() * Math.PI;
      this.group.add(c);
    }
  }
}
