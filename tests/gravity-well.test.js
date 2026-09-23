/**
 * 引力井（W-A6 切片4，B5 第三档：持续型危险区）。
 *
 * 前三档的圈都是"一击定音"：前摇 → 落地 → 余像。这一档多出一段**持续在场**的生命周期，
 * 需要证明的是四件事：
 * 1. **段数只由经过的秒数决定**：30Hz 与 144Hz 在一口井里挨的段数必须一样（B39 的纪律），
 *    而且一帧跨过多段时要一次补齐 —— 卡帧不该等于免单。
 * 2. **拉力写在玩家自己的速度上**：与 `SpaceBoss` 那记一次性拖拽同一条通道，
 *    所以无敌帧吞得掉伤害段、吞不掉位移（"这一下不算" ≠ "这一下别把我拖进去"）。
 * 3. **域跟着主人塌**：井还在 tick 时主人倒地，剩下的段数一笔勾销；
 *    已经落下的那一拍与余像照旧算数（切片1 的"不撤销已经许诺出去的伤害"仍然成立）。
 * 4. **散场回到池子里**：域比一击多活几秒，正是最容易漏网格的那几种生命周期。
 *
 * 单位用例自己交数值（不借 `GROUND_HAZARD.gravityWell`），这样"几秒几段"能写成精确断言：
 * `dt` 取 2 的幂（1/64、1/128），tick 边界在二进制浮点里可精确表示，两种帧率跑出来的
 * 段数是同一个整数，而不是"差一段也算过"的和稀泥。接线用例才回头读真表。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import { ARENA_MOVES, BOSS_ARENA_SCRIPTS, assertArenaScript } from '../src/content/arenaScripts.js';
import { SpaceBoss } from '../src/combat/SpaceBoss.js';
import { installWindowShim, makeWorld, makeScene, makePlayerRef, makeManager, v, until } from './helpers/enemyHarness.js';
import { makePlayer } from './helpers/playerHarness.js';

const { gravityWell } = GROUND_HAZARD;
/** "谁在什么时候开井"住在脚本表里；本文件测的是井本身 */
const cast = BOSS_ARENA_SCRIPTS['singularity-herald'].find((e) => e.move === 'well');
const realRandom = Math.random;

/** 单位用的井：整数秒、2 的幂帧长，段数可以逐段断言 */
const UNIT = {
  x: 0, z: 0, radius: 5, telegraph: 1, damage: 10,
  tick: 0.5, duration: 4, pull: 8, color: 0x4488ff,
};

beforeAll(() => {
  installWindowShim();
  Math.random = () => 0.99;      // 别在用例里顺手开出第二招
});

afterAll(() => {
  Math.random = realRandom;
});

/** 直接交给危险区系统一口井（不经 Boss），并把玩家摆到 `px` 米处 */
function dig(spec = {}) {
  const m = makeManager();
  const owner = { name: 'caster' };
  const item = m.hazards.spawn({ ...UNIT, ...spec, owner });
  const player = v(spec.px ?? 3, spec.pz ?? 0);
  const ref = makePlayerRef();
  ref.velocity = { x: 0, z: 0 };
  return { m, hz: m.hazards, item, player, ref, owner };
}

/** 以固定帧长推进 `seconds` 秒 */
function run(d, seconds, dt = 1 / 64) {
  for (let i = 0; i < Math.round(seconds / dt); i++) d.hz.update(dt, d.player, d.ref);
}

/** 走前摇直到落地（`telegraph` 正好一帧不许多跑） */
const land = (d, dt = 1 / 64) => run(d, UNIT.telegraph, dt);

const ticks = (d) => d.ref.hits.filter((h) => h === UNIT.damage).length;

