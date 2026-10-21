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
 *
 * ### `stage` —— 这一座的敌人按哪一档成长曲线出（W-E1 切片3）
 *
 * 为什么**不按入口坐标反推区域**：`five-dim-rift` 的入口 (175, 95) 离幽暗林地中心
 * (180, 100) 只有 7 米 —— 按 `zoneIdAt` 取最近区域，第三座试炼会拿到全游戏最晚的档位。
 * 坐标在这里不是进度信号，**设计意图**才是；所以每座显式写一档，注册表必填 + 域内校验。
 * 口径：三界试炼 0/1/2（主线进度），可选副本贴着它门口那个区的档位
 * （神龛 1 / 墓穴 0 在枢纽隔壁 / 迷雾墓穴 5 / 晨曦圣殿 6）。
 */
export const DUNGEON_DEFS = [
  {
    id: 'ruin-crypt',
    zone: 'fantasy',
    name: 'dungeon_ruin_crypt_name',
    trial: true,
    stage: 0,
    mapLabel: 'dungeon_ruin_crypt_map_label',
    theme: 0x4a5048,
    accent: 0xc9a962,
    gridW: 6,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 5000 },
    entrance: { x: -190, z: 25 },
    exterior: { x: -190, z: 25, label: 'dungeon_ruin_crypt_exterior_label' },
  },
  {
    id: 'forbidden-library',
    zone: 'magic',
    name: 'wp_label_forbidden_library',
    trial: true,
    stage: 1,
    mapLabel: 'dungeon_forbidden_library_map_label',
    theme: 0x2a2040,
    accent: 0xaa66ff,
    gridW: 5,
    gridH: 6,
    origin: { x: 5000, y: 120, z: 6500 },
    entrance: { x: -35, z: -200 },
    exterior: { x: -35, z: -200, label: 'dungeon_forbidden_library_exterior_label' },
  },
  {
    id: 'five-dim-rift',
    zone: 'space',
    name: 'wp_label_five_dim_rift',
    trial: true,
    stage: 2,
    mapLabel: 'dungeon_five_dim_rift_map_label',
    theme: 0x0a1830,
    accent: 0x66ccff,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 8000 },
    entrance: { x: 175, z: 95 },
    exterior: { x: 175, z: 95, label: 'dungeon_five_dim_rift_exterior_label' },
  },
  {
    id: 'forest-shrine',
    zone: 'fantasy',
    name: 'dungeon_forest_shrine_name',
    trial: false,
    stage: 1,
    mapLabel: 'dungeon_forest_shrine_map_label',
    theme: 0x2a3828,
    accent: 0x88cc66,
    gridW: 4,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 9500 },
    entrance: { x: -230, z: -15 },
    exterior: { x: -230, z: -15, label: 'dungeon_forest_shrine_exterior_label' },
  },
  {
    id: 'hub-catacombs',
    zone: 'hub',
    name: 'dungeon_hub_catacombs_name',
    trial: false,
    stage: 0,
    mapLabel: 'dungeon_hub_catacombs_map_label',
    theme: 0x3a3530,
    accent: 0xffaa44,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 80, z: 11000 },
    entrance: { x: 28, z: 72 },
    exterior: { x: 28, z: 72, label: 'dungeon_hub_catacombs_exterior_label' },
  },
  {
    id: 'gloom-mist-crypt',
    zone: 'gloom',
    name: 'dungeon_gloom_mist_crypt_name',
    trial: false,
    stage: 5,
    mapLabel: 'dungeon_gloom_mist_crypt_map_label',
    theme: 0x2a2a3a,
    accent: 0x6a6a8a,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 12500 },
    entrance: { x: 200, z: 170 },
    exterior: { x: 200, z: 170, label: 'dungeon_gloom_mist_crypt_exterior_label' },
  },
  {
    id: 'radiant-dawn-hall',
    zone: 'radiant',
    name: 'dungeon_radiant_dawn_hall_name',
    trial: false,
    stage: 6,
    mapLabel: 'dungeon_radiant_dawn_hall_map_label',
    theme: 0xfff8d0,
    accent: 0xffcc00,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 14000 },
    entrance: { x: -180, z: -95 },
    exterior: { x: -180, z: -95, label: 'dungeon_radiant_dawn_hall_exterior_label' },
  },
  {
    // 破碎时线（W-B10 切片7）：这座区原先**一座副本都没有** —— 玩家在时线里只能打原生的散兵，
    // 没有一处"钻进去打一整场"的地方。断时之匣是时线尽头的匣子：里面的钟还在走。
    id: 'void-broken-casket',
    zone: 'void',
    name: 'dungeon_void_broken_casket_name',
    trial: false,
    stage: 3,
    mapLabel: 'dungeon_void_broken_casket_map_label',
    theme: 0x141c28,
    accent: 0x4ad0b0,
    gridW: 5,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 15500 },
    entrance: { x: -30, z: 165 },
    exterior: { x: -30, z: 165, label: 'dungeon_void_broken_casket_exterior_label' },
  },
  {
    // 混沌边境（W-B10 切片7）：同上 —— 这座区原先也没有副本。深渊之颚是边境裂口的最下面那张嘴。
    id: 'abyss-deep-maw',
    zone: 'abyss',
    name: 'dungeon_abyss_deep_maw_name',
    trial: false,
    stage: 4,
    mapLabel: 'dungeon_abyss_deep_maw_map_label',
    theme: 0x1a0a18,
    accent: 0xd05a7a,
    gridW: 6,
    gridH: 5,
    origin: { x: 5000, y: 120, z: 17000 },
    entrance: { x: -140, z: 175 },
    exterior: { x: -140, z: 175, label: 'dungeon_abyss_deep_maw_exterior_label' },
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
