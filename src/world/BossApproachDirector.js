import { MAP_BOSSES } from '../game/QuestSystem.js';

/** 首次靠近 Boss 信标 — 播报 lore */
const BOSS_LORE = {
  'shadow-warden': '影界守护者 — 灰林东侧。两阶段，红圈砸地前翻滚。',
  archmagus: '大奥术师萨尔林 — 魔法遗境北侧。紫球追踪，弹反可打断。',
  'singularity-herald': '奇点领主 — 米勒荒原。引力圈时向外滚。',
  'void-chronarch': '时线执政官 — 隐藏试炼。蓄力法术打断时停。',
  'chaos-overlord': '混沌裂隙领主 — 终焉 Boss。闪电风暴，贴身穿刺。',
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
      const lore = BOSS_LORE[b.bossId] ?? b.label;
      this.game.dialog.toast(`⚠ ${lore}`, 4500);
      this.game.storyJournal?.add?.({
        id: `boss-beacon-${b.bossId}`,
        category: 'boss',
        title: b.label,
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
