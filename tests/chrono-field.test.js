/**
 * 时停域（W-A6 切片5，B5 第四档：改时标不改伤害的场）。
 *
 * 这一档和前三种圈的区别不在"活多久"（切片4 已经解决了），而在**它往谁身上写东西**：
 * 井写在玩家的速度上（一帧就被抹掉），时停域写在玩家的**时标**上 —— 那是会被带走的状态。
 * 于是本文件要证明的是四件事：
 * 1. **时标有一本账，不是一个字段**：一个来源一格（`applyTimeScale(key, scale, leash)`），
 *    多个来源取最狠的那格，谁也不必"记得"来注销。旧写法 `playerRef.timeSlow = 1` 只有
 *    自然到期那一条还原路径，`VoidBoss` 的打断与死亡两条都漏了 —— 玩家永久留在 0.35。
 * 2. **绳模型**：想让减速继续就得每帧续绳，断供在 `TIME_SCALE_LEASH` 内自己烧完。
 *    最坏的失败从"永远慢着"降级成"多慢 0.12 秒"。
 * 3. **它不改世界时标**：域自己走主循环 `dt`，若它去拧 `Time.timeScale`，就会连自己的
 *    `duration` 一起在墙钟里拉长（越慢越久），还要和 hitstop 互相咬住。这条用静态门禁钉住。
 *    （切片13 起世界时标有了**唯一**的合法例外 ——「全场时停」经 `Time.holdScale` 显式持有、
 *    自己的账本吃 `rawDt`，契约与用例住在 `tests/world-time-stop.test.js`；"不许就地拧"
 *    这一半仍然钉死在本文件。）
 * 4. **不掉血**：`damage: 0` 是这一档的定义 —— 落地那拍一次伤害数字都不该冒出来。
 *
 * 与切片4 同一套纪律：单位用例自己交数值，帧长取 2 的幂（1/64、1/128），
 * 到期与段数都是能逐帧写死的整数，不是"差一点也算过"。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUND_HAZARD, TIME_SCALE_LEASH } from '../src/content/tuning.js';
import { ARENA_MOVES, BOSS_ARENA_SCRIPTS, assertArenaScript } from '../src/content/arenaScripts.js';
import { VoidBoss } from '../src/combat/VoidBoss.js';
import { installWindowShim, makeManager, makeScene, makeWorld, v } from './helpers/enemyHarness.js';
import { makePlayer } from './helpers/playerHarness.js';

const { chronoField } = GROUND_HAZARD;
/** "谁在什么时候铺这一片"住在脚本表里；本文件测的是这片场本身 */
const cast = BOSS_ARENA_SCRIPTS['void-chronarch'].find((e) => e.move === 'freeze');
const realRandom = Math.random;

/** 单位用的场：整数秒、2 的幂帧长、不掉血，到期时刻能逐帧断言 */
const UNIT = {
  x: 0, z: 0, radius: 4, telegraph: 1, damage: 0,
  duration: 2, slow: 0.4, color: 0xc9a962,
};

/** 绳子烧完需要几帧（`TIME_SCALE_LEASH` 不是任何招式时长，它只决定"忘注销"的代价） */
const LEASH_FRAMES = Math.ceil(TIME_SCALE_LEASH * 64);

beforeAll(() => {
  installWindowShim();
  Math.random = () => 0.99;      // 别在用例里顺手开出第二招
});

afterAll(() => {
  Math.random = realRandom;
});

const src = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

/** 直接交给危险区一片场（不经 Boss），玩家摆到 `px` 米处 */
function dig(spec = {}, over = {}) {
  const m = makeManager();
  const owner = over.owner ?? { name: 'caster' };
  const item = m.hazards.spawn({ ...UNIT, ...spec, owner });
  // 真玩家宿主：时标账本与位移都是生产代码，不是测试桩
  const p = makePlayer();
  p.position.set(spec.px ?? 2, 0, spec.pz ?? 0);
  return { m, hz: m.hazards, item, p, owner };
}

/** 以固定帧长推进 `seconds` 秒（玩家同步跑自己的账本，与主循环同序） */
function run(d, seconds, dt = 1 / 64) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    d.hz.update(dt, d.p.position, d.p);
    d.p.update(dt, {});
  }
}

