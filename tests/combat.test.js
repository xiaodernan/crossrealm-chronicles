import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CombatController } from '../src/combat/CombatController.js';
import { SpellSystem } from '../src/combat/SpellSystem.js';
import { MOVES } from '../src/combat/MoveTable.js';
import { createHurtbox } from '../src/combat/Hurtbox.js';
import { TimeController } from '../src/engine/Time.js';

/** CombatController 通过 window 事件对外广播，node 环境下补一个最小派发器 */
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

const makePlayer = () => ({
  scene: new THREE.Group(),
  mesh: { getObjectByName: () => null },
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(),
  yaw: 0,
  cameraMode: 'third',
  characterModel: null,
  getCombatForwardXZ: () => new THREE.Vector3(0, 0, -1),
  _dashVelocity: new THREE.Vector3(),
  _dashRemaining: 0,
  // 与 PlayerController.applyDash 同一份契约：只登记冲量与时长，位移由玩家侧按时间积分
  applyDash(yaw, speed, duration) {
    this._dashVelocity.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    this._dashRemaining = Math.max(this._dashRemaining, duration ?? 0);
  },
  teleport(x, y, z) { this.position.set(x, y, z); this.velocity.set(0, 0, 0); },
});

/** 敌人替身：受击方只读接口全部给真的，避免测试走生产兜底分支 */
const makeEnemy = (x, z, opts = {}) => ({
  name: `e@${x},${z}`,
  position: new THREE.Vector3(x, 0, z),
  alive: true,
  state: 'idle',
  stateTimer: 0,
  maxPosture: 60,
  posture: 0,
  hits: [],
  postures: [],
  knocks: [],
  hurtbox: createHurtbox('soldier', opts.hurtScale ?? 1),
  defense: opts.defense ?? 0,
  distanceTo(p) { return Math.hypot(p.x - this.position.x, this.position.z - this.position.z); },
  takeDamage(d, posture = 0) { this.hits.push(d); this.postures.push(posture); return false; },
  applyKnockback(x, z, speed) { this.knocks.push({ x, z, speed }); },
  clearTelegraph() {},
  hurtBaseY: () => 0,
  facingYaw: () => 0,
  getDefense() { return this.defense; },
  getResist: () => 0,
  isStaggered: () => false,
  isParriable: () => false,
  forceStagger() {},
});


/** AudioManager 的契约：战斗系统会直接调用的方法都存在这里 */
const makeAudio = () => {
  const noop = () => {};
  return {
    swingLight: noop, swingHeavy: noop, hit: noop, heavyHit: noop,
    dodge: noop, parry: noop, blockClink: noop, spellCast: noop,
  };
};

const makeCombat = (enemies = []) => {
  const manager = { enemies, getAliveEnemies: () => enemies.filter((e) => e.alive) };
  const combat = new CombatController(makePlayer(), manager, { toast() {} }, null, makeAudio(), null);
  combat.setTimeController(new TimeController());
  // 默认不暴击：帧率无关性等断言比较的是确定伤害，暴击另有专门用例
  combat.rng = () => 0.99;
  return combat;
};

/** 以固定步长推进主循环，返回实际推进的游戏内秒数 */
const runTo = (step, seconds, dt) => {
  let t = 0;
  while (t < seconds - 1e-9) { step(dt); t += dt; }
  return t;
};
const run = (combat, seconds, dt) => runTo((d) => combat.update(d, {}), seconds, dt);

