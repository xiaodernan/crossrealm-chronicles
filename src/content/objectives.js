/**
 * 目标/任务定义表（W-B3 切片1 建的数据层；切片4 起在役读者只有 `game/QuestSystem.js`）。
 *
 * 结构：
 * - objectives: 目标定义数组，一行说的话只有这几种：怎么算完成、完成时落哪面旗、前置要哪几面旗、跳到哪一步、给多少魂火、日志与路点怎么写
 * - 字段：
 *   - id: kebab-case 唯一标识符
 *   - title: 显示标题
 *   - desc: 描述（支持 {动作} 占位）
 *   - type: 目标类型。允许值就是 `OBJECTIVE_TYPES` 那一格（判据 `objectiveDone` 认得的也只有它）
 *   - targetId: 交互/发现/击杀/对话目标 id（可选）
 *   - target: 数值目标值（可选）
 *   - enemyType: 敌人类型（kills 类型用）
 *   - bossId: Boss id（boss 类型用）
 *   - dungeonId: 地下城 id（dungeon 类型用）
 *   - chapter: **玩家此刻在第几章**（W-B3 切片3 定的口径，见下面那段注释）
 *   - announce: 只有章节门控那一族有 —— 跨过这一格时对玩家喊的那一句（"Chapter 2：… 已开启"）
 *   - autoComplete: 只有章节门控那一族有 —— 走到这一格本身即完成（玩家没有可做的事）
 *   - condition: 运行时条件函数名（字符串，引用 CONDITIONS 表）
 *   - flags: 完成时设置的标志 { flagName: true/false }
 *   - requires: 前置标志要求 { flagName: true/false }（全部满足才可激活；
 *     W-E3 切片24 起由 `objectiveRequiresMet` 在运行时读，旗标账本是 `stats.objectiveFlags`）
 *   - branchTo: 分支目标 id。**运行时真读**（W-E3 切片46 核过）：非抉择步走完时
 *     `QuestSystem.advance()` 直接跳到这里（`second-ember` / `final-keep` 那一族）；
 *     目标若是章节门（门不在 `MAINLINE` 里），落点由 `mainlineIndexAfterGate` 算成
 *     "门后第一步"，门自己的旗标与翻章由 `chapterGateById` 补上。注册表另有一条整表
 *     不变式拿它核对"门的前一行是不是指回这道门"（改序时它会红）
 *   - reward: 完成奖励魂火
 *   - journal: 完成后日志文本
 *   - waypoint: 世界坐标指引 { x, z, label }
 * - **没有的字段**（这一行存在的理由：从前 schema 答应过，没人实现）：
 *   `failsOn` / `failMessage` / `onFail` / `branchCondition` / `revisit`。前三个是
 *   `ObjectiveEngine`（W-B3 切片4 已删）留下的 schema 幽灵，`branchCondition` 五行写的
 *   都是本行 `condition` 的逐字副本，`revisit` 全表只有一行写过 —— 全仓没有任何一处读它们，
 *   写进行里不会有任何后果。要做任务失败或可重访目标，先从"哪一行的什么条件算失败"这张表
 *   立起来，而不是让注册表先答应下来。这条由 `tests/content-schema-readers.test.js` 钉住
 *   （"每一格都有读者"那一组，含七条变异臂）。
 */

import { ZONE_IDS, ZONE_NAMES } from './ZoneIdentity.js';
import { TRIAL_DUNGEON_IDS, dungeonDefOf } from './dungeons.js';
import { bossById } from './bossRoster.js';
import { GEAR_SLOTS } from './gear.js';

/* ------------------------------------------------------------------ *
 * `chapter` 到底说什么（W-B3 切片3 实测之后改的口径）
 *
 * 这张表刚写下来时它说的是"这一格属于哪一章"，而在役那套读的是"玩家现在在第几章"
 * —— 同一个键两种意思，而且当场对不上：`magic-frag`..`finale` 四格被标成第 2 章，
 * 玩家做这四格时 HUD 上明明白白写着 Chapter 1（章节要等'重铸锚点'完成才翻）。
 * 两套读法最坏的后果不是显示，而是**没人能查出另一套错了**：死代码那份读前者，
 * 在役那份读后者，于是两边各自都"对"。
 *
 * 现在只留一种意思：**拿这一格的时候，玩家在第几章**。于是
 * - 章节号沿表**只升不降**（由注册表的整表不变式盯着），
 * - 门控那一格的 `chapter` 就是它开的那一章（跨过它时玩家进入这一章），
 * - 在役的 sequencer 不需要再认"哪一步完成时该翻章"（那是四行 `finished?.id === …`）。
 *
 * 改动的六格（值不是猜的，是在役那四道写死的翻转反推出来的）：
 * `magic-frag` / `golem` / `space-frag` / `finale` 2→1，`ch3-complete` 3→4，`ch4-complete` 4→5。
 * ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */

/**
 * 判据认得的类型名，全仓一份（注册表拿它当 `type` 的允许值）。
 *
 * 为什么值得钉死：`objectiveDone` 对认不出的类型返回 `false`，而"这一步永远过不了"
 * 在游戏里不报错 —— 表里打错一个字母（`bos2`）的表现就是主线卡死在那一格，
 * 玩家看到的是"完成"两个字再也不出现。写错的人拿不到任何线索。
 */
export const OBJECTIVE_TYPES = [
  'interact', 'hits', 'kills', 'discovery', 'boss', 'chapter-gate',
  'spells', 'dungeon', 'chests', 'npc', 'level', 'mind',
  'charged', 'skills-unlocked', 'dungeon-rerun', 'gear', 'choice',
];

