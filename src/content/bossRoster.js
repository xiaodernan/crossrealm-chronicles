/**
 * Boss 名册 —— `bossId` 的唯一真源（W-B1 切片2）。
 *
 * ## 修的是什么
 *
 * `bossId` 是全仓最散的一个身份：生成（`EnemyManager`）、章节门槛（同处）、
 * 场地脚本（`content/arenaScripts.js`）、成就、CG 画廊、图鉴、音频、过场、自动演示 ——
 * **20 多个文件里当字符串字面量用，而没有任何一处是"有哪些 id"的清单**。
 * 把 `'shadow-warden'` 打错一个字母，症状是"那一场 Boss 不铺场 / 不记成就 / 不播 CG / 不换 BGM"，
 * 而这四件事**一个都不会报错**：它们各自的取值都退回 `default` 或静默跳过。
 * 这与 B36（中文显示名判定）、B45（POI id 回退）、B37（分块循环）是同一类病 ——
 * **稳定身份靠人肉复制，而复制错了不报错**。
 *
 * ## 本表只回答三件事
 *
 * `有哪些 Boss` / `它叫什么` / `第几章开`。
 * "它长什么样、怎么打、掉什么"仍归各自的类与各自的表 —— 这里不是 Boss 的配置中心，
 * 是**身份清单**。界限要守住，否则它会慢慢长成第二个 `EnemyManager`。
 *
 * ## 为什么副本 Boss 不在这张表里
 *
 * 它的 id 是 `dungeon-<副本定义 id>` **动态拼**出来的（`DungeonManager`），
 * 数量随副本表增长、且同一只 Boss 会被不同副本复用。所以这里存的是**前缀**而不是记录；
 * `isKnownBossId()` 对带前缀的 id 一律放行，`chapterGateFor()` 也一样 ——
 * 副本 Boss 的门槛归副本本身，不归名册。
 */

/**
 * 世界 Boss 名册。`id` 是 kebab-case 且**全仓唯一**（由 `content/registry.js` 校验）；
 * `name` 与各 Boss 类里的默认名必须一致（`tests/content-registry.test.js` 会去源文件里核对，
 * 免得出现"名册说叫甲、打起来显示乙"）。
 *
 * `chapter` 是**开战所需的最低章节**：修前这两条门槛是 `EnemyManager.activateBoss` 里
 * 两句手写的 `if (boss.bossId === '...' && chapter < N) return;`，现在改成读这张表。
 */
export const BOSS_ROSTER = [
  // `name` 是**全名**，身份台口（过场标题 / 击败横幅 / 血条名牌）一律用它；`shortName` 是
  // 省地方的口子（目标标题 / 航点标签 / 日志 / 营火选择）用的短名。**两个都只在这里登记一次**
  // —— 修前这些显示名被抄成字面量散在 objectives / bossDialogue / StoryJournal / QuestAssistant
  // 里，抄着抄着就分叉（同一只奇点领主，过场叫全名、横幅却叫短名）。没登记 shortName 的 Boss，
  // 省地方的口子退回全名。门禁 `tests/boss-name-consistency.test.js` 横向钉住这些出口。
  //
  // `nameKey` / `shortNameKey` 是**文案键**（W-D2 切片16j）：显示侧在播出那一刻 `t()` 展开。
  // 中文实值仍登记在同一行的 `name` / `shortName` 上 —— 那两个是"它叫什么"的名册，
  // 键是"这句话住在哪一格"的住址，两者由门禁横向钉住（改一处不改正处当场红）。
  // 没登记 `shortName` 的 Boss，短名就是全名 —— 那时 `shortNameKey` **指回 `nameKey`**，
  // 不另开一格（同一句话两个键是上限，开了就成"一个意思写三遍"的命名族失控）。
  { id: 'shadow-warden', name: '影界守护者', nameKey: 'boss_name_shadow', shortNameKey: 'boss_name_shadow', chapter: 1 },
  { id: 'archmagus', name: '大奥术师·萨尔林', nameKey: 'boss_name_mage', shortName: '大奥术师', shortNameKey: 'boss_short_mage', chapter: 1 },
  { id: 'singularity-herald', name: '引力化身·奇点领主', nameKey: 'boss_name_singularity', shortName: '奇点领主', shortNameKey: 'boss_short_singularity', chapter: 1 },
  { id: 'void-chronarch', name: '时线执政官', nameKey: 'boss_name_void', shortNameKey: 'boss_name_void', chapter: 4 },
  { id: 'chaos-overlord', name: '混沌裂隙领主', nameKey: 'boss_name_chaos', shortName: '裂隙领主', shortNameKey: 'boss_short_chaos', chapter: 5 },
];

