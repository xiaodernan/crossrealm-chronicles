import * as THREE from 'three';
import { SOLID } from '../engine/Collision.js';

/**
 * 内部空间 —— 区域内的房间/建筑/洞穴/楼层（W-B9 切片2）。
 *
 * 设计动机：
 * - 区域是大尺度的平面划分（半径 100~200 米），内部空间是小尺度的立体划分（几米到几十米）。
 * - 之前"进屋"只能靠 POI 触发瞬移/对话，没有真实的室内几何与高度。
 * - 现在每个内部空间自带：
 *   - 独立的本地坐标系（相对区域中心）
 *   - 自定义高度采样（sampleHeightInternal）
 *   - 自己的碰撞体、POI、装饰物
 *   - 可选的垂直层级（floor），支持竖向日程
 * - WorldManager 按区域收集内部空间，玩家进入/离开时切换归属与碰撞检测；
 *   **地面**则由 `groundBlendAt` 掺进那一条全局高度场（W-B9 切片E，修 B126 —— 以前室内
 *   那一档只在占地里整体替换地面，占地外一刀交回室外，脚踩的那层与看见的那层是两层）。
 */

export class InternalSpace {
  /**
   * @param {object} config
   * @param {string} config.id - kebab-case 稳定 id（如 'gloom-ancient-shrine'）
   * @param {string} config.zoneId - 所属区域 id（ZoneIdentity.ZONE_IDS.*）
   * @param {{x:number,z:number}} config.localCenter - 相对区域中心的本地坐标
   * @param {number} config.radius - 水平半径（判断玩家是否在内部）
   * @param {number} [config.floor=0] - 垂直层级（0=地面层，1=二层，-1=地下室……）
   * @param {number} [config.floorHeight=4] - 层高（米）
   * @param {number} [config.baseHeight=0] - 基础高度偏移（相对区域地面）
   * @param {Function} [config.sampleHeightInternal] - 内部高度采样函数 (lx, lz) => y
   * @param {number} [config.rimBand] - 地面过渡带宽（米，见 `groundWeightAt`；缺省取占地半径）
   * @param {THREE.Color|number} [config.fogColor] - 内部雾色
   * @param {number} [config.fogDensity] - 内部雾密度
   */
  constructor(config) {
    this.id = config.id;
    this.zoneId = config.zoneId;
    this.localCenter = config.localCenter;
    this.radius = config.radius ?? 15;
    this.floor = config.floor ?? 0;
    this.floorHeight = config.floorHeight ?? 4;
    this.baseHeight = config.baseHeight ?? 0;
    this.sampleHeightInternal = config.sampleHeightInternal ?? (() => 0);
    /** 没声明就按占地半径给一条够宽的下限：宁可过渡带宽一点，不许默认值是刀（B126 的本体） */
    this.rimBand = config.rimBand ?? this.radius;
    this.fogColor = config.fogColor ?? 0x888888;
    this.fogDensity = config.fogDensity ?? 0.01;
    this.group = new THREE.Group();
    this.colliders = [];
    this.pois = [];
    this.poiMarkers = [];
    this.decorations = [];
    /** 世界时累计（秒）：POI 标记浮动的相位源（B118，与 `zones/BaseZone._时相` 同口径） */
    this._时相 = 0;
    this._built = false;
  }

  /** 世界坐标系下的中心 */
  getWorldCenter(zoneCenter) {
    return {
      x: zoneCenter.x + this.localCenter.x,
      z: zoneCenter.z + this.localCenter.z,
    };
  }

  /** 世界坐标系下的地面高度 */
  getWorldBaseHeight(zoneCenter) {
    return zoneCenter.y + this.baseHeight + this.floor * this.floorHeight;
  }

  /** 判断世界坐标点是否在内部空间水平投影内 */
  containsWorldPoint(worldX, worldZ, zoneCenter) {
    const wc = this.getWorldCenter(zoneCenter);
    const dx = worldX - wc.x;
    const dz = worldZ - wc.z;
    return dx * dx + dz * dz < this.radius * this.radius;
  }

