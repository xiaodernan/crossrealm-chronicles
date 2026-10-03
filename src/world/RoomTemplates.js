import * as THREE from 'three';

/**
 * 房间模板库 —— 「这一类房间长什么样、门怎么开、里面摆什么」只有一份答案（W-B10 切片4，修 B75/B76）。
 *
 * 为什么要有这个：
 * - 以前每个房间都是标准矩形（18×18），墙要么全有要么全开门，内部只有一盏灯。
 * - 现在每个模板自带：平面形状、门位置、内部装饰、碰撞体、灯光、LORE 点位。
 * - 连接规则显式声明：哪个模板能接哪个模板、哪个方向、需要几格门洞。
 * - 生成器按模板组装，而不再是"先刷网格再套模板"——模板决定形状，网格只是锚点。
 *
 * 模板签名由这些字段组成（做材质/几何共享的键）：
 *  - id、variant、wallTheme（墙面材质主题）、floorTheme（地面材质主题）
 *  这保证同一副本内同一模板只 build 一次几何/材质。
 */

const CELL = 18;

/** 方向常量 */
export const DIR = { n: 'n', e: 'e', s: 's', w: 'w' };
const OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };

/** 模板注册表 */
export const ROOM_TEMPLATES = {};

/**
 * 注册一个房间模板。
 * @param {object} tpl
 * @param {string} tpl.id - kebab-case 唯一 id（如 'hall-straight'）
 * @param {string} tpl.variant - 变体名（同 id 下可有多种，如 'hall-straight:wide'）
 * @param {number} tpl.width - 房间宽度（单位：米，需是 CELL 的倍数）
 * @param {number} tpl.depth - 房间深度
 * @param {object} tpl.ports - 门端口 { dir: { required: bool, width: number } }
 *   required=false 表示该向可选开门，true 表示必须有邻居才生成
 * @param {Function} tpl.buildGeometry - (group, room, layout, def, mats) => void
 *   挂载到房间组的构建函数，负责地面、墙、装饰、碰撞、灯光、LORE
 * @param {string[]} [tpl.tags=[]] - 标签（如 'hall' 'chamber' 'arena' 'lore' 'treasure'）
 * @param {string} [tpl.wallTheme='stone'] - 墙面材质主题键
 * @param {string} [tpl.floorTheme='stone'] - 地面材质主题键
 */
export function registerRoomTemplate(tpl) {
  const key = `${tpl.id}:${tpl.variant ?? 'base'}`;
  if (ROOM_TEMPLATES[key]) {
    throw new Error(`Room template ${key} already registered`);
  }
  // 标准化端口
  const ports = {};
  for (const dir of ['n', 'e', 's', 'w']) {
    const p = tpl.ports?.[dir];
    ports[dir] = p ? {
      required: p.required ?? false,
      width: p.width ?? 4,
      offset: p.offset ?? 0, // 相对房间中心的偏移（米）
    } : null;
  }
  ROOM_TEMPLATES[key] = {
    ...tpl,
    key,
    ports,
    width: tpl.width,
    depth: tpl.depth,
    buildGeometry: tpl.buildGeometry,
    tags: tpl.tags ?? [],
    wallTheme: tpl.walkTheme ?? 'stone',
    floorTheme: tpl.floorTheme ?? 'stone',
  };
  return key;
}

/** 取模板（带变体回退） */
export function getRoomTemplate(id, variant) {
  const key = `${id}:${variant ?? 'base'}`;
  return ROOM_TEMPLATES[key] ?? null;
}

/** 列出某标签下的所有模板 */
export function listTemplatesByTag(tag) {
  return Object.values(ROOM_TEMPLATES).filter((t) => t.tags.includes(tag));
}

/** 连接规则：给定模板 A 在 dir 方向，能接哪些模板 */
export function canConnect(templateA, dir, templateB) {
  const portA = templateA.ports[dir];
  const portB = templateB.ports[OPPOSITE[dir]];
  if (!portA || !portB) return false;
  // 门宽兼容：取较小者
  return Math.min(portA.width, portB.width) >= 2;
}

