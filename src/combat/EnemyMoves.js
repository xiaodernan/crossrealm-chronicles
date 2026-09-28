/**
 * 敌人招式的读取与选取 —— 数值在 `content/tuning.js`，这里只有纯逻辑。
 *
 * 一招的"够不够得着"是围攻名额的前提：旧实现只比 `attackRange`，所以远程单位
 * 永远抢不到出手资格（它会一路跑到脸上才打），而慢速大范围招又会在隔着半个场地
 * 时起手。判定与状态机都调这里的函数，保证同一条距离规则不会被写两遍。
 *
 * 选取用**按身份播种的伪随机**：同一只敌人每次运行选招顺序一致（回归用例可断言），
 * 同一群敌人又不会整齐地出同一招。随机数只在真正起手那一帧取一次，
 * 资格判定是无随机 predicate，否则选招结果会随帧率变化。
 */
import { ENEMY_MOVES, ENEMY_MOVE_SETS } from '../content/tuning.js';

const FALLBACK_MOVE = 'sweep';
const FALLBACK_SET = 'default';

/** mulberry32：小而确定，够用；不需要密码学强度 */
export function seededRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 招式表解析：`config.moves` 给 id 数组（复用全局表）或内联对象（关卡特例，
 * 缺省字段落在 `sweep` 上），都不改动全局表本身。
 */
export function resolveMoveSet(type, override) {
  if (override) {
    return override.map((m) =>
      typeof m === 'string' ? { ...ENEMY_MOVES[m] } : { ...ENEMY_MOVES[FALLBACK_MOVE], ...m });
  }
  const ids = ENEMY_MOVE_SETS[type] ?? ENEMY_MOVE_SETS[FALLBACK_SET];
  return ids.map((id) => ({ ...ENEMY_MOVES[id] }));
}

/**
 * 这招会打人吗：防御招与召唤招只负责"占名额 + 改变自己/场上局面"，
 * 不参与距离、站位与追击判定 —— 那两处问的是"站在哪里能把伤害铺开"，
 * 为了一面盾或一次召唤放弃覆盖面更宽的落点是本末倒置。
 */
export function isAttackMove(move) {
  return !move.guard && !move.summon;
}

/** 这招能打到的最远距离：远程用自己的射程，范围招至少覆盖自己的预警圈 */
export function moveRange(enemy, move) {
  // 裂隙类："够得着"是**圈能丢多远**（`range`），与刀长无关 —— 命中段判的是圈，不是近战那一刀
  if (move.hazard) return move.range ?? 8;
  // 相位招的"够得着"是它能闪多远（`blink`），不是刀有多长 —— 落地之后那一刀由 `landRange` 判
  if (move.phase) return move.blink ?? 10;
  if (move.ranged) return move.range ?? 12;
  const melee = enemy.attackRange + (move.reach ?? 0);
  return move.aoe ? Math.max(move.aoe, melee) : melee;
}

/**
 * 命中段真正判距离用的范围。
 *
 * 与 `moveRange` 分开写是为了相位招：它**起手**时够得着 11 米（闪得过去），**落地之后**那一刀
 * 仍按近战算（`attackRange + reach`）。一个数兼两份工作的话，两种情况里必有一种是错的 ——
 * 而错的那一种恰好是最难发现的那种：闪不动（贴墙、落点被挡）时，敌人隔着八米判你命中。
 */
export function landRange(enemy, move) {
  if (move.phase && !move.aoe) return enemy.attackRange + (move.reach ?? 0);
  return moveRange(enemy, move);
}

/**
 * 距离与朝向是否允许使用这招：太远的够不着，太近的不许放风筝招（免得弹体糊脸），
 * 锥形招还要求此刻已经面向目标——抢名额与选招用同一枚 predicate，
 * 不会出现"抢到坑却选不出招"的空挥。
 *
 * 召唤招多一道闸：`summonQuota` 是管理器每帧盖在敌人身上的"你现在还能放出几只"。
 * 名额不够时这招**直接从可选池里消失**，而不是抢到坑后空唱一段 —— 后者会让玩家
 * 看到一次完整预警却什么也没发生，等于预警说谎。
 */
export function moveUsable(enemy, move, dist, aimDot = 2) {
  if (move.summon && !(enemy.summonQuota > 0)) return false;
  if (dist > moveRange(enemy, move)) return false;
  if (move.minDist !== undefined && dist < move.minDist) return false;
  if (!move.aoe && !move.ranged && move.cone > -1 && aimDot < move.cone) return false;
  return true;
}

/**
 * 有没有任何一招现在就能用 —— 围攻名额的门槛，不取随机数。
 * 这里**要**算上防御招：举盾同样占一个出手名额（否则盾兵永远等不到自己那一坑），
 * 而站位与追击仍然只看会打人的招（`holdRangeOf` / `threatRangeOf`），两套判定各自服务各的事。
 */
