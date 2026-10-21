/**
 * 副本遭遇表 —— 「这一座副本出哪几类敌人、一间房里出几只」只有一份答案（W-B10 切片3b）。
 *
 * ## 为什么现在要有这一张表
 *
 * 动手前的普查（`.tmp-20260930/wb10s1-census.mjs`，M2）量的是这件事：五座副本各跑 200 个种子，
 * 出怪**同分布** —— 全部只有 `soldier` / `golem` / `drone` 三类、各占约三分之一
 * （实测 34 / 34 / 33），每房 1~2 只、无怪房 0 间，血是 120..219 的一把与类型无关的骰子。
 *
 * 成因一直写在生成器里那一行：`type: ['soldier','golem','drone'][Math.floor(rnd() * 3)]`。
 * 于是"灰白遗城的亡魂、禁书图书馆的咒术、五维裂隙的机械"这三句话在实测里不存在 ——
 * 副本 def 里那一格 `themeType` 也声称过同一件事，而它写 5 读 0，切片3a 已经删掉（B74）。
 * **写了没人读的东西不会报错，只会让下一个人以为它在起作用**，所以这一片不是"再加一张表"，
 * 是把那句写死的三元式换成真的有人读的表。
 *
 * ## 这一张表不管什么
 *
 * - **每只多硬、叫什么、跑多快**：`content/enemies.js` 那一名册（切片2）。本表只说"出不出这一类"，
 *   所以每个 `type` 必须是名册里的一格（注册表按 `ref` 查），这里不重复任何数值；
 * - **房间几何**：`ProceduralDungeonGenerator` 与切片4 的房间模板库；
 * - **Boss**：守钥者由 `DungeonManager._spawnRoomEnemies` 按副本 id 召唤，不在池里 ——
 *   它有自己的名册与阶段脚本；
 * - **出在哪**：坐标由生成器在房间里摇，那是关卡几何而非内容。
 *
 * ## 两条口径写在这里，免得后来人改错方向
 *
 * - **权重是相对值**，不是概率：`(type, weight)` 的和不必是 100，摇法是把 `[0,1)` 摊到权重区间上。
 *   这样"加一类进去"不必重算全表，而普查基线（那种均匀三分）也能用等权表达；
 * - **每一池只有一个最重的那一类**。并列第一不是"两边一样重要"，是"这座副本打头的是谁"
 *   没有答案：切片3b 第一次跑分布读数时墓穴写成 `soldier 4 / wraith 4`，200 个种子的实测主类
 *   落到 wraith（4168 对 4121，一枚硬币），换个种子区间就会翻过去。注册表按这一条红。
 * - **主线那三座的编组仍是 1~2 只**，与切片3b 之前一字不差。理由是这一片改的是"**出谁**"，
 *   不是"**改难度曲线**"：五座都在主线/支线的推进路径上，同时动两个变量就无法把难度问题归因。
 *   两座可选副本（古树神龛、枢纽地下墓穴）不在主线必经之列，先在这里做出差别。
 */

