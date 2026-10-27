/**
 * 全场时停（W-A6 切片13，切片5 尾巴①）：世界时标的**显式契约**。
 *
 * 切片5 把纪律写死："域自己走主循环 dt，不许就地拧世界时标"——因为就地拧会让域的
 * `duration` 自己把自己拉长（越慢越久、越久越慢），还要和 hitstop 咬住。本切片把例外
 * 修成**一扇门**而不是就地默认：
 * - Time 侧：具名持有通道（`holdScale(id, scale)` / `releaseScale(id)`），多条持有取最狠，
 *   与 hitstop 互取更小 —— 两套语义互不顶账；
 * - 危险区侧：`worldSlow` 档没有 time 通道当场抛（显式契约），持有只走那扇门，
 *   自己的账本（前摇 / tick / duration）吃 `rawDt` —— "3.6 秒"说的是**墙钟**的 3.6 秒，
 *   期间世界只走 3.6 × 0.35 的游戏秒；
 * - 圈**不是**这一档的边界：世界时钟不归任何一块地管，走出圈照样慢；圈只是宣告
 *   （"这一拍世界要厚了"）与伤害的边界 —— 这是位置能拥有的全部。
 *
 * 与 `chrono-field.test.js` 的分工：那边管"改**玩家**的时标"（一本账、绳模型、三条还账路），
 * 这边管"改**世界**的时钟"。世界时标不是玩家账本的一格 —— 两本账同时走，各还各的。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TimeController } from '../src/engine/Time.js';
import { GroundHazards } from '../src/combat/GroundHazards.js';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import { ARENA_MOVES, BOSS_ARENA_SCRIPTS } from '../src/content/arenaScripts.js';
import { installWindowShim, makeScene, makeWorld, makeManager, v } from './helpers/enemyHarness.js';
import { makePlayer } from './helpers/playerHarness.js';

const realRandom = Math.random;

beforeAll(() => {
  installWindowShim();
  Math.random = () => 0.99;      // 别在用例里顺手开出第二招
});

afterAll(() => {
  Math.random = realRandom;
});

/** 单位用的全场时停：整数秒、2 的幂帧长、不掉血，到期时刻能逐帧写死 */
const UNIT = {
  x: 0, z: 0, radius: 4, telegraph: 1, damage: 0,
  duration: 2, worldSlow: 0.35, color: 0xe6d690,
};

/**
 * 危险区 + 时间通道 + 真玩家。走的是生产管线：主循环先 `time.tick`，再把**缩放过的**
 * `scaledDt` 交给危险区与玩家 —— 持有生效后 hz 收到的就是缩水 dt，与 Game.update 同序。
 */
function dig(spec = {}) {
  const time = new TimeController();
  const hz = new GroundHazards(makeScene(), makeWorld(), null, time);
  const owner = { name: 'caster' };
  const item = hz.spawn({ ...UNIT, ...spec, owner });
  const p = makePlayer();
  p.position.set(spec.px ?? 2, 0, spec.pz ?? 0);
  return { time, hz, item, p, owner };
}

/** 生产管线的一帧 */
function frame(d, rawDt = 1 / 64) {
  d.time.tick(rawDt, d.time.now + rawDt);
  d.hz.update(d.time.scaledDt, d.p.position, d.p);
  d.p.update(d.time.scaledDt, {});
}

const run = (d, seconds, rawDt = 1 / 64) => {
  for (let i = 0; i < Math.round(seconds / rawDt); i++) frame(d, rawDt);
};

const land = (d, rawDt = 1 / 64) => run(d, UNIT.telegraph + rawDt, rawDt);

describe('世界时标的持有通道（Time）', () => {
  it('挂上一条持有，下一次 tick 就慢；还了就回 1', () => {
    const t = new TimeController();
    t.holdScale('a', 0.35);
    expect(t.timeScale).toBe(1);                       // 本帧的 timeScale 已在 tick 里算过
    t.tick(1 / 64, 0);
    expect(t.timeScale).toBeCloseTo(0.35, 10);
    expect(t.scaledDt).toBeCloseTo((1 / 64) * 0.35, 10);
    t.releaseScale('a');
    t.tick(1 / 64, 1 / 64);
    expect(t.timeScale).toBe(1);
  });

  it('多条持有并存取最狠的那条；撤掉狠的还剩轻的', () => {
    const t = new TimeController();
    t.holdScale('drizzle', 0.5);
    t.holdScale('freeze', 0.35);
    t.tick(1 / 64, 0);
    expect(t.timeScale).toBeCloseTo(0.35, 10);
    t.releaseScale('freeze');
    t.tick(1 / 64, 1 / 64);
    expect(t.timeScale).toBeCloseTo(0.5, 10);
    t.releaseScale('drizzle');
    t.tick(1 / 64, 2 / 64);
    expect(t.timeScale).toBe(1);
  });

  it('hitstop 与持有互取更小：谁更狠听谁的，两个方向都钉', () => {
    const t = new TimeController();
    t.holdScale('a', 0.5);
    t.hitstop(0.1, 0.08, 0);
    t.tick(1 / 64, 0);
    expect(t.timeScale).toBeCloseTo(0.08, 10);         // hitstop 更狠
    t.holdScale('b', 0.05);
    t.tick(1 / 64, 1 / 64);
    expect(t.timeScale).toBeCloseTo(0.05, 10);         // 持有更狠
  });

  it('没挂过的 id 也能还（不抛）；reset 清账后时间照常走', () => {
    const t = new TimeController();
    expect(() => t.releaseScale('never')).not.toThrow();
    t.holdScale('a', 0.35);
    t.reset();
    t.tick(1 / 64, 0);
    expect(t.timeScale).toBe(1);
  });

  it('holdScale 只收开区间 (0,1)：挂 1 是脏账、挂 0 是永久定格，连同 NaN 一起挡在门外', () => {
    const t = new TimeController();
    for (const bad of [0, 1, 1.5, -0.2, NaN]) {
      expect(() => t.holdScale('a', bad)).toThrow(/开区间/);
    }
    t.tick(1 / 64, 0);
    expect(t.timeScale).toBe(1);                       // 一条都没挂上：世界时钟没被碰过
  });
});

