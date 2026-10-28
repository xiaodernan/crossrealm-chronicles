/** 迷宫叙事碎片 — 场景叙事 / 碎片化文本 / 章节导语 */
import { LORE_FRAGMENTS_POP, mergeNpcChapterLines } from '../content/ambientLore.js';

export const LORE_FRAGMENTS = [
  { id: 'lore-1', title: 'lore_1_title', text: 'lore_1_text', chapter: 1 },
  { id: 'lore-2', title: 'lore_2_title', text: 'lore_2_text', chapter: 1 },
  { id: 'lore-3', title: 'lore_3_title', text: 'lore_3_text', chapter: 2 },
  { id: 'lore-4', title: 'lore_4_title', text: 'lore_4_text', chapter: 3 },
  { id: 'lore-5', title: 'lore_5_title', text: 'lore_5_text', chapter: 4 },
  { id: 'lore-6', title: 'lore_6_title', text: 'lore_6_text', chapter: 5 },
  { id: 'lore-7', title: 'lore_7_title', text: 'lore_7_text', chapter: 3 },
  { id: 'lore-8', title: 'lore_8_title', text: 'lore_8_text', chapter: 2 },
  ...LORE_FRAGMENTS_POP,
];


/**
 * 副本 Boss 的开场白（**文案键**，W-D2 切片16c）。
 *
 * 改前这里是裸中文（标题 + 正文各一句），于是切到英文语言时副本 Boss 仍然用中文自我介绍，
 * 而对话框里其它句子已经是英文 —— 一屏两语。数据层只存键，显示侧
 * （`DungeonManager` 的 Boss 出生那段）在那一刻 `keyText(t(键))` 展开。
 *
 * 键名 `boss_lore_<副本 id>_title` / `_text`。
 */
export const BOSS_LORE = {
  'ruin-crypt': { title: 'boss_lore_ruin_crypt_title', text: 'boss_lore_ruin_crypt_text' },
  'forbidden-library': { title: 'boss_lore_forbidden_library_title', text: 'boss_lore_forbidden_library_text' },
  'five-dim-rift': { title: 'boss_lore_five_dim_rift_title', text: 'boss_lore_five_dim_rift_text' },
  'forest-shrine': { title: 'boss_lore_forest_shrine_title', text: 'boss_lore_forest_shrine_text' },
  'hub-catacombs': { title: 'boss_lore_hub_catacombs_title', text: 'boss_lore_hub_catacombs_text' },
  // W-E3 切片28：后四座（幽暗 / 辉煌 / 时线 / 边境）建的时候只配了战斗里的四句台词
  // （`bossDialogue.js` 的 intro/p2/p3/defeat），这两张开场表里一格都没写 ⇒ 玩家进那四座
  // 副本看到的是兜底名「迷宫守钥者」和一句通用正文，而同一场战斗的第三句已经是特写。
  // 兜底不是 bug（缺登记时它就该接着），**恒走兜底才是** —— 覆盖率由
  // `tests/dungeon-narrative-coverage.test.js` 逐座钉住，缺一座当场点名。
  'gloom-mist-crypt': { title: 'boss_lore_gloom_mist_crypt_title', text: 'boss_lore_gloom_mist_crypt_text' },
  'radiant-dawn-hall': { title: 'boss_lore_radiant_dawn_hall_title', text: 'boss_lore_radiant_dawn_hall_text' },
  'void-broken-casket': { title: 'boss_lore_void_broken_casket_title', text: 'boss_lore_void_broken_casket_text' },
  'abyss-deep-maw': { title: 'boss_lore_abyss_deep_maw_title', text: 'boss_lore_abyss_deep_maw_text' },
};


/**
 * 章节导语（**文案键**，W-D2 切片16c）。
 *
 * 键名 `chapter_intro_<章节>_title` / `_text`。显示侧：`game/StoryDirector.js`
 * 在 `chapter-changed` 那一帧展开一次，对话框与日志条目拿到同一份。
 */
export const CHAPTER_INTROS = {
  2: {
    title: 'chapter_intro_2_title',
    text: 'chapter_intro_2_text',
  },
  3: {
    title: 'chapter_intro_3_title',
    text: 'chapter_intro_3_text',
  },
  4: {
    title: 'chapter_intro_4_title',
    text: 'chapter_intro_4_text',
  },
  5: {
    title: 'chapter_intro_5_title',
    text: 'chapter_intro_5_text',
  },
};


/**
 * 区域故事钩子（**文案键**，W-D2 切片16c）。
 *
 * 键名 `zone_hook_<区>_toast` / `zone_hook_<区>_journal`。
 *
 * **这份表是区域钩子的唯一真源** —— 改前 `game/StoryDirector.js` 自己又手抄了六句
 * `journal`（逐字等于这里的 `journal` 字段），两处各说各的：改这一处，另一处不变。
 * 现在 `StoryDirector` 直接读这份表，抄本随本片一并删净。
 */
