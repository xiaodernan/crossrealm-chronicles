import { GROUND_HAZARD } from './tuning.js';

/**
 * Boss 的场地招式脚本（W-A6 切片3，B5 的"什么时候铺场"那一半）。
 *
 * 分工要说清楚，否则这张表会变成第二个真源：
 * - `content/tuning.js` 的 `GROUND_HAZARD` 管**这一招长什么样**：几枚圈、多大、前摇几秒、掉多少血、什么颜色。
 * - 本表管**谁在什么时候肯放它**：第几阶段起、走哪种闸门、冷却多久、离玩家多远才值得铺。
 *
 * 动手机缘（如实记录）：切片1/2 之后，`Boss` 家族里同一条闸门被手抄了四遍 ——
 * 影界守护者的"近战位上 35% 换砸地"、引力化身的"每秒 0.08 次期望自己起手"、
 * 混沌领主的同一条但换成 0.06 与第三阶段、大奥术师的"冷却 7 秒且 24 米内铺弹幕"。
 * 四份写法各不相同，症状也各不相同：引力化身与混沌领主因为同时挂着两条闸门，
 * 砸地会和大范围普攻互相顶；给第三只 Boss 加弹幕则要把 `MagicBoss` 那段再抄一遍。
 * 所以这一档收进表里，`Boss` 只留一条通用驱动。
 */

/** 招式名 → `GROUND_HAZARD` 里的数值档名（形状与伤害在那一份，本表只认这个名字） */
export const ARENA_MOVES = {
  slam: 'bossSlam',
  barrage: 'barrage',
  well: 'gravityWell',
  freeze: 'chronoField',
  homing: 'homingStrike',
};

/**
 * 三种闸门，语义互斥：
 * - `melee`：抢一次普通挥击的位置 —— 在出手距离内、收招冷却结束时按 `chance` 决定"这一刀是挥砍还是圈"。
 * - `timed`：不看距离、按每秒 `rate` 次期望自己起手 —— 给远程/悬浮型 Boss 用（它不贴脸也得能铺场）。
 * - `opportunity`：`cooldown` 秒一循环，冷却到期**且**玩家在 `range` 内就当帧铺场。
 */
export const ARENA_TRIGGERS = ['melee', 'timed', 'opportunity'];

/**
 * `entry` 是与三条闸门正交的一枚**标记**（W-A6 切片8，不是第四种闸门）：
 * 「本阶段的招牌圈在**转进这一阶段的那一帧**先亮一次」—— 与 `BossPhaseDirector`
 * 的横幅/闪白/粒子同帧（`boss-phase` 事件派发前圈已铺好），玩家看到的不是"换了条血条"。
 *
 * 入场只点火一次、**绕过反应闸**（`chance` / `rate` / opportunity 冷却），但**保留**
 * `opportunity` 的 `range` 空间闸 —— 弹幕/域以玩家此刻位置为心，他站得够远就不铺，
 * 引力化身那张表的距离博弈不因入场而破。三层约束见 `assertArenaScript`：
 * 布尔、`phase >= 2`（没有"转进一阶段"这一帧）、同一阶段至多一枚（一脚踩下去）。
 */

/**
 * 按 `bossId` 声明。数值口径：
 * - `chance 0.35` / `rate 0.08` / `rate 0.06` 与 `cooldown 7 / range 24` 都是**照抄切片1/2 的现值**，
 *   本切片不改手感，只把散在四处的门槛搬进一张表。
 * - 引力化身与混沌领主的弹幕是新增内容（它们从此也读场地招），各给一份 `tint` 保住自己的配色，
 *   且都放在第三阶段 —— 前中期先把"贴身换刀"的压力给足，铺场留到玩家已经会躲砸地之后。
 * - `entry: true` 的落点（切片8）：**每阶段至多一枚招牌圈** —— 二阶段统一是砸地或弹幕，
 *   三阶段是各家最响的那一招（弹幕/时停域）；引力化身的井刻意不标（理由见它那条注释）。
 */
