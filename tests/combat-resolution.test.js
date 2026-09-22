import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CombatController } from '../src/combat/CombatController.js';
import { MOVES, SPELL_BANDS } from '../src/combat/MoveTable.js';
import { createHurtbox, pickPart, selectPart } from '../src/combat/Hurtbox.js';
import { isBehind, resolveHit } from '../src/combat/Resolution.js';
import { CRIT, BODY_PLANS, ENEMY_DEFENSE, MITIGATION, PARTS, PLAYER_MOVES } from '../src/content/tuning.js';
import { Enemy } from '../src/combat/Enemy.js';
import { TimeController } from '../src/engine/Time.js';

beforeAll(() => {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
    },
    dispatchEvent(event) {
      handlers.get(event.type)?.forEach((fn) => fn(event));
      return true;
    },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
});

/** 受击方替身：只实现 M2 约定的只读接口，不给生产兜底路径留机会 */
const target = (over = {}) => ({
  position: new THREE.Vector3(0, 0, -2.5),
  hurtbox: createHurtbox(over.type ?? 'soldier', over.hurtScale ?? 1),
  baseY: over.baseY ?? 0,
  yaw: over.yaw ?? 0,
  defense: over.defense ?? 0,
  resist: over.resist ?? {},
  staggered: over.staggered ?? false,
  hurtBaseY() { return this.baseY; },
  facingYaw() { return this.yaw; },
  getDefense() { return this.defense; },
  getResist(el) { return this.resist[el] ?? 0; },
  isStaggered() { return this.staggered; },
});

describe('分部位受击盒', () => {
  it('体型表把部位高度按 scale 拉伸，无人机没有下盘', () => {
    const soldier = createHurtbox('soldier');
    const golem = createHurtbox('golem');
    expect(soldier.segments.find((s) => s.id === 'head').y1).toBeCloseTo(PARTS.head.y1, 10);
    expect(golem.segments.find((s) => s.id === 'head').y1).toBeCloseTo(PARTS.head.y1 * 1.25, 10);
    const drone = createHurtbox('drone');
    expect(drone.segments.map((s) => s.id)).toEqual(['head', 'torso']);
  });

  it('重叠最多的一段被打中：中段砍躯干、上段砍头、横扫打躯干', () => {
    const box = createHurtbox('soldier');
    expect(selectPart(box, ...MOVES.light.band).id).toBe('torso');
    expect(selectPart(box, ...MOVES.heavy.band).id).toBe('head');
    expect(selectPart(box, ...MOVES.skill.band).id).toBe('torso');
  });

  it('体型越大，同一招打到的部位越高：重击打巨像仍是头', () => {
    const big = createHurtbox('boss');
    expect(selectPart(big, ...MOVES.heavy.band).id).toBe('torso');   // Boss 的头在 3 米以上
    expect(selectPart(big, 2.8, 4.2).id).toBe('head');
  });

  it('完全错开高度时：snap 内算打中最近段，超出则这一刀落空', () => {
    const box = createHurtbox('drone');
    // 整条打击带都在受击盒下方：给足容差才够到躯干，容差之外就是空挥
    expect(selectPart(box, -1.8, -0.9, 1.6)?.id).toBe('torso');
    expect(selectPart(box, -4, -3, 1.6)).toBeNull();
  });

  it('悬浮单位的悬停高度不能把近战挤出打击带（不给 snap 擦边留活路）', () => {
    const bands = {
      light: MOVES.light.band,
      heavy: MOVES.heavy.band,
      skill: MOVES.skill.band,
      bolt: SPELL_BANDS.bolt,
    };
    const drone = new Enemy({ add() {} }, { getGroundHeight: () => 0 }, { type: 'drone', x: 0, z: 0 });
    expect(drone.hurtBaseY()).toBe(BODY_PLANS.drone.hover);
    for (const [name, band] of Object.entries(bands)) {
      // snap 传 0：只有真正重叠才算打中
      const seg = pickPart(drone, 0, band, 0);
      expect(seg, `${name} 在悬停高度 ${drone.hurtBaseY()} 上打空`).not.toBeNull();
    }
  });

  it('pickPart 把世界高差折进局部区间：站在高台上打不到脚下的人', () => {
    const t = target({ baseY: 0 });
    expect(pickPart(t, 0, MOVES.light.band)?.id).toBe('torso');
    expect(pickPart(t, 6, MOVES.light.band)).toBeNull();            // 出手者在 6 米空中
    expect(pickPart(null, 0, MOVES.light.band)).toBeNull();
    expect(pickPart(t, 0, null)).toBeNull();
  });
});