/**
 * 根据模板与端口生成门洞几何（供 buildGeometry 调用）。
 * @param {object} params
 * @param {THREE.Group} group
 * @param {object} mat - 墙面材质
 * @param {number} x - 房间中心 x
 * @param {number} z - 房间中心 z
 * @param {number} wallLen - 该向墙总长
 * @param {number} thickness - 墙厚
 * @param {number} height - 墙高
 * @param {number} gap - 门洞宽
 * @param {number} offset - 门洞中心相对墙中心的偏移
 * @param {boolean} alongZ - true=南北墙(沿Z轴), false=东西墙(沿X轴)
 */
export function buildDoorGap(params) {
  const { group, mat, x, z, wallLen, thickness, height, gap, offset, alongZ } = params;
  const seg = (wallLen - gap) / 2;
  const leftLen = seg + offset;
  const rightLen = seg - offset;
  if (alongZ) {
    // 南北墙：沿 X 轴
    if (leftLen > 0.1) addSeg(x - wallLen / 2 + leftLen / 2, z, thickness, leftLen);
    if (rightLen > 0.1) addSeg(x + wallLen / 2 - rightLen / 2, z, thickness, rightLen);
  } else {
    // 东西墙：沿 Z 轴
    if (leftLen > 0.1) addSeg(x, z - wallLen / 2 + leftLen / 2, rightLen, thickness);
    if (rightLen > 0.1) addSeg(x, z + wallLen / 2 - rightLen / 2, rightLen, thickness);
  }

  function addSeg(px, pz, w, d) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, height, d),
      mat
    );
    m.position.set(px, height / 2, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    // 碰撞体由调用方统一 push
  }
}

/** 预置模板注册（由各副本主题自行 import 注册，这里只放通用基础模板） */
export function registerBaseTemplates() {
  // 直走廊
  registerRoomTemplate({
    id: 'hall',
    variant: 'straight',
    width: CELL,
    depth: CELL,
    tags: ['hall', 'connector'],
    ports: {
      n: { required: true, width: 4 },
      s: { required: true, width: 4 },
      e: { required: false, width: 4 },
      w: { required: false, width: 4 },
    },
    buildGeometry: buildHallStraight,
  });

  // 宽走廊（可做大厅前厅）
  registerRoomTemplate({
    id: 'hall',
    variant: 'wide',
    width: CELL * 2,
    depth: CELL,
    tags: ['hall', 'connector', 'wide'],
    ports: {
      n: { required: true, width: 6 },
      s: { required: true, width: 6 },
      e: { required: false, width: 4 },
      w: { required: false, width: 4 },
    },
    buildGeometry: buildHallWide,
  });

  // 标准方厅
  registerRoomTemplate({
    id: 'chamber',
    variant: 'square',
    width: CELL,
    depth: CELL,
    tags: ['chamber', 'combat'],
    ports: {
      n: { required: false, width: 4 },
      s: { required: false, width: 4 },
      e: { required: false, width: 4 },
      w: { required: false, width: 4 },
    },
    buildGeometry: buildChamberSquare,
  });

  // 长方厅（横向）
  registerRoomTemplate({
    id: 'chamber',
    variant: 'horizontal',
    width: CELL * 2,
    depth: CELL,
    tags: ['chamber', 'combat', 'horizontal'],
    ports: {
      n: { required: false, width: 4 },
      s: { required: false, width: 4 },
      e: { required: true, width: 4 },
      w: { required: true, width: 4 },
    },
    buildGeometry: buildChamberHorizontal,
  });

  // 十字路口
  registerRoomTemplate({
    id: 'junction',
    variant: 'cross',
    width: CELL,
    depth: CELL,
    tags: ['junction', 'connector'],
    ports: {
      n: { required: true, width: 4 },
      s: { required: true, width: 4 },
      e: { required: true, width: 4 },
      w: { required: true, width: 4 },
    },
    buildGeometry: buildJunctionCross,
  });

  // T 型路口
  registerRoomTemplate({
    id: 'junction',
    variant: 'tee',
    width: CELL,
    depth: CELL,
    tags: ['junction', 'connector'],
    ports: {
      n: { required: true, width: 4 },
      s: { required: true, width: 4 },
      e: { required: true, width: 4 },
      w: { required: false, width: 4 },
    },
    buildGeometry: buildJunctionTee,
  });

  // 圆形竞技场
  registerRoomTemplate({
    id: 'arena',
    variant: 'round',
    width: CELL * 2,
    depth: CELL * 2,
    tags: ['arena', 'boss'],
    ports: {
      n: { required: false, width: 5 },
      s: { required: true, width: 5 },
      e: { required: false, width: 4 },
      w: { required: false, width: 4 },
    },
    buildGeometry: buildArenaRound,
  });

  // 宝藏房（小、只有一个门）
  registerRoomTemplate({
    id: 'treasure',
    variant: 'small',
    width: CELL,
    depth: CELL,
    tags: ['treasure', 'lore'],
    ports: {
      n: { required: false, width: 3 },
      s: { required: true, width: 3 },
      e: { required: false, width: 3 },
      w: { required: false, width: 3 },
    },
    buildGeometry: buildTreasureSmall,
  });

  // LORE 房（中型、两门对开）
  registerRoomTemplate({
    id: 'lore',
    variant: 'double-door',
    width: CELL,
    depth: CELL,
    tags: ['lore', 'chamber'],
    ports: {
      n: { required: true, width: 4 },
      s: { required: true, width: 4 },
      e: { required: false, width: 4 },
      w: { required: false, width: 4 },
    },
    buildGeometry: buildLoreDoubleDoor,
  });
}

