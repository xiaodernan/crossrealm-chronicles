/**
 * 副本（地下城）定义 —— 五座迷宫各自的身份与关卡参数（W-B10 切片3a）。
 *
 * ## 为什么现在把它搬进 `content/`
 *
 * 这份表原本写在 `world/DungeonManager.js` 的第 7 行，是那个模块的私有 const。位置带来两个问题：
 *
 * 1. **别的表没法认领副本 id**。切片3b 要给每座副本配一张遭遇表，而注册表的跨表引用
 *    （`keyRef: { of: 'dungeons' }`）只能指向 `content/` 里的表 —— 指向 `world/` 就是让数据层
 *    去依赖渲染层，`tests/content-boundary.test.js` 那条边界门禁第一个不答应。
 * 2. **没有 schema**。字段写错一个字母（`girdW`）不会红，只会走到读取处的 `?? 5` 兜底，
 *    症状是"这座副本比设计的小一圈"。进注册表后每一格都要过自己的形状。
 *
 * ## 顺手删掉的那一格
 *
 * `themeType` 普查（`.tmp-20260930/wb10s1-census.mjs` M1）量出来是**写 5 处、读 0 处**：
 * 五座副本各声称自己的"母题敌人"是 soldier / golem / drone / soldier / elite，
 * 而全仓没有任何一处读它 —— 迷宫里实际出什么怪由 `MazeLayout` 里写死的
 * `['soldier','golem','drone']` 三元式决定，五座副本完全相同。
 * 所以这一格删掉了：**"这座副本出什么"从此由遭遇表（切片3b）说话，不由一个没人读的字段许愿。**
 *
 * ## 这一张表不管什么
 *
 * - **出哪几类敌人、一次几只**：`content/dungeonEncounters.js`（切片3b）；
 * - **敌人的名字与数值**：`content/enemies.js` 那一名册；
 * - **房间几何**：`world/MazeLayout.js`（切片4 要把它换成模板装配）；
 * - **守钥者与台词**：`content/bossRoster.js` 的 `dungeon-` 前缀行 + `game/LoreFragments.js`。
 */

/**
 * 五座副本。顺序就是载入顺序（`DungeonManager.build()` 按它建 `dungeons` Map，UI 列表也按它排）。
 *
 * ### `trial` —— 「这座算不算三界试炼的那一关」只在这里说
 *
 * 切片3c 之前这句话写在**四个地方**：`CONDITIONS.checkAllDungeons` 数三枚字面量、
 * `ExplorationMap` 的开局点亮与 `fromJSON` 兜底各抄一遍同一串、`QuestAssistant` 的清单再抄一遍，
 * 而 `QuestSystem` 指路时用的是第五条算式（`MAINLINE` 里 `type:'dungeon'` 的行）。
 * 五份没有一条纽带：名册从 5 座长到 7 座的那天，只有 `dungeons.js` 跟着动了。
 * 现在它是行上的一格，`TRIAL_DUNGEON_IDS` 由它推导，五个读者都问这一份。
 *
 * **每行都必须显式写**（`required` 由注册表保证）：省略即"不是试炼"的那种默认最贵 ——
 * 新加一座副本的人如果没想过这件事，正好是这道题要逼出来的那一次思考。
 *
 * ### `mapLabel` —— 世界地图上的那几个字
 *
 * `ui/WorldMapPanel.js` 以前自己养一张五行表（`{ x: -190, z: 25, t: '遗城', id: 'ruin-crypt' }`）：
 * 坐标逐格等于 `entrance`、简称是全名的手写缩写、而且**只有五行** —— 名册里多出来的两座
 * 在地图上没有点（普查 `.tmp-20261002/wb10s3c-census.mjs`：表 7 行 / 面板 5 行，差集正是新增的两座）。
 */
export const DUNGEON_DEFS = [
  {
    id: 'ruin-crypt',
    name: '灰白遗城',
    trial: true,
    mapLabel: '遗城',
    theme: 0x4a5048,
    accent: 0xc9a962,
    gridW: 6,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 5000 },
    entrance: { x: -190, z: 25 },
    exterior: { x: -190, z: 25, label: '灰白遗城入口' },
  },
  {
    id: 'forbidden-library',
    name: '禁书图书馆',
    trial: true,
    mapLabel: '图书馆',
    theme: 0x2a2040,
    accent: 0xaa66ff,
    gridW: 5,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 6500 },
    entrance: { x: -35, z: -200 },
    exterior: { x: -35, z: -200, label: '图书馆侧门' },
  },
  {
    id: 'five-dim-rift',
    name: '五维裂隙',
    trial: true,
    mapLabel: '裂隙',
    theme: 0x0a1830,
    accent: 0x66ccff,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 8000 },
    entrance: { x: 175, z: 95 },
    exterior: { x: 175, z: 95, label: '裂隙观测站' },
  },
  {
    id: 'forest-shrine',
    name: '古树神龛',
    trial: false,
    mapLabel: '神龛',
    theme: 0x2a3828,
    accent: 0x88cc66,
    gridW: 4,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 9500 },
    entrance: { x: -230, z: -15 },
    exterior: { x: -230, z: -15, label: '神龛石门' },
  },
  {
    id: 'hub-catacombs',
    name: '枢纽地下墓穴',
    trial: false,
    mapLabel: '墓穴',
    theme: 0x3a3530,
    accent: 0xffaa44,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 80, z: 11000 },
    entrance: { x: 28, z: 72 },
    exterior: { x: 28, z: 72, label: '墓穴阶梯' },
  },
  {
    id: 'gloom-mist-crypt',
    name: '幽暗迷雾墓穴',
    trial: false,
    mapLabel: '迷雾墓穴',
    theme: 0x2a2a3a,
    accent: 0x6a6a8a,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 12500 },
    entrance: { x: 200, z: 170 },
    exterior: { x: 200, z: 170, label: '迷雾墓穴入口' },
  },
  {
    id: 'radiant-dawn-hall',
    name: '晨曦圣殿',
    trial: false,
    mapLabel: '晨曦圣殿',
    theme: 0xfff8d0,
    accent: 0xffcc00,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 14000 },
    entrance: { x: -180, z: -95 },
    exterior: { x: -180, z: -95, label: '晨曦圣殿大门' },
  },
];

/** 副本 id 的名册（注册表的 `keyRef` 与各处 `ref` 都问这一份；由表推导，不是第二份手抄清单） */
export const DUNGEON_IDS = DUNGEON_DEFS.map((d) => d.id);

/**
 * 三界试炼的那几座 —— 由行上的 `trial` 推导（顺序跟着名册）。
 *
 * 读者有五个：`CONDITIONS.checkAllDungeons`（真门）、`QuestSystem` 的指路、
 * `ExplorationMap` 的开局点亮与读档兜底、`QuestAssistant` 的清单。
 * 它们是同一句话的五个用法，所以**只允许有一个来源**。
 */
export const TRIAL_DUNGEON_IDS = DUNGEON_DEFS.filter((d) => d.trial).map((d) => d.id);

/**
 * 按 id 取一座副本。认不出就当场抛 —— 与 `enemyRosterOf` / `sfx:play(id)` 同一口径：
 * "查不到就兜底成第一座"的症状是玩家进了 A 副本却看到 B 副本的规模与配色，而无处可红。
 */
export function dungeonDefOf(id) {
  const def = DUNGEON_DEFS.find((d) => d.id === id);
  if (!def) throw new Error(`副本表里没有 "${id}" 这一座（可用：${DUNGEON_IDS.join(' / ')}）`);
  return def;
}
