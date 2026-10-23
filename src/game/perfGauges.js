/**
 * 泄漏 watchdog 的计数清单（W-C1 切片4）。
 *
 * ## 修的是什么
 *
 * `PerfHUD.stats()` 的注释写着"供测试与回归门禁读取"，`_lines()` 里也有完整的
 * "`leak: true` 且增长超过容忍带就标红"的逻辑 —— 但**生产里一条 gauge 都没带 `leak: true`**：
 * `Game.js` 那六行 `.gauge(...)` 全用缺省值，于是 `stats().leaks` 永远是 `{}`。
 * 也就是说这套 watchdog 从接上那天起就没可能报过一次警，而 `tests/engine-perfhud.test.js`
 * 一直绿 —— 因为那条用例**自己注册了一条带 `leak` 的 gauge**，覆盖了机制、没覆盖接线。
 * 与 §0.3 那条同源：验证工具自己没启用的时候，它会报告一切正常。
 *
 * ## 为什么把清单搬出来
 *
 * 搬成一份可注入的清单（而不是留在 `Game` 的链式调用里）是为了**能测**：
 * 用例拿一个假 `game` 跑 `registerPerfGauges`，就能断言"注册完之后 `stats().leaks` 不是空的"——
 * 那正是修前会红、修后该绿的那一条。留在 `Game` 里就只能去静态扫源码，而静态扫描
 * 恰好是"覆盖了写法、没覆盖行为"的那种绿。
 *
 * ## 容忍带是量出来的（下面每个数都带出处）
 *
 * `growth` 的语义是"相对历史最低点的净增长"（`PerfHUD._growth`），所以**任何**池子
 * 从 0 长到峰值都会留下正的 growth。容忍带因此必须大于"合法峰值"，否则 watchdog 一直红 ——
 * 红久了就没人看，那比不接还糟。反过来说也不能往宽里随手取：**带子宽到一定程度就等于没接**。
 *
 * 本片的数是**真页面量出来的**（headless Chrome + 原生 CDP，dev 口，`Game.update()` 由
 * 游戏自己的 rAF 驱动；读数脚本 `.tmp-20260929/live-q2.mjs` / `live-q3.mjs`，
 * 两份原始读数在 `.tmp-20260929/live-q.json` / `live-q3.json`）。量到的"峰增长"列在下面每条上，
 * 带子里的倍数都是相对那个数算的。**没量到的项如实标注**，不假装量过。
 *
 * 判读这套数时的两条口径：
 *  - `growth` 是**会话内净增长**，不是"绝对值大"。开局名册就有 41 只敌人，但基线也取 41，
 *    所以静止站着时"存活敌人"的 growth 是 0（这一条是量过的：静置 80 帧全是 0）。
 *  - 带子按"合法峰值的倍数"取，因此它同时是一种**设计断言**：超过这个倍数就说明
 *    要么有一条归还路径断了（池子只进不出），要么有谁在按帧新建资源。
 */

/**
 * 每条 gauge 一项。
 *
 * - `label` —— 显示名，也是 `stats().leaks` 的键。**改名等于改门禁的键**，别顺手改。
 * - `key` — 文案键（W-D2 切片42）：显示层经 `t(key)` 展开，缺省回落 `label`。
 *   `label` 保持中文不变（leaks 的键就是它），换语言只换显示不换账。
 * - `read` —— 从 `game` 取当前值。**只走公开接口**，不翻系统内部字段
 *   （与 `PerfHUD` 原有的口径一致：翻内部字段的读数会在重构时静默失效）。
 * - `tolerance` —— 容忍带：growth 超过它才标红。每条后面的注释写明出处。
 */