describe('持续型危险区的生命周期', () => {
  it('落地那一拍照旧一击定音：圈内一次，段数从落地之后才起算', () => {
    const d = dig();
    land(d);
    expect(ticks(d)).toBe(1);
    expect(d.item.active).toBe(true);
  });

  it('段数 = 站在圈里的秒数 / tick：4 秒 ÷ 0.5 秒 = 8 段（外加落地那一下）', () => {
    const d = dig();
    land(d);
    run(d, 4);
    expect(ticks(d)).toBe(1 + UNIT.duration / UNIT.tick);
  });

  it('帧率无关：1/64 与 1/128 在同一口井里挨同样多的段', () => {
    const a = dig();
    land(a, 1 / 64);
    run(a, UNIT.duration, 1 / 64);
    const b = dig();
    land(b, 1 / 128);
    run(b, UNIT.duration, 1 / 128);
    expect(ticks(b)).toBe(ticks(a));
    expect(ticks(a)).toBe(1 + UNIT.duration / UNIT.tick);
  });

  it('一帧跨过多段要一次补齐：卡一帧 2 秒就是挨 4 段，不是 1 段', () => {
    const d = dig();
    land(d);
    d.hz.update(2, d.player, d.ref);
    expect(ticks(d)).toBe(1 + 2 / UNIT.tick);
  });

  it('圈外一段都不结算：超出半径 0.1 米就干净', () => {
    const d = dig({ px: UNIT.radius + 0.1 });
    land(d);
    run(d, UNIT.duration);
    expect(ticks(d)).toBe(0);
  });

  it('井塌了就是塌了：主人倒地后不再新增段，余像照常放完', () => {
    const d = dig();
    land(d);
    run(d, 1.2);
    const before = ticks(d);
    expect(before).toBeGreaterThan(1);
    d.hz.cancelFor(d.owner);
    expect(d.item.active).toBe(false);
    run(d, UNIT.duration);
    expect(ticks(d)).toBe(before);                    // 已许诺的那拍不追讨，剩下的段一笔勾销
    expect(d.hz.count()).toBe(0);                     // 但没有永远亮在地上的井
  });

  it('前摇里主人倒地：整枚撤掉，连落地那一拍都不给它', () => {
    const d = dig();
    run(d, 0.5);
    d.hz.cancelFor(d.owner);
    expect(d.hz.count()).toBe(0);
    run(d, UNIT.duration * 2);
    expect(ticks(d)).toBe(0);
  });

  it('一击定音的老圈子不受影响：落地后主人倒地，余像该看完', () => {
    const m = makeManager();
    const owner = { name: 'slammer' };
    m.hazards.spawn({ ...UNIT, duration: 0, tick: 0, pull: 0, owner });
    const player = v(3, 0);
    const ref = makePlayerRef();
    for (let i = 0; i < 64; i++) m.hazards.update(1 / 64, player, ref);
    expect(ref.hits).toEqual([UNIT.damage]);
    m.hazards.cancelFor(owner);                       // 已经落下的不撤（切片1 的契约）
    expect(m.hazards.count()).toBe(1);
    for (let i = 0; i < 64; i++) m.hazards.update(1 / 64, player, ref);
    expect(m.hazards.count()).toBe(0);
    expect(ref.hits).toEqual([UNIT.damage]);          // 也只结算那一次
  });

  it('散场回到池子里：一口井从生到死只借还一次网格', () => {
    const d = dig();
    expect(d.hz.pooled()).toBe(0);
    run(d, UNIT.telegraph + UNIT.duration + GROUND_HAZARD.linger + 0.1);
    expect(d.hz.count()).toBe(0);
    expect(d.hz.pooled()).toBe(1);
    d.hz.spawn({ ...UNIT });                          // 第二口井复用同一枚圆盘，不新建
    expect(d.hz.pooled()).toBe(0);
    expect(d.hz.count()).toBe(1);
  });

  it('持续期圆盘停在满半径，透明度在 warn 与 burst 之间脉动', () => {
    const d = dig();
    land(d);
    run(d, 0.5);
    expect(d.item.disc.scale.x).toBeCloseTo(UNIT.radius, 6);
    const { warn, burst } = GROUND_HAZARD.opacity;
    for (let i = 0; i < 32; i++) {
      d.hz.update(1 / 64, d.player, d.ref);
      expect(d.item.disc.material.opacity).toBeGreaterThanOrEqual(warn - 1e-9);
      expect(d.item.disc.material.opacity).toBeLessThanOrEqual(burst + 1e-9);
    }
  });

  it('duration 没有 tick 是句空话：交出来的当刻就抛错', () => {
    const m = makeManager();
    expect(() => m.hazards.spawn({ ...UNIT, tick: 0 })).toThrow(/tick/);
    expect(() => m.hazards.spawn({ ...UNIT, tick: -1 })).toThrow(/tick/);
    expect(() => m.hazards.spawn({ ...UNIT, duration: 0, tick: 0 })).not.toThrow();
  });
});

