import { MAP_BOSSES } from './QuestSystem.js';
import { TRIAL_DUNGEON_IDS } from '../content/dungeons.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_EXPLORATIONMAP = 'game/ExplorationMap';
const exploreOn = (name, handler) => on(name, handler, GAME_EXPLORATIONMAP);
const CELL = 12;
const MIN = -320;
const MAX = 320;
const GW = Math.ceil((MAX - MIN) / CELL);
const GH = GW;

/**
 * 地图覆盖的世界跨度（米）。`getGridSize()` 把它藏成 min/max 两个数，而画两张图
 * （世界地图 / 小地图）的人要的其实是"这一格像素对多少米"——以前两边各自手抄，
 * 小地图那份抄成了 0.135，把整个世界压进一枚针尖。样式或格子改了，这里跟着动。
 */
export const MAP_SPAN_M = MAX - MIN;

/** 世界迷雾探索 — 全屏地图数据 */
export class ExplorationMap {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_EXPLORATIONMAP);
  }

  constructor(game) {
    this.game = game;
    this.revealed = new Uint8Array(GW * GH);
    this.zoneRevealed = new Set();
    this.poiRevealed = new Set();
    /**
     * 开局就点亮的副本 —— 主线要清的那几座不藏在迷雾里（玩家该知道试炼入口在哪），
     * 可选的那几座得自己走上去。清单由 `content/dungeons.js` 的 `trial` 推导，
     * 以前这里是手抄的三枚 id，而 `fromJSON` 的兜底又抄了一遍同一串。
     */
    this.dungeonRevealed = new Set(TRIAL_DUNGEON_IDS);
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
    // 修 B36：开雾直接问世界层要区域 id（原先是六条中文显示名 `includes`，
    // 而 `revealZone` 本来就按 id 取中心点 —— 中间那次"名字→id"的翻译完全多余）
    this.revealZone(this.game.world.zoneId);
  }

  setupListeners() {
    exploreOn('discovery', (e) => {
      const p = this.game.player.position;
      this.revealPoi(e.detail.id, p.x, p.z);
    });
    exploreOn('dungeon-enter', (e) => {
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
    // 没有这一格的旧档：按**新建图**的同一份口径兜底，而不是再抄一串 id（抄的那份会跟着名册过期）
    this.dungeonRevealed = new Set(data.dungeonRevealed ?? TRIAL_DUNGEON_IDS);
  }

  getGridSize() {
    return { gw: GW, gh: GH, cell: CELL, min: MIN, max: MAX };
  }
}