  /**
   * 这个**世界点**上"室内那一档地面"占多少 —— 高度场里那一档的权重，与归属（`containsWorldPoint`）
   * 是同一条判据的两种问法：占地内恒 1（边界用同一个 `<`，所以两条在 d = radius 上不会各说一头），
   * `[radius, radius + rimBand]` 里走 smoothstep 收到 0，带外恒 0。
   *
   * 为什么必须有这一段（B126）：室内那一层地板此前只在"占地内"回答，占地外一刀交回室外地形 ——
   * 实测最狠的一档是星港瞭望塔 **23.36 米**（占地里 24.00、外头 0.64），幽暗神殿反向 21.09 米。
   * 玩家跨过去时 `walkY` 当场跳十几二十米，竖直阻尼只会把他**从山体里穿上去**，
   * 而可见的那张地面网格根本不认这一档 —— 脚踩的那层与看见的那层是两层。
   * 两端导数为 0 ⇒ 带内外那两条接痕不成折线（与区缘收口、枢纽广场同一条形状）。
   * 带宽够不够由 `tests/interior-ground-field.test.js` 从实测落差反推的那条尺钉着，不由这里手打的数说了算。
   */
  groundWeightAt(worldX, worldZ, zoneCenter) {
    const wc = this.getWorldCenter(zoneCenter);
    const d = Math.hypot(worldX - wc.x, worldZ - wc.z);
    if (d < this.radius) return 1;
    if (this.rimBand <= 0) return 0;
    const t = (d - this.radius) / this.rimBand;
    if (t >= 1) return 0;
    return 1 - t * t * (3 - 2 * t);
  }

  /** 本地坐标转世界坐标 */
  localToWorld(lx, lz, zoneCenter) {
    return {
      x: zoneCenter.x + this.localCenter.x + lx,
      z: zoneCenter.z + this.localCenter.z + lz,
    };
  }

  /** 世界坐标转本地坐标 */
  worldToLocal(wx, wz, zoneCenter) {
    return {
      x: wx - zoneCenter.x - this.localCenter.x,
      z: wz - zoneCenter.z - this.localCenter.z,
    };
  }

  /** 获取内部空间某点的绝对高度 */
  getInternalHeightAt(worldX, worldZ, zoneCenter) {
    const local = this.worldToLocal(worldX, worldZ, zoneCenter);
    const internalY = this.sampleHeightInternal(local.x, local.z);
    return this.getWorldBaseHeight(zoneCenter) + internalY;
  }

  /** 登记内部碰撞体 */
  addCollider(collider) {
    this.colliders.push(collider);
    return collider;
  }

  addCylinderCollider(lx, lz, r, top, { base = 0, kind = SOLID } = {}) {
    return this.addCollider({
      shape: 'cyl',
      lx,
      lz,
      r,
      // base / top 相对本层地面（floor ground），展开时由 _expandCollider 加上
      // worldBase（= zoneCenter.y + baseHeight + floor*floorHeight，已含 baseHeight）。
      // 这里绝不能再加 baseHeight，否则世界坐标会多算一次（双击 baseHeight 的回归 bug）。
      base,
      top,
      kind,
    });
  }

  addBoxCollider(lx, lz, hx, hz, top, { base = 0, rot = 0, kind = SOLID } = {}) {
    return this.addCollider({
      shape: 'box',
      lx,
      lz,
      hx,
      hz,
      base,
      top,
      rot,
      kind,
    });
  }

  /** 登记内部 POI */
  addPOI(localPos, label, onInteract, options = {}) {
    const id = options.id;
    if (!id) throw new Error(`InternalSpace.addPOI: 空间 ${this.id} 的 POI「${label}」缺少 id`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`InternalSpace.addPOI: POI id「${id}」不符合 kebab-case`);
    }
    if (this.pois.some((p) => p.id === id)) throw new Error(`InternalSpace.addPOI: 空间 ${this.id} 的 POI id ${id} 重复`);

    const ly = localPos.y ?? this.sampleHeightInternal(localPos.x, localPos.z);
    const zoneCenter = { x: 0, y: 0, z: 0 }; // 仅用于高度计算
    const worldBase = this.getWorldBaseHeight(zoneCenter);

    const poi = {
      id,
      localPosition: new THREE.Vector3(localPos.x, ly, localPos.z),
      worldPosition: new THREE.Vector3(
        this.localCenter.x + localPos.x,
        worldBase + ly,
        this.localCenter.z + localPos.z
      ),
      label,
      onInteract,
      type: options.type ?? 'lore',
      spaceId: this.id,
    };
    this.pois.push(poi);

    const marker = this.createPOIMarker(localPos.x, ly, localPos.z, options.color ?? 0xc9a962);
    marker.userData.poiId = poi.id;
    this.group.add(marker);
    this.poiMarkers.push({ marker, poi });

