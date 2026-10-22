import * as THREE from 'three';
import { generateMaze, makeSeededRng } from './MazeLayout.js';
import { 布局从载荷 } from './dungeonLayoutPayload.js';
import { dungeonEncounterOf } from '../content/dungeonEncounters.js';
import {
  sharedBox, sharedCircle, sharedTorus, dungeonMaterial,
  uvBox, uvPlane, uvCylinder,
} from './dungeonAssets.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../content/materialSurfaces.js';
import { paletteOf } from '../content/materialPalette.js';
import { ROOM_TEMPLATES, templateFitsRoom, requiredPortCount, openPorts } from './RoomTemplates.js';
import { applyShadow } from '../engine/shadowPolicy.js';
// 墙段口径（W-B11 切片3）：副本与关卡编辑器共用这一份 —— 洞开在哪、洞多宽只有一处答案
import { 门洞宽, 洞在面, 建一面墙 } from './dungeonWalls.js';
import {
  DOOR_JAMB, DOOR_H, DOOR_T, DOOR_FRAME_OVER, DOOR_FRAME_H, DOOR_FRAME_T,
  DOOR_COLLIDER_HALF_DEPTH,
} from './dungeonDimensions.js';

/** 程序化迷宫地下城 — 多房间、多门、可探索 */
export class ProceduralDungeonGenerator {
  static generate(def, seed = Date.now()) {
    const gridW = def.gridW ?? 5;
    const gridH = def.gridH ?? 5;
    const 遭遇 = dungeonEncounterOf(def.id);
    // 「出谁、几只」按副本 id 认领遭遇表（W-B10 切片3b）：认不出就抛，而不是兜到某一座的池子。
    // W-B11 切片4：副本定义可以带一份**设计好的布局**（关卡编辑器导出的载荷）
    // ⇒ 那份不"摇"，而是**补完**（与游戏自己摇的迷宫共用同一段补完规则）
    const layout = def.layout
      ? 布局从载荷(def.layout, { encounters: 遭遇, seed, gridW, gridH })
      : generateMaze(gridW, gridH, seed, 遭遇);
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
      color: paletteOf('wood.door'),
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
      this._buildRoomGeometry(room, layout, def, floorMat, wallMat, WH, WT);

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
      const 洞 = 门洞宽(layout, door);
      const panel = new THREE.Mesh(uvBox(洞 - 2 * DOOR_JAMB, DOOR_H, DOOR_T), doorClosedMat);
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
      const 跨洞半轴 = 洞 / 2;
      const 沿通道半轴 = DOOR_COLLIDER_HALF_DEPTH;
      const 跨洞在x = door.dir === 'n' || door.dir === 's';
      door.collider = {
        x: door.x, z: door.z,
        hw: 跨洞在x ? 跨洞半轴 : 沿通道半轴,
        hd: 跨洞在x ? 沿通道半轴 : 跨洞半轴,
        open: false,
      };

      const frame = new THREE.Mesh(
        sharedBox(洞 + DOOR_FRAME_OVER, DOOR_FRAME_H, DOOR_FRAME_T), accentMat);
      frame.position.copy(panel.position);
      frame.position.y = DOOR_FRAME_H / 2;
      if (door.dir === 'e' || door.dir === 'w') frame.rotation.y = Math.PI / 2;
      applyShadow(frame, 'prop');
      frame.userData.isFrame = true;
      group.add(frame);
    }
  }

  /**
   * 标准房间几何：地面、墙、门洞（W-B10 切片4c 修 B78；切片5d 起洞宽与洞位都由**那扇门**说话）。
   *
   * 改前这一面墙的洞宽是调用方递进来的一个数（`layout.doorWidth`），洞位是"门心减房心"的偏移：
   * 于是朝 Boss 场开的那一面墙按 4 米凿洞、门板却按 5 米做（场墙那一档），两侧各建一遍还互不相认。
   * 现在一条墙线上的每一个洞都从 `doorsOnSide` 认领：位置取那扇门自己的沿墙坐标，宽度取
   * `门洞宽(layout, door)`（口径 4 —— 一条共用墙线是两房合建的一面，宽度由**门**决定认哪一档，
   * 数字本身留在 `layout` 上，所以导一份 `doorWidth: 6` 的布局进来，门真的跟着变宽）。
   */
  static _buildRoomGeometry(room, layout, def, floorMat, wallMat, WH, WT) {
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

    // 外墙与门洞（W-B10 切片4c，修 B78 + B79；W-B11 切片3：建墙改问 `dungeonWalls.js` 那一份）
    const 面 = [
      ['n', false, room.x, room.z - rd / 2, rw],
      ['s', false, room.x, room.z + rd / 2, rw],
      ['w', true, room.x - rw / 2, room.z, rd],
      ['e', true, room.x + rw / 2, room.z, rd],
    ];
    for (const [dir, 沿Z, 心x, 心z, 长] of 面) {
      建一面墙(room.group, wallMat,
        { 心x, 心z, 长, 沿Z }, 洞在面(room, layout, dir, 沿Z),
        { 高: WH, 厚: WT, 记碰撞: (x, z, w, d) => pushCollider(layout, x, z, w, d) });
    }
  }

  /**
   * 给每间房分配模板（W-B10 切片4e）。三条口径：
   * - **Boss 场不套模板**：它由 `_buildBossArena` 自己建，36×36（两格见方）也不在任何模板的尺寸假设里。
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

    /*
     * Boss 场的四面墙（W-B10 切片4i 修 B79 的症状；切片5d 把因一起修掉，B85 / B102 归零）。
     *
     * ## 修的是什么
     *
     * 改前场是 **34×34** 而只占**一个格位**（`cellSize` 18）—— 它的四条边因此各伸进邻居房间 8 米。
     * 每一面要么是一整条实心墙、要么是"中间开一个 5 米洞"的两段，于是**压在邻居那扇门上**：
     * 实测七座 × 三颗种子 **83/537 扇门走不过去**（玩家半径 1.2 判），逐扇归因 75 扇被整墙压、
     * 8 扇被入口两侧那两段压。玩家侧的说法是"走到某扇门跟前才发现过不去"。
     *
     * ## 两道口径，一道防线
     *
     * 每面墙先收集"必须没有墙"的区间（`bossWallGaps`），再在剩下的区间上建墙：
     * 1. **它自己的门** —— 与标准房间同一条口径（`洞在面`）：一条格子边一扇门，一面墙可以两个洞，
     *    洞宽认这扇门自己说的档位。切片5d 之前这里是"第一扇门 + 一个递进来的 5"，
     *    所以朝场开的那九扇门**没有一扇**落在场自己的墙上（B85）。
     * 2. **别人的门穿过这条墙线** —— 5d 之后**恒为空**：场真占 2×2 格位，墙线就是格线，
     *    没有门再穿进场墙。这一层留着当防线，理由见 `bossWallGaps` 的注释。
     *
     * ## 放弃了什么（如实记）
     *
     * 场占两格 ⇒ 那三间被并进场里的邻居**不再存在**：它们的敌人出生点、文献、模板一起消失，
     * 每座迷宫 25 间房变 22 间。换到的是"墙线 == 格线"这条结构性保证 ——
     * 布局层面再也写不出"比自己的占位更宽的场"，B102（墙横在别人屋里，改前 21 场合计 1803 米）
     * 因此不是"量出来变小"，是**造不出来**。
     *
     * ## 与"占位改回一格"那一刀的关系（写给未来的自己）
     *
     * 若将来把场收进一格（`BOSS_SPAN = 1`），第 2 层会重新吃到东西，而**门立刻还是通的** ——
     * 这一层的价值就在这里：它不需要有人再走一遍全场门才发现墙压了门。
     */
    const 洞 = bossWallGaps(room, layout, rw, rd);
    for (const dir of ['n', 'e', 's', 'w']) {
      const 沿Z = dir === 'e' || dir === 'w';
      建一面墙(group, wallMat,
        {
          心x: dir === 'e' ? room.x + rw / 2 : dir === 'w' ? room.x - rw / 2 : room.x,
          心z: dir === 's' ? room.z + rd / 2 : dir === 'n' ? room.z - rd / 2 : room.z,
          长: 沿Z ? rd : rw,
          沿Z,
        },
        洞[dir],
        { 高: WH, 厚: WT, 记碰撞: (x, z, w, d) => pushCollider(layout, x, z, w, d) });
    }
  }
}