export const OBJECTIVES = [
  // ── Chapter 1: 觉醒 ──
  {
    id: 'anchor',
    title: 'obj_anchor_title',
    desc: 'obj_anchor_desc',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 1,
    waypoint: { x: 0, z: 55, label: 'wp_label_anchor' },
    reward: 10,
    journal: 'obj_anchor_journal',
  },
  {
    id: 'training',
    title: 'obj_training_title',
    desc: 'obj_training_desc',
    type: 'hits',
    target: 8,
    chapter: 1,
    waypoint: { x: 12, z: 52, label: 'enemy_name_dummy' },
    reward: 5,
    journal: 'obj_training_journal',
  },
  {
    id: 'hub-catacombs',
    title: 'obj_hub_catacombs_title',
    desc: 'obj_hub_catacombs_desc',
    type: 'dungeon',
    dungeonId: 'hub-catacombs',
    chapter: 1,
    reward: 20,
    journal: 'obj_hub_catacombs_journal',
  },
  {
    id: 'soldiers',
    title: 'obj_soldiers_title',
    desc: 'obj_soldiers_desc',
    type: 'kills',
    enemyType: 'soldier',
    target: 2,
    chapter: 1,
    waypoint: { x: -200, z: 0, label: ZONE_NAMES[ZONE_IDS.FANTASY] },
    reward: 10,
    journal: 'obj_soldiers_journal',
    // W-E3 切片45：这一场遭遇战之后的两条线索，由下一步的抉择读它
    flags: { soldiersScattered: true },
  },
  {
    // W-E3 切片45：第 1 章教学段之后的第一处线索分岔 —— 追断箭，还是回旧营地。
    id: 'choice-first',
    title: 'obj_choice_first_title',
    desc: 'obj_choice_first_desc',
    type: 'choice',
    chapter: 1,
    requires: { soldiersScattered: true },
    waypoint: { x: -200, z: 0, label: 'wp_label_one_ring' },
    reward: 8,
    journal: 'obj_choice_first_journal',
    choices: [
      { id: 'arrow', label: 'obj_choice_first_arrow_label', flag: 'choice_first_arrow' },
      { id: 'camp', label: 'obj_choice_first_camp_label', flag: 'choice_first_camp' },
    ],
    // 两处线索都在灰白森林里，各走一步再汇合到「至尊石环」那一步。
    branch: {
      choice_first_arrow: 'first-arrow',
      choice_first_camp: 'first-camp',
    },
    titleByChoice: {
      choice_first_arrow: 'obj_choice_first_title_arrow',
      choice_first_camp: 'obj_choice_first_title_camp',
    },
    descByChoice: {
      choice_first_arrow: 'obj_choice_first_desc_arrow',
      choice_first_camp: 'obj_choice_first_desc_camp',
    },
    journalByChoice: {
      choice_first_arrow: 'obj_choice_first_journal_arrow',
      choice_first_camp: 'obj_choice_first_journal_camp',
    },
  },
  {
    id: 'first-arrow',
    title: 'obj_first_arrow_title',
    desc: 'obj_first_arrow_desc',
    type: 'discovery',
    targetId: 'first-arrow',
    chapter: 1,
    waypoint: { x: -170, z: 35, label: 'zone_poi_first_arrow_label' },
    reward: 12,
    journal: 'obj_first_arrow_journal',
    branchTo: 'fantasy-frag',
  },
  {
    id: 'first-camp',
    title: 'obj_first_camp_title',
    desc: 'obj_first_camp_desc',
    type: 'discovery',
    targetId: 'first-camp',
    chapter: 1,
    waypoint: { x: -280, z: -60, label: 'zone_poi_first_camp_label' },
    reward: 12,
    journal: 'obj_first_camp_journal',
    branchTo: 'fantasy-frag',
  },
  {
    id: 'fantasy-frag',
    title: 'obj_fantasy_frag_title',
    desc: 'obj_fantasy_frag_desc',
    type: 'discovery',
    targetId: 'fantasy-ring',
    chapter: 1,
    waypoint: { x: -200, z: -30, label: 'wp_label_one_ring' },
    reward: 15,
    journal: 'obj_fantasy_frag_journal',
    flags: { hasFragmentFantasy: true },
  },
  {
    id: 'fantasy-ruins',
    title: 'obj_fantasy_ruins_title',
    desc: 'obj_fantasy_ruins_desc',
    type: 'discovery',
    targetId: 'fantasy-ruins',
    chapter: 1,
    waypoint: { x: -220, z: -15, label: 'wp_label_fantasy_ruins' },
    reward: 12,
    journal: 'obj_fantasy_ruins_journal',
  },
  {
    id: 'elf-scout',
    title: 'obj_elf_scout_title',
    desc: 'obj_elf_scout_desc',
    type: 'npc',
    targetId: 'elf-scout',
    chapter: 1,
    waypoint: { x: -160, z: 30, label: 'wp_label_elf_scout' },
    reward: 12,
    journal: 'obj_elf_scout_journal',
  },
  {
    id: 'boss',
    title: bossById('shadow-warden').shortNameKey,
    desc: 'obj_boss_desc',
    type: 'boss',
    bossId: 'shadow-warden',
    chapter: 1,
    waypoint: { x: -250, z: -35, label: bossById('shadow-warden').shortNameKey },
    reward: 25,
    journal: 'obj_boss_journal',
    flags: { boss1Defeated: true },
  },
  // ── Chapter 2: 无尽位面 ──
  {
    id: 'magic-frag',
    title: 'obj_magic_frag_title',
    desc: 'obj_magic_frag_desc',
    type: 'discovery',
    targetId: 'magic-castle',
    chapter: 1,
    requires: { boss1Defeated: true },
    waypoint: { x: 0, z: -180, label: ZONE_NAMES[ZONE_IDS.MAGIC] },
    reward: 15,
    journal: 'obj_magic_frag_journal',
    flags: { hasFragmentMagic: true },
  },
  {
    id: 'golem',
    title: 'obj_golem_title',
    desc: 'obj_golem_desc',
    type: 'kills',
    enemyType: 'golem',
    target: 1,
    chapter: 1,
    waypoint: { x: 20, z: -210, label: 'wp_label_golem_patrol' },
    reward: 10,
    journal: 'obj_golem_journal',
  },
  {
    id: 'space-frag',
    title: 'obj_space_frag_title',
    desc: 'obj_space_frag_desc',
    type: 'discovery',
    targetId: 'space-tesseract',
    chapter: 1,
    requires: { hasFragmentMagic: true },
    waypoint: { x: 200, z: 80, label: ZONE_NAMES[ZONE_IDS.SPACE] },
    reward: 15,
    journal: 'obj_space_frag_journal',
    flags: { hasFragmentSpace: true },
  },
  {
    id: 'finale',
    title: 'obj_finale_title',
    desc: 'obj_finale_desc',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 1,
    requires: { hasFragmentFantasy: true, hasFragmentMagic: true, hasFragmentSpace: true },
    condition: 'checkAllFragments',
    waypoint: { x: 0, z: 55, label: 'wp_label_anchor' },
    reward: 30,
    journal: 'obj_finale_journal',
    branchTo: 'ch1-complete',
  },
  {
    id: 'ch1-complete',
    title: 'obj_ch1_complete_title',
    desc: 'obj_ch1_complete_desc',
    type: 'chapter-gate',
    chapter: 2,
    autoComplete: true,
    announce: 'obj_ch1_complete_announce',
    reward: 0,
    journal: 'obj_ch1_complete_journal',
    flags: { chapter1Done: true },
  },
  {
    id: 'chests',
    title: 'obj_chests_title',
    desc: 'obj_chests_desc',
    type: 'chests',
    target: 5,
    chapter: 2,
    // W-E3 切片37：这一格从前把碎石墓穴的 entrance 又抄了一遍（坐标逐格相同、名字另开一句）。
    // 现在只写"指哪一座"—— 坐标从 `content/dungeons.js` 现问，行上留的是那句**提示语**
    // （"宝箱/地下城"说的是"为什么指这儿"，不是第二份门名）。
    waypoint: { dungeonId: 'ruin-crypt', label: 'wp_label_chests_dungeon' },
    reward: 20,
    journal: 'obj_chests_journal',
  },
  {
    id: 'forest-shrine',
    title: 'obj_forest_shrine_title',
    desc: 'obj_forest_shrine_desc',
    type: 'dungeon',
    dungeonId: 'forest-shrine',
    chapter: 2,
    reward: 22,
    journal: 'obj_forest_shrine_journal',
  },
  {
    id: 'fantasy-tower',
    title: 'obj_fantasy_tower_title',
    desc: 'obj_fantasy_tower_desc',
    type: 'discovery',
    targetId: 'fantasy-tower',
    chapter: 2,
    waypoint: { x: -140, z: -50, label: 'wp_label_fantasy_tower' },
    reward: 14,
    journal: 'obj_fantasy_tower_journal',
  },
  {
    id: 'talk-wanderer',
    title: 'obj_talk_wanderer_title',
    desc: 'obj_talk_wanderer_desc',
    type: 'npc',
    targetId: 'wanderer',
    chapter: 2,
    waypoint: { x: -8, z: 45, label: 'wp_label_wanderer' },
    reward: 10,
    journal: 'obj_talk_wanderer_journal',
    flags: { talkedWanderer: true },
  },
  {
    id: 'boss2',
    title: bossById('archmagus').shortNameKey,
    // `desc` 是**玩家读到的成段文案**，按本仓口径钉字面（`tests/zone-name-legacy.test.js`：
    // 玩家读到的那几句钉字面，等式两边一起改口才看得见）—— 它不从名册派生。
    desc: 'obj_boss2_desc',
    type: 'boss',
    bossId: 'archmagus',
    chapter: 2,
    waypoint: { x: 5, z: -220, label: bossById('archmagus').shortNameKey },
    reward: 30,
    journal: 'obj_boss2_journal',
    flags: { boss2Defeated: true },
  },
  {
    id: 'elite',
    title: 'wp_label_void_knight',
    desc: 'obj_elite_desc',
    type: 'kills',
    enemyType: 'elite',
    target: 1,
    chapter: 2,
    waypoint: { x: -50, z: -60, label: 'wp_label_void_knight' },
    reward: 15,
    journal: 'obj_elite_journal',
  },
  {
    id: 'hexer-hunt',
    title: 'obj_hexer_hunt_title',
    desc: 'obj_hexer_hunt_desc',
    type: 'kills',
    enemyType: 'hexer',
    target: 3,
    chapter: 2,
    waypoint: { x: 60, z: -215, label: 'enemy_name_hexer' },
    reward: 15,
    journal: 'obj_hexer_hunt_journal',
  },
  {
    id: 'magic-forest',
    title: 'obj_magic_forest_title',
    desc: 'obj_magic_forest_desc',
    type: 'discovery',
    targetId: 'magic-forest',
    chapter: 2,
    waypoint: { x: 55, z: -150, label: 'wp_label_magic_forest' },
    reward: 14,
    journal: 'obj_magic_forest_journal',
  },
  {
    id: 'gear-charm',
    title: 'obj_gear_charm_title',
    desc: 'obj_gear_charm_desc',
    type: 'gear',
    gearSlot: 'charm',
    chapter: 2,
    waypoint: { x: 0, z: 55, label: 'wp_label_campfire_upgrade' },
    reward: 12,
    journal: 'obj_gear_charm_journal',
  },
  {
    id: 'level',
    title: 'obj_level_title',
    desc: 'obj_level_desc',
    type: 'level',
    target: 5,
    chapter: 2,
    waypoint: { x: 0, z: 55, label: 'wp_label_campfire_upgrade' },
    reward: 10,
    journal: 'obj_level_journal',
  },
  {
    // W-E3 切片42：第 2 章的收尾抉择 —— 临行前只能带走一样东西。
    id: 'choice-second',
    title: 'obj_choice_second_title',
    desc: 'obj_choice_second_desc',
    type: 'choice',
    chapter: 2,
    requires: { boss2Defeated: true },
    waypoint: { x: 0, z: 55, label: 'wp_label_campfire_upgrade' },
    reward: 12,
    journal: 'obj_choice_second_journal',
    // W-E3 切片43：与第 3 章那处同款 —— 抉择后这一步的名字 / 进度句 / 日志跟着变。
    titleByChoice: {
      choice_second_ember: 'obj_choice_second_title_ember',
      choice_second_stone: 'obj_choice_second_title_stone',
    },
    descByChoice: {
      choice_second_ember: 'obj_choice_second_desc_ember',
      choice_second_stone: 'obj_choice_second_desc_stone',
    },
    journalByChoice: {
      choice_second_ember: 'obj_choice_second_journal_ember',
      choice_second_stone: 'obj_choice_second_journal_stone',
    },
    choices: [
      { id: 'ember', label: 'obj_choice_second_ember_label', flag: 'choice_second_ember' },
      { id: 'stone', label: 'obj_choice_second_stone_label', flag: 'choice_second_stone' },
    ],
    // 两条路各去一处 POI，再在「尾声」汇合 —— 与第 3 / 4 章同一条机器，
    // 但这一处是**第 2 章的收尾**：选完就走，不引入新的一章。
    branch: {
      choice_second_ember: 'second-ember',
      choice_second_stone: 'second-stone',
    },
  },
  {
    // 火盆之路：守望塔下那盆没熄的火（世界坐标 = 奇幻区中心 + (-45, 40)）
    id: 'second-ember',
    title: 'obj_second_ember_title',
    desc: 'obj_second_ember_desc',
    type: 'discovery',
    targetId: 'second-ember',
    chapter: 2,
    waypoint: { x: -245, z: 40, label: 'zone_poi_second_ember_label' },
    reward: 18,
    journal: 'obj_second_ember_journal',
    branchTo: 'epilogue',
  },
  {
    // 界碑之路：禁林边缘那块被磨浅的界碑（世界坐标 = 魔法区中心 + (-60, -45)）
    id: 'second-stone',
    title: 'obj_second_stone_title',
    desc: 'obj_second_stone_desc',
    type: 'discovery',
    targetId: 'second-stone',
    chapter: 2,
    waypoint: { x: -60, z: -225, label: 'zone_poi_second_stone_label' },
    reward: 18,
    journal: 'obj_second_stone_journal',
    branchTo: 'epilogue',
  },
  {
    id: 'epilogue',
    title: 'obj_epilogue_title',
    desc: 'obj_epilogue_desc',
    type: 'npc',
    targetId: 'astronaut-echo',
    chapter: 2,
    requires: { boss2Defeated: true },
    waypoint: { x: 200, z: 90, label: 'wp_label_astronaut_echo' },
    reward: 15,
    journal: 'obj_epilogue_journal',
    flags: { chapter3Ready: true },
    branchTo: 'ch2-complete',
  },
  {
    id: 'ch2-complete',
    title: 'obj_ch2_complete_title',
    desc: 'obj_ch2_complete_desc',
    type: 'chapter-gate',
    chapter: 3,
    autoComplete: true,
    announce: 'obj_ch2_complete_announce',
    reward: 0,
    journal: 'obj_ch2_complete_journal',
    flags: { chapter2Done: true },
  },
  // ── Chapter 3: 位面飞升 ──
  {
    id: 'learn-spell',
    title: 'obj_learn_spell_title',
    desc: 'obj_learn_spell_desc',
    type: 'spells',
    target: 8,
    chapter: 3,
    waypoint: { x: 12, z: 52, label: 'enemy_name_dummy' },
    reward: 10,
    journal: 'obj_learn_spell_journal',
  },
  {
    id: 'crypt',
    title: 'obj_crypt_title',
    desc: 'obj_crypt_desc',
    type: 'dungeon',
    dungeonId: 'ruin-crypt',
    chapter: 3,
    reward: 20,
    journal: 'obj_crypt_journal',
    flags: { dungeonCryptCleared: true },
  },
  {
    id: 'library',
    title: 'obj_library_title',
    desc: 'obj_library_desc',
    type: 'dungeon',
    dungeonId: 'forbidden-library',
    chapter: 3,
    reward: 20,
    journal: 'obj_library_journal',
    flags: { dungeonLibraryCleared: true },
  },
  {
    id: 'rift',
    title: 'obj_rift_title',
    desc: 'obj_rift_desc',
    type: 'dungeon',
    dungeonId: 'five-dim-rift',
    chapter: 3,
    reward: 20,
    journal: 'obj_rift_journal',
    flags: { dungeonRiftCleared: true },
  },
  {
    id: 'space-lens',
    title: 'obj_space_lens_title',
    desc: 'obj_space_lens_desc',
    type: 'discovery',
    targetId: 'space-lens',
    chapter: 3,
    waypoint: { x: 220, z: 120, label: 'wp_label_space_lens' },
    reward: 18,
    journal: 'obj_space_lens_journal',
  },
  {
    id: 'space-wreck',
    title: 'obj_space_wreck_title',
    desc: 'obj_space_wreck_desc',
    type: 'discovery',
    targetId: 'space-wreck',
    chapter: 3,
    waypoint: { x: 250, z: 60, label: 'wp_label_space_wreck' },
    reward: 16,
    journal: 'obj_space_wreck_journal',
  },
  {
    id: 'boss3',
    title: bossById('singularity-herald').shortNameKey,
    desc: 'obj_boss3_desc',
    type: 'boss',
    bossId: 'singularity-herald',
    chapter: 3,
    waypoint: { x: 235, z: 155, label: bossById('singularity-herald').shortNameKey },
    reward: 35,
    journal: 'obj_boss3_journal',
    flags: { boss3Defeated: true },
  },
  {
    id: 'mind',
    title: 'obj_mind_title',
    desc: 'obj_mind_desc',
    type: 'mind',
    target: 2,
    chapter: 3,
    waypoint: { x: 0, z: 55, label: 'wp_label_campfire_upgrade' },
    reward: 10,
    journal: 'obj_mind_journal',
  },
  {
    // W-E3 切片41：第三章的**第一处分岔**（剩余四章单线里的第一条）。
    // 影界守护者倒下之后，玩家自己选"怎么上去"：观测（去引力透镜校准）或回溯（回钟楼走旧路）。
    // 两条路各走一步自己的落点，再在 `ascension`（摸世界之锚）汇合 ——
    // 与第四章 `choice-void` 同一套机器（`branch` / `branchTo`），只是这一次**不写迁移**。
    id: 'choice-ascend',
    title: 'obj_choice_ascend_title',
    desc: 'obj_choice_ascend_desc',
    type: 'choice',
    chapter: 3,
    requires: { boss3Defeated: true },
    waypoint: { x: 0, z: 55, label: 'wp_label_anchor' },
    reward: 10,
    journal: 'obj_choice_ascend_journal',
    // W-E3 切片43：这一步自己的名字 / 进度句 / 日志也随玩家选的那条路变
    // （切片36 的三格名册在真结局上立的口径，搬到两处新抉择上）。
    titleByChoice: {
      choice_ascend_observed: 'obj_choice_ascend_title_observed',
      choice_ascend_retraced: 'obj_choice_ascend_title_retraced',
    },
    descByChoice: {
      choice_ascend_observed: 'obj_choice_ascend_desc_observed',
      choice_ascend_retraced: 'obj_choice_ascend_desc_retraced',
    },
    journalByChoice: {
      choice_ascend_observed: 'obj_choice_ascend_journal_observed',
      choice_ascend_retraced: 'obj_choice_ascend_journal_retraced',
    },
    choices: [
      { id: 'observe', label: 'obj_choice_ascend_observe_label', flag: 'choice_ascend_observed' },
      { id: 'retrace', label: 'obj_choice_ascend_retrace_label', flag: 'choice_ascend_retraced' },
    ],
    branch: {
      choice_ascend_observed: 'ascend-observe',
      choice_ascend_retraced: 'ascend-retrace',
    },
  },
  {
    // 观测之路：引力透镜旁的校准环（世界坐标 = 空间区中心 + (-20, 20)）
    id: 'ascend-observe',
    title: 'obj_ascend_observe_title',
    desc: 'obj_ascend_observe_desc',
    type: 'discovery',
    targetId: 'ascend-calibration-ring',
    chapter: 3,
    waypoint: { x: 180, z: 100, label: 'zone_poi_ascend_calibration_ring_label' },
    reward: 18,
    journal: 'obj_ascend_observe_journal',
    branchTo: 'ascension',
  },
  {
    // 回溯之路：霍格沃兹遗址的创始人钟楼（世界坐标 = 魔法区中心 + (15, -35)）
    id: 'ascend-retrace',
    title: 'obj_ascend_retrace_title',
    desc: 'obj_ascend_retrace_desc',
    type: 'discovery',
    targetId: 'ascend-founder-belfry',
    chapter: 3,
    waypoint: { x: 15, z: -215, label: 'zone_poi_ascend_founder_belfry_label' },
    reward: 18,
    journal: 'obj_ascend_retrace_journal',
    branchTo: 'ascension',
  },
  {
    id: 'ascension',
    title: 'obj_ascension_title',
    desc: 'obj_ascension_desc',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 3,
    requires: { boss3Defeated: true },
    condition: 'checkAllDungeons',
    waypoint: { x: 0, z: 55, label: 'wp_label_anchor' },
    reward: 40,
    journal: 'obj_ascension_journal',
    flags: { chapter3Done: true },
    branchTo: 'ch3-complete',
  },
  {
    id: 'ch3-complete',
    title: 'obj_ch3_complete_title',
    desc: 'obj_ch3_complete_desc',
    type: 'chapter-gate',
    chapter: 4,
    autoComplete: true,
    announce: 'obj_ch3_complete_announce',
    reward: 0,
    journal: 'obj_ch3_complete_journal',
    flags: { chapter3Done: true },
  },
  // ── Chapter 4: 破碎时线 ──
  {
    id: 'gear-sigil',
    title: 'obj_gear_sigil_title',
    desc: 'obj_gear_sigil_desc',
    type: 'gear',
    gearSlot: 'sigil',
    chapter: 4,
    waypoint: { x: 0, z: 55, label: 'wp_label_campfire_upgrade' },
    reward: 16,
    journal: 'obj_gear_sigil_journal',
  },
  {
    id: 'void-rift',
    title: 'obj_void_rift_title',
    desc: 'obj_void_rift_desc',
    type: 'discovery',
    targetId: 'void-rift',
    chapter: 4,
    requires: { chapter3Done: true },
    waypoint: { x: 0, z: 220, label: ZONE_NAMES[ZONE_IDS.VOID] },
    reward: 15,
    journal: 'obj_void_rift_journal',
    flags: { hasVoidRift: true },
  },
  {
    id: 'charge-spell',
    title: 'obj_charge_spell_title',
    desc: 'obj_charge_spell_desc',
    type: 'charged',
    target: 5,
    chapter: 4,
    waypoint: { x: 12, z: 52, label: 'enemy_name_dummy' },
    reward: 15,
    journal: 'obj_charge_spell_journal',
  },
  {
    id: 'void-hunt',
    title: 'obj_void_hunt_title',
    desc: 'obj_void_hunt_desc',
    type: 'kills',
    enemyType: 'wraith',
    target: 3,
    chapter: 4,
    waypoint: { x: 0, z: 220, label: 'zone_name_void' },
    reward: 15,
    journal: 'obj_void_hunt_journal',
  },
  {
    id: 'crawler-hunt',
    title: 'obj_crawler_hunt_title',
    desc: 'obj_crawler_hunt_desc',
    type: 'kills',
    enemyType: 'crawler',
    target: 3,
    chapter: 4,
    waypoint: { x: 40, z: 168, label: 'enemy_name_crawler' },
    reward: 18,
    journal: 'obj_crawler_hunt_journal',
  },
  {
    // W-E3 切片69：虚空幻影进主线 —— 虚空断口的独占残影，插在爬兽清剿后、破棺副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'void-phantom-hunt',
    title: 'obj_void_phantom_hunt_title',
    desc: 'obj_void_phantom_hunt_desc',
    type: 'kills',
    enemyType: 'void_phantom',
    target: 3,
    chapter: 4,
    waypoint: { x: -10, z: 190, label: 'enemy_name_void_phantom' },
    reward: 18,
    journal: 'obj_void_phantom_hunt_journal',
  },
  {
    // W-E3 切片72：虚空裂隙行者进主线 —— 虚空断口的第二独占，插在幻影清剿后、破棺副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'void-riftwalker-hunt',
    title: 'obj_void_riftwalker_hunt_title',
    desc: 'obj_void_riftwalker_hunt_desc',
    type: 'kills',
    enemyType: 'void_riftwalker',
    target: 3,
    chapter: 4,
    waypoint: { x: 20, z: 200, label: 'enemy_name_void_riftwalker' },
    reward: 18,
    journal: 'obj_void_riftwalker_hunt_journal',
  },
  {
    // W-E3 切片74：虚空潜伏者进主线 —— 虚空断口的第三独占，插在裂隙行者清剿后、破棺副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'void-lurker-hunt',
    title: 'obj_void_lurker_hunt_title',
    desc: 'obj_void_lurker_hunt_desc',
    type: 'kills',
    enemyType: 'void_lurker',
    target: 3,
    chapter: 4,
    waypoint: { x: -25, z: 210, label: 'enemy_name_void_lurker' },
    reward: 18,
    journal: 'obj_void_lurker_hunt_journal',
  },
  {
    // W-E3 切片76：虚空掠夺者进主线 —— 虚空断口第四独占，插在潜伏者清剿后、破棺副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'void-marauder-hunt',
    title: 'obj_void_marauder_hunt_title',
    desc: 'obj_void_marauder_hunt_desc',
    type: 'kills',
    enemyType: 'void_marauder',
    target: 3,
    chapter: 4,
    waypoint: { x: 5, z: 255, label: 'enemy_name_void_marauder' },
    reward: 18,
    journal: 'obj_void_marauder_hunt_journal',
  },
  {
    // W-E3 切片78：虚空刺蜇者进主线 —— 虚空断口第五独占，插在掠夺者后、断口副本前。
    // v21 起存档记 currentId，插步不必配迁移（但 ch4 插步会右移 void-casket 及之后下标）。
    id: 'void-stinger-hunt',
    title: 'obj_void_stinger_hunt_title',
    desc: 'obj_void_stinger_hunt_desc',
    type: 'kills',
    enemyType: 'void_stinger',
    target: 3,
    chapter: 4,
    waypoint: { x: 110, z: 250, label: 'enemy_name_void_stinger' },
    reward: 21,
    journal: 'obj_void_stinger_hunt_journal',
  },
  {
    // W-E3 切片80：虚空裂隙使进主线 —— 第六独占，插在刺蜇者后、断口副本前（ch4，v21 不写迁移；右移 choice-void）。
    id: 'void-ruptor-hunt',
    title: 'obj_void_ruptor_hunt_title',
    desc: 'obj_void_ruptor_hunt_desc',
    type: 'kills',
    enemyType: 'void_ruptor',
    target: 3,
    chapter: 4,
    waypoint: { x: 95, z: 260, label: 'enemy_name_void_ruptor' },
    reward: 22,
    journal: 'obj_void_ruptor_hunt_journal',
  },
  {
    // W-E3 切片82：虚空裂渊者进主线 —— 第七独占，插在裂隙使后、断口副本前（ch4，v21 不写迁移；右移 choice-void）。
    id: 'void-chasmer-hunt',
    title: 'obj_void_chasmer_hunt_title',
    desc: 'obj_void_chasmer_hunt_desc',
    type: 'kills',
    enemyType: 'void_chasmer',
    target: 3,
    chapter: 4,
    waypoint: { x: 120, z: 275, label: 'enemy_name_void_chasmer' },
    reward: 22,
    journal: 'obj_void_chasmer_hunt_journal',
  },
  {
    // W-E3 切片84：虚空残魂进主线 —— 第八独占，插在裂渊者后、断口副本前（ch4，v21 不写迁移；右移 choice-void）。
    id: 'void-revenant-hunt',
    title: 'obj_void_revenant_hunt_title',
    desc: 'obj_void_revenant_hunt_desc',
    type: 'kills',
    enemyType: 'void_revenant',
    target: 3,
    chapter: 4,
    waypoint: { x: 105, z: 235, label: 'enemy_name_void_revenant' },
    reward: 22,
    journal: 'obj_void_revenant_hunt_journal',
  },
  {
    // W-E3 切片86：虚空汲魂者进主线 —— 第九独占，插在残魂后、断口副本前（ch4，v21 不写迁移；右移 choice-void）。
    id: 'void-siphoner-hunt',
    title: 'obj_void_siphoner_hunt_title',
    desc: 'obj_void_siphoner_hunt_desc',
    type: 'kills',
    enemyType: 'void_siphoner',
    target: 3,
    chapter: 4,
    waypoint: { x: 85, z: 255, label: 'enemy_name_void_siphoner' },
    reward: 22,
    journal: 'obj_void_siphoner_hunt_journal',
  },
  {
    // W-E3 切片89：虚空裂爪兽进主线 —— 第十独占，插在汲魂者后、断口副本前（ch4，v21 不写迁移；右移 choice-void）。
    id: 'void-rendclaw-hunt',
    title: 'obj_void_rendclaw_hunt_title',
    desc: 'obj_void_rendclaw_hunt_desc',
    type: 'kills',
    enemyType: 'void_rendclaw',
    target: 3,
    chapter: 4,
    waypoint: { x: 100, z: 275, label: 'enemy_name_void_rendclaw' },
    reward: 23,
    journal: 'obj_void_rendclaw_hunt_journal',
  },
  {
    // W-E3 切片91：虚空号哭者进主线 —— 第十一独占，插在裂爪兽后、断口副本前（ch4，v21 不写迁移；右移 choice-void）。
    id: 'void-howler-hunt',
    title: 'obj_void_howler_hunt_title',
    desc: 'obj_void_howler_hunt_desc',
    type: 'kills',
    enemyType: 'void_howler',
    target: 3,
    chapter: 4,
    waypoint: { x: 90, z: 245, label: 'enemy_name_void_howler' },
    reward: 23,
    journal: 'obj_void_howler_hunt_journal',
  },
  {
    // W-E3 切片94：虚空缚裂者进主线 —— 第十二独占，插在号哭者后、断口副本前（ch4，v21 不写迁移；右移 choice-void）。
    id: 'void-riftbinder-hunt',
    title: 'obj_void_riftbinder_hunt_title',
    desc: 'obj_void_riftbinder_hunt_desc',
    type: 'kills',
    enemyType: 'void_riftbinder',
    target: 3,
    chapter: 4,
    waypoint: { x: 60, z: 225, label: 'enemy_name_void_riftbinder' },
    reward: 22,
    journal: 'obj_void_riftbinder_hunt_journal',
  },
  {
    id: 'void-casket',
    title: 'obj_void_casket_title',
    desc: 'obj_void_casket_desc',
    type: 'dungeon',
    dungeonId: 'void-broken-casket',
    chapter: 4,
    reward: 25,
    journal: 'obj_void_casket_journal',
  },
  {
    id: 'void-boss',
    title: bossById('void-chronarch').shortNameKey,
    desc: 'obj_void_boss_desc',
    type: 'boss',
    bossId: 'void-chronarch',
    chapter: 4,
    requires: { hasVoidRift: true },
    waypoint: { x: 0, z: 235, label: bossById('void-chronarch').shortNameKey },
    reward: 40,
    journal: 'obj_void_boss_journal',
    flags: { voidBossDefeated: true },
  },
  {
    id: 'void-tablet',
    title: 'obj_void_tablet_title',
    desc: 'obj_void_tablet_desc',
    type: 'discovery',
    targetId: 'void-tablet',
    chapter: 4,
    waypoint: { x: 0, z: 225, label: 'wp_label_void_tablet' },
    reward: 10,
    journal: 'obj_void_tablet_journal',
    flags: { hasVoidTablet: true },
  },
  {
    // W-E3 切片40：**主线真的插了一步，而且这一片没写迁移**。
    // 存档从 v21 起同时记 `quests.currentId` ⇒ 插步只挪下标、挪不动 id；
    // 老档读进来按 id 找回它原来那一步（第一次兑现那条承诺的读数在
    // `tests/quest-save-restore.test.js` 的"插步之后老档落回同一步"那条腿里）。
    id: 'void-oath',
    title: 'obj_void_oath_title',
    desc: 'obj_void_oath_desc',
    type: 'discovery',
    targetId: 'void-oath-stele',
    chapter: 4,
    // 碑文读完才看得懂这道断口（生产者在紧挨着的上一行，注册表核得着）。
    requires: { hasVoidTablet: true },
    waypoint: { x: -18, z: 196, label: 'zone_poi_void_oath_stele_label' },
    reward: 12,
    journal: 'obj_void_oath_journal',
  },
  {
    id: 'choice-void',
    title: 'obj_choice_void_title',
    desc: 'obj_choice_void_desc',
    type: 'choice',
    chapter: 4,
    requires: { voidBossDefeated: true, hasVoidTablet: true },
    waypoint: { x: 0, z: 225, label: 'wp_label_void_tablet' },
    reward: 15,
    journal: 'obj_choice_void_journal',
    // W-E3 切片43：抉择这一步自己的名字 / 进度句 / 日志也记下玩家选的那条
    // （`true-end` 那三格说的是**结局**；这一格说的是**你在这里做了什么选择**）。
    titleByChoice: {
      choice_void_sealed: 'obj_choice_void_title_sealed',
      choice_void_studied: 'obj_choice_void_title_studied',
    },
    descByChoice: {
      choice_void_sealed: 'obj_choice_void_desc_sealed',
      choice_void_studied: 'obj_choice_void_desc_studied',
    },
    journalByChoice: {
      choice_void_sealed: 'obj_choice_void_journal_sealed',
      choice_void_studied: 'obj_choice_void_journal_studied',
    },
    choices: [
      { id: 'seal', label: 'obj_choice_void_seal_label', flag: 'choice_void_sealed' },
      { id: 'study', label: 'obj_choice_void_study_label', flag: 'choice_void_studied' },
    ],
    // W-E3 切片35：分支树**真的分岔**（B3 的"零分支"那一半）。
    // 切片23 把机器造好了，但两条路都指回同一格 ⇒ 玩家读到的文案不同、走的路一样。
    // 现在各走一步自己的仪式（封印之路去虚空裂隙的石座，研习之路回魔法城堡抄一页），
    // 再在 `true-end` 汇合 —— "选了什么"第一次改变**去哪儿**，而不只是改变一句话。
    branch: {
      choice_void_sealed: 'seal-rite',
      choice_void_studied: 'study-rite',
    },
  },
  {
    // 封印之路：把碎裂的虚空压回石座（世界坐标 = 虚空区中心 + (-28, 12)）
    id: 'seal-rite',
    title: 'obj_seal_rite_title',
    desc: 'obj_seal_rite_desc',
    type: 'discovery',
    targetId: 'seal-stone',
    chapter: 4,
    // 抉择步那两枚前置由 `choice-void` 自己声明；这一步只要求碑文已读
    requires: { hasVoidTablet: true },
    waypoint: { x: -28, z: 232, label: ZONE_NAMES[ZONE_IDS.VOID] },
    reward: 22,
    journal: 'obj_seal_rite_journal',
    branchTo: 'true-end',
  },
  {
    // 研习之路：回魔法城堡的余烬里抄一页虚空文字（世界坐标 = 魔法区中心 + (-30, 25)）
    id: 'study-rite',
    title: 'obj_study_rite_title',
    desc: 'obj_study_rite_desc',
    type: 'discovery',
    targetId: 'echo-pages',
    chapter: 4,
    requires: { hasVoidTablet: true },
    waypoint: { x: -30, z: -155, label: ZONE_NAMES[ZONE_IDS.MAGIC] },
    reward: 22,
    journal: 'obj_study_rite_journal',
    branchTo: 'true-end',
  },
  {
    id: 'true-end',
    title: 'obj_true_end_title',
    desc: 'obj_true_end_desc',
    // W-E3 切片22：真结局的**文案**随玩家在「封印 / 研习」里选的那条走
    // ⇒ 抉择不再只是一句被记下的话（旗标名在这里是**引用**，注册表核它确有 choices 设过）
    // W-E3 切片23：真结局**分支**：抉择后走不同的下一步
    // ⇒ `branch` 映射：flag → 目标行 id；QuestSystem 会在推进时检查
    // ⇒ `descByChoice` 仍保留用于文案展开
    descByChoice: {
      choice_void_sealed: 'obj_true_end_desc_sealed',
      choice_void_studied: 'obj_true_end_desc_studied',
    },
    // W-E3 切片36：两个结局**各有各的名字与日志** —— 死键账本最后 4 枚在这里接线。
    // 标题进 HUD / 日志条目 / 完成提示 / 发现卡；日志进暂存日志的那一条正文。
    titleByChoice: {
      choice_void_sealed: 'obj_true_end_sealed_title',
      choice_void_studied: 'obj_true_end_studied_title',
    },
    journalByChoice: {
      choice_void_sealed: 'obj_true_end_sealed_journal',
      choice_void_studied: 'obj_true_end_studied_journal',
    },
    // W-E3 切片23：分支图——flag 名映射到下一步的行 id
    branch: {
      choice_void_sealed: 'ch4-complete',
      choice_void_studied: 'ch4-complete',
    },
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 4,
    requires: { voidBossDefeated: true, hasVoidRift: true, hasVoidTablet: true },
    condition: 'checkTrueEnd',
    waypoint: { x: 0, z: 55, label: 'wp_label_anchor' },
    reward: 50,
    journal: 'obj_true_end_journal',
    flags: { trueEndDone: true },
    branchTo: 'ch4-complete',
  },
  {
    id: 'ch4-complete',
    title: 'obj_ch4_complete_title',
    desc: 'obj_ch4_complete_desc',
    type: 'chapter-gate',
    chapter: 5,
    autoComplete: true,
    announce: 'obj_ch4_complete_announce',
    reward: 0,
    journal: 'obj_ch4_complete_journal',
    flags: { chapter4Done: true },
  },
  // ── Chapter 5: 混沌边境 ──
  {
    id: 'chaos-core',
    title: 'obj_chaos_core_title',
    desc: 'obj_chaos_core_desc',
    type: 'discovery',
    targetId: 'chaos-core',
    chapter: 5,
    requires: { chapter4Done: true },
    waypoint: { x: -200, z: 220, label: 'wp_label_chaos_core' },
    reward: 20,
    journal: 'obj_chaos_core_journal',
    flags: { hasChaosCore: true },
  },
  {
    id: 'knight-hunt',
    title: 'obj_knight_hunt_title',
    desc: 'obj_knight_hunt_desc',
    type: 'kills',
    enemyType: 'knight',
    target: 3,
    chapter: 5,
    waypoint: { x: -145, z: 250, label: 'enemy_name_knight' },
    reward: 25,
    journal: 'obj_knight_hunt_journal',
  },
  {
    id: 'skills',
    title: 'obj_skills_title',
    desc: 'obj_skills_desc',
    type: 'skills-unlocked',
    target: 3,
    chapter: 5,
    waypoint: { x: 0, z: 55, label: 'wp_label_campfire_weapon_skills' },
    reward: 15,
    journal: 'obj_skills_journal',
    flags: { skillsUnlocked3: true },
  },
  {
    // W-E3 切片70：深渊撕掠者进主线 —— 深渊之颚的独占猎手，插在技能解锁后、深渊副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'abyss-reaver-hunt',
    title: 'obj_abyss_reaver_hunt_title',
    desc: 'obj_abyss_reaver_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_reaver',
    target: 3,
    chapter: 5,
    waypoint: { x: -180, z: 240, label: 'enemy_name_abyss_reaver' },
    reward: 22,
    journal: 'obj_abyss_reaver_hunt_journal',
  },
  {
    // W-E3 切片71：深渊凝视者进主线 —— 深渊之颚的悬浮暗目，插在撕掠者清剿后、深渊副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'abyss-watcher-hunt',
    title: 'obj_abyss_watcher_hunt_title',
    desc: 'obj_abyss_watcher_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_watcher',
    target: 3,
    chapter: 5,
    waypoint: { x: -210, z: 260, label: 'enemy_name_abyss_watcher' },
    reward: 22,
    journal: 'obj_abyss_watcher_hunt_journal',
  },
  {
    // W-E3 切片73：深渊蛮兽进主线 —— 深渊之颚的重躯压迫者，插在凝视者清剿后、深渊副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'abyss-brute-hunt',
    title: 'obj_abyss_brute_hunt_title',
    desc: 'obj_abyss_brute_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_brute',
    target: 3,
    chapter: 5,
    waypoint: { x: -195, z: 270, label: 'enemy_name_abyss_brute' },
    reward: 22,
    journal: 'obj_abyss_brute_hunt_journal',
  },
  {
    // W-E3 切片75：深渊幽影进主线 —— 深渊之颚的相位伏击者，插在蛮兽清剿后、深渊副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'abyss-shade-hunt',
    title: 'obj_abyss_shade_hunt_title',
    desc: 'obj_abyss_shade_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_shade',
    target: 3,
    chapter: 5,
    waypoint: { x: -225, z: 225, label: 'enemy_name_abyss_shade' },
    reward: 22,
    journal: 'obj_abyss_shade_hunt_journal',
  },
  {
    // W-E3 切片77：深渊猎犬进主线 —— 深渊之颚第五独占，插在幽影清剿后、深渊副本前。
    // v21 起存档记 currentId，插步不必配迁移。
    id: 'abyss-hound-hunt',
    title: 'obj_abyss_hound_hunt_title',
    desc: 'obj_abyss_hound_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_hound',
    target: 3,
    chapter: 5,
    waypoint: { x: -205, z: 235, label: 'enemy_name_abyss_hound' },
    reward: 22,
    journal: 'obj_abyss_hound_hunt_journal',
  },
  {
    // W-E3 切片79：深渊沼兽进主线 —— 第六独占，插在猎犬后、深渊副本前（ch5，v21 不写迁移）。
    id: 'abyss-mire-hunt',
    title: 'obj_abyss_mire_hunt_title',
    desc: 'obj_abyss_mire_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_mire',
    target: 3,
    chapter: 5,
    waypoint: { x: -215, z: 250, label: 'enemy_name_abyss_mire' },
    reward: 23,
    journal: 'obj_abyss_mire_hunt_journal',
  },
  {
    // W-E3 切片81：深渊裂痕使进主线 —— 第七独占，插在沼兽后、深渊副本前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'abyss-scarbearer-hunt',
    title: 'obj_abyss_scarbearer_hunt_title',
    desc: 'obj_abyss_scarbearer_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_scarbearer',
    target: 3,
    chapter: 5,
    waypoint: { x: -190, z: 280, label: 'enemy_name_abyss_scarbearer' },
    reward: 23,
    journal: 'obj_abyss_scarbearer_hunt_journal',
  },
  {
    // W-E3 切片83：深渊噬颚兽进主线 —— 第八独占，插在裂痕使后、深渊副本前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'abyss-gnasher-hunt',
    title: 'obj_abyss_gnasher_hunt_title',
    desc: 'obj_abyss_gnasher_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_gnasher',
    target: 3,
    chapter: 5,
    waypoint: { x: -200, z: 205, label: 'enemy_name_abyss_gnasher' },
    reward: 23,
    journal: 'obj_abyss_gnasher_hunt_journal',
  },
  {
    // W-E3 切片85：深渊空壳进主线 —— 第九独占，插在噬颚兽后、深渊副本前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'abyss-hollow-hunt',
    title: 'obj_abyss_hollow_hunt_title',
    desc: 'obj_abyss_hollow_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_hollow',
    target: 3,
    chapter: 5,
    waypoint: { x: -230, z: 195, label: 'enemy_name_abyss_hollow' },
    reward: 23,
    journal: 'obj_abyss_hollow_hunt_journal',
  },
  {
    // W-E3 切片88：深渊撕裂者进主线 —— 第十独占，插在空壳后、深渊副本前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'abyss-ravager-hunt',
    title: 'obj_abyss_ravager_hunt_title',
    desc: 'obj_abyss_ravager_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_ravager',
    target: 3,
    chapter: 5,
    waypoint: { x: -210, z: 230, label: 'enemy_name_abyss_ravager' },
    reward: 24,
    journal: 'obj_abyss_ravager_hunt_journal',
  },
  {
    // W-E3 切片90：深渊恸嚎者进主线 —— 第十一独占，插在撕裂者后、深渊副本前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'abyss-wailer-hunt',
    title: 'obj_abyss_wailer_hunt_title',
    desc: 'obj_abyss_wailer_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_wailer',
    target: 3,
    chapter: 5,
    waypoint: { x: -225, z: 220, label: 'enemy_name_abyss_wailer' },
    reward: 24,
    journal: 'obj_abyss_wailer_hunt_journal',
  },
  {
    // W-E3 切片93：深渊缚影者进主线 —— 第十二独占，插在恸嚎者后、深渊副本前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'abyss-gloombinder-hunt',
    title: 'obj_abyss_gloombinder_hunt_title',
    desc: 'obj_abyss_gloombinder_hunt_desc',
    type: 'kills',
    enemyType: 'abyss_gloombinder',
    target: 3,
    chapter: 5,
    waypoint: { x: -148, z: 233, label: 'enemy_name_abyss_gloombinder' },
    reward: 22,
    journal: 'obj_abyss_gloombinder_hunt_journal',
  },
  {
    id: 'abyss-maw',
    title: 'obj_abyss_maw_title',
    desc: 'obj_abyss_maw_desc',
    type: 'dungeon',
    dungeonId: 'abyss-deep-maw',
    chapter: 5,
    reward: 30,
    journal: 'obj_abyss_maw_journal',
  },
  {
    id: 'gloom-mist-crypt',
    title: 'obj_gloom_mist_crypt_title',
    desc: 'obj_gloom_mist_crypt_desc',
    type: 'dungeon',
    dungeonId: 'gloom-mist-crypt',
    chapter: 5,
    reward: 28,
    journal: 'obj_gloom_mist_crypt_journal',
  },
  {
    id: 'gloom-moss',
    title: 'obj_gloom_moss_title',
    desc: 'obj_gloom_moss_desc',
    type: 'discovery',
    targetId: 'gloom-moss',
    chapter: 5,
    waypoint: { x: 150, z: 120, label: 'wp_label_gloom_moss' },
    reward: 18,
    journal: 'obj_gloom_moss_journal',
  },
  {
    id: 'warden-hunt',
    title: 'obj_warden_hunt_title',
    desc: 'obj_warden_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_warden',
    target: 3,
    chapter: 5,
    waypoint: { x: 60, z: 80, label: 'enemy_name_gloom_warden' },
    reward: 22,
    journal: 'obj_warden_hunt_journal',
  },
  {
    id: 'gloom-wraith-hunt',
    title: 'obj_gloom_wraith_hunt_title',
    desc: 'obj_gloom_wraith_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_wraith',
    target: 3,
    chapter: 5,
    waypoint: { x: 120, z: 80, label: 'enemy_name_gloom_wraith' },
    reward: 20,
    journal: 'obj_gloom_wraith_hunt_journal',
  },
  {
    id: 'gloom-stalker-hunt',
    title: 'obj_gloom_stalker_hunt_title',
    desc: 'obj_gloom_stalker_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_stalker',
    target: 3,
    chapter: 5,
    waypoint: { x: 80, z: 140, label: 'enemy_name_gloom_stalker' },
    reward: 20,
    journal: 'obj_gloom_stalker_hunt_journal',
  },
  {
    id: 'gloom-sentinel-hunt',
    title: 'obj_gloom_sentinel_hunt_title',
    desc: 'obj_gloom_sentinel_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_sentinel',
    target: 3,
    chapter: 5,
    waypoint: { x: 220, z: 20, label: 'enemy_name_gloom_sentinel' },
    reward: 20,
    journal: 'obj_gloom_sentinel_hunt_journal',
  },
  {
    // W-E3 切片68：幽暗影煞进主线 —— 幽暗五类清剿（怨影/掠行兽/哨卫/守夜人之外，最后一类）。
    // 插在哨卫之后、chaos-boss 之前；v21 起存档记 currentId，插步不必配迁移。
    id: 'gloom-shade-hunt',
    title: 'obj_gloom_shade_hunt_title',
    desc: 'obj_gloom_shade_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_shade',
    target: 3,
    chapter: 5,
    waypoint: { x: 100, z: 60, label: 'enemy_name_gloom_shade' },
    reward: 20,
    journal: 'obj_gloom_shade_hunt_journal',
  },
  {
    // W-E3 切片96：幽暗鬼火进主线 —— 幽暗第六独占，插在影煞后、chaos-boss 前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'gloom-wisp-hunt',
    title: 'obj_gloom_wisp_hunt_title',
    desc: 'obj_gloom_wisp_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_wisp',
    target: 3,
    chapter: 5,
    waypoint: { x: 160, z: 150, label: 'enemy_name_gloom_wisp' },
    reward: 20,
    journal: 'obj_gloom_wisp_hunt_journal',
  },
  {
    // W-E3 切片97：幽暗恐惧者进主线 —— 幽暗第七独占，插在鬼火后、chaos-boss 前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'gloom-horror-hunt',
    title: 'obj_gloom_horror_hunt_title',
    desc: 'obj_gloom_horror_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_horror',
    target: 3,
    chapter: 5,
    waypoint: { x: 170, z: 170, label: 'enemy_name_gloom_horror' },
    reward: 20,
    journal: 'obj_gloom_horror_hunt_journal',
  },
  {
    // W-E3 切片98：幽暗歌手进主线 —— 幽暗第八独占，插在恐惧者后、chaos-boss 前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'gloom-choir-hunt',
    title: 'obj_gloom_choir_hunt_title',
    desc: 'obj_gloom_choir_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_choir',
    target: 3,
    chapter: 5,
    waypoint: { x: 210, z: 150, label: 'enemy_name_gloom_choir' },
    reward: 20,
    journal: 'obj_gloom_choir_hunt_journal',
  },
  {
    // W-E3 切片100：幽暗丧钟进主线 — 幽暗第九独占，插在歌手后、chaos-boss 前（ch5，v21 不写迁移，不动 choice-void）
    id: 'gloom-knell-hunt',
    title: 'obj_gloom_knell_hunt_title',
    desc: 'obj_gloom_knell_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_knell',
    target: 3,
    chapter: 5,
    waypoint: { x: 230, z: 190, label: 'enemy_name_gloom_knell' },
    reward: 20,
    journal: 'obj_gloom_knell_hunt_journal',
  },
  {
    // W-E3 切片101：幽暗熄灯人进主线 — 幽暗第十独占，插在丧钟后、chaos-boss 前（ch5，v21 不写迁移，不动 choice-void）
    id: 'gloom-snuffer-hunt',
    title: 'obj_gloom_snuffer_hunt_title',
    desc: 'obj_gloom_snuffer_hunt_desc',
    type: 'kills',
    enemyType: 'gloom_snuffer',
    target: 3,
    chapter: 5,
    waypoint: { x: 285, z: 220, label: 'enemy_name_gloom_snuffer' },
    reward: 20,
    journal: 'obj_gloom_snuffer_hunt_journal',
  },
  {
    id: 'chaos-boss',
    title: bossById('chaos-overlord').shortNameKey,
    desc: 'obj_chaos_boss_desc',
    type: 'boss',
    bossId: 'chaos-overlord',
    chapter: 5,
    requires: { hasChaosCore: true },
    waypoint: { x: -200, z: 285, label: bossById('chaos-overlord').shortNameKey },
    reward: 50,
    journal: 'obj_chaos_boss_journal',
    flags: { chaosBossDefeated: true },
  },
  {
    id: 'radiant-dawn-hall',
    title: 'obj_radiant_dawn_hall_title',
    desc: 'obj_radiant_dawn_hall_desc',
    type: 'dungeon',
    dungeonId: 'radiant-dawn-hall',
    chapter: 5,
    reward: 32,
    journal: 'obj_radiant_dawn_hall_journal',
  },
  {
    id: 'radiant-altar',
    title: 'obj_radiant_altar_title',
    desc: 'obj_radiant_altar_desc',
    type: 'discovery',
    targetId: 'radiant-altar',
    chapter: 5,
    waypoint: { x: -155, z: -175, label: 'wp_label_radiant_altar' },
    reward: 20,
    journal: 'obj_radiant_altar_journal',
  },
  {
    id: 'radiant-hunt',
    title: 'obj_radiant_hunt_title',
    desc: 'obj_radiant_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_crawler',
    target: 3,
    chapter: 5,
    waypoint: { x: -240, z: -200, label: 'enemy_name_radiant_crawler' },
    reward: 20,
    journal: 'obj_radiant_hunt_journal',
  },
  {
    id: 'radiant-knight-hunt',
    title: 'obj_radiant_knight_hunt_title',
    desc: 'obj_radiant_knight_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_knight',
    target: 3,
    chapter: 5,
    waypoint: { x: -200, z: -80, label: 'enemy_name_radiant_knight' },
    reward: 20,
    journal: 'obj_radiant_knight_hunt_journal',
  },
  {
    id: 'radiant-dancer-hunt',
    title: 'obj_radiant_dancer_hunt_title',
    desc: 'obj_radiant_dancer_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_dancer',
    target: 3,
    chapter: 5,
    waypoint: { x: -160, z: -240, label: 'enemy_name_radiant_dancer' },
    reward: 20,
    journal: 'obj_radiant_dancer_hunt_journal',
  },
  {
    id: 'radiant-brand-hunt',
    title: 'obj_radiant_brand_hunt_title',
    desc: 'obj_radiant_brand_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_brand',
    target: 3,
    chapter: 5,
    waypoint: { x: -300, z: -240, label: 'enemy_name_radiant_brand' },
    reward: 20,
    journal: 'obj_radiant_brand_hunt_journal',
  },
  {
    // W-E3 切片95：辉煌誓守者进主线 —— 圣域第六独占，插在圣印者后、大主教前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'radiant-vowkeeper-hunt',
    title: 'obj_radiant_vowkeeper_hunt_title',
    desc: 'obj_radiant_vowkeeper_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_vowkeeper',
    target: 3,
    chapter: 5,
    waypoint: { x: -330, z: -190, label: 'enemy_name_radiant_vowkeeper' },
    reward: 20,
    journal: 'obj_radiant_vowkeeper_hunt_journal',
  },
  {
    // W-E3 切片97：辉煌天使进主线 —— 圣域第七独占，插在誓守者后、大主教前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'radiant-seraph-hunt',
    title: 'obj_radiant_seraph_hunt_title',
    desc: 'obj_radiant_seraph_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_seraph',
    target: 3,
    chapter: 5,
    waypoint: { x: -340, z: -160, label: 'enemy_name_radiant_seraph' },
    reward: 20,
    journal: 'obj_radiant_seraph_hunt_journal',
  },
  {
    // W-E3 切片98：辉煌壁垒进主线 —— 圣域第八独占，插在天使后、大主教前（ch5，v21 不写迁移，不移 choice-void）。
    id: 'radiant-bulwark-hunt',
    title: 'obj_radiant_bulwark_hunt_title',
    desc: 'obj_radiant_bulwark_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_bulwark',
    target: 3,
    chapter: 5,
    waypoint: { x: -170, z: -230, label: 'enemy_name_radiant_bulwark' },
    reward: 20,
    journal: 'obj_radiant_bulwark_hunt_journal',
  },
  {
    // W-E3 切片100：辉煌先驱进主线 — 圣域第九独占，插在壁垒后、大主教前（ch5，v21 不写迁移，不动 choice-void）
    id: 'radiant-harbinger-hunt',
    title: 'obj_radiant_harbinger_hunt_title',
    desc: 'obj_radiant_harbinger_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_harbinger',
    target: 3,
    chapter: 5,
    waypoint: { x: -150, z: -120, label: 'enemy_name_radiant_harbinger' },
    reward: 20,
    journal: 'obj_radiant_harbinger_hunt_journal',
  },
  {
    // W-E3 切片101：辉煌决斗者进主线 — 圣域第十独占，插在先驱后、大主教前（ch5，v21 不写迁移，不动 choice-void）
    id: 'radiant-duelist-hunt',
    title: 'obj_radiant_duelist_hunt_title',
    desc: 'obj_radiant_duelist_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_duelist',
    target: 3,
    chapter: 5,
    waypoint: { x: -285, z: -135, label: 'enemy_name_radiant_duelist' },
    reward: 20,
    journal: 'obj_radiant_duelist_hunt_journal',
  },
  {
    // W-E3 切片67：辉煌大主教进主线 —— 圣域四类清剿（骑士/舞者/圣印者之外，最后一类）。
    // 插在圣印者之后、dungeon-rerun 之前；v21 起存档记 currentId，插步不必配迁移。
    id: 'archon-hunt',
    title: 'obj_archon_hunt_title',
    desc: 'obj_archon_hunt_desc',
    type: 'kills',
    enemyType: 'radiant_archon',
    target: 3,
    chapter: 5,
    waypoint: { x: -260, z: -230, label: 'enemy_name_radiant_archon' },
    reward: 20,
    journal: 'obj_archon_hunt_journal',
  },
  {
    id: 'dungeon-rerun',
    title: 'obj_dungeon_rerun_title',
    desc: 'obj_dungeon_rerun_desc',
    type: 'dungeon-rerun',
    chapter: 5,
    // W-E3 切片37：同上 —— 再战一步指的就是那座最近的门，坐标问名册，行上只留提示语
    waypoint: { dungeonId: 'ruin-crypt', label: 'wp_label_dungeon_entrance' },
    reward: 25,
    journal: 'obj_dungeon_rerun_journal',
    flags: { dungeonRerunDone: true },
  },
  {
    id: 'chests-all',
    title: 'obj_chests_all_title',
    desc: 'obj_chests_all_desc',
    type: 'chests',
    target: 8,
    chapter: 5,
    waypoint: { x: 25, z: 70, label: 'wp_label_chests_all' },
    reward: 25,
    journal: 'obj_chests_all_journal',
  },
  {
    // W-E3 切片30：主线最后一处副本 —— 名册上的第十座下完才去碰锚点（插步要带存档迁移 v18 → v19）。
    id: 'sunless-oratory',
    title: 'obj_sunless_oratory_title',
    desc: 'obj_sunless_oratory_desc',
    type: 'dungeon',
    dungeonId: 'sunless-oratory',
    chapter: 5,
    reward: 34,
    journal: 'obj_sunless_oratory_journal',
  },
  {
    id: 'infinity',
    title: 'obj_infinity_title',
    desc: 'obj_infinity_desc',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 5,
    requires: { chaosBossDefeated: true, skillsUnlocked3: true },
    condition: 'checkInfinity',
    waypoint: { x: 0, z: 55, label: 'wp_label_anchor' },
    reward: 100,
    journal: 'obj_infinity_journal',
    flags: { infinityDone: true },
  },
  {
    // W-E3 切片46：最后的那一次抉择 —— 走进无限之后，锚点还亮着。
    // 前四处抉择都在「去哪儿」上分岔；这一处在「最后留下什么」上分岔：
    // 把火留给后来人，还是亲手熄掉这盏灯。两条收尾路各走一步、各自指回本章门。
    id: 'choice-final',
    title: 'obj_choice_final_title',
    desc: 'obj_choice_final_desc',
    type: 'choice',
    chapter: 5,
    requires: { infinityDone: true },
    waypoint: { x: 0, z: 55, label: 'wp_label_anchor' },
    reward: 30,
    journal: 'obj_choice_final_journal',
    titleByChoice: {
      choice_final_keep: 'obj_choice_final_title_keep',
      choice_final_quiet: 'obj_choice_final_title_quiet',
    },
    descByChoice: {
      choice_final_keep: 'obj_choice_final_desc_keep',
      choice_final_quiet: 'obj_choice_final_desc_quiet',
    },
    journalByChoice: {
      choice_final_keep: 'obj_choice_final_journal_keep',
      choice_final_quiet: 'obj_choice_final_journal_quiet',
    },
    // 终局正文（W-E3 切片46）：`game-completed` 那一刻玩家读到的那两段，按最后一次抉择取名。
    // 与上面三格分开：那三格说的是"这一步你在做什么"，这两段说的是"世界最后成了什么样"。
    endingByChoice: {
      choice_final_keep: 'ending_dialog_text_keep',
      choice_final_quiet: 'ending_dialog_text_quiet',
    },
    choices: [
      { id: 'keep', label: 'obj_choice_final_keep_label', flag: 'choice_final_keep' },
      { id: 'quiet', label: 'obj_choice_final_quiet_label', flag: 'choice_final_quiet' },
    ],
    branch: {
      choice_final_keep: 'final-keep',
      choice_final_quiet: 'final-quiet',
    },
  },
  {
    // 留灯那条：走上锚点东侧的石阶，把火种压回凹槽（世界坐标 = 枢纽中心 + (16, 10)）
    id: 'final-keep',
    title: 'obj_final_keep_title',
    desc: 'obj_final_keep_desc',
    type: 'discovery',
    targetId: 'final-keep',
    chapter: 5,
    waypoint: { x: 16, z: 65, label: 'zone_poi_final_keep_label' },
    reward: 20,
    journal: 'obj_final_keep_journal',
    branchTo: 'ch5-complete',
  },
  {
    // 熄灯那条：走到锚座下合上熄火环（世界坐标 = 枢纽中心 + (-16, 10)）
    id: 'final-quiet',
    title: 'obj_final_quiet_title',
    desc: 'obj_final_quiet_desc',
    type: 'discovery',
    targetId: 'final-quiet',
    chapter: 5,
    waypoint: { x: -16, z: 65, label: 'zone_poi_final_quiet_label' },
    reward: 20,
    journal: 'obj_final_quiet_journal',
    branchTo: 'ch5-complete',
  },
  {
    id: 'ch5-complete',
    title: 'obj_ch5_complete_title',
    desc: 'obj_ch5_complete_desc',
    type: 'chapter-gate',
    chapter: 5,
    autoComplete: true,
    reward: 0,
    journal: 'obj_ch5_complete_journal',
    flags: { chapter5Done: true, gameCompleted: true },
  },
];