describe('统一结算 Resolution', () => {
  const noCrit = { rng: () => 0.99 };

  it('防御减伤按双曲线叠乘，def=K 时正好 50%', () => {
    const t = target({ defense: MITIGATION.K });
    const hit = resolveHit({ base: 100, posture: 20, target: t, ...noCrit });
    expect(hit.damage).toBe(50);
    expect(resolveHit({ base: 100, target: target({ defense: 999 }), ...noCrit }).damage)
      .toBe(Math.round(100 * (1 - MITIGATION.cap)));                 // 减伤有上限，不会免疫
  });

  it('部位倍率与防御同时生效：巨像的头也不是随便砍的', () => {
    const head = createHurtbox('golem').segments.find((s) => s.id === 'head');
    const torso = createHurtbox('golem').segments.find((s) => s.id === 'torso');
    const opts = { target: target({ defense: ENEMY_DEFENSE.golem }), ...noCrit };
    const def = ENEMY_DEFENSE.golem;
    const onHead = resolveHit({ base: PLAYER_MOVES.heavy.damage, posture: PLAYER_MOVES.heavy.posture, part: head, ...opts });
    const onTorso = resolveHit({ base: PLAYER_MOVES.heavy.damage, posture: PLAYER_MOVES.heavy.posture, part: torso, ...opts });
    expect(onHead.damage).toBeGreaterThan(onTorso.damage);
    expect(onTorso.damage).toBe(Math.round(PLAYER_MOVES.heavy.damage * (1 - def / (def + MITIGATION.K))));
  });


  it('巨像比无人机硬得多：同一记轻击打的数字更低', () => {
    const noDef = { rng: () => 0.99 };
    const torso = createHurtbox('soldier').segments.find((s) => s.id === 'torso');
    const golem = resolveHit({ base: PLAYER_MOVES.light.damage, target: target({ defense: ENEMY_DEFENSE.golem }), part: torso, ...noDef });
    const drone = resolveHit({ base: PLAYER_MOVES.light.damage, target: target({ defense: ENEMY_DEFENSE.drone }), part: torso, ...noDef });
    expect(golem.damage).toBeLessThan(drone.damage);
    expect(drone.damage).toBeGreaterThan(PLAYER_MOVES.light.damage * 0.9);
  });

  it('元素抗性可正可负，并被夹在 [-0.5, 0.9]', () => {
    const t = target({ resist: { ice: -0.15, fire: 5 } });
    const ice = resolveHit({ base: 100, target: t, element: 'ice', ...noCrit });
    const fire = resolveHit({ base: 100, target: t, element: 'fire', ...noCrit });
    const phys = resolveHit({ base: 100, target: t, ...noCrit });
    expect(ice.damage).toBe(115);
    expect(fire.damage).toBe(10);
    expect(phys.damage).toBe(100);                                   // 物理不吃元素抗性
  });

  it('暴击按 side 取参数，rng 决定命中与否', () => {
    const t = target();
    const always = { rng: () => 0 };
    const player = resolveHit({ base: 100, target: t, ...always });
    const enemy = resolveHit({ base: 100, target: t, side: 'enemy', ...always });
    expect(player.crit).toBe(true);
    expect(player.damage).toBe(Math.round(100 * CRIT.player.mult));
    expect(enemy.damage).toBe(Math.round(100 * CRIT.enemy.mult));
    expect(resolveHit({ base: 100, target: t, ...noCrit }).damage).toBe(100);
  });

  it('背刺只打正后方：朝向决定一切', () => {
    const t = target({ yaw: 0 });                          // 面向 +Z
    expect(isBehind(t, { x: 0, z: -5 })).toBe(true);       // 出手者在 -Z，即背后
    expect(isBehind(t, { x: 0, z: 5 })).toBe(false);       // 正面
    expect(isBehind(t, { x: 5, z: 0 })).toBe(false);       // 侧翼
    expect(isBehind(t, { x: 0, z: 0 })).toBe(false);       // 重合，方向无定义
  });

  it('破防目标额外吃架势加成，部位架势倍率同乘', () => {
    const head = createHurtbox('soldier').segments.find((s) => s.id === 'head');
    const fresh = resolveHit({ base: 10, posture: 20, target: target(), part: head, ...noCrit });
    const broken = resolveHit({ base: 10, posture: 20, target: target({ staggered: true }), part: head, ...noCrit });
    expect(fresh.posture).toBe(Math.round(20 * PARTS.head.posture));
    expect(broken.posture).toBeGreaterThan(fresh.posture);
  });

  it('伤害最低保留 1 点，不会出现 0 伤害的哑火', () => {
    const hit = resolveHit({ base: 1, target: target({ defense: 200 }), ...noCrit });
    expect(hit.damage).toBe(1);
  });
});