describe('出手帧表与定格判定', () => {
  it('重击不在起手当帧结算，到命中帧才结算一次', () => {
    const e = makeEnemy(0, -3);
    const combat = makeCombat([e]);
    expect(combat.tryHeavyAttack()).toBe(true);
    expect(e.hits).toHaveLength(0);          // B6：释放当帧不出伤害
    run(combat, MOVES.heavy.at - 0.06, 1 / 120);
    expect(e.hits).toHaveLength(0);          // 命中帧之前仍不结算
    run(combat, MOVES.heavy.at + 0.02, 1 / 120);
    expect(e.hits).toHaveLength(1);
  });

  it('判定只执行一次，窗口内后到的敌人不被补判', () => {
    const near = makeEnemy(0, -3);
    const late = makeEnemy(0, -9);
    const combat = makeCombat([near, late]);
    combat.tryHeavyAttack();
    run(combat, MOVES.heavy.at + 0.02, 1 / 120);
    expect(near.hits).toHaveLength(1);
    expect(late.hits).toHaveLength(0);
    late.position.set(0, 0, -3);             // 敌人后撤进范围
    run(combat, MOVES.heavy.duration, 1 / 120);
    expect(late.hits).toHaveLength(0);       // B5：本次出手不再补判
    expect(near.hits).toHaveLength(1);
  });

  it('同一帧率无关：144/60/30fps 下单次轻击命中数与伤害一致', () => {
    const results = [1 / 144, 1 / 60, 1 / 30].map((dt) => {
      const e = makeEnemy(0, -2.5);
      const combat = makeCombat([e]);
      combat.tryLightAttack();
      run(combat, MOVES.light.duration + dt, dt);
      return { count: e.hits.length, dmg: e.hits[0] };
    });
    expect(results.map((r) => r.count)).toEqual([1, 1, 1]);
    expect(new Set(results.map((r) => r.dmg)).size).toBe(1);
  });

  it('武器战技全向命中并延后到命中帧结算', () => {
    const behind = makeEnemy(0, 3);
    const combat = makeCombat([behind]);
    combat.tryWeaponArt();
    expect(behind.hits).toHaveLength(0);
    run(combat, MOVES.skill.at + 0.02, 1 / 120);
    expect(behind.hits).toHaveLength(1);
  });

  it('轻击三段后触发连击终结，终结有自己的一次判定', () => {
    const e = makeEnemy(0, -2.5);
    const combat = makeCombat([e]);
    combat.comboCount = 2;
    combat.comboTimer = 0.5;                 // 仍在连击窗内，本次轻击计入第 3 段
    combat.tryLightAttack();
    expect(combat.comboCount).toBe(3);
    run(combat, MOVES.light.at + 0.05, 1 / 120);
    expect(combat.state).toBe('skill');      // 终结技已接管状态
    const before = e.hits.length;
    run(combat, MOVES.skill.at + 0.05, 1 / 120);
    expect(e.hits.length).toBe(before + 1);
  });

  it('弹反伤害写进本次判定，不永久改写 heavyDamage 基线', () => {
    const combat = makeCombat([]);
    const baseline = combat.heavyDamage;
    combat.riposteWindow = 1;
    combat.tryHeavyAttack();
    expect(combat.heavyDamage).toBe(baseline);
    run(combat, MOVES.heavy.at + 0.05, 1 / 120);
    expect(combat.lightDamage).toBe(22);
  });
});

describe('定时清理与全局 hitstop', () => {
  it('schedule 按主循环 dt 到期并释放登记的资源', () => {
    const combat = makeCombat([]);
    let fired = 0;
    let disposed = 0;
    combat.schedule(0.2, () => { fired++; }, { dispose: () => { disposed++; } });
    run(combat, 0.15, 1 / 60);
    expect(fired).toBe(0);
    run(combat, 0.25, 1 / 60);
    expect(fired).toBe(1);
    expect(disposed).toBe(1);
  });

  it('命中停顿走全局时间缩放，到期后自动恢复', () => {
    const time = new TimeController();
    const combat = makeCombat([]);
    combat.setTimeController(time);
    combat.requestHitstop(0.1);
    time.tick(0.016, time.now + 0.016);
    expect(time.timeScale).toBeLessThan(1);
    expect(time.rawDt * time.timeScale).toBeCloseTo(time.scaledDt, 10);
    time.tick(0.016, time.now + 0.5);
    expect(time.timeScale).toBe(1);
  });

  it('翻滚按帧表请求冲量并进入无敌', () => {
    const combat = makeCombat([]);
    combat.tryRoll();
    expect(combat.player._dashRemaining).toBeCloseTo(MOVES.roll.duration, 10);
    expect(combat.player._dashVelocity.length()).toBeCloseTo(MOVES.roll.speed, 10);
    expect(combat.invincible).toBe(true);
    run(combat, MOVES.roll.duration + 0.02, 1 / 60);
    expect(combat.state).toBe('idle');
  });
});

