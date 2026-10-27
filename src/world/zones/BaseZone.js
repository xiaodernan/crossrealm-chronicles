import * as THREE from 'three';
import { applyShadow } from '../../engine/shadowPolicy.js';
import { makeUvFacetGeometry } from '../../engine/uvGeometry.js';
import { SOLID } from '../../engine/Collision.js';
import { makeRegionSurfaceMaterial, applyRegionSurface } from '../regionSurfaces.js';
import { markNoBatch } from '../zoneBatching.js';
import { paletteOf } from '../../content/materialPalette.js';
import { releaseSubtree } from '../../engine/releaseSubtree.js';

export class BaseZone {
  constructor(scene, center, config) {
    this.scene = scene;
    /**
     * 区域中心是**三维**的。竖直分量取 0，因为这就是区域自己那一面的高度 ——
     * 下面 `group.position.set(center.x, 0, center.z)` 把整个区域组放在 y=0 的平面上，
     * 区域不携带自己的高程，地表起伏一律由 `TerrainHeight.sampleGlobalHeight` 回答。
     *
     * 为什么要在意这个 0：`InternalSpace.getWorldBaseHeight(zoneCenter)` 算的是
     * `zoneCenter.y + baseHeight + floor * floorHeight`，而生产递进来的正是这个对象。
     * 改前这里直接存调用方给的 `{x, z}`，`center.y` 就是 `undefined`，于是**每一次**
     * 室内高度都算成 `NaN`（B120）：走进晨曦大厅 → 地面 NaN →
     * `PlayerController.js:859` 那句 `position.y <= walkY + 0.12` 永远为假 →
     * 玩家一路下坠（实测到 -110 米）；此后任何一次拿 `getGroundHeight` 定落点的传送
     * （快速旅行 / 副本出口 / 存档落地）把 NaN 写进 `position`，阻尼相机从 NaN 出发
     * 再也 `lerp` 不回来 → 视锥六个面全 NaN → 整场剔除失效。
     *
     * 写门禁的那一批用例当初是拿 `{x: 180, y: 12, z: 100}` 这种**合成**中心验算式的
     * （B100），而生产从来没给过 `y` —— 契约在 fixture 里成立、在世界上不成立。
     */
    this.center = { x: center.x, y: 0, z: center.z };
    this.radius = config.radius ?? 120;
    this.group = new THREE.Group();
    this.group.position.set(center.x, 0, center.z);
    scene.add(this.group);

    this.info = config.info;
    /**
     * 区域的稳定身份（`world/ZoneIdentity.js`）。id 缺失是接线错误而不是可容忍的
     * 疏漏：所有按 id 找区、判分支的代码会静默落到 UNKNOWN，所以在这里当场喊出来。
     */
    this.id = this.info?.id ?? null;
    if (!this.id) console.warn(`[zone] ${this.constructor.name} 没有 info.id —— 逻辑将无法按区域分支（修 B36）`);
    this.skyColor = config.skyColor ?? 0x87a8c4;
    this.mapColor = config.mapColor ?? '#4488aa';
    this.poiMarkers = [];
    this.pois = [];
    /** 本地坐标碰撞体，build 结束后由 WorldManager 平移到世界坐标 */
    this.colliders = [];
    /**
     * 登记过的区域表面材质（W-C5 切片6 立，切片10 起按表面名登记）：贴图库就绪后由
     * `applySurfaces` 补挂。每条形如 `{ mat, surface }` —— surface 分开存是因为
     * 同一个区可以有好几种表面（废墟石柱是 drum、外野散石是 crag），而补挂时
     * 从材质本身问不出"它该贴哪一种"。
     */
    this._surfaceMats = [];
    /**
     * 世界时累计（秒）：POI 标记浮动（B118 同族）。同一条 update 里 `rotation.y += dt * 0.4`
     * 吃世界时，改前的浮动却吃墙钟 —— 定帧期间标记照样上下飘。子类各自用自己的 `_时相`
     * （同名同口径，见 `MagicZone` / `SpaceZone`），互不共享：两个区可以一个在戏一个不在。
     */
    this._时相 = 0;
    /**
     * 地面问手（缺陷② 切片F，修 B134）：问"这个本地坐标点在**世界高度场**上有多高"。
     *
     * 为什么要有它：各区自己的 `sampleHeight` 是**本区对高度场的贡献**，不是高度场本身。
     * 全局场（`TerrainHeight.sampleGlobalHeight`）取的是 `max(自然地, 各区贡献…)`，
     * 区缘还要按权重收口、枢纽广场要整平、室内那一档要掺混 —— 于是"摆件按 `sampleHeight`
     * 落座"与"地面按全局场铺"是**两张读数**：前者埋进地里、后者浮在半空。
     * 实测（B134 普查，641 次落座调用）：埋没 254 次、悬空 24 次，最狠一刀 **−22.96 米**
     * （中洲外野）—— 树长在地下二十三米。
     *
     * 挂的是**问手**不是坐标：问手去问世界那张场，与玩家脚下读的是同一个出口
     * （`WorldManager.getGroundHeight`），于是"摆件落座"与"玩家踩地"从此同一张场、
     * 同一条读数口。抄一份高度值就是第二份真相，搬区时它会烂在原地（B120 那一族）。
     */
    this._groundResolver = null;
  }

