/**
 * 敌人状态机 —— 将 `Enemy.update()` 里的字符串 if/else 链搬进来。
 *
 * 分工与 `PlayerFSM` 一致：**状态只决定"这一帧想往哪走、什么时候出手"**
 * （写 `owner.setWish(vx, vz)`），真正的积分、碰撞、分离、贴地仍由 `Enemy._advance()`
 * 统一做，位移不会在一帧内被两处写入。
 *
 * 每帧 `resolve()` 重新判定该处于哪个状态，而不是等事件驱动：
 * "追击接前摇""硬直结束接围攻"这类边界靠事件转移最容易留下卡死状态（旧 B8 的成因）。
 * 但**招式进行中是承诺态**（COMMITTED）：`windup` 已经开始就必须走完，
 * 不能因为玩家横向走了一步就在半空中改判，否则前摇预警成了假动作。
 *
 * 三个新行为是这一版手感的关键：
 * - 看不见的玩家不追，追丢了会回位（`ai/Perception`）；
 * - 抢不到进攻名额的敌人绕外圈等待（`ai/Squad` + `orbit` 态），不再八只同时起手；
 * - 敌人之间与玩家身体之间互相推开（`ai/Separation`），不再重叠成一坨。
 */
import { StateMachine } from '../engine/StateMachine.js';
import { hasUsableMove } from '../combat/EnemyMoves.js';

/** 承诺态：进入后由自己的计时推进，外部判定不得改判 */
const COMMITTED = new Set(['windup', 'strike', 'recover']);

/** 优先级从高到低：命中即选中，后面的分支不再参与 */
const PRIORITY = [
  ['stagger', (e) => e.staggerTimer > 0],
  ['return', (e) => e.sense.returning],
  // 追击跑到本招的"甜点位"才停：停在最远招的够得着边缘上，招式表里其余的招就永远轮不到
  ['pursue', (e) => e.sense.alerted && e.sense.dist > e.holdRange],
  ['windup', (e, ctx) => ctx.canStrike],
  ['orbit', (e) => e.sense.alerted],
  ['idle', () => true],
];

/**
 * 进攻资格：已仇恨 + 当前距离有招式够用 + 冷却结束 + **抢到围攻名额**。
 * 距离用 `hasUsableMove` 这枚无随机 predicate，与起手时的选招共用同一套距离规则，
 * 不会出现"抢到坑却选不出招"的空挥。`claim` 自带续期，等待中的敌人每帧调它不重复占坑。
 */
export function tryClaimStrikeSlot(enemy, squad) {
  if (!enemy.canAttack || enemy.sense.alerted !== true) return false;
  if (!hasUsableMove(enemy, enemy.sense.dist, enemy.aimDot())) return false;
  if (enemy.attackCooldown > 0) return false;
  return squad.claim(enemy);
}

export function resolveEnemyState(enemy, ctx) {
  if (!enemy.canAttack) return 'idle';
  for (const [name, guard] of PRIORITY) {
    if (guard(enemy, ctx)) return name;
  }
  return 'idle';
}