describe('法术弹体的生命周期', () => {
  const makeSpells = (enemies = []) => {
    const player = { ...makePlayer(), combat: { isBusy: () => false } };
    const manager = { enemies, getAliveEnemies: () => enemies.filter((e) => e.alive) };
    const noop = () => {};
    return new SpellSystem(new THREE.Group(), player, manager, null, null,
      { spellCast: noop, hit: noop, heavyHit: noop }, null);
  };

  /** 记录 dispose 次数，验证 GPU 资源确实被交还 */
  const watchDispose = (obj) => {
    const seen = { geometry: 0, material: 0 };
    for (const key of ['geometry', 'material']) {
      const target = obj[key];
      const orig = target.dispose.bind(target);
      target.dispose = (...a) => { seen[key]++; return orig(...a); };
    }
    return seen;
  };

  it('弹体命中后从场景移除并释放几何与材质', () => {
    const e = makeEnemy(0, -6);
    const spells = makeSpells([e]);
    expect(spells.cast(1)).toBe(true);
    expect(spells.vfxGroup.children).toHaveLength(1);
    const seen = watchDispose(spells._bolts[0]);
    runTo((dt) => spells.update(dt, {}), 1.0, 1 / 60);
    expect(e.hits).toHaveLength(1);
    expect(spells._bolts).toHaveLength(0);
    expect(spells.vfxGroup.children).toHaveLength(0);
    expect(seen).toEqual({ geometry: 1, material: 1 });
  });

  it('未命中的弹体到期后同样释放，不留在场景里', () => {
    const spells = makeSpells([]);
    spells.cast(1);
    const seen = watchDispose(spells._bolts[0]);
    runTo((dt) => spells.update(dt, {}), 1.5, 1 / 60);
    expect(spells._bolts).toHaveLength(0);
    expect(spells.vfxGroup.children).toHaveLength(0);
    expect(seen).toEqual({ geometry: 1, material: 1 });
  });

  it('引力领域在展开结束后结算一次并释放', () => {
    const e = makeEnemy(2, 2);
    const spells = makeSpells([e]);
    spells.cast(3);
    const seen = watchDispose(spells._aoes[0]);
    runTo((dt) => spells.update(dt, {}), 0.7, 1 / 60);
    expect(e.hits).toHaveLength(1);
    expect(spells._aoes).toHaveLength(0);
    expect(spells.vfxGroup.children).toHaveLength(0);
    expect(seen).toEqual({ geometry: 1, material: 1 });
  });

  it('弹体沿玩家的战斗正方向飞，而不是自己按 yaw 拼方向', () => {
    const ahead = makeEnemy(0, 6);
    const behind = makeEnemy(0, -6);
    // 替身玩家：yaw 仍为 0，但正方向是 +Z —— 旧实现按 -cos yaw 展开会朝 -Z 打到身后
    const player = { ...makePlayer(), combat: { isBusy: () => false }, getCombatForwardXZ: () => new THREE.Vector3(0, 0, 1) };
    const manager = { getAliveEnemies: () => [ahead, behind].filter((e) => e.alive) };
    const noop = () => {};
    const spells = new SpellSystem(new THREE.Group(), player, manager, null, null,
      { spellCast: noop, hit: noop, heavyHit: noop }, null);
    spells.rng = () => 0.99;
    expect(spells.cast(1)).toBe(true);
    runTo((dt) => spells.update(dt, {}), 1.0, 1 / 60);
    expect(ahead.hits).toHaveLength(1);
    expect(behind.hits).toHaveLength(0);
  });
});