    return poi;
  }

  createPOIMarker(x, y, z, color) {
    const group = new THREE.Group();

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.2, 3, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
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

    const zoneCenter = { x: 0, y: 0, z: 0 };
    const worldBase = this.getWorldBaseHeight(zoneCenter);
    group.position.set(x, worldBase + y, z);
    return group;
  }

  /** 供子类实现：构建内部几何、碰撞、装饰 */
  build(zoneCenter) {
    if (this._built) return;
    this._built = true;
    this._doBuild(zoneCenter);
  }

  _doBuild(_zoneCenter) {
    // 子类实现
  }

  getPOIs() {
    return this.pois;
  }

  getColliders() {
    return this.colliders.map((c) => ({
      ...c,
      // 运行时需要世界坐标碰撞体，这里只保存本地定义
      // WorldManager 会在构建时展开
      _spaceId: this.id,
      _zoneId: this.zoneId,
      _localCenter: this.localCenter,
      _baseHeight: this.baseHeight,
      _floor: this.floor,
      _floorHeight: this.floorHeight,
    }));
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
}

/** 内部空间管理器：按区域收集、查询当前所在内部空间 */
export class InternalSpaceManager {
  constructor() {
    /** @type {Map<string, InternalSpace[]>} zoneId -> spaces[] */
    this.spacesByZone = new Map();
    this.currentSpace = null;
    /**
     * 「按区 id 现问区域中心」的问手，由宿主世界挂上（`attachZoneCenterResolver`）。
     * 挂的是**问手**不是坐标：抄一份 `center` 就是第二份真相，搬区时它会烂在原地
     * （B120 那一族的同一个形状）。
     */
    this._zoneCenterOf = null;
  }

  /**
   * 挂上"按区 id 现问区域中心"的问手（W-B9 切片9，修 B121）。
   *
   * 为什么室内查询需要它：一座空间的归属**不能**先由区半径把点收敛成一个区、再去那个区名下找空间。
   * 区半径是 135~165 米的大气圆，彼此大面积重叠（实测 space × gloom 的连心线重叠带宽 **291.7 米**），
   * 而空间自己的半径是 8~25 米 —— 收敛这一步会把整座空间判给邻区。实测四座里有那座
   * `gloom-ancient-shrine`（登记在 gloom 名下，世界心 `(200, 70)`）：**它 100 % 的足迹**
   * 按"最近区"判给 space（离 space 心 10.0 米、离 gloom 心 36.1 米），而 space 名下零座室内
   * ⇒ 那座神殿的地板永远不回答，玩家在那里吃到全局地形（探针 `.tmp-20261018-b121/probe-overlap.mjs`）。
   * 所以这一条问的是「这个点落不落进某座空间自己的范围」，用**登记它的那个区**的中心换算，
   * 与大气归属（`zoneIdAt`，仍按最近区）是两件事、两个口径 —— 见 §「口径」注释。
   */
  attachZoneCenterResolver(resolve) {
    this._zoneCenterOf = resolve;
    return this;
  }

  /**
   * 这座空间登记在谁名下，就现问谁的中心。
   *
   * 问不到（区 id 写错 / 世界上没有这个区）**当场抛**，不静默跳过：静默跳过的症状就是 B121 本身 ——
   * 一座永远不回答的室内空间，既不崩也不降级。
   */
  _zoneCenterFor(zoneId) {
    if (!this._zoneCenterOf) {
      throw new Error('InternalSpaceManager: 按世界点问室内归属之前，必须先 attachZoneCenterResolver(...) —— '
        + '没有问手就只能按调用方递进来的区中心问，而那条路会把归属交给调用方（B121）');
    }
    const center = this._zoneCenterOf(zoneId);
    if (!center) {
      throw new Error(`InternalSpaceManager: 内部空间登记在 "${zoneId}" 名下，但世界上问不到这个区的中心 —— `
        + '要么改模板的 zoneId，要么把这个区建出来（静默跳过得到的是 B121：一座永远不回答的室内空间）');
    }
    return center;
  }

  /** 注册一个内部空间到所属区域 */
  register(space) {
    const arr = this.spacesByZone.get(space.zoneId) ?? [];
    arr.push(space);
    this.spacesByZone.set(space.zoneId, arr);
  }

  /** 构建某区域的所有内部空间 */
  buildZone(zoneId, zoneCenter) {
    for (const space of this.spacesByZone.get(zoneId) ?? []) {
      space.build(zoneCenter);
    }
  }

