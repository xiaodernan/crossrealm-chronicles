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
import { hasUsableMove, readyStandoffMove } from '../combat/EnemyMoves.js';

/** 承诺态：进入后由自己的计时推进，外部判定不得改判 */
const COMMITTED = new Set(['windup', 'strike', 'recover']);

/** 优先级从高到低：命中即选中，后面的分支不再参与 */
const PRIORITY = [
  ['stagger', (e) => e.staggerTimer > 0],
  ['return', (e) => e.sense.returning],
  // 追击跑到本招的"甜点位"才停：停在最远招的够得着边缘上，招式表里其余的招就永远轮不到。
  // 带站位诉求的招（`standoff`）是这条的例外：它在这个距离就够用，逼它先贴脸等于让那一招
  // 在实战里从不发生（B69：裂隙的 7 米抛掷距离，实测起手点被两招近战顶到 3.25 米）。
  // 第三条"坑里还有没有它的位置"是 #33：坑被同伴占满时往里冲换不到一次出手，
  // 只会与 `orbit` 的设定点互顶（两个控制器各全速对着同一条线）。冷却不算在这条里，见 `slotOpenFor`。
  // 第四条"刚贴过脸的要越过死区才重冲"是 #33 剩下的那一半，见 `pursueCutoff`。
  ['pursue', (e) => e.sense.alerted && e.sense.dist > pursueCutoff(e)
    && !readyStandoffMove(e, e.sense.dist, e.aimDot()) && slotOpenFor(e)],
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

/**
 * 围攻名额现在**有没有它的位置**（自己持有也算）—— 只看坑，不看冷却、距离与朝向。
 *
 * 追击与等待环的分工全靠这一格。坑被同伴占满时还一路往里冲，既挤掉持有者的位置，
 * 也与 `orbit` 的设定点互顶：`orbit` 停在 `orbitKeep × holdRange`（外圈），追击的停脚边界是
 * `holdRange`，两者之间没有任何一方认账的间隙 ⇒ 一个全速往里、一个往外推，换档每 1–2 帧一次
 * （#33，实测数字与后果写在 `AI.orbitHug` 那条注释里）。
 *
 * **冷却不算在这里**：B69 立的规矩是"手上没牌就往前压，有牌才站在原地打牌"，
 * 冷却期间停在圈外干等会把近战那半条命整条挤掉（`enemy-field-moves.test.js` 三条用例钉着）。
 * 不抖的关键因此不在追击这一侧，而在 `holdRadius` 那一格：压进来之后就**贴着**边界内侧等，
 * 而不是被外圈的设定点再推出去。
 */
export function slotOpenFor(enemy) {
  return !enemy.squad || enemy.squad.roomFor(enemy);
}

/**
 * 等待时的设定点。两个值都从 `holdRange` 乘出来，且**与追击的停脚边界同源**：
 * 有坑、又没有"想站的带"（`standoff`）就贴着甜点位等冷却走完或锥形对齐，坑被占满就退到外圈。
 * 贴着的那一档必须落在边界**内侧**（`AI.orbitHug < 1`）：写成 1 就与 `pursue` 抢同一条线，
 * 两个控制器各全速对着它，玩家看到的是敌人站在原地以 60Hz 抖 run/walk。
 *
 * 试过"没坑但人还在门内就守门口（×1）"：量下来更糟（六只贴脸 75 → 177 次往返，
 * `.tmp-20261031-s25/s11-census-after12.log`）—— 设定点落在切换线上本身就是抖源，
 * 分离推力一碰就翻页。剩下的整群残留另开一条（名额要按排队分，不是靠抢），见 §9 与 #45。
 */
function holdRadius(enemy, len) {
  const 贴着等 = slotOpenFor(enemy) && !readyStandoffMove(enemy, len, enemy.aimDot());
  return enemy.holdRange * (贴着等 ? enemy.ai.orbitHug : enemy.ai.orbitKeep);
}

/**
 * 追击这一帧要从多远的距离上才成立。
 *
 * 停脚边界（`holdRange`）与等待设定点（`holdRadius`）已经不再压在一条线上（`AI.orbitHug`），
 * 但排队的那只仍会被顶着坑的那只**推**过这条线：前摇/命中段冻结分离（`Enemy._advance` 的
 * `rooted`），它不动，另一只的向内权限却只有厘米每秒的量级 ⇒ 单阈值成了一场接力振荡，
 * 玩家看到的是每帧换一次 run/walk。这里给线加一段死区，且只对**刚在甜点位里贴过脸**的敌人有效：
 * 从远处第一次扑上来的照旧按原边界全速冲（B69 那一族"该贴脸"的行为一字不动）。
 *
 * 记账在 `createEnemyFSM` 的 `resolve` 里：贴进甜点位就置真，走出带宽才置假（迟滞，不是当帧读数）。
 * 承诺态（前摇/命中/收招）不改判，因此这一格在招式进行中冻结。
 */
function pursueCutoff(enemy) {
  return enemy.holdRange + (enemy.heldIn ? enemy.ai.pursueBand : 0);
}

export function resolveEnemyState(enemy, ctx) {
  if (!enemy.canAttack) return 'idle';
  for (const [name, guard] of PRIORITY) {
    if (guard(enemy, ctx)) return name;
  }
  return 'idle';
}

const ENEMY_STATES = {
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
      // 设定点与追击的停脚边界同出一处（`holdRadius`），两家对着同一条线互顶就是 #33。
      const keep = holdRadius(owner, len);
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
      if (owner.activeMove) {
        const baseCd = owner.activeMove.cooldown;
        // W-B7 尾巴：急速加成缩短冷却
        const hasteMult = (owner.hasteTimer > 0) ? (owner.hasteMult ?? 1.4) : 1;
        owner.attackCooldown = baseCd / hasteMult;
      }
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

/**
 * 这份名册的**读者不止本文件**：战斗门禁要判"兵有没有真走进追击/出手"，
 * 它手里那份态名清单必须是从这里数的，不是抄的 —— 抄的那份会把玩家态
 * （`attack` / `light` / `heavy` 在 `CombatController` 那边）混进敌人的词汇表里，
 * 于是那条判据永远对不上，还看起来像 AI 没出手。
 */
export const ENEMY_STATE_NAMES = Object.keys(ENEMY_STATES);

export function createEnemyFSM(enemy) {
  const sm = new StateMachine(enemy, ENEMY_STATES, 'idle');
  sm.isCommitted = () => COMMITTED.has(sm.current);
  sm.resolve = (ctx) => {
    // 承诺态由自己的计时推进；期间外部判定一律不改判
    if (sm.isCommitted()) return;
    // 死区记账（`pursueCutoff`）：**粘**的。进去过就认，直到真的走出带宽才不认。
    // 写成每帧重算（`heldIn = dist <= holdRange`）等于没有死区 —— 守线那一帧 `heldIn` 已经是 false，
    // 判据化简回 `dist > holdRange`，带宽从头到尾没参与（`.tmp-20261031-s25/s11-latch.log` 量到的就是这个）。
    if (enemy.sense.dist <= enemy.holdRange) enemy.heldIn = true;
    else if (enemy.sense.dist > enemy.holdRange + enemy.ai.pursueBand) enemy.heldIn = false;
    const next = resolveEnemyState(enemy, ctx);
    if (next !== sm.current) sm.change(next);
  };
  return sm;
}
