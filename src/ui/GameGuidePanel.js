import { attachDraggable, attachCollapsible } from './DraggablePanel.js';
import { keyText } from '../content/keyHints.js';

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
    attachCollapsible(this.el, { storageKey: 'game-guide' });    this.el.querySelector('#guide-sync')?.addEventListener('click', () => {
      const n = this.game.quests.syncProgress();
      this.game.dialog.toast(n > 0 ? `已推进 ${n} 个任务` : '任务已同步到最新');
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
      if (this.titleEl) this.titleEl.textContent = '⚡ 自动通关进行中';
      if (this.stepEl) this.stepEl.textContent = this.game.playerAutoPlay.statusEl?.textContent ?? '你的角色正在跑图…';
      if (this.hintEl) this.hintEl.textContent = keyText('{escape} 停止 · 请看屏幕中央的角色移动');
      return;
    }
    const dg = this.game.dungeons?.getExplorationHint?.();
    if (dg) {
      if (this.titleEl) this.titleEl.textContent = `🗺 ${dg.name}`;
      if (this.stepEl) this.stepEl.textContent = `已探索 ${dg.visited}/${dg.total} 房 · 已清空 ${dg.cleared}/${dg.total}`;
      if (this.hintEl) {
        this.hintEl.textContent = dg.bossAlive
          ? '⚔ 迷宫守钥者 — 击败后出口环才可用'
          : dg.enemies > 0
          ? `⚔ 当前房 ${dg.enemies} 个敌人 — 清空后门会开`
          : dg.isExit ? keyText('▶ 守钥者已倒 — 出口环 [{interact}] 离开') : keyText('▶ 穿门探索 · 留意发光石碑 [{interact}] 读叙事');
      }
      return;
    }
    if (!q) {
      if (this.titleEl) this.titleEl.textContent = '🎉 主线已完成';
      if (this.stepEl) this.stepEl.textContent = keyText('自由探索五区 · 小地图 {minimap} 看 Boss 💀');
      if (this.hintEl) this.hintEl.textContent = keyText('按 {autoPlay} 可重跑自动通关');
      return;
    }
    if (this.titleEl) this.titleEl.textContent = `Ch${this.game.quests.chapter} · ${q.title}`;
    if (this.stepEl) this.stepEl.textContent = this.game.quests.getProgressText();
    const wp = this.game.quests.getQuestWaypoint();
    if (this.hintEl) {
      this.hintEl.textContent = wp
        ? `▶ 走向：${wp.label}${wp.hint ? `（${wp.hint}）` : ''}`
        : this.game.quests.getAssistantHint();
    }
  }

  update() {
    this.refresh();
  }
}