describe('引力井的拉力', () => {
  it('往圆心拽：玩家在 +x 侧，速度就往 -x 走', () => {
    const d = dig({ px: 3 });
    land(d);
    run(d, 0.2);
    expect(d.ref.velocity.x).toBeLessThan(0);
  });

  it('圆心附近收手：离中心不到 0.4 米不再加速，免得在原点上抖', () => {
    const d = dig({ px: 0.2 });
    land(d);
    run(d, 1.2);
    expect(d.ref.velocity.x).toBe(0);
    expect(ticks(d)).toBeGreaterThan(1);              // 拉力免了，段数不免：那里正是井心
  });

  it('拉力是"每帧一点"，不是"一次性冲量"：帧长减半则单次增量也减半', () => {
    const a = dig();
    land(a);
    a.hz.update(1 / 64, a.player, a.ref);
    const per64 = a.ref.velocity.x;
    const b = dig();
    land(b);
    b.hz.update(1 / 128, b.player, b.ref);
    expect(b.ref.velocity.x).toBeCloseTo(per64 / 2, 12);
  });

  it('无敌帧吞得掉段数，吞不掉位移：翻滚躲不掉被拖回井心', () => {
    const d = dig();
    land(d);                                   // 落地那一拍先兑现（此时还没无敌）
    d.ref.invulnerable = true;
    run(d, 1.2);
    expect(ticks(d)).toBe(1);                  // 之后的段一段都进不来
    expect(d.ref.velocity.x).toBeLessThan(0);
  });

  it('圈外既不结算也不拽人', () => {
    const d = dig({ px: UNIT.radius + 0.1 });
    land(d);
    run(d, 1);
    expect(ticks(d)).toBe(0);
    expect(d.ref.velocity.x).toBe(0);
    expect(d.ref.velocity.z).toBe(0);
  });

  it('pull 为 0 的域只烧血不拖人：持续型危险区不必然带引力', () => {
    const d = dig({ pull: 0 });
    land(d);
    run(d, 1.2);
    expect(d.ref.velocity.x).toBe(0);
    expect(ticks(d)).toBe(1 + 1 / UNIT.tick);
  });

  it('没有玩家参照时整段跳过：域自己走完钟，不报错也不结算', () => {
    const m = makeManager();
    m.hazards.spawn({ ...UNIT });
    // 一口井从生到死：前摇 1 + 持续 4 + 余像 0.3
    for (let i = 0; i < 400; i++) m.hazards.update(1 / 64, null, null);
    expect(m.hazards.count()).toBe(0);
    expect(m.hazards.pooled()).toBe(1);
  });
});

