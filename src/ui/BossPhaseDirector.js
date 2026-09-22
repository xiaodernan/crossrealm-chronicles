import {
  BOSS_PHASE_LINES,
  BOSS_DEFEAT_LINES,
  DUNGEON_BOSS_LINES,
  getDungeonBossId,
} from '../game/BossDialogue.js';
import { addShake } from '../engine/Shake.js';
import { scheduler } from '../engine/Scheduler.js';

/** 横幅计时分组：同一时刻只该有一条 Boss 横幅在走（重复触发先撤旧的） */
const BANNER_TAG = 'boss-phase-banner';

/** Boss 阶段演出 — 横幅 / 台词 / 镜头 / 叙事技能解锁 */
export class BossPhaseDirector {
  constructor(game) {
    this.game = game;
    this.bannerEl = null;
    this._buildBanner();
    this.setupListeners();
  }

  _buildBanner() {
    this.bannerEl = document.createElement('div');
    this.bannerEl.id = 'boss-phase-banner';
    this.bannerEl.className = 'boss-phase-banner hidden';
    this.bannerEl.innerHTML = '<div class="bp-text"></div><div class="bp-sub"></div>';
    document.body.appendChild(this.bannerEl);
  }

  showBanner(text, sub = '', color = '#c9a962', duration = 2800) {
    if (!this.bannerEl) return;
    const t = this.bannerEl.querySelector('.bp-text');
    const s = this.bannerEl.querySelector('.bp-sub');
    if (t) { t.textContent = text; t.style.color = color; }
    if (s) s.textContent = sub;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.add('show');
    // 撤掉上一条还没走完的横幅（含它的淡出尾巴），否则两条会互相把 class 摘掉
    scheduler.clear(BANNER_TAG);
    scheduler.after(duration / 1000, () => {
      this.bannerEl.classList.remove('show');
      scheduler.after(0.4, () => this.bannerEl.classList.add('hidden'), BANNER_TAG);
    }, BANNER_TAG);
  }

  setupListeners() {
    window.addEventListener('boss-phase', (e) => this.onPhase(e.detail));
    window.addEventListener('boss-defeated', (e) => this.onDefeat(e.detail));
    window.addEventListener('boss-start', (e) => this.onStart(e.detail));
  }

  onStart(detail) {
    const bossId = detail.bossId;
    if (bossId?.startsWith('dungeon-')) {
      const dungeonId = bossId.replace('dungeon-', '');
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      if (lines?.intro) {
        scheduler.after(0.6, () => this.game.dialog.toast(lines.intro, 4000));
      }
    }
  }

  onPhase(detail) {
    const bossId = detail.bossId ?? detail.name;
    if (bossId?.startsWith('dungeon-')) {
      const dungeonId = bossId.replace('dungeon-', '');
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      if (detail.phase === 2 && lines?.p2) {
        this.showBanner('守钥者 · 第二阶段', lines.p2, '#ff8866');
      }
      window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'bossPhase' } }));
      return;
    }

    const cfg = BOSS_PHASE_LINES[bossId]?.[detail.phase];
    if (!cfg) {
      this.game.dialog.toast(`Boss 第 ${detail.phase} 阶段！`);
      return;
    }
    this.showBanner(cfg.banner ?? `阶段 ${detail.phase}`, cfg.toast ?? '', cfg.color ?? '#c9a962');
    if (cfg.toast) this.game.dialog.toast(cfg.toast, 3500);
    if (cfg.shake) {
      addShake(cfg.shake);
    }
    window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'bossPhase' } }));
    this.game.storyJournal?.addSilent({
      id: `boss-phase-${bossId}-${detail.phase}`,
      category: 'boss',
      title: cfg.banner ?? `Boss 阶段 ${detail.phase}`,
      text: cfg.toast ?? '',
      chapter: this.game.quests.chapter,
    });
  }

  onDefeat(detail) {
    const bossId = detail.bossId;
    if (bossId?.startsWith('dungeon-')) {
      const dungeonId = bossId.replace('dungeon-', '');
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      if (lines?.defeat) {
        scheduler.after(0.8, () => this.game.dialog.show('守钥者已倒', lines.defeat));
      }
      return;
    }
    const cfg = BOSS_DEFEAT_LINES[bossId];
    if (cfg) {
      scheduler.after(1.0, () => this.game.dialog.show(cfg.title, cfg.text));
    }
    this.game.weaponSkills?.tryNarrativeUnlocks?.(this.game);
  }
}