export const BOSS_ARENA_SCRIPTS = {
  default: [
    // 兜底也算"有戏"：转二阶段那一帧先踩一脚砸地（与点名 Boss 同一套入场语义）
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35, entry: true },
  ],
  'shadow-warden': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35, entry: true },
    // 影界守护者是"套着场地招的近战王牌"，不是"只会砸地的兜底"：第三阶段起每 8 秒在玩家脚下
    // 甩一片影弹（与奥术师读同一枚 barrage，各自留 `tint` 保住配色）。`range 22` 让它只咬近处
    // —— 退到底就只挨 P2 砸地那记，贴上来连吃两份，和前两阶段的贴身压力是同一股劲。
    // **刻意不标 entry**：二阶段的砸地已是招牌入场招；三阶段的影弹是节奏里的常态招，
    // 转阶段那一帧再来一次就在同 frame 把"入场砸地"和"预告影弹"叠成两脚，观众看不懂。
    { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 8, range: 22, tint: 0x6a3bbf },
    // 第四种场地机制：引力井 —— 影界的引力扭曲，第三阶段 15 秒一口井口开在玩家脚下
    { move: 'well', phase: 3, trigger: 'opportunity', cooldown: 15, range: 14, tint: 0x221144 },
  ],
  'archmagus': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35 },
    // 入场点的是弹幕：大奥术师的"变强"就是这片圈雨，`range 24` 让它当帧追着玩家亮
    { move: 'barrage', phase: 2, trigger: 'opportunity', cooldown: 7, range: 24, entry: true },
    // 第四种场地机制：引力井 —— 奥术师的秘法扭曲空间，第三阶段 14 秒一口
    // 井刻意不标 entry：转阶段那一帧会无条件破掉距离博弈
    { move: 'well', phase: 3, trigger: 'opportunity', cooldown: 14, range: 16, tint: 0x44aaff },
  ],
  'singularity-herald': [
    { move: 'slam', phase: 2, trigger: 'timed', rate: 0.08, entry: true },
    { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 9, range: 22, tint: 0x4488ff, entry: true },
    // 引力井是它的招牌：第三阶段起 12 秒一口，井口就开在你此刻站的地方。
    // `range` 刻意比弹幕（22 米）近一档：转阶段那一帧弹幕作为入场先亮，井的冷却没走，
    // 紧跟着的下一帧里 15 米内就是"贴脸连吃两份"，稍远些只落弹幕 ——
    // 玩家退开的位置决定挨哪一份。（井**刻意不列入场**：标了它，这份距离博弈
    // 就会在转阶段那一帧被无条件破掉一半。）
    { move: 'well', phase: 3, trigger: 'opportunity', cooldown: 12, range: 15 },
  ],
  'void-chronarch': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35, entry: true },
    // 时停域：第三阶段起 14 秒一片，开在玩家此刻脚下。它自己那记**无场**的时停
    // （`VoidBoss.timeStopActive`，22 米内 4 秒一循环）留在那儿不动 —— 切片3 就说过
    // 非危险区的自走技归 W-B1 那张统一施法表，本切片只把"有场的那一份"补上。
    // 两条同时在身上时 `applyTimeScale` 取最小值：站在场里吃更狠的 0.3，不站吃 0.35。
    { move: 'freeze', phase: 3, trigger: 'opportunity', cooldown: 14, range: 17, entry: true },
    // 追踪落点（第五种场地招）：第三阶段起 10 秒一枚，圈在**前 0.96 秒**贴着玩家走、之后
    // 锁死落地 —— 与上面那记时停域"开在脚下就钉死"是两种躲法：这一种提前跑开没用，得看圈
    // 不再动才闪。`range 20` 与 freeze 的 17 错开，别两招同帧都够条件、把节奏挤成一团。
    { move: 'homing', phase: 3, trigger: 'opportunity', cooldown: 10, range: 20 },
  ],
  'chaos-overlord': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.3, entry: true },
    { move: 'slam', phase: 3, trigger: 'timed', rate: 0.06 },
    // 入场点的是红色弹幕：第三阶段开场先来一片红的
    { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 8, range: 20, tint: 0xff2244, entry: true },
  ],
  /**
   * W-E3 切片5：五座副本守钥者各配一份**专属**场地脚本。
   *
   * 改前它们全吃 `default` 兜底（转二阶段砸一次地）—— 于是五座副本的守钥者战
   * 在场地维度上是**同一场仗**：玩家在五座迷宫里看到的红圈、节奏与躲法完全一样。
   * 现在每座有自己的招牌：墓碑与亡魂、飞页追人、几何折叠、根须破土、枢纽之钥共鸣。
   *
   * 数值口径：
   * - `range` 都收在 18 米以内 —— 副本的房间比 Boss 竞技场小，圈铺在房间外没有意义；
   * - 每座**只有一枚入场招**（同一阶段至多一枚，见 `assertArenaScript`）；
   * - 冷却与频率错开，避免"砸地与大范围普攻互相顶"（引力化身与混沌领主那一族的老问题）。
   */
  'dungeon-ruin-crypt': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.4, entry: true },
    { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 9, range: 16, tint: 0x8a8a72 },
  ],
  'dungeon-forbidden-library': [
    { move: 'barrage', phase: 2, trigger: 'opportunity', cooldown: 6, range: 18, entry: true },
    { move: 'slam', phase: 3, trigger: 'timed', rate: 0.07 },
  ],
  'dungeon-five-dim-rift': [
    { move: 'slam', phase: 2, trigger: 'timed', rate: 0.08, entry: true },
    { move: 'well', phase: 3, trigger: 'opportunity', cooldown: 11, range: 13 },
  ],
  'dungeon-forest-shrine': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.45, entry: true },
    { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 8, range: 15, tint: 0x88cc66 },
  ],
  'dungeon-hub-catacombs': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35, entry: true },
    { move: 'freeze', phase: 3, trigger: 'opportunity', cooldown: 12, range: 15 },
  ],
  'dungeon-gloom-mist-crypt': [
    // 迷雾墓穴：雾里看不清脚下 —— 招牌是**时停域**（视野一暗，站错就是四秒不能动）
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.4, entry: true },
    { move: 'freeze', phase: 3, trigger: 'opportunity', cooldown: 13, range: 14, tint: 0x4a4a7a },
  ],
  'dungeon-radiant-dawn-hall': [
    // 晨曦圣殿：金光里到处是圈 —— 招牌是**弹幕**（入场的第一片就压过来）
    { move: 'barrage', phase: 2, trigger: 'opportunity', cooldown: 6, range: 18, tint: 0xffdd66, entry: true },
    { move: 'slam', phase: 3, trigger: 'timed', rate: 0.07 },
  ],
};

