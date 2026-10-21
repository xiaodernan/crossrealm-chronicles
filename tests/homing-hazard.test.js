/**
 * 追踪落点（W-A6 第五种场地招）。
 *
 * 前四种（砸地 / 弹幕 / 引力井 / 时停域）都是"画下那一刻圆心就钉死，走出去就安全"。
 * 这一种反着来：圈在**前摇的前 `track` 段**贴着玩家走，之后锁死、原地落地 —— 光提前跑开
 * 没用，得看圈**不再动**了才闪。要证明的四件事：
 * 1. 跟随段内圆心确实跟着玩家走；
 * 2. `track` 段之后锁死，玩家再跑圆心不动；
 * 3. 锁定后跑开 = 不挨打、停在锁定处 = 挨打（这条区分"追踪"与"砸地"两种反应）；
 * 4. `track: 0`（不追）与砸地逐字节一致 —— 老圈子一个字不许变。
 * 接线：`GROUND_HAZARD.homingStrike.track ∈ (0,1)`、`ARENA_MOVES.homing` 指向它、
 * 且确有 Boss 在用它（否则"第五种"只是数据表里的一格）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { GroundHazards } from '../src/combat/GroundHazards.js';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import { ARENA_MOVES, BOSS_ARENA_SCRIPTS } from '../src/content/arenaScripts.js';
import { installWindowShim, makeWorld, makeScene, makePlayerRef, v } from './helpers/enemyHarness.js';

const { homingStrike } = GROUND_HAZARD;
const sys = () => new GroundHazards(makeScene(), makeWorld());
/** 放一枚追踪圈，圆心先落在原点；单测自己交数值，接线用例才读真表 */
const homingAt = (h, over = {}) => h.spawn({
  x: 0, z: 0, owner: null,
  radius: homingStrike.radius, telegraph: homingStrike.telegraph,
  damage: homingStrike.damage, color: homingStrike.color, track: homingStrike.track, ...over,
});

beforeAll(() => installWindowShim());

describe('追踪落点：前段跟随、后段锁死', () => {
  it('跟随段内圆心随玩家移动', () => {
    const h = sys();
    const it = homingAt(h, { telegraph: 1, track: 0.5 });
    const ref = makePlayerRef();
    h.update(0.25, v(10, 0), ref);          // t=0.25 < 0.5
    expect(it.x).toBe(10);
    expect(it.z).toBe(0);
    h.update(0.2, v(20, 5), ref);           // t=0.45 < 0.5
    expect(it.x).toBe(20);
    expect(it.z).toBe(5);
  });

  it('track 段之后锁死：玩家再跑，圆心不再动', () => {
    const h = sys();
    const it = homingAt(h, { telegraph: 1, track: 0.5, radius: 3, damage: 10 });
    const ref = makePlayerRef();
    h.update(0.4, v(5, 0), ref);            // t=0.4，跟到 (5,0)
    h.update(0.2, v(5, 0), ref);            // t=0.6 ≥ 0.5 → 锁定，圆心停在 (5,0)
    expect(it.x).toBe(5);
    expect(it.z).toBe(0);
    h.update(0.1, v(50, 50), ref);          // 玩家跑远，圆心仍锁在 (5,0)
    expect(it.x).toBe(5);
    expect(it.z).toBe(0);
  });

  it('锁定后跑开 = 不挨打', () => {
    const h = sys();
    homingAt(h, { telegraph: 1, track: 0.5, radius: 3, damage: 10 });
    const ref = makePlayerRef();
    h.update(0.4, v(5, 0), ref);            // 跟到 (5,0)
    h.update(0.2, v(5, 0), ref);            // t=0.6 锁定于 (5,0)
    h.update(0.4, v(100, 0), ref);          // t=1.0 落地于 (5,0)，玩家已在 (100,0)
    expect(ref.hits.length).toBe(0);
  });

  it('停在锁定处 = 挨打（追踪的意义：得看圈不再动才闪）', () => {
    const h = sys();
    homingAt(h, { telegraph: 1, track: 0.5, radius: 3, damage: 10 });
    const ref = makePlayerRef();
    h.update(0.4, v(5, 0), ref);            // 跟到 (5,0)
    h.update(0.6, v(5, 0), ref);            // t=1.0 落地于 (5,0)，玩家仍在 (5,0)
    expect(ref.hits.length).toBe(1);
  });

  it('track: 0（不追）与砸地逐字节一致：圆心纹丝不动', () => {
    const h = sys();
    const it = homingAt(h, { telegraph: 1, track: 0 });
    const ref = makePlayerRef();
    h.update(0.25, v(10, 0), ref);
    expect(it.x).toBe(0);
    expect(it.z).toBe(0);
  });
});

describe('接线：第五种真被用上，且追的比例留了躲的窗口', () => {
  it('GROUND_HAZARD.homingStrike.track ∈ (0,1)（跟满就永远打中）', () => {
    expect(homingStrike.track).toBeGreaterThan(0);
    expect(homingStrike.track).toBeLessThan(1);
  });

  it('ARENA_MOVES.homing 指向 homingStrike，且真有世界 Boss 在用它', () => {
    expect(ARENA_MOVES.homing).toBe('homingStrike');
    const users = Object.entries(BOSS_ARENA_SCRIPTS)
      .filter(([, script]) => Array.isArray(script) && script.some((e) => e.move === 'homing'))
      .map(([id]) => id);
    expect(users.length, '没有任何 Boss 用 homing —— "第五种"只是表里一格').toBeGreaterThan(0);
  });
});
