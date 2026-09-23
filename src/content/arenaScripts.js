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
};

/**
 * 三种闸门，语义互斥：
 * - `melee`：抢一次普通挥击的位置 —— 在出手距离内、收招冷却结束时按 `chance` 决定"这一刀是挥砍还是圈"。
 * - `timed`：不看距离、按每秒 `rate` 次期望自己起手 —— 给远程/悬浮型 Boss 用（它不贴脸也得能铺场）。
 * - `opportunity`：`cooldown` 秒一循环，冷却到期**且**玩家在 `range` 内就当帧铺场。
 */
export const ARENA_TRIGGERS = ['melee', 'timed', 'opportunity'];

/**
 * 按 `bossId` 声明。数值口径：
 * - `chance 0.35` / `rate 0.08` / `rate 0.06` 与 `cooldown 7 / range 24` 都是**照抄切片1/2 的现值**，
 *   本切片不改手感，只把散在四处的门槛搬进一张表。
 * - 引力化身与混沌领主的弹幕是新增内容（它们从此也读场地招），各给一份 `tint` 保住自己的配色，
 *   且都放在第三阶段 —— 前中期先把"贴身换刀"的压力给足，铺场留到玩家已经会躲砸地之后。
 */
export const BOSS_ARENA_SCRIPTS = {
  default: [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35 },
  ],
  'shadow-warden': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35 },
  ],
  'archmagus': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35 },
    { move: 'barrage', phase: 2, trigger: 'opportunity', cooldown: 7, range: 24 },
  ],
  'singularity-herald': [
    { move: 'slam', phase: 2, trigger: 'timed', rate: 0.08 },
    { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 9, range: 22, tint: 0x4488ff },
    // 引力井是它的招牌：第三阶段起 12 秒一口，井口就开在你此刻站的地方。
    // `range` 刻意比弹幕（22 米）近一档：跨阶段那一帧两条 opportunity 都会当帧起念，
    // 15 米内是"贴脸连吃两口井"，稍远些只落弹幕 —— 玩家退开的位置决定挨哪一份。
    { move: 'well', phase: 3, trigger: 'opportunity', cooldown: 12, range: 15 },
  ],
  'void-chronarch': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.35 },
    // 时停域：第三阶段起 14 秒一片，开在玩家此刻脚下。它自己那记**无场**的时停
    // （`VoidBoss.timeStopActive`，22 米内 4 秒一循环）留在那儿不动 —— 切片3 就说过
    // 非危险区的自走技归 W-B1 那张统一施法表，本切片只把"有场的那一份"补上。
    // 两条同时在身上时 `applyTimeScale` 取最小值：站在场里吃更狠的 0.3，不站吃 0.35。
    { move: 'freeze', phase: 3, trigger: 'opportunity', cooldown: 14, range: 17 },
  ],
  'chaos-overlord': [
    { move: 'slam', phase: 2, trigger: 'melee', chance: 0.3 },
    { move: 'slam', phase: 3, trigger: 'timed', rate: 0.06 },
    { move: 'barrage', phase: 3, trigger: 'opportunity', cooldown: 8, range: 20, tint: 0xff2244 },
  ],
};

/**
 * 整表校验。加载期跑一次（与 `assertPoiIdentity` 同一条纪律：错表要在开打前红，
 * 不要等到某一场 Boss 战里才发现"它根本不铺场"）。
 */
export function assertArenaScript(table = BOSS_ARENA_SCRIPTS) {
  for (const [bossId, script] of Object.entries(table)) {
    if (!Array.isArray(script)) throw new Error(`场地脚本 ${bossId} 不是数组`);
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
