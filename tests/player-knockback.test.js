/**
 * 玩家侧的外部冲量通道（W-A6 切片6）。
 *
 * 切片4 留下的一条尾巴在这里结清：引力井从前把拉力直接加在 `playerRef.velocity` 上，
 * 而玩家有输入时状态机是**整条改写**水平速度的（`moveHorizontal` 里 `velocity = dir * speed`），
 * 于是"按住方向键"每一帧都把拉力抹干净 —— 一口号称持续拽人的井，对任何一个还在按键的人无效。
 * 反过来站着不动时又只剩 locomotion 的摩擦在拦它。两个方向都不对：外力的钟不该借在玩家的速度上。
 *
 * 这一片给它自己的账：`PlayerController.knock`。三条纪律：
 * 1. **外力不写 `velocity`**（那是玩家意图的账），只在积分那一瞬间与速度相加，所以谁也不覆盖谁；
 * 2. **两条通道各衰减各的**（合起来的稳态速度 = `pull / decay`）—— 如果把外力先并进 `velocity`
 *    再让 locomotion 的摩擦去衰减它，同一个拉力就被积分两遍，稳态速度会随帧率翻倍；
 * 3. **位移按衰减曲线的本帧平均积分**（与 `Enemy._advance` 同一套），30Hz 与 240Hz 走出同一条轨迹。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIT, PLAYER_KNOCK, GROUND_HAZARD } from '../src/content/tuning.js';
import { installWindowShim, makePlayerRef, makeManager, v } from './helpers/enemyHarness.js';
import { makePlayer, runFrames } from './helpers/playerHarness.js';

const realRandom = Math.random;
const dt = 1 / 64;

beforeAll(() => {
  installWindowShim();
  Math.random = () => 0.99;
});

afterAll(() => {
  Math.random = realRandom;
});

const speedOf = (p) => Math.hypot(p.knock.x, p.knock.z);

describe('冲量账：外力有它自己的钟', () => {
  it('方向不必预先归一：斜着报的方向，记进来的长度就是请求的速度', () => {
    const p = makePlayer();
    expect(p.applyKnockback(3, 4, 6)).toBe(6);
    expect(speedOf(p)).toBeCloseTo(6, 10);
    expect(p.knock.x).toBeCloseTo(6 * 0.6, 10);      // (3,4) 归一 = (0.6, 0.8)
    expect(p.knock.z).toBeCloseTo(6 * 0.8, 10);
  });

  it('不请不动：速度不为正、方向为零向量时不进账，也不抛', () => {
    const p = makePlayer();
    expect(p.applyKnockback(1, 0, 0)).toBe(0);
    expect(p.applyKnockback(1, 0, -3)).toBe(0);
    expect(p.applyKnockback(0, 0, 5)).toBe(0);
    expect(speedOf(p)).toBe(0);
  });

  it('同向相加、反向相消：两笔对冲之后账上剩净的那一份', () => {
    const p = makePlayer();
    p.applyKnockback(1, 0, 6);
    p.applyKnockback(-1, 0, 2);
    expect(p.knock.x).toBeCloseTo(4, 10);
    p.applyKnockback(-1, 0, 4);
    expect(p.knock.x).toBe(0);                       // 正好抵消，不留 -0 之类的浮点尾巴
  });

  it('封顶不封向：十笔同向叠到 `maxSpeed` 就停，方向还是那一笔的方向', () => {
    const p = makePlayer();
    for (let i = 0; i < 10; i++) p.applyKnockback(3, 4, 6);
    expect(speedOf(p)).toBeCloseTo(PLAYER_KNOCK.maxSpeed, 10);
    expect(p.knock.z / p.knock.x).toBeCloseTo(4 / 3, 10);
  });

  it('账按秒指数衰减：断供之后自己归零，小额不留浮点尾巴', () => {
    const p = makePlayer();
    p.applyKnockback(1, 0, 6);
    for (let i = 0; i < Math.round(0.4 / dt); i++) p._stepKnock(dt);
    expect(p.knock.x).toBeGreaterThan(0);            // 0.4 秒还剩一点尾冲：那一拃路是设计里的
    for (let i = 0; i < Math.round(0.6 / dt); i++) p._stepKnock(dt);
    expect(p.knock.x).toBe(0);
  });

  it('衰减与帧率无关：64Hz 与 128Hz 跑过同样的秒数，余额与累计位移都相同', () => {
    const a = makePlayer();
    const b = makePlayer();
    a.applyKnockback(1, 0, 6);
    b.applyKnockback(1, 0, 6);
    let da = 0;
    let db = 0;
    for (let i = 0; i < Math.round(1 / dt); i++) da += a._stepKnock(dt).x * dt;
    for (let i = 0; i < Math.round(1 / (dt / 2)); i++) db += b._stepKnock(dt / 2).x * (dt / 2);
    expect(b.knock.x).toBeCloseTo(a.knock.x, 6);
    expect(db).toBeCloseTo(da, 4);
    expect(da).toBeGreaterThan(0);
  });

  it('一帧跨一整秒也只用积分值：位移 = 起始速度 × (1 - e^-λ)/λ，不是起始值 × dt', () => {
    const p = makePlayer();
    p.applyKnockback(1, 0, 6);
    const exact = 6 * (1 - Math.exp(-PLAYER_KNOCK.decay)) / PLAYER_KNOCK.decay;
    expect(p._stepKnock(1).x * 1).toBeCloseTo(exact, 10);
  });

  it('持续力的稳态速度与帧率无关：64Hz 与 128Hz 都稳在 `accel / decay`', () => {
    const step = (p, h) => {
      for (let i = 0; i < Math.round(1 / h); i++) {
        p._stepKnock(h);
        p.applySustainedForce(1, 0, 8, h);
      }
      return p.knock.x;
    };
    const slow = step(makePlayer(), dt);
    const fast = step(makePlayer(), dt / 2);
    expect(slow).toBeCloseTo(8 / PLAYER_KNOCK.decay, 4);   // 每帧"加 a·dt 再衰减"会高出 8.9%
    expect(fast).toBeCloseTo(slow, 4);
  });
});

describe('位移合成：外力不污染玩家的速度账', () => {
  it('`_stepKnock` 只交出差值，不写 velocity', () => {
    const p = makePlayer();
    p.applyKnockback(1, 0, 6);
    const before = p.velocity.x;
    p._stepKnock(dt);
    expect(p.velocity.x).toBe(before);
  });

  it('没有账的一帧是零开销：返回的是同一个复用槽，且分量为零（M4 不许热路径分配）', () => {
    const p = makePlayer();
    const first = p._stepKnock(dt);
    expect(first.x).toBe(0);
    expect(first.z).toBe(0);
    expect(p._stepKnock(dt)).toBe(first);            // 同一个对象：每帧新建会让 GC 参与手感
  });

  it('传送无条件清账：人已经离开那块地，拽他的井不该跟着跨过地图', () => {
    const p = makePlayer();
    p.applyKnockback(1, 0, 6);
    p.teleport(500, 2, 500, { keepVelocity: true });
    expect(speedOf(p)).toBe(0);
  });

  it('外力只碰水平面：账本没有竖直那一格，跳与重力仍是玩家自己的事', () => {
    const p = makePlayer();
    expect(Object.keys(p.knock).sort()).toEqual(['x', 'z']);
    p.position.y = 5;                                // 在空中测，免得落地那一帧把 y 速度清零
    p.velocity.y = 7;
    p.applyKnockback(1, 0, 6);
    runFrames(p, 0.2, dt, {});
    expect(p.velocity.y).toBeLessThan(7);            // 只被重力拉下去，外力没插手
    expect(p.velocity.y).toBeGreaterThan(0);
  });
});

describe('与真实位移：站住、按住方向、翻滚', () => {
  /** 一根不带衰减的"手"：每帧按 `pull · dt` 持续往 -x 拽，模拟一口井 */
  const tug = (p, seconds, pull, step = dt) => {
    for (let i = 0; i < Math.round(seconds / step); i++) {
      p.update(step, {});
      p.applySustainedForce(-1, 0, pull, step);
    }
    return p.position.x;
  };

  it('站住会被拖着走：一秒走过的距离落在"有感、但不夺走控制权"的带里', () => {
    const p = makePlayer();
    const pull = GROUND_HAZARD.gravityWell.pull;
    const moved = tug(p, 1, pull);
    const terminal = pull / PLAYER_KNOCK.decay;
    expect(-moved).toBeGreaterThan(terminal * 0.8);  // 起步那一小段之外，拉力基本满格
    expect(-moved).toBeLessThan(terminal * 1.05);    // 也不会越跑越快把人吸进井心
    expect(p.velocity.x).toBe(0);                    // 玩家没按键：他的速度账仍然是干净的零
  });

  it('按住背离方向仍出得去，但每一帧都被拽走一点（切片6 之前这里是整条抹掉）', () => {
    const keys = { KeyW: true };
    const pull = GROUND_HAZARD.gravityWell.pull;
    const frames = Math.round(1 / dt);

    const free = makePlayer();                       // 圈外：没有井在拽
    free.yaw = free.targetYaw = Math.PI / 2;         // 正前方 = +x
    const freeD = runFrames(free, 1, dt, keys).x;

    const dragged = makePlayer();                    // 圈内：同样按住不放
    dragged.yaw = dragged.targetYaw = Math.PI / 2;
    for (let i = 0; i < frames; i++) {
      dragged.update(dt, keys);
      dragged.applyKnockback(-1, 0, pull * dt);      // -x = 朝井心，正好与人往回拽
    }
    const dragD = dragged.position.x;

    expect(freeD).toBeGreaterThan(14);               // 全速跑一秒 ≈ 15 米
    // 同一份按键，被拽的那位一秒少走 `pull / decay` 那一截：有感、但出得去
    expect(freeD - dragD).toBeGreaterThan(0.6);
    expect(freeD - dragD).toBeLessThan(0.85);
    expect(dragD).toBeGreaterThan(10);               // 这一档买的是"停下"，不是"跑不动"
  });

  it('断供之后就停：尾冲只有一拃（≈ 稳态速度 / decay），不是一段幽灵滑行', () => {
    const p = makePlayer();
    tug(p, 0.5, 8);
    const v0 = p.position.x;
    runFrames(p, 1, dt, {});
    const glide = Math.abs(p.position.x - v0);
    expect(glide).toBeGreaterThan(0.01);             // 确实还带着一点尾冲（物理上不可能瞬间停）
    expect(glide).toBeLessThan(0.12);                // 但一秒内干净收口
    expect(speedOf(p)).toBe(0);
  });

  it('翻滚期间外力照叠：位移冲量与外力各有各的账，谁也不覆盖谁', () => {
    const p = makePlayer();
    p.yaw = p.targetYaw = Math.PI / 2;               // 正前方 = +x
    p.applyDash(Math.PI / 2, 22, 0.28);
    p.applyKnockback(-1, 0, 6);
    const x0 = p.position.x;
    p.update(dt, {});
    const step = p.position.x - x0;
    expect(p.velocity.x).toBeGreaterThan(20);        // 翻滚的冲量仍是那一段的主导
    expect(step).toBeLessThan(p.velocity.x * dt);    // 但外力把这一步拽短了
    expect(p.knock.x).toBeLessThan(0);
  });
});

