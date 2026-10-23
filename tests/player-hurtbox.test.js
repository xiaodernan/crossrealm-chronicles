import { describe, it, expect, beforeAll } from 'vitest';
import {
  installWindowShim, run, until, duel, spawn, makeManager, makePlayerRef, NEVER_LEAVES,
} from './helpers/enemyHarness.js';
import { createHurtbox, pickPart } from '../src/combat/Hurtbox.js';
import { hitSuffix, isGuarded, resolveHit } from '../src/combat/Resolution.js';
import { ENEMY_MOVES, GUARD, PARTS } from '../src/content/tuning.js';

beforeAll(installWindowShim);

/**
 * 玩家作为"有部位的目标" + 敌人的正面格挡。
 *
 * 两件事共用同一批只读接口（`hurtbox` / `hurtBaseY()` / `facingYaw()` / `isGuarding()`）：
 * 过去敌人打玩家只看平面距离 —— 跳起来、站高台都照样被横扫扫中，闪避没有竖直维度；
 * 而所有敌人都是"站着挨打"，玩家的招式除了部位之外没有第二种解法。
 */

const sweepBand = () => ENEMY_MOVES.sweep.band;

describe('玩家也是分部位的目标', () => {
  it('低段横扫扫中腿、中段突刺打躯干、高段重劈砸头', () => {
    const legs = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
    run(legs.m, 1.2, 1 / 60, legs.player, legs.ref);
    expect(legs.ref.parts.map((p) => p?.id)).toEqual(['legs']);

    const torso = duel({ moves: ['thrust'], ai: NEVER_LEAVES });
    run(torso.m, 1.2, 1 / 60, torso.player, torso.ref);
    expect(torso.ref.parts[0].id).toBe('torso');

    const head = duel({ moves: ['cleave'], ai: NEVER_LEAVES });
    run(head.m, 1.6, 1 / 60, head.player, head.ref);
    expect(head.ref.parts[0].id).toBe('head');
  });

  it('跳起来躲得开横扫，躲不开从头顶劈下来的重劈', () => {
    // 前摇是承诺态：先让敌人起手，再把玩家抬到跳跃顶点（M1 的 apex = 2.0 米）
    const low = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
    run(low.m, 0.6, 1 / 60, low.player, low.ref);
    expect(low.e.state).toBe('windup');
    low.ref.y = 2.0;
    run(low.m, 0.5, 1 / 60, low.player, low.ref);
    expect(low.e.state).toBe('strike');            // 这一刀仍然挥完
    expect(low.ref.hits).toHaveLength(0);          // 但从头顶掠过

    const high = duel({ moves: ['cleave'], ai: NEVER_LEAVES });
    run(high.m, 0.9, 1 / 60, high.player, high.ref);
    high.ref.y = 2.0;
    run(high.m, 0.5, 1 / 60, high.player, high.ref);
    expect(high.ref.hits).toHaveLength(1);
    expect(high.ref.parts[0].id).toBe('legs');     // 人在半空，砸中的是下盘
  });

  it('落差大到五米时，近战招式一刀也落不下来', () => {
    for (const id of ['sweep', 'cleave']) {
      const { m, player, ref } = duel({ moves: [id], ai: NEVER_LEAVES });
      ref.y = 5;
      run(m, 2.2, 1 / 60, player, ref);
      expect(ref.hits, id).toHaveLength(0);
    }
  });

  it('容差是按目标档位取的：同一记横扫、同一高度，士兵擦得到、玩家已经躲开', () => {
    const box = (type) => ({ hurtbox: createHurtbox(type), hurtBaseY: () => 1.6 });
    // 玩家的 0.35 米容差是给"跳跃/高台该真躲得开"留的；敌人的 0.9 米是免得悬浮单位免疫
    expect(pickPart(box('soldier'), 0, sweepBand())).toBeTruthy();
    expect(pickPart(box('player'), 0, sweepBand())).toBeNull();
  });

  it('玩家与敌人共用同一张部位表， incoming 伤害按同一套倍率算', () => {
    const ref = makePlayerRef();
    const legs = pickPart(ref.combat, 0, sweepBand());
    expect(legs.mult).toBe(PARTS.legs.mult);
    expect(resolveHit({
      base: 10, target: ref.combat, part: legs, side: 'enemy', rng: () => 0.99,
    }).damage).toBe(Math.round(10 * PARTS.legs.mult));

    const head = ref.combat.hurtbox.segments.find((s) => s.id === 'head');
    expect(resolveHit({
      base: 10, target: ref.combat, part: head, side: 'enemy', rng: () => 0.99,
    }).damage).toBe(Math.round(10 * PARTS.head.mult));
  });
});

