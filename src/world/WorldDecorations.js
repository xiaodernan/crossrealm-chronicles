import * as THREE from 'three';

import { WINDING_ROUTES } from '../content/windingRoutes.js';
import { paletteOf } from '../content/materialPalette.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { applyShadow } from '../engine/shadowPolicy.js';
import { releaseSubtree } from '../engine/releaseSubtree.js';

/** 矩阵装配用的临时对象：build 一次性跑完，模块级一份就够 */
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * 尺寸常数：几何、矩阵、碰撞体**三处**都要读它们。
 * 抄一份在碰撞体那边，改一天几何就留下一圈对不上现实的障碍（W-B10 切片4f 同族）。
 */
const TRUNK_BOTTOM_R = 0.28;
const LANTERN_POST_R = 0.1;
const LANTERN_POST_H = 2.2;
const GATE_POST_W = 0.5;
const GATE_POST_H = 5;
const GATE_POST_OFFSET = 2.5;
const STALL_BASE = { w: 2.2, h: 1.2, d: 1.8 };
const BENCH = { w: 1.8, h: 0.35, d: 0.6 };
/**
 * 摆件与交互点之间额外让开的距离。
 *
 * 切片B1 之前这件事**不成其为事**：摆件没有碰撞体，压在地标上也照样能站上去交互。
 * 登记体之后，一块水晶落在 POI 那一格 = 那个交互口被墙吃掉（⑤ 量到的就是 fantasy-ruins）。
 * 这里是"比玩家站下所需再宽一档"的余量，**不是**玩家碰撞半径的抄本（那个数由
 * `PlayerController` 声明，测试侧从声明处取）。
 */
const INTERACTION_CLEAR = 1.0;

/**
 * 障碍底面埋进"这件摆件脚下那块地"以下多少米。
 *
 * 为什么要往下埋：几何底面**高于**当地地面时（半截埋着的石头、坡上垫高的摊位），
 * 只按几何底面登记的那一体挡不住贴地走的人群 —— 玩家从摆件**底下**穿过去，
 * 还是穿模，只是换了个方向。
 */
