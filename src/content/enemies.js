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
export const ENEMY_ROSTER = {
  /** 训练木人：不可攻击、不刷新的摆设，`hp/posture` 写成 99999 是为了让玩家试刀时它不倒 */
  dummy: { name: '训练木人', hp: 99999, posture: 99999, canAttack: false, respawn: false, color: 0x6a5040 },
  soldier: { name: '影之战士', hp: 160, posture: 58, damage: 15, color: 0x3a3038 },
  golem: { name: '魔法构装体', hp: 230, posture: 82, damage: 17, speed: 3.8, color: 0x4a3868 },
  drone: { name: '轨道无人机', hp: 120, posture: 48, damage: 11, speed: 7.5, aggroRange: 24, color: 0x3a5068 },
  elite: { name: '精英·虚空骑士', hp: 350, posture: 90, damage: 22, speed: 5.5, aggroRange: 25, color: 0x224466, respawnTime: 15 },
  wraith: { name: '时线怨影', hp: 110, posture: 44, damage: 13, speed: 6.2, aggroRange: 22, color: 0x5566aa },
  stalker: { name: '混沌掠行兽', hp: 140, posture: 62, damage: 14, speed: 6.8, color: 0x6a3038 },
  sentinel: { name: '边境哨炮', hp: 180, posture: 70, damage: 16, speed: 3.2, aggroRange: 26, color: 0x3a4a68 },
  crawler: { name: '虚空爬兽', hp: 150, posture: 58, damage: 15, speed: 5.6, aggroRange: 20, color: 0x5a7a3a },
  knight: { name: '深渊骑士', hp: 260, posture: 88, damage: 20, speed: 4.0, aggroRange: 22, color: 0x2a3550 },
  dancer: { name: '刃舞者', hp: 135, posture: 52, damage: 13, speed: 6.4, aggroRange: 22, color: 0x7a2a5a },
  juggernaut: { name: '破阵重兵', hp: 300, posture: 96, damage: 22, speed: 3.6, aggroRange: 22, color: 0x4b4a55 },
  hexer: { name: '位面咒师', hp: 130, posture: 50, damage: 15, speed: 4.6, aggroRange: 24, color: 0x6a5a9a },
};

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
