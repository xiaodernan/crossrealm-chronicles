import { ALL_ACHIEVEMENTS_EXTRA } from '../content/achievements.js';
import { attachPopCultureAchievements } from './PopCultureAchievementExtras.js';

/** 成就扩写监听 — 挂到 AchievementSystem */
export function attachAchievementExtras(ach) {
  attachPopCultureAchievements(ach);
  window.addEventListener('combat-style-changed', (e) => {
    const score = e.detail?.score ?? 0;
    if (score > (ach.stats.styleBest ?? 0)) ach.stats.styleBest = score;
    ach.checkAll();
  });
  window.addEventListener('cg-unlocked', () => {
    const stats = ach.game?.cgGallery?.getStats?.();
    if (stats) ach.stats.cgPercent = stats.percent;
    ach.checkAll();
  });
  window.addEventListener('codex-unlocked', () => {
    const stats = ach.game?.loreCodex?.getStats?.();
    if (stats) ach.stats.codexPercent = stats.percent;
    ach.checkAll();
  });
  window.addEventListener('boss-rematch-started', () => {
    ach.stats.rematches = (ach.stats.rematches ?? 0) + 1;
    ach.checkAll();
  });
  window.addEventListener('campfire-memory-updated', (e) => {
    ach.stats.campfireZones = e.detail?.zones ?? 0;
    ach.checkAll();
  });
  window.addEventListener('photo-mode-changed', (e) => {
    if (e.detail?.active) {
      ach.stats.photoMode = true;
      ach.checkAll();
    }
  });

}

export { ALL_ACHIEVEMENTS_EXTRA };
