/**
 * 转阶段入场招（W-A6 切片8）：把"这一档的招牌圈"接进阶段演出 —— 转进某一档的那一帧，
 * 圈先铺好，横幅/闪白随后到（`boss-phase` 事件到达监听者时圈已经在 `_items` 里）。
 *
 * 这一档要钉住的是**同帧与闸门**，不是数值（半径/伤害归 `ground-hazard.test.js`）：
 * 1. 同帧见证：`takeDamage` 跨过 50% 的那一帧，事件派发那一刻圈已铺好 —— 这是本切片
 *    存在的意义（"先亮标题、圈下一帧才出现"就是没接对）。
 * 2. 入场绕反应闸（`chance`/`rate`/opportunity 冷却），但 `opportunity` 的 `range`
 *    空间闸**原样保留** —— 引力化身"贴身连吃两份、退开只吃弹幕"的距离博弈不许破。
 * 3. 两条既有一拍不许被入场打扰：`update` 路径转阶段当帧不能再走到"仇恨/出刀"那一段
 *    （走了，砸地就被改写成 windup、那记圈永远等不到收账）；入场砸地打断 windup 时，
 *    挥砍前摇圈要当场作废（那条路径没有别处会清，不清就是一圈永久挂着的假预警）。
 * 4. 不该点火的形状：出生帧（一帧都没跑过）不点火；致死一击跨门槛时圈不许从坟里放出来。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import {
  installWindowShim, makeManager, makePlayerRef, v,
} from './helpers/enemyHarness.js';

const { bossSlam, barrage, chronoField } = GROUND_HAZARD;
const realRandom = Math.random;

/** 把 `Math.random` 钉成常数：需要证明"入场没掷骰子"的用例用它 */
const fixed = (r) => { Math.random = () => r; };

beforeAll(() => {
  installWindowShim();
});

afterAll(() => {
  Math.random = realRandom;
});

/** 生成一只 Boss 摆好玩家；`speed = 0` 让它别自己贴上来（本档验的不是走位） */
const stage = (spawn, bossId, dist) => {
  const m = makeManager();
  const boss = m[spawn]({ bossId, x: 0, z: 0, respawn: false });
  boss.speed = 0;
  return { m, boss, player: v(dist, 0), ref: makePlayerRef() };
};

/** 推进 `frames` 帧（玩家原地不动，与主循环同序） */
const tick = (s, frames = 1, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) s.m.update(dt, s.player, s.ref, null, null);
};

describe('同帧见证：转阶段那一帧圈已经在场地系统里', () => {
  it('`boss-phase` 到达时砸地圈已铺好、Boss 已入 slam 态、挥砍前摇圈已收起', () => {
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    tick(s);                                   // 先跑一帧：有"最近的玩家位置"，也进入 windup
    expect(s.boss.state).toBe('windup');

    // 只信"事件到达那一刻"的读数：监听器里的取样若在派发之后，同帧契约就破了
    const snap = [];
    const on = (e) => snap.push({
      phase: e.detail.phase,
      count: s.m.hazards.count(),
      state: s.boss.state,
      radius: s.m.hazards._items[0]?.radius,
    });
    window.addEventListener('boss-phase', on);
    const killed = s.boss.takeDamage(500);     // 800 → 300：37.5% → 二阶段
    window.removeEventListener('boss-phase', on);

    expect(killed).toBe(false);
    expect(s.boss.phase).toBe(2);
    expect(snap).toEqual([
      { phase: 2, count: 1, state: 'slam', radius: bossSlam.radius },
    ]);
    expect(s.m.hazards._items[0].owner).toBe(s.boss);
    // 入场砸地打断了挥砍前摇：那圈假预警必须当场收起
    expect(s.boss.telegraphRing.visible).toBe(false);
  });

  it('对照：同一次转阶段把 entry 摘掉就什么都不铺（转档与演出本身照常）', () => {
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    tick(s);
    s.boss.arenaScript = s.boss.arenaScript.map((e) => ({ ...e, entry: false }));

    let events = 0;
    const on = () => { events += 1; };
    window.addEventListener('boss-phase', on);
    const killed = s.boss.takeDamage(500);
    window.removeEventListener('boss-phase', on);

    expect(killed).toBe(false);
    expect(s.boss.phase).toBe(2);              // 转档照常
    expect(events).toBe(1);                    // 演出照常
    expect(s.m.hazards.count()).toBe(0);       // 只少了铺场 —— red 只可能来自"entry 被当真"
  });

  it('update 路径转阶段：当帧不被"仇恨/出刀"那一段改写回 windup，圈有主', () => {
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    tick(s);
    expect(s.boss.state).toBe('windup');
    expect(s.boss.telegraphRing.visible).toBe(true);

    s.boss.hp = 350;                           // 直接改血：转阶段发生在 update 的检查里
    tick(s);

    expect(s.boss.state).toBe('slam');         // 本帧余下决策照走的话，这里会是 'windup'
    expect(s.m.hazards.count()).toBe(1);
    expect(s.m.hazards._items[0].radius).toBe(bossSlam.radius);
    expect(s.boss.slamHazard).toBe(s.m.hazards._items[0]);   // 那记圈有主：等得到 updateSlam 收账
    expect(s.boss.telegraphRing.visible).toBe(false);
  });
});