describe('危险区的全场时停（GroundHazards × Time）', () => {
  it('没有时间通道的层当场抛：世界时钟不许被"只是想画个圈"的调用方持有（显式契约）', () => {
    const hz = new GroundHazards(makeScene(), makeWorld(), null, null);
    expect(() => hz.spawn({ ...UNIT, owner: { name: 'x' } })).toThrow(/时间通道/);
  });

  it('worldSlow 与 slow 互斥：一个来源不许同时改两个时钟', () => {
    const hz = new GroundHazards(makeScene(), makeWorld(), null, new TimeController());
    expect(() => hz.spawn({ ...UNIT, slow: 0.3, owner: { name: 'x' } })).toThrow(/互斥/);
  });

  it('必须有正的 duration、必须落在 (0,1)：坏形状逐一挡下', () => {
    const hz = new GroundHazards(makeScene(), makeWorld(), null, new TimeController());
    expect(() => hz.spawn({ ...UNIT, duration: 0, owner: { name: 'x' } })).toThrow(/duration/);
    expect(() => hz.spawn({ ...UNIT, worldSlow: 1, owner: { name: 'x' } })).toThrow(/开区间/);
    expect(() => hz.spawn({ ...UNIT, worldSlow: 1.5, owner: { name: 'x' } })).toThrow(/开区间/);
    expect(() => hz.spawn({ ...UNIT, worldSlow: -0.2, owner: { name: 'x' } })).toThrow(/开区间/);
  });

  it('前摇里不持有：圈还画着，世界照常走', () => {
    const d = dig();
    run(d, UNIT.telegraph - 1 / 64);
    expect(d.item.done).toBe(false);
    expect(d.time.timeScale).toBe(1);
  });

  it('落地那一拍申领，下一次 tick 才生效（持有语义的既定滞后，一帧内世界照常走）', () => {
    const d = dig();
    run(d, UNIT.telegraph);
    expect(d.item.active).toBe(true);                  // 这帧里已经 _holdWorld
    expect(d.time.timeScale).toBe(1);                  // 但本帧的 time 早就 tick 过了
    frame(d, 1 / 64);                                  // 下一帧 tick：持有生效
    expect(d.time.timeScale).toBeCloseTo(UNIT.worldSlow, 10);
    expect(d.time.scaledDt).toBeCloseTo((1 / 64) * UNIT.worldSlow, 10);
  });

  it('自己的账本吃 rawDt：duration 2 恰好在 2 秒墙钟里到期，期间世界只走 0.35×', () => {
    const d = dig();
    land(d);                                           // 落地 + 持有已生效（t 已走过 1/64）
    const before = d.time.elapsed;
    run(d, UNIT.duration - 2 / 64);                    // 还差一帧到期
    expect(d.item.active).toBe(true);
    expect(d.time.elapsed - before).toBeCloseTo((UNIT.duration - 2 / 64) * UNIT.worldSlow, 3);
    frame(d, 1 / 64);
    expect(d.item.active).toBe(false);                 // 墙钟 2 秒整，没有"越慢越久"
    frame(d, 1 / 64);
    expect(d.time.timeScale).toBe(1);                  // 到期那一帧还了账
  });

  it('同一层里姊妹项差速走：世界项的账本吃 rawDt，普通域吃缩水后的 dt', () => {
    const d = dig();
    const plain = d.hz.spawn({ ...UNIT, worldSlow: 0, slow: 0.4, duration: 99, owner: d.owner });
    land(d);                                           // 两片同 telegraph 同帧落地；最后一帧持有已生效
    expect(d.time.timeScale).toBeCloseTo(UNIT.worldSlow, 10);
    expect(d.item.t).toBeCloseTo(1 / 64, 10);                      // 世界项：墙钟
    expect(plain.t).toBeCloseTo((UNIT.worldSlow / 64), 10);        // 普通域：游戏秒
  });

  it('走出圈不还账：世界时钟不归任何一块地管；还账的路只有到期 / 主人倒地 / 拆层', () => {
    const d = dig();
    land(d);
    frame(d, 1 / 64);
    d.p.position.set(UNIT.radius + 5, 0, 0);           // 跑出去
    run(d, 0.5);
    expect(d.time.timeScale).toBeCloseTo(UNIT.worldSlow, 10);      // 还在持有
    run(d, UNIT.duration);                             // 撑到自然到期
    frame(d, 1 / 64);
    expect(d.time.timeScale).toBe(1);
  });

  it('主人倒地那一帧还世界时标：井塌了世界也回到全速', () => {
    const d = dig();
    land(d);
    frame(d, 1 / 64);
    expect(d.time.timeScale).toBeCloseTo(UNIT.worldSlow, 10);
    d.hz.cancelFor(d.owner);
    d.time.tick(1 / 64, d.time.now + 1 / 64);
    expect(d.time.timeScale).toBe(1);
  });

  it('拆层也还：dispose 不许把持有悬在世界时钟上', () => {
    const d = dig();
    land(d);
    frame(d, 1 / 64);
    d.hz.dispose();
    d.time.tick(1 / 64, d.time.now + 1 / 64);
    expect(d.time.timeScale).toBe(1);
  });

  it('两片全场时停叠着取最狠；先散的那片还账，狠的还在就继续狠', () => {
    const d = dig({ duration: 4 });                                    // 0.35，撑久一点
    d.hz.spawn({ ...UNIT, worldSlow: 0.5, duration: 1, owner: { name: 'B' } });
    land(d);
    frame(d, 1 / 64);
    expect(d.time.timeScale).toBeCloseTo(UNIT.worldSlow, 10);          // min(0.35, 0.5)
    run(d, 1);                                                         // B 片 1 秒墙钟到期
    frame(d, 1 / 64);
    expect(d.time.timeScale).toBeCloseTo(UNIT.worldSlow, 10);          // A 片还在
    run(d, 3.5);                                                       // A 片 4 秒墙钟也到期
    frame(d, 1 / 64);
    expect(d.time.timeScale).toBe(1);
  });

  it('世界时标不是玩家账本的一格：持有期间玩家的 ledger 空着、timeSlow 是 1', () => {
    const d = dig();
    land(d);
    frame(d, 1 / 64);
    expect(d.time.timeScale).toBeCloseTo(UNIT.worldSlow, 10);
    expect(d.p._timeScales).toBe(null);
    expect(d.p.timeSlow).toBe(1);
  });
});