describe('施法者一侧：井与引力化身都走这条通道', () => {
  it('SpaceBoss 那记凭空拖拽进的是冲量账，不是 `velocity`', () => {
    const m = makeManager();
    const boss = m.spawnSpaceBoss({ x: 0, z: 0, respawn: false });
    boss.phase = 2;
    boss.pullCooldown = 0;
    const player = v(10, 0);
    const ref = makePlayerRef();
    boss.update(1 / 64, player, ref);
    expect(ref.tugs.length).toBe(1);
    expect(ref.tugs[0].speed).toBe(6);
    expect(ref.tugs[0].dx).toBeLessThan(0);          // 玩家在 +x，方向朝心 = -x
    expect(ref.velocity).toBeUndefined();            // 再没有第二条写速度的路
  });

  it('井里的稳态漂移 = pull / decay：外力的钟归冲量账管，不借玩家的速度', () => {
    const spec = GROUND_HAZARD.gravityWell;
    const m = makeManager();
    const p = makePlayer();
    p.position.set(spec.radius - 1, 0, 0);
    m.hazards.spawn({ ...spec, x: 0, z: 0, damage: 0 });
    for (let i = 0; i < Math.round((spec.telegraph + 1) / dt); i++) {
      p.update(dt, {});
      m.hazards.update(dt, p.position, p);
    }
    expect(speedOf(p)).toBeCloseTo(spec.pull / PLAYER_KNOCK.decay, 2);
    expect(p.velocity.x).toBe(0);                    // 一秒过去了，玩家那本账上一个子都没多
  });

  it('静态门禁：危险区与引力化身都不许再直接改玩家的 velocity', () => {
    for (const file of ['src/combat/GroundHazards.js', 'src/combat/SpaceBoss.js']) {
      const src = readFileSync(join(__dirname, '..', file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      expect(src).not.toMatch(/velocity\s*\.\w+\s*[-+*/]?=/);
    }
  });

  it('两边的衰减同档：我推敌人一下与场拽我一下，衰减的是同一个钟', () => {
    expect(PLAYER_KNOCK.decay).toBe(HIT.decay);
  });
});
