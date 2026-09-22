import { CHAPTER_INTROS } from './LoreFragments.js';
import { scheduler } from '../engine/Scheduler.js';

/** 章节开场与区域钩子共用一组计时（换区/跳章时先撤旧的，避免多条叠着弹） */
const STORY_TAG = 'story-director';

/** 章节/区域叙事导演 — 增强沉浸感 */
export class StoryDirector {
  constructor(game) {
    this.game = game;
    this.shownChapters = new Set();
    this.shownZones = new Set();
    this.setupListeners();
  }

  fromJSON(data) {
    if (!data) return;
    this.shownChapters = new Set(data.shownChapters ?? []);
    this.shownZones = new Set(data.shownZones ?? []);
  }

  toJSON() {
    return { shownChapters: [...this.shownChapters], shownZones: [...this.shownZones] };
  }

  setupListeners() {
    window.addEventListener('chapter-changed', (e) => {
      const ch = e.detail.chapter;
      if (!CHAPTER_INTROS[ch] || this.shownChapters.has(ch)) return;
      this.shownChapters.add(ch);
      const intro = CHAPTER_INTROS[ch];
      scheduler.after(1.2, () => {
        this.game.dialog.show(intro.title, intro.text);
        this.game.storyJournal?.addSilent({
          id: `chapter-intro-${ch}`,
          category: 'quest',
          title: intro.title,
          text: intro.text,
          chapter: ch,
        });
      }, STORY_TAG);
    });

    window.addEventListener('zone-changed', (e) => {
      if (e.detail.initial) return;
      const zone = e.detail.zone;
      const hooks = {
        hub: '交汇枢纽 — 位面中心。每一次跨区域旅行，锚点都会记录你的足迹。',
        fantasy: '灰白森林弥漫着旧战争的气息。石环与塔楼是 Ch1 碎片的所在。',
        magic: '霍格莫茨风格的废墟。大奥术师的竞技场在更深处。',
        space: '星际区的时间感不可靠。五维_tesseract 是 Ch3 的核心谜题。',
        void: '时线裂隙与五维碑文在此交汇。Ch4 的真结局隐藏于此。',
        abyss: 'Ch5 终局之地。裂隙领主的竞技场是最后的审判。',
      };
      // 修 B35：去重 key 此前取 `zone?.id ?? 'unknown'`，而枢纽与走廊是伪造对象、
      // 没有 id —— 于是两者的日志永久落在同一个 'unknown' 上，只有一条进得了日志
      const id = e.detail.zoneId;
      if (this.shownZones.has(id)) return;
      this.shownZones.add(id);
      const journal = hooks[id];
      if (journal) {
        scheduler.after(2.0, () => {
          this.game.dialog.toast(`${zone.name} — ${zone.subtitle}`, 4500);
          this.game.storyJournal?.addSilent({
            id: `zone-hook-${id}`,
            category: 'poi',
            title: zone.name,
            text: journal,
            chapter: this.game.quests.chapter,
          });
        }, STORY_TAG);
      }
    });

    window.addEventListener('dungeon-room-cleared', (e) => {
      const dungeon = this.game.dungeons?.active;
      if (!dungeon?.layout) return;
      const room = dungeon.layout.rooms.find((r) => r.id === e.detail.roomId);
      if (room?.isBossArena) {
        this.game.dialog.show(
          '守钥者已倒',
          '出口环亮起。你听见枢纽深处传来一声叹息——像是某个位面终于松了一口气。\n\n[E] 离开迷宫，继续主线。'
        );
      }
    });
  }
}
