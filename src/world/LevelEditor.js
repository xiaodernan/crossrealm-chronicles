/**
 * 最小可用关卡编辑器 —— 仅供开发期使用，不打包进生产版本（W-B11）。
 *
 * 功能：
 * - 房间模板选择与放置
 * - 迷宫布局可视化与编辑
 * - 导出 JSON（可被 ProceduralDungeonGenerator 读取）
 * - 基础键鼠交互：左键放置、右键删除、拖拽移动、Tab 切换模板
 *
 * ## 切片1：墙与门不写在这里（修 B86/B88/B89/B90/B91/B92）
 * 动手前的七组读数（`.tmp-20261006/wb11s1-census.mjs` 与 `census2.mjs`，两份 `.log` 同目录）：
 * - ① 编辑器自己放的 3 间房**四面全实、`doors` 恒为 `[]`** ⇒ 面板上那句"导出 JSON（可被
 *   ProceduralDungeonGenerator 读取）"导出的是一排封死的盒子：无门可开、无路可走。
 *   根因是规则被**抄成了字面量**：`walls: { n: true, e: true, s: true, w: true }` 再加上两个
 *   空壳函数 `_updateAdjacentWalls` / `_updateAllAdjacentWalls`（注释写着"简化：…"，函数体是空的）。
 * - ② 导入真迷宫（36 间 35 扇）后删一间度数最大的房：**35 扇门一扇没动**，其中 3 扇指着已经不
 *   存在的房间；邻居那三面"曾经朝它开着"的旗标原样留着，几何层照旧在那一面墙上开洞 ——
 *   墙上一个豁口，外面是虚空。
 * - ③ 把 `r_2_2` 往东挪一个格长：数据落到 `(0, −18)`、改名 `r_0_-1`（**B86**：两套坐标口径 ——
 *   生成器按 `(gx − gridW/2) * cellSize` 网格居中放房，编辑器按 `round(x / cellSize)` 原点格反推，
 *   两条差 gridW/2 格），门一扇没跟着搬，于是那两端悬空；而且**能拖出网格**。
 * - ④ 对着房心按下左键：`dragTarget` 仍是 `null`。射线打的是 `roomMeshes` 里那支 **Group**
 *   而不是子盒（`intersectObjects(靶, false)` 对 Group 恒 0 中）—— 同一个错在删除那发也有一份，
 *   所以**鼠标既拖不动也删不掉任何一间房**，只有测试手设 `dragTarget` 才看得见拖动这条路。
 * - ⑤ 启用后动一下鼠标：`TypeError: this._updateGhostPosition is not a function`。面板上写着
 *   "LMB: Place"，而放置预览这个函数**从来没有被写过**（**B90**）。
 * - ⑥ 每间房 `group.add(label)` 塞一支 DOM `<div>` 进 `THREE.Group`：three 为这一句记一条
 *   `console.error`，标签既没进 three 也没进界面（6 间房 = 6 条 error + 0 张标签）；
 *   `_clearVisuals` 与 `dispose` 各释放 **0** 份资源（6 间房 = 12 份几何+材质泄漏）。
 * - ⑦ 拿编辑器导出的载荷直接 `buildGeometry`：`TypeError: 布局缺少的尺寸字段：wallH、wallT`
 *   —— 切片4f 把"尺寸事实的载体在 `layout` 上"立成合同之后，导出的载荷只带了六枚里的三枚（**B89**）。
 *
 * ## 这一片的四条口径
 * 1. **墙与门由占用推导，规则只有一份**：`MazeLayout.reconcileOccupancy` —— 生成器造门问它，
 *    编辑器每次改动之后也问它。编辑器这一侧不再自己写"哪一面是墙"。
 *    放置这个动作自带连通（`_开向邻居`：那一边邻着一间房就开门），因为工具的意义就是
 *    "摆几间房连成一座关"；而**导入**只推导不改写（生成的迷宫两侧旗标本就成对，门名单摘要
 *    `e298c99d5619d7d0` 逐字节不变），所以它不会把回溯树抹成满格网格。
 * 2. **坐标口径只有一对函数**：`cellCenter` / `cellIndex`（吃 `layout.gridW/gridH/cellSize`）。
 *    放置、拖动、反推格号、网格辅助线全部问它们，B86 因此没有第三条路可漂。
 * 3. **画面摆在数据说的那个位置**：`Group` 就是那间房（`group.position = (room.x, 0, room.z)`），
 *    盒子在 `Group` 里只抬到 `房盒高/2`；改名同时换 `roomMeshes` 的键与 `userData.roomId`。
 *    拖动被拒绝（那格已有房 / 出了网格）时**数据与图都不动** —— B88 的"图在动数据不动"
 *    正是这两件事分别算出来的。
 * 4. **编辑器的可视化全部来自共享库**：房间盒走 `sharedBox` / `dungeonMaterial('editor:room')`，
 *    删除走 `disposeDungeonSubtree`（它**跳过**共享的那几份）。于是"忘了释放"在构造上不可能，
 *    而"顺手把副本共用的几何释放掉"（B76 的另一种死法）由同一条跳过挡住。
 *
 * ## 这一片**没有**动的两件事（已登记，见台账）
 * - Boss 场那 9 扇门仍然站在邻居的格线上（±9 而不是 ±17）、Boss 场自己 5 米的洞上没有门板 ——
 *   那是 B85 的形状问题。占用推导把门位写成"两房房心中正"，对生成的迷宫与改前逐毫米相同，
 *   所以 B85 原样留着，没有借重构偷偷改它。
 * - 编辑器还不画墙与门洞（只有房盒与标签）。把"每面墙 / 每个洞"画进视口需要一段能被副本与
 *   编辑器共用的墙段实现，那是切片2。
 */

