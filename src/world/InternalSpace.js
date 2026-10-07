import * as THREE from 'three';

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
 * - WorldManager 按区域收集内部空间，玩家进入/离开时切换高度查询与碰撞检测。
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
    this.fogColor = config.fogColor ?? 0x888888;
    this.fogDensity = config.fogDensity ?? 0.01;
    this.group = new THREE.Group();
    this.colliders = [];
    this.pois = [];
    this.poiMarkers = [];
    this.decorations = [];
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

  addCylinderCollider(lx, lz, r, top, { base = 0, kind = 'solid' } = {}) {
    return this.addCollider({
      shape: 'cyl',
      lx,
      lz,
      r,
      base: this.baseHeight + base,
      top: this.baseHeight + top,
      kind,
    });
  }

  addBoxCollider(lx, lz, hx, hz, top, { base = 0, rot = 0, kind = 'solid' } = {}) {
    return this.addCollider({
      shape: 'box',
      lx,
      lz,
      hx,
      hz,
      base: this.baseHeight + base,
      top: this.baseHeight + top,
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
    const t = performance.now() * 0.002;
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

  /** 根据世界坐标查询玩家当前所在的内部空间 */
  querySpaceAt(worldX, worldZ, zoneId, zoneCenter) {
    const spaces = this.spacesByZone.get(zoneId) ?? [];
    for (const space of spaces) {
      if (space.containsWorldPoint(worldX, worldZ, zoneCenter)) {
        return space;
      }
    }
    return null;
  }

  /** 更新当前空间（由 WorldManager 每帧调用） */
  updateCurrent(worldX, worldZ, zoneId, zoneCenter) {
    this.currentSpace = this.querySpaceAt(worldX, worldZ, zoneId, zoneCenter);
    return this.currentSpace;
  }

  /**
   * 获取当前空间的高度（若不在任何内部空间则返回 null）。
   *
   * `zoneCenter` 是**必填**，不是可选装饰：高度 = 区域中心.y + 本层基准 + 局部采样(局部坐标)，
   * 而局部坐标要由 `worldToLocal` 减掉区域中心才算得出来。改前这里硬编码 `{ x: 0, y: 0, z: 0 }`
   * （B100），于是 `zoneCenter.y` 整个丢了、`x/z` 也少减一次 —— 实测四座模板里两座的高度函数
   * 是非平凡的（幽暗神殿"中心凹陷 2 米"、晨曦大厅"中央隆起"），中心点差 **10~12.5 米**。
   * 玩家侧的说法是"走进室内，地面高度整个不对"。
   *
   * 少了参数就抛（B71 口径：调用方递错了不要静默兜底，兜底会把"递错了"变成"高度悄悄是别的值"）。
   */
  getCurrentInternalHeight(worldX, worldZ, zoneCenter) {
    if (!this.currentSpace) return null;
    if (!zoneCenter) {
      throw new Error(
        'InternalSpaceManager.getCurrentInternalHeight: 必须给 zoneCenter —— '
        + '室内高度由"区域中心 + 本层基准 + 局部采样"算出来，缺了它算不出局部坐标（B100）'
      );
    }
    return this.currentSpace.getInternalHeightAt(worldX, worldZ, zoneCenter);
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

/** 预置内部空间模板（可被区域类实例化） */
export const InternalSpaceTemplates = {
  /** 幽暗林地：古老祭坛（地下室） */
  gloomAncientShrine: (zoneCenter) => new InternalSpace({
    id: 'gloom-ancient-shrine',
    zoneId: 'gloom',
    localCenter: { x: 20, z: -30 },
    radius: 12,
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
    floor: 2,
    baseHeight: 12,
    floorHeight: 6,
    fogColor: 0xffe0aa,
    fogDensity: 0.003,
    sampleHeightInternal: () => 0,
  }),
};