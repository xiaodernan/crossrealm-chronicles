import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { installWindowShim } from './helpers/enemyHarness.js';
import {
  V8_INSERT_POINTS, V9_INSERT_POINTS, V10_INSERT_POINTS, V11_INSERT_POINTS, V12_INSERT_POINTS,
  V13_INSERT_POINTS, V14_INSERT_POINTS, V15_INSERT_POINTS, V16_INSERT_POINTS, V17_INSERT_POINTS,
} from '../src/game/SaveMigrations.js';
import {
  BOSS_STAT_KEYS, MAINLINE, OBJECTIVES, chapterGateAfter, interactGateCondition,
} from '../src/content/objectives.js';
import { checkObjectiveTable, checkTable, CONTENT_TABLES } from '../src/content/registry.js';
import { MAP_BOSSES, QuestSystem } from '../src/game/QuestSystem.js';
import { AchievementSystem } from '../src/game/AchievementSystem.js';
import { attachAchievementExtras } from '../src/game/AchievementSystemExtras.js';
import { ALL_ACHIEVEMENTS_EXTRA } from '../src/content/achievements.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { BossApproachDirector } from '../src/world/BossApproachDirector.js';
import { BossRematchDirector } from '../src/world/BossRematchDirector.js';

/**
 * 主线只有一张表（W-B3 切片3 的门禁）。
 *
 * 切片3 收掉的不是"两张表内容不同"这种会报错的东西，而是**两份各自都对的抄本**：
 * `QuestSystem` 带着 32 行手抄任务定义、一张按 id 抄的路点表、四行"哪一步完成时翻章"，
 * 而 `content/objectives.js` 那张表把五只 Boss 都写成 `type:'boss'` + 各自的 `bossId`，
 * 并且给每一行标了 `chapter`。任何一处改动只落在其中一份时，全仓没有一条用例会红。
 * 所以这里钉的是"表说什么，序列做什么"这四件事的**位置**：
 *  ① 玩家序列是表的一个投影，且投影与旧抄本同序同行 —— 存档下标语义由冻结的 golden 钉住；
 *  ② 序列文件里不许再长出自己的表；
 *  ③ 章节由门控行**按位置**说话（`chapterGateAfter` 读紧跟其后的那一行），
 *     这个位置前提由注册表整表不变式双向盯着；
 *  ④ 从表里派生出来的那张 `MAP_BOSSES` 必须喂得动它的六个消费者 ——
 *     这里的行为用例实测到：手抄那份没有 `bossId` 这一格，于是 Boss 再战从来不会发生，
 *     首次靠近播报在整个游戏里只响一次（见下方用例的注释）。
 */

const SRC = join(process.cwd(), 'src');
/** 序列文件的源码文本。结构断言只看它，不看编译产物 */
const SEQ = readFileSync(join(SRC, 'game', 'QuestSystem.js'), 'utf8');
/** 去掉注释后的代码：文件头讲的是"这里以前有什么"，那些名字只该出现在注释里 */
const CODE = SEQ.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const walkSrc = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walkSrc(full) : (name.endsWith('.js') ? [full] : []);
});
const rel = (file) => file.slice(SRC.length + 1).replace(/\\/g, '/');

/**
 * 切片3 动手之前**在役**的那份手抄表的 id 与顺序（`git show d90fbcf:src/game/QuestSystem.js`）。
 *
 * 这是一份冻结的 golden，不从 `MAINLINE` 推：存档里的 `quests.questIndex` 就是这条序列的下标，
 * 老档读进来要落回同一步。用被检对象自己当基线等于什么都没钉住。
 */
const HEAD_ORDER = [
  'anchor', 'training', 'soldiers', 'fantasy-frag', 'boss', 'magic-frag', 'golem', 'space-frag',
  'finale', 'chests', 'talk-wanderer', 'boss2', 'elite', 'level', 'epilogue', 'learn-spell',
  'crypt', 'library', 'rift', 'boss3', 'mind', 'ascension', 'void-rift', 'charge-spell',
  'void-boss', 'void-tablet', 'true-end', 'chaos-core', 'skills', 'chaos-boss',
  'dungeon-rerun', 'infinity',
];

/**
 * **v8 之后**在役的那条序列（W-E3 切片9 加长主线一步）。
 *
 * 相对 `HEAD_ORDER` 只多了一处：`void-hunt`（怨影肃清 —— 清理三只时线怨影）插在第 24 位，
 * 也就是 `void-boss` 之前。**其余每一步的相对次序一个都没动**（下面两条断言钉住这件事）。
 *
 * 为什么要动主线：§1.2 C3 的通关时长读数指出「**缺口在主线**」（可选内容已经够长），
 * 而主线那 32 步的下标是**存档语义**（`quests.index`）⇒ 插步必须带一条存档迁移
 * （`SaveMigrations` 的 v7 → v8），否则老存档会**静默跳过**新插的那一步。
 */
const V8_ORDER = [
  'anchor', 'training', 'soldiers', 'fantasy-frag', 'boss', 'magic-frag', 'golem', 'space-frag',
  'finale', 'chests', 'talk-wanderer', 'boss2', 'elite', 'level', 'epilogue',
  'learn-spell', 'crypt', 'library', 'rift', 'boss3', 'mind', 'ascension', 'void-rift',
  'charge-spell', 'void-hunt', 'void-boss', 'void-tablet', 'true-end', 'chaos-core',
  'skills', 'chaos-boss', 'dungeon-rerun', 'infinity',
];

/**
 * **v9 之后**在役的那条序列（W-E3 切片10 主线再长三步）。
 *
 * 相对 `V8_ORDER` 多了三处（**旧序列**的下标）：
 * - 13 —— `hexer-hunt`（咒影追猎 —— 清理三位位面咒师），在 `level` 之前
 * - 25 —— `crawler-hunt`（深处的爬兽 —— 清理三只虚空爬兽），在 `void-boss` 之前
 * - 29 —— `knight-hunt`（骑士围剿 —— 解决三位深渊骑士），在 `skills` 之前
 *
 * 三步各挑一位面**独占**的原生敌人（魔幻 `hexer` / 时线 `crawler` / 深渊 `knight`）——
 * 独占是挑它们的理由：`kills` 判据按**敌人类型**计数（`stats.kills[type]`），
 * 拿一个两个位面共有的类型当判据，玩家在**别的**位面杀够了也算数 ⇒ 判据就松了。
 *
 * 插三处 ⇒ 迁移的插入点是**三个数**（`V9_INSERT_POINTS`）⇒ 老下标 ≥ 某个插点的都往后挪。
 */
const V9_ORDER = [
  'anchor', 'training', 'soldiers', 'fantasy-frag', 'boss', 'magic-frag', 'golem', 'space-frag',
  'finale', 'chests', 'talk-wanderer', 'boss2', 'elite', 'hexer-hunt', 'level', 'epilogue',
  'learn-spell', 'crypt', 'library', 'rift', 'boss3', 'mind', 'ascension', 'void-rift',
  'charge-spell', 'void-hunt', 'crawler-hunt', 'void-boss', 'void-tablet', 'true-end', 'chaos-core', 'knight-hunt',
  'skills', 'chaos-boss', 'dungeon-rerun', 'infinity',
];

