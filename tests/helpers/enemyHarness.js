/**
 * 敌人用例的共同脚手架。
 *
 * 单独成模块是因为招式用例（`enemy-moves.test.js`）与 AI 用例（`enemy-ai.test.js`）
 * 要用完全一样的世界、玩家替身与生成参数——任何一处漂移都会让「同样跑 600 帧」
 * 在两个文件里意味着不同的事。
 */
import * as THREE from 'three';
import { EnemyManager } from '../../src/combat/EnemyManager.js';
import { createHurtbox } from '../../src/combat/Hurtbox.js';
import { CollisionWorld } from '../../src/engine/Collision.js';

/** 没有真实 DOM：把 window 事件与 CustomEvent 换成最小可用替身 */
export function installWindowShim() {
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
}

/** 空平地世界；colliders 用来验证敌人真的被实体挡住 */
export const makeWorld = (colliders = []) => {
  const cw = new CollisionWorld(16);
  for (const c of colliders) {
    if (c.hx) cw.addBox(c); else cw.addCylinder(c);
  }
  cw.build();
  return { getGroundHeight: () => 0, collision: cw };
};

export const makeScene = () => ({ add() {}, remove() {} });

/**
 * 玩家替身：敌人只通过 combat 的公开接口碰它。
 *
 * 受击方契约要给**真的**受击盒与高度基准 —— `pickPart` 拿不到 hurtbox 时一律判空，
 * 替身若缺这两项，测试就会静默地"敌人永远打不到玩家"，比假数据更糟。
 * `ref.y` 用来模拟跳起 / 站高台（敌人据此判断这一刀在竖直方向落不落得下）。
 */
export const makePlayerRef = () => {
  const ref = { hits: [], parts: [], invulnerable: false, y: 0, yaw: 0, combat: null };
  ref.combat = {
    hurtbox: createHurtbox('player'),
    takeDamage: (n, element = null, part = null) => { ref.hits.push(n); ref.parts.push(part); },
    isInvulnerable: () => ref.invulnerable,
    hurtBaseY: () => ref.y,
    facingYaw: () => ref.yaw,
    getDefense: () => 0,
    getResist: () => 0,
    isStaggered: () => false,
  };
  return ref;
};

/** 弹体管理器替身：远程招式只会碰到 spawn 这一个接口 */
export const makeProjectileStub = () => ({
  fired: [],
  spawn(from, _target, damage, speed, color) {
    this.fired.push({ from: from.clone(), damage, speed, color });
  },
});

export const v = (x, z) => new THREE.Vector3(x, 0, z);

/** 空地上的管理器；projectiles 必须在构造期交出，AI 上下文才拿得到 */
export const makeManager = (over = {}) => {
  const { world = makeWorld(), projectiles = null } = over;
  return new EnemyManager(makeScene(), world, projectiles);
};

export const run = (m, seconds, dt, playerPos, playerRef) => {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) m.update(dt, playerPos, playerRef, null, null);
};

/** 推进到 `done()` 成立为止，返回是否达成：时序用例用它取代猜秒数 */
export const until = (m, seconds, dt, playerPos, playerRef, done) => {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    m.update(dt, playerPos, playerRef, null, null);
    if (done()) return true;
  }
  return false;
};

/** 追击中不脱战的测试兵：把记忆拉到无限，单独验证移动/招式 */
export const NEVER_LEAVES = { memory: 9999 };

export const spawn = (m, over) => m.spawn({
  name: '测试兵', type: 'soldier', x: 0, z: 0,
  hp: 100, posture: 60, damage: 10, speed: 5,
  aggroRange: 18, attackRange: 2.2, respawn: false, ...over,
});

/** n 只兵贴脸围住玩家：全部具备出手条件 */
export const encircle = (n = 4, over = {}) => {
  const m = makeManager(over);
  const player = v(0, 0);
  const ref = makePlayerRef();
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    list.push(spawn(m, { x: Math.sin(a) * 2, z: Math.cos(a) * 2, ai: NEVER_LEAVES, ...over }));
  }
  return { m, player, ref, list };
};

/** 空地上相距 dist 的一只敌人和原地不动的玩家 */
export const duel = (over = {}) => {
  const { x = 1.8, z = 0, ...config } = over;
  const m = makeManager(over);
  const player = v(0, 0);
  const ref = makePlayerRef();
  const e = spawn(m, { x, z, ...config });
  return { m, player, ref, e };
};
