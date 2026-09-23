/**
 * W-A5 切片3 —— 非锁定态挥砍的瞄准磁吸。
 *
 * 两层：
 *  ① 纯函数 `pickAimAssistTarget` 的宽容带数学（在 range 内、落在 [assistMinDot, swingMinDot) 的
 *     唯一一个"最对准星"目标），无副作用、无 origin 偏移，直接喂向量验证。
 *  ② 经 `processHitWindow` 的落地：确认它是**纯宽容**（只多打中侧前方那一个，绝不少打中），
 *     开关关掉即回到旧行为，锁定态不启用磁吸，且只补**一个**目标。
 *
 * 集成用例刻意用"相对出手点的角度"来摆敌人：玩家在原点、`getCombatForwardXZ` 恒为 -Z，
 * `getAttackOrigin` 会把出手点前移 1.2 米 —— 故侧前方 dot≈0 的敌人落在 (2,0,-1.2)。
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { CombatController, pickAimAssistTarget } from '../src/combat/CombatController.js';
import { MOVES } from '../src/combat/MoveTable.js';
import { createHurtbox } from '../src/combat/Hurtbox.js';
import { AIM_ASSIST } from '../src/content/tuning.js';
import { TimeController } from '../src/engine/Time.js';

beforeAll(() => {
  const handlers = new Map();
  globalThis.window = {
    addEventListener(t, fn) { (handlers.get(t) ?? handlers.set(t, new Set()).get(t)).add(fn); },
    removeEventListener(t, fn) { handlers.get(t)?.delete(fn); },
    dispatchEvent(e) { handlers.get(e.type)?.forEach((fn) => fn(e)); return true; },
  };
  globalThis.CustomEvent = class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  };
});

const v = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------------- ① 纯函数：宽容带数学 ---------------- */

describe('pickAimAssistTarget：只在 [assistMinDot, swingMinDot) 补最对准星的那一个', () => {
  const SWING = 0.12;      // light.cone
  const ASSIST = -0.05;    // 放宽后的外沿
  const fwd = v(0, 0, -1);
  const o = v(0, 0, 0);
  const enemy = (x, z, alive = true) => ({ position: v(x, 0, z), alive });
  const run = (list) => pickAimAssistTarget(o, fwd, list, { range: 4, swingMinDot: SWING, assistMinDot: ASSIST });

  it('在挥砍锥内（dot>=swing）的目标不归磁吸管 → null', () => {
    expect(run([enemy(0, -3)])).toBeNull();       // 正前方 dot=1
  });
  it('落在宽容带内 → 返回它', () => {
    const f = enemy(3, -0.1);                      // 侧前，dot≈0.03
    expect(run([f])).toBe(f);
  });
  it('超过宽容带外沿（dot<assist）→ 不收', () => {
    expect(run([enemy(3, 2)])).toBeNull();         // 明显偏后，dot<0
  });
  it('超出 range → 不收（磁吸不延长攻击距离）', () => {
    expect(run([enemy(0, -100)])).toBeNull();
  });
  it('两个都在带内 → 只取最对准星（dot 最大）的那一个', () => {
    const near = enemy(3, -0.2);                   // 更靠近锥沿（dot 更大）
    const far = enemy(3, 1.2);                     // 更偏（dot 更小，仍在带内）
    expect([near, far]).toContain(run([far, near]));
    expect(run([far, near])).toBe(near);
  });
  it('与出手点重合（dist=0）的敌人跳过，不产生 NaN', () => {
    expect(run([enemy(0, 0)])).toBeNull();
  });
  it('死亡目标不参与', () => {
    expect(run([enemy(3, -0.1, false)])).toBeNull();
  });
  it('空列表 → null', () => {
    expect(run([])).toBeNull();
  });
});

/* ---------------- ② 经 processHitWindow 的落地 ---------------- */

