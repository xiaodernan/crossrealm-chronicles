import { MAP_BOSSES } from './QuestSystem.js';

const CELL = 12;
const MIN = -320;
const MAX = 320;
const GW = Math.ceil((MAX - MIN) / CELL);
const GH = GW;

/** 世界迷雾探索 — 全屏地图数据 */
export class ExplorationMap {
  constructor(game) {
    this.game = game;
    this.revealed = new Uint8Array(GW * GH);
    this.zoneRevealed = new Set();
    this.poiRevealed = new Set();
    this.dungeonRevealed = new Set(['ruin-crypt', 'forbidden-library', 'five-dim-rift']);
  }

  _idx(gx, gz) {
    return gz * GW + gx;
  }

  _worldToCell(x, z) {
    const gx = Math.floor((x - MIN) / CELL);
    const gz = Math.floor((z - MIN) / CELL);
    return {
      gx: Math.max(0, Math.min(GW - 1, gx)),
      gz: Math.max(0, Math.min(GH - 1, gz)),
    };
  }

  revealAt(x, z, radius = 22) {
    const { gx: cx, gz: cz } = this._worldToCell(x, z);
    const r = Math.ceil(radius / CELL);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1) continue;
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gz < 0 || gx >= GW || gz >= GH) continue;
        this.revealed[this._idx(gx, gz)] = 1;
      }
    }
  }

  revealZone(zoneId) {
    if (this.zoneRevealed.has(zoneId)) return;
    this.zoneRevealed.add(zoneId);
    const centers = {
      hub: { x: 0, z: 55, r: 50 },
      fantasy: { x: -200, z: 0, r: 90 },
      magic: { x: 0, z: -180, r: 85 },
      space: { x: 200, z: 80, r: 90 },
      void: { x: 0, z: 220, r: 85 },
      abyss: { x: -200, z: 220, r: 85 },
    };
    const c = centers[zoneId];
    if (c) this.revealAt(c.x, c.z, c.r);
  }

  revealPoi(id, x, z) {
    if (this.poiRevealed.has(id)) return;
    this.poiRevealed.add(id);
    this.revealAt(x, z, 18);
  }

  revealDungeon(id, x, z) {
    if (this.dungeonRevealed.has(id)) return;
    this.dungeonRevealed.add(id);
    this.revealAt(x, z, 25);
  }

  getExploredPercent() {
    let n = 0;
    for (let i = 0; i < this.revealed.length; i++) if (this.revealed[i]) n++;
    return Math.round((n / this.revealed.length) * 100);
  }

  isRevealed(x, z) {
    const { gx, gz } = this._worldToCell(x, z);
    return this.revealed[this._idx(gx, gz)] === 1;
  }

  update(playerPos) {
    if (this.game.dungeons?.active) return;
    this.revealAt(playerPos.x, playerPos.z, 24);
    const zone = this.game.world.currentZone?.info?.name ?? '';
    if (zone.includes('枢纽')) this.revealZone('hub');
    else if (zone.includes('森林') || zone.includes('灰白')) this.revealZone('fantasy');
    else if (zone.includes('魔法') || zone.includes('霍格')) this.revealZone('magic');
    else if (zone.includes('米勒') || zone.includes('星际')) this.revealZone('space');
    else if (zone.includes('时线') || zone.includes('破碎')) this.revealZone('void');
    else if (zone.includes('混沌') || zone.includes('边境')) this.revealZone('abyss');
  }

  setupListeners() {
    window.addEventListener('discovery', (e) => {
      const p = this.game.player.position;
      this.revealPoi(e.detail.id, p.x, p.z);
    });
    window.addEventListener('dungeon-enter', (e) => {
      const def = [...(this.game.dungeons?.dungeons?.values() ?? [])].find((d) => d.def.id === e.detail.id)?.def;
      if (def?.entrance) this.revealDungeon(e.detail.id, def.entrance.x, def.entrance.z);
    });
    for (const b of MAP_BOSSES) this.revealAt(b.x, b.z, 20);
    for (const rp of this.game.restPoints?.points ?? []) {
      this.revealAt(rp.position.x, rp.position.z, 12);
    }
  }

  toJSON() {
    return {
      revealed: Array.from(this.revealed),
      zoneRevealed: [...this.zoneRevealed],
      poiRevealed: [...this.poiRevealed],
      dungeonRevealed: [...this.dungeonRevealed],
    };
  }

  fromJSON(data) {
    if (!data) return;
    if (data.revealed?.length === this.revealed.length) {
      this.revealed.set(data.revealed);
    }
    this.zoneRevealed = new Set(data.zoneRevealed ?? []);
    this.poiRevealed = new Set(data.poiRevealed ?? []);
    this.dungeonRevealed = new Set(data.dungeonRevealed ?? ['ruin-crypt', 'forbidden-library', 'five-dim-rift']);
  }

  getGridSize() {
    return { gw: GW, gh: GH, cell: CELL, min: MIN, max: MAX };
  }
}
