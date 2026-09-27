/**
 * M2 第十切片：敌人「召唤」招与召唤物的生命周期。
 *
 * 招式表的原型补齐了（横扫/突刺/重劈/崩地/三连刺/虚能弹/俯冲/格挡/召唤），
 * 但"能变出敌人"这一类招的真正难点不在招式而在账本：
 * **名额**（不许无限铺场）、**归属**（召唤者死了仆从要散）、
 * **销毁**（仆从的网格与几何必须有明确的释放路径，副本切换同样要清）。
 * 这个文件按这三条钉。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ENEMY_MOVES, ENEMY_MOVE_SETS, SUMMON } from '../src/content/tuning.js';
import { isAttackMove, moveUsable } from '../src/combat/EnemyMoves.js';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import {
  installWindowShim, makeWorld, v, run, until, NEVER_LEAVES, spawn,
} from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const DT = 1 / 60;

/** 数得清 add/remove 的场景：召唤物的释放路径必须能被观察到 */
const mkScene = () => ({
  added: [], removed: 0,
  add(o) { this.added.push(o); },
  remove(o) { this.removed++; this.added = this.added.filter((x) => x !== o); },
});

/** 带名额刷新的管理器：`summonQuota` 由 `EnemyManager` 每帧盖下来 */
const mkManager = () => {
  const scene = mkScene();
  const world = makeWorld();
  return { scene, world, m: new EnemyManager(scene, world, null) };
};

const liveSummons = (m) => [...m._summons].filter((s) => s.alive);
const ownedBy = (m, owner) => liveSummons(m).filter((s) => s.summoner === owner);

/** 让一只精英真的把召唤放出来：贴脸、不脱战、别让它去死 */
const summonOnce = (over = {}) => {
  const { m, scene, world } = mkManager();
  const player = v(0, 0);
  const ref = { combat: fakeCombat(), hits: [] };
  const e = spawn(m, {
    type: 'elite', x: 2.4, z: 0, moves: ['summon'], hp: 99999, posture: 99999,
    ai: { ...NEVER_LEAVES, parryRatio: 9 }, ...over,
  });
  return { m, scene, world, player, ref, e };
};

/** 召唤要走到 `landStrike`，而它读的是 playerRef.combat 这一份受击方契约 */
function fakeCombat() {
  return {
    takeDamage() {}, isInvulnerable: () => false, hurtBaseY: () => 0,
    facingYaw: () => 0, getDefense: () => 0, getResist: () => 0, isStaggered: () => false,
  };
}

const castUntil = (ctx, seconds = 12) =>
  until(ctx.m, seconds, DT, ctx.player, ctx.ref, () => ctx.m._summons.size > 0);

describe('「召唤」是一份数据，不是一段代码', () => {
  it('前摇全场最长、不伤人、没有打击带：它是"念咒"而不是"挥刀"', () => {
    const s = ENEMY_MOVES.summon;
    expect(s.windup).toBeGreaterThan(1.2);
    expect(s.damage).toBe(0);
    expect(s.band).toBeUndefined();
    expect(s.summon.type).toBeTruthy();
    expect(s.summon.count).toBeGreaterThan(0);
    expect(s.cooldown).toBeGreaterThan(6);
    // 预警自证：长前摇必然带头顶警示（`AI.telegraphMarkWindup` 那条通用规则）
    expect(s.telegraph.color).toBeTruthy();
  });

  it('只有精英会召唤（构装体与无人机没有召唤物，Boss 跑自己的脚本）', () => {
    expect(ENEMY_MOVE_SETS.elite).toContain('summon');
    for (const type of ['soldier', 'golem', 'drone', 'dummy']) {
      expect(ENEMY_MOVE_SETS[type], type).not.toContain('summon');
    }
  });

  it('不参与站位打分：加进招式表不该把精英的站位距离改掉', () => {
    expect(isAttackMove(ENEMY_MOVES.summon)).toBe(false);
    const { m } = mkManager();
    const withSummon = spawn(m, { type: 'elite' });
    const without = spawn(m, { type: 'elite', moves: ['sweep', 'flurry', 'cleave', 'guard'] });
    expect(withSummon.holdRange).toBe(without.holdRange);
    expect(withSummon.threatRange).toBe(without.threatRange);
  });

  it('没有名额时这招直接从可选池消失：不许抢了围攻名额唱空咒', () => {
    const e = { summonQuota: 0, attackRange: 2.2, moves: [] };
    expect(moveUsable(e, ENEMY_MOVES.summon, 1.5, 2)).toBe(false);
    e.summonQuota = 1;
    expect(moveUsable(e, ENEMY_MOVES.summon, 1.5, 2)).toBe(true);
    // 落点之外的召唤同样不算"可用"（它是贴着自己念的咒）
    e.summonQuota = 5;
    expect(moveUsable(e, ENEMY_MOVES.summon, 9, 2)).toBe(false);
  });
});