const makePlayer = () => ({
  scene: new THREE.Group(),
  mesh: { getObjectByName: () => null },
  position: v(0, 0, 0),
  velocity: v(0, 0, 0),
  yaw: 0,
  targetYaw: 0,
  cameraMode: 'third',
  characterModel: null,
  getCombatForwardXZ: () => v(0, 0, -1),
  faceYawFromDirection: () => 0,
  _dashVelocity: v(0, 0, 0),
  _dashRemaining: 0,
  applyDash() {},
  teleport(x, y, z) { this.position.set(x, y, z); },
});

const makeEnemy = (x, z) => {
  const e = {
    name: `e@${x},${z}`, position: v(x, 0, z), alive: true, state: 'idle', stateTimer: 0,
    maxPosture: 60, posture: 0, hits: [], postures: [], knocks: [],
    hurtbox: createHurtbox('soldier', 1), defense: 0,
    distanceTo: (p) => Math.hypot(p.x - e.position.x, p.z - e.position.z),
    takeDamage(d, posture = 0) { e.hits.push(d); e.postures.push(posture); return false; },
    applyKnockback(x, z, speed) { e.knocks.push({ x, z, speed }); },
    clearTelegraph() {}, hurtBaseY: () => 0, facingYaw: () => 0,
    getDefense: () => e.defense, getResist: () => 0, isStaggered: () => false,
    isParriable: () => false, forceStagger() {},
  };
  return e;
};

const makeCombat = (enemies) => {
  const manager = { enemies, getAliveEnemies: () => enemies.filter((e) => e.alive) };
  const combat = new CombatController(makePlayer(), manager, { toast() {} }, null, {}, null);
  combat.setTimeController(new TimeController());
  combat.rng = () => 0.99;
  return combat;
};

const run = (combat, seconds, dt = 1 / 120) => {
  for (let t = 0; t < seconds; t += dt) combat.update(dt, {});
};

// 侧前方 dot≈0 的敌人（相对出手点 (0,1.2,-1.2) 落在正 X 方向），无磁吸必打不到。
const flank = () => makeEnemy(2.0, -1.2);
const front = () => makeEnemy(0, -3);

const savedEnabled = AIM_ASSIST.enabled;
afterEach(() => { AIM_ASSIST.enabled = savedEnabled; });

describe('磁吸落地：纯宽容 —— 只多打中侧前那一个，绝不少打中', () => {
  it('默认开启：正面必中、侧前靠磁吸补中', () => {
    AIM_ASSIST.enabled = true;
    const a = front(); const f = flank();
    const combat = makeCombat([a, f]);
    combat.tryLightAttack();
    run(combat, MOVES.light.at + 0.05);
    expect(a.hits).toHaveLength(1);   // 正面：本就在锥内
    expect(f.hits).toHaveLength(1);   // 侧前：磁吸补判
  });

  it('关掉开关：回到旧行为，侧前那一个打不到（证明这是磁吸带来的增量）', () => {
    AIM_ASSIST.enabled = false;
    const a = front(); const f = flank();
    const combat = makeCombat([a, f]);
    combat.tryLightAttack();
    run(combat, MOVES.light.at + 0.05);
    expect(a.hits).toHaveLength(1);
    expect(f.hits).toHaveLength(0);
  });

  it('锁定态不启用磁吸：侧前目标既不靠锁定锥、也不被磁吸补中', () => {
    AIM_ASSIST.enabled = true;
    const lockDummy = front();          // 假装锁定在正前方那个
    const f = flank();
    const combat = makeCombat([lockDummy, f]);
    combat.lockTarget = lockDummy;
    combat.tryLightAttack();
    run(combat, MOVES.light.at + 0.05);
    expect(f.hits).toHaveLength(0);
  });

  it('只补一个目标：两个都在宽容带时，只有更对准星的那个被磁吸', () => {
    AIM_ASSIST.enabled = true;
    const moreAligned = makeEnemy(2.0, -1.35);   // 相对出手点 dot≈0.075，离锥沿更近
    const lessAligned = makeEnemy(2.0, -1.2);    // dot≈0
    const combat = makeCombat([moreAligned, lessAligned]);
    combat.tryLightAttack();
    run(combat, MOVES.light.at + 0.05);
    expect(moreAligned.hits).toHaveLength(1);
    expect(lessAligned.hits).toHaveLength(0);
  });
});
