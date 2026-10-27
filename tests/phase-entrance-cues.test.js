/**
 * 阶段入场招的美术表现（W-A6 切片12）：涟漪边 + 镜头语言 —— 切片9 尾巴②的收口。
 *
 * ## 这一片在收什么
 *
 * 切片8 只接了**时刻**（转阶段那一帧圈先铺下、横幅后落），圈本身仍然是"画下即满"：
 * 玩家读到的是"多了一块红"，不是"这一档开始铺场了"。两条玩家侧的真问题：
 *
 * ① **涟漪边**：阶段入场招（脚本表 `entry: true` 的那一记）画下的那一刻，
 *    圈要从自己的真实边界向外砸出一圈会淡去的波 —— 圈不是凭空出现，是砸进场地里。
 *    常规节奏的铺场不给：涟漪是"阶段变了"的宣告，不是每个圈的心跳。
 * ② **镜头语言**：同一个 tick 的一记收拢 FOV punch，随半衰期回弹、自己散掉 ——
 *    世界 Boss 与副本 Boss 的两个分支都吃（副本分支此前连震屏都没有）。
 *
 * 两条边界写在这里，将来有人想"优化"时先看见：
 * - punch 的衰减账由**导演自己**持有、按帧申领（rig 的既定契约），rig 一个 API 都不加；
 *   跌破地板就停止申领，层自己消失 —— 没人需要"记得恢复"。
 * - 涟漪的件是**池化**的：走完自己回池、被 `cancelFor` 撤走的圈涟漪跟着回池 ——
 *   撤掉的圈不许留下还在扩散的波，"撤"就是把许诺收回去。
 *
 * 测试桩的口径：Boss 与 BossPhaseDirector 都用 `Object.create(prototype)` 绕开构造函数 ——
 * 被测的方法只读 `hazards` / `position` / `field` / `game` 这些**实例字段**，
 * 构造函数里的 DOM 与依赖注入在这一层不是被测对象（UI Director 的 DOM 行为门禁在
 * `boss-phase-fx.test.js` 走静态扫源码，两条路各答各的问）。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { GroundHazards } from '../src/combat/GroundHazards.js';
import { Boss } from '../src/combat/Boss.js';
import { BossPhaseDirector } from '../src/ui/BossPhaseDirector.js';
import { FOV_LAYER_PHASE } from '../src/engine/CameraRig.js';
import { GROUND_HAZARD } from '../src/content/tuning.js';
import { installWindowShim, makeWorld, makeScene, v } from './helpers/enemyHarness.js';

const { bossSlam } = GROUND_HAZARD;
const EDGE = GROUND_HAZARD.opacity.edge;
const dt = 1 / 60;

/** 与 GroundHazards 里那两枚私有表现常数对齐：改常数要来这里改读数，反之亦然 */
const RIPPLE_LIFE = 0.55;
const RIPPLE_SPREAD = 1.35;
/** 与 BossPhaseDirector 里的 punch 满强度对齐（负 = 收拢） */
const FOV_PUNCH = 3.5;

/** 放一枚带涟漪的标准砸地圈，圆心在原点 */
const rippleAt = (h, over = {}) => h.spawn({
  x: 0, z: 0, owner: null,
  radius: bossSlam.radius, telegraph: bossSlam.telegraph,
  damage: bossSlam.damage, color: bossSlam.color, ripple: true, ...over,
});

/** 按 dt 推进 seconds 秒 */
const tick = (h, seconds, pos, ref) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) h.update(dt, pos, ref);
};

/** 不走构造函数的 Boss 桩：四种起手只读 hazards / position / field / clampIntoArena */
const bossStub = (h) => {
  const b = Object.create(Boss.prototype);
  b.hazards = h;
  b.position = { x: 0, z: 0 };
  b.clampIntoArena = (x, z) => ({ x, z });
  return b;
};

/** 不走构造函数的导演桩：punch 的两个方法与 onPhase 只读 game 与自身字段 */
const directorStub = (game) => {
  const d = Object.create(BossPhaseDirector.prototype);
  d.game = game;
  return d;
};

const rigStub = () => {
  const claims = [];
  return { claims, requestFov(id, delta) { claims.push([id, delta]); return this; } };
};

beforeAll(() => installWindowShim());

