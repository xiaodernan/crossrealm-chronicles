/**
 * 场地红圈危险区（W-A6 切片1，B5 第一档）。
 *
 * 这条用例钉住四件运行期不会报错的事：
 * 1. **前摇不说谎**：圈画到多大，伤害就覆盖到多大。旧实现画的是判定范围的四倍，
 *    玩家按圈走位反而会挨打 —— 那是"看不懂在躲什么"的直接来源。
 * 2. **圈与施法者解耦**：圈一旦许诺出去，施法者被拉开、被传送都不该让伤害凭空消失；
 *    反过来，主人倒地时还没落下的圈必须撤掉（死后从坟里砸人）。
 * 3. **一击定音**：同一次砸地只扣一次血，余像期间不再判伤。
 * 4. **网格按峰值复用**：连放六个圈只该借出一块圆盘，不是一招一个。
 *
 * 时间一律喂 `dt`，与主循环同构；不碰渲染器。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GroundHazards } from '../src/combat/GroundHazards.js';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import { Boss } from '../src/combat/Boss.js';
import {
  installWindowShim, makeWorld, makeScene, makePlayerRef, makeManager, spawn, v, until,
} from './helpers/enemyHarness.js';

const { bossSlam } = GROUND_HAZARD;
const realRandom = Math.random;

const sys = () => new GroundHazards(makeScene(), makeWorld());

/** 放一个标准的砸地圈，圆心在原点 */
const slamAt = (h, over = {}) => h.spawn({
  x: 0, z: 0, owner: null,
  radius: bossSlam.radius, telegraph: bossSlam.telegraph,
  damage: bossSlam.damage, color: bossSlam.color, ...over,
});

/** 按 dt 推进 seconds 秒 */
const tick = (h, seconds, dt, pos, ref) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) h.update(dt, pos, ref);
};

/** 只推进管理器，玩家位置由调用方握着 */
const tickMgr = (m, seconds, player, ref) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) m.update(1 / 60, player, ref, null, null);
};

beforeAll(() => {
  installWindowShim();
  // Boss 的出手选择里有 Math.random：用例要的是确定的那一条路径
  Math.random = () => 0.99;
});

afterAll(() => {
  Math.random = realRandom;
});

describe('危险区生命周期', () => {
  it('前摇期间只画圈，不伤人', () => {
    const h = sys();
    slamAt(h);
    const ref = makePlayerRef();
    tick(h, bossSlam.telegraph - 0.1, 1 / 60, v(0, 0), ref);
    expect(ref.hits).toEqual([]);
    expect(h.count()).toBe(1);
  });

  it('前摇走完时结算一次，余像期间不再重复扣血', () => {
    const h = sys();
    const it = slamAt(h);
    const ref = makePlayerRef();
    tick(h, bossSlam.telegraph, 1 / 60, v(0, 0), ref);
    expect(it.done).toBe(true);
    expect(ref.hits).toEqual([bossSlam.damage]);
    tick(h, 3, 1 / 60, v(0, 0), ref);
    expect(ref.hits).toEqual([bossSlam.damage]);
    expect(h.count()).toBe(0);   // 余像走完，圈自己收场
  });

  it('圈外不伤人，圈内才结算（只看水平距离）', () => {
    const out = sys();
    const ref = makePlayerRef();
    slamAt(out);
    tick(out, bossSlam.telegraph + 0.1, 1 / 60, v(bossSlam.radius + 0.5, 0), ref);
    expect(ref.hits).toEqual([]);

    const inside = sys();
    const near = makePlayerRef();
    slamAt(inside);
    tick(inside, bossSlam.telegraph + 0.1, 1 / 60, v(0, bossSlam.radius - 0.5), near);
    expect(near.hits).toEqual([bossSlam.damage]);
  });

  it('玩家的无敌帧照样吞掉这一次砸地', () => {
    const h = sys();
    slamAt(h);
    const ref = makePlayerRef();
    ref.invulnerable = true;
    tick(h, bossSlam.telegraph + 0.1, 1 / 60, v(0, 0), ref);
    expect(ref.hits).toEqual([]);
  });

  it('圈最终长到判定半径，前摇里从不越过它（预警必须诚实）', () => {
    const h = sys();
    const it = slamAt(h);
    const ref = makePlayerRef();
    let max = 0;
    for (let i = 0; i < 600 && !it.done; i++) {
      h.update(1 / 60, v(99, 99), ref);
      if (!it.done) max = Math.max(max, it.disc.scale.x);
    }
    // 单位圆盘（外半径 1 米）缩放到真实半径：scale 就是"圈画到几米"
    expect(it.disc.geometry.parameters.radius).toBe(1);
    expect(max).toBeLessThan(bossSlam.radius);
    expect(it.disc.scale.x).toBeCloseTo(bossSlam.radius, 6);
  });

  it('施法者离场后圈照样落地：伤害认的是圈，不是谁还站着', () => {
    const h = sys();
    const owner = { name: 'casting' };
    slamAt(h, { owner });
    const ref = makePlayerRef();
    h.update(0.1, v(0, 0), ref);
    owner.gone = true;              // 施法者被打死、被传送走，与圈无关
    tick(h, bossSlam.telegraph, 1 / 60, v(0, 0), ref);
    expect(ref.hits).toEqual([bossSlam.damage]);
  });

  it('cancelFor 只撤还没落下的圈，已落下的不管', () => {
    const h = sys();
    const owner = {};
    const landed = slamAt(h);
    const ref = makePlayerRef();
    tick(h, bossSlam.telegraph + 0.05, 1 / 60, v(99, 99), ref);
    expect(landed.done).toBe(true);

    const pending = slamAt(h, { owner });
    h.update(0.1, v(0, 0), ref);
    h.cancelFor(owner);
    expect(pending.done).toBe(true);
    expect(pending.cancelled).toBe(true);
    tick(h, bossSlam.telegraph + 0.5, 1 / 60, v(0, 0), ref);
    expect(ref.hits).toEqual([]);   // 主人倒地后不许补刀
    expect(landed.cancelled).toBe(false);
    expect(h.count()).toBe(0);
  });

  it('圆盘按峰值复用，不是一招一个', () => {
    const h = sys();
    for (let i = 0; i < 6; i++) {
      slamAt(h);
      tick(h, bossSlam.telegraph + 1, 1 / 60, v(99, 99), makePlayerRef());
    }
    expect(h.count()).toBe(0);
    expect(h.pooled()).toBe(1);     // 六个圈只借出过一块网格
  });

  it('回收后的圆盘摘出分组、不再可见', () => {
    const h = sys();
    const it = slamAt(h);
    tick(h, bossSlam.telegraph + 1, 1 / 60, v(99, 99), makePlayerRef());
    expect(it.disc.visible).toBe(false);
    expect(it.disc.parent).toBe(null);
  });
});

