import { attachDraggable, attachCollapsible } from './DraggablePanel.js';
import { keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

/** 常驻游戏指引 — 告诉玩家现在该干什么 */
export class GameGuidePanel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('game-guide');
    if (!this.el) return;
    this.titleEl = this.el.querySelector('#guide-title');
    this.stepEl = this.el.querySelector('#guide-step');
    this.hintEl = this.el.querySelector('#guide-hint');
    attachDraggable(this.el, { storageKey: 'game-guide', handle: '.guide-head' });
    attachCollapsible(this.el, { storageKey: 'game-guide' });
    this.el.querySelector('#guide-sync')?.addEventListener('click', () => {
      const n = this.game.quests.syncProgress();
      this.game.dialog.toast(n > 0 ? t('guide_toast_sync_progress', { n }) : t('guide_toast_synced'));
      this.refresh();
    });
    this.el.querySelector('#guide-autoplay')?.addEventListener('click', () => {
      this.game.questAssistant.startAutoPlay();
    });
    this.refresh();
  }

  refresh() {
    if (!this.el) return;
    const q = this.game.quests.current;
    const ap = this.game.playerAutoPlay?.active;
    if (ap) {
      if (this.titleEl) this.titleEl.textContent = t('guide_title_auto');
      if (this.stepEl) this.stepEl.textContent = this.game.playerAutoPlay.statusEl?.textContent ?? t('guide_step_auto');
      if (this.hintEl) this.hintEl.textContent = keyText(t('guide_hint_auto'));
      return;
    }
    const dg = this.game.dungeons?.getExplorationHint?.();
    if (dg) {
      if (this.titleEl) this.titleEl.textContent = t('guide_title_dungeon_prefix') + dg.name;
      if (this.stepEl) this.stepEl.textContent = t('guide_step_dungeon', { visited: dg.visited, total: dg.total, cleared: dg.cleared });
      if (this.hintEl) {
        this.hintEl.textContent = dg.bossAlive
          ? t('guide_hint_dungeon_boss')
          : dg.enemies > 0
            ? t('guide_hint_dungeon_enemies', { enemies: dg.enemies })
            : dg.isExit
              ? keyText(t('guide_hint_dungeon_exit'))
              : keyText(t('guide_hint_dungeon_explore'));
      }
      return;
    }
    if (!q) {
      if (this.titleEl) this.titleEl.textContent = t('guide_title_complete');
      if (this.stepEl) this.stepEl.textContent = keyText(t('guide_step_complete'));
      if (this.hintEl) this.hintEl.textContent = keyText(t('guide_hint_complete'));
      return;
    }
    if (this.titleEl) this.titleEl.textContent = t('guide_title_chapter_prefix', { chapter: this.game.quests.chapter }) + q.title;
    if (this.stepEl) this.stepEl.textContent = this.game.quests.getProgressText();
    const wp = this.game.quests.getQuestWaypoint();
    if (this.hintEl) {
      this.hintEl.textContent = wp
        ? t('guide_hint_waypoint', { label: t(wp.label), hint: wp.hint ? `（${wp.hint}）` : '' })
        : t('guide_hint_assistant', { hint: this.game.quests.getAssistantHint() });
    }
  }

  update() {
    this.refresh();
  }
}