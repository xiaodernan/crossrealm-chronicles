import { CHAPTER_INTROS, ZONE_STORY_HOOKS, KEYWARDEN_CLEARED } from './LoreFragments.js';
import { scheduler } from '../engine/Scheduler.js';
import { t } from '../engine/i18n.js';
import { keyText } from '../content/keyHints.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_STORYDIRECTOR = 'game/StoryDirector';
const storyOn = (name, handler) => on(name, handler, GAME_STORYDIRECTOR);
/** 章节开场与区域钩子共用一组计时（换区/跳章时先撤旧的，避免多条叠着弹） */
const STORY_TAG = 'story-director';

/** 章节/区域叙事导演 — 增强沉浸感 */
export class StoryDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第八处） */
  dispose() {
    offAll(GAME_STORYDIRECTOR);
  }

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
    storyOn('chapter-changed', (e) => {
      const ch = e.detail.chapter;
      if (!CHAPTER_INTROS[ch] || this.shownChapters.has(ch)) return;
      this.shownChapters.add(ch);
      const intro = CHAPTER_INTROS[ch];
      scheduler.after(1.2, () => {
        /* `intro.title` / `intro.text` 现在是**文案键**（W-D2 切片16c）：
         * 展开只在这一处做一次，对话框与日志条目拿到同一份快照。 */
        const 标题 = keyText(t(intro.title));
        const 正文 = keyText(t(intro.text));
        this.game.dialog.show(标题, 正文);
        this.game.storyJournal?.addSilent({
          id: `chapter-intro-${ch}`,
          category: 'quest',
          title: 标题,
          text: 正文,
          chapter: ch,
        });
      }, STORY_TAG);
    });

    storyOn('zone-changed', (e) => {
      if (e.detail.initial) return;
      const zone = e.detail.zone;
      // 修 B35：去重 key 此前取 `zone?.id ?? 'unknown'`，而枢纽与走廊是伪造对象、
      // 没有 id —— 于是两者的日志永久落在同一个 'unknown' 上，只有一条进得了日志
      const id = e.detail.zoneId;
      if (this.shownZones.has(id)) return;
      this.shownZones.add(id);
      /* 区域钩子只从 `ZONE_STORY_HOOKS` 取（W-D2 切片16c）——
       * 改前这里自己手抄了六句 `journal`，与那张表逐字相同却各说各的：
       * 改表不改这里（或反过来），两处就分家了。抄本随本片一并删净。 */
      const hook = ZONE_STORY_HOOKS[id];
      if (hook) {
        scheduler.after(2.0, () => {
          // 区域名与副标题存的是**文案键**（W-D2 切片16i），显示侧在播出那一刻展开
          this.game.dialog.toast(`${t(zone.name)} — ${t(zone.subtitle)}`, 4500);
          this.game.storyJournal?.addSilent({
            id: `zone-hook-${id}`,
            category: 'poi',
            title: t(zone.name),
            text: keyText(t(hook.journal)),
            chapter: this.game.quests.chapter,
          });
        }, STORY_TAG);
      }
    });

    storyOn('dungeon-room-cleared', (e) => {
      const dungeon = this.game.dungeons?.active;
      if (!dungeon?.layout) return;
      const room = dungeon.layout.rooms.find((r) => r.id === e.detail.roomId);
      if (room?.isBossArena) {
        this.game.dialog.show(
          keyText(t(KEYWARDEN_CLEARED.title)),
          keyText(t(KEYWARDEN_CLEARED.text)),
        );
      }
    });
  }
}