import * as THREE from 'three';
import { ROOM_TEMPLATES, getRoomTemplate } from './RoomTemplates.js';
import {
  CELL, BOSS_CELL, WALL_H, WALL_T, DOOR_WIDTH, BOSS_DOOR_WIDTH,
} from './dungeonDimensions.js';
import {
  DIR_STEP, DIR_OPPOSITE, DIRS, cellCenter, cellIndex, reconcileOccupancy,
} from './MazeLayout.js';
import { sharedBox, dungeonMaterial, disposeDungeonSubtree } from './dungeonAssets.js';
import { codeFor } from '../content/keybinds.js';
import { keyLabel } from '../content/keyLabels.js';

/** 编辑器里那间房的方块高度（米）。这是**视图**用的数，不是房间的尺寸事实 */
const ROOM_BOX_H = 2;
/**
 * 布局必须带全的六枚尺寸载体（切片4f 立的合同："尺寸事实声明在 `dungeonDimensions`，
 * 运行时载体在 `layout` 上"）。名册与回落值都只在这里写一次 —— 导入、清场、导出载荷
 * 三处都从这一张表走，于是"导出只带其中三枚"（B89）这种漂移没有第三条路可走。
 */
export const LAYOUT_SIZE_CARRIERS = {
  cellSize: CELL,
  bossCell: BOSS_CELL,
  wallH: WALL_H,
  wallT: WALL_T,
  doorWidth: DOOR_WIDTH,
  bossDoorWidth: BOSS_DOOR_WIDTH,
};
const 载体名册 = Object.keys(LAYOUT_SIZE_CARRIERS);

export class LevelEditor {
  constructor(scene, camera, renderer, domElement) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.domElement = domElement;
    this.enabled = false;

    // 状态
    this.layout = null;
    this.selectedTemplateId = 'chamber:square';
    this.ghostMesh = null;
    this.roomMeshes = new Map(); // room.id -> { mesh: THREE.Group, room, label }
    this.gridHelper = null;
    this.colliderMeshes = []; // Array of collider meshes for toggle visibility
    this.showColliders = false;

    // 交互
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragTarget = null;
    this.dragOffset = new THREE.Vector2();
    // mousemove 是 60 次/秒的一条路，平面与命中点提到实例上复用而不是每次 new
    this._地面 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._命中点 = new THREE.Vector3();
    this._投影点 = new THREE.Vector3();

    // UI
    this.panel = null;
    this.templateList = null;
    this.labelLayer = null;
    this._监听 = []; // [target, type, handler] —— dispose 要能逐条摘掉

