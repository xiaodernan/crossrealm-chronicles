/**
 * 目标/任务定义表（W-B3 切片1 建的数据层；切片4 起在役读者只有 `game/QuestSystem.js`）。
 *
 * 结构：
 * - objectives: 目标定义数组，每个目标可包含分支、条件、标志、失败、重访逻辑
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
 *   - requires: 前置标志要求 { flagName: true/false }（全部满足才可激活）
 *   - failsOn: 失败条件函数名（可选）
 *   - failMessage: 失败时显示的文案
 *   - onFail: 失败时执行的动作（reset/restart/branch）
 *   - branchTo: 分支目标 id（满足分支条件时跳转）
 *   - branchCondition: 分支条件函数名
 *   - revisit: 是否允许重访（完成后可再次触发）
 *   - reward: 完成奖励魂火
 *   - journal: 完成后日志文本
 *   - waypoint: 世界坐标指引 { x, z, label }
 */

import { ZONE_IDS, ZONE_NAMES } from './ZoneIdentity.js';

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
  'charged', 'skills-unlocked', 'dungeon-rerun',
];

export const OBJECTIVES = [
  // ── Chapter 1: 觉醒 ──
  {
    id: 'anchor',
    title: '觉醒：世界之锚',
    desc: '触摸枢纽中心的世界之锚。',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 1,
    waypoint: { x: 0, z: 55, label: '世界之锚' },
    reward: 10,
    journal: '世界之锚被唤醒，三界脉动在此交汇。',
  },
  {
    id: 'training',
    title: '战斗训练',
    desc: '训练木人命中 8 次。',
    type: 'hits',
    target: 8,
    chapter: 1,
    waypoint: { x: 12, z: 52, label: '训练木人' },
    reward: 5,
    journal: '基础连击已掌握。',
  },
  {
    id: 'soldiers',
    title: '影之试炼',
    desc: '击败 2 名影之战士。',
    type: 'kills',
    enemyType: 'soldier',
    target: 2,
    chapter: 1,
    waypoint: { x: -200, z: 0, label: ZONE_NAMES[ZONE_IDS.FANTASY] },
    reward: 10,
    journal: '两名影之战士倒在剑下。',
  },
  {
    id: 'fantasy-frag',
    title: '第一碎片',
    desc: '调查至尊石环。',
    type: 'discovery',
    targetId: 'fantasy-ring',
    chapter: 1,
    waypoint: { x: -200, z: -30, label: '至尊石环' },
    reward: 15,
    journal: '至尊石环碎片入手 — One Realm to bind them all。',
    flags: { hasFragmentFantasy: true },
  },
  {
    id: 'boss',
    title: '影界守护者',
    desc: '击败灰白森林 Boss。',
    type: 'boss',
    bossId: 'shadow-warden',
    chapter: 1,
    waypoint: { x: -250, z: -35, label: '影界守护者' },
    reward: 25,
    journal: '影界守护者陨落，森林重获安宁。',
    flags: { boss1Defeated: true },
  },
  // ── Chapter 2: 无尽位面 ──
  {
    id: 'magic-frag',
    title: '第二碎片',
    desc: '调查悬浮城堡。',
    type: 'discovery',
    targetId: 'magic-castle',
    chapter: 1,
    requires: { boss1Defeated: true },
    waypoint: { x: 0, z: -180, label: ZONE_NAMES[ZONE_IDS.MAGIC] },
    reward: 15,
    journal: '悬浮城堡碎片入手 — 魔法的痕迹仍在。',
    flags: { hasFragmentMagic: true },
  },
  {
    id: 'golem',
    title: '构装体歼灭',
    desc: '击败 1 名魔法构装体。',
    type: 'kills',
    enemyType: 'golem',
    target: 1,
    chapter: 1,
    waypoint: { x: 20, z: -210, label: '构装体巡逻区' },
    reward: 10,
    journal: '一台魔法构装体停止了运作。',
  },
  {
    id: 'space-frag',
    title: '第三碎片',
    desc: '触碰五维_tesseract。',
    type: 'discovery',
    targetId: 'space-tesseract',
    chapter: 1,
    requires: { hasFragmentMagic: true },
    waypoint: { x: 200, z: 80, label: ZONE_NAMES[ZONE_IDS.SPACE] },
    reward: 15,
    journal: '五维_tesseract 碎片入手 — 爱能跨越维度。',
    flags: { hasFragmentSpace: true },
  },
  {
    id: 'finale',
    title: '重铸锚点',
    desc: '集齐三枚碎片后再次触摸世界之锚。',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 1,
    requires: { hasFragmentFantasy: true, hasFragmentMagic: true, hasFragmentSpace: true },
    condition: 'checkAllFragments',
    waypoint: { x: 0, z: 55, label: '世界之锚' },
    reward: 30,
    journal: '世界之锚重铸，觉醒篇收束。',
    branchTo: 'ch1-complete',
    branchCondition: 'checkAllFragments',
  },
  {
    id: 'ch1-complete',
    title: 'Chapter 1 完成',
    desc: '世界之锚重铸，无尽位面开启。',
    type: 'chapter-gate',
    chapter: 2,
    autoComplete: true,
    announce: 'Chapter 2：无尽位面 已开启',
    reward: 0,
    journal: 'Chapter 1：觉醒 已完成 — 无尽位面开启。',
    flags: { chapter1Done: true },
  },
  {
    id: 'chests',
    title: 'Hidden Treasures',
    desc: '开启 5 个隐藏宝箱。',
    type: 'chests',
    target: 5,
    chapter: 2,
    waypoint: { x: -190, z: 25, label: '宝箱/地下城' },
    reward: 20,
    journal: '五处隐藏宝箱已清空。',
  },
  {
    id: 'talk-wanderer',
    title: '位面流浪者',
    desc: '与枢纽的位面流浪者对话。',
    type: 'npc',
    targetId: 'wanderer',
    chapter: 2,
    waypoint: { x: -8, z: 45, label: '位面流浪者' },
    reward: 10,
    journal: '位面流浪者分享了跨界秘辛。',
    flags: { talkedWanderer: true },
  },
  {
    id: 'boss2',
    title: '大奥术师',
    desc: '击败霍格沃兹遗境深处的大奥术师。',
    type: 'boss',
    bossId: 'archmagus',
    chapter: 2,
    waypoint: { x: 5, z: -220, label: '大奥术师' },
    reward: 30,
    journal: '大奥术师·萨尔林陨落，霍格沃兹遗境安宁。',
    flags: { boss2Defeated: true },
  },
  {
    id: 'elite',
    title: '虚空骑士',
    desc: '击败精英·虚空骑士。',
    type: 'kills',
    enemyType: 'elite',
    target: 1,
    chapter: 2,
    waypoint: { x: -50, z: -60, label: '虚空骑士' },
    reward: 15,
    journal: '一名精英虚空骑士被击败。',
  },
  {
    id: 'level',
    title: '穿越者之路',
    desc: '将等级提升至 5。',
    type: 'level',
    target: 5,
    chapter: 2,
    waypoint: { x: 0, z: 55, label: '营火升级' },
    reward: 10,
    journal: '等级达到 5，实力精进。',
  },
  {
    id: 'epilogue',
    title: '无尽位面',
    desc: '与宇航员回声对话，开启无尽探索。',
    type: 'npc',
    targetId: 'astronaut-echo',
    chapter: 2,
    requires: { boss2Defeated: true },
    waypoint: { x: 200, z: 90, label: '宇航员回声' },
    reward: 15,
    journal: '宇航员回声指引前路。',
    flags: { chapter3Ready: true },
    branchTo: 'ch2-complete',
    branchCondition: 'checkChapter3Ready',
  },
  {
    id: 'ch2-complete',
    title: 'Chapter 2 完成',
    desc: '无尽位面收束，位面飞升篇章开启。',
    type: 'chapter-gate',
    chapter: 3,
    autoComplete: true,
    announce: 'Chapter 3：位面飞升 已开启 — 法术 1–4、三座地下城、第三 Boss',
    reward: 0,
    journal: 'Chapter 2：无尽位面 已完成 — 位面飞升开启。',
    flags: { chapter2Done: true },
  },
  // ── Chapter 3: 位面飞升 ──
  {
    id: 'learn-spell',
    title: '奥术入门',
    desc: '施放任意法术 8 次（{spell1}–{spell4}）。',
    type: 'spells',
    target: 8,
    chapter: 3,
    waypoint: { x: 12, z: 52, label: '训练木人' },
    reward: 10,
    journal: '法术施放已入门。',
  },
  {
    id: 'crypt',
    title: '灰白遗城',
    desc: '清空森林地下城。',
    type: 'dungeon',
    dungeonId: 'ruin-crypt',
    chapter: 3,
    waypoint: { x: -190, z: 25, label: '灰白遗城入口' },
    reward: 20,
    journal: '灰白遗城已清空。',
    flags: { dungeonCryptCleared: true },
  },
  {
    id: 'library',
    title: '禁书图书馆',
    desc: '清空魔法地下城。',
    type: 'dungeon',
    dungeonId: 'forbidden-library',
    chapter: 3,
    waypoint: { x: -35, z: -200, label: '禁书图书馆' },
    reward: 20,
    journal: '禁书图书馆已清空。',
    flags: { dungeonLibraryCleared: true },
  },
  {
    id: 'rift',
    title: '五维裂隙',
    desc: '清空星际地下城。',
    type: 'dungeon',
    dungeonId: 'five-dim-rift',
    chapter: 3,
    waypoint: { x: 175, z: 95, label: '五维裂隙' },
    reward: 20,
    journal: '五维裂隙已清空。',
    flags: { dungeonRiftCleared: true },
  },
  {
    id: 'boss3',
    title: '奇点领主',
    desc: '击败米勒荒原的引力化身。',
    type: 'boss',
    bossId: 'singularity-herald',
    chapter: 3,
    waypoint: { x: 235, z: 155, label: '奇点领主' },
    reward: 35,
    journal: '奇点领主·引力化身陨落。',
    flags: { boss3Defeated: true },
  },
  {
    id: 'mind',
    title: '心智觉醒',
    desc: '在营火将「心智」升级至 2。',
    type: 'mind',
    target: 2,
    chapter: 3,
    waypoint: { x: 0, z: 55, label: '营火升级' },
    reward: 10,
    journal: '心智升级至 2，感知力增强。',
  },
  {
    id: 'ascension',
    title: '位面飞升',
    desc: '完成三界试炼后再次触摸世界之锚。',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 3,
    requires: { boss3Defeated: true },
    condition: 'checkAllDungeons',
    waypoint: { x: 0, z: 55, label: '世界之锚' },
    reward: 40,
    journal: '三界试炼完成，位面飞升。',
    flags: { chapter3Done: true },
    branchTo: 'ch3-complete',
    branchCondition: 'checkAllDungeons',
  },
  {
    id: 'ch3-complete',
    title: 'Chapter 3 完成',
    desc: '位面飞升达成，破碎时线开启。',
    type: 'chapter-gate',
    chapter: 4,
    autoComplete: true,
    announce: 'Chapter 4：破碎时线 已开启 — 向北探索，长按法术蓄力',
    reward: 0,
    journal: 'Chapter 3：位面飞升 已完成 — 破碎时线开启。',
    flags: { chapter3Done: true },
  },
  // ── Chapter 4: 破碎时线 ──
  {
    id: 'void-rift',
    title: '时线裂隙',
    desc: '调查破碎时线的裂隙。',
    type: 'discovery',
    targetId: 'void-rift',
    chapter: 4,
    requires: { chapter3Done: true },
    waypoint: { x: 0, z: 220, label: ZONE_NAMES[ZONE_IDS.VOID] },
    reward: 15,
    journal: '时线裂隙被发现，时间在此扭曲。',
    flags: { hasVoidRift: true },
  },
  {
    id: 'charge-spell',
    title: '蓄力奥术',
    desc: '施放 5 次蓄力法术（长按 {spell1}/{spell2}/{spell3}）。',
    type: 'charged',
    target: 5,
    chapter: 4,
    waypoint: { x: 12, z: 52, label: '训练木人' },
    reward: 15,
    journal: '蓄力法术掌握，可打断时停。',
  },
  {
    id: 'void-boss',
    title: '时线执政官',
    desc: '击败破碎时线隐藏 Boss。',
    type: 'boss',
    bossId: 'void-chronarch',
    chapter: 4,
    requires: { hasVoidRift: true },
    waypoint: { x: 0, z: 235, label: '时线执政官' },
    reward: 40,
    journal: '时线执政官陨落，真相大白。',
    flags: { voidBossDefeated: true },
  },
  {
    id: 'void-tablet',
    title: '五维碑文',
    desc: '阅读时线位面的碑文。',
    type: 'discovery',
    targetId: 'void-tablet',
    chapter: 4,
    waypoint: { x: 0, z: 225, label: '五维碑文' },
    reward: 10,
    journal: '五维碑文解读完毕。',
    flags: { hasVoidTablet: true },
  },
  {
    id: 'true-end',
    title: '真·位面行者',
    desc: '集齐四枚碎片后触摸世界之锚。',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 4,
    requires: { voidBossDefeated: true, hasVoidRift: true, hasVoidTablet: true },
    condition: 'checkTrueEnd',
    waypoint: { x: 0, z: 55, label: '世界之锚' },
    reward: 50,
    journal: '四枚碎片齐聚，真·位面行者诞生。',
    flags: { trueEndDone: true },
    branchTo: 'ch4-complete',
    branchCondition: 'checkTrueEnd',
  },
  {
    id: 'ch4-complete',
    title: 'Chapter 4 完成',
    desc: '真·位面行者觉醒，混沌边境开启。',
    type: 'chapter-gate',
    chapter: 5,
    autoComplete: true,
    announce: 'Chapter 5：混沌边境 已开启 — 向西北探索，营火「武器技能」解锁流派',
    reward: 0,
    journal: 'Chapter 4：破碎时线 已完成 — 混沌边境开启。',
    flags: { chapter4Done: true },
  },
  // ── Chapter 5: 混沌边境 ──
  {
    id: 'chaos-core',
    title: '混沌之核',
    desc: '触碰混沌边境的能量核心。',
    type: 'discovery',
    targetId: 'chaos-core',
    chapter: 5,
    requires: { chapter4Done: true },
    waypoint: { x: -200, z: 220, label: '混沌之核' },
    reward: 20,
    journal: '混沌之核脉动，边境震颤。',
    flags: { hasChaosCore: true },
  },
  {
    id: 'skills',
    title: '流派入门',
    desc: '解锁 3 个武器技能。',
    type: 'skills-unlocked',
    target: 3,
    chapter: 5,
    waypoint: { x: 0, z: 55, label: '营火·武器技能' },
    reward: 15,
    journal: '三大流派技能已解锁。',
    flags: { skillsUnlocked3: true },
  },
  {
    id: 'chaos-boss',
    title: '裂隙领主',
    desc: '击败混沌边境 Boss。',
    type: 'boss',
    bossId: 'chaos-overlord',
    chapter: 5,
    requires: { hasChaosCore: true },
    waypoint: { x: -200, z: 285, label: '裂隙领主' },
    reward: 50,
    journal: '混沌裂隙领主陨落，终局开启。',
    flags: { chaosBossDefeated: true },
  },
  {
    id: 'dungeon-rerun',
    title: '深渊再探',
    desc: '再次清空一座地下城。',
    type: 'dungeon-rerun',
    chapter: 5,
    waypoint: { x: -190, z: 25, label: '地下城入口' },
    reward: 25,
    journal: '深渊再探完成，循环再启。',
    flags: { dungeonRerunDone: true },
  },
  {
    id: 'infinity',
    title: '无尽行者',
    desc: '完成混沌试炼后触摸世界之锚。',
    type: 'interact',
    targetId: 'hub-anchor',
    chapter: 5,
    requires: { chaosBossDefeated: true, skillsUnlocked3: true },
    condition: 'checkInfinity',
    waypoint: { x: 0, z: 55, label: '世界之锚' },
    reward: 100,
    journal: '混沌试炼圆满，无尽行者称号获取。',
    flags: { infinityDone: true },
    revisit: true,
    branchTo: 'ch5-complete',
    branchCondition: 'checkInfinity',
  },
  {
    id: 'ch5-complete',
    title: 'Chapter 5 完成',
    desc: '无尽行者称号获取，全章节通关。',
    type: 'chapter-gate',
    chapter: 5,
    autoComplete: true,
    reward: 0,
    journal: 'Chapter 5：混沌边境 已完成 — 全流程通关。',
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

// 条件函数表（在役的 `QuestSystem` 与已删除的 `ObjectiveEngine` 过去各写一份，这里是一份）
export const CONDITIONS = {
  checkAllFragments: (state) => state.stats.discoveries?.has('fantasy-ring')
    && state.stats.discoveries?.has('magic-castle')
    && state.stats.discoveries?.has('space-tesseract'),
  // 「三界试炼」这一句在役表里问的是两件事实：三只地下城 + 第三只 Boss。
  // 早先这里只数地下城，于是任何直接用它做门控的消费者都能让玩家**跳过奇点领主**去飞升；
  // 在役表当时靠 `canAscend()` 另写一遍才没出事 —— 两份算式差一格，正是本切片要收掉的东西。
  checkAllDungeons: (state) => Boolean(state.stats.boss3Defeated)
    && state.stats.dungeonsCleared?.has('ruin-crypt')
    && state.stats.dungeonsCleared?.has('forbidden-library')
    && state.stats.dungeonsCleared?.has('five-dim-rift'),
  checkTrueEnd: (state) => state.stats.voidBossDefeated
    && state.stats.discoveries?.has('fantasy-ring')
    && state.stats.discoveries?.has('magic-castle')
    && state.stats.discoveries?.has('space-tesseract')
    && state.stats.discoveries?.has('void-rift'),
  checkChapter3Ready: (state) => state.stats.boss2Defeated,
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
    level: 1,
    mind: 0,
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
export const STAT_READINGS = ['level', 'mind', 'skillsUnlocked'];

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
  'stats-changed': (s, d) => {
    if (Number.isFinite(d.level)) s.level = d.level;
    if (Number.isFinite(d.mind)) s.mind = d.mind;
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
export function objectiveDone(def, stats) {
  if (!def) return false;
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
    case 'chapter-gate': return Boolean(def.autoComplete);
    case 'boss': {
      const key = BOSS_STAT_KEYS[def.bossId];
      // 名册里没有的 bossId 一律判未完成：宁可卡住一步，也不把"某只 Boss 死了"算成另一只
      return key ? Boolean(stats[key]) : false;
    }
    default: return false;
  }
}
