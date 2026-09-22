/**
 * M2 第六切片：敌人招式表。
 *
 * 这一组用例守的是"数据说出口、状态机照做"这条线：招式表必须自洽（数据段），
 * 选招要可复现又不能整群雷同；距离/朝向/连段/突进/远程/范围各自的落地都要钉住；
 * 预警必须如实描述这一招的真实落点。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { AI, ENEMY_MOVES, ENEMY_MOVE_SETS } from '../src/content/tuning.js';
import { isAttackMove, moveHits, moveRange, moveUsable, pickMove, seededRng } from '../src/combat/EnemyMoves.js';
import {
  installWindowShim, makePlayerRef, makeProjectileStub, makeManager, v, run, until,
  NEVER_LEAVES, spawn, encircle, duel,
} from './helpers/enemyHarness.js';

beforeAll(installWindowShim);

const DT = 1 / 60;

/** 被代码真正读取的字段：多加一个没人读的数字，第一条用例会挡住 */
const REQUIRED = ['windup', 'strike', 'recover', 'cooldown', 'damage', 'weight'];

describe('敌人招式表数据', () => {
  it('每类实战敌人 ≥3 招，且每招的时序字段齐全自洽', () => {
    const combatTypes = Object.keys(ENEMY_MOVE_SETS).filter((t) => t !== 'dummy');
    expect(combatTypes.length).toBeGreaterThanOrEqual(5);
    for (const type of combatTypes) {
      const ids = ENEMY_MOVE_SETS[type];
      expect(ids.length, type).toBeGreaterThanOrEqual(3);
      for (const id of ids) {
        const m = ENEMY_MOVES[id];
        expect(m, `${type}/${id}`).toBeTruthy();
        for (const key of REQUIRED) expect(typeof m[key], `${id}.${key}`).toBe('number');
        expect(m.windup, `${id}.windup`).toBeGreaterThan(0);      // 前摇为 0 就没有弹反窗口
        expect(m.cooldown, `${id}.cooldown`).toBeGreaterThan(0);  // 0 冷却等于无限连打
        // 只有锥形招谈朝向；全向/范围/远程一律 -2
        if (m.aoe || m.ranged) expect(m.cone, `${id}.cone`).toBe(-2);
        else expect(typeof m.cone, `${id}.cone`).toBe('number');
        expect(typeof m.telegraph?.color, `${id}.telegraph`).toBe('number');
        // 竖直打击带：会落到玩家身上的招必须给出区间，否则"跳起来"这件事在竖直方向不存在。
        // 反过来，弹体与不伤人的招（防御/召唤）不该有 band —— 一个没人读的数字只是骗表格
        if (m.ranged || m.guard || m.summon) {
          expect(m.band, `${id}.band`).toBeUndefined();
          if (m.guard || m.summon) expect(m.damage, `${id}.damage`).toBe(0);   // 这两类都不打人
        } else {
          expect(Array.isArray(m.band), `${id}.band`).toBe(true);
          expect(m.band[1], `${id}.band`).toBeGreaterThan(m.band[0]);
        }
      }
    }
    expect(ENEMY_MOVE_SETS.dummy).toEqual([]);                    // 训练木桩不出招
  });

  it('按 type 装载招式，spawn config 的 moves 能整表覆盖成关卡特例', () => {
    const m = makeManager();
    expect(spawn(m, { type: 'golem' }).moves.map((x) => x.name)).toEqual(['重劈', '崩地', '横扫']);
    expect(spawn(m, { type: 'unknown-type' }).moves.map((x) => x.name)).toEqual(['横扫', '突刺', '重劈']);
    expect(spawn(m, { type: 'golem', moves: ['dive'] }).moves).toHaveLength(1);
    // 内联招式只覆盖写到的字段，其余落在默认招式上：特例不必重抄整表
    const inline = spawn(m, { type: 'soldier', moves: [{ windup: 2, reach: 5 }] }).moves[0];
    expect(inline).toMatchObject({ windup: 2, reach: 5, strike: ENEMY_MOVES.sweep.strike });
  });

  it('选招随机数按身份播种：同一枚种子重放出同一串招', () => {
    const e = spawn(makeManager(), { x: 1.8, z: 0 });
    const seq = (rng) => Array.from({ length: 30 }, () => pickMove(e, 1.8, 1, rng)?.name);
    expect(seq(seededRng(1234))).toEqual(seq(seededRng(1234)));
    expect(new Set(seq(seededRng(1234))).size).toBeGreaterThan(1);
  });

  it('同一群敌人不会整齐地出同一招', () => {
    const { m, player, ref, list } = encircle(6);
    const used = new Set();
    for (let i = 0; i < 600; i++) {
      run(m, DT, DT, player, ref);
      for (const e of list) if (e.activeMove) used.add(e.activeMove.name);
    }
    expect(used.size).toBeGreaterThan(1);
  });

  it('每招的落点各算各的：容差、范围圈、射程都写在招里', () => {
    const e = spawn(makeManager(), { attackRange: 2.2 });
    expect(moveRange(e, ENEMY_MOVES.sweep)).toBeCloseTo(3.0);
    expect(moveRange(e, ENEMY_MOVES.thrust)).toBeCloseTo(3.5);
    expect(moveRange(e, ENEMY_MOVES.slam)).toBeCloseTo(3.6);      // 至少覆盖自己的危险圈
    expect(moveRange(e, ENEMY_MOVES.shot)).toBe(ENEMY_MOVES.shot.range);

    expect(moveHits(e, ENEMY_MOVES.sweep, 2.9, 1)).toBe(true);
    expect(moveHits(e, ENEMY_MOVES.sweep, 3.1, 1)).toBe(false);
    expect(moveHits(e, ENEMY_MOVES.thrust, 3.4, -1)).toBe(false); // 锥形：没面向就不算
    expect(moveHits(e, ENEMY_MOVES.cleave, 2.5, -1)).toBe(true);  // 全向
    expect(moveHits(e, ENEMY_MOVES.slam, 3.5, -1)).toBe(true);
    expect(moveHits(e, ENEMY_MOVES.slam, 3.7, -1)).toBe(false);
  });

  it('站住的距离是"可出招最多"的那个边界，不是勉强够得着的最外沿', () => {
    // 停在最长招的落点上时只有 1 招可用，整张招式表退化成 1 招（实测过）
    // 只数会打人的招：防御招的距离是为"贴脸举盾"服务的，不该反过来挑站位
    const usable = (e, d) => e.moves.filter((m) => isAttackMove(m) && moveUsable(e, m, d, 2)).length;
    const m = makeManager();
    const soldier = spawn(m, { type: 'soldier' });
    expect(usable(soldier, soldier.holdRange)).toBe(3);           // 三招同时够用
    expect(soldier.holdRange).toBeLessThanOrEqual(3.0);           // 不会跑到横扫够不着的地方
    expect(usable(soldier, soldier.threatRange)).toBe(1);         // 修前的站位：整张表退化成一根突刺
    // 防御招的存在不能改变站位：加进招式表前后 holdRange 必须是同一个数
    const noGuard = spawn(m, { type: 'soldier', moves: ['sweep', 'thrust', 'cleave'] });
    expect(soldier.holdRange).toBe(noGuard.holdRange);
    expect(soldier.threatRange).toBe(noGuard.threatRange);
    const drone = spawn(m, { type: 'drone' });
    // 无人机既不是贴脸也不是顶放风筝：停在弹体与俯冲同时可出的中段
    expect(usable(drone, drone.holdRange)).toBe(2);
    expect(drone.holdRange).toBeGreaterThan(ENEMY_MOVES.shot.minDist);
    expect(drone.holdRange).toBeLessThan(ENEMY_MOVES.shot.range);
  });

  it('围攻整程里短射程的招也真的会出：站位没把招式表压成一招', () => {
    const { m, player, ref, list } = encircle(4);
    const used = new Set();
    for (let i = 0; i < 900; i++) {
      run(m, DT, DT, player, ref);
      for (const e of list) if (e.state === 'windup') used.add(e.activeMove.name);
    }
    expect([...used]).toEqual(expect.arrayContaining(['横扫', '突刺']));
  });
});