/**
 * **v10 之后**在役的那条序列（W-E3 切片12 主线走进两座非试炼副本）。
 *
 * 相对 `V9_ORDER` 多了两处（**旧序列**的下标）：
 * - 27 —— `void-casket`（匣里的钟 —— 下断时之匣），在 `void-boss` 之前
 * - 33 —— `abyss-maw`（边界之下的颚 —— 下深渊之颚），在 `chaos-boss` 之前
 *
 * 这两步是**主线第一次指向非试炼的副本** ⇒ 它们要求那条不变式从"相等"放宽成
 * "**试炼清单 ⊆ 主线指的副本步**"（试炼仍是那三座；第 2 章的门、地图的已揭示、副本清单
 * 都读**试炼清单** ⇒ 一处都不受影响 ⇒ 不会死锁）。
 */
const V10_ORDER = [
  'anchor', 'training', 'soldiers', 'fantasy-frag', 'boss', 'magic-frag', 'golem', 'space-frag',
  'finale', 'chests', 'talk-wanderer', 'boss2', 'elite', 'hexer-hunt', 'level', 'epilogue',
  'learn-spell', 'crypt', 'library', 'rift', 'boss3', 'mind', 'ascension', 'void-rift',
  'charge-spell', 'void-hunt', 'crawler-hunt', 'void-casket', 'void-boss', 'void-tablet', 'true-end', 'chaos-core',
  'knight-hunt', 'skills', 'abyss-maw', 'chaos-boss', 'dungeon-rerun', 'infinity',
];

/**
 * **v11 之后**在役的那条序列（W-E3 切片13 主线把剩下四座副本也走一遍）。
 *
 * 相对 `V10_ORDER` 多了四处（**旧序列**的下标）：
 * - 2 —— `hub-catacombs`（枢纽之下的墓穴），在 `soldiers` 之前
 * - 10 —— `forest-shrine`（古树下的神龛），在 `talk-wanderer` 之前
 * - 35 —— `gloom-mist-crypt`（雾里的墓穴），在 `chaos-boss` 之前
 * - 36 —— `radiant-dawn-hall`（圣殿的清晨），在 `dungeon-rerun` 之前
 *
 * 至此**主线把九座副本全走了一遍**（三座试炼 + 六座别的）。
 *
 * **一次插四处**（而不是分四片插四跳）：存档链已经六跳了，每加一步主线就多一跳 ⇒
 * 一次多插几处，链才长得慢。
 */
const V11_ORDER = [
  'anchor', 'training', 'hub-catacombs', 'soldiers', 'fantasy-frag', 'boss', 'magic-frag', 'golem',
  'space-frag', 'finale', 'chests', 'forest-shrine', 'talk-wanderer', 'boss2', 'elite', 'hexer-hunt',
  'level', 'epilogue', 'learn-spell', 'crypt', 'library', 'rift', 'boss3', 'mind',
  'ascension', 'void-rift', 'charge-spell', 'void-hunt', 'crawler-hunt', 'void-casket', 'void-boss', 'void-tablet',
  'true-end', 'chaos-core', 'knight-hunt', 'skills', 'abyss-maw', 'gloom-mist-crypt', 'chaos-boss', 'radiant-dawn-hall',
  'dungeon-rerun', 'infinity',
];

/**
 * **v12 之后**在役的那条序列（W-E3 切片14 主线加五步"发现"）。
 *
 * 相对 `V11_ORDER` 多了五处（**旧序列**的下标）：
 * - 5 —— `fantasy-ruins`（废墟里的回声），在 `boss` 之前
 * - 16 —— `magic-forest`（禁林低语），在 `level` 之前
 * - 22 —— `space-wreck`（残骸上的光），在 `boss3` 之前
 * - 38 —— `gloom-moss`（会发光的苔），在 `chaos-boss` 之前
 * - 40 —— `radiant-altar`（祭坛上的光），在 `dungeon-rerun` 之前
 *
 * 每一位面一处**地标**（世界里本来就有的 POI ⇒ 玩家是真的在探索）⇒ 补的是**别的种类**
 * 的段落（切片13 之后主线里已经有九座副本 ⇒ 再堆副本步不会让故事更长）。
 */
const V12_ORDER = [
  'anchor', 'training', 'hub-catacombs', 'soldiers', 'fantasy-frag', 'fantasy-ruins', 'boss', 'magic-frag',
  'golem', 'space-frag', 'finale', 'chests', 'forest-shrine', 'talk-wanderer', 'boss2', 'elite',
  'hexer-hunt', 'magic-forest', 'level', 'epilogue', 'learn-spell', 'crypt', 'library', 'rift',
  'space-wreck', 'boss3', 'mind', 'ascension', 'void-rift', 'charge-spell', 'void-hunt', 'crawler-hunt',
  'void-casket', 'void-boss', 'void-tablet', 'true-end', 'chaos-core', 'knight-hunt', 'skills', 'abyss-maw',
  'gloom-mist-crypt', 'gloom-moss', 'chaos-boss', 'radiant-dawn-hall', 'radiant-altar', 'dungeon-rerun', 'infinity',
];

/**
 * **v13 之后**在役的那条序列（W-E3 切片15 主线加三步"别的种类"的段落）。
 *
 * 相对 `V12_ORDER` 多了三处（**旧序列**的下标）：
 * - 6 —— `elf-scout`（**对话** —— 与暗夜斥候交谈），在 `boss` 之前
 * - 45 —— `radiant-hunt`（**清剿** —— 辉煌圣域的原生爬兽），在 `dungeon-rerun` 之前
 * - 46 —— `chests-all`（**收集** —— 八个箱子全找齐），在 `infinity` 之前
 *
 * 切片14 的尾巴写着"下一片优先加**别的种类**（对话 / 抉择）" ⇒ 这一片就是那句话的兑现：
 * 对话（NPC）/ 清剿（独占原生敌人）/ 收集（散在七座区的箱子）—— 三种**不同**的段落。
 */
const V13_ORDER = [
  'anchor', 'training', 'hub-catacombs', 'soldiers', 'fantasy-frag', 'fantasy-ruins', 'elf-scout', 'boss',
  'magic-frag', 'golem', 'space-frag', 'finale', 'chests', 'forest-shrine', 'talk-wanderer', 'boss2',
  'elite', 'hexer-hunt', 'magic-forest', 'level', 'epilogue', 'learn-spell', 'crypt', 'library',
  'rift', 'space-wreck', 'boss3', 'mind', 'ascension', 'void-rift', 'charge-spell', 'void-hunt',
  'crawler-hunt', 'void-casket', 'void-boss', 'void-tablet', 'true-end', 'chaos-core', 'knight-hunt', 'skills',
  'abyss-maw', 'gloom-mist-crypt', 'gloom-moss', 'chaos-boss', 'radiant-dawn-hall', 'radiant-altar', 'radiant-hunt', 'dungeon-rerun',
  'chests-all', 'infinity',
];

