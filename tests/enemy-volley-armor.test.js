/**
 * 扇形齐射与霸体 —— W-B7 切片4 的两种招式形状。
 *
 * 切片3 立了三条形状（落点圈 / 推人 / 范围连段），这一片补的两条换了个层次：
 * - `volley`：**投放量**变了（一次多枚），落点是纯几何算出来的扇面 —— 单发只要横移半步
 *   就出线，扇面逼玩家真的走出那个角。
 * - `onslaught`：**规则**变了（这一招不吃硬直、不可弹反）—— 表里其余每一招都能被
 *   "架势打满"打断，于是"破防 → 处决"是万能解；霸体把那个万能解按住一秒多。
 *
 * 两件事都必须用**真 AI 跑帧**来验，纯函数断言只能证明几何/判据本身对：
 * `fanTargets` 算得再漂亮，若没有一条招真的把它接上，玩家一发也见不到。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { BODY_PLANS, ENEMY_DEFENSE, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { fanTargets } from '../src/combat/EnemyMoves.js';
import { ProjectileManager } from '../src/combat/ProjectileManager.js';
import {
  installWindowShim, makeScene, makeManager, makePlayerRef, v, until, spawn, NEVER_LEAVES,
} from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const DT = 1 / 60;

describe('fanTargets：扇面落点是纯几何、无随机（W-B7 切片4）', () => {
  const from = { x: 0, z: 0 };
  const target = { x: 10, z: 0 };

  it('count 缺省或 1 时原样回目标自己 —— 单发招的旧行为逐字不变', () => {
    expect(fanTargets(from, target, {})).toEqual([target]);
    expect(fanTargets(from, target, { count: 1, spreadDeg: 90 })).toEqual([target]);
    // `shot` 的 real 配置：这就是"虚能弹还是原来那一发"的证据
    expect(fanTargets(from, target, ENEMY_MOVES.shot.ranged)).toEqual([target]);
  });

  it('三发时中点在轴上、左右两发关于轴严格对称', () => {
    const pts = fanTargets(from, target, { count: 3, spreadDeg: 22 });
    expect(pts).toHaveLength(3);
    expect(pts[1].x).toBeCloseTo(target.x, 10);
    expect(pts[1].z).toBeCloseTo(target.z, 10);
    // 轴是 +x，法线是 (0,-1)：上下两发等距反号
    expect(pts[0].z).toBeCloseTo(-pts[2].z, 10);
    expect(pts[0].x).toBeCloseTo(pts[2].x, 10);
    expect(pts[0].z).toBeLessThan(0);
  });

  it('摊开的横向偏移 = tan(spreadDeg) × 当前距离 —— 角度写的是半角', () => {
    const half = Math.tan((22 * Math.PI) / 180) * 10;
    const pts = fanTargets(from, target, { count: 3, spreadDeg: 22 });
    expect(Math.abs(pts[2].z - target.z)).toBeCloseTo(half, 10);
    // 半角就是"最外那一发与轴的夹角"，换个距离照样成立（角度不绑距离）
    const far = fanTargets(from, { x: 25, z: 0 }, { count: 3, spreadDeg: 22 });
    const deg = (Math.atan2(Math.abs(far[2].z), 25) * 180) / Math.PI;
    expect(deg).toBeCloseTo(22, 8);
  });

  it('两发时落在 ±半角上（没有中点这一格），与目标重合时退化成单发', () => {
    const pts = fanTargets(from, target, { count: 2, spreadDeg: 30 });
    expect(pts).toHaveLength(2);
    const half = Math.tan((30 * Math.PI) / 180) * 10;
    expect(Math.abs(pts[0].z)).toBeCloseTo(half, 10);
    expect(pts[0].z).toBeCloseTo(-pts[1].z, 10);
    expect(fanTargets({ x: 5, z: 5 }, { x: 5, z: 5 }, { count: 3, spreadDeg: 22 }))
      .toEqual([{ x: 5, z: 5 }]);
  });

  it('轴跟着"出手者→目标"转向：从侧面来的齐射，摊开方向也跟着转 90 度', () => {
    const pts = fanTargets({ x: 0, z: 0 }, { x: 0, z: 10 }, { count: 3, spreadDeg: 22 });
    expect(pts[0].x).toBeCloseTo(-pts[2].x, 10);
    expect(pts[0].x).toBeGreaterThan(0);   // 轴是 +z，法线是 (+1, 0)
    expect(pts[1]).toEqual({ x: 0, z: 10 });
  });
});

describe('volley（位面咒师）：真 AI 真的把三枚交出去，而单发招照旧（W-B7 切片4）', () => {
  it('真招式表下起手一次即交出 3 枚、三发落点互不相同、中点落在玩家身上', () => {
    const projectiles = new ProjectileManager(makeScene(), null);
    const m = makeManager({ projectiles });
    const player = v(0, 0);
    const ref = makePlayerRef();
    const e = spawn(m, {
      type: 'hexer', x: 12, z: 0, moves: ['volley'],
      ai: NEVER_LEAVES, hp: 9999, posture: 9999, damage: 20,
    });
    const fired = until(m, 8, DT, player, ref, () => projectiles.count() >= 3);
    expect(fired, '8 秒里扇形齐射一次都没轮到（要么够不着、要么选不中）').toBe(true);
    expect(projectiles.count(), '一次起手只该交出三枚').toBe(3);
    const spec = ENEMY_MOVES.volley.ranged;
    const damage = Math.round(20 * ENEMY_MOVES.volley.damage);
    const xs = projectiles.projectiles.map((p) => p.target.x);
    const zs = projectiles.projectiles.map((p) => p.target.z);
    expect(new Set(xs.map((x, i) => `${x.toFixed(3)},${zs[i].toFixed(3)}`)).size, '三发落点重合就不是扇面').toBe(3);
    // 轴是 -x（敌人 12 → 玩家 0），法线是 (0, +1)：落点全在 x = 0 这条线上左右摊开
    for (const x of xs) expect(x).toBeCloseTo(0, 8);
    expect(zs.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 8);
    for (const p of projectiles.projectiles) {
      expect(p.damage).toBe(damage);
      expect(p.speed).toBe(spec.speed);
      expect(p.material.color.getHex()).toBe(spec.color);
    }
    expect(e.activeMove?.name).toBe('扇形齐射');
  });

  it('单发招（shot）在真 AI 手里仍然只交出一枚 —— 扇面没有把老招一起改掉', () => {
    const projectiles = new ProjectileManager(makeScene(), null);
    const m = makeManager({ projectiles });
    const player = v(0, 0);
    const ref = makePlayerRef();
    spawn(m, { type: 'hexer', x: 10, z: 0, moves: ['shot'], ai: NEVER_LEAVES, hp: 9999, posture: 9999 });
    const fired = until(m, 8, DT, player, ref, () => projectiles.count() >= 1);
    expect(fired).toBe(true);
    expect(projectiles.count()).toBe(1);
  });
});

describe('onslaught（破阵重兵）：霸体只护出手段（W-B7 切片4）', () => {
  const 起手 = () => {
    const m = makeManager();
    const player = v(0, 0);
    const ref = makePlayerRef();
    const e = spawn(m, {
      type: 'juggernaut', x: 3, z: 0, moves: ['onslaught'],
      ai: NEVER_LEAVES, hp: 9999, posture: 60,
    });
    const ok = until(m, 8, DT, player, ref,
      () => e.state === 'windup' && e.activeMove?.name === '破阵冲撞');
    return { m, player, ref, e, ok };
  };

  it('出手段里架势打满也不倒：forceStagger 被拒、架势停在满格、状态不动', () => {
    const { e, ok } = 起手();
    expect(ok, '8 秒里没起手破阵冲撞').toBe(true);
    expect(e.isUnstoppableNow()).toBe(true);
    const stateBefore = e.fsm.current;
    expect(e.forceStagger(1)).toBe(false);
    expect(e.isStaggered()).toBe(false);
    e.takeDamage(1, 999);                       // 架势一口气打满
    expect(e.posture).toBe(e.maxPosture);
    expect(e.isStaggered(), '霸体期间不该进 stagger').toBe(false);
    expect(e.fsm.current).toBe(stateBefore);
  });

  it('霸体招不给弹反窗口，而普通重招照旧给 —— 排除是"只认招上的旗"而不是"整类敌人免疫"', () => {
    const { m, player, ref, e, ok } = 起手();
    expect(ok).toBe(true);
    const passed = until(m, 3, DT, player, ref,
      () => e.state === 'windup' && e.stateTimer > e.windupNow * e.ai.parryRatio + 0.01);
    expect(passed, '前摇没过弹反窗口的起点，这条就在拿空窗口说事').toBe(true);
    expect(e.isParriable()).toBe(false);

    const m2 = makeManager();
    const player2 = v(0, 0);
    const ref2 = makePlayerRef();
    const e2 = spawn(m2, {
      type: 'juggernaut', x: 3, z: 0, moves: ['cleave'],
      ai: NEVER_LEAVES, hp: 9999, posture: 9999,
    });
    const ok2 = until(m2, 8, DT, player2, ref2, () => e2.state === 'windup' && e2.activeMove?.name === '重劈');
    expect(ok2).toBe(true);
    const passed2 = until(m2, 3, DT, player2, ref2,
      () => e2.state === 'windup' && e2.stateTimer > e2.windupNow * e2.ai.parryRatio + 0.01);
    expect(passed2).toBe(true);
    expect(e2.isUnstoppableNow()).toBe(false);
    expect(e2.isParriable(), '同一类敌人的普通重招必须照旧可弹').toBe(true);
  });

  it('走完收招就能按下去 —— 霸体护的是这一招，不是这条命', () => {
    const { m, player, ref, e, ok } = 起手();
    expect(ok).toBe(true);
    e.takeDamage(1, 999);
    const left = until(m, 8, DT, player, ref, () => !e.isUnstoppableNow());
    expect(left, '霸体一直没结束，玩家就没有那个窗口').toBe(true);
    expect(e.forceStagger(1)).toBe(true);
    expect(e.isStaggered()).toBe(true);
    // 攒满的那笔账确实被记着：再挨一下就倒（不是"清零后重新攒"）
    expect(e.posture).toBe(0);
  });

  it('霸体招的字段自证：只有它带这一格，且它带的是"出手段不可打断"而不是无敌', () => {
    expect(ENEMY_MOVES.onslaught.unstoppable).toBe(true);
    expect(ENEMY_MOVES.onslaught.band, '霸体不等于无敌：竖直打击带照旧管用').toBeTruthy();
    expect(ENEMY_MOVES.onslaught.travel).toBe('lunge');
    const 带霸体的 = Object.entries(ENEMY_MOVES).filter(([, mv]) => mv.unstoppable).map(([id]) => id);
    expect(带霸体的).toEqual(['onslaught']);
  });
});

describe('W-B7 切片4：破阵重兵的外形数据（剪影要能与其他重甲区分）', () => {
  it('比同场的深渊骑士更大更硬，且两者是不同的一格', () => {
    expect(BODY_PLANS.juggernaut.scale).toBeGreaterThan(BODY_PLANS.knight.scale);
    expect(ENEMY_DEFENSE.juggernaut).toBeGreaterThan(ENEMY_DEFENSE.knight);
    expect(ENEMY_MOVE_SETS.juggernaut).toContain('onslaught');
    // 咒师是轻装：比它要指挥的重兵脆得多，也比构装体重甲轻得多
    expect(BODY_PLANS.hexer.scale).toBeLessThan(BODY_PLANS.juggernaut.scale);
    expect(ENEMY_DEFENSE.hexer).toBeLessThan(ENEMY_DEFENSE.golem);
    expect(ENEMY_MOVE_SETS.hexer).toContain('volley');
  });
});