/**
 * 整表校验。加载期跑一次（与 `assertPoiIdentity` 同一条纪律：错表要在开打前红，
 * 不要等到某一场 Boss 战里才发现"它根本不铺场"）。
 */
export function assertArenaScript(table = BOSS_ARENA_SCRIPTS) {
  for (const [bossId, script] of Object.entries(table)) {
    if (!Array.isArray(script)) throw new Error(`场地脚本 ${bossId} 不是数组`);
    /** 本 Boss 已标过入场的阶段（切片8：同一阶段至多一枚） */
    const entryPhases = new Set();
    script.forEach((e, i) => {
      const at = `${bossId}[${i}]`;
      const specName = ARENA_MOVES[e.move];
      if (!specName) throw new Error(`${at} 的招式 "${e.move}" 未登记于 ARENA_MOVES`);
      if (!GROUND_HAZARD[specName]) throw new Error(`${at} 指向的 GROUND_HAZARD.${specName} 不存在`);
      if (!ARENA_TRIGGERS.includes(e.trigger)) {
        throw new Error(`${at} 的闸门 "${e.trigger}" 未知（可用：${ARENA_TRIGGERS.join(', ')}）`);
      }
      if (!Number.isInteger(e.phase) || e.phase < 1 || e.phase > 3) {
        throw new Error(`${at} 的 phase 必须是 1~3 的整数（收到 ${e.phase}）`);
      }
      if (e.entry !== undefined && typeof e.entry !== 'boolean') {
        throw new Error(`${at} 的 entry 必须是 true/false（收到 ${typeof e.entry}）`);
      }
      if (e.entry === true && e.phase < 2) {
        throw new Error(`${at} 标了 entry 但 phase=${e.phase}：没有"转进一阶段"这一帧，入场招永远不会点火`);
      }
      if (e.entry === true) {
        if (entryPhases.has(e.phase)) {
          throw new Error(`${at} 的 entry：第 ${e.phase} 阶段已经有一枚入场招了（转阶段那一帧只该有一脚踩下去）`);
        }
        entryPhases.add(e.phase);
      }
      if (e.trigger === 'melee' && !(e.chance > 0 && e.chance <= 1)) {
        throw new Error(`${at} 的 melee 闸门要有 0~1 之间的 chance`);
      }
      if (e.trigger === 'timed' && !(e.rate > 0)) {
        throw new Error(`${at} 的 timed 闸门要有正的 rate（每秒期望次数）`);
      }
      if (e.trigger === 'opportunity' && !(e.cooldown > 0 && e.range > 0)) {
        throw new Error(`${at} 的 opportunity 闸门要有正的 cooldown 与 range`);
      }
    });
  }
  return table;
}

/** 按 bossId 取脚本；未登记的（副本 Boss、将来工具生成的野生 Boss）走 `default` */
export function arenaScriptFor(bossId) {
  return BOSS_ARENA_SCRIPTS[bossId] ?? BOSS_ARENA_SCRIPTS.default;
}

assertArenaScript();
