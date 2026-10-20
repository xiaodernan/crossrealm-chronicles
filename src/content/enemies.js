/**
 * 敌人名册 —— 「这一类敌人叫什么、多硬、跑多快」只有一份答案（W-B10 切片2）。
 *
 * ## 为什么现在要有这一张表
 *
 * 动手前的普查（`.tmp-20260930/wb10s1-census.mjs`）量出同一个 `type` 在两处各写一遍身份：
 *
 * | 类型 | 区域出生（`EnemyManager.spawnDefaults`） | 副本出生（`DungeonManager._spawnRoomEnemies`） |
 * | --- | --- | --- |
 * | `soldier` | 影之战士，hp 160、posture 58、damage 15 | 遗城战士，hp 摇 120..219、posture 70、damage 16 |
 * | `golem` | 魔法构装体，hp 230、posture 82、damage 17、speed 3.8 | 构装守卫，同上那套固定值，speed 落到默认 |
 * | `drone` | 轨道无人机，hp 120、posture 48、damage 11、speed 7.5 | 裂隙无人机，同上 |
 *
 * 体型、招式、抗性、减伤四张表都按 `type` 走（`content/tuning.js`），唯独**名字与基础数值**
 * 是两处手抄。症状不是报错而是玩家看到的东西对不上：同一只构造体在图书馆里 230 血、
 * 在迷宫里 120 血且换了个名字；副本那侧的 `posture 70 / damage 16` 与类型无关，
 * 于是最快的无人机和最重的构造体砍上去一个手感。
 *
 * 更要紧的是副本那条 `name:` 是一串三元式：`golem` 与 `drone` 各点一个名，**其余全兜底成
 * 「遗城战士」**。名册里现在 12 类原生敌人，其中 9 类一旦进副本就会顶着战士的名字。
 *
 * ## 这一张表不管什么
 *
 * - **出生坐标**：那是关卡数据（W-B11 关卡编辑器的对象），留在读者一侧；
 * - **体型 / 招式 / 抗性 / 减伤**：`content/tuning.js` 的四张表，本表按同一批 id 对齐（注册表门禁）；
 * - **Boss**：走 `content/bossRoster.js`，它们有自己的阶段脚本与台词，不混进来；
 * - **副本里出哪几类、一次几只**：那是遭遇表（W-B10 切片3），不在本表。
 *
 * `canAttack` / `respawn` / `respawnTime` 是**这一类的默认行为**而非坐标，所以进表；
 * 副本侧仍会在申领之后覆盖 `respawn: false`（房间里的怪不该在玩家回头时刷新）。
 */

/** id → 身份。id 就是 `spawn({ type })` 的那个字符串，也是四张调参表用的同一批键。 */
/**
 * 敌人名册 —— `name` 存的是**文案键**（W-D2 切片16s），不是文案本身。
 *
 * 改前这一列是 22 句中文写死在这儿，玩家在锁定提示、击败横幅、字幕里看到的
 * "幽暗怨影"永远是中文 —— 切到英文也不变。键名 `enemy_name_<type>`，
 * 展开在**出生那一刻**（`EnemyManager.spawnAt` 一处）：世界里存的是显示名，
 * 于是"它叫什么"在事件负载里仍然是那句人看的话（与营火名同一套办法）。
 */