/* ===== 模板构建函数实现 ===== */

function buildHallStraight(group, room, layout, def, mats) {
  const { floorMat, wallMat, accentMat, doorClosedMat, doorOpenMat } = mats;
  const CS = room.width;
  const CSd = room.depth;

  // 地面
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(CS - 0.4, CSd - 0.4),
    room.floorMat ?? mats.floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.x, 0.02, room.z);
  floor.receiveShadow = true;
  room.group.add(floor);

  // 灯光
  const torch = new THREE.PointLight(room.accent ?? 0xc9a962, 0.3, 12);
  torch.position.set(room.x, 3, room.z);
  room.group.add(torch);

  // 四面墙
  buildStandardWalls(room, layout, mats);
}

function buildHallWide(group, room, layout, def, mats) {
  const { floorMat, wallMat, accentMat } = mats;
  const CS = room.width;
  const CSd = room.depth;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width - 0.4, room.depth - 0.4),
    room.floorMat ?? mats.floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.x, 0.02, room.z);
  floor.receiveShadow = true;
  room.group.add(floor);

  // 两盏灯
  const torch1 = new THREE.PointLight(room.accent ?? 0xc9a962, 0.3, 14);
  torch1.position.set(room.x - CELL / 4, 3.5, room.z);
  room.group.add(torch1);
  const torch2 = new THREE.PointLight(room.accent ?? 0xc9a962, 0.3, 14);
  torch2.position.set(room.x + CELL / 4, 3.5, room.z);
  room.group.add(torch2);

  buildStandardWalls(room, layout, mats);
}

function buildChamberSquare(group, room, layout, def, mats) {
  buildStandardRoom(room, layout, mats, { pillars: 4, torches: 1 });
}

function buildChamberHorizontal(group, room, layout, def, mats) {
  buildStandardRoom(room, layout, mats, { pillars: 6, torches: 2, torchOffset: CELL / 3 });
}

function buildJunctionCross(group, room, layout, def, mats) {
  // 十字路口：四面开门，中心有装饰柱
  buildStandardRoom(room, layout, mats, { 
    centerPillar: true, 
    torches: 4, 
    torchOffset: CELL / 4,
    centerDecor: true 
  });
}

function buildJunctionTee(group, room, layout, def, mats) {
  buildStandardRoom(room, layout, mats, { 
    centerPillar: true, 
    torches: 3,
    centerDecor: true 
  });
}