/**
 * **v14 之后**在役的那条序列（W-E3 切片16 主线再加三步）。
 *
 * 相对 `V13_ORDER` 多了三处（**旧序列**的下标）：
 * - 14 —— `fantasy-tower`（守望塔 —— 灰白森林高处的塔），在 `talk-wanderer` 之前
 * - 25 —— `space-lens`（引力透镜 —— 空间里那面把星拉成一条线的巨镜），在 `space-wreck` 之前
 * - 44 —— `warden-hunt`（幽暗守夜 —— 幽暗林地里那三位不说话的守夜人），在 `chaos-boss` 之前
 *
 * 三步分属**三种不同的段落**（地标 / 地标 / 清剿），且**每一位面至多一处新地标** ——
 * 上一片定的节奏（"每个位面一处地标，同一座位面连着两个会变成跑腿"）守住 ✓。
 */
const V14_ORDER = [
  'anchor', 'training', 'hub-catacombs', 'soldiers', 'fantasy-frag', 'fantasy-ruins', 'elf-scout', 'boss',
  'magic-frag', 'golem', 'space-frag', 'finale', 'chests', 'forest-shrine', 'fantasy-tower', 'talk-wanderer',
  'boss2', 'elite', 'hexer-hunt', 'magic-forest', 'level', 'epilogue', 'learn-spell', 'crypt',
  'library', 'rift', 'space-lens', 'space-wreck', 'boss3', 'mind', 'ascension', 'void-rift',
  'charge-spell', 'void-hunt', 'crawler-hunt', 'void-casket', 'void-boss', 'void-tablet', 'true-end', 'chaos-core',
  'knight-hunt', 'skills', 'abyss-maw', 'gloom-mist-crypt', 'gloom-moss', 'warden-hunt', 'chaos-boss', 'radiant-dawn-hall',
  'radiant-altar', 'radiant-hunt', 'dungeon-rerun', 'chests-all', 'infinity',
];

/**
 * **v15 之后**在役的那条序列（W-E3 切片17 主线加两步"装备"）。
 *
 * 相对 `V14_ORDER` 多了两处（**旧序列**的下标）：
 * - 20 —— `gear-charm`（挂上护符），在 `level` 之前
 * - 32 —— `gear-sigil`（嵌上徽记），在 `void-rift` 之前
 *
 * 主线第一次要求玩家**动装备**（前面五种段落：副本 / 发现 / 对话 / 清剿 / 收集）。
 */
const V15_ORDER = [
  'anchor', 'training', 'hub-catacombs', 'soldiers', 'fantasy-frag', 'fantasy-ruins', 'elf-scout', 'boss',
  'magic-frag', 'golem', 'space-frag', 'finale', 'chests', 'forest-shrine', 'fantasy-tower', 'talk-wanderer',
  'boss2', 'elite', 'hexer-hunt', 'magic-forest', 'gear-charm', 'level', 'epilogue', 'learn-spell',
  'crypt', 'library', 'rift', 'space-lens', 'space-wreck', 'boss3', 'mind', 'ascension',
  'gear-sigil', 'void-rift', 'charge-spell', 'void-hunt', 'crawler-hunt', 'void-casket', 'void-boss', 'void-tablet',
  'true-end', 'chaos-core', 'knight-hunt', 'skills', 'abyss-maw', 'gloom-mist-crypt', 'gloom-moss', 'warden-hunt',
  'chaos-boss', 'radiant-dawn-hall', 'radiant-altar', 'radiant-hunt', 'dungeon-rerun', 'chests-all', 'infinity',
];


/**
 * **v16 之后**在役的那条序列（W-E3 切片18 主线加一步"抉择"）。
 *
 * 相对 `V15_ORDER` 多了一处（**旧序列**的下标）：
 * - 40 —— `choice-void`（虚空的归宿），在 `true-end` 之前
 *
 * 主线第一次**让玩家选一条路**（前面六种段落：副本 / 发现 / 对话 / 清剿 / 收集 / 装备，
 * 那六种都是"去做某件事"，这一种是"在两条路里挑一条"）。
 */
const V16_ORDER = [
  'anchor', 'training', 'hub-catacombs', 'soldiers', 'fantasy-frag', 'fantasy-ruins', 'elf-scout', 'boss',
  'magic-frag', 'golem', 'space-frag', 'finale', 'chests', 'forest-shrine', 'fantasy-tower', 'talk-wanderer',
  'boss2', 'elite', 'hexer-hunt', 'magic-forest', 'gear-charm', 'level', 'epilogue', 'learn-spell',
  'crypt', 'library', 'rift', 'space-lens', 'space-wreck', 'boss3', 'mind', 'ascension',
  'gear-sigil', 'void-rift', 'charge-spell', 'void-hunt', 'crawler-hunt', 'void-casket', 'void-boss', 'void-tablet',
  'choice-void', 'true-end', 'chaos-core', 'knight-hunt', 'skills', 'abyss-maw', 'gloom-mist-crypt', 'gloom-moss', 'warden-hunt',
  'chaos-boss', 'radiant-dawn-hall', 'radiant-altar', 'radiant-hunt', 'dungeon-rerun', 'chests-all', 'infinity',
];

/**
 * **v17 之后**在役的那条序列（W-E3 切片21 主线加三步"清剿"：圣域三道守卫）。
 *
 * 相对 `V16_ORDER` 多了三处 —— 三步是**连续**的（在 `dungeon-rerun` 之前）：
 * - 圣域骑士（`radiant-knight-hunt`）
 * - 圣域舞者（`radiant-dancer-hunt`）
 * - 圣印者（`radiant-brand-hunt`）
 *
 * 圣域那位面原本只有爬兽进了主线，而它自己的另外三种独占敌人只在野外与副本里
 * ⇒ 主线走那段故事时，那位面的**身份**（金甲、旋舞、灼场）一个都没露。
 */
const V17_ORDER = [
  'anchor', 'training', 'hub-catacombs', 'soldiers', 'fantasy-frag', 'fantasy-ruins', 'elf-scout', 'boss',
  'magic-frag', 'golem', 'space-frag', 'finale', 'chests', 'forest-shrine', 'fantasy-tower', 'talk-wanderer',
  'boss2', 'elite', 'hexer-hunt', 'magic-forest', 'gear-charm', 'level', 'epilogue', 'learn-spell',
  'crypt', 'library', 'rift', 'space-lens', 'space-wreck', 'boss3', 'mind', 'ascension',
  'gear-sigil', 'void-rift', 'charge-spell', 'void-hunt', 'crawler-hunt', 'void-casket', 'void-boss', 'void-tablet',
  'choice-void', 'true-end', 'chaos-core', 'knight-hunt', 'skills', 'abyss-maw', 'gloom-mist-crypt', 'gloom-moss',
  'warden-hunt', 'gloom-wraith-hunt', 'gloom-stalker-hunt', 'gloom-sentinel-hunt', 'chaos-boss',
  'radiant-dawn-hall', 'radiant-altar', 'radiant-hunt',
  'radiant-knight-hunt', 'radiant-dancer-hunt', 'radiant-brand-hunt',
  'dungeon-rerun', 'chests-all', 'infinity',
];
const gates = OBJECTIVES.filter((r) => r.type === 'chapter-gate');

beforeEach(() => { installWindowShim(); });
afterEach(() => {
  globalThis.window = undefined;
  globalThis.CustomEvent = undefined;
});