  /**
   * 挂上"按世界点问地面高度"的问手（由 `WorldManager.build()` 在建内容之前挂）。
   *
   * 问手收**世界坐标**、交**世界高度**；本地↔世界的换算由本区自己负责（`groundYAt`）。
   */
  attachGroundResolver(resolve) {
    if (typeof resolve !== 'function') {
      throw new Error('BaseZone.attachGroundResolver: 问手必须是函数 —— 没有它，摆件就会退回按本区自己的那份额度落座（B134）');
    }
    this._groundResolver = resolve;
    return this;
  }

  /**
   * 这块地在**世界高度场**上的高度（本地坐标进、世界高度出）。
   *
   * 没挂问手时退回本区自己的 `sampleHeight`（裸区单测与"没进世界的区"用得住）——
   * 那不是世界高度，只是本区对高度场的**贡献**；真世界里每一座区都挂着问手
   * （`WorldManager.build()` 逐区挂上后才建内容），门禁盯着这件事。
   *
   * 非有限值当场抛：NaN 会顺着高度流进整张可见网格（B120 的教训），
   * 静默地写进 `position.y` 只会在几百米外以"视锥全 NaN"的形式回来。
   */
  groundYAt(lx, lz) {
    if (!this._groundResolver) return this.sampleHeight(lx, lz);
    const y = this._groundResolver(this.center.x + lx, this.center.z + lz);
    if (!Number.isFinite(y)) {
      throw new Error(`BaseZone.groundYAt: 区域 ${this.id} 在本地 (${lx}, ${lz}) 上问到的地面高度不是有限数（${y}）—— `
        + '高度场里有一处 NaN，摆件落座会把 NaN 写进场景');
    }
    return y;
  }

  /**
   * 内容构建（子类覆写）。
   *
   * 为什么内容不在构造器里建（缺陷② 切片F，修 B134）：内容要问"这块地在世界场上有多高"，
   * 而世界场要**七座区都在册**才答得出来（`sampleGlobalHeight` 取各区贡献的最大值，
   * 区缘权重还按区几何算）。构造器里那一刻 `WorldManager.zones` 还是空的 ⇒ 问手答不了 ⇒
   * 摆件只能退回按本区自己的那份额度落座，也就是 B134 那个埋地二十三米的现场。
   *
   * 于是拆成两段：**构造器只构造**（身份、材质表、碰撞表、POI 表这些"是什么"），
   * **内容构建另起一段**（`build()`，由 `WorldManager` 在挂好地面问手之后统一调用）。
   */
  build() {}

  /** 登记一个本地坐标障碍；kind: solid | platform | ghost */
  addCollider(collider) {
    this.colliders.push(collider);
    return collider;
  }

  addCylinderCollider(x, z, r, top, { base = 0, kind = SOLID } = {}) {
    return this.addCollider({ shape: 'cyl', x, z, r, base, top, kind });
  }

  addBoxCollider(x, z, hx, hz, top, { base = 0, rot = 0, kind = SOLID } = {}) {
    return this.addCollider({ shape: 'box', x, z, hx, hz, base, top, rot, kind });
  }