describe('入场闸门：绕反应闸、保 range 空间闸', () => {
  it('入场绕 timed 闸：rate 没掷、也没有 dt 因子，照铺', () => {
    fixed(0.99);                               // 任何 `< rate * dt` 的写法在此都不可能命中
    const s = stage('spawnSpaceBoss', 'singularity-herald', 14);
    tick(s);
    s.boss.takeDamage(500);                    // 900 → 400：44% → 二阶段
    expect(s.boss.phase).toBe(2);
    expect(s.m.hazards.count()).toBe(1);
    expect(s.m.hazards._items[0].radius).toBe(bossSlam.radius);
    expect(s.boss.state).toBe('slam');
  });

  it('opportunity 入场的 range 仍是硬门槛：远到 30 米只落二阶段那记砸地', () => {
    const s = stage('spawnSpaceBoss', 'singularity-herald', 30);
    tick(s);
    s.boss.takeDamage(600);                    // → 二阶段：砸地入场（timed，无 range）
    expect(s.m.hazards.count()).toBe(1);
    s.boss.takeDamage(100);                    // → 三阶段：弹幕入场，但 30 ≥ range 22
    expect(s.boss.phase).toBe(3);
    expect(s.m.hazards.count()).toBe(1);       // 没多出弹幕
    expect(s.boss._arenaCd[1]).toBe(0);        // 冷却只写在"真的铺了"之后
  });

  it('opportunity 入场在 range 内照铺：弹幕用自己的 tint、冷却照落', () => {
    const s = stage('spawnSpaceBoss', 'singularity-herald', 10);
    tick(s);
    s.boss.takeDamage(600);
    s.boss.takeDamage(100);
    expect(s.boss.phase).toBe(3);
    expect(s.m.hazards.count()).toBe(1 + barrage.count);
    const first = s.m.hazards._items[1];       // [0] 是二阶段砸地，弹幕从 [1] 起
    expect(first.disc.material.color.getHex()).toBe(0x4488ff);
    expect(s.boss._arenaCd[1]).toBe(9);        // 起手成功才落冷却
  });

  it('入场之后的常规节奏从这一刻起算：井下一帧就够条件（贴近连吃两份）', () => {
    const s = stage('spawnSpaceBoss', 'singularity-herald', 10);
    tick(s);
    s.boss.takeDamage(600);
    s.boss.takeDamage(100);
    const afterEntrance = s.m.hazards.count(); // 1 砸地 + 5 弹幕

    tick(s, 12);                               // 0.2 秒：井的冷却没被入场占掉，下一帧就该铺
    expect(s.m.hazards.count()).toBe(afterEntrance + 1);
    const well = s.m.hazards._items[afterEntrance];
    expect(well.duration).toBe(GROUND_HAZARD.gravityWell.duration);
    expect(s.boss._arenaCd[1]).toBeGreaterThan(0);   // 弹幕自己在走冷却，不许连铺
    expect(s.boss._arenaCd[2]).toBeGreaterThan(11);  // 井的 12 秒冷却已开始走
  });
});

describe('逐 Boss 点名与自己的守卫', () => {
  it('阶段点名各自那一招：时线执政官二阶段砸地、三阶段时停域落在玩家脚下', () => {
    const s = stage('spawnVoidBoss', 'void-chronarch', 10);
    s.boss.timeStopCooldown = 1e9;             // 无场时停放掉：本用例只验场地脚本那一半
    tick(s);

    s.boss.takeDamage(500);                    // 750 → 250：33% → 二阶段
    expect(s.boss.phase).toBe(2);
    expect(s.m.hazards.count()).toBe(1);
    expect(s.m.hazards._items[0].duration).toBe(0);   // 砸地是一击定音

    s.boss.takeDamage(100);                    // → 150：20% → 三阶段
    expect(s.boss.phase).toBe(3);
    expect(s.m.hazards.count()).toBe(2);
    const field = s.m.hazards._items[1];
    expect(field.duration).toBe(chronoField.duration);   // 时停域是"域"
    expect(field.slow).toBe(chronoField.slow);
    expect(field.x).toBe(10);                  // 就开在玩家此刻站的地方
    expect(field.z).toBe(0);
    expect(s.boss._arenaCd[1]).toBe(14);
  });

  it('出生帧不点火：生成后还没跑过一帧就转阶段，不许放出一发没人躲的圈', () => {
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    // 走真派发（`sm.transitionTo`），不手拨 `phase` —— 手拨那条根本不会调用入场钩子，
    // 用它断"没铺场"等于断"这条路本来不通"，守不守门都是绿的。
    expect(s.boss.sm.transitionTo(2)).toBe(true);   // 转档与事件照走
    expect(s.m.hazards.count()).toBe(0);            // 只少了铺场
    expect(s.boss.slamHazard).toBe(null);
    expect(s.boss.state).toBe('idle');              // 一帧都没跑过，状态机还没开始管事
  });

  it('同一条 transitionTo 在跑过一帧之后确实会铺场（上一条的 0 是守卫的功劳，不是路不通）', () => {
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    tick(s);
    expect(s.boss.sm.transitionTo(2)).toBe(true);
    expect(s.m.hazards.count()).toBe(1);
    expect(s.m.hazards._items[0].radius).toBe(bossSlam.radius);
  });

  it('致死一击跨门槛：圈不许从坟里放出来（die 刚撤过一轮）', () => {
    const s = stage('spawnBoss', 'shadow-warden', 1.5);
    tick(s);
    s.boss.hp = 450;                           // 56%：还在二阶段门槛之外
    const killed = s.boss.takeDamage(500);     // 这一下致死，同时跨过 50% 门槛
    expect(killed).toBe(true);
    expect(s.boss.alive).toBe(false);
    expect(s.m.hazards.count()).toBe(0);       // dead boss 的入场招不放
    expect(s.boss.slamHazard).toBe(null);
  });
});