describe('引力化身开井（脚本表接线）', () => {
  /** 引力化身的舞台：真表数值 + 关掉它自己那记一次性拖拽，免得污染速度断言 */
  function stage(over = {}) {
    const m = makeManager();
    const boss = m.spawnSpaceBoss({ x: 0, z: 0, respawn: false, ...over.config });
    boss.phase = over.phase ?? 3;
    boss.speed = 0;
    boss.pullCooldown = 1e9;
    return { m, boss, player: over.player ?? v(10, 0), ref: makePlayerRef() };
  }

  const tick = (m, seconds, player, ref) => {
    for (let i = 0; i < Math.round(seconds * 64); i++) m.update(1 / 64, player, ref, null, null);
  };

  const wells = (hz) => hz._items.filter((it) => it.duration > 0);

  it('井的形状与伤害读真表：duration/tick/pull 一路传进危险区', () => {
    const s = stage();
    s.boss.startGravityWell(s.player, cast);
    const [it] = wells(s.m.hazards);
    expect(it).toBeTruthy();
    expect(it.radius).toBe(gravityWell.radius);
    expect(it.telegraph).toBe(gravityWell.telegraph);
    expect(it.damage).toBe(gravityWell.damage);
    expect(it.duration).toBe(gravityWell.duration);
    expect(it.tick).toBe(gravityWell.tick);
    expect(it.pull).toBe(gravityWell.pull);
    expect(it.disc.material.color.getHex()).toBe(gravityWell.color);
    expect(it.owner).toBe(s.boss);
  });

  it('二阶段不开井：phase 闸门在驱动里，不在井自己身上', () => {
    const s = stage({ phase: 2 });
    tick(s.m, 1, s.player, s.ref);
    expect(wells(s.m.hazards)).toHaveLength(0);
  });

  it('超出脚本给的 range 不开井', () => {
    const s = stage({ player: v(cast.range + 8, 0) });
    tick(s.m, 1, s.player, s.ref);
    expect(wells(s.m.hazards)).toHaveLength(0);
  });

  it('冷却没走完不开第二口：井与井之间隔 cooldown 秒', () => {
    const s = stage();
    const life = gravityWell.telegraph + gravityWell.duration + GROUND_HAZARD.linger + 0.2;
    tick(s.m, life, s.player, s.ref);
    expect(s.m.hazards.count()).toBe(0);
    tick(s.m, cast.cooldown - life - 0.4, s.player, s.ref);
    expect(wells(s.m.hazards)).toHaveLength(0);
    tick(s.m, 0.6, s.player, s.ref);
    expect(wells(s.m.hazards)).toHaveLength(1);
  });

  it('井口开在玩家此刻的位置，并夹回竞技场内', () => {
    const s = stage({ config: { arenaRadius: 8 } });
    s.player.x = 7.6;
    s.m.update(1 / 64, s.player, s.ref, null, null);
    const [it] = wells(s.m.hazards);
    const limit = s.boss.arenaRadius - gravityWell.radius;
    expect(Math.hypot(it.x, it.z)).toBeLessThanOrEqual(limit + 1e-6);
    expect(limit - Math.hypot(it.x, it.z)).toBeLessThan(0.01);   // 必须真的夹到，否则是空跑
  });

  it('引力化身的舞台在第三阶段一次开齐：井一枚 + 弹幕一片，互不顶掉', () => {
    const s = stage();
    s.m.update(1 / 64, s.player, s.ref, null, null);
    expect(wells(s.m.hazards)).toHaveLength(1);
    expect(s.m.hazards.count()).toBe(1 + GROUND_HAZARD.barrage.count);
    // 两条 opportunity 的 range 不同（井 15 米 / 弹幕 22 米）：站得远只落弹幕，不开井
    const far = stage({ player: v(19, 0) });
    far.m.update(1 / 64, far.player, far.ref, null, null);
    expect(wells(far.m.hazards)).toHaveLength(0);
    expect(far.m.hazards.count()).toBe(GROUND_HAZARD.barrage.count);
  });

  it('两条钟各走各的：弹幕 9 秒复铺时，井的 12 秒还没到', () => {
    const s = stage();
    s.m.update(1 / 64, s.player, s.ref, null, null);
    tick(s.m, 9.2, s.player, s.ref);
    // 第一口井（1.4 + 3 + 0.3 秒）早已收场，第二口要等满 cooldown 才开
    expect(wells(s.m.hazards)).toHaveLength(0);
    expect(s.m.hazards.count()).toBe(GROUND_HAZARD.barrage.count);   // 弹幕复铺了第二波
    tick(s.m, 3, s.player, s.ref);
    expect(wells(s.m.hazards)).toHaveLength(1);
  });

  /** 井那口圈造成的段（弹幕一枚 20 点，与井的 6 点分得开） */
  const wHits = (ref) => ref.hits.filter((h) => h === gravityWell.damage);

  it('站住连吃整口井：落地一拍 + 每秒 floor(duration/tick) 段', () => {
    const still = stage();
    tick(still.m, gravityWell.telegraph + 0.8, still.player, still.ref);
    expect(wHits(still.ref)).toHaveLength(1 + Math.floor(0.8 / gravityWell.tick));
  });

  it('起手外跑 8 米/秒：井一段都吃不到（它买的是"你有没有在动"）', () => {
    const run = stage();
    const step = 8 / 64;                                        // 8 米/秒，低于玩家基础移速
    // 跑过整口井的寿命（前摇 + 持续）再多 1 秒：这段路走 8 米/秒 = 8.2 米 > 井半径 5.5 米
    for (let i = 0; i < Math.round(8.2 * 64); i++) {
      run.player.x += step;
      run.m.update(1 / 64, run.player, run.ref, null, null);
    }
    expect(wHits(run.ref)).toEqual([]);
  });

  it('井还在 tick 时主人倒地：剩下的段数勾销，已落的那拍留账', () => {
    const s = stage();
    tick(s.m, gravityWell.telegraph + 0.8, s.player, s.ref);
    const before = s.ref.hits.length;
    expect(before).toBeGreaterThan(1);
    s.boss.die();
    tick(s.m, gravityWell.duration, s.player, s.ref);
    expect(s.ref.hits).toHaveLength(before);
    expect(until(s.m, 1, 1 / 64, s.player, s.ref, () => s.m.hazards.count() === 0)).toBe(true);
  });

  it('没有危险区系统时不开井也不报错', () => {
    const lone = new SpaceBoss(makeScene(), makeWorld(), { x: 0, z: 0 });
    expect(lone.hazards).toBe(null);
    expect(() => lone.update(1 / 64, v(10, 0), makePlayerRef())).not.toThrow();
    expect(lone.startGravityWell(v(10, 0), cast)).toBe(false);
  });
});

