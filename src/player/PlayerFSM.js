/**
 * 玩家状态机 — 承载 locomotion 与战斗态的互斥规则。
 *
 * 状态只决定"这一帧想怎么动"（写 `owner.velocity` 的水平分量）与"允许哪些动作"
 * （`allowJump` / `allowInteract`）；积分、碰撞、贴地、镜头仍由 `PlayerController.update()`
 * 统一做，位移不会被两处同时写。
 *
 * 每帧用 `resolve()` 按优先级重新判定状态，而不是等事件驱动：位移意图是连续量，
 * 事件驱动会在"翻滚接攻击""落地即冲刺"这类边界上留下卡死状态。
 * `StateMachine.change()` 自带同名不重入，所以 `enter()` 只在真正切换那一帧跑一次。
 */
import { StateMachine } from '../engine/StateMachine.js';

/** 体力低于此值不给冲刺：宁可走也不冲，避免翻滚/重击时突然没体力 */
export const SPRINT_STAMINA_MIN = 12;

/** 优先级从高到低：命中即选中，后面的分支不再参与 */
const PRIORITY = [
  ['roll', (p) => p._dashRemaining > 0],
  ['attack', (p) => !!p.combat?.isBusy()],
  ['airborne', (p) => !p.grounded],
  ['sprint', (p, ctx) => ctx.moving && sprintAllowed(p, ctx)],
  ['walk', (p, ctx) => ctx.moving],
  ['lock', (p) => !!p.combat?.getLockTarget()],
  ['idle', () => true],
];

function sprintAllowed(player, ctx) {
  return ctx.sprintHeld && (player.combat?.canSpend?.(SPRINT_STAMINA_MIN) ?? true);
}

/**
 * 位移状态共用的水平运动：`speedScale` 是该招允许的位移倍率，
 * `allowSprint` 决定 Shift 是否生效（出手与空中不允许）。
 */
function locomotion(owner, dt, ctx, { speedScale = 1, allowSprint = true } = {}) {
  if (!ctx.moving) {
    owner.decayHorizontal(dt, 0.82);
    owner.faceCameraYaw(dt, 10);
    owner.setAnimState(false, false);
    return;
  }
  const sprint = allowSprint && sprintAllowed(owner, ctx);
  owner.moveHorizontal(dt, ctx.moveDir, {
    speed: owner.moveSpeed * owner.speedMultiplier() * (sprint ? owner.sprintMultiplier : 1) * speedScale,
    turnRate: 14,
    walkRate: sprint ? 14 : 9,
  });
  owner.setAnimState(true, sprint);
}

const STATES = {
  roll: {
    allowJump: false,
    allowInteract: false,
    canEnter: (owner) => owner._dashRemaining > 0,
    enter(owner) {
      // 起翻瞬间朝向锁定在冲刺方向，整段位移只取决于帧表时长
      owner.faceDirection(owner.yaw);
      owner.setAnimState(false, false);
    },
    update(owner, sm, dt) {
      if (dt <= 0) return;
      // 最后一帧常常不足一整帧：按剩余时间折算速度，使总位移 = 速度 × 时长，与帧率无关
      const step = Math.min(dt, owner._dashRemaining);
      const scale = step / dt;
      owner.velocity.x = owner._dashVelocity.x * scale;
      owner.velocity.z = owner._dashVelocity.z * scale;
      owner._dashRemaining -= step;
    },
    exit(owner) {
      // 位移结算完就把冲量收干净，落回 locomotion 时不残留一段"幽灵滑行"
      owner.velocity.x = 0;
      owner.velocity.z = 0;
    },
  },

  attack: {
    allowJump: false,
    allowInteract: false,
    update(owner, sm, dt, ctx) {
      locomotion(owner, dt, ctx, { speedScale: owner.combat?.getMoveScale() ?? 1, allowSprint: false });
    },
  },

  airborne: {
    update(owner, sm, dt, ctx) {
      // 空中保留完整操控（现行手感），但不再叠加冲刺；
      // 不封跳：土狼时间窗内仍要能补一次起跳，真正的空中连跳由 _coyoteTimer 把关
      locomotion(owner, dt, ctx, { allowSprint: false });
    },
  },

  lock: {
    update(owner, sm, dt, ctx) {
      if (ctx.moving) return locomotion(owner, dt, ctx);
      owner.faceTarget(owner.combat.getLockTarget().position, dt, 12);
      owner.decayHorizontal(dt, 0.82);
      owner.setAnimState(false, false);
    },
  },

  sprint: {
    update(owner, sm, dt, ctx) {
      locomotion(owner, dt, ctx);
    },
  },

  walk: {
    update(owner, sm, dt, ctx) {
      locomotion(owner, dt, ctx);
    },
  },

  idle: {
    update(owner, sm, dt, ctx) {
      locomotion(owner, dt, ctx);
    },
  },
};

export function resolvePlayerState(player, ctx) {
  for (const [name, guard] of PRIORITY) {
    if (guard(player, ctx)) return name;
  }
  return 'idle';
}

/** 当前状态是否放行某个动作位（jump / interact），未声明即放行 */
export function stateAllows(sm, key) {
  return sm.states[sm.current]?.[key] !== false;
}

export function createPlayerFSM(player) {
  const sm = new StateMachine(player, STATES, 'idle');
  sm.resolve = (ctx) => {
    const next = resolvePlayerState(player, ctx);
    if (next !== sm.current) sm.change(next);
  };
  sm.allows = (key) => stateAllows(sm, key);
  return sm;
}