  /**
   * 登记一份区域表面材质（W-C5 切片6 立，切片10 起带表面名）：参数与
   * `MeshStandardMaterial` 同形，`roughness` 是贴图未就绪时的退路读数。返回的材质
   * **归本区所有**（构建期就地挂到柱子上），贴图库就绪后由 `applySurfaces` 补挂 ——
   * 几何必须已是该表面的米制 UV（drum 走 `makeUvCylinderGeometry`、crag 走
   * `makeUvBoxGeometry` / `makeUvConeGeometry` / `makeUvFacetGeometry`），
   * 否则表面细节的尺寸会随工件大小走。
   */
  addSurfaceMaterial(params, surface = 'drum') {
    const mat = makeRegionSurfaceMaterial(params, surface);
    this._surfaceMats.push({ mat, surface });
    return mat;
  }

  /** 贴图库就绪后补挂本区登记过的石构材质（由 `WorldManager` 的 `load().then` 调用）；返回挂上的份数 */
  applySurfaces(texLib) {
    let 数 = 0;
    for (const { mat, surface } of this._surfaceMats) if (applyRegionSurface(mat, texLib, surface)) 数++;
    return 数;
  }

  distanceToCenter(x, z) {
    const dx = x - this.center.x;
    const dz = z - this.center.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  inZone(x, z) {
    return this.distanceToCenter(x, z) < this.radius;
  }

  getHeightAt(worldX, worldZ) {
    if (!this.inZone(worldX, worldZ)) return -Infinity;

    const lx = worldX - this.center.x;
    const lz = worldZ - this.center.z;
    // 这里问的是**本区对高度场的贡献**，不是高度场本身 —— 全局场（`sampleGlobalHeight`）
    // 要拿它跟自然地、区缘权重、广场与室内那一档一起取最大值。
    // 所以这里**必须**用 `sampleHeight`，换成 `groundYAt` 就成了"高度场里包含高度场"的自指。
    return this.sampleHeight(lx, lz);
  }

  sampleHeight(_lx, _lz) {
    return 0;
  }

  /**
   * 登记一个兴趣点。
   *
   * @param {{x:number,y?:number,z:number}} position 区域本地坐标
   * @param {string} label 交互提示文案 —— **只用于显示**
   * @param {() => void} onInteract
   * @param {{id?: string, type?: string, color?: number}} options 必须显式给 `id`
   */
  addPOI(position, label, onInteract, options = {}) {
    // 修 B45：id 曾经回退成 `${this.id}-${label}`，把显示名嵌进了稳定身份 ——
    // 改一句调查文案，这个 POI 的 id 就变，所有按 id 认领的下游静默断链。
    // 与 `RestPointManager.addRestPoint` 同一条契约：要么给真 id，要么在世界构建期炸给开发者看。
    const id = options.id;
    if (!id) throw new Error(`BaseZone.addPOI: 区域 ${this.id} 的 POI「${label}」缺少 id`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`BaseZone.addPOI: POI id「${id}」不符合 kebab-case（id 是稳定身份，不能带显示名或大写）`);
    }
    if (this.pois.some((p) => p.id === id)) throw new Error(`BaseZone.addPOI: 区域 ${this.id} 的 POI id ${id} 重复`);

    const lx = position.x;
    const lz = position.z;
    // `y` 缺省 = 贴地（世界高度场的读数）；给了就是显式高度（悬浮的传送门之类）。
    const ly = position.y ?? this.groundYAt(lx, lz);

    const poi = {
      id,
      position: new THREE.Vector3(this.center.x + lx, ly, this.center.z + lz),
      label,
      onInteract,
      type: options.type ?? 'lore',
    };
    this.pois.push(poi);

    const marker = this.createPOIMarker(lx, ly, lz, options.color ?? 0xc9a962);
    marker.userData.poiId = poi.id;
    this.group.add(marker);
    this.poiMarkers.push({ marker, poi });

    return poi;
  }