export const PERF_GAUGES = [
  // ── 战斗侧（原有六条，本片给它们装上 leak 标记与量出来的带子）──
  // 量到 41（开局名册 46 个出生点里的存活数，`spawnDefaults` 只开一次）；`SUMMON.total` 另有 8 只上限。
  // 带 96 = 实测的 2.3 倍，够得到"再叠一次名册"（把 `spawnDefaults` 调两遍就是 +41，那正是该红的样子）。
  { label: '存活敌人', key: 'gauge_alive_enemies', read: (g) => g.enemyManager.getAliveEnemies().length, tolerance: 96 },
  // 量到 24（`ProjectileManager.spawn` 是怨影/哨炮/咒师共用的真出口，一口气交 24 枚）。
  // 这条链是**每枚新建一份几何 + 材质**，所以它涨不停就是真泄漏；带 64 = 实测的 2.7 倍。
  { label: '敌方弹体', key: 'gauge_enemy_projectiles', read: (g) => g.projectiles.count(), tolerance: 64 },
  // 量到 3（满名册混战里真放法术）。带 12 = 实测的 4 倍 —— 比原来的估值 32 紧得多，
  // 因为"场上法术效果"本就该是个位数：再多就说明 `_recycleBolt` / `_recycleAoe` 有一条没走。
  { label: '法术效果', key: 'gauge_spell_effects', read: (g) => g.spells.count(), tolerance: 12 },
  // 量到 0（本片没能让它涨起来：Boss 与裂隙爬兽才开圈，headless 里 1.2 fps 等不到那一招）。
  // 这条是 `GroundHazards` 自己的 `pooled() + count()` 那本账，带子沿用估值。
  { label: '地面危险区', key: 'gauge_ground_hazards', read: (g) => g.enemyManager.hazards.count(), tolerance: 24 },
  // 量到 26 = 它的池容量本身（`HIT.numberPool`），即"同时在场"的硬上限：满池就会挤掉最老的。
  // 带 = 池容量，因此只有"池容量本身变大"或"activeCount 不再归还"才会红。
  { label: '飘字', key: 'gauge_damage_numbers', read: (g) => g.damageNumbers.activeCount(), tolerance: 26 },
  // 量到 124（一次 40 个命中溅出的活跃火花数）。带 130 取在实测峰值之上一点点 ——
  // 这是六条里最紧的一条，因为火花池满就没得涨，涨过池容量只可能是不归还。
  { label: '火花', key: 'gauge_sparks', read: (g) => g.combatFeedback.activeCount(), tolerance: 130 },

  // ── W-C1 池化过的三处（切片1..3 修的就是它们"只进不出"）──
  // 加了池子之后，"同时在场"与"池子里备着几件"是两笔账：前者该在捡走/到期后落回去，
  // 后者该在达到峰值后**稳住**。两条都接上，池化本身写坏（只申领不归还）才会被看见 ——
  // 否则池化把泄漏从"新建资源"变成"数组无限长"，而两件事都不会报错。
  //
  // 量到 15（开局地上就有 15 件）／硬刷后瞬时的 112（原地掉 80 件、一件都不捡，只能等到期）。
  // 带 192 = 实测峰值的 1.7 倍：地上堆上百件是合法局面（30 秒到期 + 玩家没去捡），
  // 但"只增不减"会一路顶穿这个数，所以它仍是一条有效的杠。
  { label: '掉落物', key: 'gauge_loot_drops', read: (g) => g.loot.drops.length, tolerance: 192 },
  { label: '掉落池', key: 'gauge_loot_pool', read: (g) => g.loot.pooled(), tolerance: 192 },
  // 量到 0（本片那一窗里残影都已经归还了），但 `VoidEcho.MAX_ECHOES = 12` 是硬上限，
  // 归还路径写坏才会超过它。带 24 = 上限的 2 倍。
  { label: '残影池', key: 'gauge_void_echo_pool', read: (g) => g.voidEcho.pooled(), tolerance: 24 },
];

/**
 * 把清单装到 HUD 上。返回同一个 `hud`，便于链式接在构造之后。
 *
 * 一律 `leak: true`：这一份清单的**存在意义**就是泄漏监控，不需要"只显示不监控"的行
 * （F3 面板里那些纯信息行由 `PerfHUD._lines()` 自己出，不走这里）。
 */
export function registerPerfGauges(hud, game) {
  for (const { label, key, read, tolerance } of PERF_GAUGES) {
    hud.gauge(label, () => read(game), { leak: true, tolerance, key });
  }
  return hud;
}
