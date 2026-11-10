/**
 * 出生缩放（W-F3 切片2）。
 *
 * 这一片要钉住的是"第三档乘子接在同一条咽喉上，且**中性时逐字节等价**"：
 * ① 模块级那一格的读写与归位；
 * ② 脏值回落 1 而不是抛 —— 这一格来自运行时状态，一个坏值不该让整局出不了怪；
 * ③ `spawnAt` 里 `名册 × 难度 × 成长 × 本档` 四个乘子各占一边，谁也不覆盖谁；
 * ④ **中性时 config 与改动前逐字节相同**（`speed` 只在非中性时写，否则会多出一个键）；
 * ⑤ 试炼开层时写、结束/放弃/销毁时归位 —— 归位漏了，离开试炼之后怪会一直按最后一层的强度长。
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  NEUTRAL_SPAWN_SCALE, setSpawnScale, getSpawnScale, resetSpawnScale, isNeutralSpawnScale,
} from '../src/game/SpawnTuning.js';
import { EnemyManager } from '../src/combat/EnemyManager.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { getDifficultyId, setDifficulty } from '../src/game/Difficulty.js';
import { growthAt, zoneGrowthStage } from '../src/content/enemyGrowth.js';
import { TrialSystem } from '../src/game/TrialSystem.js';
import { TRIAL_LAYERS } from '../src/content/trial.js';
import { emit } from '../src/engine/EventBus.js';

/** 与 `enemy-growth.test.js` 同一套夹具：只借原型走真 spawnAt，spawn 原样收回 config */
const zone = (id, x, z, r = 120) => ({ id, center: { x, z }, radius: r });
const 假世界 = () => ({
  zones: [zone('hub', 0, 0), zone('fantasy', -200, 0), zone('magic', 0, -180), zone('space', 200, 80),
    zone('void', 0, 220), zone('abyss', -200, 220), zone('gloom', 180, 100), zone('radiant', -180, -160)],
});
const 出生 = (world, type, x, z, extra) => {
  const host = Object.create(EnemyManager.prototype);
  host.world = world;
  host.spawn = (cfg) => cfg;
  return EnemyManager.prototype.spawnAt.call(host, type, x, z, extra);
};

const 起始档 = getDifficultyId();
afterEach(() => {
  resetSpawnScale();
  setDifficulty(起始档);
});

describe('出生缩放 · 模块级那一格', () => {
  it('出厂即中性，且是同一份冻结对象', () => {
    resetSpawnScale();
    expect(getSpawnScale()).toBe(NEUTRAL_SPAWN_SCALE);
    expect(isNeutralSpawnScale()).toBe(true);
    expect(getSpawnScale()).toEqual({ hp: 1, damage: 1, speed: 1 });
  });

  it('写进去读得出来，且是冻结的（读者拿不到可写引用）', () => {
    const s = setSpawnScale({ hp: 1.2, damage: 1.1, speed: 0.9 });
    expect(getSpawnScale()).toBe(s);
    expect(s).toEqual({ hp: 1.2, damage: 1.1, speed: 0.9 });
    expect(Object.isFrozen(s)).toBe(true);
    expect(() => { 'use strict'; s.hp = 9; }).toThrow();
  });

  it('脏值/缺格/非对象一律回落 1，不抛', () => {
    expect(setSpawnScale({ hp: NaN, damage: -2, speed: 0 })).toEqual({ hp: 1, damage: 1, speed: 1 });
    expect(setSpawnScale({ hp: Infinity })).toEqual({ hp: 1, damage: 1, speed: 1 });
    expect(setSpawnScale({})).toEqual({ hp: 1, damage: 1, speed: 1 });
    expect(setSpawnScale(null)).toBe(NEUTRAL_SPAWN_SCALE);
    expect(setSpawnScale('1.5')).toBe(NEUTRAL_SPAWN_SCALE);
  });

  it('归位回到同一份中性对象（不是"看起来相等的新对象"）', () => {
    setSpawnScale({ hp: 3, damage: 3, speed: 3 });
    expect(resetSpawnScale()).toBe(NEUTRAL_SPAWN_SCALE);
    expect(isNeutralSpawnScale()).toBe(true);
  });
});