describe('名额与归属', () => {
  it('一次施放交出 spec.count 只仆从，且都归属到召唤者名下', () => {
    const ctx = summonOnce();
    expect(castUntil(ctx)).toBe(true);
    run(ctx.m, 0.02, DT, ctx.player, ctx.ref);
    const got = ownedBy(ctx.m, ctx.e);
    expect(got).toHaveLength(ENEMY_MOVES.summon.summon.count);
    for (const s of got) {
      expect(s.isSummon).toBe(true);
      expect(s.summoner).toBe(ctx.e);
      expect(s.respawn).toBe(false);                 // 仆从不重生，否则杀之不尽
      expect(s.maxHp).toBe(SUMMON.hp);
      expect(s.sense.alerted).toBe(true);           // 被召进的就是正在打的这场仗
      // 落在召唤者周围的环上，不叠在召唤者模型里
      const d = Math.hypot(s.position.x - ctx.e.position.x, s.position.z - ctx.e.position.z);
      expect(d).toBeGreaterThan(0.5);
    }
  });

  it('仆从彼此不重叠：同一次召唤的两只不会精确叠成一坨', () => {
    const ctx = summonOnce();
    castUntil(ctx);
    run(ctx.m, 0.02, DT, ctx.player, ctx.ref);
    const got = ownedBy(ctx.m, ctx.e);
    const d = Math.hypot(got[0].position.x - got[1].position.x, got[0].position.z - got[1].position.z);
    expect(d).toBeGreaterThan(0.2);
  });

  it('单只召唤者维持不超过 perOwner：连续召唤也不会把场铺满', () => {
    const ctx = summonOnce();
    let max = 0;
    for (let i = 0; i < 9000; i++) {
      ctx.m.update(DT, ctx.player, ctx.ref, null, null);
      max = Math.max(max, ownedBy(ctx.m, ctx.e).length);
    }
    expect(max).toBeLessThanOrEqual(SUMMON.perOwner);
    expect(max).toBeGreaterThan(0);                 // 上限为 0 的用例是假用例
  });

  it('全场总量封顶：一群召唤者一起念咒也不会把帧预算花光', () => {
    const { m } = mkManager();
    const player = v(0, 0);
    const ref = { combat: fakeCombat() };
    const owners = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      owners.push(spawn(m, {
        type: 'elite', x: Math.sin(a) * 3, z: Math.cos(a) * 3, moves: ['summon'],
        hp: 99999, posture: 99999, ai: { ...NEVER_LEAVES, parryRatio: 9 },
      }));
    }
    let max = 0;
    for (let i = 0; i < 6000; i++) {
      m.update(DT, player, ref, null, null);
      max = Math.max(max, liveSummons(m).length);
    }
    expect(max).toBeLessThanOrEqual(SUMMON.total);
    expect(max).toBeGreaterThan(0);
    expect(owners.length).toBe(6);
  });

  it('召唤者一死，仆从当场消散：玩家不必逐个追杀', () => {
    const ctx = summonOnce();
    castUntil(ctx);
    run(ctx.m, 0.02, DT, ctx.player, ctx.ref);
    const got = ownedBy(ctx.m, ctx.e);
    expect(got.length).toBeGreaterThan(0);
    const removed0 = ctx.scene.removed;
    ctx.e.die();
    ctx.m.update(DT, ctx.player, ctx.ref, null, null);
    expect(liveSummons(ctx.m)).toHaveLength(0);
    expect(ctx.m.enemies).not.toContain(got[0]);    // 真的从列表里摘掉了
    expect(ctx.scene.removed).toBeGreaterThan(removed0);   // 网格也回了场景
  });

  it('仆从自然寿命到了也消散：不放任"没人杀的敌人"永久占场', () => {
    const ctx = summonOnce();
    castUntil(ctx);
    const got = ownedBy(ctx.m, ctx.e)[0];
    expect(got).toBeTruthy();
    ctx.e.canAttack = false;                         // 只留这一只，观察它的寿命
    run(ctx.m, SUMMON.life + 0.6, DT, ctx.player, ctx.ref);
    expect(ctx.m._summons.has(got)).toBe(false);
    expect(ctx.m.enemies).not.toContain(got);
    expect(got.alive).toBe(true);                   // 消散不是"死"：不该记进击杀数
  });

  it('仆从不掉魂魄：刷召唤再刷魂不是一条正当的致富路线', () => {
    const ctx = summonOnce();
    castUntil(ctx);
    let drops = 0;
    // 替身只给生产代码真正会调的那一个口（切片2 起一次击杀走 `spawnKill`，别再留 `spawnDrop` 的形状）
    const loot = { spawnKill: () => { drops++; } };
    for (const s of ownedBy(ctx.m, ctx.e)) s.takeDamage(9999, 0);
    ctx.m.update(DT, ctx.player, ctx.ref, loot, null);
    expect(drops).toBe(0);
    // 对照：原生敌人死亡会掉
    const plain = spawn(ctx.m, { type: 'soldier', x: 8, z: 8, hp: 1, respawn: false });
    plain.takeDamage(9999, 0);
    plain._lootDropped = false;
    ctx.m.update(DT, ctx.player, ctx.ref, loot, null);
    expect(drops).toBe(1);
  });
});