  createPOIMarker(x, y, z, color) {
    const group = new THREE.Group();

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.2, 3, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
      })
    );
    beam.position.y = 1.5;
    group.add(beam);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.6, 0.04, 8, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);

    group.position.set(x, y, z);
    // 光柱每帧上下浮、自转（`update` 里的 `_时相`），且本来就是半透明 —— 不合批。
    return markNoBatch(group);
  }

  getPointsOfInterest() {
    return this.pois;
  }

  update(dt) {
    this._时相 += dt;
    const t = this._时相 * 2;                 // 改前 `performance.now() * 0.002` = 每秒 2 弧度
    for (const { marker } of this.poiMarkers) {
      marker.position.y = marker.userData.baseY ?? marker.position.y;
      if (marker.userData.baseY === undefined) marker.userData.baseY = marker.position.y;
      marker.position.y = marker.userData.baseY + Math.sin(t + marker.position.x) * 0.08;
      marker.rotation.y += dt * 0.4;
    }
  }

  /**
   * 树的共享材质（W-C2 切片5）：`createTree` 原来每调一次建两份新材质，中洲 80 棵
   * 林子就是 160 份一模一样的 `MeshStandardMaterial`。合批按材质分桶，每桶只剩一棵树
   * ⇒ 想省下的那 160 次绘制一次也省不掉。参数相同就只建一份、全区共用。
   */
  treeMaterials() {
    if (!this._treeMats) {
      this._treeMats = {
        trunk: new THREE.MeshStandardMaterial({ color: paletteOf('wood.zoneTrunk'), roughness: 0.95 }),
        foliage: new THREE.MeshStandardMaterial({ color: paletteOf('foliage.zoneCrown'), roughness: 0.85 }),
      };
    }
    return this._treeMats;
  }

  /**
   * 一棵占位树。`foliageMaterial` 让某个区的某片林子换上自己的叶色而**不必逐棵新建**
   * （禁林 50 棵原来就是逐棵 `tree.children[1].material = new …`，把共享打回原形）。
   */
  createTree(x, z, scale = 1, { foliageMaterial } = {}) {
    const { trunk: trunkMat, foliage: crownMat } = this.treeMaterials();
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 2 * scale, 8),
      trunkMat
    );
    trunk.position.y = 1 * scale;
    applyShadow(trunk, 'castOnly');
    group.add(trunk);

    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(1.2 * scale, 3 * scale, 8),
      foliageMaterial ?? crownMat
    );
    foliage.position.y = 3 * scale;
    applyShadow(foliage, 'castOnly');
    group.add(foliage);

    const groundY = this.groundYAt(x, z);
    group.position.set(x, groundY, z);
    if (scale >= 0.6) {
      this.addCylinderCollider(x, z, Math.max(0.3, 0.42 * scale), groundY + 3 * scale, { base: groundY - 0.5 });
    }
    return group;
  }

  /**
   * 外野散石的共享材质（W-C5 切片10）：`createRock` 每调一次就登记一份的话，
   * 一座区几十块石头就是几十份一模一样的材质（十几份 GPU 程序、十几张贴图变体壳）。
   * 参数完全相同 ⇒ 只建一份、共享。`flatShading` 保留：石头要的是劈面，不是光滑。
   */
  rockSurfaceMaterial() {
    if (!this._rockMat) {
      this._rockMat = this.addSurfaceMaterial(
        { color: paletteOf('stone.zoneRock'), roughness: 0.95, flatShading: true },
        'crag'
      );
    }
    return this._rockMat;
  }

  createRock(x, z, size = 1) {
    // W-C5 切片10：石头从"一块多面体 + 一个常数"换成 crag 岩面（1 米一铺的无格多面体噪声）。
    // 几何走 `makeUvFacetGeometry`（按面投影的米制 UV）—— 每块石头的尺寸不同，
    // 只有 UV 以米计才能让岩面细节在任何大小的石头上都是 1 米一格。
    // 材质走 `addSurfaceMaterial` 两段式（世界构建早于贴图库就绪），退路读数仍是 0.95。
    const mat = this.rockSurfaceMaterial();
    const rock = new THREE.Mesh(makeUvFacetGeometry(new THREE.DodecahedronGeometry(size, 0)), mat);
    rock.position.set(x, this.groundYAt(x, z) + size * 0.4, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.set(1, 0.7 + Math.random() * 0.5, 1);
    applyShadow(rock, 'castOnly');
    if (size >= 0.8) this.addCylinderCollider(x, z, size * 0.8, rock.position.y + size * 1.1, { base: rock.position.y - size });
    return rock;
  }

  /**
   * 拆干净：把这一座位面从场景里摘掉，释放它造的那些几何与材质（W-C1 切片3f）。
   *
   * 为什么现在才有：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
   * 而 `WorldManager` 此前**没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
   * **七座区**（含致敬层那四族增强器挂在区上的装饰）造的资源**一份都不还**。
   *
   * **共享库造的资源不碰** —— 释放器按 `userData.shared` 标记跳过它们
   * （`engine/releaseSubtree.js`）。七座区共用同一口径，这一条在这里是**继承**来的：
   * 子类不需要各写一份 `dispose()`。
   */
  dispose() {
    this.scene.remove(this.group);
    releaseSubtree(this.group);
  }
}