describe('敌人「格挡」：举着盾的那一段', () => {
  /** 按**本招**的时序推进，而不是写死秒数：调参改的是数字，不该改出一片假失败 */
  const toState = (m, player, ref, e, state, seconds = 4) => {
    const ok = until(m, seconds, 1 / 60, player, ref, () => e.state === state);
    expect(ok, `进入 ${state}`).toBe(true);
  };

  it('只有防御招的命中段算举盾，前摇与收招都不算', () => {
    const g = ENEMY_MOVES.guard;
    const { m, player, ref, e } = duel({ type: 'soldier', moves: ['guard'], ai: NEVER_LEAVES });
    expect(e.isGuarding()).toBe(false);
    toState(m, player, ref, e, 'windup');
    expect(e.isGuarding()).toBe(false);            // 盾还没举起来，这一段砍上去是全额
    toState(m, player, ref, e, 'strike');
    expect(e.isGuarding()).toBe(true);
    run(m, g.strike - 0.2, 1 / 60, player, ref);
    expect(e.isGuarding()).toBe(true);             // 举盾的整段都算，不是起手那一帧
    run(m, 0.4, 1 / 60, player, ref);
    expect(e.state).toBe('recover');
    expect(e.isGuarding()).toBe(false);            // 收招才是绕后与猛攻的回报
  });

  it('防御招的命中段不打玩家：那段时间是它的代价，不是又一次出手', () => {
    const { m, player, ref } = duel({ type: 'soldier', moves: ['guard'], ai: NEVER_LEAVES });
    run(m, 3.0, 1 / 60, player, ref);
    expect(ref.hits).toHaveLength(0);
  });

  it('被打进硬直立刻丢盾：格挡不是免死金牌', () => {
    const { m, player, ref, e } = duel({ type: 'soldier', moves: ['guard'], ai: NEVER_LEAVES });
    toState(m, player, ref, e, 'strike');
    expect(e.isGuarding()).toBe(true);
    e.forceStagger(1.0);
    expect(e.isGuarding()).toBe(false);
    expect(e.state).toBe('stagger');
  });

  it('只有正面弧内挡得住：背后与侧面照算，重合时谈不上正面', () => {
    const at = (x, z) => ({ x, z });
    const shielded = (yaw, p) => isGuarded(
      { position: at(0, 0), facingYaw: () => yaw, isGuarding: () => true }, at(p[0], p[1])
    );
    expect(shielded(0, [0, 3])).toBe(true);         // 正前（yaw=0 朝向 +Z）
    expect(shielded(0, [0, -3])).toBe(false);       // 背后
    expect(shielded(0, [3, 0])).toBe(false);        // 正侧面：dot=0，未过阈值
    expect(shielded(0, [3, 3])).toBe(true);         // 斜前方 45°：dot≈0.71
    expect(shielded(0, [0, 0])).toBe(false);        // 与出手者重合
    expect(isGuarded({ position: at(0, 0), facingYaw: () => 0 }, at(0, 3))).toBe(false);
    expect(isGuarded(null, at(0, 3))).toBe(false);  // 环境伤害没有目标可问
  });

  it('减免只乘一次，且部位与格挡复合成立', () => {
    const target = {
      getDefense: () => 0, getResist: () => 0, isStaggered: () => false,
    };
    const torso = createHurtbox('soldier').segments.find((s) => s.id === 'torso');
    const plain = resolveHit({ base: 100, posture: 100, target, rng: () => 0.99 });
    // 躯干是"不乘部位"的基准：与完全不给分段的结算必须一模一样
    expect(resolveHit({ base: 100, posture: 100, target, part: torso, rng: () => 0.99 }).damage)
      .toBe(plain.damage);
    const guarded = resolveHit({
      base: 100, posture: 100, target, guard: true, rng: () => 0.99,
    });
    expect(guarded.damage).toBe(Math.round(100 * GUARD.mult));
    expect(guarded.posture).toBe(Math.round(100 * GUARD.posture));
    expect(guarded.blocked).toBe(true);
    expect(plain.blocked).toBe(false);
    expect(guarded.damage).toBeLessThan(plain.damage);
    // 盾后仍是"打头更疼"：减免按最后一步乘，不与部位互相抵消
    const head = createHurtbox('soldier').segments.find((s) => s.id === 'head');
    expect(resolveHit({
      base: 100, target, part: head, guard: true, rng: () => 0.99,
    }).damage).toBe(Math.round(100 * head.mult * GUARD.mult));
  });

  it('飘字把"为什么这么少"写在数字旁边', () => {
    expect(hitSuffix({ blocked: true })).toBe('格挡');
    // W-D2 切片41：part.label 存的是文案键（PARTS.head.label），hitSuffix 负责展开
    expect(hitSuffix({ blocked: true, part: { label: 'part_label_head' }, crit: true })).toBe('格挡弱点会心');
  });

  it('举盾要占住进攻名额：整段防御期间这只敌人不再出手', () => {
    // 占坑是防御招的真实代价：那段时间它既不打人也不让位，同伴因此才轮不到它这一坑
    const g = ENEMY_MOVES.guard;
    const { m, player, ref, e } = duel({ type: 'soldier', moves: ['guard'], ai: NEVER_LEAVES });
    toState(m, player, ref, e, 'windup');
    expect(m.squad.busy).toBe(1);
    toState(m, player, ref, e, 'strike');
    expect(m.squad.busy).toBe(1);                  // 举着盾的这一整段仍然占着
    run(m, g.strike * 0.6, 1 / 60, player, ref);
    expect(m.squad.busy).toBe(1);
    expect(ref.hits).toHaveLength(0);              // 占坑的这段时间一次血也不掉
    run(m, g.strike * 0.6, 1 / 60, player, ref);   // 走完命中段
    expect(e.state).toBe('recover');
    expect(e.attackCooldown).toBeGreaterThan(0);   // 走完才交冷却，期间不是一次空转
    expect(m.squad.busy).toBe(0);                  // 收招让位
  });
});

