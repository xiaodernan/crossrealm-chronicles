import { DUNGEON_BOSS_PREFIX, bossById } from './bossRoster.js';

/** Boss 专属台词 — 开场 / 阶段 / 击败 / 地牢守钥者 */
export const BOSS_PHASE_LINES = {
  'shadow-warden': {
    1: { banner: 'boss_phase_shadow_warden_p1_banner', toast: 'boss_phase_shadow_warden_p1_toast' },
    2: { banner: 'boss_phase_shadow_warden_p2_banner', toast: 'boss_phase_shadow_warden_p2_toast', shake: 0.1 },
    3: { banner: 'boss_phase_shadow_warden_p3_banner', toast: 'boss_phase_shadow_warden_p3_toast', shake: 0.14, color: '#ff4444' },
  },
  archmagus: {
    1: { banner: 'boss_phase_archmagus_p1_banner', toast: 'boss_phase_archmagus_p1_toast' },
    2: { banner: 'boss_phase_archmagus_p2_banner', toast: 'boss_phase_archmagus_p2_toast', shake: 0.08 },
    3: { banner: 'boss_phase_archmagus_p3_banner', toast: 'boss_phase_archmagus_p3_toast', shake: 0.12, color: '#aa55ff' },
  },
  'singularity-herald': {
    1: { banner: 'boss_phase_singularity_herald_p1_banner', toast: 'boss_phase_singularity_herald_p1_toast' },
    2: { banner: 'boss_phase_singularity_herald_p2_banner', toast: 'boss_phase_singularity_herald_p2_toast', shake: 0.1 },
    3: { banner: 'boss_phase_singularity_herald_p3_banner', toast: 'boss_phase_singularity_herald_p3_toast', shake: 0.15, color: '#4488ff' },
  },
  'void-chronarch': {
    1: { banner: 'boss_phase_void_chronarch_p1_banner', toast: 'boss_phase_void_chronarch_p1_toast' },
    2: { banner: 'boss_phase_void_chronarch_p2_banner', toast: 'boss_phase_void_chronarch_p2_toast', shake: 0.12 },
    3: { banner: 'boss_phase_void_chronarch_p3_banner', toast: 'boss_phase_void_chronarch_p3_toast', shake: 0.16, color: '#c9a962' },
  },
  'chaos-overlord': {
    1: { banner: 'boss_phase_chaos_overlord_p1_banner', toast: 'boss_phase_chaos_overlord_p1_toast' },
    2: { banner: 'boss_phase_chaos_overlord_p2_banner', toast: 'boss_phase_chaos_overlord_p2_toast', shake: 0.11 },
    3: { banner: 'boss_phase_chaos_overlord_p3_banner', toast: 'boss_phase_chaos_overlord_p3_toast', shake: 0.18, color: '#ff2244' },
  },
};

/**
 * 击败横幅。`title` 一律是名册**全名**（身份台口不省地方）—— 直接 `bossById(id).name`，
 * 不在这里抄第二份显示名（修前 singularity-herald 写的是短名「奇点领主」，与过场分叉）。
 */
export const BOSS_DEFEAT_LINES = {
  'shadow-warden': { title: bossById('shadow-warden').nameKey, text: 'boss_defeat_shadow_warden_text' },
  'archmagus': { title: bossById('archmagus').nameKey, text: 'boss_defeat_archmagus_text' },
  'singularity-herald': { title: bossById('singularity-herald').nameKey, text: 'boss_defeat_singularity_herald_text' },
  'void-chronarch': { title: bossById('void-chronarch').nameKey, text: 'boss_defeat_void_chronarch_text' },
  'chaos-overlord': { title: bossById('chaos-overlord').nameKey, text: 'boss_defeat_chaos_overlord_text' },
};

export const DUNGEON_BOSS_LINES = {
  'ruin-crypt': {
    intro: 'boss_dungeon_ruin_crypt_intro',
    p2: 'boss_dungeon_ruin_crypt_p2',
    defeat: 'boss_dungeon_ruin_crypt_defeat',
  },
  'forbidden-library': {
    intro: 'boss_dungeon_forbidden_library_intro',
    p2: 'boss_dungeon_forbidden_library_p2',
    defeat: 'boss_dungeon_forbidden_library_defeat',
  },
  'five-dim-rift': {
    intro: 'boss_dungeon_five_dim_rift_intro',
    p2: 'boss_dungeon_five_dim_rift_p2',
    defeat: 'boss_dungeon_five_dim_rift_defeat',
  },
  'forest-shrine': {
    intro: 'boss_dungeon_forest_shrine_intro',
    p2: 'boss_dungeon_forest_shrine_p2',
    defeat: 'boss_dungeon_forest_shrine_defeat',
  },
  'hub-catacombs': {
    intro: 'boss_dungeon_hub_catacombs_intro',
    p2: 'boss_dungeon_hub_catacombs_p2',
    defeat: 'boss_dungeon_hub_catacombs_defeat',
  },
};

/**
 * 副本 id → bossId。
 *
 * 前缀不在这里写第二份：它由 `content/bossRoster.js` 的 `DUNGEON_BOSS_PREFIX` 给出，
 * 而名册那边同时用同一个常量做"认不认得这个 id"的判断 —— 一处改、两处跟着走。
 * 修前这里是独立的一份 `` `dungeon-${id}` ``，与 `DungeonManager` 里拼的那份各写一遍。
 */
export function getDungeonBossId(dungeonId) {
  return `${DUNGEON_BOSS_PREFIX}${dungeonId}`;
}

/**
 * 上面那个的**反向**：bossId → 副本 id，不是副本 Boss 就返回 `null`。
 *
 * 为什么要有它：`ui/BossPhaseDirector.js` 里**三处**（开场 / 阶段 / 击破）都手写着
 * `if (bossId?.startsWith('dungeon-')) { const dungeonId = bossId.replace('dungeon-', ''); … }`
 * —— 那两处 `'dungeon-'` 字面量就是给前缀**又抄了两份真源**（三处加起来五份）。
 * 前缀改了名（或将来加第二类动态 Boss）时，抄错的那一处不会报错，
 * 只是那座副本的 Boss **静默地没有开场白 / 阶段台词 / 击破台词**。
 *
 * 用 `null` 而不是空串表示"不是副本 Boss"：空串是**合法**的副本 id 候选值吗？不是 ——
 * 但 `if (dungeonId)` 这种写法碰上空串会走 else，与 `null` 表现相同；
 * 而返回 `null` 至少让"没认出来"这件事在类型上说得清。
 */
export function dungeonIdOf(bossId) {
  if (typeof bossId !== 'string' || !bossId.startsWith(DUNGEON_BOSS_PREFIX)) return null;
  const id = bossId.slice(DUNGEON_BOSS_PREFIX.length);
  return id === '' ? null : id;      // `'dungeon-'` 这种空后缀不是一座副本
}
