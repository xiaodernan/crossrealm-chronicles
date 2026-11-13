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
  // W-Z21：支线完成进账 — 与 SkillQuestSystem 的 `side-quest-complete` 事件对齐，逐条计数
  extrasOn('side-quest-complete', () => {
    ach.stats.sideQuests = (ach.stats.sideQuests ?? 0) + 1;
    ach.checkAll();
  });
  // W-Z21 回填：save 里 `stats.sideQuests` 早于本切片存在，老存档读档后补齐
  // （extras 挂载在 `SaveSystem.load` 之后，此时 `sideQuests.completed` 已是读档后的集合）——
  // 只补不改，任何低于实际值的格子都按实际值对齐；checkAll 同步追认早已达成的那一枚
  const 已完成支线 = ach.game?.sideQuests?.completed?.size;
  if (typeof 已完成支线 === 'number' && 已完成支线 > (ach.stats.sideQuests ?? 0)) {
    ach.stats.sideQuests = 已完成支线;
    ach.checkAll();
  }

  return { dispose() { popAch.dispose(); offAll(GAME_ACHIEVEMENTSYSTEMEXTRAS); } };
}