const STATES = {
  /** 无目标：站定；不可攻击的训练木桩保留原来"慢慢转身"的摆设感 */
  idle: {
    update(owner, sm, dt) {
      if (!owner.canAttack) owner.faceSpin(dt);
      owner.setWish(0, 0);
    },
  },

  /** 归位：走回出生点，路上把进攻名额让给同伴 */
  return: {
    enter(owner) {
      owner.squad?.release(owner);
    },
    update(owner, sm, dt) {
      const dx = owner.spawnPoint.x - owner.position.x;
      const dz = owner.spawnPoint.z - owner.position.z;
      const len = Math.hypot(dx, dz);
      if (len < owner.ai.returnArrive) {
        owner.sense.returning = false;
        owner.sense.clear();
        owner.setWish(0, 0);
        return;
      }
      const v = owner.speed * owner.ai.returnSpeed;
      owner.setWish((dx / len) * v, (dz / len) * v);
      owner.facePoint(owner.spawnPoint, dt);
    },
  },

  /** 追击：朝目标推进，分离推力在外层叠加 */
  pursue: {
    update(owner, sm, dt, ctx) {
      const t = ctx.target;
      const dx = t.x - owner.position.x;
      const dz = t.z - owner.position.z;
      const len = Math.hypot(dx, dz) || 1;
      owner.setWish((dx / len) * owner.speed, (dz / len) * owner.speed);
      owner.facePoint(t, dt);
    },
  },

  /** 外圈等待：已在攻击距离内但没抢到名额，保持间距绕行，不添乱也不闲着 */
  orbit: {
    update(owner, sm, dt, ctx) {
      const t = ctx.target;
      const dx = t.x - owner.position.x;
      const dz = t.z - owner.position.z;
      const len = Math.hypot(dx, dz) || 1;
      // 径向符号朝向目标：远了进、近了退。写成反号会把外圈等待变成"撞进玩家怀里"。
      const keep = owner.holdRange * owner.ai.orbitKeep;
      const raw = (len - keep) * 2.2;
      const radial = Math.max(-owner.speed, Math.min(owner.speed, raw));
      const nx = dx / len;
      const nz = dz / len;
      // 切向按各自身上的固定手性绕圈，避免整群同向叠成一条线
      const tang = owner.orbitSide * owner.speed * owner.ai.orbitTurn;
      owner.setWish(nx * radial - nz * tang, nz * radial + nx * tang);
      owner.facePoint(t, dt);
    },
  },

  /** 前摇：进入这一帧才选招（随机数只取一次），预警三件套按时长分级 */
  windup: {
    enter(owner) {
      owner.beginMove();
      owner.showTelegraph();
    },
    update(owner, sm, dt, ctx) {
      owner.pulseTelegraph(sm.time, dt);
      // 预警期间只做"慢速修正"：站着不动不会被晃一眼打空，横移仍能溜出锥面。
      // 完全不修正会让分离推力把敌人挤偏而必然打空，全速修正则预警等于假动作。
      owner.facePoint(ctx.target, dt, owner.ai.aimFollowRate);
      if (sm.time < owner.windupNow) return;
      sm.change('strike');
      owner.landStrike(ctx);
    },
    exit(owner) {
      owner.clearTelegraph();
    },
  },

  /** 收招：伤害已经落地，这段是"打完还在原地"的代价；突进型招式在这里真的向前冲 */
  strike: {
    enter(owner) {
      // 防御招的整个命中段都是"举着盾"：预警圈不收起，玩家才看得清现在砍上去是白费。
      // 普通招不重开（windup.exit 已经收掉了）。
      if (owner.activeMove?.guard) owner.showTelegraph();
    },
    exit(owner) {
      owner.clearTelegraph();
    },
    update(owner, sm, dt) {
      const move = owner.activeMove;
      if (move?.travel === 'lunge') {
        const f = owner.facingDir();
        owner.setWish(f.x * move.travelSpeed, f.z * move.travelSpeed);
      } else {
        owner.setWish(0, 0);
      }
      if (sm.time < owner.strikeDur()) return;
      if (owner.comboLeft > 1) {
        sm.change('windup');                      // 连段：不换人、不交名额，下一段前摇自己收尾
        return;
      }
      if (owner.activeMove) owner.attackCooldown = owner.activeMove.cooldown;
      sm.change('recover');
    },
  },

  /** 后撤：交还名额让排队的人上来，同时给自己留出被反击的窗口 */
  recover: {
    enter(owner) {
      owner.squad?.release(owner);
    },
    update(owner, sm, dt, ctx) {
      const t = ctx.target;
      const dx = owner.position.x - t.x;
      const dz = owner.position.z - t.z;
      const len = Math.hypot(dx, dz) || 1;
      const back = owner.activeMove?.backoff ?? owner.ai.recoverBackoff;
      owner.setWish((dx / len) * owner.speed * back, (dz / len) * owner.speed * back);
      // 承诺态自己收尾：外部 resolve 在 recover 期间不改判
      if (sm.time >= owner.recoverDur()) {
        owner.endMove();
        sm.change('idle');
      }
    },
  },

  /** 硬直：架势打满或弹反成功，什么也做不了 */
  stagger: {
    enter(owner) {
      owner.squad?.release(owner);
      owner.clearTelegraph();
      owner.endMove();                             // 被打断的连段不欠账：站起来重新选招
    },
    update(owner, sm, dt) {
      owner.setWish(0, 0);
      owner.wobble(dt, 20, 0.08);
    },
    exit(owner) {
      owner.upright();
    },
  },
};

export function createEnemyFSM(enemy) {
  const sm = new StateMachine(enemy, STATES, 'idle');
  sm.isCommitted = () => COMMITTED.has(sm.current);
  sm.resolve = (ctx) => {
    // 承诺态由自己的计时推进；期间外部判定一律不改判
    if (sm.isCommitted()) return;
    const next = resolveEnemyState(enemy, ctx);
    if (next !== sm.current) sm.change(next);
  };
  return sm;
}