describe('① 玩家序列 = 表的投影，且与旧抄本同序同行', () => {
  it('v7 存档里的那 32 步就是老抄本（这份 golden 自己没被动过）', () => {
    expect(HEAD_ORDER).toHaveLength(32);
    expect(new Set(HEAD_ORDER).size, '老抄本里有重复 id').toBe(HEAD_ORDER.length);
  });

  it('W-E3 切片9 之后：主线是 33 步，新步只插在第 24 位，其余每一步的次序一个都没动', () => {
    expect(V8_ORDER).toHaveLength(33);
    expect(new Set(V8_ORDER).size, 'v8 序列里有重复 id').toBe(V8_ORDER.length);
    // 只多了一处插入 —— 头尾两段逐字相同（"加长"不是"重排"）
    expect(V8_ORDER.slice(0, 24)).toEqual(HEAD_ORDER.slice(0, 24));
    expect(V8_ORDER.slice(25)).toEqual(HEAD_ORDER.slice(24));
    expect(V8_ORDER[24], '第 24 位不是新插的那一步').toBe('void-hunt');
  });

  it('W-E3 切片10 之后：主线是 36 步，三处插入，其余每一步的次序一个都没动', () => {
    expect(V9_ORDER).toHaveLength(36);
    expect(new Set(V9_ORDER).size, 'v9 序列里有重复 id').toBe(V9_ORDER.length);
    // 三处插入，其余逐字相同（把 v9 那条序列按三个插点拆开重组，逐段对）
    // 注意：这里用的是**新序列**里那三步的下标（13 / 26 / 31）——
    // 迁移常量那边用的是**旧序列**的下标（13 / 25 / 29），两套口径别混。
    const 新序列插点 = [13, 26, 31];
    const 旧 = [];
    for (let i = 0; i < V9_ORDER.length; i++) {
      if (新序列插点.includes(i)) continue;
      旧.push(V9_ORDER[i]);
    }
    expect(旧, '去掉三处插入后应当逐字等于 v8 那条序列').toEqual(V8_ORDER);
    expect(V9_ORDER[13], '第 13 位不是 hexer-hunt').toBe('hexer-hunt');
    expect(V9_ORDER[26], '第 26 位不是 crawler-hunt').toBe('crawler-hunt');
    expect(V9_ORDER[31], '第 31 位不是 knight-hunt').toBe('knight-hunt');
  });

  it('W-E3 切片12 之后：主线是 38 步，两处插入（主线第一次走进非试炼副本）', () => {
    expect(V10_ORDER).toHaveLength(38);
    expect(new Set(V10_ORDER).size, 'v10 序列里有重复 id').toBe(V10_ORDER.length);
    // 两处插入，其余逐字相同（新序列里那两步的下标是 27 / 34）
    const 新序列插点 = [27, 34];
    const 旧 = [];
    for (let i = 0; i < V10_ORDER.length; i++) {
      if (新序列插点.includes(i)) continue;
      旧.push(V10_ORDER[i]);
    }
    expect(旧, '去掉两处插入后应当逐字等于 v9 那条序列').toEqual(V9_ORDER);
    expect(V10_ORDER[27], '第 27 位不是 void-casket').toBe('void-casket');
    expect(V10_ORDER[34], '第 34 位不是 abyss-maw').toBe('abyss-maw');
  });

  it('W-E3 切片13 之后：主线是 42 步，四处插入（主线把九座副本全走了一遍）', () => {
    expect(V11_ORDER).toHaveLength(42);
    expect(new Set(V11_ORDER).size, 'v11 序列里有重复 id').toBe(V11_ORDER.length);
    // 四处插入，其余逐字相同（新序列里那四步的下标是 2 / 11 / 37 / 39）
    const 新序列插点 = [2, 11, 37, 39];
    const 旧 = [];
    for (let i = 0; i < V11_ORDER.length; i++) {
      if (新序列插点.includes(i)) continue;
      旧.push(V11_ORDER[i]);
    }
    expect(旧, '去掉四处插入后应当逐字等于 v10 那条序列').toEqual(V10_ORDER);
    expect(V11_ORDER[2], '第 2 位不是 hub-catacombs').toBe('hub-catacombs');
    expect(V11_ORDER[11], '第 11 位不是 forest-shrine').toBe('forest-shrine');
    expect(V11_ORDER[37], '第 37 位不是 gloom-mist-crypt').toBe('gloom-mist-crypt');
    expect(V11_ORDER[39], '第 39 位不是 radiant-dawn-hall').toBe('radiant-dawn-hall');
  });

  it('W-E3 切片14 之后：主线是 47 步，五处插入（每一位面一处地标）', () => {
    expect(V12_ORDER).toHaveLength(47);
    expect(new Set(V12_ORDER).size, 'v12 序列里有重复 id').toBe(V12_ORDER.length);
    // 五处插入，其余逐字相同（新序列里那五步的下标是 5 / 17 / 24 / 41 / 44）
    const 新序列插点 = [5, 17, 24, 41, 44];
    const 旧 = [];
    for (let i = 0; i < V12_ORDER.length; i++) {
      if (新序列插点.includes(i)) continue;
      旧.push(V12_ORDER[i]);
    }
    expect(旧, '去掉五处插入后应当逐字等于 v11 那条序列').toEqual(V11_ORDER);
    expect(V12_ORDER[5], '第 5 位不是 fantasy-ruins').toBe('fantasy-ruins');
    expect(V12_ORDER[17], '第 17 位不是 magic-forest').toBe('magic-forest');
    expect(V12_ORDER[24], '第 24 位不是 space-wreck').toBe('space-wreck');
    expect(V12_ORDER[41], '第 41 位不是 gloom-moss').toBe('gloom-moss');
    expect(V12_ORDER[44], '第 44 位不是 radiant-altar').toBe('radiant-altar');
  });

  it('W-E3 切片15 之后：主线是 50 步，三处插入（对话 / 圣域清剿 / 宝箱收尾）', () => {
    expect(V13_ORDER).toHaveLength(50);
    expect(new Set(V13_ORDER).size, 'v13 序列里有重复 id').toBe(V13_ORDER.length);
    // 三处插入，其余逐字相同（新序列里那三步的下标是 6 / 46 / 48）
    const 新序列插点 = [6, 46, 48];
    const 旧 = [];
    for (let i = 0; i < V13_ORDER.length; i++) {
      if (新序列插点.includes(i)) continue;
      旧.push(V13_ORDER[i]);
    }
    expect(旧, '去掉三处插入后应当逐字等于 v12 那条序列').toEqual(V12_ORDER);
    expect(V13_ORDER[6], '第 6 位不是 elf-scout').toBe('elf-scout');
    expect(V13_ORDER[46], '第 46 位不是 radiant-hunt').toBe('radiant-hunt');
    expect(V13_ORDER[48], '第 48 位不是 chests-all').toBe('chests-all');
  });

  it('W-E3 切片16 之后：主线是 53 步，三处插入（守望塔 / 引力透镜 / 幽暗守夜）', () => {
    expect(V14_ORDER).toHaveLength(53);
    expect(new Set(V14_ORDER).size, 'v14 序列里有重复 id').toBe(V14_ORDER.length);
    // 三处插入，其余逐字相同（新序列里那三步的下标是 14 / 26 / 45）
    const 新序列插点 = [14, 26, 45];
    const 旧 = [];
    for (let i = 0; i < V14_ORDER.length; i++) {
      if (新序列插点.includes(i)) continue;
      旧.push(V14_ORDER[i]);
    }
    expect(旧, '去掉三处插入后应当逐字等于 v13 那条序列').toEqual(V13_ORDER);
    expect(V14_ORDER[14], '第 14 位不是 fantasy-tower').toBe('fantasy-tower');
    expect(V14_ORDER[26], '第 26 位不是 space-lens').toBe('space-lens');
    expect(V14_ORDER[45], '第 45 位不是 warden-hunt').toBe('warden-hunt');
  });

  it('W-E3 切片17 之后：主线是 55 步，两处插入（挂护符 / 嵌徽记）', () => {
    expect(V15_ORDER).toHaveLength(55);
    expect(new Set(V15_ORDER).size, 'v15 序列里有重复 id').toBe(V15_ORDER.length);
    // 这一份是**历史**冻结名单（在役序列由下面 v16 那一条比）——
    // 两处插入，其余逐字相同（新序列里那两步的下标是 20 / 32）
    const 新序列插点 = [20, 32];
    const 旧 = [];
    for (let i = 0; i < V15_ORDER.length; i++) {
      if (新序列插点.includes(i)) continue;
      旧.push(V15_ORDER[i]);
    }
    expect(旧, '去掉两处插入后应当逐字等于 v14 那条序列').toEqual(V14_ORDER);
    expect(V15_ORDER[20], '第 20 位不是 gear-charm').toBe('gear-charm');
    expect(V15_ORDER[32], '第 32 位不是 gear-sigil').toBe('gear-sigil');
  });

  it('W-E3 切片18 之后：主线是 56 步，多一步"抉择"', () => {
    expect(V16_ORDER).toHaveLength(56);
    expect(new Set(V16_ORDER).size, 'v16 序列里有重复 id').toBe(V16_ORDER.length);
    // 这一份是**历史**冻结名单（在役序列由下面 v17 那一条比）——
    // 相对 v15 多的那一步：choice-void（抉择）
    const 旧 = V16_ORDER.filter((id) => id !== 'choice-void');
    expect(旧, '去掉 choice-void 后应当逐字等于 v15 那条序列').toEqual(V15_ORDER);
    expect(V16_ORDER[40], '第 40 位不是 choice-void').toBe('choice-void');
  });

  it('W-E3 切片21 之后：主线是 62 步，多六步"清剿"（两位面各三道守卫）', () => {
    expect(V17_ORDER).toHaveLength(62);
    expect(new Set(V17_ORDER).size, 'v17 序列里有重复 id').toBe(V17_ORDER.length);
    expect(MAINLINE.map((r) => r.id)).toEqual(V17_ORDER);
    // 相对 v16 多的那六步：两处，**每处三步连续**
    const 新增 = ['gloom-wraith-hunt', 'gloom-stalker-hunt', 'gloom-sentinel-hunt',
      'radiant-knight-hunt', 'radiant-dancer-hunt', 'radiant-brand-hunt'];
    const 旧 = V17_ORDER.filter((id) => !新增.includes(id));
    expect(旧, '去掉那六步后应当逐字等于 v16 那条序列').toEqual(V16_ORDER);
    expect(V17_ORDER[49], '第 49 位不是 gloom-wraith-hunt').toBe('gloom-wraith-hunt');
    expect(V17_ORDER[51], '第 51 位不是 gloom-sentinel-hunt').toBe('gloom-sentinel-hunt');
    expect(V17_ORDER[56], '第 56 位不是 radiant-knight-hunt').toBe('radiant-knight-hunt');
    expect(V17_ORDER[58], '第 58 位不是 radiant-brand-hunt').toBe('radiant-brand-hunt');
  });

  it('迁移的插入点与那份冻结名单一致（插入点算错位置当场红）', () => {    expect(V8_INSERT_POINTS).toEqual([24]);
    // v7 → v8：旧序列的 24 号位是 `void-boss`，新步插在它**之前**
    expect(HEAD_ORDER[24]).toBe('void-boss');
    expect(V8_ORDER[24]).toBe('void-hunt');
    // v8 → v9：三个插点（**旧序列**口径）各自指到它前面那一步
    expect(V9_INSERT_POINTS).toEqual([13, 25, 29]);
    expect(V8_ORDER[13]).toBe('level');
    expect(V8_ORDER[25]).toBe('void-boss');
    expect(V8_ORDER[29]).toBe('skills');
    // 折算后的落点 = 新序列里那些步的位置（老档要落回同一步）
    expect(V9_ORDER[13 + 1], '老档的 13 号位（level）没落到新表的 level 上').toBe('level');
    expect(V9_ORDER[25 + 2], '老档的 25 号位（void-boss）没落到新表的 void-boss 上').toBe('void-boss');
    expect(V9_ORDER[29 + 3], '老档的 29 号位（skills）没落到新表的 skills 上').toBe('skills');
    // v9 → v10：两个插点（**旧序列**口径）
    expect(V10_INSERT_POINTS).toEqual([27, 33]);
    expect(V9_ORDER[27]).toBe('void-boss');
    expect(V9_ORDER[33]).toBe('chaos-boss');
    expect(V10_ORDER[27 + 1], '老档的 27 号位（void-boss）没落到新表的 void-boss 上').toBe('void-boss');
    expect(V10_ORDER[33 + 2], '老档的 33 号位（chaos-boss）没落到新表的 chaos-boss 上').toBe('chaos-boss');
    // v10 → v11：四个插点（**旧序列**口径）
    expect(V11_INSERT_POINTS).toEqual([2, 10, 35, 36]);
    expect(V10_ORDER[2]).toBe('soldiers');
    expect(V10_ORDER[10]).toBe('talk-wanderer');
    expect(V10_ORDER[35]).toBe('chaos-boss');
    expect(V10_ORDER[36]).toBe('dungeon-rerun');
    // 折算后的落点 = 新序列里那些步的位置（老档要落回同一步）
    expect(V11_ORDER[2 + 1], '老档的 2 号位（soldiers）没落到新表的 soldiers 上').toBe('soldiers');
    expect(V11_ORDER[10 + 2], '老档的 10 号位（talk-wanderer）没落到新表的 talk-wanderer 上').toBe('talk-wanderer');
    expect(V11_ORDER[35 + 3], '老档的 35 号位（chaos-boss）没落到新表的 chaos-boss 上').toBe('chaos-boss');
    expect(V11_ORDER[36 + 4], '老档的 36 号位（dungeon-rerun）没落到新表的 dungeon-rerun 上').toBe('dungeon-rerun');
    // v11 → v12：五个插点（**旧序列**口径）
    expect(V12_INSERT_POINTS).toEqual([5, 16, 22, 38, 40]);
    expect(V11_ORDER[5]).toBe('boss');
    expect(V11_ORDER[16]).toBe('level');
    expect(V11_ORDER[22]).toBe('boss3');
    expect(V11_ORDER[38]).toBe('chaos-boss');
    expect(V11_ORDER[40]).toBe('dungeon-rerun');
    // 折算后的落点 = 新序列里那些步的位置（老档要落回同一步）
    expect(V12_ORDER[5 + 1], '老档的 5 号位（boss）没落到新表的 boss 上').toBe('boss');
    expect(V12_ORDER[16 + 2], '老档的 16 号位（level）没落到新表的 level 上').toBe('level');
    expect(V12_ORDER[22 + 3], '老档的 22 号位（boss3）没落到新表的 boss3 上').toBe('boss3');
    expect(V12_ORDER[38 + 4], '老档的 38 号位（chaos-boss）没落到新表的 chaos-boss 上').toBe('chaos-boss');
    expect(V12_ORDER[40 + 5], '老档的 40 号位（dungeon-rerun）没落到新表的 dungeon-rerun 上').toBe('dungeon-rerun');
    // v12 → v13：三个插点（**旧序列**口径）
    expect(V13_INSERT_POINTS).toEqual([6, 45, 46]);
    expect(V12_ORDER[6]).toBe('boss');
    expect(V12_ORDER[45]).toBe('dungeon-rerun');
    expect(V12_ORDER[46]).toBe('infinity');
    expect(V13_ORDER[6 + 1], '老档的 6 号位（boss）没落到新表的 boss 上').toBe('boss');
    expect(V13_ORDER[45 + 2], '老档的 45 号位（dungeon-rerun）没落到新表的 dungeon-rerun 上').toBe('dungeon-rerun');
    expect(V13_ORDER[46 + 3], '老档的 46 号位（infinity）没落到新表的 infinity 上').toBe('infinity');
    // v13 → v14：三个插点（**旧序列**口径）
    expect(V14_INSERT_POINTS).toEqual([14, 25, 43]);
    expect(V13_ORDER[14]).toBe('talk-wanderer');
    expect(V13_ORDER[25]).toBe('space-wreck');
    expect(V13_ORDER[43]).toBe('chaos-boss');
    expect(V14_ORDER[14 + 1], '老档的 14 号位（talk-wanderer）没落到新表上').toBe('talk-wanderer');
    expect(V14_ORDER[25 + 2], '老档的 25 号位（space-wreck）没落到新表上').toBe('space-wreck');
    expect(V14_ORDER[43 + 3], '老档的 44 号位（chaos-boss）没落到新表上').toBe('chaos-boss');
    // v15 → v16：一处插点（**旧序列**口径）
    expect(V16_INSERT_POINTS).toEqual([40]);
    expect(V15_ORDER[40], '旧序列第 40 位不是 true-end（choice-void 插在它之前）').toBe('true-end');
    expect(V16_ORDER[40], '新序列第 40 位不是 choice-void').toBe('choice-void');
    expect(V16_ORDER[41], '老档的 40 号位（true-end）没落到新表上').toBe('true-end');
    // v16 → v17：**两处**插点，每处**三个**相同的数（六步分成两组，各组连续）
    expect(V17_INSERT_POINTS).toEqual([49, 49, 49, 53, 53, 53]);
    expect(V16_ORDER[48], '旧序列第 48 位不是 warden-hunt').toBe('warden-hunt');
    expect(V16_ORDER[49], '旧序列第 49 位不是 chaos-boss').toBe('chaos-boss');
    expect(V16_ORDER[52], '旧序列第 52 位不是 radiant-hunt').toBe('radiant-hunt');
    expect(V16_ORDER[53], '旧序列第 53 位不是 dungeon-rerun').toBe('dungeon-rerun');
    expect(V17_ORDER[52], '老档的 49 号位（chaos-boss）没落到新表上').toBe('chaos-boss');
    expect(V17_ORDER[59], '老档的 53 号位（dungeon-rerun）没落到新表上').toBe('dungeon-rerun');
    // v14 → v15：两个插点（**旧序列**口径）
    expect(V15_INSERT_POINTS).toEqual([20, 31]);
    expect(V14_ORDER[20]).toBe('level');
    expect(V14_ORDER[31]).toBe('void-rift');
    expect(V15_ORDER[20 + 1], '老档的 20 号位（level）没落到新表上').toBe('level');
    expect(V15_ORDER[31 + 2], '老档的 31 号位（void-rift）没落到新表上').toBe('void-rift');
  });

  it('投影只去掉章节门控行：一格不多一格不少，且不重排', () => {
    expect(MAINLINE.every((r) => r.type !== 'chapter-gate')).toBe(true);
    expect(OBJECTIVES.length - MAINLINE.length).toBe(gates.length);
    // 全表里那些非门控行，按表序读出来必须与投影完全一致（投影不是另排一遍）
    expect(OBJECTIVES.filter((r) => r.type !== 'chapter-gate').map((r) => r.id))
      .toEqual(MAINLINE.map((r) => r.id));
    expect(gates.length).toBe(5);
  });

  it('门控行没漏进玩家序列，也没有玩家步被投影掉（每格都数得过来）', () => {
    const ids = new Set(MAINLINE.map((r) => r.id));
    for (const g of gates) expect(ids.has(g.id), `${g.id} 是门控行，不该出现在玩家序列里`).toBe(false);
    // 表里每一行都必须有归属：要么在序列里，要么是门控行
    for (const r of OBJECTIVES) {
      expect(ids.has(r.id) || r.type === 'chapter-gate', `${r.id} 既不在序列也不是门控行`).toBe(true);
    }
  });
});