  /**
   * 这个**世界点**落在哪座室内空间里 —— 判据是空间自己的水平范围，不是大气归属。
   * 命中返回 `{ space, zoneId, zoneCenter }`，否则 null。
   *
   * 这是室内归属唯一的一条路（W-B9 切片9 删掉了 `querySpaceAt(x, z, zoneId, zoneCenter)`：
   * 只要还存在"由调用方指定区"的入口，"先把点收敛成一个区、再去那个区名下找空间"就走得回去）。
   *
   * 为什么必须有这一条而不是"先 `zoneIdAt` 收敛成一个区、再去那个区名下找"：那是 B121 的形状
   * （`attachZoneCenterResolver` 的注里有实测读数 —— `gloom-ancient-shrine` 整片足迹被判给 space）。
   *
   * 遍历顺序 = 登记表顺序，命中即返回。四座空间的足迹实测两两分离（最小心距 72.1 对半径和 35），
   * 所以"取第一个命中"今天无歧义；那条下限由门禁钉着（`tests/zone-internal-ownership.test.js` 的结构腿）。
   * 以后若有两座空间互相压住，这里必须改成显式判定，不许靠遍历顺序决定玩家踩在哪层地板上。
   */
  spaceAtWorldPoint(worldX, worldZ) {
    for (const [zoneId, spaces] of this.spacesByZone) {
      const zoneCenter = this._zoneCenterFor(zoneId);
      for (const space of spaces) {
        if (space.containsWorldPoint(worldX, worldZ, zoneCenter)) return { space, zoneId, zoneCenter };
      }
    }
    return null;
  }

  /** 更新当前空间（由 WorldManager 每帧调用）—— 与地面高度问的是同一条判据（B121） */
  updateCurrent(worldX, worldZ) {
    this.currentSpace = this.spaceAtWorldPoint(worldX, worldZ)?.space ?? null;
    return this.currentSpace;
  }

  /**
   * 这个**世界点**上室内那一档地面要往全局高度场里掺多少：`{ space, weight, height }`，
   * 所有过渡带都够不着时返回 null（那点纯粹是室外地）。
   *
   * 这是"室内地面"进场的唯一一条路（W-B9 切片E，修 B126）。此前它走的是
   * `WorldManager.getGroundHeight` 里那道"占地内就整体交回地板"的分支 —— 于是同一张世界上
   * 并着两层地面：可见的场（`WorldTerrain` 那张网格按 `sampleGlobalHeight` 采样）不认室内，
   * 脚下的场认。占地边界那一刀实测 21~23 米（见 `InternalSpace.groundWeightAt` 的注），
   * 玩家跨过去就是"脚踩在二十米高的看台上、眼睛看着平地"，也就是走路穿模里与摆件无关的那一半。
   *
   * 三条口径写在这里，因为它们各是各的坑：
   * - **归属与地面是两件事**：雾、层号、`currentSpace` 仍按**占地**认领（`spaceAtWorldPoint`），
   *   过渡带是室外 —— 带里那点会往室内那一档俯身，但玩家没进屋。
   * - **区中心向问手现问**（`_zoneCenterFor`）：抄一份坐标就是第二份真相，搬区时它会烂在原地（B120）。
   * - **`zoneCenter.y` 必须有限**：这里缺 y 得到的不是"差一点"而是 NaN，而 NaN 现在会顺着高度场
   *   流进整张可见网格（B120 那条硬拒绝同一条）。
   *
   * 两座空间的过渡带压住同一点时取权重最大的那座，不按登记表顺序 —— 今天四带两两分离
   * （`tests/interior-ground-field.test.js` 的结构腿钉着），这条择优是给将来的口径，不是给今天的运气。
   */
  groundBlendAt(worldX, worldZ) {
    let best = null;
    for (const [zoneId, spaces] of this.spacesByZone) {
      const zoneCenter = this._zoneCenterFor(zoneId);
      for (const space of spaces) {
        const weight = space.groundWeightAt(worldX, worldZ, zoneCenter);
        if (weight <= 0) continue;
        if (best && best.weight >= weight) continue;
        best = { space, zoneId, weight };
      }
    }
    if (!best) return null;
    const { height, zoneCenter } = this._floorHeightAt(best.space, best.zoneId, worldX, worldZ);
    return { ...best, zoneCenter, height };
  }

