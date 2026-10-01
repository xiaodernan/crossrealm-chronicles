/**
 * 每只世界 Boss 的**阶段参数表**（W-B8 切片5）。
 *
 * ## 修的是什么
 *
 * 五只 Boss 的招式数值原先都**散在各自的 `update` 里按 `this.phase` 现算**：
 *
 *     if (this.phase >= 2 && this.shootCooldown <= 0 && this.distanceTo(playerPos) < 25) {
 *       this.projectiles?.spawn(…, 12 + this.phase * 4, 10 + this.phase * 2, 0xcc44ff);
 *       this.shootCooldown = this.phase >= 3 ? 1.2 : 2.0;
 *     }
 *
 * 于是"这只 Boss 在二阶段是什么样"这件事**没有一处能读到** —— 它只存在于三段
 * 分散的算术里（一个 `>= 2` 的门、两个 `phase * N` 的缩放、一个三目）。想比较两只 Boss
 * 的阶段强度、想调一档数值、想回答"三阶段到底强多少"，都得先去读四份 `update`。
 * 而改坏其中一处的症状是"那只 Boss 某一档偏软/偏硬"，**不报错**。
 *
 * ## 表怎么读
 *
 * `BOSS_PHASE_TUNING[bossId][phase]` 是一格**扁平的具名数字**（不是嵌套结构）：
 * 扁平是为了让三档能并排读、也为了让注册表的 schema 一格格声明得出来。
 *
 * 每条 Boss 都有 `attackCooldown`（出招后的收招间隔，基类 `Boss` 读它）；
 * 其余字段按各自有几种招加。**一阶段用不到的字段也照写** —— 三档并排才有可比性，
 * 而"这一格用不到"由该档的 `canXxx` 明确说出来，不靠读者从 `phase >= 2` 去推。
 *
 * ## 与 `content/arenaScripts.js` 的分工
 *
 * 那张表管**场地招式**（红圈/落点/引力井，`trigger` + `chance` + `phase`），
 * 是"这一场会铺什么"；这张表管**Boss 自己身上按阶段变的数**，是"它自己怎么变强"。
 * 两者都以 `bossId` 为键、都归 `content/`，但回答的问题不同，所以分两张表。
 *
 * ## 为什么副本 Boss 不在这里
 *
 * 它的 id 是动态拼的、数量随副本表增长（与 `bossRoster.js` 同一条理由）。
 * `phaseTuningFor()` 对未登记的 id 返回 `null`，消费方各自取自己的兜底
 * （基类有一份 `DEFAULT_PHASE_TUNING`）—— **不在这里硬编一份副本 Boss 的数**。
 */

/**
 * 每只世界 Boss 的三档参数。键与 `content/bossRoster.js` 的 `id` 一一对应
 * （注册表用 `keyRef` 盯着，多一只少一只都会在开机时红）。
 *
 * 各字段的读者：
 * - `attackCooldown` —— 基类 `Boss`：`strike` 收招后隔多久再出手
 * - `canVolley` / `volleyDamage` / `volleySpeed` / `volleyCooldown` —— `MagicBoss`、`SpaceBoss`
 * - `canPull` / `pullCooldown` / `pullImpulse` —— `SpaceBoss`
 * - `diskSpin` —— `SpaceBoss` 的转盘自转速度
 * - `canTimeStop` / `timeStopCooldown` / `timeStopDuration` / `timeStopRange` —— `VoidBoss`
 * - `canPulse` / `pulseInterval` / `pulseDamage` / `pulseRange` —— `ChaosBoss`
 */
export const BOSS_PHASE_TUNING = {
  // 影界守护者：只有收招间隔随阶段收紧
  'shadow-warden': {
    1: { attackCooldown: 1.6 },
    2: { attackCooldown: 1.2 },
    3: { attackCooldown: 0.9 },
  },

  // 大奥术师：二阶段开始放弹，三阶段弹更快更密
  archmagus: {
    1: { attackCooldown: 1.6, canVolley: false, volleyDamage: 16, volleySpeed: 12, volleyCooldown: 2.0 },
    2: { attackCooldown: 1.2, canVolley: true, volleyDamage: 20, volleySpeed: 14, volleyCooldown: 2.0 },
    3: { attackCooldown: 0.9, canVolley: true, volleyDamage: 24, volleySpeed: 16, volleyCooldown: 1.2 },
  },

  // 引力化身：二阶段起引力拉人，三阶段再加一圈弹幕；转盘一直转，阶段越高越快
  'singularity-herald': {
    1: { attackCooldown: 1.6, diskSpin: 1.5, canPull: false, pullCooldown: 3.5, pullImpulse: 6, canVolley: false, volleyCooldown: 0.8 },
    2: { attackCooldown: 1.2, diskSpin: 2.0, canPull: true, pullCooldown: 3.5, pullImpulse: 6, canVolley: false, volleyCooldown: 0.8 },
    3: { attackCooldown: 0.9, diskSpin: 2.5, canPull: true, pullCooldown: 3.5, pullImpulse: 6, canVolley: true, volleyCooldown: 0.8 },
  },

  // 时线执政官：二阶段起停时；三阶段同一档（停时的强度由 duration 给，不随阶段再加）
  'void-chronarch': {
    1: { attackCooldown: 1.6, canTimeStop: false, timeStopCooldown: 4, timeStopDuration: 1.8, timeStopRange: 22 },
    2: { attackCooldown: 1.2, canTimeStop: true, timeStopCooldown: 4, timeStopDuration: 1.8, timeStopRange: 22 },
    3: { attackCooldown: 0.9, canTimeStop: true, timeStopCooldown: 4, timeStopDuration: 1.8, timeStopRange: 22 },
  },

  // 混沌裂隙领主：二阶段起混沌脉冲
  'chaos-overlord': {
    1: { attackCooldown: 1.6, canPulse: false, pulseInterval: 2.5, pulseDamage: 12, pulseRange: 9 },
    2: { attackCooldown: 1.2, canPulse: true, pulseInterval: 2.5, pulseDamage: 12, pulseRange: 9 },
    3: { attackCooldown: 0.9, canPulse: true, pulseInterval: 2.5, pulseDamage: 12, pulseRange: 9 },
  },
};

/**
 * 未登记 id 的兜底（副本 Boss、将来工具生成的野生 Boss）。
 *
 * 与"三档一样"不同：这里三档确实一样，因为**兜底不该假装自己知道那只 Boss 该怎么变强**。
 * 登记过的那五只各有各的曲线，未登记的沿用同一档 —— 想让它有曲线，就登记。
 */
export const DEFAULT_PHASE_TUNING = {
  1: { attackCooldown: 1.6 },
  2: { attackCooldown: 1.2 },
  3: { attackCooldown: 0.9 },
};

/**
 * 取某一档的参数。**永远返回一张表**（未登记走 `DEFAULT_PHASE_TUNING`）——
 * 消费方因此在读字段时不必再写 `?.` 与兜底，也就不会出现"某只 Boss 忘了兜底、
 * 于是它的 `attackCooldown` 是 `undefined`、`strike` 之后立刻又能出手"。
 */
export function phaseTuningFor(bossId, phase) {
  const perBoss = BOSS_PHASE_TUNING[bossId];
  const table = perBoss?.[phase] ?? DEFAULT_PHASE_TUNING[phase];
  return table ?? DEFAULT_PHASE_TUNING[1];
}
