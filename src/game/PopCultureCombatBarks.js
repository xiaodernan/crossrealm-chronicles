/**
 * 战斗/探索随机 bark — 致敬向（不占用主 UI）。
 * W-D2 切片41：池子里存的是**文案键**，播出时经 `t()` 展开 — 英文玩家看到的
 * 是致敬译句而不是中文原句。
 */
import { ZONE_IDS } from '../content/ZoneIdentity.js';
import { t } from '../engine/i18n.js';

import { on, offAll } from '../engine/EventBus.js';

const GAME_POPCULTURECOMBATBARKS = 'game/PopCultureCombatBarks';
const barksOn = (name, handler) => on(name, handler, GAME_POPCULTURECOMBATBARKS);
export const COMBAT_BARKS_POP = {
  magic: [
    'bark_pop_magic_candles',
    'bark_pop_magic_forest',
  ],
  space: [
    'bark_pop_space_hourglass',
    'bark_pop_space_dock',
  ],
  void: [
    'bark_pop_void_spores',
    'bark_pop_void_clocktower',
  ],
  fantasy: [
    'bark_pop_fantasy_mirror',
    'bark_pop_fantasy_duel',
  ],
  abyss: [
    'bark_pop_abyss_cellar',
    'bark_pop_abyss_docks',
  ],
  space_scifi: [
    'bark_pop_scifi_jumpgate',
    'bark_pop_scifi_ai',
  ],
};

/** 区域 id → 台词池 key。荒原有两套气质，命中时随机取一套（故不在表里） */
const BARK_KEY = {
  [ZONE_IDS.MAGIC]: 'magic',
  [ZONE_IDS.FANTASY]: 'fantasy',
  [ZONE_IDS.VOID]: 'void',
  [ZONE_IDS.ABYSS]: 'abyss',
};

export function barkKeyForZone(zoneId, roll = Math.random()) {
  if (zoneId === ZONE_IDS.SPACE) return roll > 0.5 ? 'space' : 'space_scifi';
  return BARK_KEY[zoneId] ?? null;
}

export function attachPopCultureCombatBarks(game) {
  let cd = 0;
  barksOn('enemy-defeated', () => {
    cd -= 1;
    if (cd > 0) return;
    // 修 B36：台词池按区域 id 选（原来是 `includes('遗境')` 这种松匹配，
    // 任何名字里带"遗境"的新区都会抢走魔法区的台词）
    const key = barkKeyForZone(game.world?.zoneId);
    if (!key) return;
    const list = COMBAT_BARKS_POP[key];
    if (!list?.length || Math.random() > 0.22) return;
    cd = 4;
    game.dialog?.toast?.(t(list[Math.floor(Math.random() * list.length)]), 2800);
  });
  return { dispose() { offAll(GAME_POPCULTURECOMBATBARKS); } };
}