function buildArenaRound(group, room, layout, def, mats) {
  const WH = room.wallHeight ?? 5;
  const WT = 0.6;
  const r = Math.min(room.width, room.depth) * 0.4;

  // 圆形地面
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.2, 32),
    room.floorMat ?? mats.floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.x, 0.02, room.z);
  floor.receiveShadow = true;
  room.group.add(floor);

  // 环形灯带
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r - 1.5, r - 0.5, 48),
    room.accentMat ?? mats.accentMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(room.x, 0.05, room.z);
  room.group.add(ring);

  // 周围柱子
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = room.x + Math.cos(a) * r * 0.85;
    const pz = room.z + Math.sin(a) * r * 0.85;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.8, WH + 1, 8),
      room.wallMat ?? mats.wallMat
    );
    pillar.position.set(px, (WH + 1) / 2, pz);
    pillar.castShadow = true;
    room.group.add(pillar);
  }

  // 强光
  const light = new THREE.PointLight(room.accent ?? 0xc9a962, 1.2, 40);
  light.position.set(room.x, 8, room.z);
  room.group.add(light);

  // 围墙（圆形近似用 16 边）
  const wallSides = 16;
  for (let i = 0; i < wallSides; i++) {
    const a = (i / wallSides) * Math.PI * 2;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    const wx = room.x + nx * r;
    const wz = room.z + nz * r;
    const segLen = 2 * Math.PI * r / wallSides;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(segLen * 1.1, 5, 0.8),
      room.wallMat ?? mats.wallMat
    );
    m.position.set(wx, 2.5, wz);
    m.rotation.y = a + Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    room.group.add(m);
  }
}

function buildTreasureSmall(group, room, layout, def, mats) {
  // 小宝箱房：地面、一面墙开门、中间宝箱基座
  buildStandardRoom(room, layout, mats, { 
    torches: 1, 
    centerDecor: true,
    decorType: 'treasure' 
  });
}

function buildLoreDoubleDoor(group, room, layout, def, mats) {
  buildStandardRoom(room, layout, mats, { 
    torches: 2, 
    torchOffset: CELL / 3,
    centerDecor: true,
    decorType: 'lore' 
  });
}

/** 通用标准房间构建 */
function buildStandardRoom(room, layout, mats, options = {}) {
  const { floorMat, wallMat, accentMat } = mats;
  const WH = room.wallHeight ?? 5;
  const WT = 0.6;
  const CS = room.width;
  const CSd = room.depth;

  // 地面
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width - 0.4, room.depth - 0.4),
    room.floorMat ?? floorMat
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.x, 0.02, room.z);
  floor.receiveShadow = true;
  room.group.add(floor);

  // 灯光
  if (options.torches) {
    const count = options.torches;
    const offset = options.torchOffset ?? CELL / 4;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const torch = new THREE.PointLight(
        room.accent ?? 0xc9a962, 
        0.35, 
        14
      );
      torch.position.set(
        room.x + Math.cos(angle) * offset,
        3,
        room.z + Math.sin(angle) * offset
      );
      room.group.add(torch);
    }
  }

  // 中心装饰
  if (options.centerDecor) {
    if (options.centerPillar) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 5, 8),
        room.wallMat ?? mats.wallMat
      );
      pillar.position.set(room.x, 2.5, room.z);
      pillar.castShadow = true;
      room.group.add(pillar);
    }
    if (options.decorType === 'treasure') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 1.0, 0.6, 8),
        room.accentMat ?? mats.accentMat
      );
      base.position.set(room.x, 0.3, room.z);
      room.group.add(base);
      const chest = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.8, 0.8),
        room.accentMat ?? mats.accentMat
      );
      chest.position.set(room.x, 1.2, room.z);
      room.group.add(chest);
    }
    if (options.decorType === 'lore') {
      const shard = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.6, 0.3),
        room.accentMat ?? mats.accentMat
      );
      shard.position.set(room.x, 0.8, room.z);
      room.group.add(shard);
    }
  }

  // 墙
  buildStandardWalls(room, layout, mats);
}