export const ZONE_STORY_HOOKS = {
  hub: {
    toast: 'zone_hook_hub_toast',
    journal: 'zone_hook_hub_journal',
  },
  fantasy: {
    toast: 'zone_hook_fantasy_toast',
    journal: 'zone_hook_fantasy_journal',
  },
  magic: {
    toast: 'zone_hook_magic_toast',
    journal: 'zone_hook_magic_journal',
  },
  space: {
    toast: 'zone_hook_space_toast',
    journal: 'zone_hook_space_journal',
  },
  void: {
    toast: 'zone_hook_void_toast',
    journal: 'zone_hook_void_journal',
  },
  abyss: {
    toast: 'zone_hook_abyss_toast',
    journal: 'zone_hook_abyss_journal',
  },
};


/**
 * NPC 章节台词池（W-D2 切片14）。
 *
 * **这里存的是文案键，不是正文** —— 与 `npc.lines`（`world/NPCManager.js` 里那份）同一个口径。
 * 切片12 曾经把两个池子混着处理（`keyText(t(raw))`），正文被当键名查 ⇒ 30/30 句章节台词
 * 念成 `[MISSING: …]`（B119）；切片13 修掉症状，这一片把**因**收掉：正文进双表，
 * 池子里只剩键，两个池子从此共用一条展开链（`npcLine`）。
 *
 * 键名 `npc_<谁>_c<章>_<池内下标>`；`content/ambientLore.js` 的致敬层追加用 `_p` 前缀。
 * 与 `npc.lines` 那七条重名的两句复用旧键（一行文案只有一个键）。
 */
export const NPC_CHAPTER_LINES = mergeNpcChapterLines({

  wanderer: {
    1: ['npc_wanderer_0', 'npc_wanderer_c1_1'],
    2: ['npc_wanderer_c2_0', 'npc_wanderer_c2_1'],
    3: ['npc_wanderer_c3_0', 'npc_wanderer_c3_1'],
    4: ['npc_wanderer_c4_0', 'npc_wanderer_c4_1'],
    5: ['npc_wanderer_c5_0', 'npc_wanderer_c5_1'],
  },

  'elf-scout': {
    1: ['npc_scout_c1_0', 'npc_scout_c1_1'],
    2: ['npc_scout_c2_0', 'npc_scout_c2_1'],
    3: ['npc_scout_c3_0', 'npc_scout_c3_1'],
    4: ['npc_scout_c4_0', 'npc_scout_c4_1'],
    5: ['npc_scout_c5_0', 'npc_scout_c5_1'],
  },

  'astronaut-echo': {
    1: ['npc_astronaut_0', 'npc_astronaut_c1_1'],
    2: ['npc_astronaut_c2_0', 'npc_astronaut_c2_1'],
    3: ['npc_astronaut_c3_0', 'npc_astronaut_c3_1'],
    4: ['npc_astronaut_c4_0', 'npc_astronaut_c4_1'],
    5: ['npc_astronaut_c5_0', 'npc_astronaut_c5_1'],
  },

});


/**
 * 副本进入语（**文案键**，W-D2 切片16c）。
 *
 * 键名 `dungeon_enter_<副本 id>`。显示侧：`DungeonManager.enter()` 那一刻展开。
 */
export const DUNGEON_ENTER_LINES = {
  'ruin-crypt': 'dungeon_enter_ruin_crypt',
  'forbidden-library': 'dungeon_enter_forbidden_library',
  'five-dim-rift': 'dungeon_enter_five_dim_rift',
  'forest-shrine': 'dungeon_enter_forest_shrine',
  'hub-catacombs': 'dungeon_enter_hub_catacombs',
  // W-E3 切片28：后四座补上自己的那一句 —— 缺登记时 `DungeonManager` 走的是**空串**
  // （进入对话框只剩那行迷宫统计），既不报错也不留痕，所以只能由覆盖率门禁说话。
  'gloom-mist-crypt': 'dungeon_enter_gloom_mist_crypt',
  'radiant-dawn-hall': 'dungeon_enter_radiant_dawn_hall',
  'void-broken-casket': 'dungeon_enter_void_broken_casket',
  'abyss-deep-maw': 'dungeon_enter_abyss_deep_maw',
};


/**
 * 副本守钥者倒下后的收束语（**文案键**，W-D2 切片16c）。
 *
 * 改前这两句直接写在 `game/StoryDirector.js` 的监听里 —— 那里是唯一一处"数据写在
 * 行为文件里"的地方。现在与其它叙事文案同口径：数据层存键，显示侧展开。
 */
export const KEYWARDEN_CLEARED = {
  title: 'keywarden_cleared_title',
  text: 'keywarden_cleared_text',
};