/* ------------------------------------------------------------------ *
 * 主线只有一张表（W-B3 切片3）
 *
 * 今天玩家实际走的序列 = 这张表**去掉章节门控行**。门控行不是玩家能做的一步
 * （它 `autoComplete`，走到即过），它是"跨过前面那一步时对玩家喊的话 + 翻到第几章"。
 *
 * 为什么要显式投影而不是让 sequencer 自己跳过：存档落的是 `quests.questIndex`，
 * 那是**玩家序列**的下标。把门控行混进去，磁盘上的 `6` 就从"第五格宝箱"变成"第六步"，
 * 而这类偏移不报错 —— 老档读进来只是任务提示指错地方，玩家会以为档坏了。
 * 投影保持同序同 32 行（由 `tests/mainline-table.test.js` 钉住），所以下标语义不变，不需要迁移。
 * ------------------------------------------------------------------ */

/** 玩家序列：`OBJECTIVES` 里非门控的那些行，按表序 */
export const MAINLINE = OBJECTIVES.filter((r) => r.type !== 'chapter-gate');

/** 按 id 认行（路点与跳转都问这一份；`QuestSystem` 的"还缺哪几样"也读它） */
export const MAINLINE_BY_ID = new Map(MAINLINE.map((r) => [r.id, r]));