const land = (d, dt = 1 / 64) => run(d, UNIT.telegraph + dt, dt);

/** 这片场此刻有没有占着玩家那一格账 */
const held = (d) => !!d.p._timeScales?.has(d.item.timeKey);

describe('时标账本：一个来源一格', () => {
  it('没有来源时一帧的开销是一句判空：账本根本不建', () => {
    const p = makePlayer();
    expect(p.timeSlow).toBe(1);
    p.updateTimeScales(1 / 64);
    expect(p._timeScales).toBe(null);
    expect(p.speedMultiplier()).toBe(1);
  });

  it('挂上一格就改倍率，断供在 leash 内自己烧完', () => {
    const p = makePlayer();
    p.applyTimeScale('a', 0.5, TIME_SCALE_LEASH);
    expect(p.speedMultiplier()).toBe(0.5);
    p.updateTimeScales(1 / 64);
    expect(p.timeSlow).toBe(0.5);
    for (let i = 0; i < LEASH_FRAMES; i++) p.updateTimeScales(1 / 64);
    expect(p.timeSlow).toBe(1);
    expect(p._timeScales.size).toBe(0);
  });

  it('每帧续绳 = 一直在：绳长不会把持续效果烧断', () => {
    const p = makePlayer();
    for (let i = 0; i < 200; i++) {
      p.applyTimeScale('a', 0.5, TIME_SCALE_LEASH);
      p.updateTimeScales(1 / 64);
    }
    expect(p.timeSlow).toBe(0.5);
  });

  it('两格同时挂着吃最狠的那份，撤掉强的还剩弱的', () => {
    const p = makePlayer();
    p.applyTimeScale('drizzle', 0.35, 5);
    p.applyTimeScale('field', 0.2, 5);
    expect(p.timeSlow).toBe(0.2);
    p.releaseTimeScale('field');
    expect(p.timeSlow).toBe(0.35);
    p.releaseTimeScale('drizzle');
    expect(p.timeSlow).toBe(1);
  });

  it('同一个来源重复挂只占一格，且取更强、绳更长（两个域不许顶掉彼此的账）', () => {
    const p = makePlayer();
    p.applyTimeScale('field', 0.6, 0.5);
    p.applyTimeScale('field', 0.3, 1);
    expect(p._timeScales.size).toBe(1);
    expect(p.timeSlow).toBe(0.3);
    expect(p._timeScales.get('field').left).toBe(1);
    // 同一格后来者更弱：不许把已经挂上的更强减速顶回去
    p.applyTimeScale('field', 0.9, 2);
    expect(p.timeSlow).toBe(0.3);
  });

  it('没挂过的 key 也能还账：release 幂等，不抛', () => {
    const p = makePlayer();
    expect(() => p.releaseTimeScale('never')).not.toThrow();
    p.applyTimeScale('a', 0.5, 5);
    p.releaseTimeScale('a');
    p.releaseTimeScale('a');
    expect(p.timeSlow).toBe(1);
  });

  it('账本空着时不覆盖直接写的 `timeSlow`（老的用例宿主仍可手工设倍率）', () => {
    const p = makePlayer();
    p.timeSlow = 0.5;
    p.updateTimeScales(1 / 64);
    expect(p.timeSlow).toBe(0.5);
  });
});