const BASE_SINK = 0.3;

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
    /**
     * 这一层登记进碰撞世界的障碍（切片B）。存**引用**而不是靠 `owner` 前缀去扫全表：
     * 拆卸时只该取回自己那几块，`world.collision` 里其余的（七座区、室内空间、边界墙）
     * 不归这层管。
     */
    this._blocks = [];
  }

  /**
   * 摆一件带障碍的摆件：登记一块体，并把引用留在 `_blocks` 里好日后取回。
   *
   * ## 为什么这一层以前一块体都没有
   *
   * W-C2 切片2 把散件合成 `InstancedMesh` 时，删掉的**不只是每棵树一份网格，还有每棵树
   * 那块碰撞体** —— 合批之后"这一件在哪、多大"只剩实例矩阵里的 16 个数，而登记障碍要的是
   * 一份可读的坐标。于是 482 个会挡住玩家身体（脚到胸这段高度带里探得出轮廓）的装饰实例
   * 里，445 个零覆盖：树、石、灯柱、门柱、摊、椅、断柱、水晶，全部走进去如入无人之境。
   * 这就是"人物行走时穿模"的主因（`tests/decoration-collider-coverage.test.js` 把这两个数
   * 钉成门禁）。
   *
   * ## 为什么直接写 `world.collision` 而不是再走一次汇总
   *
   * `WorldManager.buildCollision()` 先跑完，这一层才 `build()`。看着像漏了一份，其实不是：
   * `CollisionWorld.add()` 会把空间哈希标脏、由第一次查询在同一张网格上惰性重建 ——
   * 晚到的碰撞体与那一批走的是同一条路，不需要第二次汇总。（`remove()` 同样标脏。）
   *
   * ## `owner` 是什么
   *
   * 家族身份串（如 `wildTreeTrunk`）。诊断要说出"挡在哪一族身上"，门禁要按族算分母，
   * 两者都读这一个字段 —— 不拿位置或下标当身份（同类里两件摆件换个种子就换了下标）。
   *
   * `addCylinder/addBox` 对退化尺寸（半径或半边长 ≤ 0）返回 null —— 那种件不登记，
   * 也不许悄悄漏进 `_blocks`（否则 dispose 会去摘一份根本没登记的体）。
   */
  _blockCyl({ x, z, r, foot, top, ground, owner }) {
    const c = this.world.collision.addCylinder({
      x, z, r, owner,
      base: Math.min(foot, ground - BASE_SINK),
      top,
    });
    if (c) this._blocks.push(c);
    return c;
  }

  /** 盒那一族（门柱 / 摊底 / 长椅 / 断柱）：`rot` 是这一件摆件自己的 Y 朝向，与矩阵同值 */
  _blockBox({ x, z, hx, hz, foot, top, ground, rot = 0, owner }) {
    const c = this.world.collision.addBox({
      x, z, hx, hz, rot, owner,
      base: Math.min(foot, ground - BASE_SINK),
      top,
    });
    if (c) this._blocks.push(c);
    return c;
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
   * 这件摆件的**落脚点**该按哪个高度摆：中心 + 四个方向各 r 米共 5 个采样，
   * 取最高与最低的**中点**。
   *
   * 为什么要问周围而不是问一个点：枢纽那一圈（摊、椅、幡、泉）以前整圈共用一次
   * `getGroundHeight(0, 55)` 的采样。hub 中心实测 4.74 m，而半径 10–18 m 那一圈是
   * 12.46–18.14 m —— 于是六个摊、十条椅、八面幡、一座喷泉整个埋进坡下
   * （实测顶面低于当地地面 2.8~7.5 米）：玩家看不见它们，也就谈不上撞上它们。
   *
   * 为什么取中点：这些摆件是**平的方块**，坡地上不可能四面都贴地。压到最高点就留缝，
   * 压到最低点就埋边 —— 取中点把两边的误差都封在"当地起伏的一半"以内。
   * 真要贴死，得把 hub 那块广场整平（30 m 盘内起伏实测 20.11 m），那是另一片。
   * 判据与读数在 `tests/decoration-ground-landing.test.js`。
   */
  _padGround(x, z, r) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const h = this.world.getGroundHeight(x + ox, z + oz);
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
    return (lo + hi) / 2;
  }

  /**
   * 把落点从交互点上让开：世界先建、这一层后摆，所以摆的时候 `pointsOfInterest` 已经知道了。
   *
   * 只改坐标、**不吃随机数** —— 往散布里插一次 `Math.random()` 会把后面每一族的布局都摇走，
   * 而这里要修的只是"这一件压住了那一格"。逐条 POI 迭代到不再压住任何一条：退开 A 可能正落在
   * B 的格子上，一趟不够。半径由调用方给**这一族可能的最大值**（尺寸是稍后才摇出来的，不能等它）。
   */
  _clearOfInteractions(x, z, 半径) {
    const 点们 = this.world.pointsOfInterest ?? [];
    const 让位 = 半径 + INTERACTION_CLEAR;
    let 出 = { x, z };
    for (let 轮 = 0; 轮 < 4; 轮++) {
      let 动了 = false;
      for (const p of 点们) {
        const 座 = p.position ?? p;
        if (!Number.isFinite(座.x) || !Number.isFinite(座.z)) continue;
        const dx = 出.x - 座.x;
        const dz = 出.z - 座.z;
        const 距 = Math.hypot(dx, dz);
        if (距 >= 让位) continue;
        动了 = true;
        // 完全重合时"沿当前方向推"没有方向可推 —— 定一条，免得同一格的摆件各自随机漂
        出 = 距 < 1e-6
          ? { x: 座.x + 让位, z: 座.z }
          : { x: 座.x + (dx * 让位) / 距, z: 座.z + (dz * 让位) / 距 };
      }
      if (!动了) break;
    }
    return 出;
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
      const shared = lib.sharedMaterial('bark', paletteOf('wood.bark'));
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
    const leafColors = paletteOf('foliage.leaf');
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
      // 树干体半径 = TRUNK_BOTTOM_R × s，而 s 是下面才摇出来的 ⇒ 按这一族的最大可能值让位
      const 落 = this._clearOfInteractions(s.x, s.z, TRUNK_BOTTOM_R * 1.25);
      trees.push({
        x: 落.x,
        z: 落.z,
        gy: this.world.getGroundHeight(落.x, 落.z),
        h: 2.5 + Math.random() * 2.5,
        s: 0.85 + Math.random() * 0.4,
        rf: 0.9 + Math.random() * 0.5,
        hf: 2.2 + Math.random(),
        c: leafColors[Math.floor(Math.random() * leafColors.length)],
        rot: Math.random() * Math.PI * 2,
      });
    }
    const trunks = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.15, TRUNK_BOTTOM_R, 1, 6),
      new THREE.MeshStandardMaterial({ color: paletteOf('wood.trunk'), roughness: 0.95 }),
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
      // 障碍吃的是**这一棵树自己的** s 与 h（与上面那条矩阵同一组数字）：
      // 约 300 棵树以前一份障碍都没有，玩家直接从树干里走过去（切片B 的账）
      this._blockCyl({
        x: t.x, z: t.z, r: TRUNK_BOTTOM_R * t.s,
        foot: t.gy, top: t.gy + t.s * t.h, ground: t.gy, owner: 'wildTreeTrunk',
      });
    });
    applyShadow(trunks, 'castOnly');
    applyShadow(foliage, 'castOnly');
    sealBatch(trunks);
    sealBatch(foliage);
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    trunks.name = 'wildTreeTrunk';
    foliage.name = 'wildTreeCrown';
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
    const mat = new THREE.MeshStandardMaterial({ color: paletteOf('stone.fieldRock'), roughness: 0.92 });
    const rocks = [];
    for (let i = 0; i < 80; i++) {
      const x = (Math.random() - 0.5) * 480;
      const z = (Math.random() - 0.5) * 520;
      if (Math.abs(x) < 6 && Math.abs(z - 55) < 8) continue;
      const 落 = this._clearOfInteractions(x, z, 0.9); // 0.9 = 这一族摇得出的最大石半径
      rocks.push({
        x: 落.x,
        z: 落.z,
        gy: this.world.getGroundHeight(落.x, 落.z),
        r: 0.3 + Math.random() * 0.6,
        squash: 0.5 + Math.random() * 0.5,
        rot: [Math.random(), Math.random(), Math.random()],
      });
    }
    const inst = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat, rocks.length);
    rocks.forEach((k, i) => {
      const 心 = k.gy + 0.15;
      const 半高 = k.r * k.squash;
      _dummy.position.set(k.x, 心, k.z);
      _dummy.rotation.set(...k.rot);
      _dummy.scale.set(k.r, 半高, k.r);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
      // 石头是这一族里唯一**顶面够得着踩**的（矮的那几块顶在脚下 0.6 米内）：
      // `supportAt` 会把它当台阶 —— 与 `BaseZone.createRock` 同一个口径，不是新行为
      this._blockCyl({
        x: k.x, z: k.z, r: k.r, foot: 心 - 半高, top: 心 + 半高, ground: k.gy, owner: 'wildRock',
      });
    });
    applyShadow(inst, 'prop');
    sealBatch(inst);
    inst.name = 'wildRock';
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
      new THREE.CylinderGeometry(0.08, LANTERN_POST_R, LANTERN_POST_H, 6),
      new THREE.MeshStandardMaterial({ color: paletteOf('wood.door'), roughness: 0.9 }),
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
      _dummy.position.set(x, gy + LANTERN_POST_H / 2, z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      posts.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(x, gy + LANTERN_POST_H + 0.15, z);
      _dummy.updateMatrix();
      lamps.setMatrixAt(i, _dummy.matrix);
      this._blockCyl({
        x, z, r: LANTERN_POST_R, foot: gy, top: gy + LANTERN_POST_H, ground: gy, owner: 'pathLanternPost',
      });
    });
    applyShadow(posts, 'castOnly');
    sealBatch(posts);
    sealBatch(lamps);
    posts.name = 'pathLanternPost';
    lamps.name = 'pathLanternLamp';
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
    const postGeo = new THREE.BoxGeometry(GATE_POST_W, GATE_POST_H, GATE_POST_W);
    const topGeo = new THREE.BoxGeometry(GATE_POST_OFFSET * 2 + GATE_POST_W, 0.5, 0.5);
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
      left.position.set(-GATE_POST_OFFSET, GATE_POST_H / 2, 0);
      const right = left.clone();
      right.position.x = GATE_POST_OFFSET;
      const top = new THREE.Mesh(topGeo, mat);
      top.position.y = GATE_POST_H;
      left.name = right.name = 'zoneGatePost';
      top.name = 'zoneGateBeam';
      arch.add(left, right, top);
      // 拱脚落在**三处采样（中心 + 两根柱各自脚下）里最低的那一处**：以前只取拱中心一个
      // 采样点，于是跨坡那一侧的柱脚悬在空中（钉死布局实测五座门里三座有一根柱脚
      // 高出当地地面 0.32~0.60 米）。取最低点后每根柱脚都埋进自己那块地，代价是
      // 上坡那根埋得更深 —— 柱高 5 米，顶仍然露在外面。
      const cos = Math.cos(g.ry);
      const sin = Math.sin(g.ry);
      const 拱脚 = [
        this.world.getGroundHeight(g.x, g.z),
        this.world.getGroundHeight(g.x - GATE_POST_OFFSET * cos, g.z + GATE_POST_OFFSET * sin),
        this.world.getGroundHeight(g.x + GATE_POST_OFFSET * cos, g.z - GATE_POST_OFFSET * sin),
      ];
      const 座 = Math.min(...拱脚);
      arch.position.set(g.x, 座, g.z);
      arch.rotation.y = g.ry;
      arch.name = 'zoneGate';
      // 两根柱各挡各的：门洞是**通的**（梁在 5 米高，挡不住身体，也就不该登记）
      for (const side of [-1, 1]) {
        const px = g.x + side * GATE_POST_OFFSET * cos;
        const pz = g.z - side * GATE_POST_OFFSET * sin;
        this._blockBox({
          x: px, z: pz, hx: GATE_POST_W / 2, hz: GATE_POST_W / 2,
          foot: 座, top: 座 + GATE_POST_H, ground: this.world.getGroundHeight(px, pz),
          rot: g.ry, owner: 'zoneGatePost',
        });
      }
      this.group.add(arch);
    }
  }

  _buildHubDetails() {
    // 八面幡同形同色（W-C2 切片2）：一个 InstancedMesh，朝向走每实例 lookAt
    const banners = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.2, 2.5),
      new THREE.MeshStandardMaterial({
        color: paletteOf('metal.gilt'),
        emissive: 0x443300,
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
      }),
      8
    );
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // 高度问**这一面幡站的那一点**：整圈共用一次 (0,55) 的采样把八面幡埋进山里
      // （实测 hub 中心 4.74 m，半径 14 m 处 12.28–15.86 m ⇒ 幡顶低于当地地面 3.3~13.6 m）
      const x = Math.cos(a) * 14;
      const z = 55 + Math.sin(a) * 14;
      const y = this.world.getGroundHeight(x, z) + 3;
      _dummy.position.set(x, y, z);
      _dummy.lookAt(0, y, 55);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      banners.setMatrixAt(i, _dummy.matrix);
    }
    sealBatch(banners);
    banners.name = 'hubBanner';
    this.group.add(banners);
    // 喷泉只此一份，保持单网格
    const fountain = new THREE.Mesh(
      new THREE.TorusGeometry(3, 0.12, 8, 32),
      new THREE.MeshStandardMaterial({
        color: paletteOf('crystal.hub'),
        emissive: 0x224466,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.7,
      })
    );
    fountain.rotation.x = Math.PI / 2;
    // 泉池那一圈半径 3 米，落脚点按整圈起伏取中点（`_padGround`）
    fountain.position.set(0, this._padGround(0, 48, 3) + 0.15, 48);
    fountain.name = 'hubFountain';
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
    const stallMat = new THREE.MeshStandardMaterial({ color: paletteOf('wood.bridge'), roughness: 0.85 });
    const awningColors = paletteOf('fabric.awning');
    /** 摊底在 XZ 上的外接半径：`_padGround` 问"周围那块地"就按它取样，与盒的半宽同源 */
    const 摊外接 = Math.hypot(STALL_BASE.w / 2, STALL_BASE.d / 2);
    // 六个摊位同形（W-C2 切片2）：底座一个 InstancedMesh；雨棚同几何、三色走 instanceColor
    const bases = new THREE.InstancedMesh(
      new THREE.BoxGeometry(STALL_BASE.w, STALL_BASE.h, STALL_BASE.d),
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
      // 底座 2.2×1.8 → 外接半径 `摊外接`；整圈共用一次 (0,55) 采样的旧写法把这些摊位移到
      // 坡下面去了（实测该圈地面 12.46–18.14 m，而 hub 中心只有 4.74 m ⇒ 顶面低于地面）
      const gy = this._padGround(x, z, 摊外接);
      const 心 = gy + STALL_BASE.h / 2;
      _dummy.rotation.set(0, -a + Math.PI, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.position.set(x, 心, z);
      _dummy.updateMatrix();
      bases.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(x, gy + 1.35, z);
      _dummy.updateMatrix();
      awnings.setMatrixAt(i, _dummy.matrix);
      awnings.setColorAt(i, _color.setHex(awningColors[i % 3]));
      // 底座登记为盒障碍；雨棚**不再单独登记** —— 它与底座同中心，而底座那一体从地面
      // 一路挡到台面（实测雨棚底 1.31 m 已在台面顶 1.2 m 之上），玩家要碰到雨棚，
      // 先得被台面挡住。给一片 8 厘米厚的棚板再立一块墙，只是把障碍数翻倍。
      this._blockBox({
        x, z, hx: STALL_BASE.w / 2, hz: STALL_BASE.d / 2,
        foot: 心 - STALL_BASE.h / 2, top: 心 + STALL_BASE.h / 2,
        ground: this.world.getGroundHeight(x, z), rot: -a + Math.PI, owner: 'hubStallBase',
      });
    }
    sealBatch(bases);
    sealBatch(awnings);
    bases.name = 'hubStallBase';
    awnings.name = 'hubStallAwning';
    if (awnings.instanceColor) awnings.instanceColor.needsUpdate = true;
    this.group.add(bases, awnings);
    // 十条长椅同形同色（W-C2 切片2）：一个 InstancedMesh
    const benches = new THREE.InstancedMesh(
      new THREE.BoxGeometry(BENCH.w, BENCH.h, BENCH.d),
      new THREE.MeshStandardMaterial({ color: paletteOf('wood.bench'), roughness: 0.9 }),
      10
    );
    /** 长椅在 XZ 上的外接半径（1.8×0.6 → 0.949）：`_padGround` 与障碍同读这一个数 */
    const 椅外接 = Math.hypot(BENCH.w / 2, BENCH.d / 2);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = Math.cos(a) * 18;
      const z = 55 + Math.sin(a) * 18;
      const gy = this._padGround(x, z, 椅外接);
      const 心 = gy + 0.2;
      _dummy.position.set(x, 心, z);
      _dummy.rotation.set(0, -a, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      benches.setMatrixAt(i, _dummy.matrix);
      this._blockBox({
        x, z, hx: BENCH.w / 2, hz: BENCH.d / 2,
        foot: 心 - BENCH.h / 2, top: 心 + BENCH.h / 2,
        ground: this.world.getGroundHeight(x, z), rot: -a, owner: 'hubBench',
      });
    }
    applyShadow(benches, 'castOnly');
    sealBatch(benches);
    benches.name = 'hubBench';
    this.group.add(benches);
  }

  /** 断柱（W-C2 切片2）：48 根高矮胖瘦全靠随机 → 单位方块 + 每实例缩放 = 1 个 InstancedMesh */
  _buildRuinClusters() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: paletteOf('stone.ruin'), roughness: 0.92 });
    const clusters = [
      [-160, 15, 8], [-230, -20, 6], [30, -160, 7], [-20, -240, 5],
      [170, 60, 6], [240, 120, 5], [-10, 200, 6], [-170, 240, 5],
    ];
    const cols = [];
    for (const [cx, cz, n] of clusters) {
      for (let i = 0; i < n; i++) {
        const x = cx + (Math.random() - 0.5) * 12;
        const z = cz + (Math.random() - 0.5) * 12;
        // 1.06 = 断柱底面的外接半宽（w、d 各 ≤ 1.5 时斜边的一半）
        const 落 = this._clearOfInteractions(x, z, 1.06);
        cols.push({
          x: 落.x,
          z: 落.z,
          gy: this.world.getGroundHeight(落.x, 落.z),
          w: 0.5 + Math.random(),
          h: 1.5 + Math.random() * 2,
          d: 0.5 + Math.random(),
          rot: Math.random() * Math.PI,
        });
      }
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMat, cols.length);
    cols.forEach((c, i) => {
      const 心 = c.gy + 0.8;
      _dummy.position.set(c.x, 心, c.z);
      _dummy.rotation.set(0, c.rot, 0);
      _dummy.scale.set(c.w, c.h, c.d);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
      // 单位方块缩放出来的断柱：半边长就是缩放值的一半，与矩阵同一组数字
      this._blockBox({
        x: c.x, z: c.z, hx: c.w / 2, hz: c.d / 2,
        foot: 心 - c.h / 2, top: 心 + c.h / 2, ground: c.gy, rot: c.rot, owner: 'wildRuinColumn',
      });
    });
    applyShadow(inst, 'castOnly');
    sealBatch(inst);
    inst.name = 'wildRuinColumn';
    this.group.add(inst);
  }

  _buildWildlifeMarkers() {
    const crystals = [
      [-175, 25], [-220, -15], [40, -190], [190, 75], [15, 210], [-185, 215],
    ];
    const inst = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({
        color: paletteOf('crystal.wild'),
        emissive: 0x4488cc,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.85,
      }),
      crystals.length
    );
    crystals.forEach(([x0, z0], i) => {
      // 手摆的名册里 [-220,-15] 与 fantasy-ruins 那条 POI 同一格 —— 登记体之后这就是堵死交互口
      const { x, z } = this._clearOfInteractions(x0, z0, 0.9); // 0.9 = 摇得出的最大水晶半径
      const gy = this.world.getGroundHeight(x, z);
      const 心 = gy + 0.8;
      _dummy.position.set(x, 心, z);
      _dummy.rotation.set(0, Math.random() * Math.PI, 0);
      const s = 0.5 + Math.random() * 0.4;
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      inst.setMatrixAt(i, _dummy.matrix);
      // 八面体半径 1、等比缩放 s ⇒ XZ 与竖直都是 s：尖晶柱泡在地上，底面按 `BASE_SINK` 压到脚下
      this._blockCyl({
        x, z, r: s, foot: 心 - s, top: 心 + s, ground: gy, owner: 'wildCrystal',
      });
    });
    sealBatch(inst);
    inst.name = 'wildCrystal';
    this.group.add(inst);
  }

  /**
   * 拆干净：把装饰那一组从场景里摘掉，释放它造的那些几何与材质（W-C1 切片3f）。
   *
   * 为什么现在才有：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
   * 而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
   * 它造的那些几何与材质**一份都不还**。
   *
   * **共享库造的资源不碰** —— 树皮的共享材质（`TextureLibrary.sharedMaterial`）带
   * `userData.shared` 标记 ⇒ 释放器跳过它（`engine/releaseSubtree.js`）。
   *
   * **障碍一起摘**：切片B 起这一层往 `world.collision` 里登记本体，而那些体住在**世界**那一侧，
   * `releaseSubtree` 走场景树看不见它们。网格拆了、障碍留着，就是玩家撞上一堵看不见的墙 ——
   * 比穿模更难查的那种。摘完把数组清空，二次 `dispose()` 不会去摘别人的体。
   */
  dispose() {
    for (const c of this._blocks) this.world.collision.remove(c);
    this._blocks.length = 0;
    this.scene.remove(this.group);
    releaseSubtree(this.group);
  }
}