/**
 * 主线行自己声明的"这一步让你去哪儿"（W-D4 切片9 从 `QuestSystem` 里搬下来）。
 *
 * 为什么搬到这一层：今天有**两个**消费者 —— 指路（`getQuestWaypoint` / 门控那四格的
 * "还缺哪几样"）与演示步（`ui/demoSteps.js` 要按步走位）。留在 `QuestSystem` 里，
 * 演示那侧要么自己再抄一份 `waypoint` / `entrance` 的读法（本仓最常见的那病灶），
 * 要么反过来 import 一个系统模块（内容层反过来依赖运行层）。行上的 `waypoint` 本来就是
 * 表数据，读它的算式跟着表走。
 *
 * 两种形态（W-E3 切片37）：行上带自己的坐标 ⇒ 原样交出；行"指一座副本"（`chests` /
 * `dungeon-rerun`）⇒ 坐标现问副本名册的 `entrance`，行上只留那一句提示标签。
 */
export function rowWaypoint(id) {
  const wp = MAINLINE_BY_ID.get(id)?.waypoint;
  if (!wp) return null;
  if (!wp.dungeonId) return wp;
  const def = dungeonDefOf(wp.dungeonId);
  return { x: def.entrance.x, z: def.entrance.z, label: wp.label };
}

