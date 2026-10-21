/**
 * 野外原生敌人的出生点（W-B7 切片7 从 `combat/EnemyManager.js` 搬进内容层）。
 *
 * ## 为什么搬
 *
 * 这张表是**纯数据**（哪一类敌人、站在哪个坐标）—— 按项目自己的规矩
 * 「内容（数值、文案、布局）不写在逻辑文件里」，它本就该在 `content/`。
 * 而它待在 `EnemyManager` 里的代价不只是"洁癖"：
 *
 * - **内容层够不着它** —— 于是"某一位面到底有没有敌人可杀"这件事**查不到**。
 *   W-B12 那条「每位面只有两条可绑的持久化事实，要再加严得先有新事实」的尾巴，
 *   卡的就是这个：第三样位面事实（**该位面的清剿数**）要有一个"那位面确实有敌人"
 *   的判据，而那张判据得能问这张表。
 * - 改一处出生点要翻**逻辑文件** —— 坐标是内容，混在行为代码里就没人知道它是内容。
 *
 * ## 表里没有什么
 *
 * - **没有区位那一格** —— 区位是**按坐标反推**的（`zoneIdAt`，按位置反推区域的唯一一处）。
 *   在这里再抄一格区位就是**第二份真相**：坐标改了而区位没改，那一格就在说谎。
 *   "每一位面都有敌人"那条判据因此是**从坐标推**的，不是从表上抄的。
 * - **没有 Boss** —— Boss 的出生点与它的**竞技场**（`buildBossArena`）是一对东西，
 *   拆开搬就拆散了那一对。它们的坐标仍在 `EnemyManager`（那是另一片）。
 *
 * ## 坐标是怎么挑的（这些理由跟着坐标一起搬过来了）
 *
 * - 每类避开五座 Boss 场（半径 22）与各自的营火。
 * - **B70 一族**："站得下人"与"会警觉"是两件事 —— 玩家贴到 1.7 米、四个正方向全试一遍，
 *   仍 `sense.alerted` 恒假的那一格，睡过去（`[-255, 175]` → `[-250, 120]`；
 *   `[275, 10]` → `[240, -40]`）。`tests/enemy-roster.test.js` 的"四向至少一向会警觉"
 *   就是为这一类立的门禁。
 * - 幽暗林地那三处（`gloom_wraith` 的 `(240,120)`）曾一度被挪到 `(280,180)`，
 *   那一格正撞内部空间/神殿碰撞体堆（四面皆闷），已改回；东侧的 `(250,60)` / `(280,40)`
 *   同样压在 `box hx6 hz3` 与大边界箱上，**别选**。
 * - 各类之间铺开（挤在一起的敌人会互相推着抖）。
 *
 * ## 顺序也是契约
 *
 * 出生点的**先后**决定 `spawnAt` 的调用序，而那决定敌人的列表序（感知与分离都按它走）。
 * 所以搬的时候**逐条照抄**，门禁拿一份**冻结的名单**（类型与坐标逐条相等）钉住它。
 */

/**
 * @typedef {object} EnemySpawn
 * @property {string} type 敌人类型（`content/enemies.js` 的 `ENEMY_ROSTER` 之一）
 * @property {number} x 世界坐标 x
 * @property {number} z 世界坐标 z
 */

