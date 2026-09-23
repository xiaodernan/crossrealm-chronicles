import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CombatController } from '../src/combat/CombatController.js';
import { MOVES } from '../src/combat/MoveTable.js';
import { INPUT } from '../src/content/tuning.js';
import { createHurtbox } from '../src/combat/Hurtbox.js';
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
  applyDash(yaw, speed, duration) {
    this._dashVelocity.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    this._dashRemaining = Math.max(this._dashRemaining, duration ?? 0);
  },
  teleport(x, y, z) { this.position.set(x, y, z); this.velocity.set(0, 0, 0); },
});

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
  distanceTo(p) { return Math.hypot(p.x - this.position.x, p.z - this.position.z); },
  takeDamage(d, posture = 0) { this.hits.push(d); this.postures.push(posture); return false; },
  applyKnockback(x, z, speed) { this.knocks.push({ x, z, speed }); },
  clearTelegraph() {},
  hurtBaseY: () => 0,
  facingYaw: () => 0,
  getDefense() { return this.defense; },
  getResist() { return 0; },
  isStaggered() { return false; },
  isParriable: () => opts.parriable ?? false,
  forceStagger() {},
});

/** 记录 characterModel 的调用次数：用来验证"表现只播一次" */
const makeCharacterModel = () => {
  const calls = { playBlock: 0, playComboAttack: 0, playHeavyAttack: 0, playDodge: 0 };
  const rec = (name) => () => { calls[name] += 1; };
  return { calls, playBlock: rec('playBlock'), playComboAttack: rec('playComboAttack'), playHeavyAttack: rec('playHeavyAttack'), playDodge: rec('playDodge') };
};

const noop = () => {};
const makeAudio = () => ({
  swingLight: noop, swingHeavy: noop, hit: noop, heavyHit: noop,
  dodge: noop, parry: noop, blockClink: noop,
});

const makeCombat = (enemies = []) => {
  const player = makePlayer();
  player.characterModel = makeCharacterModel();
  // respawn / clearLock 会回写管理器，替身必须提供这两个出口
  const manager = {
    enemies,
    getAliveEnemies: () => enemies.filter((e) => e.alive),
    setLockTarget: noop,
  };
  const combat = new CombatController(player, manager, { toast: noop }, null, makeAudio(), null);
  combat.setTimeController(new TimeController());
  combat.rng = () => 0.99;          // 默认不暴击，断言比的是确定值
  combat.player.characterModel = player.characterModel;
  return combat;
};

/** 按固定步长推进；`onFrame(i)` 每帧前调用，用来注入按键 */
const step = (combat, seconds, dt, { keys = {}, onFrame } = {}) => {
  let t = 0;
  let i = 0;
  while (t < seconds - 1e-9) {
    onFrame?.(i, combat);
    combat.update(dt, keys);
    t += dt;
    i += 1;
  }
  return t;
};

/** 按到"总游戏内时间达到 target"为止，从当前 stateTimer 起算 */
const advanceTo = (combat, target, dt = 1 / 120) => step(combat, target - combat.stateTimer, dt);

describe('取消关系表（数据自证）', () => {
  const ACTIONS = ['light', 'heavy', 'roll', 'parry', 'skill'];

  it('每招都声明了 cancel，且 from 不早于命中帧', () => {
    for (const [name, m] of Object.entries(MOVES)) {
      expect(m.cancel, `${name} 缺 cancel`).toBeTruthy();
      // 取消早于命中帧 = 这一刀永远打不出去，而 `_strike` 还挂着
      expect(m.cancel.from, `${name} 的取消窗口早于命中帧`).toBeGreaterThanOrEqual(m.at);
    }
  });

  it('into 只含已知动作名', () => {
    for (const [name, m] of Object.entries(MOVES)) {
      for (const a of m.cancel.into) {
        expect(ACTIONS, `${name}.into 含未知动作 ${a}`).toContain(a);
      }
    }
  });

  it('翻滚与战技是承诺态：不允许被任何动作打断', () => {
    expect(MOVES.roll.cancel.into).toEqual([]);
    expect(MOVES.skill.cancel.into).toEqual([]);
  });

  it('轻击不给弹反：刀还在挥时没有举盾的空间', () => {
    expect(MOVES.light.cancel.into).not.toContain('parry');
  });

  it('重击只给翻滚：命中后能撤，但不能变成零代价的起手', () => {
    expect(MOVES.heavy.cancel.into).toEqual(['roll']);
  });
});