  /**
   * 这座空间在那个世界点的地板高度 —— "区中心向问手现问 + 缺 y 硬拒绝 + 那一层加法"只写这一遍，
   * 占地内（`getInternalHeightAtWorldPoint`）与过渡带（`groundBlendAt`）两条问法共用它。
   * 分成两处写就是 B100/B120 那族的老形状：一处补了 y、另一处还在把 NaN 交给玩家。
   */
  _floorHeightAt(space, zoneId, worldX, worldZ) {
    const zoneCenter = this._zoneCenterFor(zoneId);
    this._requireFiniteZoneBase(zoneCenter, zoneId);
    return { zoneCenter, height: space.getInternalHeightAt(worldX, worldZ, zoneCenter) };
  }

  /**
   * 某个**世界点**的室内地面高度；这个点不在任何室内空间里则返回 null。
   *
   * 问的是**占地内**那一档（`spaceAtWorldPoint` 的口径），一次掺混都不做 ——
   * 地面进场走的是 `groundBlendAt`（占地外那条过渡带归它），归属与雾仍走 `spaceAtWorldPoint`。
   *
   * 这里是那条高度加法唯一的写法，三代契约都写在里面，因为它们各是各的坑：
   *
   * - **B100**：最早这里硬编码 `{ x: 0, y: 0, z: 0 }`，于是 `zoneCenter.y` 整个丢了、
   *   `worldToLocal` 也少减一次区域中心 —— 实测四座模板里两座的高度函数是非平凡的
   *   （幽暗神殿"中心凹陷 2 米"、晨曦大厅"中央隆起"），中心点差 **10~12.5 米**。
   *   区域中心必须由**登记它的那个区**现问（`_zoneCenterFor`），不由调用方递。
   * - **B120**：调用方递进来的那个对象**根本没有 `y`**。生产的区域中心曾经是 `{x, z}`，
   *   于是 `zoneCenter.y + baseHeight + floor*floorHeight` 恒为 `NaN` —— 上一代的修法
   *   把一个"差 10 米"修成了"差一个世界"。现在 `BaseZone` 把 `y` 声明成区域自己的竖直基准，
   *   这里再把"必须有限"钉成硬拒绝（`_requireFiniteZoneBase`）：宁可炸给开发者看，
   *   不许把 NaN 交给玩家的下坠。
   * - **B121**：问手曾经是"这个点属于哪个区"（`zoneIdAt` 那步收敛），重叠的区半径会把
   *   整座空间判给邻区 ⇒ 永远不回答。现在只按**空间自己的范围**认领这个点。
   *
   * 问的是**这个点**，不是缓存的 `currentSpace`：后者只按玩家的上一帧位置刷新，而这条路径
   * 会被用来问几百米外的点（快速旅行的目的地、副本出口、敌人、装饰、天气粒子）。
   * 按缓存回答的结果是"玩家刚站过晨曦大厅，于是整个区的地板都是大厅那一块"。
   */
  getInternalHeightAtWorldPoint(worldX, worldZ) {
    const hit = this.spaceAtWorldPoint(worldX, worldZ);
    if (!hit) return null;
    return this._floorHeightAt(hit.space, hit.zoneId, worldX, worldZ).height;
  }

  /**
   * 「区域中心必须带有限的 `y`」只写这一遍（B100 的"少传"与 B120 的"传进来是残缺对象"共用一条硬拒绝）。
   */
  _requireFiniteZoneBase(zoneCenter, zoneId) {
    if (!zoneCenter || !Number.isFinite(zoneCenter.y)) {
      throw new Error(
        `InternalSpaceManager.getInternalHeight（${zoneId ?? '未指名的区'}）: zoneCenter 必须带有限的 y —— `
        + '室内高度 = zoneCenter.y + baseHeight + floor * floorHeight，缺 y 得到的不是"差一点"而是 NaN（B120）'
      );
    }
  }

  /** 获取当前空间的所有碰撞体（已转世界坐标） */
  getCurrentCollidersWorld(zoneCenter) {
    if (!this.currentSpace) return [];
    return this.currentSpace.colliders.map((c) => this._expandCollider(c, zoneCenter));
  }

