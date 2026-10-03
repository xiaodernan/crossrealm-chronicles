/**
 * 最小可用关卡编辑器 —— 仅供开发期使用，不打包进生产版本（W-B11）。
 *
 * 功能：
 * - 房间模板选择与放置
 * - 迷宫布局可视化与编辑
 * - 导出 JSON（可被 ProceduralDungeonGenerator 读取）
 * - 基础键鼠交互：左键放置、右键删除、拖拽移动、Tab 切换模板
 */

import * as THREE from 'three';
import { ROOM_TEMPLATES, getRoomTemplate } from './RoomTemplates.js';
import { codeFor, codesFor } from '../content/keybinds.js';
import { keyLabel } from '../content/keyLabels.js';

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
    this.roomMeshes = new Map(); // room.id -> THREE.Mesh
    this.gridHelper = null;

    // 交互
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.dragTarget = null;
    this.dragOffset = new THREE.Vector2();

    // UI
    this.panel = null;
    this.templateList = null;

    this._initUI();
    this._bindEvents();
  }

  _initUI() {
    // 创建面板
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
      </div>
      <div style="font-size:11px;color:#888;">
        LMB: Place | RMB: Delete | Drag: Move | {editorCycleTemplate}: Next Template | {editorToggleGrid}: Toggle Grid
      </div>
      <input type="file" id="le-file-input" accept=".json" style="display:none;">
    `;
    document.body.appendChild(this.panel);

    this.templateList = this.panel.querySelector('#le-template-select');
    this._populateTemplates();

    // 绑定 UI 事件
    this.panel.querySelector('#le-close').addEventListener('click', () => this.toggle());
    this.panel.querySelector('#le-export').addEventListener('click', () => this.exportLayout());
    this.panel.querySelector('#le-import').addEventListener('click', () => {
      this.panel.querySelector('#le-file-input').click();
    });
    this.panel.querySelector('#le-file-input').addEventListener('change', (e) => this.importLayout(e));
    this.panel.querySelector('#le-clear').addEventListener('click', () => this.clearAll());
    this.panel.querySelector('#le-rebuild').addEventListener('click', () => this.rebuildGeometry());
    this.templateList.addEventListener('change', (e) => {
      this.selectedTemplateId = e.target.value;
    });
  }

  _populateTemplates() {
    const templates = Object.values(ROOM_TEMPLATES).sort((a, b) => a.key.localeCompare(b.key));
    this.templateList.innerHTML = templates.map(t => 
      `<option value="${t.key}" ${t.key === this.selectedTemplateId ? 'selected' : ''}>${t.key} [${t.tags.join(',')}]</option>`
    ).join('');

    // 更新面板中的按键提示（W-B11）
    if (this.panel) {
      const cycleKey = codeFor('editorCycleTemplate') ? keyLabel(codeFor('editorCycleTemplate')) : '?';
      const toggleKey = codeFor('editorToggleGrid') ? keyLabel(codeFor('editorToggleGrid')) : '?';
      const helpDiv = this.panel.querySelector('div[style*="font-size:11px"]');
      if (helpDiv) {
        helpDiv.textContent = `LMB: Place | RMB: Delete | Drag: Move | ${cycleKey}: Next Template | ${toggleKey}: Toggle Grid`;
      }
    }
  }

  _bindEvents() {
    // 鼠标
    this.domElement.addEventListener('mousedown', (e) => this._onMouseDown(e));
    this.domElement.addEventListener('mousemove', (e) => this._onMouseMove(e));
    this.domElement.addEventListener('mouseup', (e) => this._onMouseUp(e));
    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    // 键盘
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
  }

  _onMouseDown(e) {
    if (!this.enabled) return;
    if (e.button === 0) { // LMB: 放置/拖拽
      this._tryStartDrag(e);
    } else if (e.button === 2) { // RMB: 删除
      this._deleteAtPosition(e);
    }
  }

  _onMouseMove(e) {
    if (!this.enabled) return;
    this._updateMouse(e);
    this._updateGhostPosition();
    if (this.dragTarget) this._drag(e);
  }

  _onMouseUp(e) {
    if (!this.enabled) return;
    if (this.dragTarget) {
      this._endDrag(e);
    } else if (e.button === 0) {
      this._placeRoom(e);
    }
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    const code = e.code;
    // Tab: 循环切换模板
    if (code === codeFor('editorCycleTemplate')) {
      e.preventDefault();
      this._cycleTemplate(1);
    }
    // G: 切换网格显示
    else if (code === codeFor('editorToggleGrid')) {
      this._toggleGrid();
    }
    // Delete/Backspace: 删除选中房间
    else if (code === codeFor('editorDelete')) {
      this._deleteSelected();
    }
  }

  _onKeyUp(e) {}

  _updateMouse(e) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  _tryStartDrag(e) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.roomMeshes.values()).map(m => m.mesh),
      false
    );
    if (intersects.length > 0) {
      this.dragTarget = intersects[0].object.userData.roomId;
      const intersect = intersects[0];
      this.dragOffset.set(
        intersect.point.x - intersect.object.position.x,
        intersect.point.z - intersect.object.position.z
      );
    }
  }

  _drag(e) {
    this._updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersect = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersect);
    if (this.dragTarget && this.roomMeshes.has(this.dragTarget)) {
      const roomObj = this.roomMeshes.get(this.dragTarget);
      intersect.sub(new THREE.Vector2(this.dragOffset.x, this.dragOffset.y));
      // 对齐网格
      const CELL = 18;
      intersect.x = Math.round(intersect.x / CELL) * CELL;
      intersect.z = Math.round(intersect.z / CELL) * CELL;
      roomObj.mesh.position.set(intersect.x, 0, intersect.z);
      this._updateRoomPosition(this.dragTarget, intersect.x, intersect.z);
    }
  }

  _endDrag(e) {
    this.dragTarget = null;
    this.dragOffset.set(0, 0);
  }

  _placeRoom(e) {
    this._updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersect = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersect);
    
    const CELL = 18;
    const gx = Math.round(intersect.x / CELL);
    const gz = Math.round(intersect.z / CELL);

    this._addRoomAt(gx, gz, this.selectedTemplateId);
  }

  _deleteAtPosition(e) {
    this._updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.roomMeshes.values()).map(m => m.mesh),
      false
    );
    if (intersects.length > 0) {
      const roomId = intersects[0].object.userData.roomId;
      this._removeRoom(roomId);
    }
  }

  _deleteSelected() {
    if (this.dragTarget) {
      this._removeRoom(this.dragTarget);
    }
  }

  _cycleTemplate(delta) {
    const templates = Object.keys(ROOM_TEMPLATES).sort();
    const idx = templates.indexOf(this.selectedTemplateId);
    const nextIdx = (idx + delta + templates.length) % templates.length;
    this.selectedTemplateId = templates[nextIdx];
    this.templateList.value = this.selectedTemplateId;
  }

  _toggleGrid() {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper = null;
    } else {
      this.gridHelper = new THREE.GridHelper(500, 50, 0x444466, 0x222244);
      this.scene.add(this.gridHelper);
    }
  }

  _addRoomAt(gx, gz, templateKey) {
    const id = `r_${gx}_${gz}`;
    if (this.layout.rooms.some(r => r.id === id)) return;

    const template = getRoomTemplate(...templateKey.split(':'));
    const CELL = 18;
    const room = {
      id,
      gx, gz,
      x: gx * CELL,
      z: gz * CELL,
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
    this._createRoomVisual(room);
    this._updateAdjacentWalls(room);
  }

  _removeRoom(roomId) {
    const idx = this.layout.rooms.findIndex(r => r.id === roomId);
    if (idx === -1) return;
    this.layout.rooms.splice(idx, 1);
    if (this.roomMeshes.has(roomId)) {
      const obj = this.roomMeshes.get(roomId);
      this.scene.remove(obj.mesh);
      this.roomMeshes.delete(roomId);
    }
    // 更新相邻房间的墙
    this._updateAllAdjacentWalls();
  }

  _createRoomVisual(room) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ 
      color: 0x446688, 
      transparent: true, 
      opacity: 0.3,
      wireframe: true 
    });
    const geom = new THREE.BoxGeometry(room.w, 2, room.d);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(room.x, 1, room.z);
    mesh.userData.roomId = room.id;
    group.add(mesh);

    // 标签
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;color:#88f;font-size:10px;pointer-events:none;';
    label.textContent = room.id;
    group.add(label);

    this.scene.add(group);
    this.roomMeshes.set(room.id, { mesh: group, room });
  }

  _updateRoomPosition(roomId, x, z) {
    const room = this.layout.rooms.find(r => r.id === roomId);
    if (!room) return;
    room.x = x;
    room.z = z;
    room.gx = Math.round(x / 18);
    room.gz = Math.round(z / 18);
    room.id = `r_${room.gx}_${room.gz}`;
    this._updateAdjacentWalls(room);
  }

  _updateAdjacentWalls(room) {
    // 简化：标记相邻房间需要更新墙
  }

  _updateAllAdjacentWalls() {
    // 简化：全量重建墙
  }

  setLayout(layout) {
    this.layout = layout;
    this._clearVisuals();
    for (const room of layout.rooms) {
      this._createRoomVisual(room);
    }
  }

  _clearVisuals() {
    for (const [id, obj] of this.roomMeshes) {
      this.scene.remove(obj.mesh);
    }
    this.roomMeshes.clear();
  }

  exportLayout() {
    const data = {
      gridW: this.layout.gridW,
      gridH: this.layout.gridH,
      cellSize: this.layout.cellSize,
      rooms: this.layout.rooms.map(r => ({
        id: r.id,
        gx: r.gx,
        gz: r.gz,
        x: r.x,
        z: r.z,
        w: r.w,
        d: r.d,
        walls: r.walls,
        templateKey: r.templateKey,
        enemySpawns: r.enemySpawns,
        lore: r.lore,
      })),
      doors: this.layout.doors.map(d => ({
        id: d.id,
        dir: d.dir,
        x: d.x,
        z: d.z,
        fromRoomId: d.fromRoomId,
        toRoomId: d.toRoomId,
        locked: d.locked,
      })),
      seed: this.layout.seed,
    };
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

  _importLayoutData(data) {
    // 清空当前
    this._clearVisuals();
    this.layout = {
      gridW: data.gridW,
      gridH: data.gridH,
      cellSize: data.cellSize || 18,
      seed: data.seed,
      rooms: data.rooms,
      doors: data.doors,
    };
    this.setLayout(this.layout);
  }

  rebuildGeometry() {
    if (!this.layout) return;
    // 这里需要外部传入场景和 def 来重建
    console.log('Rebuild requested - call externally with scene and def');
  }

  clearAll() {
    this._clearVisuals();
    this.layout = {
      gridW: 5,
      gridH: 5,
      cellSize: 18,
      seed: Date.now(),
      rooms: [],
      doors: [],
    };
    // 重新添加 spawn 房
    this._addRoomAt(0, 0, 'hall:straight');
  }

  toggle() {
    this.enabled = !this.enabled;
    this.panel.style.display = this.enabled ? 'block' : 'none';
    if (this.enabled) {
      this._populateTemplates();
      this._toggleGrid();
    } else {
      if (this.gridHelper) {
        this.scene.remove(this.gridHelper);
        this.gridHelper = null;
      }
    }
  }

  dispose() {
    this.enabled = false;
    this.panel.remove();
    if (this.gridHelper) this.scene.remove(this.gridHelper);
    this._clearVisuals();
    // 移除事件监听器...
  }
}

// 全局访问器（仅开发环境）
if (typeof window !== 'undefined') {
  window.LevelEditor = LevelEditor;
}