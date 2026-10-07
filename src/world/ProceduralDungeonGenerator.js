import * as THREE from 'three';
import { generateMaze, makeSeededRng } from './MazeLayout.js';
import { dungeonEncounterOf } from '../content/dungeonEncounters.js';
import {
  sharedBox, sharedCircle, sharedTorus, dungeonMaterial,
  uvBox, uvPlane, uvCylinder,
} from './dungeonAssets.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../content/materialSurfaces.js';
import { ROOM_TEMPLATES, templateFitsRoom, requiredPortCount, openPorts } from './RoomTemplates.js';
import { applyShadow } from '../engine/shadowPolicy.js';
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

  static buildGeometry(group, layout, def, texLib = null) {
    // 尺寸事实由布局带进来（切片4f）：几何层不再自己抄一份，所以一份缺字段的布局必须**当场**说缺哪一个，
    // 而不是往下算出 NaN 的坐标 —— 那是 B80 的症状形状。关卡编辑器导入的 JSON 是这里唯一的外部入口。
    const 缺 = ['wallH', 'wallT', 'doorWidth', 'bossDoorWidth']
      .filter((k) => typeof layout[k] !== 'number' || !Number.isFinite(layout[k]));
    if (缺.length) {
      throw new TypeError(`布局缺少的尺寸字段：${缺.join('、')} —— 由 generateMaze 或关卡编辑器导出时带上（W-B10 切片4f）`);
    }

    group.userData.layout = layout;
    group.userData.colliders = [];

    // 石砌面（W-C5）：normal / roughness 两种"表面事实"来自离线烘焙的贴图（`npm run bake:textures`），
    // 颜色仍归各材料自己的 `color`（副本按主题染色）。墙与地面的 UV 以**米**计（见 dungeonAssets 的
    // uvBox/uvPlane/uvCylinder），所以铺数只有一个：一砖两米 ⇒ repeat = 1 / tileMeters。
    //
    // `texLib` 是注入点（测试喂假库）；不给就问单例。**拿不到就按无贴图构建**：进入副本是同步路径，
    // 等不了加载 —— 这与"masonry 没加载出来"同一条退路（库没就绪 / 这一组没文件都是 null）。
    const lib = texLib ?? TextureLibrary.loaded();
    const 砖 = 1 / SURFACE_SPECS.masonry.tileMeters;
    const 石砌 = lib?.uvVariant('masonry', 砖, 砖) ?? null;

    // 几何与材质都按签名共享一份（B76）：七座副本开机各 build 一遍，改前是 1804 份几何
    // + 1804 份材质，而签名全域只有 16 种、材质只由副本配色决定。key 里带上 def.id ——
    // 配色不同的两座副本**必须**拿到不同份材质，共享错了会让一座变成另一座的颜色。
    // 带贴图的走 `@tex` 后缀的 key：同一座副本的两种面（贴与不贴）各有一份，互不挤占。
    const floorParams = {
      color: def.theme,
      roughness: 石砌 ? 1.0 : 0.88, // 贴图在时由贴图给值（均值 ≈ 0.85）
      metalness: 0.06,
      envMapIntensity: 0.35,
    };
    if (石砌) {
      floorParams.normalMap = 石砌.normalMap;
      floorParams.roughnessMap = 石砌.roughnessMap;
      floorParams.normalScale = new THREE.Vector2(0.8, 0.8);
    }
    const floorMat = dungeonMaterial(石砌 ? `${def.id}:floor@tex` : `${def.id}:floor`, () => new THREE.MeshStandardMaterial(floorParams));
    const wallParams = {
      color: new THREE.Color(def.theme).multiplyScalar(0.75),
      roughness: 石砌 ? 1.0 : 0.9,
    };
    if (石砌) {
      wallParams.normalMap = 石砌.normalMap;
      wallParams.roughnessMap = 石砌.roughnessMap;
      wallParams.normalScale = new THREE.Vector2(0.8, 0.8);
    }
    const wallMat = dungeonMaterial(石砌 ? `${def.id}:wall@tex` : `${def.id}:wall`, () => new THREE.MeshStandardMaterial(wallParams));
    const accentMat = dungeonMaterial(`${def.id}:accent`, () => new THREE.MeshStandardMaterial({
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.55,
    }));
    // 门板（W-C5 切片3）：关着的那一块贴 plank 木板面（门板几何走 uvBox、UV 以米计 ——
    // 与墙同一条尺子，见下面建门板那一段）。颜色与副本无关，所以材质是**全域**一份；
    // 键同样分贴/不贴两态（`@tex` 后缀，与地面/墙一条口径）：缺贴图时回到旧读数。
    const 板砖 = 1 / SURFACE_SPECS.plank.tileMeters;
    const 木纹 = lib?.uvVariant('plank', 板砖, 板砖) ?? null;
    const doorParams = {
      color: 0x3a3028,
      roughness: 木纹 ? 1.0 : 0.85, // 贴图在时由贴图给值（均值 ≈ 0.84，与旧常数 0.85 同档）
      metalness: 0.2,
    };
    if (木纹) {
      doorParams.normalMap = 木纹.normalMap;
      doorParams.roughnessMap = 木纹.roughnessMap;
      doorParams.normalScale = new THREE.Vector2(0.8, 0.8);
    }
    const doorClosedMat = dungeonMaterial(木纹 ? 'door:closed@tex' : 'door:closed', () => new THREE.MeshStandardMaterial(doorParams));

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
        this._buildBossArena(room.group, room, layout, def, accentMat, wallMat, lib);
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
        applyShadow(ob, 'castOnly');
        group.add(ob);
        layout.loreMeshes.push(ob);
      }
    }

    // 门。门板/门框/门碰撞都是**这扇门所在那个洞**的派生量（切片4f）：
    // 改前它们各抄了一份字面量（3.5 / 4.2 / hw 2），于是"关着的门盖不住自己的门洞"
    // —— 逐扇量出来 537 扇门每侧见光 0.25 米（`.tmp-20261004/wb10s4f-census.mjs` ③）。
    for (const door of layout.doors) {
      // 门板几何走 uvBox（以米计 UV，W-C5 切片3）：木纹是竖板+压条的图案，
      // 铺数只能有一个（1 / 一板两米），UV 不乘尺寸的话每扇门都会拉成不一样宽
      const panel = new THREE.Mesh(uvBox(doorW - 2 * DOOR_JAMB, DOOR_H, DOOR_T), doorClosedMat);
      panel.position.set(door.x, DOOR_H / 2, door.z);
      if (door.dir === 'n' || door.dir === 's') panel.rotation.y = 0;
      else panel.rotation.y = Math.PI / 2;
      applyShadow(panel, 'prop');
      panel.userData.door = door;
      panel.name = `door_${door.id}`;
      group.add(panel);
      layout.doorMeshes.push(panel);
      // 门碰撞盒：**跨洞那一轴 = 门洞宽 / 2、沿通道那一轴 = DOOR_COLLIDER_HALF_DEPTH，
      // 轴向随 dir 转**（切片4h 修 B84 —— 改前长轴恒在 x：246 扇东西向门的跨洞半轴只有
      // 0.45 米（洞半宽 2.00），关着的门在洞口两侧各留 0.7 米可穿过的缝，又在门前 2.45 米
      // 处凭空挡人）。n/s 门跨洞在 x、e/w 门跨洞在 z。
      const 跨洞半轴 = doorW / 2;
      const 沿通道半轴 = DOOR_COLLIDER_HALF_DEPTH;
      const 跨洞在x = door.dir === 'n' || door.dir === 's';
      door.collider = {
        x: door.x, z: door.z,
        hw: 跨洞在x ? 跨洞半轴 : 沿通道半轴,
        hd: 跨洞在x ? 沿通道半轴 : 跨洞半轴,
        open: false,
      };

      const frame = new THREE.Mesh(
        sharedBox(doorW + DOOR_FRAME_OVER, DOOR_FRAME_H, DOOR_FRAME_T), accentMat);
      frame.position.copy(panel.position);
      frame.position.y = DOOR_FRAME_H / 2;
      if (door.dir === 'e' || door.dir === 'w') frame.rotation.y = Math.PI / 2;
      applyShadow(frame, 'prop');
      frame.userData.isFrame = true;
      group.add(frame);
    }
  }

  /** 标准房间几何：地面、墙、门洞（W-B10 切片4c，修 B78） */
  static _buildRoomGeometry(room, layout, def, floorMat, wallMat, accentMat, doorW, WH, WT) {
    const rw = room.w;
    const rd = room.d;

    // 地面。UV 以米计（uvPlane）—— 17.8×17.8 的一整块与将来其它尺寸的地面共用同一个铺数
    const floor = new THREE.Mesh(uvPlane(rw - 0.2, rd - 0.2), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0.02, room.z);
    applyShadow(floor, 'ground');
    room.group.add(floor);

    // 基础灯光
    const torch = new THREE.PointLight(def.accent, 0.35, 14);
    torch.position.set(room.x, 3.2, room.z);
    room.group.add(torch);

    // 外墙与门洞（W-B10 切片4c，修 B78 + B79）
    const w = room.walls;
    
    // 北墙
    if (w.n) {
      addWallSegment(room.group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, layout);
    } else {
      const door = findDoorForRoom(layout, room.id, 'n');
      const offset = door ? door.x - room.x : 0;
      addWallWithGap(room.group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, doorW, layout, false, offset);
    }
    
    // 南墙
    if (w.s) {
      addWallSegment(room.group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, layout);
    } else {
      const door = findDoorForRoom(layout, room.id, 's');
      const offset = door ? door.x - room.x : 0;
      addWallWithGap(room.group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, doorW, layout, false, offset);
    }
    
    // 西墙
    if (w.w) {
      addWallSegment(room.group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, layout, true);
    } else {
      const door = findDoorForRoom(layout, room.id, 'w');
      const offset = door ? door.z - room.z : 0;
      addWallWithGap(room.group, wallMat, room.x - rw / 2, room.z, rd, WT, WH, doorW, layout, true, offset);
    }
    
    // 东墙
    if (w.e) {
      addWallSegment(room.group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, layout, true);
    } else {
      const door = findDoorForRoom(layout, room.id, 'e');
      const offset = door ? door.z - room.z : 0;
      addWallWithGap(room.group, wallMat, room.x + rw / 2, room.z, rd, WT, WH, doorW, layout, true, offset);
    }
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

  static _buildBossArena(group, room, layout, def, accentMat, wallMat, lib = null) {
    const rw = room.w;
    const rd = room.d;
    const WH = layout.wallH;
    const WT = layout.wallT;
    const doorW = layout.bossDoorWidth;

    // 石板地面（W-C5 切片2）：地面是圆盘（CircleGeometry 的 UV 是 0..1 跨整个直径），
    // 铺数按**直径 / tileMeters** 算 —— 每块石板在任何一座 Boss 场都是同一个尺寸。
    // 拿不到库就照旧纯色自发光（与墙/地同一条退路：进副本是同步路径，等不了加载）。
    const 板材 = lib?.uvVariant('slabs', (rw * 0.9) / SURFACE_SPECS.slabs.tileMeters, (rw * 0.9) / SURFACE_SPECS.slabs.tileMeters) ?? null;
    const floorParams = {
      color: def.accent,
      emissive: def.accent,
      emissiveIntensity: 0.08,
      roughness: 板材 ? 1.0 : 0.75, // 贴图在时由贴图给值
      metalness: 0.15,
    };
    if (板材) {
      floorParams.normalMap = 板材.normalMap;
      floorParams.roughnessMap = 板材.roughnessMap;
      floorParams.normalScale = new THREE.Vector2(0.9, 0.9);
    }
    const floorMat = dungeonMaterial(板材 ? `${def.id}:bossFloor@tex` : `${def.id}:bossFloor`, () => new THREE.MeshStandardMaterial(floorParams));
    const floor = new THREE.Mesh(sharedCircle(rw * 0.45, 48), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(room.x, 0.03, room.z);
    applyShadow(floor, 'ground');
    group.add(floor);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = room.x + Math.cos(a) * rw * 0.38;
      const pz = room.z + Math.sin(a) * rd * 0.38;
      // uvCylinder：柱面 UV 也按米算（绕周长 / 沿高），与墙同一砖尺寸
      const pillar = new THREE.Mesh(uvCylinder(0.5, 0.65, WH + 1, 8), wallMat);
      pillar.position.set(px, (WH + 1) / 2, pz);
      applyShadow(pillar, 'castOnly');
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
    
    // Boss 场北墙
    if (w.n) {
      addWallSegment(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, layout);
    } else {
      const door = findDoorForRoom(layout, room.id, 'n');
      const offset = door ? door.x - room.x : 0;
      addWallWithGap(group, wallMat, room.x, room.z - rd / 2, rw, WT, WH, doorW, layout, false, offset);
    }
    
    // Boss 场南墙
    if (w.s) {
      addWallSegment(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, layout);
    } else {
      const door = findDoorForRoom(layout, room.id, 's');
      const offset = door ? door.x - room.x : 0;
      addWallWithGap(group, wallMat, room.x, room.z + rd / 2, rw, WT, WH, doorW, layout, false, offset);
    }
    
    // Boss 场西墙
    if (w.w) {
      addWallSegment(group, wallMat, room.x - rw / 2, room.z, WT, rd, WH, layout, true);
    } else {
      const door = findDoorForRoom(layout, room.id, 'w');
      const offset = door ? door.z - room.z : 0;
      addWallWithGap(group, wallMat, room.x - rw / 2, room.z, rd, WT, WH, doorW, layout, true, offset);
    }
    
    // Boss 场东墙
    if (w.e) {
      addWallSegment(group, wallMat, room.x + rw / 2, room.z, WT, rd, WH, layout, true);
    } else {
      const door = findDoorForRoom(layout, room.id, 'e');
      const offset = door ? door.z - room.z : 0;
      addWallWithGap(group, wallMat, room.x + rw / 2, room.z, rd, WT, WH, doorW, layout, true, offset);
    }
  }
}

function addWallSegment(group, mat, x, z, w, d, h, layout) {
  // uvBox：墙段宽度从 18（整墙）到 7（门旁那截）不等，UV 以米计它们才是同一个砖尺寸
  const m = new THREE.Mesh(uvBox(w, h, d), mat);
  m.position.set(x, h / 2, z);
  applyShadow(m, 'prop');
  m.userData.isWall = true;
  group.add(m);
  pushCollider(layout, x, z, w, d);
}

/**
 * 找某间房在某个方向上的门（如果有的话）
 */
function findDoorForRoom(layout, roomId, dir) {
  if (!layout.doors) return null;
  return layout.doors.find(d => d.fromRoomId === roomId && d.dir === dir);
}

function addWallWithGap(group, mat, x, z, totalLen, thickness, h, gap, layout, alongZ = false, doorOffset = 0) {
  // doorOffset: 门中心相对于墙中心的偏移（正数表示沿轴正方向偏移）
  // 如果没有传 doorOffset，默认门在墙中心（gap 居中）
  const seg = (totalLen - gap) / 2;
  const centerOffset = doorOffset;
  
  if (alongZ) {
    // 沿 Z 轴的墙（南北墙），门偏移影响 z 坐标
    const seg1Z = z - totalLen / 2 + seg / 2 + centerOffset;
    const seg2Z = z + totalLen / 2 - seg / 2 + centerOffset;
    addWallSegment(group, mat, x, seg1Z, thickness, seg, h, layout);
    addWallSegment(group, mat, x, seg2Z, thickness, seg, h, layout);
  } else {
    // 沿 X 轴的墙（东西墙），门偏移影响 x 坐标
    const seg1X = x - totalLen / 2 + seg / 2 + centerOffset;
    const seg2X = x + totalLen / 2 - seg / 2 + centerOffset;
    addWallSegment(group, mat, seg1X, z, seg, thickness, h, layout);
    addWallSegment(group, mat, seg2X, z, seg, thickness, h, layout);
  }
}

function pushCollider(layout, x, z, w, d) {
  layout.colliders = layout.colliders || [];
  layout.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
}
