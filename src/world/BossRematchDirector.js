import { MAP_BOSSES } from '../game/QuestSystem.js';

import { on, offAll } from '../engine/EventBus.js';
import { t } from '../engine/i18n.js';

const WORLD_BOSSREMATCHDIRECTOR = 'world/BossRematchDirector';
const rematchOn = (name, handler) => on(name, handler, WORLD_BOSSREMATCHDIRECTOR);
/** Boss 信标再战 — 击败后 E 召唤 */
const BOSS_SPAWN = {
  'shadow-warden': (em, x, z) => em.spawnBoss({ bossId: 'shadow-warden', x, z }),
  'archmagus': (em, x, z) => em.spawnMagicBoss({ bossId: 'archmagus', x, z }),
  'singularity-herald': (em, x, z) => em.spawnSpaceBoss({ bossId: 'singularity-herald', x, z }),
  'void-chronarch': (em, x, z) => em.spawnVoidBoss({ bossId: 'void-chronarch', x, z }),
  'chaos-overlord': (em, x, z) => em.spawnChaosBoss({ bossId: 'chaos-overlord', x, z }),
};

export class BossRematchDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第九处） */
  dispose() {
    offAll(WORLD_BOSSREMATCHDIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.defeated = new Set();
    this.cooldown = 0;
    this.setupListeners();
  }

  setupListeners() {
    rematchOn('boss-defeated', (e) => {
      const id = e.detail?.bossId;
      if (id) this.defeated.add(id);
    });
  }

  syncFromQuests() {
    const s = this.game.quests?.stats;
    if (!s) return;
    if (s.bossDefeated) this.defeated.add('shadow-warden');
    if (s.boss2Defeated) this.defeated.add('archmagus');
    if (s.boss3Defeated) this.defeated.add('singularity-herald');
    if (s.voidBossDefeated) this.defeated.add('void-chronarch');
    if (s.chaosBossDefeated) this.defeated.add('chaos-overlord');
  }

  update(dt, playerPos) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || this.game.dialog?.open || this.game.dungeons?.active) return;
    if (!this.game.keys?.KeyE) return;

    const near = this._findNearBeacon(playerPos);
    if (!near) return;

    this.game.keys.KeyE = false;
    this._startRematch(near);
  }

  _findNearBeacon(pos) {
    for (const b of MAP_BOSSES) {
      if (!this.defeated.has(b.bossId)) continue;
      const dx = pos.x - b.x;
      const dz = pos.z - b.z;
      if (dx * dx + dz * dz < 28 * 28) return b;
    }
    return null;
  }

  _startRematch(beacon) {
    const em = this.game.enemyManager;
    const active = em.enemies?.some((e) => e.bossId === beacon.bossId && e.alive);
    if (active) {
      this.game.dialog.toast(t('boss_rematch_already_present', { name: beacon.label }));
      return;
    }
    const spawn = BOSS_SPAWN[beacon.bossId];
    if (!spawn) return;

    spawn(em, beacon.x, beacon.z);
    this.cooldown = 12;
    this.game.dialog.toast(t('boss_rematch_started', { name: beacon.label }), 2800);
    this.game.stats.addSouls(5);
    window.dispatchEvent(new CustomEvent('boss-rematch-started', { detail: { bossId: beacon.bossId } }));
    window.dispatchEvent(new CustomEvent('stats-changed', { detail: this.game.stats.toJSON() }));
  }

  toJSON() {
    return { defeated: [...this.defeated] };
  }

  fromJSON(data) {
    if (data?.defeated) this.defeated = new Set(data.defeated);
  }
}