/** @type {ReadonlyArray<EnemySpawn>} */
export const ENEMY_SPAWNS = Object.freeze([
  // ── 枢纽：训练木人（试刀的地方）──
  { type: 'dummy', x: 15, z: 45 },

  // ── 灰白森林：影之战士 ──
  { type: 'soldier', x: -215, z: -20 },
  { type: 'soldier', x: -185, z: 35 },
  { type: 'soldier', x: -230, z: 15 },
  { type: 'soldier', x: -200, z: -45 },
  { type: 'soldier', x: -170, z: -30 },

  // ── 霍格沃兹遗境：魔法构装体 ──
  { type: 'golem', x: 10, z: -195 },
  { type: 'golem', x: -25, z: -210 },
  { type: 'golem', x: 30, z: -170 },
  { type: 'golem', x: -10, z: -230 },

  // ── 米勒荒原：机械无人机 ──
  { type: 'drone', x: 220, z: 60 },
  { type: 'drone', x: 185, z: 110 },
  { type: 'drone', x: 240, z: 100 },
  { type: 'drone', x: 160, z: 70 },
  { type: 'drone', x: 210, z: 140 },

  // ── 枢纽：一位精英 ──
  { type: 'elite', x: -50, z: -60 },

  // ── 破碎时线与混沌边境此前没有原生敌人 —— 路过只有风景。──
  // 出生点避开 Boss 场（时线执政官 (0,235) / 混沌领主 (-200,285)，半径 22）与各自的营火。
  { type: 'wraith', x: 28, z: 212 },
  { type: 'wraith', x: -32, z: 242 },
  { type: 'wraith', x: 12, z: 268 },
  { type: 'wraith', x: -48, z: 205 },

  // ── 混沌边境：掠行兽与哨卫 ──
  { type: 'stalker', x: -222, z: 212 },
  { type: 'stalker', x: -192, z: 248 },
  { type: 'stalker', x: -238, z: 252 },
  { type: 'sentinel', x: -172, z: 238 },
  { type: 'sentinel', x: -245, z: 280 },
  { type: 'sentinel', x: -160, z: 205 },

  // ── 破碎时线：裂隙爬兽（切片3 补的，三类按"这位面缺什么样的威胁"落位）──
  { type: 'crawler', x: 70, z: 250 },
  { type: 'crawler', x: -85, z: 258 },
  { type: 'crawler', x: 40, z: 168 },

  // ── 混沌边境：重装骑士（**B70 的第一处实例**：坐标睡过去了，换到醒得过来的那一格）──
  { type: 'knight', x: -250, z: 120 },
  { type: 'knight', x: -145, z: 250 },
  { type: 'knight', x: -205, z: 145 },

  // ── 米勒荒原：连段舞者（**B70 的第二处实例**，同一族）──
  { type: 'dancer', x: 150, z: -20 },
  { type: 'dancer', x: 240, z: -40 },
  { type: 'dancer', x: 190, z: 200 },

  // ── 灰白森林：巨像（切片4 补的：此前灰白森林只有影之战士，整片位面只有一种威胁）──
  { type: 'juggernaut', x: -150, z: 55 },
  { type: 'juggernaut', x: -250, z: 60 },
  { type: 'juggernaut', x: -160, z: 90 },

  // ── 霍格沃兹遗境：咒术师 ──
  { type: 'hexer', x: 80, z: -135 },
  { type: 'hexer', x: -40, z: -140 },
  { type: 'hexer', x: 60, z: -215 },

  // ── 幽暗林地（gloom，中心 ~180,100，半径 160）──
  { type: 'gloom_wraith', x: 120, z: 80 },
  { type: 'gloom_wraith', x: 240, z: 120 },
  { type: 'gloom_wraith', x: 160, z: 200 },
  { type: 'gloom_stalker', x: 80, z: 140 },
  { type: 'gloom_stalker', x: 200, z: 60 },
  { type: 'gloom_stalker', x: 220, z: 80 },
  { type: 'gloom_sentinel', x: 220, z: 20 },
  { type: 'gloom_sentinel', x: 300, z: 80 },
  { type: 'gloom_sentinel', x: 140, z: 180 },

  // 幽暗守夜人（三点）—— 坐标是**用门禁自己的那把尺子挑出来的**：
  // 一只敌人、一间真世界，玩家贴到 1.7 米试四个正方向，至少一向要醒得过来；
  // 且与已有出生点铺开（挤在一起的敌人会互相推着抖）。
  { type: 'gloom_warden', x: 60, z: 0 },
  { type: 'gloom_warden', x: 60, z: 80 },
  { type: 'gloom_warden', x: 240, z: 240 },

  // ── 辉煌圣域（radiant，中心 ~-180,-160，半径 150）──
  { type: 'radiant_crawler', x: -240, z: -200 },
  { type: 'radiant_crawler', x: -120, z: -100 },
  { type: 'radiant_crawler', x: -300, z: -180 },
  { type: 'radiant_knight', x: -80, z: -220 },
  { type: 'radiant_knight', x: -200, z: -80 },
  { type: 'radiant_knight', x: -240, z: -100 },
  { type: 'radiant_dancer', x: -160, z: -240 },
  { type: 'radiant_dancer', x: -220, z: -200 },
  { type: 'radiant_dancer', x: -100, z: -140 },

  // 辉煌圣印者（三点）—— 同上，坐标由门禁的尺子挑出来。
  { type: 'radiant_brand', x: -320, z: -120 },
  { type: 'radiant_brand', x: -300, z: -240 },
  { type: 'radiant_brand', x: -240, z: -280 },
]);
