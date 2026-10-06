import * as THREE from 'three';

import { WINDING_ROUTES } from '../content/windingRoutes.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { applyShadow } from '../engine/shadowPolicy.js';

/** 矩阵装配用的临时对象：build 一次性跑完，模块级一份就够 */
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/** 合批收尾三件套：矩阵上传 + 整群包围球（不 compute 的话 three 用几何自身的小球，一转身整群被裁掉） */
function sealBatch(inst) {
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
}

export class WorldDecorations {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'WorldDecorations';
    scene.add(this.group);
    /** 树干的合批网格：`applyTreeTextures` 换 bark 材质时只碰它 */
    this._treeTrunk = null;
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
   * 给树干换贴图。
   *
   * W-C1 切片3 修掉的是"循环里每棵树一份材质"：所有树干共用同一份 `trunkMat`，
   * 却在换贴图时每棵建一份 bark、还把旧的连 dispose 都不拆地丢掉（B73 同形）。
   * W-C2 切片2 合批之后，"每棵树一份"连存在的资格都没有了 —— 299 棵树只剩一个
   * 树干 InstancedMesh，换贴图就是给这一个网格换一次材质、拆一次旧的。
   */
  applyTreeTextures(texLib = null) {
    const apply = (lib) => {
      if (!lib?.ready) return;
      const shared = lib.sharedMaterial('bark', 0x6a5040);
      const trunk = this._treeTrunk;
      if (!trunk) return;
      if (trunk.material && trunk.material !== shared) {
        const old = trunk.material;
        trunk.material = shared;
        old.dispose();
      }
    };
    // 可注入：不注入时自己 `load()`（生产路径），注入时同步跑完（用例路径）——
    // 这一处要断言的正是"建了几份材质、拆了几份"，而真去加载贴图的用例跑不稳也跑不快
    if (texLib) { apply(texLib); return; }
    TextureLibrary.load().then(apply);
  }