/** 副本 Boss 的 id 前缀：实际 id 是 `dungeon-<副本定义 id>` */
export const DUNGEON_BOSS_PREFIX = 'dungeon-';

export const BOSS_IDS = BOSS_ROSTER.map((b) => b.id);

/** 名册里那条记录；未登记返回 `null`（副本 Boss 与将来工具生成的野生 Boss 会走到这里） */
export function bossById(id) {
  return BOSS_ROSTER.find((b) => b.id === id) ?? null;
}

/**
 * 这个 `bossId` 认得吗。
 *
 * 副本 Boss（`dungeon-` 前缀且后面有内容）一律认；空后缀（`'dungeon-'`）不认 ——
 * 那是拼接时 `def.id` 为空才会出现的东西，属于接线错误。
 */
/**
 * 是不是副本 Boss（`dungeon-` 前缀且后面有内容）。
 *
 * 单独给一个具名谓词，是因为全仓有**四处**要问这个问题（音频选曲、故事日志、上下文教学、
 * 阶段演出），而修前每一处都自己写 `bossId?.startsWith('dungeon-')` ——
 * 前缀一共被抄了五份。**谓词在这里，前缀常量也在这里**，抄错的可能就没了。
 */
/**
 * Boss 显示名的**文案键**（W-D2 切片16r）。
 *
 * 名册的 `name` 仍然是"它叫什么"（中文，登记处）；`nameKey` 是"这句话住在哪一格"。
 * 各 Boss 类的默认名、事件负载里的 `name` 都从这里取键再 `t()` 展开 ——
 * 改前那些地方各自抄了一句中文（六个 Boss 类各一份），英文界面下它们永远是中文。
 *
 * 副本 Boss 的 id 是 `dungeon-<副本定义 id>` 动态拼的，不在名册里；它们共用
 * "迷宫守钥者"那一格（副本真正用的名字由 `BOSS_LORE` 给出，类里的只是兜底）。
 */
export function bossNameKeyOf(bossId) {
  const b = bossById(bossId);
  if (b?.nameKey) return b.nameKey;
  if (typeof bossId === 'string' && bossId.startsWith(DUNGEON_BOSS_PREFIX)) return 'boss_name_dungeon_warden';
  return 'boss_name_unknown';
}

export function isDungeonBossId(id) {
  return typeof id === 'string'
    && id.startsWith(DUNGEON_BOSS_PREFIX)
    && id.length > DUNGEON_BOSS_PREFIX.length;
}

export function isKnownBossId(id) {
  if (typeof id !== 'string' || id === '') return false;
  if (BOSS_IDS.includes(id)) return true;
  return isDungeonBossId(id);
}

/**
 * 开战所需的最低章节。未登记的 id（副本 Boss）返回 1 —— 一律放行。
 *
 * 注意这与 `arenaScriptFor()` 的兜底**不是一回事**：场地脚本有 `default` 档
 * （"没登记也得铺场"），章节门槛没有兜底档（"没登记就当你随时能打"）。
 * 两者方向相反是因为代价不同：少铺一次场玩家只是少挨一招，而多拦一次会让玩家
 * 永远打不开那场 Boss 战。
 */
export function chapterGateFor(id) {
  return bossById(id)?.chapter ?? 1;
}
