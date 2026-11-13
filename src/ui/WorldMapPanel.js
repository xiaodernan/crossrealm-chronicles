import { MAP_BOSSES } from '../game/QuestSystem.js';
import { keyText } from './keyHints.js';
import { WINDING_ROUTES } from '../content/windingRoutes.js';
import { DUNGEON_DEFS } from '../content/dungeons.js';
import { t } from '../engine/i18n.js';
import { presenceTracker, NORMALIZED_WORLD_EXTENT, resolvePresenceId } from '../online/presenceTracker.js';

/** 图例徽章：存在「在场微行者」时显示 N（探索者每按一次 F5 才知道这件事…不，开了地图就能看见） */
const presenceRow = (count, ready) => {
  if (!ready && count <= 0) return '';
  return `<div class="wm-legend-row"><span class="dot presence"></span>${t('world_map_legend_presence_fmt', { count })}</div>`;
};
/** 全屏世界地图 + 迷雾 */
export class WorldMapPanel {
  constructor(game) {
    this.game = game;
    /**
     * 光标住在哪一格（切片13）。`null` = 地图没开。
     *
     * 改前全屏地图只能鼠标点：`worldMap` 层没有 `nav` 宿主，↑↓ 在它那儿是死键，
     * 于是"在地图上选一格放下自己的路点"这件事实在不做。有了光标之后才有格可选。
     */
    this.cursor = null;
    this.open = false;
    this.el = document.getElementById('world-map-panel');
    this.canvas = document.getElementById('world-map-canvas');
    this.legendEl = document.getElementById('world-map-legend');
    document.getElementById('world-map-close')?.addEventListener('click', () => this.hide());
    this.el?.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
    this.canvas?.addEventListener('click', (e) => this._onCanvasClick(e));
    this._scale = 1;
    this._cx = 0;
    this._cy = 0;
// W-Z32 画图缓存：静态层（雾格/三环线/副本/Boss/休息点）只构建一次，300ms 自动失效；
// 动态层（玩家、光标、路点、游侠）每帧只绘制本屏 ~40 件——draw call 从 3300+/帧省到 40/帧
this._staticCanvas = null;
this._staticBuiltAt = 0;
this._staticDirty = true;
this._staticW = 0;
this._staticH = 0;
  }

