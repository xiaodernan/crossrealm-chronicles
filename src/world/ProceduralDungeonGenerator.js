import * as THREE from 'three';
import { generateMaze } from './MazeLayout.js';
import { dungeonEncounterOf } from '../content/dungeonEncounters.js';
import {
  sharedBox, sharedPlane, sharedCircle, sharedCylinder, sharedTorus, dungeonMaterial,
} from './dungeonAssets.js';
import { ROOM_TEMPLATES, registerBaseTemplates, getRoomTemplate } from './RoomTemplates.js';

/** 确保基础模板已注册（幂等） */
if (Object.keys(ROOM_TEMPLATES).length === 0) {
  registerBaseTemplates();
}

/** 程序化迷宫地下城 — 多房间、多门、可探索 */
export class ProceduralDungeonGenerator {
  static generate(def, seed = Date.now()) {
    const gridW = def.gridW ?? 5;
    const gridH = def.gridH ?? 5;
    // 「出谁、几只」按副本 id 认领遭遇表（W-B10 切片3b）：认不出就抛，而不是兜到某一座的池子。
    const layout = generateMaze(gridW, gridH, seed, dungeonEncounterOf(def.id));
    layout.theme = def.theme;
    layout.accent = def.accent;
    layout.name = def.name;
    return layout;
  }

