import { attachPopCultureAchievements } from './PopCultureAchievementExtras.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_ACHIEVEMENTSYSTEMEXTRAS = 'game/AchievementSystemExtras';
const extrasOn = (name, handler) => on(name, handler, GAME_ACHIEVEMENTSYSTEMEXTRAS);
/** 成就扩写监听 — 挂到 AchievementSystem */
export function attachAchievementExtras(ach) {
  const popAch = attachPopCultureAchievements(ach);
  extrasOn('combat-style-changed', (e) => {
    const score = e.detail?.score ?? 0;
    if (score > (ach.stats.styleBest ?? 0)) ach.stats.styleBest = score;
    ach.checkAll();
  });
  extrasOn('cg-unlocked', () => {
    const stats = ach.game?.cgGallery?.getStats?.();
    if (stats) ach.stats.cgPercent = stats.percent;
    ach.checkAll();
  });
  extrasOn('codex-unlocked', () => {
    const stats = ach.game?.loreCodex?.getStats?.();
    if (stats) ach.stats.codexPercent = stats.percent;
    ach.checkAll();
  });
  extrasOn('boss-rematch-started', () => {
    ach.stats.rematches = (ach.stats.rematches ?? 0) + 1;
    ach.checkAll();
  });
  extrasOn('campfire-memory-updated', (e) => {
    ach.stats.campfireZones = e.detail?.zones ?? 0;
    ach.checkAll();
  });
  extrasOn('photo-mode-changed', (e) => {
    if (e.detail?.active) {
      ach.stats.photoMode = true;
      ach.checkAll();
    }
  });

  return { dispose() { popAch.dispose(); offAll(GAME_ACHIEVEMENTSYSTEMEXTRAS); } };
}