describe('生成时机：绝不在迭代 enemies 的途中改数组', () => {
  it('一帧之内先跑完所有敌人，再补上这一帧召唤出来的仆从', () => {
    const ctx = summonOnce();
    let updated = 0;
    const before = ctx.m.enemies.length;
    const origUpdate = ctx.e.update.bind(ctx.e);
    ctx.e.update = (...args) => { updated++; return origUpdate(...args); };
    for (let i = 0; i < 60 && ctx.m._summons.size === 0; i++) {
      const n = ctx.m.enemies.length;
      ctx.m.update(DT, ctx.player, ctx.ref, null, null);
      if (ctx.m._summons.size > 0) {
        // 出现的那一刻：新敌人只能在循环之外被追加进来
        expect(ctx.m.enemies.length).toBeGreaterThan(n);
        break;
      }
    }
    expect(updated).toBeGreaterThan(0);
    expect(ctx.m.enemies.length).toBeGreaterThanOrEqual(before);
    expect(new Set(ctx.m.enemies).size).toBe(ctx.m.enemies.length);   // 没有重复登记
  });

  it('副本清理把所有仆从一并释放：换场景不留隐形敌人', () => {
    const ctx = summonOnce();
    castUntil(ctx);
    run(ctx.m, 0.02, DT, ctx.player, ctx.ref);
    const got = ownedBy(ctx.m, ctx.e).length;
    const n = ctx.m.enemies.length;
    const removed0 = ctx.scene.removed;
    ctx.m.clearSummons();
    expect(ctx.m._summons.size).toBe(0);
    expect(ctx.m.enemies.length).toBe(n - got);
    expect(ctx.scene.removed).toBeGreaterThan(removed0);
  });

  it('待生成的队列在清理后作废：离开副本的一帧不该再补出敌人', () => {
    const ctx = summonOnce();
    castUntil(ctx);
    ctx.m._pendingSummons.push({ owner: ctx.e, type: 'soldier', angle: 0 });
    ctx.m.clearSummons();
    expect(ctx.m._pendingSummons).toHaveLength(0);
    const n = ctx.m.enemies.length;
    ctx.m.update(DT, ctx.player, ctx.ref, null, null);
    expect(ctx.m.enemies.length).toBe(n);
  });
});

describe('与围攻名额共用一套账', () => {
  it('念咒的召唤者占着一个进攻名额，同伴因此轮得到自己', () => {
    const { m } = mkManager();
    const player = v(0, 0);
    const ref = { combat: fakeCombat() };
    const caster = spawn(m, {
      type: 'elite', x: 2.4, z: 0, moves: ['summon'], hp: 99999, posture: 99999,
      ai: { ...NEVER_LEAVES, parryRatio: 9 },
    });
    run(m, 1.2, DT, player, ref);
    expect(caster.state).toBe('windup');
    run(m, 0.3, DT, player, ref);
    // 名额被念咒者占住时，场上其余敌人不超过上限（由 Squad 保证，这里只验不炸）
    let maxBusy = 0;
    for (let i = 0; i < 600; i++) {
      m.update(DT, player, ref, null, null);
      maxBusy = Math.max(maxBusy, m.squad.busy);
    }
    expect(maxBusy).toBeLessThanOrEqual(2);
  });

  it('召唤被打进硬直就断在这里：不欠半只仆从', () => {
    const ctx = summonOnce();
    until(ctx.m, 3, DT, ctx.player, ctx.ref, () => ctx.e.state === 'windup');
    // 硬直盖过"前摇 + 命中段"的整段时间：这一招整条被打掉，而不是打出一半
    ctx.e.forceStagger(ENEMY_MOVES.summon.windup + ENEMY_MOVES.summon.strike + 1);
    run(ctx.m, ENEMY_MOVES.summon.windup + ENEMY_MOVES.summon.strike + 0.5, DT, ctx.player, ctx.ref);
    expect(ctx.m._summons.size).toBe(0);             // 打断就是没召出来
    expect(ctx.e.activeMove).toBeNull();
    expect(ctx.e.state).toBe('stagger');
  });
});