  _screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const wx = (px - this._cx) / this._scale;
    const wz = (py - this._cy) / this._scale;
    return { x: wx, z: wz };
  }

  _onCanvasClick(e) {
    if (!this.open || !this.game.explorationMap) return;
    const { x, z } = this._screenToWorld(e.clientX, e.clientY);
    if (e.shiftKey) this.unmarkAt(x, z);
    else this.markAt(x, z);
  }

  /**
   * 在一个世界坐标放路点（W-D6 切片13）。
   *
   * 鼠标点击与键盘落点**共用这一句**：判据（探没探索）只写一份，否则"鼠标能点、
   * 键盘点了没反应"这类分裂迟早回来。上限不在这里判 —— `mapMarkers.add` 自己会
   * 把最旧的挪出去，上限只有一个家。
   */
  markAt(x, z) {
    if (!this.open) return false;
    if (!this.game.explorationMap?.isRevealed(x, z)) {
      this.game.dialog.toast(t('world_map_not_explored'));
      return false;
    }
    this.game.mapMarkers.add(x, z);
    this._afterMarkerEdit();
    return true;
  }

  /** 收掉某个坐标附近最近的路点。鼠标 Shift+点击与键盘落点共用这一句 */
  unmarkAt(x, z) {
    if (!this.open) return false;
    const removed = this.game.mapMarkers.removeNearest(x, z);
    this.game.dialog.toast(removed ? t('world_map_marker_removed_fmt', { label: removed.label }) : t('world_map_no_marker_nearby'));
    this._afterMarkerEdit();
    return !!removed;
  }

  /** 格号 → 世界坐标（格心）。光标住在格子里，落点那一刻才换成世界坐标 */
  _cellToWorld(gx, gz) {
    const { cell, min } = this.game.explorationMap.getGridSize();
    return { x: min + gx * cell + cell / 2, z: min + gz * cell + cell / 2 };
  }

  /** 世界坐标 → 格号（出界夹住）。与 `ExplorationMap._worldToCell` 同一个算式 */
  _worldToCell(x, z) {
    const { cell, min, gw, gh } = this.game.explorationMap.getGridSize();
    return {
      gx: Math.max(0, Math.min(gw - 1, Math.floor((x - min) / cell))),
      gz: Math.max(0, Math.min(gh - 1, Math.floor((z - min) / cell))),
    };
  }

  /**
   * 光标走一格（切片13）。
   *
   * 世界地图是全屏模态里唯一一张画布，而它此前**只能鼠标点**：`worldMap` 层没有 `nav`
   * 宿主，↑↓ 在它那儿本来就是死键（`movePanelFocus` 问不到层就返回 false）。这一片把死键接上。
   * 出界即夹住，并返回"这一下有没有真的走动" —— 按住连发时调用方要知道按没按动，
   * 也免得每一帧都重绘一张一模一样的地图。
   */
  moveCursor(dgx, dgz) {
    if (!this.open || !this.cursor || !this.game.explorationMap) return false;
    const { gw, gh } = this.game.explorationMap.getGridSize();
    const gx = Math.max(0, Math.min(gw - 1, this.cursor.gx + dgx));
    const gz = Math.max(0, Math.min(gh - 1, this.cursor.gz + dgz));
    if (gx === this.cursor.gx && gz === this.cursor.gz) return false;
    this.cursor = { gx, gz };
    this.draw();
    return true;
  }

  /** 光标处放路点。没探索过的地方不放 —— 与鼠标点击同一句判据（`markAt`） */
  markAtCursor() {
    if (!this.cursor) return false;
    const { x, z } = this._cellToWorld(this.cursor.gx, this.cursor.gz);
    return this.markAt(x, z);
  }

  /** 光标处附近收一个路点。与鼠标 Shift+点击同一个入口（`unmarkAt`） */
  unmarkAtCursor() {
    if (!this.cursor) return false;
    const { x, z } = this._cellToWorld(this.cursor.gx, this.cursor.gz);
    return this.unmarkAt(x, z);
  }

  _afterMarkerEdit() {
    this.draw();
    this.updateLegend();
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    if (this.game.dungeons?.active) {
      this.game.dialog.toast(keyText(t('world_map_in_dungeon_hint')));
      return;
    }
    this.open = true;
    this._staticDirty = true; // W-Z32：开关面板时一次性重建静态层
    // 光标从玩家脚下那一格起步：打开地图时人就站在那儿，这是最不意外的起点
    this.cursor = this.game.explorationMap
      ? this._worldToCell(this.game.player.position.x, this.game.player.position.z)
      : null;
    this.el?.classList.remove('hidden');
    document.exitPointerLock?.();
    this.draw();
    this.updateLegend();
  }

  hide() {
    this.open = false;
    this.cursor = null;
    this.el?.classList.add('hidden');
  }

  updateLegend() {
    if (!this.legendEl) return;
    const pct = this.game.explorationMap?.getExploredPercent?.() ?? 0;
    const ch = this.game.quests.chapter ?? 1;
    this.legendEl.innerHTML = `
      <div>${t('world_map_explore_label')} <strong>${pct}%</strong> · Chapter ${ch}</div>
      <div class="wm-legend-row"><span class="dot hub"></span>${t('hud_map_anchor_hub')}</div>
      <div class="wm-legend-row"><span class="dot boss"></span>Boss 💀</div>
      <div class="wm-legend-row"><span class="dot dungeon"></span>${t('journal_tab_dungeon')}</div>
      <div class="wm-legend-row"><span class="dot rest"></span>${t('upgrade_rest_default')}</div>
      <div class="wm-legend-row"><span class="dot quest"></span>${t('world_map_legend_quest')}</div>
      <div class="wm-legend-row"><span class="dot marker"></span>${t('world_map_legend_marker')}</div>
      <div class="wm-hint">${keyText(t('world_map_legend_hints'))}</div>
      ${presenceRow(presenceTracker.count(), presenceTracker.ready)}
      <div class="wm-hint">${keyText(t('world_map_legend_mouse_hint'))}</div>
    `;
  }

  /**
   * 静态层构建一次：2916 个雾格（+非 revealed 再覆一层）+ 区域环 + 路线虚线 + 副本/Boss/休息点 + 地城。
   * 只在 300ms 自动失效时重建——fog 不会一直变、POI 更慢；标脏只用在开关面板（show/hide）。
   */
  _drawStaticLayers(ctx, w, h, scale, cx, cy, grid, em) {
    ctx.fillStyle = '#0a0c12';
    ctx.fillRect(0, 0, w, h);
    for (let gz = 0; gz < grid.gh; gz++) {
      for (let gx = 0; gx < grid.gw; gx++) {
        const wx = grid.min + gx * grid.cell + grid.cell / 2;
        const wz = grid.min + gz * grid.cell + grid.cell / 2;
        const px = cx + wx * scale;
        const pz = cy + wz * scale;
        const revealed = em.revealed[gz * grid.gw + gx];
        ctx.fillStyle = revealed ? 'rgba(35,42,58,0.95)' : 'rgba(8,8,12,0.98)';
        ctx.fillRect(px - (grid.cell * scale) / 2, pz - (grid.cell * scale) / 2, grid.cell * scale + 1, grid.cell * scale + 1);
        if (!revealed) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(px - (grid.cell * scale) / 2, pz - (grid.cell * scale) / 2, grid.cell * scale + 1, grid.cell * scale + 1);
        }
      }
    }
    for (const zone of this.game.world.getZoneMapData()) {
      if (!em.isRevealed(zone.center.x, zone.center.z)) continue;
      ctx.beginPath();
      ctx.arc(cx + zone.center.x * scale, cy + zone.center.z * scale, zone.radius * scale, 0, Math.PI * 2);
      ctx.fillStyle = zone.color + '44';
      ctx.fill();
      ctx.strokeStyle = zone.color + 'aa';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '11px sans-serif';
      ctx.fillText(t(zone.name), cx + zone.center.x * scale - 20, cy + zone.center.z * scale - zone.radius * scale - 4);
    }
    ctx.strokeStyle = 'rgba(201,169,98,0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    for (const route of WINDING_ROUTES.filter((r) => r.id !== 'hub-ring')) {
      ctx.beginPath();
      route.points.forEach(([x, z], i) => {
        if (!em.isRevealed(x, z)) return;
        const px = cx + x * scale;
        const pz = cy + z * scale;
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const d of DUNGEON_DEFS) {
      if (!em.isRevealed(d.entrance.x, d.entrance.z)) continue;
      ctx.fillStyle = '#bb77ff';
      ctx.beginPath();
      ctx.arc(cx + d.entrance.x * scale, cy + d.entrance.z * scale, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ddd';
      ctx.font = '9px sans-serif';
      ctx.fillText(t(d.mapLabel), cx + d.entrance.x * scale + 7, cy + d.entrance.z * scale + 3);
    }
    for (const b of MAP_BOSSES) {
      if (!em.isRevealed(b.x, b.z)) continue;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx + b.x * scale, cy + b.z * scale, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = b.color;
      ctx.font = '10px sans-serif';
      ctx.fillText('💀', cx + b.x * scale - 6, cy + b.z * scale + 4);
    }
    for (const rp of this.game.restPoints?.points ?? []) {
      if (!em.isRevealed(rp.position.x, rp.position.z)) continue;
      ctx.fillStyle = '#ff9944';
      ctx.beginPath();
      ctx.arc(cx + rp.position.x * scale, cy + rp.position.z * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  
  }

  draw() {
    if (!this.canvas || !this.open) return;
    const ctx = this.canvas.getContext('2d');
    const w = this.canvas.width = this.canvas.clientWidth || 720;
    const h = this.canvas.height = this.canvas.clientHeight || 520;
    const em = this.game.explorationMap;
    const grid = em.getGridSize();
    const scale = Math.min(w / (grid.max - grid.min), h / (grid.max - grid.min)) * 0.88;
    const cx = w / 2;
    const cy = h / 2;
    this._scale = scale;
    this._cx = cx;
    this._cy = cy;

    // 静态层：优先走 offscreen canvas 缓存（一次性构建，300ms 轮询或开关面板时重建）；
    // 文档创建不了 canvas 时（测试/无 DOM 宿主），回退为直接画在主 ctx —— 正确性优先于性能
    const now = (typeof performance !== 'undefined' ? performance.now() : 0);
    const sizeMismatch = w !== this._staticW || h !== this._staticH;
    if (sizeMismatch || this._staticDirty || !this._staticCanvas || (now - this._staticBuiltAt) > 300) {
      let built = null;
      try {
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        const offCtx = off.getContext('2d');
        this._drawStaticLayers(offCtx, w, h, scale, cx, cy, grid, em);
        built = off;
      } catch {
        this._drawStaticLayers(ctx, w, h, scale, cx, cy, grid, em);
      }
      this._staticCanvas = built;
      this._staticBuiltAt = now;
      this._staticW = w;
      this._staticH = h;
      this._staticDirty = false;
    }
    if (this._staticCanvas) ctx.drawImage(this._staticCanvas, 0, 0);

    // 在线微行者（W-Z27/W-Z32）：月光雨落在地图上，每滴带名
    const ownId = resolvePresenceId?.() ?? null;
    for (const wanderer of presenceTracker.wanderers()) {
      if (wanderer.id === ownId) continue;
      const wx = wanderer.x * NORMALIZED_WORLD_EXTENT;
      const wz = wanderer.z * NORMALIZED_WORLD_EXTENT;
      if (!em.isRevealed(wx, wz)) continue;
      const mx = cx + wx * scale;
      const mz = cy + wz * scale;
      const glow = ctx.createRadialGradient(mx, mz, 0, mx, mz, 14);
      const tint = `hsl(${wanderer.hue ?? 45} 92% 72%)`;
      glow.addColorStop(0, tint);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(mx, mz, 14, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
      ctx.beginPath(); ctx.arc(mx, mz, 2.4, 0, Math.PI * 2); ctx.fillStyle = '#fff8e1'; ctx.fill();
      ctx.beginPath(); ctx.arc(mx, mz, 4.6, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,241,190,0.65)'; ctx.lineWidth = 1; ctx.stroke();
      if (wanderer.name) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = 'rgba(255,244,205,0.75)';
        ctx.fillText(wanderer.name, mx + 7, mz + 2);
      }
    }

    const wp = this.game.quests.getQuestWaypoint();
    if (wp && em.isRevealed(wp.x, wp.z)) {
      const wx = cx + wp.x * scale;
      const wz = cy + wp.z * scale;
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath();
      ctx.moveTo(wx, wz - 8);
      ctx.lineTo(wx + 6, wz + 5);
      ctx.lineTo(wx - 6, wz + 5);
      ctx.closePath();
      ctx.fill();
    }

    for (const mk of this.game.mapMarkers?.markers ?? []) {
      if (!em.isRevealed(mk.x, mk.z)) continue;
      const mx = cx + mk.x * scale;
      const mz = cy + mk.z * scale;
      const active = mk.id === this.game.mapMarkers.activeId;
      ctx.fillStyle = active ? '#66ddff' : '#4488aa';
      ctx.strokeStyle = active ? '#fff' : '#66ddff';
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(mx, mz - 6);
      ctx.lineTo(mx + 5, mz);
      ctx.lineTo(mx, mz + 6);
      ctx.lineTo(mx - 5, mz);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (active) {
        ctx.fillStyle = '#aaf';
        ctx.font = '8px sans-serif';
        ctx.fillText(mk.label, mx + 7, mz + 3);
      }
    }

    const p = this.game.player.position;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#66ccff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + p.x * scale, cy + p.z * scale, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this._drawCursor(ctx, cx, cy, scale, grid);
  }

  _drawCursor(ctx, cx, cy, scale, grid) {
    if (!this.cursor) return;
    const { x, z } = this._cellToWorld(this.cursor.gx, this.cursor.gz);
    const px = cx + x * scale;
    const pz = cy + z * scale;
    const half = (grid.cell * scale) / 2;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    if (!this.game.explorationMap.isRevealed(x, z)) ctx.setLineDash([4, 3]);
    ctx.strokeRect(px - half, pz - half, half * 2, half * 2);
    ctx.setLineDash([]);
    // 框里一个十字：方框说"这一格被选中"，十字说"落点会落在正中心"
    ctx.beginPath();
    ctx.moveTo(px - 5, pz);
    ctx.lineTo(px + 5, pz);
    ctx.moveTo(px, pz - 5);
    ctx.lineTo(px, pz + 5);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(x)}, ${Math.round(z)}`, px, pz + half + 12);
    ctx.restore();
  }
}