/**
 * Boss 场四面墙上"必须没有墙"的区间（W-B10 切片4i 修 B79 的症状；切片5d 起 ① 由门名单认领）。
 *
 * 两个来源：
 * 1. **它自己的门** —— 走 `洞在面`，与标准房间同一条口径：位置取那扇门自己的沿墙坐标，
 *    宽度取 `门洞宽(layout, door)`（改前这里是"第一扇门 + 一个调用方递进来的 `bossDoorW`"，
 *    所以跨两格的场一面北墙只凿得到一个洞，第二扇门站在实心墙上 —— 那是 B85）；
 * 2. **别人的门穿过这条墙线** —— 切片5d 之后**应该恒为空**（场真占 2×2 格位，墙线就是格线，
 *    没有门再穿进场墙）。留着它不是留代码，是留防线：布局一旦改回一格占位或被别的东西重新
 *    排布，门**立刻**还是通的，而不是要等到有人再走一遍全场门才发现。宽度同样问 `门洞宽`，
 *    不再抄 `layout.doorWidth`。
 *
 * 判据是纯几何的：墙线（n/s 沿 x 走、e/w 沿 z 走）与一扇门相交，当且仅当
 * **门的开口在垂直那一轴上够得到这条线**（`|门的另一轴坐标 − 墙线坐标| ≤ 洞宽 / 2`）
 * **且**门落在这一面墙的跨度内。两条都量，少一条就会在"门就在墙上但差半米"时漏掉。
 *
 * @returns {{n: Array<{c:number,w:number}>, e: …, s: …, w: …}} 每面墙的洞（`c` = 沿墙坐标，`w` = 洞宽）
 */