/**
 * 一座副本的入口（`type: 'dungeon'` 的行与"指一座副本"的行都用它）。
 * `dungeonDefOf` 认不出就抛：能走到这里的 id 只有主线 `type: 'dungeon'` 那几行，
 * 注册表已经拿 `ref: 'dungeons'` 钉住它们的 `dungeonId`。
 */
export function dungeonWaypoint(id) {
  const d = dungeonDefOf(id);
  return { x: d.entrance.x, z: d.entrance.z, label: d.name };
}

/**
 * 走到第 `index` 步时玩家在哪一章 —— 由那一行自己标的 `chapter` 说话（W-B3 切片4）。
 *
 * 为什么要有这个函数：`SaveSystem` 读档时要么信盘上那份 `chapter`，要么用一句
 * `index > 8 ? 2 : 1` 猜。那句 `8` 是"第一道门在第几格"的抄本 —— 表里插一行它就错，
 * 而错了也只是 HUD 写着 Chapter 1、玩家正在做第 5 章的步骤（不报错）。
 * 章节在表里本来就有两处真源（行上的 `chapter` 与门控行的 `chapter`），
 * 而"门控行开的那一章就是它后面那些行的 `chapter`"这件事由注册表的整表不变式钉着，
 * 所以这里取行上那一格就够了。
 */