  static buildGeometry(group, layout, def) {
    group.userData.layout = layout;
    group.userData.colliders = [];

    // 几何与材质都按签名共享一份（B76）：七座副本开机各 build 一遍，改前是 1804 份几何
    // + 1804 份材质，而签名全域只有 16 种、材质只由副本配色决定。key 里带上 def.id ——
    // 配色不同的两座副本**必须**拿到不同份材质，共享错了会让一座变成另一座的颜色。
    const floorMat = dungeonMaterial(`${def.id}:floor`, () => new THREE.MeshStandardMaterial({
      color: def.theme,
      roughness: 0.88,
      metalness: 0.06,
      envMapIntensity: 0.35,
    }));
    const wallMat = dungeonMaterial(`${def.id}:wall`, () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(def.theme).multiplyScalar(0.75),
      roughness: 0.9,
    }));
    const accentMat = dungeonMaterial(`${def.id}:accent`, () => new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.55,
    }));
    // 门板关着时的颜色与副本无关，所以它是**全域**一份而不是每座一份
    const doorClosedMat = dungeonMaterial('door:closed', () => new THREE.MeshStandardMaterial({
      color: 0x3a3028,
      roughness: 0.85,
      metalness: 0.2,
    }));
    const doorOpenMat = dungeonMaterial(`${def.id}:doorOpen`, () => new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.5,
    }));

    const CS = layout.cellSize;
    const WH = layout.wallH;
    const WT = layout.wallT;
    const doorW = 4;

    // 为每个房间分配模板（W-B10 切片4：模板库 + 连接规则）
    this._assignRoomTemplates(layout, def);

    layout.loreMeshes = [];
    layout.doorMeshes = [];

    for (const room of layout.rooms) {
      room.group = new THREE.Group();
      group.add(room.group);

      if (room.isBossArena) {
        this._buildBossArena(room.group, room, layout, def, accentMat, wallMat);
        continue;
      }

      // 标准房间几何：地面、墙、门洞（必须始终执行，保证门洞形状正确，W-B10 切片4c）
      this._buildRoomGeometry(room, layout, def, floorMat, wallMat, accentMat, doorW, CS, WH, WT);

      // 模板内部装饰（灯光、柱子、装饰物等）——不包含墙/门
      const template = room.template;
      if (template?.buildInterior) {
        template.buildInterior(room.group, room, layout, def, { floorMat, wallMat, accentMat });
      } else if (template?.buildGeometry) {
        // 兼容旧字段
        template.buildGeometry(room.group, room, layout, def, { floorMat, wallMat, accentMat });
      } else {
        // 回退：默认内部装饰
        this._buildDefaultInterior(room.group, room, layout, { floorMat, wallMat, accentMat });
      }

      // LORE 碎片
      if (room.lore) {
        const ob = new THREE.Mesh(sharedBox(0.8, 1.6, 0.3), accentMat);
        ob.position.set(room.x + (room.w ?? CS) * 0.25, 0.8, room.z - (room.d ?? CS) * 0.2);
        ob.userData.lore = room.lore;
        ob.userData.roomId = room.id;
        ob.name = 'lore_shard';
        group.add(ob);
        layout.loreMeshes.push(ob);
      }
    }

    // 门
    for (const door of layout.doors) {
      const panel = new THREE.Mesh(sharedBox(3.5, 4.2, 0.5), doorClosedMat);
      panel.position.set(door.x, 2.1, door.z);
      if (door.dir === 'n' || door.dir === 's') panel.rotation.y = 0;
      else panel.rotation.y = Math.PI / 2;
      panel.userData.door = door;
      panel.name = `door_${door.id}`;
      group.add(panel);
      layout.doorMeshes.push(panel);
      door.collider = { x: door.x, z: door.z, hw: 2, hd: 0.45, open: false };

      const frame = new THREE.Mesh(sharedBox(4.2, 4.8, 0.15), accentMat);
      frame.position.copy(panel.position);
      frame.position.y = 2.4;
      if (door.dir === 'e' || door.dir === 'w') frame.rotation.y = Math.PI / 2;
      frame.userData.isFrame = true;
      group.add(frame);
    }

    layout._doorClosedMat = doorClosedMat;
    layout._doorOpenMat = doorOpenMat;
  }

  /** 标准房间几何：地面、墙、门洞（W-B10 切片4c，修 B78） */
  static _buildRoomGeometry(room, layout, def, floorMat, wallMat, accentMat, doorW, CS, WH, WT) {
    const rw = room.w ?? CS;
    const rd = room.d ?? CS;

    // 地面
    const floor = new THREE.Mesh(sharedPlane(rw - 0.2, rd - 0.2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0.02, room.z);
    floor.receiveShadow = true;
    room.group.add(floor);

    // 基础灯光
    const torch = new THREE.PointLight(def.accent, 0.35, 14);
    torch.position.set(room.x, 3.2, room.z);
    room.group.add(torch);

    // 外墙与门洞（W-B10 切片4c，修 B78）
    const w = room.walls;
    if (w.n) addWallSegment(room.group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, layout);
    else addWallWithGap(room.group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, doorW, layout);
    if (w.s) addWallSegment(room.group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, layout);
    else addWallWithGap(room.group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, doorW, layout);
    if (w.w) addWallSegment(room.group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, layout, true);
    else addWallWithGap(room.group, wallMat, room.x - rw / 2, room.z, rd, WT, WH, doorW, layout, true);
    if (w.e) addWallSegment(room.group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, layout, true);
    else addWallWithGap(room.group, wallMat, room.x + rw / 2, room.z, rd, WT, WH, doorW, layout, true);
  }

  /** 为每个房间分配模板（W-B10 切片4：连接规则） */
  static _assignRoomTemplates(layout, def) {
    const entranceDir = this._getEntranceDirection(layout);
    
    for (const room of layout.rooms) {
      if (room.isBossArena) {
        room.template = { buildGeometry: this._buildBossArena };
        continue;
      }
      if (room.id === layout.spawn?.id) {
        room.template = getRoomTemplate('hall', 'straight');
        continue;
      }
      if (room.isExit) {
        room.template = getRoomTemplate('arena', 'round');
        continue;
      }

      // 根据门的连接情况选择模板
      const ports = { n: !room.walls.n, e: !room.walls.e, s: !room.walls.s, w: !room.walls.w };
      const connectedCount = Object.values(ports).filter(Boolean).length;
      
      let templateKey = 'chamber:square';
      if (connectedCount >= 3) {
        templateKey = ports.e && ports.w && !ports.n && !ports.s ? 'junction:tee' : 'junction:cross';
      } else if (connectedCount === 2) {
        if ((ports.n && ports.s) || (ports.e && ports.w)) {
          templateKey = ports.n && ports.s ? 'hall:straight' : 'hall:straight';
        } else {
          templateKey = 'chamber:square';
        }
      } else if (connectedCount === 1) {
        // 死路：宝藏房或 LORE 房
        templateKey = Math.random() < 0.3 ? 'treasure:small' : 'lore:double-door';
      }

      room.template = getRoomTemplate(...templateKey.split(':'));
      if (!room.template) {
        room.template = getRoomTemplate('chamber', 'square');
      }

      // 准备房间的端口信息供模板使用
      room.ports = {};
      for (const dir of ['n', 'e', 's', 'w']) {
        if (!room.walls[dir]) {
          room.ports[dir] = { width: 4, offset: 0 };
        }
      }
    }
  }

  static _getEntranceDirection(layout) {
    // 简化：入口在 spawn 房
    return layout.spawn ? 's' : 'n';
  }

  /** 回退：标准房间构建 */
  static _buildStandardRoom(room, layout, mats) {
    const CS = room.w ?? layout.cellSize;
    const CSd = room.d ?? layout.cellSize;
    const WH = layout.wallH;
    const WT = layout.wallT;
    const doorW = 4;

    const floor = new THREE.Mesh(sharedPlane(CS - 0.4, CSd - 0.4), mats.floorMatBase);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0.02, room.z);
    floor.receiveShadow = true;
    room.group.add(floor);

    const torch = new THREE.PointLight(mats.accentMatBase.color, 0.35, 14);
    torch.position.set(room.x, 3.2, room.z);
    room.group.add(torch);

    const w = room.walls;
    if (w.n) addWallSegment(room.group, mats.wallMatBase, room.x, room.z - CSd / 2, CS, WT, WH, layout);
    else addWallWithGap(room.group, mats.wallMatBase, room.x, room.z - CSd / 2, CS, WT, WH, 4, layout);
    if (w.s) addWallSegment(room.group, mats.wallMatBase, room.x, room.z + CSd / 2, CS, WT, WH, layout);
    else addWallWithGap(room.group, mats.wallMatBase, room.x, room.z + CSd / 2, CS, WT, WH, 4, layout);
    if (w.w) addWallSegment(room.group, mats.wallMatBase, room.x - CS / 2, room.z, WT, CSd, WH, layout, true);
    else addWallWithGap(room.group, mats.wallMatBase, room.x - CS / 2, room.z, CSd, WT, WH, 4, layout, true);
    if (w.e) addWallSegment(room.group, mats.wallMatBase, room.x + CS / 2, room.z, WT, CSd, WH, layout, true);
    else addWallWithGap(room.group, mats.wallMatBase, room.x + CS / 2, room.z, CSd, WT, WH, 4, layout, true);
  }

  static setDoorOpen(layout, door, open) {
    door.open = open;
    door.locked = !open;
    if (door.collider) door.collider.open = open;
    const mesh = layout.doorMeshes?.find((m) => m.userData.door?.id === door.id);
    if (!mesh) return;
    mesh.visible = !open;
  }

  static _buildBossArena(group, room, layout, def, accentMat, wallMat) {
    const rw = room.w;
    const rd = room.d;
    const WH = layout.wallH;
    const WT = layout.wallT;
    const doorW = 5;

    const floorMat = dungeonMaterial(`${def.id}:bossFloor`, () => new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.08,
      roughness: 0.75,
      metalness: 0.15,
    }));
    const floor = new THREE.Mesh(sharedCircle(rw * 0.45, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0.03, room.z);
    floor.receiveShadow = true;
    group.add(floor);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = room.x + Math.cos(a) * rw * 0.38;
      const pz = room.z + Math.sin(a) * rd * 0.38;
      const pillar = new THREE.Mesh(sharedCylinder(0.5, 0.65, WH + 1, 8), wallMat);
      pillar.position.set(px, (WH + 1) / 2, pz);
      pillar.castShadow = true;
      group.add(pillar);
      pushCollider(layout, px, pz, 1.2, 1.2);
    }

    const ring = new THREE.Mesh(sharedTorus(8, 0.2, 8, 48), accentMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(room.x, 0.15, room.z);
    group.add(ring);

    const exit = new THREE.Mesh(sharedTorus(2.5, 0.18, 10, 40), accentMat);
    exit.rotation.x = Math.PI / 2;
    exit.position.set(room.x + rw * 0.32, 1.5, room.z);
    exit.name = 'exit';
    group.add(exit);

    const bossLight = new THREE.PointLight(def.accent, 0.9, 40);
    bossLight.position.set(room.x, 6, room.z);
    group.add(bossLight);

    const w = room.walls;
    if (w.n) addWallSegment(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, layout);
    else addWallWithGap(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, doorW, layout);
    if (w.s) addWallSegment(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, layout);
    else addWallWithGap(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, doorW, layout);
    if (w.w) addWallSegment(group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, layout, true);
    else addWallWithGap(group, wallMat, room.x - rw / 2, room.z, rd, WT, WH, doorW, layout, true);
    if (w.e) addWallSegment(group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, layout, true);
    else addWallWithGap(group, wallMat, room.x + rw / 2, room.z, rd, WT, WH, doorW, layout, true);
  }
}

function addWallSegment(group, mat, x, z, w, d, h, layout) {
  const m = new THREE.Mesh(sharedBox(w, h, d), mat);
  m.position.set(x, h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  pushCollider(layout, x, z, w, d);
}

function addWallWithGap(group, mat, x, z, totalLen, thickness, h, gap, layout, alongZ = false) {
  const seg = (totalLen - gap) / 2;
  if (alongZ) {
    addWallSegment(group, mat, x, z - totalLen / 2 + seg / 2, thickness, seg, h, layout);
    addWallSegment(group, mat, x, z + totalLen / 2 - seg / 2, thickness, seg, h, layout);
  } else {
    addWallSegment(group, mat, x - totalLen / 2 + seg / 2, z, seg, thickness, h, layout);
    addWallSegment(group, mat, x + totalLen / 2 - seg / 2, z, seg, thickness, h, layout);
  }
}

function pushCollider(layout, x, z, w, d) {
  layout.colliders = layout.colliders || [];
  layout.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
}