  /**
   * 树（W-C2 切片2 合批）：约 300 棵 = 两个 InstancedMesh。
   *
   * 修前每棵树两份**随机参数**几何（树干高 h 烤进 CylinderGeometry、树冠半径/高烤进
   * ConeGeometry）加一份随机颜色的树冠材质 —— 600 个 draw call 的大头、几百份几何与材质。
   * 现在只剩"单位树干 + 单位树冠"两份几何：高度、粗细、颜色全部搬进每实例矩阵与
   * instanceColor，长出来的树与修前同一副模样（同一组随机分布）。
   */
  _scatterTrees() {
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
    const trees = [];
    for (const s of spots) {
      if (Math.abs(s.x) < 8 && Math.abs(s.z - 55) < 12) continue;
      trees.push({
        x: s.x,
        z: s.z,
        gy: this.world.getGroundHeight(s.x, s.z),
        h: 2.5 + Math.random() * 2.5,
        s: 0.85 + Math.random() * 0.4,
        rf: 0.9 + Math.random() * 0.5,
        hf: 2.2 + Math.random(),
        c: leafColors[Math.floor(Math.random() * leafColors.length)],
        rot: Math.random() * Math.PI * 2,
      });
    }
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, 0.28, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.95 }),
      trees.length
    );
    const foliage = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 7),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
      trees.length
    );
    trees.forEach((t, i) => {
      // 树干：修前是"几何高 h × 整树缩放 s"，即总高 s·h、半径 s×0.15 —— 矩阵里同值还原
      _dummy.position.set(t.x, t.gy + (t.s * t.h) / 2, t.z);
      _dummy.rotation.set(0, t.rot, 0);
      _dummy.scale.set(t.s, t.s * t.h, t.s);
      _dummy.updateMatrix();
      trunks.setMatrixAt(i, _dummy.matrix);
      // 树冠：中心在整树缩放后的 s·(h+0.8)，半径与高各自拉伸
      _dummy.position.set(t.x, t.gy + t.s * (t.h + 0.8), t.z);
      _dummy.scale.set(t.s * t.rf, t.s * t.hf, t.s * t.rf);
      _dummy.updateMatrix();
      foliage.setMatrixAt(i, _dummy.matrix);
      foliage.setColorAt(i, _color.setHex(t.c));
    });
    applyShadow(trunks, 'castOnly');
    applyShadow(foliage, 'castOnly');
    sealBatch(trunks);
    sealBatch(foliage);
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    this.group.add(trunks, foliage);
    this._treeTrunk = trunks;
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

  /** 石头（W-C2 切片2）：80 块随机大小的石头 → 单位十二面体 + 每实例缩放 = 1 个 InstancedMesh */
  _scatterRocks() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5558, roughness: 0.92 });
    const rocks = [];
    for (let i = 0; i < 80; i++) {
      const x = (Math.random() - 0.5) * 480;
      const z = (Math.random() - 0.5) * 520;
      if (Math.abs(x) < 6 && Math.abs(z - 55) < 8) continue;
      rocks.push({
        x,
        z,
        gy: this.world.getGroundHeight(x, z),
        r: 0.3 + Math.random() * 0.6,
        squash: 0.5 + Math.random() * 0.5,
        rot: [Math.random(), Math.random(), Math.random()],
      });
    }
    const inst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat, rocks.length);
    rocks.forEach((k, i) => {
      _dummy.position.set(k.x, k.gy + 0.15, k.z);
      _dummy.rotation.set(...k.rot);
      _dummy.scale.set(k.r, k.r * k.squash, k.r);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    });
    applyShadow(inst, 'prop');
    sealBatch(inst);
    this.group.add(inst);
  }

  /** 路灯（W-C2 切片2）：修前每盏 2 份几何 + 2 份材质，灯与灯一模一样 → 两个 InstancedMesh */
  _buildPathLanterns() {
    const pts = [];
    for (const route of WINDING_ROUTES) {
      if (route.id === 'hub-ring') continue;
      const p = route.points;
      for (let i = 1; i < p.length - 1; i += 2) pts.push(p[i]);
    }
    const posts = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.9 }),
      pts.length
    );
    const lamps = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffcc66,
        emissive: 0xff9922,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.9,
      }),
      pts.length
    );
    pts.forEach(([x, z], i) => {
      const gy = this.world.getGroundHeight(x, z);
      _dummy.position.set(x, gy + 1.1, z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      posts.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(x, gy + 2.35, z);
      _dummy.updateMatrix();
      lamps.setMatrixAt(i, _dummy.matrix);
    });
    applyShadow(posts, 'castOnly');
    sealBatch(posts);
    sealBatch(lamps);
    this.group.add(posts, lamps);
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
    // 五座门拱的柱与梁形状相同（W-C2 切片2）：几何共享一份，颜色仍一门一份材质
    const postGeo = new THREE.BoxGeometry(0.5, 5, 0.5);
    const topGeo = new THREE.BoxGeometry(5.5, 0.5, 0.5);
    for (const g of gates) {
      const arch = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: g.color,
        emissive: g.color,
        emissiveIntensity: 0.15,
        roughness: 0.7,
        metalness: 0.3,
      });
      const left = new THREE.Mesh(postGeo, mat);
      left.position.set(-2.5, 2.5, 0);
      const right = left.clone();
      right.position.x = 2.5;
      const top = new THREE.Mesh(topGeo, mat);
      top.position.y = 5;
      arch.add(left, right, top);
      arch.position.set(g.x, this.world.getGroundHeight(g.x, g.z), g.z);
      arch.rotation.y = g.ry;
      this.group.add(arch);
    }
  }

  _buildHubDetails() {
    const gy = this.world.getGroundHeight(0, 55);
    // 八面幡同形同色（W-C2 切片2）：一个 InstancedMesh，朝向走每实例 lookAt
    const banners = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.2, 2.5),
      new THREE.MeshStandardMaterial({
        color: 0xc9a962,
        emissive: 0x443300,
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
      }),
      8
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      _dummy.position.set(Math.cos(a) * 14, gy + 3, 55 + Math.sin(a) * 14);
      _dummy.lookAt(0, gy + 3, 55);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      banners.setMatrixAt(i, _dummy.matrix);
    }
    sealBatch(banners);
    this.group.add(banners);
    // 喷泉只此一份，保持单网格
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
    // 六个摊位同形（W-C2 切片2）：底座一个 InstancedMesh；雨棚同几何、三色走 instanceColor
    const bases = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.2, 1.2, 1.8),
      stallMat,
      6
    );
    const awnings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.6, 0.08, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
      6
    );
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const r = 10 + (i % 2) * 2;
      const x = Math.cos(a) * r;
      const z = 55 + Math.sin(a) * r;
      _dummy.rotation.set(0, -a + Math.PI, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.position.set(x, gy + 0.6, z);
      _dummy.updateMatrix();
      bases.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(x, gy + 1.35, z);
      _dummy.updateMatrix();
      awnings.setMatrixAt(i, _dummy.matrix);
      awnings.setColorAt(i, _color.setHex(awningColors[i % 3]));
    }
    sealBatch(bases);
    sealBatch(awnings);
    if (awnings.instanceColor) awnings.instanceColor.needsUpdate = true;
    this.group.add(bases, awnings);
    // 十条长椅同形同色（W-C2 切片2）：一个 InstancedMesh
    const benches = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.8, 0.35, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.9 }),
      10
    );
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      _dummy.position.set(Math.cos(a) * 18, gy + 0.2, 55 + Math.sin(a) * 18);
      _dummy.rotation.set(0, -a, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      benches.setMatrixAt(i, _dummy.matrix);
    }
    applyShadow(benches, 'castOnly');
    sealBatch(benches);
    this.group.add(benches);
  }

  /** 断柱（W-C2 切片2）：48 根高矮胖瘦全靠随机 → 单位方块 + 每实例缩放 = 1 个 InstancedMesh */
  _buildRuinClusters() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a756e, roughness: 0.92 });
    const clusters = [
      [-160, 15, 8], [-230, -20, 6], [30, -160, 7], [-20, -240, 5],
      [170, 60, 6], [240, 120, 5], [-10, 200, 6], [-170, 240, 5],
    ];
    const cols = [];
    for (const [cx, cz, n] of clusters) {
      for (let i = 0; i < n; i++) {
        const x = cx + (Math.random() - 0.5) * 12;
        const z = cz + (Math.random() - 0.5) * 12;
        cols.push({
          x,
          z,
          gy: this.world.getGroundHeight(x, z),
          w: 0.5 + Math.random(),
          h: 1.5 + Math.random() * 2,
          d: 0.5 + Math.random(),
          rot: Math.random() * Math.PI,
        });
      }
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMat, cols.length);
    cols.forEach((c, i) => {
      _dummy.position.set(c.x, c.gy + 0.8, c.z);
      _dummy.rotation.set(0, c.rot, 0);
      _dummy.scale.set(c.w, c.h, c.d);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    });
    applyShadow(inst, 'castOnly');
    sealBatch(inst);
    this.group.add(inst);
  }

  _buildWildlifeMarkers() {
    const crystals = [
      [-175, 25], [-220, -15], [40, -190], [190, 75], [15, 210], [-185, 215],
    ];
    const inst = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({
        color: 0xaaddff,
        emissive: 0x4488cc,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.85,
      }),
      crystals.length
    );
    crystals.forEach(([x, z], i) => {
      _dummy.position.set(x, this.world.getGroundHeight(x, z) + 0.8, z);
      _dummy.rotation.set(0, Math.random() * Math.PI, 0);
      _dummy.scale.setScalar(0.5 + Math.random() * 0.4);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
    });
    sealBatch(inst);
    this.group.add(inst);
  }
}