describe('② 序列文件不再长出自己的表', () => {
  it('那张按 id 抄的路点表与四行"哪一步翻章"都不在这个文件里了', () => {
    // 只看代码：文件头那段历史说明里全是这些被删掉的名字，扫注释会得到一句假红
    expect(CODE).not.toMatch(/\bQUESTS\b\s*=/);
    expect(CODE).not.toMatch(/QUEST_WAYPOINTS/);
    // 旧抄本用行上的旗标表达门控，新表把它写成那一行自己的 `condition`
    expect(CODE).not.toMatch(/\brequire(AllFragments|Ascension|TrueEnd|Infinity)\b/);
    // 翻章不再认"刚完成的那一步叫什么"
    expect(CODE).not.toMatch(/finished\??\.id\s*===/);
    expect(CODE).toMatch(/chapterGateAfter\(/);
    expect(CODE).toMatch(/MAINLINE/);
  });

  it('全仓没有第二个消费者还在找那份手抄表（旧导出名彻底没了）', () => {
    const files = walkSrc(SRC);
    // 从 QuestSystem 的 import 具名清单里查 `QUESTS`：注释里提到这个词是历史说明，不算引用
    const importers = [];
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*QuestSystem\.js['"]/g)) {
        if (m[1].split(',').map((s) => s.trim()).includes('QUESTS')) importers.push(rel(f));
      }
    }
    expect(importers, '还在从序列文件 import 那份手抄表').toEqual([]);
    // 序列文件自己不导出表；导出的是序列的消费者要用的那份地图标记
    expect(SEQ).not.toMatch(/^export const QUESTS\b/m);
    expect(SEQ).toMatch(/^export const MAP_BOSSES\b/m);
    // 六处消费者（HUD / 世界地图 / 罗盘 / 三个 director）今天确实还在按 `MAP_BOSSES` 取货
    const readers = files.filter((f) => /MAP_BOSSES/.test(readFileSync(f, 'utf8')) && !f.endsWith('QuestSystem.js'));
    expect(readers.length).toBeGreaterThanOrEqual(5);
  });
});

