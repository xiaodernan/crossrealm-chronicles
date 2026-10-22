/**
 * 追踪落点（第五种场地招）的**接线**用例：不测危险区本身（归 `homing-hazard.test.js`），
 * 测"时线执政官在真打的第三阶段里会不会真的把它放出来、放出来之后会不会跟着玩家走"。
 *
 * 为什么单独要这一条：单元用例证明"给了 `track` 的圈会追人"，静态门禁证明"表里有人登记了
 * `homing`"——但两者合起来仍不等于"这只 Boss 打起来真会放"。中间隔着 `Boss.updateArenaCasts`
 * 的阶段闸 / 冷却 / 距离闸三关，任何一关接错，圈永远不出现而单测全绿。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import {
  installWindowShim, makeManager, v,
} from './helpers/enemyHarness.js';
import { makePlayer } from './helpers/playerHarness.js';

const { homingStrike } = GROUND_HAZARD;
const realRandom = Math.random;

/** 与 `boss-phase-entrance.test.js` 同构的舞台：Boss 摆原点、玩家在 `dist` 米外 */
const stage = (spawn, bossId, dist) => {
  const m = makeManager();
  const boss = m[spawn]({ bossId, x: 0, z: 0, respawn: false });
  boss.speed = 0;
  // ref 用完整玩家：P3 的时停域会调 `applyTimeScale`，`makePlayerRef` 的轻量桩没有这条
  return { m, boss, player: v(dist, 0), ref: makePlayer() };
};
const tick = (s, frames = 1, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) s.m.update(dt, s.player, s.ref, null, null);
};
/** 从危险区里挑出"追踪"的那一枚（唯一带 trackRatio 的） */
const homingOf = (s) => s.m.hazards._items.find((it) => it.trackRatio > 0);

beforeAll(() => { installWindowShim(); Math.random = () => 0.99; });
afterAll(() => { Math.random = realRandom; });

describe('时线执政官第三阶段真的会放追踪落点', () => {
  it('进 P3 后第一个机会闸就铺出追踪圈（phase / 冷却 / 距离三关都通）', () => {
    const s = stage('spawnVoidBoss', 'void-chronarch', 10);
    tick(s);                                   // 出生帧先跑一帧（入场钩子要"跑过一帧"才管事）
    s.boss.takeDamage(500);                    // 750 → 250：P2
    s.boss.takeDamage(100);                    // 250 → 150：P3（freeze 入场招当帧铺）
    expect(homingOf(s), 'P3 转档那一帧不该已经有追踪圈（它是机会闸，不是入场招）').toBeFalsy();
    tick(s, 1);                                // 机会闸：冷却 0、玩家 10m < range 20 → 当帧铺
    const it = homingOf(s);
    expect(it, 'P3 之后第一帧应铺出追踪落点').toBeTruthy();
    expect(it.radius).toBe(homingStrike.radius);
    expect(it.disc.material.color.getHex()).toBe(homingStrike.color);
  });

  it('放出来的那一枚真跟着玩家走（不是"画在脚下就钉死"）', () => {
    const s = stage('spawnVoidBoss', 'void-chronarch', 10);
    tick(s);
    s.boss.takeDamage(500);
    s.boss.takeDamage(100);
    tick(s, 1);
    const it = homingOf(s);
    expect(it.x).toBeCloseTo(10, 5);           // 起手在玩家此刻脚下
    s.player = v(20, 0);                       // 玩家横移 10 米
    tick(s, 1);
    expect(it.x, '追踪段内圆心应跟到新位置').toBeCloseTo(20, 5);
  });

  it('离开距离闸就不铺：30 米外只落 freeze、不落 homing', () => {
    const s = stage('spawnVoidBoss', 'void-chronarch', 30);
    tick(s);
    s.boss.takeDamage(500);
    s.boss.takeDamage(100);
    tick(s, 1);
    expect(homingOf(s), '30m ≥ range 20，homing 的距离闸该拦住它').toBeFalsy();
  });
});