export function hasUsableMove(enemy, dist, aimDot) {
  return enemy.moves.some((m) => moveUsable(enemy, m, dist, aimDot));
}

/**
 * 敌人想站住的距离——**「同时可出的招最多」的那个边界**，不是"勉强够得着"的距离。
 *
 * 早期写法是"有近战招就贴到 attackRange，否则停在射程外圈"，追击却按最远招的
 * `threatRange` 收尾：于是整队兵停在 3.4 米这种只有最长那招够得着的地方，
 * 招式表里其余的招永远不会被选中（实测 8 只敌人 15 秒里 19 次突刺、1 次横扫）。
 * 现在候选点取各招的外沿与弹体招的中段，取可用招数最多者，一样多时站得远些
 * （远程单位不必贴脸，纯弹体单位也不会顶到射程最外沿放风筝）。
 */
export function holdRangeOf(enemy) {
  const moves = enemy.moves.filter(isAttackMove);
  if (!moves.length) return enemy.attackRange;
  const candidates = [enemy.attackRange];
  for (const m of moves) {
    candidates.push(moveRange(enemy, m));
    if (m.minDist !== undefined) {
      const r = moveRange(enemy, m);
      candidates.push(m.minDist + Math.max(0, r - m.minDist) * 0.5);
    }
  }
  let best = enemy.attackRange;
  let bestScore = -1;
  for (const d of candidates) {
    // 朝向项给满分：站姿只谈距离，锥形能不能命中由抢名额那一刻再判
    let score = 0;
    for (const m of moves) if (moveUsable(enemy, m, d, 2)) score++;
    if (score > bestScore || (score === bestScore && d > best)) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/** 所有招式里最远的那一个：决定追击要跑到哪里才停 */
export function threatRangeOf(enemy) {
  const attacks = enemy.moves.filter(isAttackMove);
  if (!attacks.length) return enemy.attackRange;
  return Math.max(...attacks.map((m) => moveRange(enemy, m)));
}

/**
 * 起手那一帧选招：按 `weight` 加权随机，只在**当前距离与朝向够用**的招里选。
 * 返回 null 表示没有合适招式（调用方应退回 orbit，而不是空挥）。
 */
export function pickMove(enemy, dist, aimDot, rng) {
  const pool = enemy.moves.filter((m) => moveUsable(enemy, m, dist, aimDot));
  let total = 0;
  for (const m of pool) total += m.weight ?? 1;
  if (total <= 0) return null;
  let r = rng() * total;
  for (const m of pool) {
    r -= m.weight ?? 1;
    if (r <= 0) return m;
  }
  return pool[pool.length - 1];
}

/** 命中这一帧的横向判定：范围招不看朝向，其余要求在 `cone` 之内 */
export function moveHits(enemy, move, dist, forwardDot) {
  if (move.aoe) return dist <= move.aoe;
  if (dist > landRange(enemy, move)) return false;
  if (move.cone === undefined || move.cone <= -1) return true;
  return forwardDot >= move.cone;
}

/**
 * 扇形齐射的落点（W-B7 切片4）—— 纯几何、**无随机**。
 *
 * `ranged.count` 缺省或 1 时原样回一个点（旧招逐字不变）；>1 时以"出手者→目标"为轴，
 * 把 count 个落点在**当前距离**上按 `spreadDeg`（半角，度）摊开，中点落在目标身上、
 * 左右对称。
 *
 * 为什么给的是"落点"而不是"发射角"：`ProjectileManager` 的弹体是**持续朝 target 收**的。
 * 落点分开 = 几条不同的进场线，散出去再从不同角度收拢，那才是扇面齐射该有的读法；
 * 给同一枚弹体一个固定发射角只会让几发一路平行、永不交汇，玩家只要横移一点就全躲了。
 *
 * 距离为 0（与目标重合）时只回目标自己：没有轴就没有扇面。
 */
export function fanTargets(from, target, ranged) {
  const count = Math.max(1, Math.floor(ranged?.count ?? 1));
  if (count === 1) return [target];
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return [target];
  // 弹道轴的单位向量与它的左手法线：摊开发生在法线方向上
  const ax = dx / len;
  const az = dz / len;
  const nx = -az;
  const nz = ax;
  const half = Math.tan((((ranged.spreadDeg ?? 0) * Math.PI) / 180)) * len;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = (i - (count - 1) / 2) / ((count - 1) / 2);   // -1 … +1，中点 0
    out.push({ x: target.x + nx * half * t, z: target.z + nz * half * t });
  }
  return out;
}