describe('③ 章节由门控行按位置说话（chapterGateAfter 与整表不变式）', () => {
  it('每一道门都紧跟在为它之外的那一步后面，且为那一行开门', () => {
    expect(gates.length).toBeGreaterThan(0);
    for (const g of gates) {
      const i = OBJECTIVES.indexOf(g);
      const prev = OBJECTIVES[i - 1];
      expect(prev, `${g.id} 前面没有行`).toBeTruthy();
      expect(prev.type).not.toBe('chapter-gate');
      expect(chapterGateAfter(prev.id), `${prev.id} 走完后跨不过 ${g.id}`).toBe(g);
      // 门控行后面不该再紧跟一道门（那第二道永远轮不到）
      expect(chapterGateAfter(g.id)).toBeNull();
    }
  });

  it('走完门前那一步就翻章，翻到门标的那一档（翻章不认这一步叫什么）', () => {
    expect(chapterGateAfter('no-such-objective')).toBeNull();
    const gate = gates[0];
    const before = OBJECTIVES[OBJECTIVES.indexOf(gate) - 1];
    expect(before.type).not.toBe('chapter-gate');
    const probe = new QuestSystem({ toast() {}, play() {} });
    probe.questIndex = MAINLINE.findIndex((r) => r.id === before.id);
    expect(probe.current.id).toBe(before.id);
    expect(probe.chapter).toBe(1);
    probe.advance();                        // 序列只把"完成的是哪一步"交给位置去问
    expect(probe.chapter).toBe(gate.chapter);
  });

  it('真表过整表不变式：一条都不报（accept 方向，且门确实有 5 道）', () => {
    expect(checkObjectiveTable(OBJECTIVES)).toEqual([]);
    expect(OBJECTIVES.filter((r) => r.type === 'chapter-gate' && r.announce)).toHaveLength(4);
  });

  it('不变式接在注册表的槽位上，不是只被这份用例调用的一个孤立函数', () => {
    const entry = CONTENT_TABLES.find((t) => t.kind === 'objectives');
    expect(entry, '注册表里没有 objectives 这一条（那下面那句走的就是没人走的代码）').toBeTruthy();
    const planted = structuredClone(OBJECTIVES);
    delete planted[OBJECTIVES.indexOf(gates[0])].autoComplete;
    // 走 shipped 入口 `checkTable`：它替不变式说话，才算这条规则在开机检查里活着
    expect(checkTable(entry)).toEqual([]);
    expect(checkTable({ ...entry, table: planted }).some((m) => m.includes('autoComplete')))
      .toBe(true);
  });

  /** 跑一份表的副本，返回不变式报的条数与第一条消息 */
  const runWith = (mutate) => {
    const table = structuredClone(OBJECTIVES);
    mutate(table);
    const issues = checkObjectiveTable(table);
    expect(issues.length, '这份变异没被整表不变式抓到').toBeGreaterThan(0);
    return issues;
  };
  const indexOf = (id) => OBJECTIVES.findIndex((r) => r.id === id);

  it('双向：在门前插一步 → 位置前提断了', () => {
    const g = gates[0];
    const issues = runWith((t) => t.splice(indexOf(g.id), 0, {
      id: 'plant-extra-step', type: 'hits', target: 1, chapter: g.chapter,
    }));
    expect(issues.some((m) => m.includes(`("${g.id}")`) && m.includes('branchTo')))
      .toBe(true);
  });

  it('双向：开门那一格删掉 announce → 喊话失踪', () => {
    const g = gates.find((r) => r.announce);
    const issues = runWith((t) => { delete t[indexOf(g.id)].announce; });
    expect(issues.some((m) => m.includes('announce') && m.includes(`("${g.id}")`))).toBe(true);
  });

  it('双向：不给玩家开新章的那道门写 announce → 多喊一句', () => {
    const g = gates.find((r) => !r.announce);
    expect(g, '表里没有"不翻章的门控行"，这条无从反证').toBeTruthy();
    const issues = runWith((t) => { t[indexOf(g.id)].announce = 'Chapter 9：瞎写的一章'; });
    expect(issues.some((m) => m.includes('没有开新章') && m.includes(`("${g.id}")`))).toBe(true);
  });

  it('双向：announce 喊的章号与 chapter 不一致 → 抓住', () => {
    const g = gates.find((r) => r.announce);
    const issues = runWith((t) => { t[indexOf(g.id)].announce = 'Chapter 9：不是这一章'; });
    expect(issues.some((m) => m.includes('喊的不是第'))).toBe(true);
  });

  it('双向：章节沿表回退 → 抓住', () => {
    const i = indexOf('boss2');            // 表中间的一格，改小它必然比前一行小
    const issues = runWith((t) => { t[i].chapter = 1; });
    expect(issues.some((m) => m.includes('比上一行') && m.includes('("boss2")'))).toBe(true);
  });

  it('双向：requires 用了一个更晚才产出的标志 → 抓住（那一步永远激活不了）', () => {
    const i = indexOf('training');
    const issues = runWith((t) => { t[i].requires = { boss2Defeated: true }; });
    expect(issues.some((m) => m.includes('requires.boss2Defeated') && m.includes('没有任何一步')))
      .toBe(true);
  });

  it('双向：requires 要的值与产出方写的值不同 → 抓住', () => {
    // 把 `hasFragmentFantasy` 的产出改成 false：读取方要 true，两者不再同一句话
    const i = indexOf('fantasy-frag');
    const issues = runWith((t) => { t[i].flags = { hasFragmentFantasy: false }; });
    expect(issues.some((m) => m.includes('requires.hasFragmentFantasy'))).toBe(true);
  });

  it('双向：玩家步借用门控行的字段 → 抓住', () => {
    const issues = runWith((t) => {
      t[indexOf('chests')].autoComplete = true;
      t[indexOf('level')].announce = 'Chapter 2：乱喊';
    });
    expect(issues.filter((m) => m.includes('只有 chapter-gate 那一族才有'))).toHaveLength(2);
  });

  it('双向：branchTo 指向不相邻的那一行 → 抓住', () => {
    const issues = runWith((t) => { t[indexOf('finale')].branchTo = 'ch2-complete'; });
    expect(issues.some((m) => m.includes('不是紧跟其后的那一行'))).toBe(true);
  });

  it('双向：门控行忘了 autoComplete → 主线在那一格断掉', () => {
    const g = gates[0];
    const issues = runWith((t) => { delete t[indexOf(g.id)].autoComplete; });
    expect(issues.some((m) => m.includes('autoComplete') && m.includes(`("${g.id}")`))).toBe(true);
  });
});

