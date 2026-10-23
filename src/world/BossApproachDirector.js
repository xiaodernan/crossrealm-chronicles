import { MAP_BOSSES } from '../game/QuestSystem.js';
import { t } from '../engine/i18n.js';

/** 首次靠近 Boss 信标 — 播报 lore */
const BOSS_APPROACH_INTEL = {
  'shadow-warden': 'boss_approach_shadow',
  archmagus: 'boss_approach_mage',
  'singularity-herald': 'boss_approach_singularity',
  'void-chronarch': 'boss_approach_void',
  'chaos-overlord': 'boss_approach_chaos',
};

export class BossApproachDirector {
  constructor(game) {
    this.game = game;
    this.seen = new Set();
    this.cooldown = 0;
  }

  update(dt, playerPos) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || this.game.dialog?.open) return;

    for (const b of MAP_BOSSES) {
      if (this.seen.has(b.bossId)) continue;
      const dx = playerPos.x - b.x;
      const dz = playerPos.z - b.z;
      if (dx * dx + dz * dz > 55 * 55) continue;
      this.seen.add(b.bossId);
      this.cooldown = 8;
      const lore = t(BOSS_APPROACH_INTEL[b.bossId] ?? b.label);
      this.game.dialog.toast(`⚠ ${lore}`, 4500);
      this.game.storyJournal?.add?.({
        id: `boss-beacon-${b.bossId}`,
        category: 'boss',
        title: t(b.label),
        text: lore,
        chapter: this.game.quests?.chapter ?? 1,
      });
      window.dispatchEvent(new CustomEvent('boss-beacon-seen', { detail: { bossId: b.bossId } }));
      break;
    }
  }

  toJSON() {
    return { seen: [...this.seen] };
  }

  fromJSON(data) {
    if (data?.seen) this.seen = new Set(data.seen);
  }
}
