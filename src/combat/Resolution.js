/**
 * 统一结算 —— 一次命中里的全部数值修正集中在这条流水线（M2）。
 *
 * 顺序固定：部位倍率 → 背刺 → 防御减伤 → 元素抗性 → 暴击 → 破防架势加成 → 正面格挡减免。
 * 出手瞬间只登记**基线**（`base`/`posture`，已含武器与属性倍率），
 * 目标侧的每一层修正在命中那一帧才算，因为部位/朝向/硬直/是否举盾都是命中帧才确定的状态。
 *
 * 本模块是纯函数：不写敌人字段、不发事件、不生成特效。目标只提供只读接口
 * （`getDefense` / `getResist` / `isStaggered` / `isGuarding` / `facingYaw`），写账仍由目标自己的 `takeDamage` 完成。
 */
import { BACKSTAB, CRIT, GUARD, MITIGATION, POSTURE } from '../content/tuning.js';

/**
 * 出手者是否位于目标正后方（背刺位）。
 * 目标朝向 = `facingYaw()`（与本仓库一致的 atan2(dx, dz) 约定），
 * 比较的是「目标朝向」与「目标指向出手者」的夹角。
 */
export function isBehind(target, attackerPos) {
  const dx = attackerPos.x - target.position.x;
  const dz = attackerPos.z - target.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  const yaw = target.facingYaw();
  const dot = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / len;
  return dot < BACKSTAB.dot;
}

/**
 * 目标的正面格挡是否挡得住这一击：只在「正举着盾」且出手者在防御弧内时成立。
 * 目标没有格挡能力时返回 false，调用方因此不必各自再写一层判空。
 */
export function isGuarded(target, attackerPos) {
  if (!target?.isGuarding?.()) return false;
  const dx = attackerPos.x - target.position.x;
  const dz = attackerPos.z - target.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;                 // 重合时谈不上"正面"
  const yaw = target.facingYaw();
  const dot = (Math.sin(yaw) * dx + Math.cos(yaw) * dz) / len;
  return dot > GUARD.arc;
}

/**
 * 结算一次命中的伤害与架势值。
 * @param {object} p
 * @param {number} p.base      伤害基线（含武器/属性/连击倍率）
 * @param {number} p.posture   架势基线
 * @param {object} [p.target]  受击方，null 表示无账可算的环境伤害（只走暴击以外的公式）
 * @param {object} [p.part]    Hurtbox 选出的受击分段，null 视为击中躯干基线
 * @param {string} [p.element] 元素类型（fire/ice/gravity），null 为物理
 * @param {boolean} [p.backstab]
 * @param {boolean} [p.guard]    目标的正面格挡挡住了这一击（`isGuarded`）
 * @param {'player'|'enemy'} [p.side] 取哪一组暴击参数
 * @param {() => number} [p.rng]
 */
export function resolveHit({
  base = 0,
  posture = 0,
  target = null,
  part = null,
  element = null,
  backstab = false,
  guard = false,
  side = 'player',
  rng = Math.random,
} = {}) {
  let damage = base;
  let postureDamage = posture;

  if (part) {
    damage *= part.mult;
    postureDamage *= part.posture;
  }
  if (backstab) {
    damage *= BACKSTAB.mult;
    postureDamage *= BACKSTAB.posture;
  }
  // 格挡放在最后：它是"举着盾挨下这一击"的结果，前面的部位/背刺都照常成立，
  // 而绕到背后那一刀本来就不该被盾挡到（backstab 时调用方不会传 guard）
  if (guard) {
    damage *= GUARD.mult;
    postureDamage *= GUARD.posture;
  }
  if (target) {
    const def = target.getDefense();
    damage *= 1 - Math.min(MITIGATION.cap, Math.max(0, def) / (def + MITIGATION.K));
    if (element) {
      const res = Math.min(0.9, Math.max(-0.5, target.getResist(element)));
      damage *= 1 - res;
    }
  }

  const critCfg = CRIT[side] ?? CRIT.player;
  const crit = critCfg.chance > 0 && rng() < critCfg.chance;
  if (crit) damage *= critCfg.mult;

  if (target?.isStaggered()) postureDamage *= POSTURE.staggerBonus;

  return {
    damage: Math.max(1, Math.round(damage)),
    posture: Math.max(0, Math.round(postureDamage)),
    crit,
    part,
    backstab,
    guard,
    blocked: guard,
    element,
  };
}

/** 伤害飘字后缀：把结算结果里的"为什么这么多"直接写进数字旁边 */
export function hitSuffix(hit) {
  let s = '';
  if (hit.blocked) s += '格挡';
  if (hit.part?.label) s += hit.part.label;
  if (hit.backstab) s += '背刺';
  if (hit.crit) s += '会心';
  return s;
}

/**
 * 命中方向：从出手者指向目标的水平单位向量（重合时为 0 向量）。
 *
 * 火花往哪喷、目标往哪退是同一件事，必须同源给出，否则"被打飞"和"火星四溅"会各指一边。
 * `out` 由调用方复用自己的临时向量，避免每次命中新建对象。
 */
export function hitDirection(from, to, out = {}) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const k = len > 1e-4 ? 1 / len : 0;
  out.x = dx * k;
  out.z = dz * k;
  return out;
}