describe('④ 派生出来的 MAP_BOSSES 喂得动它的六个消费者', () => {
  it('每一只骷髅带的字段都是消费者要的那几个', () => {
    expect(MAP_BOSSES.length).toBe(Object.keys(BOSS_STAT_KEYS).length);
    for (const b of MAP_BOSSES) {
      for (const key of ['bossId', 'label', 'short', 'color']) {
        expect(typeof b[key], `${b.bossId ?? '?'} 的 ${key} 不是字符串（手抄那版就没有 bossId）`)
          .toBe('string');
        expect(b[key].length).toBeGreaterThan(0);
      }
      expect(BOSS_STAT_KEYS[b.bossId], `骷髅上的 ${b.bossId} 不在名册上`).toBeTruthy();
      expect(Number.isInteger(b.chapter)).toBe(true);
      expect(b.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  /** 只实现这两个 director 真正调用的接口，别的一律不给 */
  const host = (spawns) => ({
    keys: { KeyE: true },
    dialog: { open: false, toast: (t) => spawns.toasts.push(t) },
    dungeons: { active: false },
    // 生产方在这里真的调 `stats.toJSON()`（再战之后要把读数广播出去），stub 少一格就是假红
    stats: { addSouls() {}, toJSON: () => ({ souls: 20, level: 5 }) },
    storyJournal: { add: (e) => spawns.entries.push(e) },
    quests: { chapter: 1, stats: {} },
    enemyManager: spawns,
  });

  it('击败哪只 Boss，就能在它自己的信标处按 E 再战（五只各自成立）', () => {
    for (const b of MAP_BOSSES) {
      const spawns = { toasts: [], entries: [], enemies: [] };
      for (const name of ['spawnBoss', 'spawnMagicBoss', 'spawnSpaceBoss', 'spawnVoidBoss', 'spawnChaosBoss']) {
        spawns[name] = (opts) => { spawns.called = [name, opts]; };
      }
      const d = new BossRematchDirector(host(spawns));
      d.defeated.add(b.bossId);
      d.update(0.016, { x: b.x, z: b.z });
      expect(spawns.called, `${b.bossId} 在自己的信标处按 E 没有再战`).toBeTruthy();
      expect(spawns.called[1].bossId).toBe(b.bossId);
      expect(spawns.toasts.some((t) => t.includes('再战'))).toBe(true);
    }
  });

  it('没击败时不按 E 也不召唤；击败别人不算在自己头上', () => {
    const spawns = { toasts: [], entries: [], enemies: [] };
    const d = new BossRematchDirector(host(spawns));
    d.update(0.016, { x: MAP_BOSSES[0].x, z: MAP_BOSSES[0].z });
    expect(spawns.called).toBeUndefined();
    d.defeated.add(MAP_BOSSES[1].bossId);      // 只有第二只死了
    d.update(0.016, { x: MAP_BOSSES[0].x, z: MAP_BOSSES[0].z });
    expect(spawns.called).toBeUndefined();
  });

  it('五只 Boss 的信标各播报一次，不是一整个游戏只响一次', () => {
    const box = { toasts: [], entries: [] };
    const d = new BossApproachDirector(host(box));
    for (const b of MAP_BOSSES) d.update(99, { x: b.x, z: b.z });   // dt 顺带把 8 秒冷却走完
    expect(box.toasts).toHaveLength(MAP_BOSSES.length);
    expect(box.entries.map((e) => e.id)).toEqual(MAP_BOSSES.map((b) => `boss-beacon-${b.bossId}`));
    // 播报的是给玩家看的那段 Boss 介绍，不是地图上那两个字的简称
    for (const [i, e] of box.entries.entries()) {
      expect(e.text.length).toBeGreaterThan(MAP_BOSSES[i].label.length);
      expect(e.text).toContain(MAP_BOSSES[i].label.slice(0, 1));
    }
  });

  it('同一只 Boss 反复靠近只播报一次（seen 按 bossId 记账，不是按 undefined）', () => {
    const box = { toasts: [], entries: [] };
    const d = new BossApproachDirector(host(box));
    const b = MAP_BOSSES[0];
    d.update(99, { x: b.x, z: b.z });
    d.update(99, { x: b.x, z: b.z });
    d.update(99, { x: b.x, z: b.z });
    expect(box.toasts).toHaveLength(1);
    expect([...d.seen]).toEqual([b.bossId]);
  });

  /**
   * B62 的第三层后果：`bossId` 那一格缺失时，再战从不开火，于是那个计数器全仓唯一来源
   * （`boss-rematch-started`）从来没有派发过 —— 一条成就和一条支线**看起来存在、实际永远不可达**。
   *
   * 这里不写死事件名，也不自己造计数：计数只能从导演的真实派发里长出来，
   * 消费者由"判据源码里读 `rematches`"扫出来。于是三样东西同时被钉住：
   * 派发方与监听方的名字还得是同一个、计数器确实被喂、表上那些判据确实翻面。
   */
  it('再战真能计数：导演派发 → 成就监听 → 成就与支线各自翻面', () => {
    const consumers = (rows) => rows.filter((r) => String(r.check).includes('rematches'));
    const achRows = consumers(ALL_ACHIEVEMENTS_EXTRA);
    const sideRows = consumers(SIDE_QUESTS_ALL);
    // 先钉"这条链有消费者"：判据改读别的字段时这里先红，不让下面的断言空转成"0 个都通过"
    expect(achRows.map((r) => r.id)).toEqual(['rematch-3']);
    expect(sideRows.map((r) => r.id)).toEqual(['side-rematch']);

    const ach = new AchievementSystem({ toast() {} });
    attachAchievementExtras(ach);
    // 开机态：一条都没解锁 —— 否则"翻面"这个词没有意义
    for (const r of achRows) expect(r.check(ach.stats), `${r.id} 出厂就该为假`).toBe(false);
    for (const r of sideRows) expect(r.check({ achievements: ach }), `${r.id} 出厂就该为假`).toBe(false);

    const spawns = { toasts: [], entries: [], enemies: [] };
    for (const name of ['spawnBoss', 'spawnMagicBoss', 'spawnSpaceBoss', 'spawnVoidBoss', 'spawnChaosBoss']) {
      spawns[name] = () => {};
    }
    const h = host(spawns);
    const d = new BossRematchDirector(h);
    for (const b of MAP_BOSSES) {
      d.defeated.add(b.bossId);
      h.keys.KeyE = false;
      d.update(12, { x: -99999, z: -99999 });   // 远处把 12 秒冷却走完
      h.keys.KeyE = true;
      d.update(0.016, { x: b.x, z: b.z });      // 在自己的信标上按 E
    }

    expect(ach.stats.rematches, `导演开了 ${MAP_BOSSES.length} 次火，成就计数却是 ${ach.stats.rematches} —— 派发方与监听方的事件名不再是同一个`)
      .toBe(MAP_BOSSES.length);
    for (const r of achRows) expect(ach.unlocked.has(r.id), `${r.id} 该随真实计数解锁`).toBe(true);
    for (const r of sideRows) expect(r.check({ achievements: ach }), `${r.id} 该随真实计数达成`).toBe(true);
  });
});

describe('门控条件只有一处表达', () => {
  it('序列与判据读的是同一格：`interactGateCondition` 认出的门，正是表上写了 condition 的那些行', () => {
    const byRow = MAINLINE.filter((r) => r.condition).map((r) => r.id);
    const byHelper = MAINLINE.filter((r) => interactGateCondition(r)).map((r) => r.id);
    expect(byHelper).toEqual(byRow);
    expect(byRow).toHaveLength(4);
    // 旗标写法不许回来：任何一行都不靠 requireXxx 表达门控
    for (const r of OBJECTIVES) {
      expect(Object.keys(r).filter((k) => /^require[A-Z]/.test(k)), `${r.id} 上还有旗标写法`)
        .toEqual([]);
    }
  });
});