describe('canStart 取消判定', () => {
  it('不在招式中（idle / combo）一律放行', () => {
    const combat = makeCombat();
    for (const a of ['light', 'heavy', 'roll', 'parry', 'skill']) {
      expect(combat.canStart(a), `idle 应放行 ${a}`).toBe(true);
    }
    combat.state = 'combo';
    expect(combat.canStart('light')).toBe(true);
  });

  it('轻击：窗口打开前一律拒绝，打开后放行连段/重击/翻滚，但仍拒绝弹反与战技', () => {
    const combat = makeCombat();
    combat.tryLightAttack();
    advanceTo(combat, MOVES.light.cancel.from - 0.02);
    expect(combat.canStart('light')).toBe(false);
    expect(combat.canStart('roll')).toBe(false);

    advanceTo(combat, MOVES.light.cancel.from + 0.02);
    expect(combat.canStart('light')).toBe(true);
    expect(combat.canStart('heavy')).toBe(true);
    expect(combat.canStart('roll')).toBe(true);
    expect(combat.canStart('parry')).toBe(false);
    expect(combat.canStart('skill')).toBe(false);
  });

  it('重击：窗口打开后只放行翻滚', () => {
    const combat = makeCombat();
    combat.tryHeavyAttack();
    advanceTo(combat, MOVES.heavy.cancel.from + 0.02);
    expect(combat.canStart('roll')).toBe(true);
    expect(combat.canStart('light')).toBe(false);
    expect(combat.canStart('heavy')).toBe(false);
  });

  it('翻滚全程拒绝（含翻滚接翻滚）——否则无敌帧能首尾相接', () => {
    const combat = makeCombat();
    expect(combat.tryRoll()).toBe(true);
    for (const t of [0.05, 0.2, 0.31, 0.4]) {
      combat.stateTimer = t;
      expect(combat.canStart('roll'), `t=${t} 不该放行翻滚`).toBe(false);
      expect(combat.canStart('light'), `t=${t} 不该放行轻击`).toBe(false);
    }
  });

  it('战技全程拒绝', () => {
    const combat = makeCombat();
    expect(combat.tryWeaponArt()).toBe(true);
    combat.stateTimer = 0.44;
    expect(combat.canStart('light')).toBe(false);
    expect(combat.canStart('roll')).toBe(false);
  });
});

describe('输入缓冲', () => {
  const DT = 1 / 120;

  it('窗口打开前按下会被记住，窗口一开就当帧兑现', () => {
    const combat = makeCombat();
    combat.tryLightAttack();
    // 在取消窗口（0.22）之前一点按下第二刀：0.20 按下，缓冲到 0.38，窗口 0.22 开
    advanceTo(combat, 0.20, DT);
    combat.mouseDown.left = true;
    combat.update(DT, {});
    expect(combat._input.action).toBe('light');
    expect(combat.state).toBe('light');       // 还没到窗口，没兑现

    advanceTo(combat, MOVES.light.cancel.from + 0.01, DT);
    expect(combat.comboCount).toBe(2);        // 兑现成第二段
    expect(combat._input.action).toBe(null);  // 兑现后缓冲清空
  });

  it('按得太早（超出缓冲窗口）不会兑现', () => {
    const combat = makeCombat();
    combat.tryLightAttack();
    // 起手瞬间按下：缓冲在 0.18 到期，而窗口 0.22 才开
    combat.mouseDown.left = true;
    combat.update(DT, {});
    expect(combat._input.action).toBe('light');
    advanceTo(combat, INPUT.buffer + 0.02, DT);
    expect(combat._input.action).toBe(null);
    advanceTo(combat, MOVES.light.cancel.from + 0.05, DT);
    expect(combat.comboCount).toBe(1);        // 没有兑现出第二段
  });

  it('只保留最近一次按下：连点轻击再重击，兑现的是重击', () => {
    const combat = makeCombat();
    combat.tryLightAttack();
    advanceTo(combat, 0.20, DT);
    combat.mouseDown.left = true;
    combat.update(DT, {});
    combat.mouseDown.right = true;
    combat.update(DT, {});
    expect(combat._input.action).toBe('heavy');

    advanceTo(combat, MOVES.light.cancel.from + 0.01, DT);
    expect(combat.state).toBe('heavy');
  });

  it('长按 Ctrl 只触发一次翻滚（按下沿，不是电平）', () => {
    const combat = makeCombat();
    const keys = { ControlLeft: true };
    // 按住不放跑 0.5 秒：只该起一次翻滚
    combat.update(DT, keys);
    expect(combat.state).toBe('roll');
    const firstCooldown = combat.rollCooldownTimer;
    step(combat, 0.5, DT, { keys });
    // 翻滚期间本来也进不去，关键是冷却结束后不该因为"还按着"就自动再滚一次
    combat.rollCooldownTimer = 0;
    combat.state = 'idle';
    combat.stateTimer = 0;
    step(combat, 0.2, DT, { keys });
    expect(combat.state).toBe('idle');
    expect(firstCooldown).toBeGreaterThan(0);
  });

  it('松开再按可以再次触发（边沿检测不吞掉真实的新按键）', () => {
    const combat = makeCombat();
    const keys = { ControlLeft: true };
    combat.update(DT, keys);
    expect(combat.state).toBe('roll');
    // 松手
    keys.ControlLeft = false;
    step(combat, 0.5, DT, { keys });
    combat.rollCooldownTimer = 0;
    // 再按
    keys.ControlLeft = true;
    combat.update(DT, keys);
    expect(combat.state).toBe('roll');
  });

  it('空闲时按下当帧就兑现，不会停在缓冲里（缓冲只在"暂时兑现不了"时才是缓冲）', () => {
    const combat = makeCombat();
    combat.mouseDown.left = true;
    combat.update(DT, {});
    expect(combat.state).toBe('light');
    expect(combat._input.action).toBe(null);
  });

  it('重生清空缓冲：承诺态里按下的键不会在复活后突然兑现', () => {
    const combat = makeCombat();
    combat.tryRoll();                          // 翻滚不可取消，按键只能先缓冲着
    combat.mouseDown.left = true;
    combat.update(DT, {});
    expect(combat._input.action).toBe('light');
    combat.respawn();
    expect(combat._input.action).toBe(null);
    expect(combat._input.ttl).toBe(0);
  });
});