describe('招式落地判定', () => {
  /** 先面向玩家抢到起手，再在命中帧之前把朝向拧开：验证落地真的按锥形重判 */
  const commitThenTurn = (moveId, dist, yaw) => {
    const m = makeManager();
    const ref = makePlayerRef();
    const e = spawn(m, { x: dist, z: 0, moves: [moveId], ai: NEVER_LEAVES });
    e.sense.update(DT, v(0, 0), null);
    e.mesh.rotation.y = -Math.PI / 2;                             // 正对玩家
    e.beginMove();
    const picked = e.activeMove?.name ?? null;
    e.mesh.rotation.y = yaw;
    const hit = e.landStrike({ target: v(0, 0), playerRef: ref });
    return { e, ref, hit, picked };
  };

  it('锥形招在命中帧按朝向重判：正面命中、背后打空', () => {
    const front = commitThenTurn('thrust', 3, -Math.PI / 2);
    expect(front.picked).toBe('突刺');
    expect(front.hit).toBe(true);
    expect(front.ref.hits).toEqual([8]);                          // 基础 10 × 突刺 0.8
    const behind = commitThenTurn('thrust', 3, Math.PI / 2);
    expect(behind.picked).toBe('突刺');
    expect(behind.hit).toBe(false);
    expect(behind.ref.hits).toHaveLength(0);
  });

  it('远程招交出一枚弹体，不在命中帧直接扣血；贴脸时宁可不用', () => {
    const projectiles = makeProjectileStub();
    const m = makeManager({ projectiles });
    const ref = makePlayerRef();
    const e = spawn(m, { type: 'drone', x: 8, z: 0, ai: NEVER_LEAVES });
    e.sense.update(DT, v(0, 0), null);
    e.beginMove();
    // 8 米只有虚能弹够得着（俯冲 3.8 / 横扫 3.0），所以这一招必然是弹体
    expect(e.activeMove.name).toBe('虚能弹');
    e.landStrike({ target: v(0, 0), playerRef: ref, projectiles });
    expect(projectiles.fired).toHaveLength(1);
    expect(projectiles.fired[0].damage).toBe(9);                  // 10 × 0.9
    expect(projectiles.fired[0].speed).toBe(ENEMY_MOVES.shot.ranged.speed);
    expect(ref.hits).toHaveLength(0);
    expect(pickMove(e, 2, 1, seededRng(7)).name).not.toBe('虚能弹'); // minDist 之下不许糊脸
  });

  it('场景没有弹体管理器时远程招不报错，也不会绕过弹体直接扣血', () => {
    const { m, player, ref, e } = duel({ type: 'drone', x: 8, moves: ['shot'], ai: NEVER_LEAVES });
    expect(until(m, 2, DT, player, ref, () => e.state === 'windup')).toBe(true);
    expect(e.activeMove.name).toBe('虚能弹');
    const ctx = { target: player, playerRef: ref };             // 没有 projectiles 字段
    expect(e.landStrike(ctx)).toBe(false);
    expect(ref.hits).toHaveLength(0);
  });
});