describe('涟漪边：入场那一记的圈是砸出来的（切片12 ①）', () => {
  it('入场砸地有涟漪且第一帧贴着真实半径；常规节奏的砸地没有', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const b = bossStub(h);
    expect(b.startSlamTelegraph({ move: 'slam', phase: 2, trigger: 'melee', chance: 0.35, entry: true })).toBe(true);
    expect(b.slamHazard.rippleMesh).toBeTruthy();
    expect(b.slamHazard.rippleMesh.scale.x).toBeCloseTo(bossSlam.radius, 6);
    // 同一个桩走常规路径：行上没有 entry 标记（tryArenaMelee 闸门轮里那一记）→ 无涟漪
    b.slamHazard = null;
    expect(b.startSlamTelegraph({ move: 'slam', phase: 2, trigger: 'melee', chance: 0.35 })).toBe(true);
    expect(b.slamHazard.rippleMesh).toBeNull();
  });

  it('涟漪向外扩、向里淡，两件事都按 dt 走，而且比边缘环再抬一线防同面闪烁', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const it = rippleAt(h);
    // spawn 那一刻贴着真实边界（第一帧 update 一过它就开始扩，读数取在推进之前）
    expect(it.rippleMesh.scale.x).toBeCloseTo(bossSlam.radius, 6);
    expect(it.rippleMesh.material.opacity).toBeCloseTo(EDGE, 6);
    expect(it.rippleMesh.position.y).toBeGreaterThan(it.ring.position.y);
    h.update(dt, v(99, 99), null);
    expect(it.rippleMesh.scale.x).toBeGreaterThan(bossSlam.radius);
    expect(it.rippleMesh.material.opacity).toBeLessThan(EDGE);
    tick(h, RIPPLE_LIFE * 0.5, v(99, 99), null);
    expect(it.rippleMesh.scale.x).toBeGreaterThan(bossSlam.radius);
    expect(it.rippleMesh.scale.x).toBeLessThan(bossSlam.radius * RIPPLE_SPREAD);
    const mid = it.rippleMesh.material.opacity;
    expect(mid).toBeGreaterThan(0);
    tick(h, RIPPLE_LIFE * 0.3, v(99, 99), null);
    expect(it.rippleMesh.material.opacity).toBeLessThan(mid);
  });

  it('涟漪走完自己回池，圈照旧过它的前摇 —— 宣告是一次性的，不陪圈过完整个生命周期', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const it = rippleAt(h);
    expect(h.ripplePooled()).toBe(0);
    tick(h, RIPPLE_LIFE + dt * 2, v(99, 99), null);
    expect(it.rippleMesh).toBeNull();
    expect(h.ripplePooled()).toBe(1);
    expect(h.count()).toBe(1);
    expect(it.done).toBe(false);
    expect(h.group.children.length).toBe(2);
  });

  it('cancelFor 撤掉未落地的圈，涟漪跟着回池 —— 撤掉的圈不许留下还在扩散的波', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const owner = { id: 'boss' };
    const it = rippleAt(h, { owner });
    tick(h, 0.2, v(99, 99), null);
    expect(it.rippleMesh).toBeTruthy();
    h.cancelFor(owner);
    expect(h.count()).toBe(0);
    expect(h.ripplePooled()).toBe(1);
    expect(h.group.children.length).toBe(0);
  });

  it('涟漪的件是池化复用的：走完回池、再放一枚走的是同一件', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const a = rippleAt(h);
    const meshA = a.rippleMesh;
    tick(h, RIPPLE_LIFE + dt * 2, v(99, 99), null);
    const b = rippleAt(h);
    expect(h.ripplePooled()).toBe(0);
    expect(b.rippleMesh).toBe(meshA);
  });

  it('dispose 连涟漪的材质一起还（影子方法让"真释放"看得见）', () => {
    const h = new GroundHazards(makeScene(), makeWorld());
    const it = rippleAt(h);
    let disposed = 0;
    it.rippleMesh.material.dispose = () => { disposed++; };
    h.dispose();
    expect(disposed).toBe(1);
    expect(h.ripplePooled()).toBe(0);
  });
});

describe('镜头语言：转阶段那一帧的一记收拢 punch（切片12 ②）', () => {
  it('首帧申领的层 id 与方向都对，强度是满的那一档', () => {
    const rig = rigStub();
    const d = directorStub({ player: { rig } });
    d._cueCameraPunch();
    d.update(dt);
    expect(rig.claims).toEqual([[FOV_LAYER_PHASE, -FOV_PUNCH]]);
  });

  it('punch 自己散：幅度单调不增，跌破地板后一个字都不再申领', () => {
    const rig = rigStub();
    const d = directorStub({ player: { rig } });
    d._cueCameraPunch();
    for (let i = 0; i < 90; i++) d.update(dt);
    expect(rig.claims.length).toBeGreaterThan(2);
    expect(rig.claims.length).toBeLessThan(90);
    for (let i = 1; i < rig.claims.length; i++) {
      expect(rig.claims[i][1], 'punch 全程都在收拢（负号不许中途翻面）').toBeLessThan(0);
      expect(Math.abs(rig.claims[i][1])).toBeLessThanOrEqual(Math.abs(rig.claims[i - 1][1]));
    }
    // 收尾那一笔仍不低于地板：是"跌到地板以下就不再要"，不是中途归零的戛然跳变
    expect(Math.abs(rig.claims[rig.claims.length - 1][1])).toBeGreaterThanOrEqual(0.08);
    const settled = rig.claims.length;
    for (let i = 0; i < 30; i++) d.update(dt);
    expect(rig.claims.length, '散掉的 punch 不许再申领：层自己消失，没人需要"记得恢复"').toBe(settled);
  });

  it('重复转档重打满：同一层 id 后写的赢，是 rig 的既定行为', () => {
    const rig = rigStub();
    const d = directorStub({ player: { rig } });
    d._cueCameraPunch();
    for (let i = 0; i < 20; i++) d.update(dt);
    const before = rig.claims.length;
    d._cueCameraPunch();
    d.update(dt);
    expect(rig.claims[before]).toEqual([FOV_LAYER_PHASE, -FOV_PUNCH]);
  });

  it('副本 Boss 的转阶段也吃这一记 —— 它的分支在 FX 之前就早退，punch 却已经走了', () => {
    const rig = rigStub();
    const d = directorStub({ player: { rig } });
    d.onPhase({ bossId: 'dungeon-ruin-crypt', phase: 2 });
    d.update(dt);
    expect(rig.claims.length).toBeGreaterThan(0);
    expect(rig.claims[0][0]).toBe(FOV_LAYER_PHASE);
    expect(rig.claims[0][1]).toBeLessThan(0);
  });

  it('没有 rig（或没有 game）这一层安静降级，不抛', () => {
    const d = directorStub({});
    expect(() => { d._cueCameraPunch(); d.update(dt); }).not.toThrow();
    const d2 = directorStub(undefined);
    expect(() => d2.update(dt)).not.toThrow();
  });
});