/** 标准四面墙 + 门洞 */
function buildStandardWalls(room, layout, mats) {
  const { wallMat, doorClosedMat, doorOpenMat } = mats;
  const WH = room.wallHeight ?? 5;
  const WT = 0.6;
  const CS = room.width;
  const CSd = room.depth;
  const doorW = room.doorWidth ?? 4;

  const walls = room.walls ?? { n: true, e: true, s: true, w: true };

  // 北墙
  if (walls.n) {
    if (room.ports?.n) {
      const gap = room.ports.n.width ?? 4;
      addWallWithDoor(room.group, mats.wallMat ?? mats.wallMat, room.x, room.z - room.depth / 2, room.width, WT, WH, gap, 0, true, layout);
    } else {
      addWallSegment(room.group, mats.wallMat ?? mats.wallMat, room.x, room.z - room.depth / 2, room.width, WT, WH, layout);
    }
  }
  // 南墙
  if (walls.s) {
    if (room.ports?.s) {
      const gap = room.ports.s.width ?? 4;
      addWallWithDoor(room.group, mats.wallMat ?? mats.wallMat, room.x, room.z + room.depth / 2, room.width, WT, WH, gap, 0, true, layout);
    } else {
      addWallSegment(room.group, mats.wallMat ?? mats.wallMat, room.x, room.z + room.depth / 2, room.width, WT, WH, layout);
    }
  }
  // 西墙
  if (walls.w) {
    if (room.ports?.w) {
      const gap = room.ports.w.width ?? 4;
      addWallWithDoor(room.group, mats.wallMat ?? mats.wallMat, room.x - room.width / 2, room.z, WT, room.depth, WH, gap, 0, false, layout);
    } else {
      addWallSegment(room.group, mats.wallMat ?? mats.wallMat, room.x - room.width / 2, room.z, WT, room.depth, WH, layout, true);
    }
  }
  // 东墙
  if (walls.e) {
    if (room.ports?.e) {
      const gap = room.ports.e.width ?? 4;
      addWallWithDoor(room.group, mats.wallMat ?? mats.wallMat, room.x + room.width / 2, room.z, WT, room.depth, WH, gap, 0, false, layout);
    } else {
      addWallSegment(room.group, mats.wallMat ?? mats.wallMat, room.x + room.width / 2, room.z, WT, room.depth, WH, layout, true);
    }
  }
}

/** 添加带门洞的墙段 */
function addWallWithDoor(group, mat, x, z, totalLen, thickness, height, gap, offset, alongZ, layout) {
  const seg = (totalLen - gap) / 2;
  const leftLen = seg;
  const rightLen = seg;

  if (alongZ) {
    // 南北墙
    if (leftLen > 0.1) addWallSeg(x - totalLen / 2 + leftLen / 2, z, thickness, leftLen);
    if (rightLen > 0.1) addWallSeg(x + totalLen / 2 - rightLen / 2, z, thickness, rightLen);
  } else {
    // 东西墙
    if (leftLen > 0.1) addWallSeg(x, z - totalLen / 2 + leftLen / 2, rightLen, thickness);
    if (rightLen > 0.1) addWallSeg(x, z + totalLen / 2 - rightLen / 2, rightLen, thickness);
  }

  function addWallSeg(px, pz, w, d) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, height, d),
      mat
    );
    m.position.set(px, height / 2, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (layout) pushCollider(layout, px, pz, w, d);
  }
}

function addWallSegment(group, mat, x, z, w, thickness, height, layout, alongZ = false) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(alongZ ? thickness : w, height, alongZ ? w : thickness),
    mat
  );
  m.position.set(x, height / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  if (layout) pushCollider(layout, x, z, alongZ ? thickness / 2 : w / 2, alongZ ? w / 2 : thickness / 2);
}

function pushCollider(layout, x, z, w, d) {
  layout.colliders = layout.colliders || [];
  layout.colliders.push({ x, z, hw: w, hd: d });
}

// 初始化基础模板
registerBaseTemplates();

export { CELL, OPPOSITE };