export function chapterAt(index) {
  const 落点 = Math.min(Math.max(Number.isInteger(index) ? index : 0, 0), MAINLINE.length - 1);
  return MAINLINE[落点]?.chapter ?? 1;
}

/**
 * 走完 `id` 那一步之后要跨过的门控行；没有则 `null`。
 *
 * 靠的是**位置**（门控行紧跟在它为之外的那一步后面），不是另抄一份"哪一步开哪一章"的清单 ——
 * 那份清单正是切片3 删掉的东西（`finished?.id === 'finale'` 四行）。
 * 位置这个前提由注册表的整表不变式盯着：门控行的前一行必须 `branchTo` 指回它。
 */
export function chapterGateAfter(id) {
  const i = OBJECTIVES.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const next = OBJECTIVES[i + 1];
  return next?.type === 'chapter-gate' ? next : null;
}

/**
 * 按 id 找一道章节门（W-E3 切片46）。
 *
 * `chapterGateAfter` 认的是**位置**（"这一步后面紧跟着的那一格是不是门"）。终局那两条收尾路
 * 不满足这个形状：它们和门之间还隔着另一条路（`final-keep` 后面是 `final-quiet`），
 * 但两条路都 `branchTo: 'ch5-complete'` —— 门是它们**跳过去**的，不是"排在后面"的。
 * 于是这里补一支按 id 的查法：推进时若分支目标本身是一道门，就用它来翻章 / 落门的旗标。
 */
export function chapterGateById(id) {
  const row = OBJECTIVES.find((r) => r.id === id);
  return row?.type === 'chapter-gate' ? row : null;
}

/**
 * 分支直接指向章节门时：跨过这道门之后，玩家序列该走到第几步？
 *
 * - 门后还有主线步（`ch4-complete` 之后是第 5 章）⇒ 那一步的下标；
 * - 门后没有了（`ch5-complete` 是最后一道门）⇒ `MAINLINE.length`（= 通关）。
 *
 * 改前这条路是 `questIndex++`：对 `true-end` 碰巧对（它就排在门前一格），
 * 对终局那两条路却是错的 —— 从 `final-keep` 加一格正好落到**没选的那条** `final-quiet`，
 * 玩家选了"留灯"还会被送去熄灯。
 */
export function mainlineIndexAfterGate(gateId) {
  const i = OBJECTIVES.findIndex((r) => r.id === gateId);
  if (i < 0 || OBJECTIVES[i].type !== 'chapter-gate') return undefined;
  const next = OBJECTIVES.slice(i + 1).find((r) => r.type !== 'chapter-gate');
  return next ? MAINLINE.findIndex((r) => r.id === next.id) : MAINLINE.length;
}

/**
 * 走完 `finished` 这一步，表上声明的**分支落点**是哪一行的 id；没有分支则 `null`。
 *
 * 三分支的口径一字未动（W-E3 切片23 / 切片46）：
 * - 抉择步：看**玩家选的那条**在 `branch` 里指向哪一行；
 * - 非抉择步同时带 `branchTo` 与 `branch`：拿 `decisions` 里第一个对得上的旗标查 `branch`（true-end 那一族）；
 * - 只带 `branchTo`：直接跳过去。
 *
 * 为什么单独一个函数（而不是只留下面的 `mainlineIndexAfter`）：`QuestSystem.advance()` 拿到这个 id
 * 还要问一件事 —— 它指的可能是一道**章节门**（门不在玩家序列里，`chapterGateById` 才认得），
 * 于是"补翻章 / 部落旗"那一格也要读同一句分支结论。两处各算一遍就是两份"哪条路通向哪儿"。
 */
export function branchTargetOf(finished, stats) {
  if (finished?.type === 'choice' && finished.branch) {
    const 选中的 = objectiveChosen(finished, stats);
    return (选中的 && finished.branch[选中的.flag]) || null;
  }
  if (finished?.branchTo && finished?.branch && stats?.decisions) {
    const 匹配的Flag = Array.from(stats.decisions).find((f) => finished.branch[f]);
    return (匹配的Flag && finished.branch[匹配的Flag]) || null;
  }
  return finished?.branchTo ?? null;
}

/**
 * 走完 `finished` 这一步，玩家序列的**落点**是第几格（W-D4 切片9 从 `QuestSystem.advance()` 里搬出来）。
 *
 * 为什么这一处必须是函数而不是某一行赋值：今天有两个消费者要问同一句话 —— 在役的推进
 * （`questIndex = …`）与演示/自动通关的步表（`ui/demoSteps.js` 要把 78 行走成一条不重不漏的序列）。
 * 留在 `advance()` 里，步表那侧只有两种下场：自己抄一遍三分支（表改一次跳转，抄本不动，玩家看到的
 * 是一个安静地少做几步或多做几步的演示 —— 正是本仓反复抓的"两份算式"），或者反过来 import 一个系统模块。
 * 搬进内容层之后 `advance()` 与步表读的是同一条。
 *
 * 目标不在玩家序列里 ⇒ 它是一道章节门 ⇒ 落点是"门后第一步"（`mainlineIndexAfterGate`；
 * 最后一道门后面没有步 = `MAINLINE.length` = 通关）；门也查不出来才退回 `fromIndex + 1`。
 *
 * @param {object|null} finished 刚走完的那一行（`null` ⇒ 原格 +1，与 `advance()` 的早退分支同口径）
 * @param {{decisions?: Set<string>}} stats 账本（这里只读 `decisions` 那一格）
 * @param {number} fromIndex `finished` 在 `MAINLINE` 上的下标
 */
export function mainlineIndexAfter(finished, stats, fromIndex) {
  const 分支目标 = branchTargetOf(finished, stats);
  if (!分支目标) return fromIndex + 1;
  const 目标索引 = MAINLINE.findIndex((r) => r.id === 分支目标);
  if (目标索引 >= 0) return 目标索引;
  return mainlineIndexAfterGate(分支目标) ?? fromIndex + 1;
}

// 条件函数表（在役的 `QuestSystem` 与已删除的 `ObjectiveEngine` 过去各写一份，这里是一份）
export const CONDITIONS = {
  checkAllFragments: (state) => state.stats.discoveries?.has('fantasy-ring')
    && state.stats.discoveries?.has('magic-castle')
    && state.stats.discoveries?.has('space-tesseract'),
  // 「三界试炼」这一句在役表里问的是两件事实：三只地下城 + 第三只 Boss。
  // 早先这里只数地下城，于是任何直接用它做门控的消费者都能让玩家**跳过奇点领主**去飞升；
  // 在役表当时靠 `canAscend()` 另写一遍才没出事 —— 两份算式差一格，正是本切片要收掉的东西。
  // 切片3c 收掉第二份：三座不再逐格写死，改读 `dungeons.js` 行上的 `trial`（推导见 `TRIAL_DUNGEON_IDS`）。
  checkAllDungeons: (state) => Boolean(state.stats.boss3Defeated)
    && TRIAL_DUNGEON_IDS.every((id) => state.stats.dungeonsCleared?.has(id)),
  checkTrueEnd: (state) => state.stats.voidBossDefeated
    && state.stats.discoveries?.has('fantasy-ring')
    && state.stats.discoveries?.has('magic-castle')
    && state.stats.discoveries?.has('space-tesseract')
    && state.stats.discoveries?.has('void-rift'),
  checkInfinity: (state) => state.stats.chaosBossDefeated && (state.stats.skillsUnlocked || 0) >= 3,
};

