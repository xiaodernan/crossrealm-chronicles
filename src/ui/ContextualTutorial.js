import { scheduler } from '../engine/Scheduler.js';
import { keyText } from '../content/keyHints.js';
import { ZONE_IDS, ZONE_NAMES } from '../content/ZoneIdentity.js';
import { isDungeonBossId } from '../content/bossRoster.js';
import { t } from '../engine/i18n.js';

import { on, offAll } from '../engine/EventBus.js';

const UI_CONTEXTUALTUTORIAL = 'ui/ContextualTutorial';
const tipOn = (name, handler) => on(name, handler, UI_CONTEXTUALTUTORIAL);

const STORAGE_KEY = 'crossrealm_contextual_tips';
/** 队列推进的计时分组 */
const TIP_TAG = 'contextual-tip';

/** 情境教程 — 首次地下城/Boss/弹反/连击等触发 */
export class ContextualTutorial {
  /** 情境提示的六个事件监听挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第六处） */
  dispose() {
    offAll(UI_CONTEXTUALTUTORIAL);
  }

  constructor(game) {
    this.game = game;
    this.seen = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    this.queue = [];
    this.busy = false;
    this.setupListeners();
  }

  _persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.seen]));
  }

  /**
   * 排一条情境提示。
   *
   * `title` / `text` 是**文案键**（W-D2 切片16g），不是文案本身 ——
   * 展开只发生在 `_drain()` 播出那一刻（一条提示可能排队几秒，期间玩家改过键位）。
   * `params` 是给 `t()` 的插值参数（如副本名与房间数）。
   */
  trigger(id, title, text, delay = 0, params = {}) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this._persist();
    this.queue.push({ title, text, params });
    if (!this.busy) this._drain(delay);
  }

  _drain(initialDelay = 0) {
    if (!this.queue.length) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const { title, text, params } = this.queue.shift();
    scheduler.after(initialDelay / 1000, () => {
      // 触发时只存模板，播出时才展开：一条提示可能排队几秒，期间玩家已经改过键位
      this.game.dialog.show(t(title, params), keyText(t(text, params)));
      const onClose = () => {
        document.getElementById('dialog-close')?.removeEventListener('click', onClose);
        scheduler.after(0.3, () => this._drain(400), TIP_TAG);
      };
      document.getElementById('dialog-close')?.addEventListener('click', onClose);
    }, TIP_TAG);
  }

  setupListeners() {
    tipOn('dungeon-enter', (e) => {
      this.trigger(
        'first-dungeon',
        'tip_dungeon_title',
        'tip_dungeon_text',
        1200,
        { name: e.detail.name, rooms: e.detail.rooms, doors: e.detail.doors }
      );
    });

    tipOn('boss-start', (e) => {
      const isDungeon = isDungeonBossId(e.detail.bossId);
      this.trigger(
        isDungeon ? 'first-dungeon-boss' : 'first-open-boss',
        isDungeon ? 'tip_dungeon_boss_title' : 'tip_boss_title',
        isDungeon ? 'tip_dungeon_boss_text' : 'tip_boss_text',
        800,
        { name: e.detail.name }
      );
    });

    tipOn('parry-success', () => {
      this.trigger(
        'first-parry',
        'tip_parry_title',
        'tip_parry_text',
        200
      );
    });

    tipOn('combo-finisher', () => {
      this.trigger(
        'first-combo-finisher',
        'tip_finisher_title',
        'tip_finisher_text',
        200
      );
    });

    tipOn('journal-entry', (e) => {
      if (e.detail.category !== 'fragment') return;
      this.trigger(
        'first-lore-fragment',
        'tip_fragment_title',
        'tip_fragment_text',
        600
      );
    });

    tipOn('zone-changed', (e) => {
      if (e.detail.initial) return;
      const ch = this.game.quests.chapter;
      const zoneId = e.detail.zoneId;
      // 修 B42：这两条提示此前**完全没看进的是哪个区**，只按章节门控 ——
      // 第四章后随便走进一个区，就会弹出"破碎时线：重力与视野在此不稳定"。
      // 现在按区域 id 触发，标题取 `ZONE_NAMES`（显示名只有一份）
      if (zoneId === ZONE_IDS.VOID && ch >= 4 && !this.seen.has('void-zone-tip')) {
        this.trigger(
          'void-zone-tip',
          ZONE_NAMES[ZONE_IDS.VOID],
          'tip_void_zone_text',
          2500
        );
      }
      if (zoneId === ZONE_IDS.ABYSS && ch >= 5 && !this.seen.has('chaos-zone-tip')) {
        this.trigger(
          'chaos-zone-tip',
          ZONE_NAMES[ZONE_IDS.ABYSS],
          'tip_chaos_zone_text',
          2500
        );
      }
    });
  }

  reset() {
    this.seen.clear();
    localStorage.removeItem(STORAGE_KEY);
  }
}
