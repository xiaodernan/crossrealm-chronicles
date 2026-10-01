/**
 * Boss 阶段参数表（W-B8 切片2：6个Boss × 3阶段的专属招式表）。
 *
 * 设计：
 * - 每个 Boss 有 3 个阶段，每阶段一个行为表
 * - 行为表包含：speed、damage、attackCooldown、arenaScriptOverrides（可选覆盖场地脚本）
 * - 通过 `phaseTuningFor(bossId, phase)` 统一读取
 * - 切片1 的状态机 `sm.behaviorFor(phase)` 返回这里的表
 *
 * 迁移来源：原来散在各 Boss 子类的 `update` 里（`this.phase >= 2`、`this.phase >= 3` 等判断），
 * 现在统一到此表，`Boss.tuning()` 统一读取，各子类 `update` 不再写 `if (this.phase >= N)`。
 *
 * 注意：`arenaScriptOverrides` 可选，用于覆盖/追加 `arenaScript` 条目（仅对该阶段生效）。
 * 若不提供，则完全沿用 `arenaScriptFor(bossId)` 的默认表。
 *
 * 数值与原公式逐格相等（这是本片唯一说得过去的"行为没变"证据）：
 * - attackCooldown 原式：`phase >= 3 ? 0.9 : phase >= 2 ? 1.2 : 1.6`
 * - archmagus: volleyDamage = 12 + p * 4, volleySpeed = 10 + p * 2, volleyCooldown = p >= 3 ? 1.2 : 2.0, canVolley = p >= 2
 * - singularity-herald: diskSpin = 1 + p * 0.5, canPull = p >= 2, pullCooldown = 3.5, pullImpulse = 6, canVolley = p >= 3, volleyCooldown = 0.8
 * - void-chronarch: canTimeStop = p >= 2, timeStopCooldown = 4, timeStopDuration = 1.8, timeStopRange = 22
 * - chaos-overlord: canPulse = p >= 2, pulseInterval = 2.5, pulseDamage = 12, pulseRange = 9
 */

export const BossPhaseTuning = {
  // shadow-warden（影界守护者）：物理近战 + 砸地，P2 加速、P3 狂暴
  'shadow-warden': {
    1: {
      speed: 4.5,
      damage: 18,
      attackCooldown: 1.6,
    },
    2: {
      speed: 5.5,
      damage: 20,
      attackCooldown: 1.2,
    },
    3: {
      speed: 7,
      damage: 24,
      attackCooldown: 0.9,
      // P3 新增：每 0.06 次/秒期望起手一次砸地（原 `checkPhase` 里的 `rate: 0.06`）
      // 这里留空：由 arenaScript 里的 `timed` 条目控制（见 arenaScripts.js）
    },
  },

  // archmagus（大奥术师）：远程弹幕 + 砸地，P2 弹幕、P3 狂轰
  'archmagus': {
    1: {
      speed: 4,
      damage: 16,
      attackCooldown: 1.6,
      volleyDamage: 16,
      volleySpeed: 12,
      volleyCooldown: 2.0,
      canVolley: false,
    },
    2: {
      speed: 4,
      damage: 18,
      attackCooldown: 1.2,
      // P2 开启 barrage（弹幕），冷却 7s，范围 24m
      // 由 arenaScript 里的 opportunity 条目控制
      volleyDamage: 20,
      volleySpeed: 14,
      volleyCooldown: 2.0,
      canVolley: true,
    },
    3: {
      speed: 4,
      damage: 22,
      attackCooldown: 0.9,
      volleyDamage: 24,
      volleySpeed: 16,
      volleyCooldown: 1.2,
      canVolley: true,
    },
  },

  // singularity-herald（奇点领主/引力化身）：引力井 + 弹幕 + 砸地
  'singularity-herald': {
    1: {
      speed: 5,
      damage: 20,
      attackCooldown: 1.6,
      diskSpin: 1.5,
      canPull: false,
      pullCooldown: 3.5,
      pullImpulse: 6,
      canVolley: false,
      volleyCooldown: 0.8,
    },
    2: {
      speed: 5,
      damage: 22,
      attackCooldown: 1.2,
      diskSpin: 2.0,
      canPull: true,
      pullCooldown: 3.5,
      pullImpulse: 6,
      canVolley: false,
      volleyCooldown: 0.8,
    },
    3: {
      speed: 5.5,
      damage: 26,
      attackCooldown: 0.9,
      diskSpin: 2.5,
      canPull: true,
      pullCooldown: 3.5,
      pullImpulse: 6,
      canVolley: true,
      volleyCooldown: 0.8,
    },
  },

  // void-chronarch（时线执政官）：时停域 + 砸地
  'void-chronarch': {
    1: {
      speed: 4.8,
      damage: 19,
      attackCooldown: 1.6,
      canTimeStop: false,
      timeStopCooldown: 4,
      timeStopDuration: 1.8,
      timeStopRange: 22,
    },
    2: {
      speed: 5.2,
      damage: 21,
      attackCooldown: 1.2,
      canTimeStop: true,
      timeStopCooldown: 4,
      timeStopDuration: 1.8,
      timeStopRange: 22,
    },
    3: {
      speed: 5.8,
      damage: 23,
      attackCooldown: 0.9,
      canTimeStop: true,
      timeStopCooldown: 4,
      timeStopDuration: 1.8,
      timeStopRange: 22,
    },
  },

  // chaos-overlord（混沌裂隙领主）：混沌脉动 + 砸地 + 弹幕
  'chaos-overlord': {
    1: {
      speed: 5.2,
      damage: 21,
      attackCooldown: 1.6,
      canPulse: false,
      pulseInterval: 2.5,
      pulseDamage: 12,
      pulseRange: 9,
    },
    2: {
      speed: 5.5,
      damage: 23,
      attackCooldown: 1.2,
      canPulse: true,
      pulseInterval: 2.5,
      pulseDamage: 12,
      pulseRange: 9,
    },
    3: {
      speed: 6,
      damage: 25,
      attackCooldown: 0.9,
      canPulse: true,
      pulseInterval: 2.5,
      pulseDamage: 12,
      pulseRange: 9,
      // P3：timed slam rate 0.06，barrage cooldown 8s，范围 20m，红色 tint
    },
  },
};

/**
 * 默认阶段参数（副本 Boss / 未登记 id 的兜底）。
 */
export const DEFAULT_PHASE_TUNING = {
  1: { speed: 5, damage: 18, attackCooldown: 1.6 },
  2: { speed: 5.5, damage: 20, attackCooldown: 1.2 },
  3: { speed: 6, damage: 22, attackCooldown: 0.9 },
};

/**
 * 取某 Boss 某阶段的参数表。
 * @param {string} bossId - Boss ID（如 'shadow-warden'）
 * @param {number} phase - 阶段（1/2/3）
 * @returns {object} 含 speed、damage、attackCooldown 等字段
 */
export function phaseTuningFor(bossId, phase) {
  const table = BossPhaseTuning[bossId] ?? DEFAULT_PHASE_TUNING;
  const valid = Number.isInteger(phase) && phase >= 1 && phase <= 3;
  return (valid ? table[phase] : DEFAULT_PHASE_TUNING[1]);
}

export const BOSS_PHASE_TUNING = BossPhaseTuning;
export default BossPhaseTuning;