describe('招式表的竖直维度', () => {
  it('每一招的近战形态都给出打击带，且低段招真的能被跳掉', () => {
    const standing = { hurtbox: createHurtbox('player'), hurtBaseY: () => 0 };
    const airborne = { hurtbox: createHurtbox('player'), hurtBaseY: () => 2.0 };
    let low = 0;
    let melee = 0;
    for (const [id, m] of Object.entries(ENEMY_MOVES)) {
      // 弹体、举盾、召唤与裂隙都不经过"玩家身上的打击带"：前两类当场不打人，弹体那一击
      // 由弹体自己判，裂隙的伤害走 `GroundHazards` 的按段结算（那条路不递 part，
      // 见证见 `enemy-field-moves.test.js`）—— 给它们配 band 等于配一个没人读的格子
      if (m.ranged || m.guard || m.summon || m.hazard) continue;
      melee++;
      expect(m.band, id).toBeTruthy();
      expect(pickPart(standing, 0, m.band), `${id} 该打到站着的玩家`).toBeTruthy();
      if (pickPart(airborne, 0, m.band) === null) low++;
    }
    // 至少有一招低到能跳过去、也至少有一招高到跳了也没用：全低或全高都等于没有这个维度。
    // 上界跟**近战招总数**比，不写死一个数：那一格写死的日子，表每加一招它就会在某个切片里
    // 翻面成"全低也算通过"（W-B7 切片2 加第七条近战招时正是这么红的）—— 它要判的是"有人高"，
    // 而这个命题只在"与全体比"的形状下才成立
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(melee);
  });

  it('持盾的两类敌人才有格挡，构装体与无人机没有手', () => {
    expect(spawn(makeManager(), { type: 'soldier' }).moves.some((m) => m.guard)).toBe(true);
    expect(spawn(makeManager(), { type: 'elite' }).moves.some((m) => m.guard)).toBe(true);
    for (const type of ['golem', 'drone', 'dummy']) {
      expect(spawn(makeManager(), { type }).moves.some((m) => m.guard), type).toBe(false);
    }
  });
});