describe('取消不吞刀', () => {
  const DT = 1 / 120;

  it('轻击接轻击：第一刀仍然结算了一次命中', () => {
    const e = makeEnemy(0, -2.5);
    const combat = makeCombat([e]);
    combat.tryLightAttack();
    advanceTo(combat, MOVES.light.cancel.from + 0.01, DT);
    expect(e.hits).toHaveLength(1);           // 第一刀已落地

    expect(combat.tryLightAttack()).toBe(true);  // 取消进第二段
    advanceTo(combat, MOVES.light.at + 0.02, DT);
    expect(e.hits).toHaveLength(2);
  });

  it('轻击取消进翻滚后，残留判定不会在翻滚中途突然结算', () => {
    const e = makeEnemy(0, -2.5);
    const combat = makeCombat([e]);
    combat.tryLightAttack();
    advanceTo(combat, MOVES.light.cancel.from + 0.01, DT);
    const hitsBefore = e.hits.length;

    expect(combat.tryRoll()).toBe(true);
    expect(combat._strike).toBe(null);        // 判定被摘掉
    step(combat, MOVES.roll.duration + 0.1, DT);
    expect(e.hits).toHaveLength(hitsBefore);
  });

  it('取消窗口正好落在命中帧之后：不会出现"取消了但那一刀没打出去"', () => {
    for (const [name, m] of Object.entries(MOVES)) {
      if (!Number.isFinite(m.cancel.from)) continue;
      const e = makeEnemy(0, -2.5);
      const combat = makeCombat([e]);
      if (name === 'heavy') combat.tryHeavyAttack();
      else if (name === 'light') combat.tryLightAttack();
      else continue;
      advanceTo(combat, m.cancel.from + 0.005, DT);
      expect(e.hits.length, `${name} 在取消窗口打开时还没结算命中`).toBeGreaterThan(0);
    }
  });
});

describe('弹反表现只播一次', () => {
  it('一次按键跨多帧重试判定，举盾动作只播一次', () => {
    const combat = makeCombat([makeEnemy(0, -2)]);
    const keys = { KeyF: true };
    // 按住 F 跑 0.3 秒：缓冲过期后会重新触发按下沿吗？不会 —— 只有第一次是边沿
    combat.update(1 / 120, keys);
    const afterFirst = combat.player.characterModel.calls.playBlock;
    expect(afterFirst).toBe(1);
    step(combat, 0.3, 1 / 120, { keys });
    expect(combat.player.characterModel.calls.playBlock).toBe(1);
  });

  it('提前按下 F 仍能在敌人进入可弹反窗口时兑现（输入宽容）', () => {
    const e = makeEnemy(0, -2, { parriable: false });
    const combat = makeCombat([e]);
    const keys = { KeyF: true };
    combat.update(1 / 120, keys);
    expect(combat.riposteWindow).toBe(0);     // 敌人此刻还不可弹反

    e.isParriable = () => true;               // 0.05 秒后进入可弹反窗口
    step(combat, 0.05, 1 / 120, { keys });
    expect(combat.riposteWindow).toBeGreaterThan(0);
  });
});