export const ENEMY_ROSTER = {
  /** 训练木人：不可攻击、不刷新的摆设，`hp/posture` 写成 99999 是为了让玩家试刀时它不倒 */
  dummy: { name: 'enemy_name_dummy', hp: 99999, posture: 99999, canAttack: false, respawn: false, color: 0x6a5040 },
  soldier: { name: 'enemy_name_soldier', hp: 160, posture: 58, damage: 15, color: 0x3a3038 },
  golem: { name: 'enemy_name_golem', hp: 230, posture: 82, damage: 17, speed: 3.8, color: 0x4a3868 },
  drone: { name: 'enemy_name_drone', hp: 120, posture: 48, damage: 11, speed: 7.5, aggroRange: 24, color: 0x3a5068 },
  elite: { name: 'enemy_name_elite', hp: 350, posture: 90, damage: 22, speed: 5.5, aggroRange: 25, color: 0x224466, respawnTime: 15 },
  wraith: { name: 'enemy_name_wraith', hp: 110, posture: 44, damage: 13, speed: 6.2, aggroRange: 22, color: 0x5566aa },
  stalker: { name: 'enemy_name_stalker', hp: 140, posture: 62, damage: 14, speed: 6.8, color: 0x6a3038 },
  sentinel: { name: 'enemy_name_sentinel', hp: 180, posture: 70, damage: 16, speed: 3.2, aggroRange: 26, color: 0x3a4a68 },
  crawler: { name: 'enemy_name_crawler', hp: 150, posture: 58, damage: 15, speed: 5.6, aggroRange: 20, color: 0x5a7a3a },
  knight: { name: 'enemy_name_knight', hp: 260, posture: 88, damage: 20, speed: 4.0, aggroRange: 22, color: 0x2a3550 },
  dancer: { name: 'enemy_name_dancer', hp: 135, posture: 52, damage: 13, speed: 6.4, aggroRange: 22, color: 0x7a2a5a },
  juggernaut: { name: 'enemy_name_juggernaut', hp: 300, posture: 96, damage: 22, speed: 3.6, aggroRange: 22, color: 0x4b4a55 },
  hexer: { name: 'enemy_name_hexer', hp: 130, posture: 50, damage: 15, speed: 4.6, aggroRange: 24, color: 0x6a5a9a },
  /** W-B9 切片1 新增：幽暗林地 —— 迷雾缠绕的古老森林 */
  gloom_wraith: { name: 'enemy_name_gloom_wraith', hp: 120, posture: 48, damage: 14, speed: 5.8, aggroRange: 24, color: 0x4a4a6a },
  gloom_stalker: { name: 'enemy_name_gloom_stalker', hp: 150, posture: 66, damage: 16, speed: 7.0, aggroRange: 28, color: 0x4a4a7a },
  gloom_sentinel: { name: 'enemy_name_gloom_sentinel', hp: 190, posture: 76, damage: 18, speed: 3.5, aggroRange: 30, color: 0x3a3a5a },
  /**
   * W-E3 切片3：幽暗守夜人 —— 迷雾里的重装守夜人。
   * 血厚、架势高、出手慢（4.2 速），与同区的怨影（快、轻）、掠行兽（贴地乱爪）、
   * 哨卫（浮空远程）都不重叠：它是**站在那里等你走过来**的那一种。
   */
  gloom_warden: { name: 'enemy_name_gloom_warden', hp: 215, posture: 84, damage: 19, speed: 4.2, aggroRange: 26, color: 0x3a3a6a },
  /** W-B9 切片1 新增：辉煌圣域 — 金色沙海中的光辉神殿 */
  radiant_crawler: { name: 'enemy_name_radiant_crawler', hp: 160, posture: 62, damage: 17, speed: 6.0, aggroRange: 24, color: 0xffd700 },
  radiant_knight: { name: 'enemy_name_radiant_knight', hp: 270, posture: 92, damage: 22, speed: 4.2, aggroRange: 24, color: 0xffcc00 },
  radiant_dancer: { name: 'enemy_name_radiant_dancer', hp: 145, posture: 56, damage: 14, speed: 6.8, aggroRange: 24, color: 0xffaa00 },
  /**
   * W-E3 切片3：辉煌圣印者 —— 远距标点的施法者。
   * 血少、身轻、出手远：它不贴上来，而是站在 6~11 米外把一块地**标成灼场**。
   * 与同区的爬兽（贴地乱爪）、骑士（重装近战）、舞者（连段旋舞）都不重叠。
   */
  radiant_brand: { name: 'enemy_name_radiant_brand', hp: 155, posture: 60, damage: 16, speed: 4.6, aggroRange: 26, color: 0xffe066 },
};

/**
 * 击杀魂表（W-E1 切片5）：打死这一档敌人给多少魂。
 *
 * 键是 **`kind`**（`boss` / `elite` / `golem` / `normal`）而不是敌人 type ——
 * 掉落层（`LootSystem.spawnKill` 里的 `dropChance(kind)`）与击杀层本来就共用这一套档位名，
 * 魂表按它建，两张表才说得上"对齐"。改前这四个数写死在 `EnemyManager.update` 的一条三元式里
 * （`boss ? 500 : golem ? 80 : elite ? 120 : 25`）：调经济得改行为代码，而且"这一档给多少魂"
 * 与"这一档掉不掉装备"分成两处各判一遍 —— 那条注释自己承认了这个风险。
 *
 * 区域强度不在这张表里：基础值乘 `enemyGrowth.js` 的 `souls` 列（与 hp / damage 同一条分工），
 * 难度档乘 `difficulty.js` 的 `souls`（在 `PlayerStats.addSouls` 那一口）。
 */
export const KILL_SOULS = Object.freeze({
  boss: 500,
  elite: 120,
  golem: 80,
  normal: 25,
});

/** 击杀魂表认得的档位名（注册表拿它对齐 `GEAR_DROP.byKind`） */
export const KILL_SOUL_KINDS = Object.freeze(Object.keys(KILL_SOULS));

/** 名册里登记过的敌人 id（注册表的 `keyRef` 与遭遇表的 `ref` 都问这一份） */
export const ENEMY_ROSTER_IDS = Object.keys(ENEMY_ROSTER);

/**
 * 取一格的身份。认不出就当场抛 —— 与 `sfx:play(id)` 那条同一口径（B71）：
 * "查不到就静默落到某个默认名"的症状是玩家看到一只名字与体型都对不上的敌人，
 * 而没有任何一处会红。
 */
export function enemyRosterOf(type) {
  const row = ENEMY_ROSTER[type];
  if (!row) throw new Error(`敌人名册里没有 "${type}" 这一类（可用：${ENEMY_ROSTER_IDS.join(' / ')}）`);
  return row;
}