  _expandCollider(c, zoneCenter) {
    const wc = this.currentSpace.getWorldCenter(zoneCenter);
    const worldBase = this.currentSpace.getWorldBaseHeight(zoneCenter);
    if (c.shape === 'cyl') {
      return {
        shape: 'cyl',
        x: wc.x + c.lx,
        z: wc.z + c.lz,
        r: c.r,
        base: worldBase + c.base,
        top: worldBase + c.top,
        kind: c.kind,
      };
    }
    if (c.shape === 'box') {
      return {
        shape: 'box',
        x: wc.x + c.lx,
        z: wc.z + c.lz,
        hx: c.hx,
        hz: c.hz,
        base: worldBase + c.base,
        top: worldBase + c.top,
        rot: c.rot,
        kind: c.kind,
      };
    }
    return c;
  }

  /** 获取当前空间的 POI 列表（世界坐标） */
  getCurrentPOIs() {
    return this.currentSpace?.pois ?? [];
  }

  /** 获取当前空间的雾效配置 */
  getCurrentFog() {
    if (!this.currentSpace) return null;
    return {
      color: this.currentSpace.fogColor,
      density: this.currentSpace.fogDensity,
    };
  }

  /** 当前楼层 */
  getCurrentFloor() {
    return this.currentSpace?.floor ?? 0;
  }

  /** 兼容 WorldManager.update 调用 */
  update(dt) {
    // 内部空间自身的动画更新（如 POI 标记浮动）
    for (const spaces of this.spacesByZone.values()) {
      for (const space of spaces) {
        space.update(dt);
      }
    }
  }
}

/**
 * 预置内部空间模板（可被区域类实例化）
 *
 * `rimBand` 是**地面过渡带**宽（`groundWeightAt` 的那一段），不是美术尺寸。四座的数由
 * `tests/interior-ground-field.test.js` 从"占地里室内地板与占地外室外场的实测最狠落差"反推的
 * 那条尺兜住（带宽 ≥ Δ × 1.5 ÷ 斜率上限，两个数都取自生产：`colliderRadius × 0.5` 的取样步长、
 * `stepUp` 的每步上限）—— 这里手打的数只是"够宽"的一份声明，改窄了会被那条尺当场点名。
 * 幽暗神殿与星港瞭望塔那两座落差 20 米级，带就跟着宽到 22 / 24 米；晨曦大厅落差 4.65 米，5 米带够。
 */
export const InternalSpaceTemplates = {
  /** 幽暗林地：古老祭坛（地下室） */
  gloomAncientShrine: (zoneCenter) => new InternalSpace({
    id: 'gloom-ancient-shrine',
    zoneId: 'gloom',
    localCenter: { x: 20, z: -30 },
    radius: 12,
    rimBand: 22,
    floor: -1,
    baseHeight: -3,
    floorHeight: 5,
    fogColor: 0x1a1a2a,
    fogDensity: 0.015,
    sampleHeightInternal: (lx, lz) => {
      const d = Math.sqrt(lx * lx + lz * lz);
      return -Math.max(0, 2 - d * 0.3); // 中心凹陷
    },
  }),

  /** 幽暗林地：树洞住所（树上二层） */
  gloomTreeHollow: (zoneCenter) => new InternalSpace({
    id: 'gloom-tree-hollow',
    zoneId: 'gloom',
    localCenter: { x: -40, z: 50 },
    radius: 8,
    rimBand: 8,
    floor: 1,
    baseHeight: 8,
    floorHeight: 3.5,
    fogColor: 0x2a2a3a,
    fogDensity: 0.01,
    sampleHeightInternal: () => 0,
  }),

  /** 辉煌圣域：晨曦大厅（主殿一层） */
  radiantGrandHall: (zoneCenter) => new InternalSpace({
    id: 'radiant-grand-hall',
    zoneId: 'radiant',
    localCenter: { x: 0, z: 0 },
    radius: 25,
    rimBand: 6,
    floor: 0,
    baseHeight: 1,
    floorHeight: 8,
    fogColor: 0xfff8e0,
    fogDensity: 0.005,
    sampleHeightInternal: (lx, lz) => {
      const d = Math.sqrt(lx * lx + lz * lz) / 25;
      return Math.max(0, (1 - d) * 0.5); // 中央微隆起
    },
  }),

  /** 辉煌圣域：星港瞭望塔（高塔） */
  radiantStarwatchTower: (zoneCenter) => new InternalSpace({
    id: 'radiant-starwatch-tower',
    zoneId: 'radiant',
    localCenter: { x: -60, z: 40 },
    radius: 10,
    rimBand: 24,
    floor: 2,
    baseHeight: 12,
    floorHeight: 6,
    fogColor: 0xffe0aa,
    fogDensity: 0.003,
    sampleHeightInternal: () => 0,
  }),
};