describe('招式进行时', () => {
  it('前摇与命中段扎住脚跟：同伴的推挤不能把起手者挤离原位', () => {
    const { m, player, ref, e } = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
    // 重叠出生的旁观者一直在推人，但自己不进攻，因此整程只有 e 会进入承诺态
    const pusher = spawn(m, { x: 1.8, z: 0.2, canAttack: false });
    expect(until(m, 2, DT, player, ref, () => e.state === 'windup')).toBe(true);
    const before = e.position.clone();
    run(m, 0.3, DT, player, ref);
    expect(e.state).toBe('windup');
    expect(e.position.distanceTo(before)).toBe(0);
    expect(pusher.distanceTo(v(1.8, 0.2))).toBeGreaterThan(0.3);  // 同一股推力确实作用在旁观者身上
  });

  it('突进型招式在命中段真的前冲，普通招原地挥完', () => {
    const lunging = duel({ moves: ['thrust'], ai: NEVER_LEAVES });
    expect(until(lunging.m, 2, DT, lunging.player, lunging.ref, () => lunging.e.state === 'strike')).toBe(true);
    const at = lunging.e.position.clone();
    run(lunging.m, 0.15, DT, lunging.player, lunging.ref);
    expect(at.distanceTo(lunging.e.position)).toBeGreaterThan(0.4);

    const planted = duel({ moves: ['sweep'], ai: NEVER_LEAVES });
    expect(until(planted.m, 2, DT, planted.player, planted.ref, () => planted.e.state === 'strike')).toBe(true);
    const at2 = planted.e.position.clone();
    run(planted.m, 0.15, DT, planted.player, planted.ref);
    expect(planted.e.position.distanceTo(at2)).toBe(0);
  });

  it('连段是一次占坑多段命中：首段完整预警、后续段压缩、整段只交一次冷却', () => {
    const { m, player, ref, e } = duel({ x: 3, moves: ['flurry'], ai: NEVER_LEAVES });
    const first = ENEMY_MOVES.flurry;
    expect(until(m, 2, DT, player, ref, () => e.state === 'windup')).toBe(true);
    expect(e.windupNow).toBe(first.windup);
    const windups = new Set([e.windupNow]);
    let maxBusy = 0;
    for (let i = 0; i < Math.round(2.2 / DT); i++) {
      run(m, DT, DT, player, ref);
      maxBusy = Math.max(maxBusy, m.squad.busy);
      if (e.state === 'windup') windups.add(e.windupNow);
    }
    expect(ref.hits).toEqual([6, 6, 6]);                          // 0.55 × 10 三段
    expect([...windups]).toEqual([first.windup, first.comboWindup]);
    expect(maxBusy).toBe(1);                                      // 全程没把坑让出去，也没多占
    expect(e.attackCooldown).toBeGreaterThan(0);
    expect(e.attackCooldown).toBeLessThanOrEqual(first.cooldown);
  });

  it('连段中途被弹反就断在这里：清零当前招，不欠半段账', () => {
    const { m, player, ref, e } = duel({ x: 3, moves: ['flurry'], ai: NEVER_LEAVES });
    run(m, 0.9, DT, player, ref);
    expect(ref.hits.length).toBeGreaterThan(0);
    e.forceStagger(2);
    expect(e.activeMove).toBeNull();
    expect(e.comboLeft).toBe(0);
    expect(m.squad.busy).toBe(0);
    const hits = ref.hits.length;
    run(m, 2.0, DT, player, ref);
    expect(ref.hits).toHaveLength(hits);                          // 硬直期间一刀不落
  });

  it('收招后清空当前招式：下一轮起手重新选招，不会沿用上一招的距离容差', () => {
    const { m, player, ref, e } = duel({ x: 1.8, moves: ['sweep'], ai: NEVER_LEAVES });
    run(m, 0.5, DT, player, ref);
    expect(e.activeMove).not.toBeNull();
    expect(until(m, 2, DT, player, ref, () => e.state === 'recover')).toBe(true);
    run(m, 0.6, DT, player, ref);                                 // 走完收招
    expect(e.activeMove).toBeNull();
    expect(e.comboLeft).toBe(0);
    expect(e.windupNow).toBe(0);
  });
});