    this._initUI();
    this._bindEvents();
  }

  /* ===== 界面 ===== */

  _initUI() {
    this.panel = document.createElement('div');
    this.panel.id = 'level-editor-panel';
    this.panel.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 280px;
      background: rgba(20,20,30,0.95); border: 1px solid #444;
      border-radius: 6px; padding: 12px; color: #ddd;
      font-family: monospace; font-size: 12px; z-index: 10000;
      display: none;
    `;
    this.panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>Level Editor (Dev)</strong>
        <button id="le-close" style="background:none;border:none;color:#888;cursor:pointer;">×</button>
      </div>
      <div style="margin-bottom:8px;">
        <label>Template: </label>
        <select id="le-template-select" style="width:100%;background:#222;border:1px solid #444;color:#ddd;padding:4px;"></select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;">
        <button id="le-export" style="background:#335;border:none;color:#ddd;padding:6px;cursor:pointer;">Export JSON</button>
        <button id="le-import" style="background:#335;border:none;color:#ddd;padding:6px;cursor:pointer;">Import JSON</button>
        <button id="le-clear" style="background:#533;border:none;color:#ddd;padding:6px;cursor:pointer;">Clear All</button>
        <button id="le-rebuild" style="background:#353;border:none;color:#ddd;padding:6px;cursor:pointer;">Rebuild Geometry</button>
        <button id="le-colliders" style="background:#535;border:none;color:#ddd;padding:6px;cursor:pointer;grid-column:span 2;">Toggle Colliders</button>
      </div>
      <div style="font-size:11px;color:#888;">
        LMB: Place | RMB: Delete | Drag: Move | {editorCycleTemplate}: Next Template | {editorToggleGrid}: Toggle Grid
      </div>
      <input type="file" id="le-file-input" accept=".json" style="display:none;">
    `;
    document.body.appendChild(this.panel);

    // 标签层：房间号是 DOM，不是 three 的对象 —— 改前那些 div 被 `group.add()` 塞进几何树，
    // three 为每一句记一条 console.error，而标签一张也没进界面（读数 ⑥）。
    this.labelLayer = document.createElement('div');
    this.labelLayer.id = 'level-editor-labels';
    this.labelLayer.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:9999;display:none;';
    document.body.appendChild(this.labelLayer);

    this.templateList = this.panel.querySelector('#le-template-select');
    this._populateTemplates();

    this.panel.querySelector('#le-close').addEventListener('click', () => this.toggle());
    this.panel.querySelector('#le-export').addEventListener('click', () => this.exportLayout());
    this.panel.querySelector('#le-import').addEventListener('click', () => {
      this.panel.querySelector('#le-file-input').click();
    });
    this.panel.querySelector('#le-file-input').addEventListener('change', (e) => this.importLayout(e));
    this.panel.querySelector('#le-clear').addEventListener('click', () => this.clearAll());
    this.panel.querySelector('#le-rebuild').addEventListener('click', () => this.rebuildGeometry());
    this.panel.querySelector('#le-colliders').addEventListener('click', () => this.toggleColliders());
    this.templateList.addEventListener('change', (e) => {
      this.selectedTemplateId = e.target.value;
      this._更新幽灵();
    });
  }

  _populateTemplates() {
    const templates = Object.values(ROOM_TEMPLATES).sort((a, b) => a.key.localeCompare(b.key));
    this.templateList.innerHTML = templates.map((t) =>
      `<option value="${t.key}" ${t.key === this.selectedTemplateId ? 'selected' : ''}>${t.key} [${t.tags.join(',')}]</option>`
    ).join('');

    if (this.panel) {
      const cycleKey = codeFor('editorCycleTemplate') ? keyLabel(codeFor('editorCycleTemplate')) : '?';
      const toggleKey = codeFor('editorToggleGrid') ? keyLabel(codeFor('editorToggleGrid')) : '?';
      const helpDiv = this.panel.querySelector('div[style*="font-size:11px"]');
      if (helpDiv) {
        helpDiv.textContent = `LMB: Place | RMB: Delete | Drag: Move | ${cycleKey}: Next Template | ${toggleKey}: Toggle Grid`;
      }
    }
  }

  _监听器(target, type, handler) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler);
    this._监听.push([target, type, handler]);
  }

  _bindEvents() {
    this._监听器(this.domElement, 'mousedown', (e) => this._onMouseDown(e));
    this._监听器(this.domElement, 'mousemove', (e) => this._onMouseMove(e));
    this._监听器(this.domElement, 'mouseup', (e) => this._onMouseUp(e));
    this._监听器(this.domElement, 'contextmenu', (e) => e.preventDefault());
    const win = typeof window !== 'undefined' ? window : null;
    if (typeof win?.addEventListener !== 'function') return;
    // keydown 直接写出来、不走 `_监听器`：全仓"谁在听 keydown"由 tests/overlay-stack.test.js
    // 按这一处字面量点数（四处：输入记录、音频解锁、改绑捕获、关卡编辑器）。
    const 处理按键 = (e) => this._onKeyDown(e);
    win.addEventListener('keydown', 处理按键);
    this._监听.push([win, 'keydown', 处理按键]);
  }

  /* ===== 指针 ===== */

  _onMouseDown(e) {
    if (!this.enabled) return;
    if (e.button === 0) {
      this._tryStartDrag(e);
    } else if (e.button === 2) {
      this._deleteAtPosition(e);
    }
  }

  _onMouseMove(e) {
    if (!this.enabled) return;
    this._updateMouse(e);
    if (this.dragTarget) this._drag(e);
    else this._更新幽灵();
  }

  _onMouseUp(e) {
    if (!this.enabled) return;
    if (this.dragTarget) {
      this._endDrag(e);
    } else if (e.button === 0) {
      this._placeRoom(e);
    }
    this._更新幽灵();
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    const code = e.code;
    if (code === codeFor('editorCycleTemplate')) {
      e.preventDefault();
      this._cycleTemplate(1);
    } else if (code === codeFor('editorToggleGrid')) {
      this._toggleGrid();
    } else if (code === codeFor('editorDelete')) {
      this._deleteSelected();
    }
  }

  _updateMouse(e) {
    const rect = this.domElement?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return;
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /** 射线与地平面的交点（米）；相机与地平面平行时没有交点 */
  _射线落地面() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    return this.raycaster.ray.intersectPlane(this._地面, this._命中点) ? this._命中点 : null;
  }

  /** 世界坐标 → 吸附到这一份布局的格线（口径只有 `cellCenter` / `cellIndex` 这一对） */
  _吸附格(x, z) {
    const gx = cellIndex(x, this.layout.gridW, this.layout.cellSize);
    const gz = cellIndex(z, this.layout.gridH, this.layout.cellSize);
    return {
      gx, gz,
      x: cellCenter(gx, this.layout.gridW, this.layout.cellSize),
      z: cellCenter(gz, this.layout.gridH, this.layout.cellSize),
    };
  }

  _指针落格() {
    const 点 = this._射线落地面();
    return 点 ? this._吸附格(点.x, 点.z) : null;
  }

  /**
   * 射到的是子盒，认领的是那一间房：沿 parent 走到带 `userData.roomId` 的那一层。
   * 改前这里是 `intersectObjects(Groups, false)` —— 对 Group 恒 0 中，所以鼠标抓不住也删不掉
   * 任何一间房（读数 ④）。
   */
  _拾取房号() {
    const 靶 = [];
    for (const 记录 of this.roomMeshes.values()) 靶.push(记录.mesh);
    if (!靶.length) return null;
    // 射线要的是**当前**世界矩阵：刚搬过、还没渲染的那一帧里 `matrixWorld` 还是上一帧的，
    // 于是"抓起来的是隔壁那间"。编辑器的画面只在 `this.scene` 这一支上，刷新一次不贵。
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const 命中 = this.raycaster.intersectObjects(靶, true);
    if (!命中.length) return null;
    let 物 = 命中[0].object;
    while (物 && 物.userData.roomId === undefined) 物 = 物.parent;
    return 物 ? 物.userData.roomId : null;
  }

  _tryStartDrag(e) {
    this._updateMouse(e);
    const 房号 = this._拾取房号();
    if (!房号) return;
    const 记录 = this.roomMeshes.get(房号);
    if (!记录) return;
    const 点 = this._射线落地面();
    if (!点) return;
    this.dragTarget = 房号;
    // 抓点偏移 = 命中点 − 房心。B88 之后"房心"既是数据也是图，所以这一发数在 `_drag` 里
    // 减掉的和加回的是同一个口径；改前减的是 `intersect.object.position`（子盒的**局部**位置 (0,1,0)）。
    this.dragOffset.set(点.x - 记录.room.x, 点.z - 记录.room.z);
  }

  _drag(e) {
    this._updateMouse(e);
    if (!this.dragTarget) return;
    const 记录 = this.roomMeshes.get(this.dragTarget);
    if (!记录) { this.dragTarget = null; return; }
    const 点 = this._射线落地面();
    if (!点) return;
    // 只写这一处：`_updateRoomPosition` 同生同死地搬数据与图，被拒绝时两边都不动 ——
    // B88 的"图在动、数据不动"正是这两件事分别算出来的。
    this._updateRoomPosition(记录.room.id, 点.x - this.dragOffset.x, 点.z - this.dragOffset.y);
  }

  _endDrag() {
    this.dragTarget = null;
    this.dragOffset.set(0, 0);
    this._重建墙与门();
    this._刷新();
  }

  _placeRoom(e) {
    this._updateMouse(e);
    const 落 = this._指针落格();
    if (!落) return;
    this._addRoomAt(落.gx, 落.gz, this.selectedTemplateId);
  }

  _deleteAtPosition(e) {
    this._updateMouse(e);
    const 房号 = this._拾取房号();
    if (房号) this._removeRoom(房号);
  }

  _deleteSelected() {
    if (this.dragTarget) this._removeRoom(this.dragTarget);
  }

  _cycleTemplate(delta) {
    const templates = Object.keys(ROOM_TEMPLATES).sort();
    const idx = templates.indexOf(this.selectedTemplateId);
    const nextIdx = (idx + delta + templates.length) % templates.length;
    this.selectedTemplateId = templates[nextIdx];
    this.templateList.value = this.selectedTemplateId;
    this._更新幽灵();
  }

  _当前模板() {
    const [id, variant] = (this.selectedTemplateId ?? '').split(':');
    return getRoomTemplate(id, variant);
  }

  /* ===== 占用与坐标（规则本体在 `MazeLayout.reconcileOccupancy`） ===== */

  _在网格里(gx, gz) {
    return gx >= 0 && gx < this.layout.gridW && gz >= 0 && gz < this.layout.gridH;
  }

  _格子被占(gx, gz, 除了) {
    return this.layout.rooms.some((r) => r !== 除了 && r.gx === gx && r.gz === gz);
  }

  /** 每次改动之后都问一遍规则：旗标归一、门名单重导（`previousDoors` 只用来继承 open/locked） */
  _重建墙与门() {
    this.layout.doors = reconcileOccupancy(this.layout.rooms, this.layout.doors ?? []);
  }

  /** 放置自带连通：那一边邻着一间房就把两面旗标一起开（规则的另一侧由 `_重建墙与门` 兜） */
  _开向邻居(room) {
    for (const dir of DIRS) {
      const [dx, dz] = DIR_STEP[dir];
      const nb = this.layout.rooms.find((r) => r.gx === room.gx + dx && r.gz === room.gz + dz);
      if (!nb) continue;
      room.walls[dir] = false;
      nb.walls[DIR_OPPOSITE[dir]] = false;
    }
  }

  _addRoomAt(gx, gz, templateKey) {
    if (!this.layout) return null;
    if (!this._在网格里(gx, gz)) return null;
    const id = `r_${gx}_${gz}`;
    if (this.layout.rooms.some((r) => r.id === id)) return null;

    const [tplId, variant] = templateKey.split(':');
    const template = getRoomTemplate(tplId, variant);
    if (!template) {
      throw new TypeError(
        `编辑器要放一间 ${templateKey}，模板库里没有这一名 —— 认不出就抛，不放一间默认房（W-B11 切片1）`
      );
    }
    const room = {
      id, gx, gz,
      x: cellCenter(gx, this.layout.gridW, this.layout.cellSize),
      z: cellCenter(gz, this.layout.gridH, this.layout.cellSize),
      w: template.width,
      d: template.depth,
      walls: { n: true, e: true, s: true, w: true },
      cleared: false,
      visited: false,
      hasEnemies: true,
      enemySpawns: [],
      lore: null,
      templateKey,
    };
    this.layout.rooms.push(room);
    this._开向邻居(room);
    this._重建墙与门();
    this._刷新();
    return room;
  }

  _removeRoom(roomId) {
    if (!this.layout) return;
    const idx = this.layout.rooms.findIndex((r) => r.id === roomId);
    if (idx === -1) return;
    this.layout.rooms.splice(idx, 1);
    // 与这间隔开的那几面由 `_重建墙与门` 收回成实墙，指向它的门由同一次推导消失 ——
    // 改前这两件事各有一处"简化"注释与一个空函数体，于是 3 扇门悬空、3 面墙开洞朝天（读数 ②）。
    this._重建墙与门();
    this._刷新();
  }

  /**
   * 把房间挪到世界坐标 (x, z) 所落的那一格 —— **数据与图的唯一写入口**。
   * 拒绝两种落点：出了网格、那格已有别的房；拒绝时返回 false 且两边都不动。
   * 改名是同生同死的：`roomMeshes` 的键、`Group.userData.roomId`、标签文字、画面位置一起走（B88）。
   */
  _updateRoomPosition(roomId, x, z) {
    const room = this.layout.rooms.find((r) => r.id === roomId);
    if (!room) return false;
    const gx = cellIndex(x, this.layout.gridW, this.layout.cellSize);
    const gz = cellIndex(z, this.layout.gridH, this.layout.cellSize);
    if (!this._在网格里(gx, gz)) return false;
    if (this._格子被占(gx, gz, room)) return false;
    room.gx = gx;
    room.gz = gz;
    room.x = cellCenter(gx, this.layout.gridW, this.layout.cellSize);
    room.z = cellCenter(gz, this.layout.gridH, this.layout.cellSize);
    const 新id = `r_${gx}_${gz}`;
    if (新id !== room.id) this._改名(room, 新id);
    this._摆可视化(room);
    return true;
  }

  _改名(room, 新id) {
    const 旧id = room.id;
    room.id = 新id;
    const 记录 = this.roomMeshes.get(旧id);
    if (!记录) return;
    this.roomMeshes.delete(旧id);
    this.roomMeshes.set(新id, 记录);
    记录.mesh.userData.roomId = 新id;
    if (记录.label) 记录.label.textContent = 新id;
  }

  /* ===== 可视化 ===== */

  _createRoomVisual(room) {
    // Group 就是那间房：摆在房心，盒子只在自己 locally 抬起来半个高 ——
    // 改前 Group 被 `_drag` 搬到落点、盒子又按房间坐标摆在自己 inside，于是画面落在
    // "落点 + 原位置"，一格起步（B88 的双重偏移，实测数据 (50,50) / 图 (75,75)）。
    const group = new THREE.Group();
    group.position.set(room.x, 0, room.z);
    group.userData.roomId = room.id;
    const mesh = new THREE.Mesh(
      sharedBox(room.w, ROOM_BOX_H, room.d),
      dungeonMaterial('editor:room', () => new THREE.MeshBasicMaterial({
        color: 0x446688, transparent: true, opacity: 0.3, wireframe: true,
      })),
    );
    mesh.position.set(0, ROOM_BOX_H / 2, 0);
    group.add(mesh);
    this.scene.add(group);

    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;color:#88f;font-size:10px;pointer-events:none;';
    label.textContent = room.id;
    this.labelLayer?.appendChild(label);

    this.roomMeshes.set(room.id, { mesh: group, room, label });
  }

  /** 画面跟着数据走：只有这一处写 Group 的位置 */
  _摆可视化(room) {
    const 记录 = this.roomMeshes.get(room.id);
    if (!记录) return;
    记录.mesh.position.set(room.x, 0, room.z);
  }

  _更新标签() {
    if (!this.labelLayer || !this.camera) return;
    const rect = this.domElement?.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return;
    for (const [房号, 记录] of this.roomMeshes) {
      if (!记录.label) continue;
      const p = this._投影点.set(记录.room.x, ROOM_BOX_H, 记录.room.z).project(this.camera);
      记录.label.textContent = 房号;
      记录.label.style.left = `${(rect.left + ((p.x + 1) / 2) * rect.width).toFixed(1)}px`;
      记录.label.style.top = `${(rect.top + ((1 - p.y) / 2) * rect.height).toFixed(1)}px`;
      记录.label.style.display = 房号 === this.dragTarget ? 'none' : 'block';
    }
  }

  /** 放置预览：面板上写着 "LMB: Place"，那这条预览就得真的存在（B90） */
  _更新幽灵() {
    if (!this.scene) return;
    const tpl = this._当前模板();
    if (!tpl) return;
    if (!this.ghostMesh) {
      this.ghostMesh = new THREE.Mesh(
        sharedBox(tpl.width, ROOM_BOX_H, tpl.depth),
        dungeonMaterial('editor:ghost', () => new THREE.MeshBasicMaterial({
          color: 0x66cc88, transparent: true, opacity: 0.18, wireframe: true,
        })),
      );
      this.ghostMesh.name = 'editor-ghost';
      this.scene.add(this.ghostMesh);
    } else {
      const 该用 = sharedBox(tpl.width, ROOM_BOX_H, tpl.depth);
      if (this.ghostMesh.geometry !== 该用) this.ghostMesh.geometry = 该用;
    }
    this.ghostMesh.visible = false;
    if (!this.enabled || !this.layout || this.dragTarget) return;
    const 落 = this._指针落格();
    if (!落) return;
    if (!this._在网格里(落.gx, 落.gz) || this._格子被占(落.gx, 落.gz)) return;
    this.ghostMesh.position.set(落.x, ROOM_BOX_H / 2, 落.z);
    this.ghostMesh.visible = true;
  }

  _刷新() {
    this._clearVisuals();
    if (!this.layout) return;
    for (const room of this.layout.rooms) this._createRoomVisual(room);
    this._更新标签();
  }

  _clearVisuals() {
    for (const [, 记录] of this.roomMeshes) {
      记录.label?.remove?.();
      if (记录.mesh.parent) 记录.mesh.parent.remove(记录.mesh);
      // 只释放不属于共享库的那几份：编辑器与副本共用一份几何库，无差别 dispose 会让
      // "清一次编辑器的画"毁掉六座别的地面的几何（B76 的另一半）。
      disposeDungeonSubtree(记录.mesh);
    }
    this.roomMeshes.clear();
    // 碰撞体也要跟着清
    this._clearColliders();
  }

  /** 清除所有碰撞体可视化 */
  _clearColliders() {
    for (const mesh of this.colliderMeshes) {
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.geometry?.dispose();
      mesh.material?.dispose();
    }
    this.colliderMeshes = [];
  }

  /** 重建碰撞体可视化（从 layout.colliders 读取） */
  _buildColliders() {
    this._clearColliders();
    if (!this.layout || !this.layout.colliders?.length) return;
    
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4444,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
    });
    
    for (const col of this.layout.colliders) {
      const geo = new THREE.BoxGeometry(col.hw * 2, 3, col.hd * 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(col.x, 1.5, col.z);
      this.scene.add(mesh);
      this.colliderMeshes.push(mesh);
    }
  }

  /** 切换碰撞体显示/隐藏 */
  toggleColliders() {
    this.showColliders = !this.showColliders;
    if (this.showColliders) {
      this._buildColliders();
    } else {
      this._clearColliders();
    }
  }

  _toggleGrid() {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
      this.gridHelper = null;
      return;
    }
    // 网格辅助线按**这一份布局**的格线画：size = gridW * cellSize、分格数 = gridW，
    // 于是画面上那些线就是 `cellCenter` 说的那些格子 —— 它是 B86  folding 之后最便宜的一把尺。
    const 格数 = this.layout?.gridW ?? 5;
    const 格长 = this.layout?.cellSize ?? CELL;
    this.gridHelper = new THREE.GridHelper(格数 * 格长, 格数, 0x444466, 0x222244);
    this.scene.add(this.gridHelper);
  }

  /* ===== 布局进出 ===== */

  setLayout(layout) {
    this.layout = layout;
    this._重建墙与门();
    this._刷新();
  }

  /**
   * 导入布局时读一枚尺寸：缺（`undefined` / `null`）才回落到声明那一份，
   * 带来了就必须是**有限正数**（格数还得是整数），否则当场点名是哪一枚 —— `||` 会把 0 悄悄
   * 变成 18，`??` 会把 0 原样收下再让吸附除出 Infinity，两种都比抛错难查（切片4f，⑤ 层）。
   */
  _读尺寸(名, 值, 默认, 要整数 = false) {
    if (值 === undefined || 值 === null) return 默认;
    if (typeof 值 !== 'number' || !Number.isFinite(值) || 值 <= 0
      || (要整数 && !Number.isInteger(值))) {
      throw new TypeError(`导入的布局里 ${名} = ${JSON.stringify(值)} —— 得是有限正数${要整数 ? '整数' : ''}，或者干脆不带（那就用声明的那一份）`);
    }
    return 值;
  }

  _importLayoutData(data) {
    this._clearVisuals();
    const 布局 = {
      gridW: this._读尺寸('gridW', data.gridW, 5, true),
      gridH: this._读尺寸('gridH', data.gridH, 5, true),
      seed: data.seed,
      rooms: data.rooms ?? [],
      doors: data.doors ?? [],
    };
    // 缺某枚载体才回落到声明的那一份；带来了就**照它走**。切片4f 立的合同是"六枚都在布局上"，
    // 而改前的导入只接其中三枚，于是导出的载荷送回 `buildGeometry` 就抛（读数 ⑦，B89）。
    for (const 名 of 载体名册) 布局[名] = this._读尺寸(名, data[名], LAYOUT_SIZE_CARRIERS[名]);
    this.layout = 布局;
    this.setLayout(this.layout);
  }

  /** 导出的那份载荷：面板按钮与门禁用例读同一个对象，两边不会各说一套 */
  _导出载荷() {
    const 尺寸 = {};
    for (const 名 of 载体名册) 尺寸[名] = this.layout[名];
    return {
      gridW: this.layout.gridW,
      gridH: this.layout.gridH,
      ...尺寸,
      rooms: this.layout.rooms.map((r) => ({
        id: r.id,
        gx: r.gx,
        gz: r.gz,
        x: r.x,
        z: r.z,
        w: r.w,
        d: r.d,
        walls: { n: r.walls.n, e: r.walls.e, s: r.walls.s, w: r.walls.w },
        templateKey: r.templateKey,
        enemySpawns: r.enemySpawns,
        lore: r.lore,
      })),
      doors: this.layout.doors.map((d) => ({
        id: d.id,
        dir: d.dir,
        x: d.x,
        z: d.z,
        fromRoomId: d.fromRoomId,
        toRoomId: d.toRoomId,
        locked: d.locked,
        open: d.open,
      })),
      seed: this.layout.seed,
    };
  }

  exportLayout() {
    const data = this._导出载荷();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dungeon-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importLayout(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this._importLayoutData(data);
      } catch (err) {
        console.error('Import failed:', err);
      }
    };
    reader.readAsText(file);
  }

  /** 手动改过 JSON / 想重导一次占用推导时用这一枚（也是面板上那个 Rebuild Geometry） */
  rebuildGeometry() {
    if (!this.layout) return;
    this._重建墙与门();
    this._刷新();
  }

  clearAll() {
    this._clearVisuals();
    this.layout = {
      gridW: 5,
      gridH: 5,
      ...LAYOUT_SIZE_CARRIERS,
      seed: Date.now(),
      rooms: [],
      doors: [],
    };
    // 开局那间放在正中央那一格：`_在网格里` 与 `cellCenter` 都按 gridW/2 居中口径说话
    this._addRoomAt(Math.floor(this.layout.gridW / 2), Math.floor(this.layout.gridH / 2), 'chamber:square');
  }

  toggle() {
    this.enabled = !this.enabled;
    this.panel.style.display = this.enabled ? 'block' : 'none';
    if (this.labelLayer) this.labelLayer.style.display = this.enabled ? 'block' : 'none';
    if (this.enabled) {
      this._populateTemplates();
      if (!this.gridHelper) this._toggleGrid();
      this._刷新();
    } else {
      if (this.gridHelper) {
        this.scene.remove(this.gridHelper);
        this.gridHelper.dispose();
        this.gridHelper = null;
      }
      if (this.ghostMesh) this.ghostMesh.visible = false;
    }
  }

  dispose() {
    this.enabled = false;
    for (const [target, type, handler] of this._监听) {
      if (typeof target.removeEventListener === 'function') target.removeEventListener(type, handler);
    }
    this._监听.length = 0;
    this.panel?.remove?.();
    this.labelLayer?.remove?.();
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper.dispose();
      this.gridHelper = null;
    }
    if (this.ghostMesh) {
      this.scene.remove(this.ghostMesh);
      // 幽灵的几何与材质都来自共享库，所以这里只摘下来，不释放（释放它等于毁掉副本的地面）
      this.ghostMesh = null;
    }
    this._clearVisuals();
  }
}

// 全局访问器（仅开发环境）
if (typeof window !== 'undefined') {
  window.LevelEditor = LevelEditor;
}