describe('时停域的生命周期：账跟着圈走', () => {
  it('前摇里只画圈：一块还没许诺出去的场不许先慢人一步', () => {
    const d = dig();
    run(d, UNIT.telegraph - 1 / 64);        // 63 帧：进度 0.984，落地在整 1 秒那一帧
    expect(d.item.done).toBe(false);
    expect(d.p.timeSlow).toBe(1);
  });

  it('落地且人在圈内才挂账，挂上的是这一档的 `slow`', () => {
    const d = dig();
    land(d);
    expect(held(d)).toBe(true);
    expect(d.p.timeSlow).toBe(UNIT.slow);
  });

  it('全程零伤害：`damage: 0` 的场连落地那一拍都不结（它改时标，不改血条）', () => {
    const d = dig();
    run(d, UNIT.telegraph + UNIT.duration + GROUND_HAZARD.linger + 0.2);
    expect(d.p.hits).toEqual([]);
  });

  it('走出去那一帧就还账：玩家跑回全速，不等绳子自己烧完', () => {
    const d = dig();
    land(d);
    expect(held(d)).toBe(true);
    d.p.position.set(UNIT.radius + 1, 0, 0);
    run(d, 2 / 64);
    expect(held(d)).toBe(false);
    expect(d.p.timeSlow).toBe(1);
  });

  it('走回来重新挂账，用的还是同一个 key（不许每次进出多开一格）', () => {
    const d = dig();
    land(d);
    d.p.position.set(UNIT.radius + 1, 0, 0);
    run(d, 2 / 64);
    d.p.position.set(1, 0, 0);
    run(d, 2 / 64);
    expect(held(d)).toBe(true);
    expect(d.p._timeScales.size).toBe(1);
  });

  it('恰好在半径上算圈内：判定边界就是画出来的边界', () => {
    const d = dig({ px: UNIT.radius });
    land(d);
    expect(held(d)).toBe(true);
  });

  it('域自然到期那一帧还账，余像照旧放完（余像只欠眼睛，不欠玩家速度）', () => {
    const d = dig();
    land(d);
    run(d, UNIT.duration);
    expect(d.item.active).toBe(false);
    expect(d.p.timeSlow).toBe(1);
    expect(d.hz.count()).toBe(1);            // 还在放余像
    run(d, GROUND_HAZARD.linger + 0.05);
    expect(d.hz.count()).toBe(0);
    expect(d.hz.pooled()).toBe(1);           // 散场回到池子里
  });

  it('主人倒地那一帧还账：井塌了人也就自由了', () => {
    const d = dig();
    land(d);
    d.hz.cancelFor(d.owner);
    run(d, 1 / 64);
    expect(d.p.timeSlow).toBe(1);
    expect(held(d)).toBe(false);
  });

  it('两片场各记各的账：撤掉一片，另一片还在慢你', () => {
    const m = makeManager();
    const a = { name: 'A' };
    const b = { name: 'B' };
    const first = m.hazards.spawn({ ...UNIT, x: 0, slow: 0.4, owner: a });
    const second = m.hazards.spawn({ ...UNIT, x: 0, slow: 0.2, owner: b });
    expect(first.timeKey).not.toBe(second.timeKey);
    const p = makePlayer();
    for (let i = 0; i < Math.round((UNIT.telegraph + 0.1) * 64); i++) {
      m.hazards.update(1 / 64, p.position, p);
      p.updateTimeScales(1 / 64);
    }
    expect(p._timeScales.size).toBe(2);
    expect(p.timeSlow).toBe(0.2);            // 两格都在：吃更狠的那一份
    m.hazards.cancelFor(b);
    m.hazards.update(1 / 64, p.position, p);
    p.updateTimeScales(1 / 64);
    expect(p.timeSlow).toBe(0.4);            // 弱的没被强的顶掉，撤账也只撤自己那一格
  });

  it('不给 key 就不开账：不挂时标的域（井）不会往玩家账本里塞空格', () => {
    const m = makeManager();
    const well = m.hazards.spawn({
      x: 0, z: 0, radius: 4, telegraph: 1, damage: 6, tick: 0.5, duration: 2, pull: 8,
    });
    const p = makePlayer();
    for (let i = 0; i < 96; i++) { m.hazards.update(1 / 64, p.position, p); p.updateTimeScales(1 / 64); }
    expect(well.timeKey).toBe(null);
    expect(p._timeScales).toBe(null);
    expect(p.hits.length).toBeGreaterThan(0);   // 井该做的还是掉血
  });

  it('圈跳得比井慢：这份"时间变厚"要看得见，不只算在账上', () => {
    const frozen = dig();
    const plain = dig({ slow: 0, damage: 5, tick: 0.5 });
    // 同一帧数、同一个 `it.t`：只有透明度该分时（井按常速脉动，域按自己的时标放慢）
    run(frozen, UNIT.telegraph + 0.5);
    run(plain, UNIT.telegraph + 0.5);
    expect(frozen.item.t).toBeCloseTo(plain.item.t, 10);
    expect(frozen.item.disc.material.opacity).not.toBe(plain.item.disc.material.opacity);
    expect(src('combat/GroundHazards.js')).toMatch(/PULSE\s*\*\s*\(it\.slow/);
  });

  it('一片什么都不结算的场在 `spawn` 当刻就抛错：不许铺看不见的空地', () => {
    const m = makeManager();
    expect(() => m.hazards.spawn({ ...UNIT, slow: 0 })).toThrow(/结算点什么/);
    // 有 `slow` 就不需要 `tick`；带段伤而没有 tick 仍然抛（切片4 那条守卫没被放宽）
    expect(() => m.hazards.spawn({ ...UNIT, damage: 5 })).toThrow(/正的 tick/);
    expect(() => m.hazards.spawn({ ...UNIT })).not.toThrow();
  });

  it('一击定音的老圈子不受这条影响：`duration` 为 0 时从不看 `tick`', () => {
    const m = makeManager();
    expect(() => m.hazards.spawn({
      x: 0, z: 0, radius: 4.5, telegraph: 1.2, damage: 35,
    })).not.toThrow();
  });
});

describe('时标归玩家，世界时标归世界', () => {
  it('危险区不就地拧世界时标：改世界只许走显式的 holdScale 通道（切片13 契约）', () => {
    // 只看代码：本文件的注释里正好在解释"为什么不许拧"，别提审成违规
    const code = src('combat/GroundHazards.js')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    expect(code).toMatch(/applyTimeScale\(/);
    expect(code).toMatch(/releaseTimeScale\(/);
    // 世界侧只有显式的持有 / 还账两扇门（切片13），不许出现第三个写法
    expect(code).toMatch(/holdScale\(/);
    expect(code).toMatch(/releaseScale\(/);
    expect(code).not.toMatch(/timeScale\s*=/);
    expect(code).not.toMatch(/hitstop\s*\(/);
  });

  it('给半速的 dt，场就在两倍的墙钟里到期：域的秒数是游戏秒（B39 的同一条纪律）', () => {
    const d = dig();
    land(d, 1 / 64);
    expect(held(d)).toBe(true);
    // hitstop / 慢动作期间主循环交出来的 dt 带着缩放：这里用 0.25 倍，四倍的墙钟才走完 `duration`
    const frame = 0.25 / 64;
    const slowFor = (gameSeconds) => {
      for (let i = 0; i < Math.round(gameSeconds / frame); i++) d.hz.update(frame, d.p.position, d.p);
    };
    slowFor(1);                              // 游戏里过了一秒：`duration` 的一半
    expect(d.item.active).toBe(true);        // 不许提前散场
    expect(d.p.timeSlow).toBe(UNIT.slow);
    slowFor(0.5);
    expect(d.item.active).toBe(true);
    slowFor(1);                              // 累计 2.5 游戏秒 > duration：该散了
    expect(d.item.active).toBe(false);
    expect(d.p.timeSlow).toBe(1);            // 还账发生在到期那一帧
  });

  it('还账只有三条路，但三条都在：出圈 / 到期 / 主人倒地', () => {
    const s = src('combat/GroundHazards.js');
    const calls = s.match(/_letGo\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('场地脚本认得时停域', () => {
  it('ARENA_MOVES.freeze 指向真表里的 chronoField', () => {
    expect(ARENA_MOVES.freeze).toBe('chronoField');
    expect(GROUND_HAZARD[ARENA_MOVES.freeze]).toBe(chronoField);
  });

  it('chronoField 的形状：不掉血、有长度、有慢，四件缺一不可', () => {
    expect(chronoField.damage).toBe(0);
    expect(chronoField.duration).toBeGreaterThan(0);
    expect(chronoField.slow).toBeGreaterThan(0);
    expect(chronoField.slow).toBeLessThan(1);
  });

  it('有场的惩罚比没场的看得见：时停域比执政官那记无场时停更狠', () => {
    expect(chronoField.slow).toBeLessThan(0.35);
  });

  it('时停是执政官的招牌，不走 `default`（副本 Boss 与野生 Boss 不该也会这一档）', () => {
    expect(BOSS_ARENA_SCRIPTS.default.some((e) => e.move === 'freeze')).toBe(false);
    expect(BOSS_ARENA_SCRIPTS['void-chronarch'].some((e) => e.move === 'freeze')).toBe(true);
  });

  it('把 freeze 的数值档改坏，加载期校验就要红（表不许指向不存在的档）', () => {
    expect(() => assertArenaScript({ x: [{ move: 'chrono', phase: 3, trigger: 'timed', rate: 1 }] }))
      .toThrow(/未登记于 ARENA_MOVES/);
    expect(() => assertArenaScript(BOSS_ARENA_SCRIPTS)).not.toThrow();
  });
});

describe('时线执政官开场（脚本表接线）', () => {
  /** 执政官的舞台：真表数值 + 先按住它自己那记无场时停，免得污染账本断言 */
  function stage(over = {}) {
    const m = makeManager();
    const boss = m.spawnVoidBoss({ x: 0, z: 0, respawn: false, ...over.config });
    boss.phase = over.phase ?? 3;
    boss.speed = 0;
    boss.timeStopCooldown = over.timeStopCooldown ?? 1e9;
    // `arena: false` 只要"无场的那一记"：把脚本表清空，场地那一份就不来串台
    if (over.arena === false) boss.arenaScript = [];
    const p = makePlayer();
    p.position.copy(over.player ?? v(10, 0));
    return { m, boss, p };
  }

  const tick = (s, seconds, dt = 1 / 64) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      s.m.update(dt, s.p.position, s.p, null, null);
      s.p.update(dt, {});
    }
  };

  const fields = (hz) => hz._items.filter((it) => it.slow > 0);

  it('第三阶段冷却到期且在 range 内：场上出现一片带 slow 的场，数值全读真表', () => {
    const s = stage();
    tick(s, chronoField.telegraph + 0.1);
    const [it] = fields(s.m.hazards);
    expect(it).toBeTruthy();
    expect(it.radius).toBe(chronoField.radius);
    expect(it.duration).toBe(chronoField.duration);
    expect(it.slow).toBe(chronoField.slow);
    expect(it.damage).toBe(0);
    expect(it.disc.material.color.getHex()).toBe(chronoField.color);
    expect(s.p.timeSlow).toBe(chronoField.slow);
  });

  it('第二阶段还不铺：门槛在表里，不在代码里', () => {
    const s = stage({ phase: 2 });
    tick(s, chronoField.telegraph + 1);
    expect(fields(s.m.hazards)).toHaveLength(0);
    expect(s.p.timeSlow).toBe(1);
  });

  it('range 是硬门槛：站在半场外它不白铺', () => {
    const s = stage({ player: v(cast.range + 6, 0) });
    tick(s, 3);
    expect(fields(s.m.hazards)).toHaveLength(0);
  });

  it('前摇里走出去就躲开了：场照样落下，但没人被挂账', () => {
    const s = stage();
    tick(s, chronoField.telegraph * 0.6);
    s.p.position.set(0, 0, 0);            // 一片之外（场开在原来那 10 米处）
    tick(s, chronoField.telegraph);
    expect(fields(s.m.hazards).length).toBe(1);
    expect(s.p.timeSlow).toBe(1);
  });

  it('冷却没走完不开第二片：两片场之间隔 cooldown 秒', () => {
    const s = stage();
    tick(s, chronoField.telegraph + 0.1);
    expect(fields(s.m.hazards)).toHaveLength(1);
    // 第一片活满 5 秒（前摇 + 持续 + 余像）后场上应当空空如也：冷却还没到期，第二片不许提前铺
    tick(s, cast.cooldown - chronoField.telegraph - 0.6);
    expect(fields(s.m.hazards)).toHaveLength(0);
    expect(s.p.timeSlow).toBe(1);
    tick(s, 1);                             // 累计过了 cooldown：第二片此刻在场
    expect(fields(s.m.hazards)).toHaveLength(1);
  });

  it('站在里面真的跑不动：同一段输入，位移短到慢的倍率上', () => {
    const free = makePlayer();
    const freeRun = free.position.clone();
    for (let i = 0; i < 60; i++) free.update(1 / 64, { KeyW: true });
    const covered = freeRun.distanceTo(free.position);

    const s = stage();
    tick(s, chronoField.telegraph + 0.1);
    expect(s.p.timeSlow).toBe(chronoField.slow);
    const start = s.p.position.clone();
    for (let i = 0; i < 60; i++) {
      s.m.update(1 / 64, s.p.position, s.p, null, null);
      s.p.update(1 / 64, { KeyW: true });
    }
    const slowed = start.distanceTo(s.p.position);
    expect(slowed).toBeGreaterThan(0.5);
    expect(slowed).toBeLessThan(covered * (chronoField.slow + 0.1));
  });

  it('场塌了立刻还手：主人倒地之后同一批帧里玩家回到全速', () => {
    const s = stage();
    tick(s, chronoField.telegraph + 0.1);
    expect(s.p.timeSlow).toBe(chronoField.slow);
    s.boss.die();
    s.m.update(1 / 64, s.p.position, s.p, null, null);
    s.p.update(1 / 64, {});
    expect(s.p.timeSlow).toBe(1);
  });

  it('那记无场时停也走账本：一个来源一个 key，不再直接写 `timeSlow`', () => {
    const s = stage({ timeStopCooldown: 0, arena: false });
    tick(s, 0.2);
    expect(s.p._timeScales.has('void-chronarch:time-stop')).toBe(true);
    expect(s.p.timeSlow).toBe(0.35);
    const srcText = src('combat/VoidBoss.js');
    expect(srcText).toMatch(/applyTimeScale\(/);
    expect(srcText).not.toMatch(/\.timeSlow\s*=/);
  });

  it('被打断不再把玩家永久留在慢里：断供之后绳子自己烧完', () => {
    const s = stage({ timeStopCooldown: 0, arena: false });
    tick(s, 0.2);
    expect(s.p.timeSlow).toBe(0.35);
    s.boss.takeDamage(60);                 // 蓄力法术打断（旧实现在这里漏了还原）
    tick(s, 0.5);
    expect(s.p.timeSlow).toBe(1);
    expect(s.p._timeScales.size).toBe(0);
  });

  it('死在时停里也不会把玩家留在慢里：`update` 早退那条路径同样靠绳子收口', () => {
    const s = stage({ timeStopCooldown: 0, arena: false });
    tick(s, 0.2);
    expect(s.p.timeSlow).toBe(0.35);
    s.boss.die();
    tick(s, 0.5);
    expect(s.p.timeSlow).toBe(1);
  });

  it('两片时标真的叠在一起时吃更狠的那份，场散了还剩那记无场的', () => {
    // 实测这一刻线（帧率 64Hz）：起手那一帧两条闸门都满足 —— 无场时停（`VoidBoss.update` 自己那条）
    // 与场地时停域（脚本表 `opportunity`）同帧起念，之后时停期间 Boss 早退、不再铺第二片。
    //   0.0~1.8  时停#1（0.35） + 场前摇 → 1.1 落地后叠成两格
    //   1.8~4.0  只剩场（0.3）
    //   4.0~4.7  时停#2（cooldown 4 在 4.0 到点）叠在场上 → 又两格
    //   4.7~5.8  场散（前摇 1.1 + 持续 3.6），只剩时停#2
    const s = stage({ timeStopCooldown: 0 });
    let clock = 0;
    const at = (t) => { tick(s, t - clock); clock = t; };
    at(1.5);
    expect(s.p._timeScales.size).toBe(2);
    expect(s.p.timeSlow).toBe(chronoField.slow);      // 叠着：吃更狠的那一格
    at(3.0);
    expect(s.p._timeScales.size).toBe(1);
    expect(s.p.timeSlow).toBe(chronoField.slow);
    at(4.3);
    expect(s.p._timeScales.size).toBe(2);
    expect(s.p.timeSlow).toBe(chronoField.slow);
    at(5.3);
    expect(s.p._timeScales.size).toBe(1);
    expect(s.p.timeSlow).toBe(0.35);                  // 场还了手，无场那一记还在身上
  });

  it('没危险区系统时不开场也不报错', () => {
    const lone = new VoidBoss(makeScene(), makeWorld(), { x: 0, z: 0 });
    expect(lone.hazards).toBe(null);
    expect(() => lone.update(1 / 64, v(10, 0), makePlayer())).not.toThrow();
    expect(lone.startDomain(v(10, 0), cast)).toBe(false);
  });
});