// 「失败条件」这一族以前有一张空表 + 两行注释掉的示例，唯一的读者是 `ObjectiveEngine`
// （W-B3 切片4 已删）。要做任务失败，先从"哪一行的什么条件算失败"这张表立起来，
// 而不是留一个没人读的空壳在数据层里。
/* ------------------------------------------------------------------ *
 * 任务这一件事的三本账（W-B3 切片2）
 *
 * 为什么搬到这里而不是各留一份：这三件事今天一共被抄了三处以上 ——
 *   判据「这一步完成了没有」在 `QuestSystem.isQuestObjectiveDone`、`QuestSystem.checkProgress`
 *     与 `ObjectiveEngine.progressObjective` 各有一份 switch；
 *   记账「哪个事件改哪个计数」在 `QuestSystem.setupListeners` 与 `ObjectiveEngine.setupListeners`
 *     各有一份（后者只调 `advanceActive`，从来没人往里写数，所以它的账本永远是空的）；
 *   名册「哪只 Boss 死了算哪一格」是 `QuestSystem` 里五行硬编码 if。
 * 三份抄本最坏的地方是"改一份而另两份不动时不报错"：本切片实测到引擎那份已经把
 * `boss2` / `boss3` 写成 `type: 'boss'`，于是它读的是**第一只** Boss 的计数器 ——
 * 大奥术师会在影界守护者倒地那一刻就被判完成。判据只留一份，这类漂移就没有藏身处。
 *
 * 这一层只放**纯算式**：不 import 任何其它层（`content-boundary` 门禁），不碰 DOM，不发事件。
 * ------------------------------------------------------------------ */

/**
 * Boss 名册：`bossId` → 统计账本里那一格的名字。
 * 写账（击杀事件）与读账（判定）共用这一份，所以加一只 Boss 只改这里一次。
 * "是不是 Boss 步"也只问这一份（`BOSS_STAT_KEYS[def.bossId]`）：曾经它是 `BOSS_TYPES`
 * 那个类型名集合 —— 表里五只 Boss 写成 `boss` / `boss2` / `voidboss` / `chaosboss` 四种类型名，
 * 于是名册要认类型、判据要认类型、显示层还要再抄一份类型名，三处都能各错各的。
 */
export const BOSS_STAT_KEYS = {
  'shadow-warden': 'bossDefeated',
  'archmagus': 'boss2Defeated',
  'singularity-herald': 'boss3Defeated',
  'void-chronarch': 'voidBossDefeated',
  'chaos-overlord': 'chaosBossDefeated',
};

/**
 * 「摸一下锚点」那一族里带门控的那些格：门控就是行自己写的 `condition`。
 * 挂了条件的 interact **不因摸了一下就算完成**（锚点第一步就摸过了，若"条件齐"直接判完成，
 * 玩家会在拿到最后一片碎片的瞬间看到「任务完成：重铸锚点」而根本没再摸一次）；
 * 推进它的是条件满足时的那一次交互（`conditionHolds`）。没有 `condition` 的 interact 摸过即算。
 *
 * 切片3 之前这里还认在役表抄本上的四个旗标写法（`requireAscension` 之类），并另抄一份
 * 旗标 → 条件函数名的映射 —— 同一句话两种写法，而条件算式本来就只有 `CONDITIONS` 那一份。
 * 在役表如今就是这张表的投影，所以那层兼容跟着抄本一起删掉。
 */
export function interactGateCondition(def) {
  if (!def || def.type !== 'interact') return null;
  return def.condition ?? null;
}

/**
 * 跑一个条件函数。`CONDITIONS` 里的算式目前只读 `state.stats`，所以账本就够它用；
 * 名字不存在或没登记映射时返回 `false` —— 宁可卡住一步，也不放过一个没验过的门。
 */
export function conditionHolds(name, stats) {
  const fn = CONDITIONS[name];
  return fn ? Boolean(fn({ stats })) : false;
}

/** 统计账本的初始形状。判据读的键必须全在这里，由用例逐格双向核对 */
export function emptyStats() {
  return {
    hits: 0,
    kills: {},
    discoveries: new Set(),
    npcTalked: new Set(),
    dungeonsCleared: new Set(),
    chestsOpened: 0,
    spellCasts: 0,
    chargedCasts: 0,
    skillsUnlocked: 0,
    dungeonRerun: false,
    /**
     * 该位面的清剿数：`{ [区 id]: 已清掉的只数 }`（W-B12 切片7）。
     *
     * 为什么单开一格而不复用 `kills`（那是按**敌人类型**分的）：分区支线要问的是
     * "**你在这座区**清了多少只" —— 按类型的那本账答不了这个（两个区可能有同一种敌人）。
     * 生产者是 `enemy-defeated` 事件里的 `zone`（敌人**出生在**哪座区）。
     */
    zoneKills: {},
    level: 1,
    mind: 0,
    /**
     * **读数**（不是账）：当前挂着东西的装备槽位（W-E3 切片17）。
     * 由 `stats-changed` 从 `PlayerStats` 推来 ⇒ 不落盘（`STAT_READINGS` 跳过它）。
     */
    gearSlots: [],
    /**
    /**
     * **账**（不是读数）：玩家做过的关键抉择（W-E3 切片18）。
     *
     * 为什么它是账而不是读数：抉择是**已经发生的事**（"你封印了虚空"），
     * 不是"现在的状态"（像装备槽那样会随玩家取下而变）⇒ 它必须**落盘**，
     * 否则读档后玩家做过的抉择会消失，那一步会"退回去"。
     *
     * 名字叫 `decisions` 而不是 `flags`：表里每一行那个 `flags`（完成时置位的标志）
     * 是**另一件事**（那是"这一步完成就点亮哪几格"），两个都叫 flags 会读混。
     *
     * 形状是 `Set`（像 `discoveries` 那样）：一个 flag 只能记一次，
     * 落盘时落成数组、读档时读回 `Set`（`statsToJSON` / `statsFromJSON` 自动认）。
     */
    decisions: new Set(),
    /**
     * **账**（不是读数）：主线每一步完成时点亮的那几格旗标（W-E3 切片24）。
     *
     * 与 `decisions` 的分工：`decisions` 记的是"玩家选了哪条"（由 `choice-made`
     * 事件写），这一格记的是"哪一步走完了"（由 `QuestSystem.advance()` 按行自己的
     * `flags` 写）—— 表上那 13 行 `requires` 要读的就是这一格。名字不与行字段
     * `flags` 同名：行上的 `flags` 是**声明**（这一步完成会点亮什么），这一格是
     * **事实**（已经点亮了什么）。
     *
     * 为什么是普通对象而不是 `Set`：行的 `flags` 可以置 `false`
     * （`flags: { x: false }` 也是一种"这一步完成时把 x 按灭"的语义，
     * 注册表的生产者登记同样记值）⇒ `Set` 装不下 false 这一种。
     * 落盘/读档由 `statsToJSON` / `statsFromJSON` 自动带上（不在 `STAT_READINGS` 里）。
     */
    objectiveFlags: {},
    /**
     * **元账本四格**（W-D2 切片48）：支线完成 / 成就解锁 / 物品收集 / 剧情旗标。
     *
     * `game/StoryWeaponSkills.js` 的四条元锁因（questComplete / achievementUnlocked /
     * itemCollected / storyFlag）读的就是这四格 —— 改前它们**不在账本形状里**，四条分支
     * 的 `q?.stats?.X?.[id] ?? 0` 恒等于 0：那四格锁因在真实游戏里永远不可达
     * （refs 门禁 ③ 腿只核了 id 宇宙，没核账本形状，所以一直绿着）。
     *
     * 生产者在 `PlayerStats`（`onQuestCompleted` / `onAchievementUnlocked` /
     * `onItemCollected` / `onStoryFlag`，W-B6 切片5 起就在），它每次写都派发
     * `stats-changed` ⇒ 下面那条记账函数把快照里的四格镜像进来。
     *
     * 为什么进 `STAT_READINGS`（不落盘）：真源是 PlayerStats 自己那一份（它落盘），
     * 账本这份只是投影；读档时 `SaveSystem` 复原 PlayerStats 之后再推一次
     * `stats-changed`，投影自动回填 —— 与 `level` / `mind` 同一口径。
     */
    questsCompleted: {},
    achievementsUnlocked: {},
    itemsCollected: {},
    storyFlags: {},
    ...Object.fromEntries(Object.values(BOSS_STAT_KEYS).map((k) => [k, false])),
  };
}

/**
 * 账本里那几格是**读数**（由别的系统推过来的派生值），不是任务系统自己的账：
 * 存盘不落它们，读档后以生产方为准。留在磁盘上只会留下一个过期读数 ——
 * `level` / `mind` 由 `PlayerStats` 推 `stats-changed`，`skillsUnlocked` 由
 * `weaponSkills.unlocked` 的大小算，而这两处都发生在任务账本复原之后。
 * 存档校验把 `quests.stats.skillsUnlocked` 判成非法（v5 起），靠的就是这一格不落盘。
 */
export const STAT_READINGS = ['level', 'mind', 'skillsUnlocked', 'gearSlots',
  'questsCompleted', 'achievementsUnlocked', 'itemsCollected', 'storyFlags'];

/**
 * 账本 → 存档。形状从 `emptyStats()` 推：Set 落数组、读数不落盘，
 * 所以加一格计数不必再去改存档层（以前那里逐格手抄了六个 Set/bool）。
 */
export function statsToJSON(stats) {
  const out = {};
  for (const [key, value] of Object.entries(stats)) {
    if (STAT_READINGS.includes(key)) continue;
    out[key] = value instanceof Set ? [...value] : value;
  }
  return out;
}

/**
 * 存档 → 账本。以 `emptyStats()` 的形状为准**逐格取磁盘上有的那些**：
 * 磁盘上多出来的键进不来（那类键一旦被判据读到就是伪账），缺的格子回到初始值，
 * 而 `STAT_READINGS` 那两格连磁盘上有都不取 —— 读档时 `pushToConsumers()` 在任务账本
 * 复原**之前**就推了读数，取磁盘那份等于让一个过期值盖掉生产方的现值。
 */
export function statsFromJSON(raw) {
  const stats = emptyStats();
  if (!raw || typeof raw !== 'object') return stats;
  for (const [key, proto] of Object.entries(stats)) {
    if (STAT_READINGS.includes(key)) continue;
    const value = raw[key];
    if (value === undefined) continue;
    stats[key] = proto instanceof Set ? new Set(value ?? []) : value;
  }
  return stats;
}

/**
 * 一个事件改哪些计数 —— 全仓唯一一份记账。
 * 注意 `kills` 看的是 `detail.type`：曾经按"名字里含『虚空』"归类，于是 Boss 召出的
 * 虚空仆从（type=soldier）全被记成 elite（B36）。
 */
export const STAT_EVENTS = {
  'combat-hit': (s) => { s.hits += 1; },
  'enemy-defeated': (s, d) => {
    if (d.type !== 'boss') s.kills[d.type] = (s.kills[d.type] ?? 0) + 1;
    const key = BOSS_STAT_KEYS[d.bossId];
    if (key) s[key] = true;
    // 该位面的清剿数（W-B12 切片7）：`zone` 是敌人**出生在**哪座区（出生点那一次反推的结果）。
    // 副本里的敌人出生在独立坐标空间 ⇒ 那里算出来的区没有意义 —— 但那一格记下来也无害
    // （分区支线只读那七座真实位面）。
    if (d.zone) s.zoneKills[d.zone] = (s.zoneKills[d.zone] ?? 0) + 1;
  },
  'spell-cast': (s, d) => {
    s.spellCasts += 1;
    if (d.charged) s.chargedCasts += 1;
  },
  'dungeon-cleared': (s, d) => {
    if (s.dungeonsCleared.has(d.id)) s.dungeonRerun = true;   // 第二次清空同一座 = 再探
    s.dungeonsCleared.add(d.id);
  },
  'weapon-skill-unlocked': (s) => { s.skillsUnlocked += 1; },
  'chest-opened': (s) => { s.chestsOpened += 1; },
  'npc-talk': (s, d) => { s.npcTalked.add(d.id); },
  'discovery': (s, d) => { s.discoveries.add(d.id); },
  // 交互与发现同一条账：POI 摸过一次就算见过（主线那几格的判据读的就是它）
  'poi-interact': (s, d) => { if (d.id) s.discoveries.add(d.id); },
  // 等级与心智是**读数**（PlayerStats 推出来的），存进账本只为让"跳步"认得它们；
  // 存盘不存这一格，读档时由 `stats-changed` 再推一次（以生产方为准，不抄磁盘）
  // 抉择（W-E3 切片18）：玩家选了一条路 ⇒ 记下那个 flag。
  // 生产者是**这一条**（不是任务系统直接写账）—— 判据读的那一格因此有生产者，
  // 闭包门禁扫得到（"账本里有这一格却没人写"会当场红）。
  'choice-made': (s, d) => { if (d.flag) s.decisions.add(d.flag); },
  'stats-changed': (s, d) => {
    if (Number.isFinite(d.level)) s.level = d.level;
    if (Number.isFinite(d.mind)) s.mind = d.mind;
    // 元账本四格（W-D2 切片48）：PlayerStats 的四只桶每次写都经这里推快照，
    // 镜像进账本 —— 技能锁因那四条元分支读的就是这四格（见 emptyStats 里的注释）。
    // 浅拷贝：账本只读它们，别让两边握同一份对象。
    if (d.questsCompleted) s.questsCompleted = { ...d.questsCompleted };
    if (d.achievementsUnlocked) s.achievementsUnlocked = { ...d.achievementsUnlocked };
    if (d.itemsCollected) s.itemsCollected = { ...d.itemsCollected };
    if (d.storyFlags) s.storyFlags = { ...d.storyFlags };
    // 装备过的**槽位**（W-E3 切片17）：`PlayerStats.toJSON()` 里本来就带着 `gear`
    // （槽位 → 那件装备或 null）⇒ 这里直接问"哪些槽位上有东西"，
    // **不需要新事件、也不改存档形状**（它是一格**读数**，落盘时跳过 ⇒ 读档后由
    // `stats-changed` 再推一次，以生产方为准）。
    if (d.gear && typeof d.gear === 'object') {
      s.gearSlots = GEAR_SLOTS.filter((slot) => Boolean(d.gear[slot]));
    }
  },
};

