import { MAP_BOSSES } from '../game/QuestSystem.js';
import { keyText } from '../content/keyHints.js';
import { WINDING_ROUTES } from '../content/windingRoutes.js';

/** 全屏世界地图 + 迷雾 */
export class WorldMapPanel {
  constructor(game) {
    this.game = game;
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
    if (!this.game.explorationMap.isRevealed(x, z)) {
      this.game.dialog.toast('该区域尚未探索 — 靠近揭开迷雾');
      return;
    }
    if (e.shiftKey) {
      const removed = this.game.mapMarkers.removeNearest(x, z);
      if (removed) this.game.dialog.toast(`已移除：${removed.label}`);
      else this.game.dialog.toast('附近没有路点');
    } else {
      this.game.mapMarkers.add(x, z);
    }
    this.draw();
    this.updateLegend();
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    if (this.game.dungeons?.active) {
      this.game.dialog.toast(keyText('迷宫内请用小地图 ({minimap}) 查看房间'));
      return;
    }
    this.open = true;
    this.el?.classList.remove('hidden');
    document.exitPointerLock?.();
    this.draw();
    this.updateLegend();
  }

  hide() {
    this.open = false;
    this.el?.classList.add('hidden');
  }

  updateLegend() {
    if (!this.legendEl) return;
    const pct = this.game.explorationMap?.getExploredPercent?.() ?? 0;
    const ch = this.game.quests.chapter ?? 1;
    this.legendEl.innerHTML = `
      <div>探索度 <strong>${pct}%</strong> · Chapter ${ch}</div>
      <div class="wm-legend-row"><span class="dot hub"></span>枢纽</div>
      <div class="wm-legend-row"><span class="dot boss"></span>Boss 💀</div>
      <div class="wm-legend-row"><span class="dot dungeon"></span>地下城</div>
      <div class="wm-legend-row"><span class="dot rest"></span>营火</div>
      <div class="wm-legend-row"><span class="dot quest"></span>任务目标 ▲</div>
      <div class="wm-legend-row"><span class="dot marker"></span>自定义路点 ◆</div>
      <div class="wm-hint">${keyText('{worldMap} 关闭 · 点击放置路点 · Shift+点击移除 · {zonePanel} 切换导航路点')}</div>
    `;
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
      ctx.fillText(zone.name, cx + zone.center.x * scale - 20, cy + zone.center.z * scale - zone.radius * scale - 4);
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

    const dungeons = [
      { x: -190, z: 25, t: '遗城', id: 'ruin-crypt' },
      { x: -35, z: -200, t: '图书馆', id: 'forbidden-library' },
      { x: 175, z: 95, t: '裂隙', id: 'five-dim-rift' },
      { x: -230, z: -15, t: '神龛', id: 'forest-shrine' },
      { x: 28, z: 72, t: '墓穴', id: 'hub-catacombs' },
    ];
    for (const d of dungeons) {
      if (!em.isRevealed(d.x, d.z)) continue;
      ctx.fillStyle = '#bb77ff';
      ctx.beginPath();
      ctx.arc(cx + d.x * scale, cy + d.z * scale, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ddd';
      ctx.font = '9px sans-serif';
      ctx.fillText(d.t, cx + d.x * scale + 7, cy + d.z * scale + 3);
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
  }
}