describe('危险区计时与主循环同构', () => {
  it('不同 dt 步长下都会落地，且只落地一次（B39 的延续）', () => {
    const at = (dt) => {
      const h = sys();
      const ref = makePlayerRef();
      slamAt(h);
      tick(h, bossSlam.telegraph + 0.5, dt, v(0, 0), ref);
      return ref.hits;
    };
    expect(at(1 / 30)).toEqual([bossSlam.damage]);
    expect(at(1 / 144)).toEqual([bossSlam.damage]);
  });

  it('update() 里不分配对象（热路径零分配）', () => {
    const code = readFileSync(join(process.cwd(), 'src/combat/GroundHazards.js'), 'utf8');
    const body = code.match(/^ {2}update\(dt[\s\S]*?\n {2}\}/m)?.[0];
    expect(body, '没扫到 update() 本体，门禁自己失效了').toBeTruthy();
    expect(body).not.toMatch(/\bnew\s+[A-Z(]/);
  });
});

describe('Boss 砸地接线', () => {
  const slamBoss = () => {
    const m = makeManager();
    const boss = m.spawnBoss({ bossId: 'test-warden', x: 0, z: -3, respawn: false });
    boss.alive = true;
    boss.phase = 2;
    return { m, boss, player: v(0, 0), ref: makePlayerRef() };
  };

  it('起手把圈交给危险区系统，Boss 自己不再存一份网格', () => {
    const { m, boss } = slamBoss();
    expect(boss.startSlamTelegraph()).toBe(true);
    expect(m.hazards.count()).toBe(1);
    expect(boss.state).toBe('slam');
    expect(boss._slamRing).toBeUndefined();
    expect(boss.slamTelegraph).toBeUndefined();
  });

  it('圈落地后 Boss 回到 idle 并进入收招冷却', () => {
    const { m, boss, player, ref } = slamBoss();
    boss.startSlamTelegraph();
    expect(until(m, 3, 1 / 60, player, ref, () => boss.state !== 'slam')).toBe(true);
    expect(ref.hits).toEqual([bossSlam.damage]);
    expect(boss.slamHazard).toBe(null);
    expect(boss.attackCooldown).toBeCloseTo(bossSlam.recover, 1);
  });

  it('在前摇里走出圈外：这一拍就是白给', () => {
    const { m, boss, ref } = slamBoss();
    const player = v(0, 0);
    boss.startSlamTelegraph();
    let landed = false;
    for (let i = 0; i < 240 && !landed; i++) {
      const h = boss.slamHazard;
      if (h && !h.done) player.z += 0.15;   // 危险区不跟随施法者，也不跟随玩家
      m.update(1 / 60, player, ref, null, null);
      landed = boss.state !== 'slam';
    }
    expect(landed).toBe(true);
    expect(ref.hits).toEqual([]);
  });

  it('Boss 在前摇里被打死：圈跟着撤，不会事后补一刀', () => {
    const { m, boss, player, ref } = slamBoss();
    boss.startSlamTelegraph();
    tickMgr(m, 0.4, player, ref);
    expect(m.hazards.count()).toBe(1);
    boss.die();
    expect(m.hazards.count()).toBe(0);
    tickMgr(m, bossSlam.telegraph + 0.5, player, ref);
    expect(ref.hits).toEqual([]);
  });

  it('没有危险区系统时不许起手（否则 slam 态永不落地）', () => {
    const lone = new Boss(makeScene(), makeWorld(), { x: 0, z: 0 });
    expect(lone.hazards).toBe(null);
    expect(lone.startSlamTelegraph()).toBe(false);
    expect(lone.state).not.toBe('slam');
  });

  it('普通敌人不碰这套生命周期（招式 aoe 仍走脚下判定）', () => {
    const m = makeManager();
    const player = v(0, 0);
    const ref = makePlayerRef();
    spawn(m, { x: 1.2, z: 0, type: 'golem', moves: ['slam'], ai: { memory: 9999 } });
    tickMgr(m, 3, player, ref);
    expect(m.hazards.count()).toBe(0);
  });
});