/**
 * 把一条事件记到账上。返回 `false` = 这条事件不改任何计数（调用方照样要重算进度）。
 * 未知事件名不抛：任务系统不该因为别人多派发了一条消息就停摆。
 */
export function applyStatEvent(stats, name, detail) {
  const fn = STAT_EVENTS[name];
  if (!fn) return false;
  fn(stats, detail ?? {});
  return true;
}

/**
 * 「这一步完成了没有」—— 全仓唯一一份判据。
 *
 * 入参是**定义行 + 统计账本**，两者形状在 `QuestSystem` 的在役表与 `OBJECTIVES` 新表之间通用：
 * Boss 那一族一律按 `bossId` 找计数器（所以新表把 `boss2` 写成 `type: 'boss'` 也不会读错格子），
 * 数值那一族一律与 `target` 比（`>=` 而不是 `===`：多砍一刀不许把已完成的那步判成未完成，
 * 而"多一刀"在真实战斗里是常态）。
 *
 * `level` / `mind` 读的是账本里那两格读数，不是 `stats.vigor` 那类属性名 ——
 * 心智那一步说的是"在营火升过几级"，穿一枚加心智的护符不该替玩家把任务做完。
 */
/**
 * 这一步完成后点亮哪几格（W-E3 切片24）—— 表上 `flags` 的唯一写入出口。
 *
 * 为什么写入方在 QuestSystem 而不在判据里：判据（`objectiveDone`）是纯读，
 * 写账只能发生在"这一步真的完成了"的那一刻（`advance()`），而 `advance()`
 * 同时负责跨过章节门 ⇒ 门的 `flags` 也在这里一并写（门控行不在 `MAINLINE` 里，
 * 不随 `questIndex` 推进，但"跨过这一刻"同样是一个事实）。
 *
 * 同名旗标被两行设成不同值由注册表不变式挡住（两份生产者说两个值，
 * 运行时"后写覆盖"会把前置资格静默改掉）⇒ 这里照行的声明写即可。
 */
export function applyObjectiveFlags(stats, row) {
  const flags = row?.flags;
  if (!flags) return stats;
  for (const [flag, value] of Object.entries(flags)) {
    stats.objectiveFlags[flag] = value;
  }
  return stats;
}

/**
 * 这一步的**前置资格**：`requires` 声明的每一格旗标都要正好等于它要的值（W-E3 切片24）。
 *
 * 没有 `requires` 的行恒真。旗标没被任何一步点亮过一律算不满足
 * （`undefined !== want`，连 `want: false` 也不放过）—— 老档靠迁移那一跳
 * 按 `questIndex` 重放补上（见 `SaveMigrations` 的 v17 → v18），
 * 新档由 `advance()` 边走边写 ⇒ 按表序走到任一行时，它的 `requires` 必然已成立。
 */
export function objectiveRequiresMet(def, stats) {
  const requires = def?.requires;
  if (!requires) return true;
  for (const [flag, want] of Object.entries(requires)) {
    const actual = stats?.objectiveFlags?.[flag];
    if (actual !== want) return false;
  }
  return true;
}

/**
 * 这一步**随抉择而变**的那一格：玩家选中的那条路（还没选就 null）。
 *
 * 为什么要单独一个函数（W-E3 切片20）：「抉择」步有两样东西随选择而变 ——
 * 进度文案（玩家看到自己选了哪条）与完成回报（这一步给多少魂火）。
 * 两样都问这一份 ⇒ **判据只有一处**（进度文案自己再抄一遍"哪条被选了"，
 * 就是本仓反复抓到的那个"两份算式"）。
 */
export function objectiveChosen(row, stats) {
  if (row?.type !== 'choice' || !Array.isArray(row.choices)) return null;
  return row.choices.find((c) => stats?.decisions?.has(c.flag)) ?? null;
}

/**
 * 这一步完成后该发多少魂火。
 *
 * 「抉择」步的那两条路**给一样多**（W-E3 切片20 的设计决定）—— 若一条路给得多、
 * 又没有别的代价，那它就**严格更优** ⇒ 玩家永远选那条 ⇒ 抉择就不成其为抉择。
 * 真正的分歧后果（哪条路通向不同的内容）要等**分支树**机制 ⇒ 独立一片。
 */
export function objectiveReward(row, stats) {
  const 选中的 = objectiveChosen(row, stats);
  if (选中的 && Number.isInteger(选中的.reward)) return 选中的.reward;
  return row?.reward ?? 0;
}

/**
 * 「随抉择而变」的那一层：按玩家**已经记下**的那个旗标取对应文案键；
 * 没有这一族的变体、或玩家还没做过相关抉择 ⇒ `undefined`（调用方各自回自己的原值）。
 *
 * 为什么要这样：抉择那一族（W-E3 切片18）只把"玩家选了哪条"**记下来**，
 * 后面的内容完全不看它 ⇒ 抉择成了一句没兑现的话。
 * 而"哪一条被选中"这件事**只能有一处算式** —— 显示侧（进度行 / 标题 / 日志 / 播报）
 * 各自去读 `row.desc` / `row.title` 就成了几份各说各话的真相（改一处另几处不动时不报错，
 * 只是玩家看到的文案与实际选的那条对不上）。
 *
 * 旗标名在别处（抉择那一步的 `choices[].flag`）出现时是**引用**而不是第二份真相：
 * 注册表的不变式核"这个旗标确实有某一步的 choices 设过它"（与 `requires` 同一套口径）。
 *
 * W-E3 切片36：这一处从前只认 `descByChoice`（切片22），真结局的两个名字
 * （`obj_true_end_sealed_title` / `obj_true_end_studied_title`）与两段结局日志
 * 建了格却没接线 —— 死键账本最后 4 枚就是它们。现在"哪一格随抉择变"是一张
 * 三格名册（`descByChoice` / `titleByChoice` / `journalByChoice`），查法仍然只有这一处。
 */
function 按抉择取(row, 变体格, stats) {
  const 变体 = row?.[变体格];
  if (!变体) return undefined;
  // B155：这一格**不许**再问 `objectiveRequiresMet(row, stats)`（切片25 曾加过、已摘掉）。
  // 抉择是既成事实 —— `decisions` 只在玩家真的点了按钮那一刻被写；这句话说的是
  // "玩家选了哪条"。而 `requires` 管的是"这一步够不够格**完成 / 推进**"（切片24：
  // 完成与资格是两件事）。两件事混在一处会让同一行的两个兑现口互相打架：
  // `objectiveReward` 只看 `decisions` 照付报酬，这里却因为资格没齐把话收回去
  // ⇒ 玩家拿了那条路的奖励，读到的还是通用文案（`tests/choice-consequence.test.js` ④）。
  // 另：那个条件**不随 `旗标` 变**，写在 `for` 里等于常量条件 ⇒ 循环坍缩成
  // "取第一个已决策的旗标"，读起来像逐条判定、实际一条都不判。
  for (const [旗标, 键] of Object.entries(变体)) {
    if (stats?.decisions?.has(旗标)) return 键;
  }
  return undefined;
}

/** 进度句（`desc`）：有变体且玩家选过 ⇒ 那一条；否则原样。 */
export function objectiveDesc(row, stats) {
  return 按抉择取(row, 'descByChoice', stats) ?? row?.desc;
}

/**
 * 这一步的**标题**（W-E3 切片36）：真结局有两个名字 ——
 * 封印那条叫「真结局：封印虚空」，研习那条叫「真结局：研习虚空」。
 * 显示侧（HUD 任务格 / 日志条目 / 日志面板 / 完成提示 / 发现卡 / 指路助手 / 营火进度）
 * 一律问这一格 —— 谁自己读 `q.title`，谁就可能在真结局那一步把名字说错。
 */
export function objectiveTitle(row, stats) {
  return 按抉择取(row, 'titleByChoice', stats) ?? row?.title;
}

/**
 * 这一步的**分支日志**（W-E3 切片36）：**只有**写了 `journalByChoice` 的行才有
 * ⇒ 没写就回 `undefined`，调用方沿用进度句。
 *
 * 为什么不回落到 `row.journal`：主线 56 步都带 `journal` 格，但那一格今天是
 * 支线那套读者（`SideQuestSystem`）的字段，主线日志正文历来是进度句 ——
 * 在这里顺手回落，等于一夜之间把 56 条日志的正文全换掉（那是另一片的事）。
 */
export function objectiveJournalByChoice(row, stats) {
  return 按抉择取(row, 'journalByChoice', stats);
}

/**
 * 终局正文（W-E3 切片46）：通关那一刻 `ending-dialog` 读哪一段。
 *
 * 为什么要有这一处：结局正文只该有一条取名路径 —— 与标题 / 进度句 / 日志同一套 `按抉择取`。
 * 谁自己在别处读 `stats.decisions` 拼旗标名，就等于把"最后选了哪条"记成第二份真相：改一处、
 * 另一处不动时不报错，只是通关那段话与玩家真正做过的事对不上。
 * 没做过终局抉择（老档 / 直接跳关）⇒ 回旧的通用段，玩家不会读到空白。
 */
export function endingDialogKey(stats) {
  const 终局 = MAINLINE.find((r) => r.id === 'choice-final');
  return 按抉择取(终局, 'endingByChoice', stats) ?? 'ending_dialog_text';
}

export function objectiveDone(def, stats) {
  if (!def) return false;
  // W-E3 切片24：`requires` 从此有运行时读者 —— 前置旗标没齐，这一步连"完成"都不算。
  // 按表序推进时它恒真（注册表核"生产者必须在前头"，`advance()` 每步写 flags）；
  // 它真正防的是**资格被跳过**：分支跳转 / 坏档 / 未来的表改动让某一步的前置
  // 根本没被点亮时，玩家不会被推过一件还不够格做的事（也不会被 syncProgress 跳过它）。
  if (!objectiveRequiresMet(def, stats)) return false;
  switch (def.type) {
    case 'interact':
      // 门控那一格一律判未完成，理由见 `interactGateCondition`
      if (interactGateCondition(def)) return false;
      return Boolean(stats.discoveries?.has(def.targetId));
    case 'hits': return stats.hits >= def.target;
    case 'kills': return (stats.kills?.[def.enemyType] ?? 0) >= def.target;
    case 'discovery': return Boolean(stats.discoveries?.has(def.targetId));
    case 'spells': return stats.spellCasts >= def.target;
    case 'charged': return stats.chargedCasts >= def.target;
    case 'chests': return stats.chestsOpened >= def.target;
    case 'skills-unlocked': return stats.skillsUnlocked >= def.target;
    case 'dungeon': return Boolean(stats.dungeonsCleared?.has(def.dungeonId));
    case 'npc': return Boolean(stats.npcTalked?.has(def.targetId));
    case 'level': return (stats.level ?? 0) >= def.target;
    case 'mind': return (stats.mind ?? 0) >= def.target;
    case 'dungeon-rerun': return Boolean(stats.dungeonRerun);
    case 'gear': return (stats.gearSlots ?? []).includes(def.gearSlot);
    case 'choice': return def.choices?.some((c) => stats.decisions?.has(c.flag)) ?? false;
    case 'chapter-gate': return Boolean(def.autoComplete);
    case 'boss': {
      const key = BOSS_STAT_KEYS[def.bossId];
      // 名册里没有的 bossId 一律判未完成：宁可卡住一步，也不把"某只 Boss 死了"算成另一只
      return key ? Boolean(stats[key]) : false;
    }
    default: return false;
  }
}
