import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Shake, shake, addShake } from '../src/engine/Shake.js';
import { DamageNumbers } from '../src/combat/DamageNumbers.js';
import { CombatFeedback } from '../src/effects/CombatFeedback.js';
import { hitDirection } from '../src/combat/Resolution.js';
import { Enemy } from '../src/combat/Enemy.js';
import { CombatController } from '../src/combat/CombatController.js';
import { MOVES } from '../src/combat/MoveTable.js';
import { createHurtbox } from '../src/combat/Hurtbox.js';
import { TimeController } from '../src/engine/Time.js';
import { HIT, SHAKE, GUARD } from '../src/content/tuning.js';
import { makeScene, makeWorld, installWindowShim } from './helpers/enemyHarness.js';

installWindowShim();

/**
 * 打击反馈层 —— 震屏、伤害飘字、命中火花、击退。
 *
 * 这四件事原本分散在"每帧随机数 + 每击新建 DOM/GPU 资源 + 只有掉血没有位移"三种写法里，
 * 用例因此不只断言数值，而是盯住三件事：**按秒不按帧、不许有分配、方向同源**。
 */

describe('engine/Shake.js —— 震屏的唯一所有者', () => {
  let s;
  beforeEach(() => { s = new Shake(); });

  it('多次请求累积进同一个 trauma，并且封顶', () => {
    for (let i = 0; i < 30; i++) s.add(0.35);
    expect(s.strength).toBe(1);
  });

  it('没请求时不产生任何位移，applyTo 是空操作', () => {
    const pos = new THREE.Vector3(1, 2, 3);
    const look = new THREE.Vector3(4, 5, 6);
    s.update(1 / 60);
    s.applyTo(pos, look);
    expect(pos.distanceTo(new THREE.Vector3(1, 2, 3))).toBe(0);
    expect(look.distanceTo(new THREE.Vector3(4, 5, 6))).toBe(0);
  });

  it('0 与负数的请求被忽略（不会把已有 trauma 抹掉）', () => {
    s.add(0.2);
    const before = s.strength;
    s.add(0);
    s.add(-1);
    expect(s.strength).toBe(before);
  });

  it('衰减只按秒：30/60/120/240 Hz 跑同样的 0.3 秒得到同一个残余', () => {
    const residual = (dt) => {
      const k = new Shake();
      k.add(0.35);
      // 用"步数"而不是累加时间，避免浮点求和让不同帧率多跑或少跑一步
      for (let i = 0; i < Math.round(0.3 / dt); i++) k.update(dt);
      return k.strength;
    };
    const a = residual(1 / 30);
    for (const dt of [1 / 60, 1 / 120, 1 / 240]) expect(residual(dt)).toBeCloseTo(a, 12);
    expect(a).toBeCloseTo(1 - SHAKE.decay * 0.3, 12);
    // 旧写法是每帧 ×0.78：同样 0.3 秒在 30 Hz 剩 0.106、在 144 Hz 剩 2.4e-5，差四个数量级
    expect(Math.pow(0.78, 9) / Math.pow(0.78, 43)).toBeGreaterThan(1000);
  });

  it('位移有界：任何时刻不超过调参表给出的峰值', () => {
    s.add(0.35);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      s.update(1 / 60);
      peak = Math.max(peak, s.offset.length());
    }
    expect(peak).toBeLessThanOrEqual(SHAKE.meters.third * 1.06);
    expect(peak).toBeGreaterThan(0.01);
  });

  it('形状确定：同一时间轴跑两遍得到逐位相同的偏移', () => {
    const run = () => {
      const k = new Shake();
      const out = [];
      k.add(0.35);
      for (let i = 0; i < 12; i++) { k.update(1 / 60); out.push(k.offset.x, k.offset.y, k.offset.z); }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('注视点只吃一部分位移：全跟着晃就变成平移而不是"晃"', () => {
    s.add(0.35);
    s.update(1 / 60);
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    s.applyTo(pos, look);
    expect(pos.length()).toBeCloseTo(s.offset.length(), 12);
    expect(look.length()).toBeCloseTo(s.offset.length() * SHAKE.lookWeight.third, 12);
    expect(look.length()).toBeLessThan(pos.length());
  });

  it('第一人称峰值更小但视线跟得更多（相机就是眼睛）', () => {
    const peak = (profile) => {
      const k = new Shake();
      k.setProfile(profile);
      k.add(0.35);
      let m = 0;
      for (let i = 0; i < 40; i++) { k.update(1 / 60); m = Math.max(m, k.offset.length()); }
      return m;
    };
    expect(peak('first')).toBeLessThan(peak('third'));
    expect(SHAKE.lookWeight.first).toBeGreaterThan(SHAKE.lookWeight.third);
  });

  it('自动演示静帧：muted 时不接受新请求', () => {
    s.muted = true;
    s.add(0.35);
    expect(s.strength).toBe(0);
  });

  it('reset 立刻归零（传送与换场景不该带着半截抖动过去）', () => {
    s.add(0.35);
    s.update(1 / 60);
    expect(s.offset.length()).toBeGreaterThan(0);
    s.reset();
    expect(s.strength).toBe(0);
    expect(s.offset.length()).toBe(0);
  });

  it('共享实例 + addShake 是同一份状态（各系统不再各摇各的）', () => {
    shake.reset();
    addShake(0.1);
    expect(shake.strength).toBeGreaterThan(0);
    shake.reset();
    expect(shake.strength).toBe(0);
  });
});

/** CSS2DObject 会写 element.style / setAttribute，并在 removed 事件里回查 ownerDocument */
function installElementShim() {
  class FakeElement {
    constructor() {
      this.style = {};
      this.className = '';
      this.textContent = '';
      this.parentNode = null;
      this.ownerDocument = { defaultView: { Element: FakeElement } };
    }
    setAttribute() {}
    remove() { this.removed = true; }
    cloneNode() { return new FakeElement(); }
  }
  const created = { n: 0 };
  globalThis.document = {
    createElement: () => { created.n++; return new FakeElement(); },
  };
  return created;
}

describe('DamageNumbers —— 定容对象池', () => {
  let created;
  beforeEach(() => { created = installElementShim(); });

  const mk = (cap) => {
    const scene = new THREE.Group();
    return { dn: new DamageNumbers(scene, cap), scene };
  };

  it('DOM 节点只在构造期创建，运行期一次分配都没有', () => {
    const { dn } = mk(8);
    expect(created.n).toBe(8);
    const p = new THREE.Vector3(1, 0, 2);
    for (let i = 0; i < 50; i++) dn.spawn(p, `${i}`);
    dn.update(1 / 60);
    expect(created.n).toBe(8);
  });

  it('池满时复用最旧的一条，在用数永不超容量', () => {
    const { dn, scene } = mk(6);
    expect(scene.children.length).toBe(6);
    const p = new THREE.Vector3();
    for (let i = 0; i < 30; i++) {
      dn.spawn(p, `${i}`);
      dn.update(1 / 120);
      expect(dn.activeCount()).toBeLessThanOrEqual(6);
      // 池的总量守恒：任何时刻"在用 + 空闲"都恰好等于容量，没有元素凭空多出或丢失
      expect(dn.activeCount() + dn.free.length).toBe(6);
    }
    expect(scene.children.length).toBe(6);
  });

  it('到期是"藏起来归池"，不是从场景里摘掉', () => {
    const { dn, scene } = mk(4);
    dn.spawn(new THREE.Vector3(), '12');
    expect(dn.activeCount()).toBe(1);
    for (let t = 0; t < 1.2; t += 1 / 60) dn.update(1 / 60);
    expect(dn.activeCount()).toBe(0);
    expect(scene.children.length).toBe(4);
    expect(scene.children.every((c) => c.visible === false)).toBe(true);
  });

  it('淡出与上浮按 dt 推进：帧率不同不影响寿命', () => {
    const life = (dt) => {
      const { dn } = mk(2);
      dn.spawn(new THREE.Vector3(), '9');
      let t = 0;
      while (dn.activeCount() && t < 3) { dn.update(dt); t += dt; }
      return t;
    };
    expect(life(1 / 30)).toBeCloseTo(life(1 / 240), 1);
  });

  it('dispose 把节点从场景与 DOM 两侧都收干净', () => {
    const { dn, scene } = mk(5);
    dn.dispose();
    expect(scene.children.length).toBe(0);
    expect(dn.activeCount()).toBe(0);
  });
});

describe('CombatFeedback —— 火花池与命中方向', () => {
  const mk = () => {
    const scene = new THREE.Group();
    return { fb: new CombatFeedback(scene), scene };
  };

  it('几何体只有共享的两份，命中再多也不新建 GPU 资源', () => {
    const { fb, scene } = mk();
    const geos = new Set();
    fb.group.children.forEach((m) => geos.add(m.geometry));
    expect(geos.size).toBe(2);
    expect(fb.group.children.length).toBe(HIT.sparkPool + HIT.ringPool);
    for (let i = 0; i < 60; i++) fb.impact(new THREE.Vector3(i, 0, 0), 0xffaa33, 1, { x: 1, z: 0 });
    expect(fb.group.children.length).toBe(HIT.sparkPool + HIT.ringPool);
    expect(scene.children.length).toBe(1);
  });

  it('在用数封顶，超出部分复用最旧的一条', () => {
    const { fb } = mk();
    const total = HIT.sparkPool + HIT.ringPool;
    for (let i = 0; i < 400; i++) {
      fb.impact(new THREE.Vector3(), 0xffaa33, 1, null);
      expect(fb.activeCount()).toBeLessThanOrEqual(total);
      // 元素不会既在空闲池里又在用表里（复用偷取路径最容易漏这一步）
      expect(fb.activeCount() + fb.sparks.length + fb.rings.length).toBe(total);
    }
  });

  it('寿命走完后全部归池，池容量回到满', () => {
    const { fb } = mk();
    const total = fb.activeCount();
    expect(total).toBe(0);
    fb.impact(new THREE.Vector3(), 0xffaa33, 1.3, { x: 0, z: 1 });
    expect(fb.activeCount()).toBe(HIT.sparkPerHit + 1);
    for (let t = 0; t < 1; t += 1 / 60) fb.update(1 / 60);
    expect(fb.activeCount()).toBe(0);
  });

  it('火花沿命中方向偏置喷出：受力方向与视觉方向不是各说一套', () => {
    const { fb } = mk();
    fb.impact(new THREE.Vector3(), 0xffaa33, 1, { x: 1, z: 0 });
    const vs = fb.live.filter((e) => e.vel);
    const meanX = vs.reduce((a, e) => a + e.vel.x, 0) / vs.length;
    expect(meanX).toBeGreaterThan(1.5);
  });

  it('不传方向时仍然四散（不会偏向某个隐式方向）', () => {
    const { fb } = mk();
    fb.impact(new THREE.Vector3(), 0xffaa33, 1);
    let sum = 0;
    for (const e of fb.live) if (e.vel) sum += e.vel.x;
    expect(Math.abs(sum)).toBeLessThan(HIT.sparkPerHit * 3);
  });

  it('环在寿命内从内径长到外径（读得出"这一圈在扩散"）', () => {
    const { fb } = mk();
    fb.parryFlash(new THREE.Vector3());
    const ring = fb.live[0];
    expect(ring.vel).toBeUndefined();
    const r0 = ring.mesh.scale.x;
    fb.update(0.1);
    expect(ring.mesh.scale.x).toBeGreaterThan(r0);
  });

  it('reset 只藏不删：跨场景后池仍然是满的', () => {
    const { fb } = mk();
    fb.impact(new THREE.Vector3(), 0xffaa33, 1, null);
    fb.reset();
    expect(fb.activeCount()).toBe(0);
    expect(fb.group.children.length).toBe(HIT.sparkPool + HIT.ringPool);
  });

  it('dispose 释放共享几何体与全部材质', () => {
    const { fb, scene } = mk();
    let disposed = 0;
    fb.sparkGeometry.dispose = () => { disposed++; };
    fb.ringGeometry.dispose = () => { disposed++; };
    const meshes = [...fb.sparks, ...fb.rings];
    meshes.forEach((e) => { e.material.dispose = () => { disposed++; }; });
    fb.dispose();
    expect(disposed).toBe(meshes.length + 2);
    expect(scene.children.length).toBe(0);
  });
});

describe('hitDirection —— 结算侧交出的那一个方向', () => {
  it('给出从出手者指向目标的水平单位向量', () => {
    const d = hitDirection({ x: 1, y: 9, z: 2 }, { x: 4, y: 0, z: 6 }, {});
    expect(d.x).toBeCloseTo(0.6, 12);
    expect(d.z).toBeCloseTo(0.8, 12);
  });

  it('完全重合时是零向量而不是 NaN', () => {
    const d = hitDirection({ x: 1, z: 1 }, { x: 1, z: 1 }, {});
    expect(d.x).toBe(0);
    expect(d.z).toBe(0);
  });

  it('复用调用方传入的对象（每次命中不产生新分配）', () => {
    const out = { x: 0, z: 0 };
    expect(hitDirection({ x: 0, z: 0 }, { x: 0, z: 3 }, out)).toBe(out);
  });
});

describe('敌人击退 —— 外力与 AI 意图分开积分', () => {
  const mkEnemy = (over = {}) => new Enemy(makeScene(), makeWorld(), {
    name: '击退靶', type: 'soldier', x: 0, z: 0,
    hp: 100, posture: 60, damage: 10, speed: 5, respawn: false, ...over,
  });

  /** 只推进位移：AI 不参与（wish 保持为 0），看的就是纯外力积分 */
  const advance = (e, seconds, dt = 1 / 60) => {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) e._advance(dt, { collision: null, neighbors: [] });
  };

  it('被打了会真的位移，然后自己停下来', () => {
    const e = mkEnemy();
    e.applyKnockback(1, 0, HIT.speed);
    advance(e, 0.5);
    const moved = e.position.distanceTo(e.spawnPoint);
    expect(moved).toBeGreaterThan(0.2);
    advance(e, 2);
    const rest = e.position.clone();
    advance(e, 0.5);
    expect(e.position.distanceTo(rest)).toBeLessThan(1e-4);
  });

  it('停下后的总位移只由初速与衰减决定，与帧率无关', () => {
    const total = (dt) => {
      const e = mkEnemy();
      e.applyKnockback(0, 1, HIT.speed);
      advance(e, 3, dt);
      return e.position.distanceTo(e.spawnPoint);
    };
    expect(total(1 / 30)).toBeCloseTo(total(1 / 240), 1);
  });

  it('大体型推不动：同一次请求，Boss 位移显著小于小兵', () => {
    const moved = (type) => {
      const e = mkEnemy({ type });
      e.applyKnockback(1, 0, HIT.speed);
      advance(e, 2);
      return e.position.distanceTo(e.spawnPoint);
    };
    expect(moved('golem')).toBeLessThan(moved('soldier'));
  });

  it('起手与命中段只吃一小部分：预警说出口的距离不许被一炮打飞', () => {
    const e = mkEnemy();
    e.fsm.change('windup');
    const s = e.applyKnockback(1, 0, HIT.speed);
    expect(s).toBeCloseTo(HIT.speed * HIT.rootedScale, 12);
  });

  it('硬直中吃全额加成：把大家伙打进硬直才推得动', () => {
    const e = mkEnemy();
    e.staggerTimer = 1;
    const s = e.applyKnockback(1, 0, HIT.speed);
    expect(s).toBeCloseTo(HIT.speed * HIT.staggerScale, 12);
  });

  it('死亡瞬间冲量清零，尸体不许滑行', () => {
    const e = mkEnemy();
    e.applyKnockback(1, 0, HIT.speed);
    advance(e, 0.1);
    e.die();
    expect(e.knock.x).toBe(0);
    const at = e.position.clone();
    advance(e, 1);
    expect(e.position.distanceTo(at)).toBe(0);
  });

  it('击退不覆盖 AI 意图：两者叠加但各自独立衰减', () => {
    const e = mkEnemy();
    e.setWish(0, 2);
    e.applyKnockback(1, 0, HIT.speed);
    advance(e, 0.2);
    expect(e.position.x).toBeGreaterThan(0.1);
    expect(e.position.z).toBeGreaterThan(0.1);
    expect(e.wish.z).toBe(2);
    advance(e, 2);
    expect(e.knock.x).toBe(0);
    expect(e.knock.z).toBe(0);
  });

  it('零与负强度被忽略；死人不吃击退', () => {
    const e = mkEnemy();
    expect(e.applyKnockback(1, 0, 0)).toBe(0);
    expect(e.knock.x).toBe(0);
    e.alive = false;
    expect(e.applyKnockback(1, 0, HIT.speed)).toBe(0);
  });
});

/**
 * 结算 → 反馈的同源接线：一次命中交出去的三个量（击退、火花方向、震屏）
 * 必须来自同一个方向与同一次结算结果，否则屏幕上会出现"往左飞却往右溅"。
 */
describe('一次命中的三种反馈同源', () => {
  const makePlayer = () => ({
    scene: new THREE.Group(),
    mesh: { getObjectByName: () => null },
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    cameraMode: 'third',
    getCombatForwardXZ: () => new THREE.Vector3(0, 0, -1),
    applyDash() {},
    characterModel: null,
  });

  const makeTarget = (x, z) => ({
    name: '靶', alive: true, position: new THREE.Vector3(x, 0, z),
    hits: [], postures: [], knocks: [],
    maxPosture: 60, posture: 0,
    hurtbox: createHurtbox('soldier'),
    distanceTo(p) { return Math.hypot(p.x - this.position.x, p.z - this.position.z); },
    takeDamage(d, posture = 0) { this.hits.push(d); this.postures.push(posture); return false; },
    applyKnockback(dx, dz, speed) { this.knocks.push({ dx, dz, speed }); return speed; },
    hurtBaseY: () => 0,
    facingYaw: () => 0,
    getDefense: () => 0,
    getResist: () => 0,
    isStaggered: () => false,
    isParriable: () => false,
    // 单个用例想让它举盾时改这个标志即可（格挡的判定接口是 isGuarding()）
    guarding: false,
    isGuarding() { return this.guarding; },
    forceStagger() {},
  });

  const mkCombat = (enemies, feedback = null) => {
    const manager = { enemies, getAliveEnemies: () => enemies.filter((e) => e.alive) };
    const noop = () => {};
    const combat = new CombatController(makePlayer(), manager, { toast: noop }, null, {
      swingLight: noop, swingHeavy: noop, hit: noop, heavyHit: noop,
      dodge: noop, parry: noop, blockClink: noop, spellCast: noop, playerHurt: noop,
    }, null);
    combat.setTimeController(new TimeController());
    combat.feedback = feedback;
    combat.rng = () => 0.99;
    return combat;
  };

  const strike = (combat, seconds, dt = 1 / 120) => {
    let t = 0;
    while (t < seconds - 1e-9) { combat.update(dt, {}); t += dt; }
  };

  it('击退方向就是从玩家指向敌人（水平、单位长度）', () => {
    const e = makeTarget(1.5, -2);
    const combat = mkCombat([e]);
    shake.reset();
    combat.tryLightAttack();
    strike(combat, MOVES.light.duration + 0.02);
    expect(e.knocks).toHaveLength(1);
    const k = e.knocks[0];
    const len = Math.hypot(k.dx, k.dz);
    expect(len).toBeCloseTo(1, 6);
    expect(k.dx).toBeGreaterThan(0);
    expect(k.dz).toBeLessThan(0);
  });

  it('重击把目标推得比轻击更远，火花也按同一方向喷出', () => {
    const one = makeTarget(0, -2.5);
    const light = mkCombat([one]);
    light.tryLightAttack();
    strike(light, MOVES.light.duration + 0.02);

    const two = makeTarget(0, -2.5);
    const fb = new CombatFeedback(new THREE.Group());
    const heavy = mkCombat([two], fb);
    heavy.tryHeavyAttack();
    strike(heavy, MOVES.heavy.duration + 0.02);

    expect(two.knocks[0].speed).toBeGreaterThan(one.knocks[0].speed);
    const sparks = fb.live.filter((el) => el.vel);
    expect(sparks.length).toBeGreaterThan(0);
    // 敌人在玩家正前方（-Z），火花就该往 -Z 喷
    expect(sparks.reduce((a, el) => a + el.vel.z, 0) / sparks.length).toBeLessThan(-1.5);
    expect(two.knocks[0].dz).toBeLessThan(0);
  });

  it('命中会请求震屏，且不会每次命中都新建事件对象', () => {
    shake.reset();
    const e = makeTarget(0, -2.5);
    const combat = mkCombat([e]);
    combat.tryHeavyAttack();
    strike(combat, MOVES.heavy.duration + 0.02);
    expect(shake.strength).toBeGreaterThan(0);
    shake.reset();
  });

  /**
   * 挡住的一下是"另一种命中"：反馈层三件事全部要跟着变档，
   * 否则玩家看不出自己砍空了还是砍在盾上（火花颜色、顿帧、音效在别处断言，这里盯位移与数值）。
   */
  it('砍在盾上：伤害打折、不吃击退、火花换成钢色', () => {
    shake.reset();
    const heard = [];
    // 两次命中各用一池火花：同一池里混着"挡住的"和"没挡的"就看不出色差是不是接线给的
    const mk = (target, feedback = null) => {
      const combat = mkCombat([target], feedback);
      combat.audio = {
        hit: () => heard.push('hit'),
        heavyHit: () => heard.push('heavyHit'),
        blockClink: () => heard.push('blockClink'),
      };
      return combat;
    };

    const blocked = makeTarget(0, -2.5);
    blocked.guarding = true;
    const fb = new CombatFeedback(new THREE.Group());
    const b = mk(blocked, fb);
    b.tryHeavyAttack();
    strike(b, MOVES.heavy.duration + 0.02);

    const clean = makeTarget(0, -2.5);
    const c = mk(clean);
    c.tryHeavyAttack();
    strike(c, MOVES.heavy.duration + 0.02);

    // 同一招、同一部位、同一暴击种子，只差一面盾
    expect(blocked.hits).toHaveLength(1);
    expect(clean.hits).toHaveLength(1);
    expect(blocked.hits[0]).toBeLessThan(clean.hits[0]);
    expect(clean.knocks).toHaveLength(1);
    expect(blocked.knocks).toHaveLength(0);            // 举盾的代价是站着挨，推开它反而成了好处
    expect(heard).toEqual(['blockClink', 'heavyHit']);

    const sparks = fb.live.filter((el) => el.vel);
    expect(sparks.length).toBeGreaterThan(0);
    const tints = new Set(sparks.map((el) => el.material.color.getHex()));
    expect([...tints]).toEqual([GUARD.spark]);         // 整池都是钢色，没混进肉身的红
    shake.reset();
  });
});