describe('场地脚本认得井', () => {
  it('ARENA_MOVES.well 指向真表里的 gravityWell', () => {
    expect(ARENA_MOVES.well).toBe('gravityWell');
    expect(GROUND_HAZARD[ARENA_MOVES.well]).toBe(gravityWell);
  });

  it('gravityWell 带齐一口井该有的三件事：duration / tick / pull', () => {
    expect(gravityWell.duration).toBeGreaterThan(0);
    expect(gravityWell.tick).toBeGreaterThan(0);
    expect(gravityWell.tick).toBeLessThan(gravityWell.duration);
    expect(gravityWell.pull).toBeGreaterThan(0);
  });

  it('站住一整口井的总伤害有上限：不至于比一次砸地还便宜，也不至于秒杀', () => {
    const total = gravityWell.damage * (1 + Math.floor(gravityWell.duration / gravityWell.tick));
    expect(total).toBeGreaterThan(GROUND_HAZARD.bossSlam.damage * 0.8);
    expect(total).toBeLessThan(GROUND_HAZARD.bossSlam.damage * 1.6);
  });

  it('抄错招式的表在构建期就红：井的名字、phase 闸门、冷却都要对', () => {
    // 把 'well' 抄成 'wells'：不该静默退回 default 脚本，要在加载期抛错
    expect(() => assertArenaScript({
      x: [{ move: 'wells', phase: 2, trigger: 'opportunity', cooldown: 1, range: 1 }],
    })).toThrow(/ARENA_MOVES/);
    // phase 写错（井只挂在第三阶段，写成 4 就永远开不出来）
    expect(() => assertArenaScript({
      x: [{ move: 'well', phase: 4, trigger: 'opportunity', cooldown: 1, range: 1 }],
    })).toThrow(/phase/);
    // opportunity 少给 cooldown：`_arenaCd[i] = undefined` 会让这一招每帧都开
    expect(() => assertArenaScript({
      x: [{ move: 'well', phase: 3, trigger: 'opportunity', range: 15 }],
    })).toThrow(/cooldown/);
  });

  it('Boss.js 只用 move 名分发，不把井的数值抄进代码', () => {
    const src = readFileSync(join(process.cwd(), 'src/combat/Boss.js'), 'utf8');
    expect(src).toMatch(/ARENA_MOVES\[entry\.move\]|this\.arenaSpec\(entry\)/);
    expect(src).not.toMatch(/gravityWell\s*:\s*\{/);            // 数值住在 tuning，不在这里另立一份
    expect(src).toMatch(/duration: spec\.duration/);            // 三件事逐项传下去
    expect(src).toMatch(/tick: spec\.tick/);
    expect(src).toMatch(/pull: spec\.pull/);
  });
});

/**
 * 井与**真实位移**的合力（W-A6 切片4 的最后一问）。
 *
 * 前两节用的是替身玩家：危险区往 `ref.velocity` 上写冲量，写没写进去看得见，
 * 但"玩家到底会不会被拖着走"要过一遍真的 `PlayerController.update` 才知道 ——
 * 状态机在有输入时是**直接改写**速度的（`moveHorizontal`），拉力会不会被抹掉，
 * 只有真位移路径答得出来。帧序照主循环排：玩家先积分，危险区后写下一帧的速度。
 */
describe('井与真实位移（PlayerController 全程参与）', () => {
  const dt = 1 / 64;

  /** 真玩家站在井内 `playerX` 米处，前摇刚走完（井已经落在地上） */
  function digAt(playerX) {
    const m = makeManager();
    const p = makePlayer();
    p.position.set(playerX, 0, 0);
    // 正前方 = +x（与 `applyDash` 同一套朝向约定）；`targetYaw` 也得改，
    // 否则 `_advanceYaw` 第一帧就把 yaw 拉回宿主预设的朝向，输入方向就成了 -z
    p.yaw = p.targetYaw = Math.PI / 2;
    m.hazards.spawn({ ...UNIT, x: 0, z: 0 });
    for (let i = 0; i < Math.round(UNIT.telegraph / dt); i++) {
      p.update(dt, {});
      m.hazards.update(dt, p.position, p);
    }
    return { m, p };
  }

  const step = (m, p, seconds, keys) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      p.update(dt, keys);
      m.hazards.update(dt, p.position, p);
    }
  };

  it('站着不动会被拖向井心：拉力走的是玩家自己的位移积分', () => {
    const { m, p } = digAt(4);
    const before = p.position.x;
    step(m, p, 1, {});
    const dragged = before - p.position.x;
    expect(dragged).toBeGreaterThan(0.1);         // 一米一秒太轻就等于没有拉力
    expect(dragged).toBeLessThan(1.5);            // 也不该是"一口就把人吸到井心"那种无解的井
    expect(p.hits.length).toBeGreaterThan(1);     // 走不掉自然就一段都躲不开
  });

  it('按住背离方向就出得去：拉力买的是"停下"，不是"跑不动"', () => {
    const { m, p } = digAt(4);
    step(m, p, 1, { KeyW: true });                // +x = 背离井心
    expect(p.position.x).toBeGreaterThan(UNIT.radius);
    expect(p.hits).toEqual([UNIT.damage]);        // 只剩落地那一拍
  });

  it('拉力写的是真 Vector3 的 x 分量：不是给替身塞了一个字段', () => {
    const { m, p } = digAt(4);
    const before = p.velocity.x;
    m.hazards.update(dt, p.position, p);
    expect(p.velocity.x).toBeLessThan(before);    // 圆心在原点 = 往 -x 走
  });
});