describe('内容接线（B71：没有消费者的路不许修）', () => {
  it('ARENA_MOVES.freezeAll 指向真表里的 chronoFieldAll，形状四件齐', () => {
    expect(ARENA_MOVES.freezeAll).toBe('chronoFieldAll');
    const spec = GROUND_HAZARD[ARENA_MOVES.freezeAll];
    expect(spec.damage).toBe(0);
    expect(spec.duration).toBeGreaterThan(0);
    expect(spec.worldSlow).toBeGreaterThan(0);
    expect(spec.worldSlow).toBeLessThan(1);
    expect(spec.slow).toBeUndefined();                 // 与玩家减速互斥的那一半：这一档根本没有
  });

  it('时线执政官有一行 freezeAll：opportunity 起手、不抢招牌入场（freeze 仍在且仍标 entry）', () => {
    const rows = BOSS_ARENA_SCRIPTS['void-chronarch'];
    const row = rows.find((e) => e.move === 'freezeAll');
    expect(row).toBeTruthy();
    expect(row.trigger).toBe('opportunity');
    expect(row.phase).toBe(3);
    expect(row.entry).toBeUndefined();
    expect(rows.some((e) => e.move === 'freeze' && e.entry === true)).toBe(true);
  });

  it('Boss.startDomain 把 worldSlow 穿进 spawn：执政官真的能铺出全场时停', () => {
    const m = makeManager();                           // harness 已带时间通道
    const boss = m.spawnVoidBoss({ x: 0, z: 0, respawn: false });
    const row = BOSS_ARENA_SCRIPTS['void-chronarch'].find((e) => e.move === 'freezeAll');
    expect(boss.startDomain(v(10, 0), row)).toBe(true);
    const item = m.hazards._items[m.hazards._items.length - 1];
    expect(item.worldSlow).toBe(GROUND_HAZARD.chronoFieldAll.worldSlow);
    expect(item.worldKey).toMatch(/^hazard-world:/);
    expect(item.duration).toBe(GROUND_HAZARD.chronoFieldAll.duration);
  });

  it('生产管线真的把时间通道穿到了危险区（Game → EnemyManager → GroundHazards）', () => {
    expect(makeManager().hazards.time).toBeInstanceOf(TimeController);
    const gameSrc = readFileSync(join(process.cwd(), 'src/core/Game.js'), 'utf8');
    expect(gameSrc).toMatch(/new EnemyManager\(this\.scene, this\.world, this\.projectiles, this\.audio, this\.time\)/);
    const emSrc = readFileSync(join(process.cwd(), 'src/combat/EnemyManager.js'), 'utf8');
    expect(emSrc).toMatch(/new GroundHazards\(scene, world, this\.audio, time\)/);
  });
});
