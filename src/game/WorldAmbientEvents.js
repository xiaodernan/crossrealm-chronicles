import { mergeZoneEvents } from './WorldAmbientCatalog.js';
import { mergePopCultureAmbient } from '../content/ambientLore.js';

/** 探索时随机氛围事件 — 区域台词 / 小惊喜 */
const _BASE_ZONE_EVENTS = {
  hub: [
    { text: '世界之锚发出低沉嗡鸣 — 位面仍相连。', weight: 1 },
    { text: '远处营火看守在整理柴薪（其实没有柴）。', weight: 0.6 },
  ],
  fantasy: [
    { text: '灰白森林起雾了 — 小心红圈。', weight: 1 },
    { text: '树梢传来精灵口哨 — 斥候在巡逻。', weight: 0.7 },
    { text: '地下城方向传来石门摩擦声…', weight: 0.5 },
  ],
  magic: [
    { text: '紫色奥术屑飘落 — 大奥术师在远处活跃。', weight: 1 },
    { text: '禁书图书馆的方向有微光闪烁。', weight: 0.6 },
  ],
  space: [
    { text: '米勒荒原引力异常 — 跳跃高度略减。', weight: 0.8 },
    { text: 'Endurance 号日志碎片在风里打转。', weight: 0.7 },
  ],
  void: [
    { text: '时间卡顿了一帧 — 你又前进了。', weight: 1 },
    { text: '时线残影在远处闪烁后消失。', weight: 0.6 },
  ],
  abyss: [
    { text: '混沌脉冲掠过地平线 — 裂隙在呼吸。', weight: 1 },
    { text: '引路人的低语：「快一点，界在变薄的。」', weight: 0.7 },
  ],
};

const ZONE_EVENTS = mergePopCultureAmbient(mergeZoneEvents(_BASE_ZONE_EVENTS));

export class WorldAmbientEvents {
  constructor(game) {
    this.game = game;
    this.zone = 'hub';
    this.timer = 45 + Math.random() * 30;
    this.seen = new Set();
  }

  setZone(zone) {
    this.zone = zone;
    this.timer = 35 + Math.random() * 25;
  }

  update(dt, playerPos) {
    this.timer -= dt;
    if (this.timer > 0 || this.game.dialog?.open || this.game.combatCamera?.blocksInput?.()) return;
    if (this.game.dungeons?.active) return;

    const chapter = this.game.quests?.chapter ?? 1;
    const pool = (ZONE_EVENTS[this.zone] ?? ZONE_EVENTS.hub)
      .filter((e) => !e.minChapter || chapter >= e.minChapter);
    if (!pool.length) return;
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) { pick = e; break; }
    }

    const key = `${this.zone}:${pick.text.slice(0, 12)}`;
    if (!this.seen.has(key)) {
      this.seen.add(key);
      this.game.storyJournal?.add?.({
        id: `ambient-${key}`,
        category: 'poi',
        title: '旅途见闻',
        text: pick.text,
        chapter: this.game.quests?.chapter ?? 1,
      });
    }

    this.game.dialog.toast(pick.text, 3600);
    this.game.audio?.loreDiscover?.();
    this.timer = 55 + Math.random() * 45;
  }

  toJSON() {
    return { seen: [...this.seen] };
  }

  fromJSON(data) {
    if (data?.seen) this.seen = new Set(data.seen);
  }
}