/** 副本 id → 这一座的遭遇。键必须能在 `content/dungeons.js` 里查到（注册表 `keyRef`）。 */
export const DUNGEON_ENCOUNTERS = {
  // 灰白遗城（6×6，主线第三章）：石墙与亡魂 —— 战士打头、爬兽伏地、怨影游廊
  'ruin-crypt': {
    pool: [
      { type: 'soldier', weight: 5 },
      { type: 'crawler', weight: 3 },
      { type: 'wraith', weight: 2 },
    ],
    group: { min: 1, max: 2 },
  },
  // 禁书图书馆（5×6，主线第四章）：咒术与纸页 —— 咒师扇面齐射、怨影贴脸、刃舞者连段
  'forbidden-library': {
    pool: [
      { type: 'hexer', weight: 5 },
      { type: 'wraith', weight: 3 },
      { type: 'dancer', weight: 2 },
    ],
    group: { min: 1, max: 2 },
  },
  // 五维裂隙（5×5，主线第五章）：机械与哨戒 —— 无人机快、哨炮重、掠行兽追
  'five-dim-rift': {
    pool: [
      { type: 'drone', weight: 5 },
      { type: 'sentinel', weight: 3 },
      { type: 'stalker', weight: 2 },
    ],
    group: { min: 1, max: 2 },
  },
  // 古树神龛（4×5，可选）：兽群。房数最少所以允许一次三只
  'forest-shrine': {
    pool: [
      { type: 'crawler', weight: 5 },
      { type: 'stalker', weight: 3 },
      { type: 'soldier', weight: 2 },
      { type: 'golem', weight: 1 },
    ],
    group: { min: 1, max: 3 },
  },
  // 枢纽地下墓穴（5×5，可选）：最重的一池 —— 怨影打头，骑士与破阵重兵只在可选副本里出场
  'hub-catacombs': {
    pool: [
      { type: 'wraith', weight: 5 },
      { type: 'soldier', weight: 3 },
      { type: 'juggernaut', weight: 2 },
      { type: 'knight', weight: 1 },
    ],
    group: { min: 2, max: 3 },
  },
  // 幽暗林地：迷雾墓穴（5×5，可选）：幽暗怨影打头、树洞居所的掠行兽与哨卫
  'gloom-mist-crypt': {
    pool: [
      { type: 'gloom_wraith', weight: 6 },
      { type: 'gloom_stalker', weight: 3 },
      { type: 'gloom_sentinel', weight: 2 },
      // W-E3 切片3 新增的守夜人：它最沉（hp 215 / 架势 84），但**权重最低** ——
      // 池子的"最重"指的是**谁打头**，不是谁最耐打；守夜人要靠"撞见"而不是"常驻"。
      { type: 'gloom_warden', weight: 1 },
    ],
    group: { min: 2, max: 3 },
  },
  // 辉煌圣域：晨曦圣殿（5×5，可选）：辉煌爬兽打头、骑士与舞者在阳台巡逻
  'radiant-dawn-hall': {
    pool: [
      { type: 'radiant_crawler', weight: 6 },
      { type: 'radiant_knight', weight: 3 },
      { type: 'radiant_dancer', weight: 2 },
      // W-E3 切片3 新增的圣印者：远距标点的那一类，权重最低（少但每次都准）
      { type: 'radiant_brand', weight: 1 },
    ],
    group: { min: 2, max: 3 },
  },
  // 破碎时线：断时之匣（5×5，可选，W-B10 切片7 新增）：哨卫打头、怨影与爬兽在匣里绕
  // （主类**不能**是 `wraith` —— 枢纽地下墓穴已经用它打头了；两座副本打同一场仗，
  //   门禁 `tests/dungeon-encounters-table.test.js` ⑤ 会当场点出来）
  'void-broken-casket': {
    pool: [
      { type: 'sentinel', weight: 5 },
      { type: 'wraith', weight: 3 },
      { type: 'crawler', weight: 2 },
    ],
    group: { min: 2, max: 3 },
  },
  // 混沌边境：深渊之颚（6×5，可选，W-B10 切片7 新增）：掠行兽打头、骑士与哨卫守着最下面那张嘴
  'abyss-deep-maw': {
    pool: [
      { type: 'stalker', weight: 5 },
      { type: 'knight', weight: 3 },
      { type: 'sentinel', weight: 2 },
    ],
    group: { min: 2, max: 3 },
  },
};

/** 已经登记遭遇的副本（注册表与用例都问这一份；它是推导，不是第二份名单） */
export const DUNGEON_ENCOUNTER_IDS = Object.keys(DUNGEON_ENCOUNTERS);

/**
 * 取一座副本的遭遇格。认不出就当场抛（B71 口径，与 `dungeonDefOf` / `enemyRosterOf` 同一把尺子）。
 *
 * 这里**不留兜底池**：静默落到某一座的池子等于把"忘了登记"变成"那座副本悄悄换了敌人"，
 * 而那正是本片要杀掉的那类事故 —— 出错的症状从来不是崩溃，是没人注意到玩家打的已经不是设计的那一仗。
 */
export function dungeonEncounterOf(id) {
  const row = DUNGEON_ENCOUNTERS[id];
  if (!row) {
    throw new Error(`遭遇表里没有 "${id}" 这一座（已登记：${DUNGEON_ENCOUNTER_IDS.join(' / ')}）`);
  }
  return row;
}