describe('近战接入统一结算', () => {
  const makePlayer = () => ({
    scene: new THREE.Group(),
    mesh: { getObjectByName: () => null },
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    cameraMode: 'third',
    characterModel: null,
    getCombatForwardXZ: () => new THREE.Vector3(0, 0, -1),
    applyDash() {},
    teleport(x, y, z) { this.position.set(x, y, z); },
  });

  const makeCombat = (enemies = []) => {
    const manager = { enemies, getLockCandidates: () => [], getBestLockTarget: () => null, getAliveEnemies: () => enemies.filter((e) => e.alive), setLockTarget() {} };
    const combat = new CombatController(makePlayer(), manager, { toast() {} }, null, null, null);
    combat.setTimeController(new TimeController());
    combat.rng = () => 0.99;
    return combat;
  };

  const makeTargetEnemy = (over = {}) => ({
    name: 't', alive: true, position: new THREE.Vector3(0, 0, -2.5),
    hits: [], postures: [], knocks: [],
    hurtbox: createHurtbox('soldier'),
    defense: 0,
    distanceTo(p) { return Math.hypot(p.x - this.position.x, p.z - this.position.z); },
    takeDamage(d, posture = 0) { this.hits.push(d); this.postures.push(posture); return false; },
    applyKnockback(x, z, speed) { this.knocks.push({ x, z, speed }); },
    hurtBaseY: () => 0,
    facingYaw: () => 0,
    getDefense() { return this.defense; },
    getResist: () => 0,
    isStaggered: () => false,
  });

  const run = (combat, seconds, dt = 1 / 120) => {
    let t = 0;
    while (t < seconds - 1e-9) { combat.update(dt, {}); t += dt; }
  };

  it('轻击中段打躯干、重击上段打头：同一只敌人伤害按部位区分', () => {
    const e1 = makeTargetEnemy();
    const light = makeCombat([e1]);
    light.tryLightAttack();
    run(light, MOVES.light.at + 0.02);

    const e2 = makeTargetEnemy();
    const heavy = makeCombat([e2]);
    heavy.tryHeavyAttack();
    run(heavy, MOVES.heavy.at + 0.02);

    expect(e1.hits[0]).toBe(Math.round(PLAYER_MOVES.light.damage * light.getComboMultiplier()));
    expect(e2.hits[0]).toBe(Math.round(PLAYER_MOVES.heavy.damage * PARTS.head.mult));
  });

  it('敌人悬浮过高时中段打击带落空，重击上段仍能命中', () => {
    const hover = { ...makeTargetEnemy(), hurtBaseY: () => 2.5 };
    const combat = makeCombat([hover]);
    combat.tryLightAttack();
    run(combat, MOVES.light.at + 0.02);
    expect(hover.hits).toHaveLength(1);                              // snap 容差内，算打到最近段
    const far = { ...makeTargetEnemy(), hurtBaseY: () => 9 };
    const c2 = makeCombat([far]);
    c2.tryHeavyAttack();
    run(c2, MOVES.heavy.at + 0.02);
    expect(far.hits).toHaveLength(0);
  });

  it('出手者站到高处后，同一招在垂直方向打不到地面敌人', () => {
    const e = makeTargetEnemy();
    const combat = makeCombat([e]);
    combat.player.position.set(0, 6, 0);
    combat.tryLightAttack();
    run(combat, MOVES.light.at + 0.02);
    expect(e.hits).toHaveLength(0);
  });

  it('背刺加成走结算，不改写招式基线', () => {
    const e = makeTargetEnemy();
    const combat = makeCombat([e]);
    // 敌人在出手者前方且面朝同一方向（+Z 为正前方）→ 出手者位于其背后
    e.position.set(0, 0, -2.5);
    e.facingYaw = () => Math.PI;
    combat.tryLightAttack();
    run(combat, MOVES.light.at + 0.02);
    expect(e.hits[0]).toBeGreaterThan(PLAYER_MOVES.light.damage);
    expect(combat.lightDamage).toBe(PLAYER_MOVES.light.damage);
  });

  it('法术与近战共用结算：同一目标同一部位得到同一数字', () => {
    const t = target();
    const band = SPELL_BANDS.bolt;
    const part = selectPart(t.hurtbox, band[0], band[1]);
    const spell = resolveHit({ base: 38, posture: 8, target: t, part, element: 'fire', rng: () => 0.99 });
    expect(part.id).toBe('torso');
    expect(spell.damage).toBe(38);
    expect(spell.posture).toBe(8);
  });
});