function bossWallGaps(room, layout, rw, rd) {
  const 洞 = { n: [], e: [], s: [], w: [] };

  // ① 它自己的门（一条边上有一扇就是一个洞，一面墙可以有两个洞）
  for (const dir of ['n', 'e', 's', 'w']) {
    洞[dir].push(...洞在面(room, layout, dir, dir === 'e' || dir === 'w'));
  }

  // ② 别人的门穿过这条墙线（B79 的正面修法；5d 起恒为空，留着当防线）
  const 线 = {
    n: { 轴: 'x', 坐标: room.z - rd / 2, 中心: room.x, 半: rw / 2 },
    s: { 轴: 'x', 坐标: room.z + rd / 2, 中心: room.x, 半: rw / 2 },
    w: { 轴: 'z', 坐标: room.x - rw / 2, 中心: room.z, 半: rd / 2 },
    e: { 轴: 'z', 坐标: room.x + rw / 2, 中心: room.z, 半: rd / 2 },
  };
  for (const door of layout.doors ?? []) {
    // 与这场自己的门不重复记（①已经记过；而且 solid 那一侧根本不会有自己的门）
    if (door.fromRoomId === room.id || door.toRoomId === room.id) continue;
    const dw = 门洞宽(layout, door);
    // 门的**墙面**沿哪一轴走：e/w 门的墙沿 z 走，n/s 门的墙沿 x 走
    const 门墙沿Z = door.dir === 'e' || door.dir === 'w';
    for (const dir of ['n', 'e', 's', 'w']) {
      const L = 线[dir];
      const 墙沿X = L.轴 === 'x';
      // 两条线要**垂直**才谈得上相交：墙沿 x 走 ⇔ 门的墙沿 z 走
      if (墙沿X !== 门墙沿Z) continue;
      const 门的垂直坐标 = 墙沿X ? door.z : door.x;
      if (Math.abs(门的垂直坐标 - L.坐标) > dw / 2) continue;
      const 门的沿墙坐标 = 墙沿X ? door.x : door.z;
      if (Math.abs(门的沿墙坐标 - L.中心) > L.半) continue;
      洞[dir].push({ c: 门的沿墙坐标, w: dw });
    }
  }
  return 洞;
}

function pushCollider(layout, x, z, w, d) {
  layout.colliders = layout.colliders || [];
  layout.colliders.push({ x, z, hw: w / 2, hd: d / 2 });
}