describe('预警如实描述这一招', () => {
  const inWindup = (moveId, x = 1.8) => {
    const { m, player, ref, e } = duel({ moves: [moveId], x, ai: NEVER_LEAVES });
    const ok = until(m, 3, DT, player, ref, () => e.state === 'windup');
    expect(ok).toBe(true);
    return { m, player, ref, e };
  };

  it('只有长前摇的招才有头顶警示，快招只留地面圈', () => {
    const slow = inWindup('sweep');
    expect(slow.e.teleParts.warn.visible).toBe(true);
    const fast = inWindup('thrust');
    expect(fast.e.teleParts.warn.visible).toBe(false);
    expect(AI.telegraphMarkWindup).toBeGreaterThan(fast.e.windupNow);
    expect(AI.telegraphMarkWindup).toBeLessThanOrEqual(slow.e.windupNow);
  });

  it('预警圈长到本招的真实落点，颜色按招式区分', () => {
    expect(inWindup('sweep').e.teleRadius()).toBeCloseTo(3.0, 6);
    expect(inWindup('thrust').e.teleRadius()).toBeCloseTo(3.5, 6);
    expect(inWindup('slam', 3).e.teleRadius()).toBe(ENEMY_MOVES.slam.aoe);
    const shot = inWindup('shot', 8);
    expect(shot.e.teleRadius()).toBe(shot.e.attackRange);         // 远程只给自己一圈起手提示

    expect(inWindup('cleave').e.teleParts.ring.material.color.getHex()).toBe(ENEMY_MOVES.cleave.telegraph.color);
    expect(inWindup('thrust').e.teleParts.ring.material.color.getHex()).toBe(ENEMY_MOVES.thrust.telegraph.color);
  });

  it('够不着的距离不会起手：近战兵在 8 米只会追，不抢坑放空气势', () => {
    const { m, player, ref, e } = duel({ x: 8, ai: NEVER_LEAVES });
    run(m, 0.5, DT, player, ref);
    expect(e.state).toBe('pursue');
    expect(m.squad.busy).toBe(0);
    expect(ref.hits).toHaveLength(0);
    expect(Math.max(...e.moves.map((mv) => moveRange(e, mv)))).toBeLessThan(8);
  });
});