describe('出生缩放 · spawnAt 那条咽喉', () => {
  it('中性时 config 与改动前逐字节相同（`speed` 不多写一个键）', () => {
    resetSpawnScale();
    const cfg = 出生(假世界(), 'golem', -200, 0);
    expect(Object.keys(cfg)).not.toContain('scale');
    // golem 名册里带 speed（3.8）—— 中性时 config 里那一格就该是名册原值
    expect(cfg.speed).toBe(ENEMY_ROSTER.golem.speed);
    // 与"手工按名册 × 难度 × 成长算一遍"逐格相等
    const stage = zoneGrowthStage('fantasy');
    expect(cfg.hp).toBe(Math.round(ENEMY_ROSTER.golem.hp * growthAt(stage).hp));
  });

  it('血量/伤害/速度三个乘子都真的乘上去', () => {
    const base = 出生(假世界(), 'golem', -200, 0);
    setSpawnScale({ hp: 2, damage: 3, speed: 1.5 });
    const scaled = 出生(假世界(), 'golem', -200, 0);
    expect(scaled.hp).toBe(Math.round(base.hp * 2));
    expect(scaled.damage).toBe(Math.round(base.damage * 3));
    expect(scaled.speed).toBeCloseTo(ENEMY_ROSTER.golem.speed * 1.5, 10);
  });

  it('难度与本档叠乘，互不覆盖（换难度不该抹掉试炼的乘子）', () => {
    setDifficulty('brutal');
    setSpawnScale({ hp: 2, damage: 1, speed: 1 });
    const 硬 = 出生(假世界(), 'soldier', -200, 0);
    setDifficulty('story');
    const 软 = 出生(假世界(), 'soldier', -200, 0);
    expect(硬.hp).toBeGreaterThan(软.hp);
    // 档位越高越硬：brutal 的血量应当高于 standard（说明两档乘子都还在乘）
    setDifficulty('standard');
    const 中 = 出生(假世界(), 'soldier', -200, 0);
    expect(硬.hp).toBeGreaterThan(中.hp);
    expect(中.hp).toBeGreaterThan(软.hp);
    expect(growthAt(zoneGrowthStage('fantasy')).hp).toBeGreaterThan(0);
  });

  it('没有 speed 的类别不会因为本档多出一个 NaN', () => {
    setSpawnScale({ hp: 1, damage: 1, speed: 2 });
    const cfg = 出生(假世界(), 'dummy', 0, 0);
    expect(Number.isFinite(cfg.speed ?? 5)).toBe(true);
    expect(cfg.speed).toBeUndefined(); // dummy 名册没有 speed，config 里也不该被我们塞一个
  });
});

describe('出生缩放 · 试炼的写与收', () => {
  const fakeGame = () => ({ player: { combat: { takeDamage: () => {} } } });
  /** 清掉第 1 层（第 1 层的 scale 是恒等 —— 所以"非中性"要从第 2 层起看） */
  const 清第一层 = () => {
    for (let i = 0; i < TRIAL_LAYERS[0].quota; i += 1) emit('enemy-defeated', { type: 'soldier' });
  };

  it('第 1 层是恒等档（曲线如此），第 2 层起真的非中性', () => {
    const sys = new TrialSystem(fakeGame());
    sys.start([]);
    expect(getSpawnScale()).toEqual(TRIAL_LAYERS[0].scale);
    expect(isNeutralSpawnScale(), '第 1 层不该是恒等档').toBe(true);
    清第一层();
    expect(getSpawnScale()).toEqual(TRIAL_LAYERS[1].scale);
    expect(isNeutralSpawnScale(), '第 2 层必须离开恒等档').toBe(false);
    sys.dispose();
  });

  it('通关之后归位（不然离开试炼的怪还按最后一层长）', () => {
    const sys = new TrialSystem(fakeGame());
    sys.start([]);
    for (const row of TRIAL_LAYERS) {
      for (let i = 0; i < row.quota; i += 1) emit('enemy-defeated', { type: 'soldier' });
    }
    expect(sys.getState().state).toBe('finished');
    expect(isNeutralSpawnScale(), '通关之后没有归位').toBe(true);
    sys.dispose();
  });

  it('超时/死亡/放弃三条结束路都归位（先在非中性档上结束）', () => {
    for (const 结束 of ['timeout', 'death', 'abandon']) {
      const sys = new TrialSystem(fakeGame());
      sys.start([]);
      清第一层();                       // 走到第 2 层 = 非中性
      expect(isNeutralSpawnScale()).toBe(false);
      if (结束 === 'timeout') sys.update(TRIAL_LAYERS[1].seconds + 1);
      else if (结束 === 'death') emit('player-death-count', { count: 1 });
      else sys.abandon();
      expect(isNeutralSpawnScale(), `${结束} 之后没有归位`).toBe(true);
      sys.dispose();
    }
  });

  it('dispose 也归位（换档/重开时 teardown 会走到这里）', () => {
    const sys = new TrialSystem(fakeGame());
    sys.start([]);
    清第一层();
    expect(isNeutralSpawnScale()).toBe(false);
    sys.dispose();
    expect(isNeutralSpawnScale()).toBe(true);
  });
});
