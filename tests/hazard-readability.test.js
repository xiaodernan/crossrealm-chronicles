/**
 * 场地危险区的**可读性**（W-A6 切片9，M5 + M6）。
 *
 * ## 这一片在收什么
 *
 * 切片1~8 把"红圈不说谎"（圈画多大伤多宽）、"圈与施法者解耦"、"一击定音"都钉住了，
 * 但圈本身仍只是一块**从 25% 涨满的半透明圆盘**。两条玩家侧的真问题：
 *
 * ① **M5 边缘环**：前摇前半段，盘只有最终大小的 25% —— 玩家看到的是"一块会长大的圆"，
 *    而不是"这块地将会归它"。站不站得出圈，要等圈涨满才判得了。边缘环从第一帧就按
 *    **真实半径**画：边界即承诺，填充只是动画。
 * ② **M6 落地提示音**：视线在地图别处（看血条 / 看小地图 / 看 Boss）的玩家，看不见
 *    圈涨满的那一刻。落地前 0.2 秒一声短提示，给的是"听见就该迈步"的提前量。
 *
 * 三条边界写在这里，将来有人想"优化"时先看见：
 * - 环**不参与**涨大与脉动（那是盘的语言）；环只回答"边界在哪"。
 * - 提示音**一个圈只响一次**，落地后不补；被 `cancelFor` 撤掉的圈不会响
 *   （它当场离开 `_items`，走不到发音那一行）。
 * - 音频句柄**可空**：node 用例与无音频场景不传，调用点走可选链，不抛。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GroundHazards } from '../src/combat/GroundHazards.js';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import {
  installWindowShim, makeWorld, makeScene, makePlayerRef, v,
} from './helpers/enemyHarness.js';

const { bossSlam, gravityWell, homingStrike } = GROUND_HAZARD;
const realRandom = Math.random;

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

beforeAll(() => {
  installWindowShim();
  Math.random = () => 0.99;
});

afterAll(() => {
  Math.random = realRandom;
});

describe('M5 边缘环：边界从第一帧就是真的', () => {
  it('环按真实半径常显，填充盘照旧从 25% 涨满（两件几何各答各的问）', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const it = slamAt(h);
    const ref = makePlayerRef();
    h.update(1 / 60, v(99, 99), ref);
    // 第一帧：环就是判定半径，盘还只有 growFrom 那一档
    expect(it.ring.visible).toBe(true);
    expect(it.ring.scale.x).toBeCloseTo(bossSlam.radius, 6);
    expect(it.disc.scale.x).toBeLessThan(bossSlam.radius);
    // 前摇中段：环纹丝不动，盘在涨
    tick(h, bossSlam.telegraph * 0.5, 1 / 60, v(99, 99), ref);
    expect(it.ring.scale.x).toBeCloseTo(bossSlam.radius, 6);
    expect(it.disc.scale.x).toBeGreaterThan(bossSlam.radius * GROUND_HAZARD.growFrom);
    // 环贴地高于盘面：同高度会 Z-fighting，玩家看到的是闪烁而不是边界
    expect(it.ring.position.y).toBeGreaterThan(it.disc.position.y);
    // 环用的是共享的单位环（按半径缩放，不是每圈一份几何）
    expect(it.ring.geometry.parameters.outerRadius).toBe(1);
    expect(it.ring.geometry).toBe(h.ringGeometry);
  });

  it('追踪圈的环跟着盘走，锁死后钉在原地', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const ref = makePlayerRef();
    const it = h.spawn({
      x: 0, z: 0, owner: null,
      radius: homingStrike.radius, telegraph: homingStrike.telegraph,
      damage: homingStrike.damage, color: homingStrike.color, track: homingStrike.track,
    });
    // 前摇的前 track 段：玩家在动，环与盘一起跟
    h.update(1 / 60, v(3, 0), ref);
    expect(it.ring.position.x).toBeCloseTo(3, 6);
    expect(it.disc.position.x).toBeCloseTo(3, 6);
    // 跟满跟踪窗（telegraph × track）那一刻锁死：锁之前贴着玩家走
    tick(h, homingStrike.telegraph * homingStrike.track, 1 / 60, v(3, 0), ref);
    const 锁定x = it.ring.position.x;
    expect(锁定x).toBeCloseTo(3, 6);
    // 锁定之后：玩家走到天涯海角，环都不再动
    tick(h, homingStrike.telegraph + 0.5, 1 / 60, v(30, 0), ref);
    expect(it.ring.position.x).toBeCloseTo(锁定x, 6);
    tick(h, 0.5, 1 / 60, v(-30, 0), ref);
    expect(it.ring.position.x).toBeCloseTo(锁定x, 6);
  });

  it('域（引力井）持续段环一直亮着：被拽的那几秒"再迈一步就出去"看得见', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const ref = makePlayerRef();
    const it = h.spawn({
      x: 0, z: 0, owner: null,
      radius: gravityWell.radius, telegraph: gravityWell.telegraph,
      damage: gravityWell.damage, color: gravityWell.color,
      tick: gravityWell.tick, duration: gravityWell.duration, pull: gravityWell.pull,
    });
    tick(h, gravityWell.telegraph + gravityWell.duration * 0.5, 1 / 60, v(99, 99), ref);
    expect(it.active).toBe(true);
    expect(it.ring.visible).toBe(true);
    expect(it.ring.material.opacity).toBeCloseTo(GROUND_HAZARD.opacity.edge, 6);
    expect(it.ring.scale.x).toBeCloseTo(gravityWell.radius, 6);
  });

  it('余像段环跟着淡出；回收后环摘出分组、回池，与盘一口池', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const it = slamAt(h);
    const ref = makePlayerRef();
    tick(h, bossSlam.telegraph + GROUND_HAZARD.linger * 0.5, 1 / 60, v(99, 99), ref);
    expect(it.ring.visible).toBe(true);
    expect(it.ring.material.opacity).toBeLessThan(GROUND_HAZARD.opacity.edge);
    tick(h, GROUND_HAZARD.linger, 1 / 60, v(99, 99), ref);
    expect(it.ring.visible).toBe(false);
    expect(it.ring.parent).toBe(null);
    expect(h.ringPooled()).toBe(1);
    expect(h.pooled()).toBe(1);
  });

  it('环与盘同峰值池化：并发六圈借六环，回收后各剩一枚', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    for (let i = 0; i < 6; i++) slamAt(h);
    expect(h.count()).toBe(6);
    expect(h.group.children.length).toBe(12);   // 6 盘 + 6 环，一件不多
    expect(h.ringPooled()).toBe(0);
    for (let i = 0; i < 6; i++) tick(h, bossSlam.telegraph + 1, 1 / 60, v(99, 99), makePlayerRef());
    expect(h.count()).toBe(0);
    expect(h.group.children.length, '六圈全回收后分组里一件不剩').toBe(0);
    // 池按峰值长：并发六个就借六个，回收后六个都在池里等下一场（新建网格数 = 同时在场最大数）
    expect(h.pooled()).toBe(6);
    expect(h.ringPooled()).toBe(6);
    // 再放一个圈走池里的旧件：不新建，池各退一枚
    slamAt(h);
    expect(h.pooled()).toBe(5);
    expect(h.ringPooled()).toBe(5);
    expect(h.group.children.length).toBe(2);
  });
});

describe('M6 落地提示音：落地前 0.2 秒，一声，只一声', () => {
  const 带录音 = () => {
    const 响 = [];
    const audio = { hazardWarn: () => 响.push(1) };
    return { 响, h: new GroundHazards(makeScene(), makeWorld(), audio) };
  };

  it('窗口前不响、窗口内响一次、落地后不补响', () => {
    const { 响, h } = 带录音();
    const ref = makePlayerRef();
    slamAt(h);
    tick(h, bossSlam.telegraph - 0.3, 1 / 60, v(99, 99), ref);
    expect(响.length, '离落地还有 0.3 秒就响 —— 提前量成了全程倒计时').toBe(0);
    tick(h, 0.25, 1 / 60, v(99, 99), ref);          // 跨进最后 0.2 秒
    expect(响.length).toBe(1);
    tick(h, 1, 1 / 60, v(99, 99), ref);             // 落地并走完余像
    expect(响.length, '落地后又补响了').toBe(1);
  });

  it('被撤掉的圈不响：主人倒地时它已经离开 _items，走不到发音那一行', () => {
    const { 响, h } = 带录音();
    const owner = {};
    slamAt(h, { owner });
    tick(h, 0.1, 1 / 60, v(99, 99), makePlayerRef());   // 远没进提示窗口
    h.cancelFor(owner);
    tick(h, 2, 1 / 60, v(99, 99), makePlayerRef());
    expect(响.length, '死了的圈从坟里响了一声').toBe(0);
  });

  it('没有音频句柄不抛：node 与无音频场景本来就不传', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const ref = makePlayerRef();
    expect(() => {
      slamAt(h);
      tick(h, bossSlam.telegraph + 0.5, 1 / 60, v(0, 0), ref);
    }).not.toThrow();
  });

  it('warnLead 是活的：放到比前摇还长时第一帧就响（反向控制，防"响没响都在碰运气"）', () => {
    const 原 = GROUND_HAZARD.warnLead;
    try {
      GROUND_HAZARD.warnLead = bossSlam.telegraph + 1;
      const { 响, h } = 带录音();
      slamAt(h);
      h.update(1 / 60, v(99, 99), makePlayerRef());
      expect(响.length, 'warnLead 比整段前摇还长还不响 ⇒ 响的时机不是这个数说的').toBe(1);
    } finally {
      GROUND_HAZARD.warnLead = 原;
    }
  });
});