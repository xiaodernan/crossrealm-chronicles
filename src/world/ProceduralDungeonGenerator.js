import * as THREE from 'three';
import { generateMaze, makeSeededRng } from './MazeLayout.js';
import { dungeonEncounterOf } from '../content/dungeonEncounters.js';
import {
  sharedBox, sharedPlane, sharedCircle, sharedCylinder, sharedTorus, dungeonMaterial,
} from './dungeonAssets.js';
import { ROOM_TEMPLATES, templateFitsRoom, requiredPortCount, openPorts } from './RoomTemplates.js';
import {
  DOOR_JAMB, DOOR_H, DOOR_T, DOOR_FRAME_OVER, DOOR_FRAME_H, DOOR_FRAME_T,
  DOOR_COLLIDER_HALF_DEPTH,
} from './dungeonDimensions.js';

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
    // 尺寸事实由布局带进来（切片4f）：几何层不再自己抄一份，所以一份缺字段的布局必须**当场**说缺哪一个，
    // 而不是往下算出 NaN 的坐标 —— 那是 B80 的症状形状。关卡编辑器导入的 JSON 是这里唯一的外部入口。
    const 缺 = ['wallH', 'wallT', 'doorWidth', 'bossDoorWidth']
      .filter((k) => typeof layout[k] !== 'number' || !Number.isFinite(layout[k]));
    if (缺.length) {
      throw new TypeError(`布局缺少的尺寸字段：${缺.join('、')} —— 由 generateMaze 或关卡编辑器导出时带上（W-B10 切片4f）`);
    }

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

    const WH = layout.wallH;
    const WT = layout.wallT;
    const doorW = layout.doorWidth;

    // 模板分配吃迷宫自己那颗种子（切片4e）：同一颗种子必须永远得到同一座迷宫，
    // 不然"存档里的种子"与关卡编辑器的复现就没了根据 —— 那是 B75 一整片的立论。
    this._assignRoomTemplates(layout);

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
      this._buildRoomGeometry(room, layout, def, floorMat, wallMat, accentMat, doorW, WH, WT);

      // 模板只往已经建好的房间里摆装饰（切片4e 的合同：不再叠一层地面/墙、不再加灯）
      room.template.buildInterior(room.group, room, layout, def, {
        wallMat,
        accentMat,
        addCollider: (x, z, w, d) => pushCollider(layout, x, z, w, d),
      });

      if (room.lore) {
        const ob = new THREE.Mesh(sharedBox(0.8, 1.6, 0.3), accentMat);
        ob.position.set(room.x + room.w * 0.25, 0.8, room.z - room.d * 0.2);
        ob.userData.lore = room.lore;
        ob.userData.roomId = room.id;
        ob.name = 'lore_shard';
        group.add(ob);
        layout.loreMeshes.push(ob);
      }
    }

    // 门。门板/门框/门碰撞都是**这扇门所在那个洞**的派生量（切片4f）：
    // 改前它们各抄了一份字面量（3.5 / 4.2 / hw 2），于是"关着的门盖不住自己的门洞"
    // —— 逐扇量出来 537 扇门每侧见光 0.25 米（`.tmp-20261004/wb10s4f-census.mjs` ③）。
    for (const door of layout.doors) {
      const panel = new THREE.Mesh(sharedBox(doorW - 2 * DOOR_JAMB, DOOR_H, DOOR_T), doorClosedMat);
      panel.position.set(door.x, DOOR_H / 2, door.z);
      if (door.dir === 'n' || door.dir === 's') panel.rotation.y = 0;
      else panel.rotation.y = Math.PI / 2;
      panel.userData.door = door;
      panel.name = `door_${door.id}`;
      group.add(panel);
      layout.doorMeshes.push(panel);
      // 半轴取洞的一半，但它恒落在 x 轴上：南北向门因此正好跨住洞口，
      // 东西向门则变成"沿通道 2 米、跨洞只有 0.45 米"（跨洞那 1.55 米靠墙段自己的碰撞盒补住）。
      // 轴向该不该随 dir 转是另一件事，登记在台账，不在这一片动碰撞。
      door.collider = { x: door.x, z: door.z, hw: doorW / 2, hd: DOOR_COLLIDER_HALF_DEPTH, open: false };

      const frame = new THREE.Mesh(
        sharedBox(doorW + DOOR_FRAME_OVER, DOOR_FRAME_H, DOOR_FRAME_T), accentMat);
      frame.position.copy(panel.position);
      frame.position.y = DOOR_FRAME_H / 2;
      if (door.dir === 'e' || door.dir === 'w') frame.rotation.y = Math.PI / 2;
      frame.userData.isFrame = true;
      group.add(frame);
    }
  }

  /** 标准房间几何：地面、墙、门洞（W-B10 切片4c，修 B78） */
  static _buildRoomGeometry(room, layout, def, floorMat, wallMat, accentMat, doorW, WH, WT) {
    const rw = room.w;
    const rd = room.d;

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

  /**
   * 给每间房分配模板（W-B10 切片4e）。三条口径：
   * - **Boss 场不套模板**：它由 `_buildBossArena` 自己建，34×34 也不在任何模板的尺寸假设里。
   * - **只从贴合的模板里挑**（`templateFitsRoom`）：模板声明"必须有门"的方向，房间必须真的开着门。
   *   这一条从根上禁掉旧写法里名字与端口互相矛盾的那些分配（死路房领 `lore:double-door`，
   *   而那个模板声明 n、s 都必开 —— 死路房只有一扇门）。
   * - **平手由种子定，不用 `Math.random()`**：同一颗种子必须永远得到同一座迷宫，
   *   这是切片4a（修 B75）整片的立论；挑"必开门最多"的那个先，是让走廊/路口这类名字真的说话。
   */
  static _assignRoomTemplates(layout) {
    const rnd = makeSeededRng(layout.seed);
    const 全体 = Object.values(ROOM_TEMPLATES);
    for (const room of layout.rooms) {
      if (room.isBossArena) { room.template = null; continue; }
      const 候选 = 全体.filter((t) => templateFitsRoom(t, room));
      if (!候选.length) {
        throw new Error(
          `${room.id}（${room.w}×${room.d}，开着的门：${openPorts(room).join('') || '无'}）`
          + '没有任何贴合的模板 —— 模板库的尺寸/端口假设与迷宫造出来的房间脱节（W-B10 切片4e）'
        );
      }
      const 最具体 = Math.max(...候选.map(requiredPortCount));
      const 并列 = 候选.filter((t) => requiredPortCount(t) === 最具体);
      room.template = 并列[Math.floor(rnd() * 并列.length)];
    }
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
    const doorW = layout.bossDoorWidth;

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
