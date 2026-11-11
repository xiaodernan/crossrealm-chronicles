/**
 * 位面试炼（W-F3 切片1 / 切片2 / 切片3）。
 *
 * 这一族要钉住的是**"词缀与试炼真的在改规则"这件事**：
 * ① 内容层八条词缀的 id 与 `content/seasons.js` 逐字对齐（不靠人肉复制）；
 * ② 折叠规则把加项相加、乘项相乘，未知 id 当场抛（悄悄忽略 = 玩家成绩与规则对不上）；
 * ③ 运行时按世界时走秒、超时/死亡/放弃三条结束路互斥、五层打完才算通关；
 * ④ 灼烧走玩家受伤的既有入口，且**按秒结算**（每帧打 0.04 点会把事件刷爆）；
 * ⑤ 切片3：怪是它自己刷的（黄金角、有上限、不超配额），击杀口径收窄成"只算自己刷的"；
 * ⑥ **清理必须延迟一帧**：`enemy-defeated` 的派发栈正走在 `EnemyManager` 遍历里，
 *    此刻 `splice` 会跳过下一只敌人 —— 这一条是本片最贵的一课，用例单独钉；
 * ⑦ 接线三处（Game / 注册表 / HUD）静态钉住 —— 仓库有过"加了系统却打不开"的旧病。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRIAL_MAX_LAYERS, TRIAL_LAYERS, TRIAL_AFFIX_EFFECTS, TRIAL_BASE_EFFECT,
  TRIAL_ORIGIN, TRIAL_ARENA, trialSpawnOffset,
  trialLayerOf, trialModifiers, layerSeconds, layerQuota, layerScale, trialScore,
} from '../src/content/trial.js';
import { SEASON_MODIFIERS } from '../src/content/seasons.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { TrialSystem } from '../src/game/TrialSystem.js';
import { emit, listenerCount } from '../src/engine/EventBus.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 源 = (rel) => readFileSync(join(process.cwd(), 'src', ...rel.split('/')), 'utf8');

/**
 * 造一个假 game：玩家有位置与受伤入口，刷怪器只记账（不造真 Enemy —— 那是
 * `spawn-tuning.test.js` 的活，那边有真的 EnemyManager 与真的世界）。
 */
function fakeGame({ withSpawner = true } = {}) {
  const hits = [];
  const spawned = [];
  const despawned = [];
  const game = {
    hits,
    spawned,
    despawned,
    player: {
      position: { x: 10, z: -4 },
      combat: { takeDamage: (n, el) => hits.push([n, el]) },
    },
  };
  if (withSpawner) {
    game.enemyManager = {
      spawnAt: (type, x, z, extra = {}) => {
        const enemy = { type, x, z, ...extra, alive: true };
        spawned.push(enemy);
        return enemy;
      },
      despawn: (e) => { despawned.push(e); e.alive = false; },
    };
  }
  return game;
}

/** 打死一只**在场上的**试炼怪：先把假敌人标死，再派一条带来源的事件（贴近真实顺序） */
function 击杀一只(g) {
  const target = g.spawned.find((e) => e.alive);
  if (target) target.alive = false;
  emit('enemy-defeated', { type: target?.type ?? 'soldier', origin: TRIAL_ORIGIN });
}

let sys = null;
afterEach(() => { sys?.dispose(); sys = null; });

describe('位面试炼 · 内容层', () => {
  it('层数曲线从 1 到 5 连续，配额与时限都是正数', () => {
    expect(TRIAL_LAYERS.length).toBe(TRIAL_MAX_LAYERS);
    expect(TRIAL_LAYERS.map((r) => r.layer)).toEqual([1, 2, 3, 4, 5]);
    for (const r of TRIAL_LAYERS) {
      expect(r.quota, `第 ${r.layer} 层配额`).toBeGreaterThan(0);
      expect(r.seconds, `第 ${r.layer} 层时限`).toBeGreaterThan(0);
    }
  });

  it('每层池子里的 id 都在敌人名册里（不靠人肉记身份）', () => {
    for (const r of TRIAL_LAYERS) {
      for (const id of r.pool) {
        expect(Object.keys(ENEMY_ROSTER), `第 ${r.layer} 层的 "${id}" 不在名册里`).toContain(id);
      }
    }
  });

  it('缩放三乘子都是正有限数（乘出 0 的后果是"敌人没有血量"）', () => {
    for (const r of TRIAL_LAYERS) {
      for (const k of ['hp', 'damage', 'speed']) {
        expect(Number.isFinite(r.scale[k]) && r.scale[k] > 0, `第 ${r.layer} 层 ${k}`).toBe(true);
      }
    }
  });

  it('层号越界当场抛，返回的是同一行对象', () => {
    expect(trialLayerOf(1)).toBe(TRIAL_LAYERS[0]);
    expect(trialLayerOf(TRIAL_MAX_LAYERS)).toBe(TRIAL_LAYERS[TRIAL_LAYERS.length - 1]);
    expect(() => trialLayerOf(0)).toThrow(/没有第 0 层/);
    expect(() => trialLayerOf(TRIAL_MAX_LAYERS + 1)).toThrow(/没有第 6 层/);
  });

  it('八条词缀的 id 与赛季名册逐字相同（同一份 id 两处用）', () => {
    expect(Object.keys(TRIAL_AFFIX_EFFECTS).sort())
      .toEqual(SEASON_MODIFIERS.map((m) => m.id).sort());
  });

  it('场地三数都是正数，且同时在场数不超过每层最小配额', () => {
    expect(TRIAL_ARENA.radius).toBeGreaterThan(0);
    expect(TRIAL_ARENA.waveSize).toBeGreaterThan(0);
    expect(TRIAL_ARENA.waveInterval).toBeGreaterThan(0);
    // 场上的怪比配额还多的话，多出来的那几只过层后就没主人了
    const 最小配额 = Math.min(...TRIAL_LAYERS.map((r) => r.quota));
    expect(TRIAL_ARENA.waveSize).toBeLessThanOrEqual(最小配额);
  });

  it('落点纯函数：距离恒等于半径，相邻两只不重叠，脏参数回落', () => {
    const r = 9;
    for (let i = 0; i < 6; i += 1) {
      const p = trialSpawnOffset(i, r);
      expect(Math.hypot(p.x, p.z), `第 ${i} 只不在半径上`).toBeCloseTo(r, 6);
      if (i > 0) {
        const q = trialSpawnOffset(i - 1, r);
        expect(Math.hypot(p.x - q.x, p.z - q.z), `第 ${i} 只与上一只重叠`).toBeGreaterThan(0.1);
      }
    }
    // 脏参数：不抛，回落到默认半径
    for (const 脏 of [NaN, undefined, -3]) {
      const p = trialSpawnOffset(脏);
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(TRIAL_ARENA.radius, 6);
    }
    const 负半径 = trialSpawnOffset(0, -1);
    expect(Math.hypot(负半径.x, 负半径.z)).toBeCloseTo(TRIAL_ARENA.radius, 6);
  });
});

describe('位面试炼 · 词缀折叠', () => {
  it('空列表 = 基线（乘项为 1，加项为 0）', () => {
    expect(trialModifiers([])).toEqual(TRIAL_BASE_EFFECT);
    expect(trialModifiers()).toEqual(TRIAL_BASE_EFFECT);
  });

  it('加项相加、乘项相乘', () => {
    const m = trialModifiers(['drowned-echo', 'elite-surge']);
    expect(m.timeDelta).toBe(-15);
    expect(m.quotaDelta).toBe(1);
    const m2 = trialModifiers(['swift-shades', 'armored-choir']);
    expect(m2.speedMul).toBeCloseTo(1.15 * 0.9, 10);
    expect(m2.hpMul).toBeCloseTo(1.1, 10);
  });

  it('同一条 id 出现两次只算一次', () => {
    expect(trialModifiers(['swift-shades', 'swift-shades'])).toEqual(trialModifiers(['swift-shades']));
  });

  it('未知 id 当场抛（悄悄忽略会让规则与页面不一致）', () => {
    expect(() => trialModifiers(['no-such-affix'])).toThrow(/未知词缀/);
  });

  it('不是数组当场抛', () => {
    expect(() => trialModifiers('swift-shades')).toThrow(/要一组词缀 id/);
  });

  it('乘子始终正有限（这一条是给"以后有人往表里加 0"准备的）', () => {
    const m = trialModifiers(Object.keys(TRIAL_AFFIX_EFFECTS));
    for (const k of ['hpMul', 'damageMul', 'speedMul', 'fogMul']) {
      expect(Number.isFinite(m[k]) && m[k] > 0, k).toBe(true);
    }
  });
});

describe('位面试炼 · 词缀落到层上', () => {
  const 紧 = trialModifiers(['drowned-echo', 'elite-surge']);

  it('时限与配额按词缀加减', () => {
    expect(layerSeconds(1, 紧)).toBe(TRIAL_LAYERS[0].seconds - 15);
    expect(layerQuota(1, 紧)).toBe(TRIAL_LAYERS[0].quota + 1);
  });

  it('下界夹紧：时限不低于 10 秒，配额不低于 1 只（再短就不是限时是抽奖）', () => {
    expect(layerSeconds(1, { timeDelta: -9999 })).toBe(10);
    expect(layerQuota(1, { quotaDelta: -9999 })).toBe(1);
  });

  it('出生缩放把词缀乘子折进曲线自带的 scale', () => {
    const mods = trialModifiers(['swift-shades']);
    const s = layerScale(3, mods);
    expect(s.hp).toBeCloseTo(TRIAL_LAYERS[2].scale.hp, 10);
    expect(s.speed).toBeCloseTo(TRIAL_LAYERS[2].scale.speed * 1.15, 10);
  });
});

describe('位面试炼 · 计分', () => {
  it('每层 100 分，剩余秒数每 10 秒 1 分', () => {
    expect(trialScore(0, 0)).toBe(0);
    expect(trialScore(1, 0)).toBe(100);
    expect(trialScore(5, 0)).toBe(500);
    expect(trialScore(1, 59)).toBe(105);
  });

  it('脏参数被夹住而不是算出负数或小数分', () => {
    expect(trialScore(-3, -9)).toBe(0);
    expect(trialScore(2.7, 19.9)).toBe(201);
  });
});

describe('位面试炼 · 运行时', () => {
  it('开局：第 1 层、配额与时限来自曲线、状态 running', () => {
    sys = new TrialSystem(fakeGame());
    const st = sys.start([]);
    expect(st.state).toBe('running');
    expect(st.layer).toBe(1);
    expect(st.quota).toBe(TRIAL_LAYERS[0].quota);
    expect(st.secondsLeft).toBe(TRIAL_LAYERS[0].seconds);
    expect(st.maxLayers).toBe(TRIAL_MAX_LAYERS);
  });

  it('击杀推进；打满配额进下一层并派一条 trial-layer-cleared', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    const seen = [];
    window.addEventListener('trial-layer-cleared', (e) => seen.push(e.detail));
    sys.start([]);
    for (let i = 0; i < TRIAL_LAYERS[0].quota; i += 1) 击杀一只(g);
    expect(seen.length).toBe(1);
    expect(seen[0].layer).toBe(1);
    expect(seen[0].quota).toBe(TRIAL_LAYERS[0].quota);
    expect(sys.getState().layer).toBe(2);
    expect(sys.getState().kills).toBe(0);
  });

  it('五层打完 → finished，成绩 = 层数×100 + 剩余秒/10，并记进 best', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    const done = [];
    window.addEventListener('trial-finished', (e) => done.push(e.detail));
    sys.start([]);
    for (const row of TRIAL_LAYERS) {
      for (let i = 0; i < row.quota; i += 1) 击杀一只(g);
    }
    const st = sys.getState();
    expect(st.state).toBe('finished');
    expect(done.length).toBe(1);
    expect(st.score).toBe(500 + Math.floor(done[0].secondsLeft / 10));
    expect(st.best.score).toBe(st.score);
    expect(st.best.layersCleared).toBe(TRIAL_MAX_LAYERS);
  });

  it('时间到 → failed(timeout)，且不再前进', () => {
    sys = new TrialSystem(fakeGame());
    const fail = [];
    window.addEventListener('trial-failed', (e) => fail.push(e.detail));
    sys.start([]);
    sys.update(TRIAL_LAYERS[0].seconds + 1);
    const st = sys.getState();
    expect(st.state).toBe('failed');
    expect(st.lastReason).toBe('timeout');
    expect(st.secondsLeft).toBe(0);
    expect(fail[0].reason).toBe('timeout');
  });

  it('人死了 → failed(death)', () => {
    sys = new TrialSystem(fakeGame());
    sys.start([]);
    emit('player-death-count', { count: 1 });
    expect(sys.getState().state).toBe('failed');
    expect(sys.getState().lastReason).toBe('death');
  });

  it('自己放弃 → failed(abandon)；没在跑时放弃返回 false', () => {
    sys = new TrialSystem(fakeGame());
    expect(sys.abandon()).toBe(false);
    sys.start([]);
    expect(sys.abandon()).toBe(true);
    expect(sys.getState().lastReason).toBe('abandon');
  });

  it('结束之后 update 不再扣时间（否则失败原因会被下一帧改写成 timeout）', () => {
    sys = new TrialSystem(fakeGame());
    sys.start([]);
    emit('player-death-count', { count: 1 });
    const before = sys.getState().secondsLeft;
    sys.update(5);
    expect(sys.getState().secondsLeft).toBe(before);
    expect(sys.getState().lastReason).toBe('death');
  });

  it('脏 dt（NaN / 负数）被忽略，不会把时限算成 NaN', () => {
    sys = new TrialSystem(fakeGame());
    sys.start([]);
    const before = sys.getState().secondsLeft;
    sys.update(NaN);
    sys.update(-5);
    sys.update(0);
    expect(sys.getState().secondsLeft).toBe(before);
  });

  it('灼烧按秒结算：1.5 秒只打一次，凑满 2 秒打第二次，元素是 fire', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start(['burning-ground']);
    sys.update(0.5);
    expect(g.hits.length).toBe(0);
    sys.update(0.5);
    expect(g.hits.length).toBe(1);
    expect(g.hits[0]).toEqual([2.5, 'fire']);
    sys.update(0.5);
    sys.update(0.5);
    expect(g.hits.length).toBe(2);
  });

  it('没有灼烧词缀时，一帧都不打玩家', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start([]);
    sys.update(3);
    expect(g.hits.length).toBe(0);
  });

  it('getState 如实标出"出生缩放已在生效"（W-F3 切片2 起接进 spawnAt）', () => {
    sys = new TrialSystem(fakeGame());
    sys.start(['swift-shades']);
    const st = sys.getState();
    expect(st.spawnScaleLive).toBe(true);
    expect(st.spawnScale.speed).toBeGreaterThan(0);
    expect(st.active.burnDps).toBe(0);
    expect(st.affixIds).toEqual(['swift-shades']);
  });

  it('再来一局会先放弃上一局（不做嵌套试炼）', () => {
    sys = new TrialSystem(fakeGame());
    sys.start([]);
    const fails = [];
    window.addEventListener('trial-failed', (e) => fails.push(e.detail.reason));
    sys.start([]);
    expect(fails).toEqual(['abandon']);
    expect(sys.getState().state).toBe('running');
  });

  it('dispose 之后监听账清零，事件不再改变状态', () => {
    sys = new TrialSystem(fakeGame());
    sys.start([]);
    const 账 = listenerCount('game/TrialSystem');
    expect(账).toBeGreaterThanOrEqual(2);
    sys.dispose();
    expect(listenerCount('game/TrialSystem')).toBe(0);
    emit('enemy-defeated', { type: 'soldier', origin: TRIAL_ORIGIN });
    expect(sys.getState().kills).toBe(0);
    sys = null;
  });
});

describe('位面试炼 · 自己的刷怪节奏（切片3）', () => {
  it('开层立刻刷一波，每只都带 origin: trial 且 respawn: false', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start([]);
    expect(g.spawned.length).toBe(TRIAL_ARENA.waveSize);
    for (const e of g.spawned) {
      expect(e.origin).toBe(TRIAL_ORIGIN);
      expect(e.respawn, '死了会重生的怪会让配额永远刷不满也永远清不完').toBe(false);
      expect(TRIAL_LAYERS[0].pool, `刷出了池子外的 "${e.type}"`).toContain(e.type);
    }
  });

  it('落点在场地半径上，场地中心是开局时玩家的位置', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    const st = sys.start([]);
    expect(st.arena).toEqual({ x: 10, z: -4, radius: TRIAL_ARENA.radius });
    expect(st.spawnerLive).toBe(true);
    for (const e of g.spawned) {
      expect(Math.hypot(e.x - 10, e.z + 4)).toBeCloseTo(TRIAL_ARENA.radius, 6);
    }
  });

  it('满员不补刷；倒下一只并且过了间隔才补', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start([]);
    expect(g.spawned.length).toBe(3);
    sys.update(2);                              // 满员：即便计时器跨过间隔也不刷
    expect(g.spawned.length).toBe(3);
    g.spawned[0].alive = false;                 // 倒下一只（不派事件，测的是纯刷怪）
    sys.update(0.5);
    expect(g.spawned.length, '间隔没到就补了').toBe(3);
    sys.update(1.0);
    expect(g.spawned.length, '跨过间隔还没补').toBe(4);
  });

  it('本层刷出的总数不超过配额（多刷的过层后就成了没人管的野怪）', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start([]);
    for (let i = 0; i < 10; i += 1) {
      const t = g.spawned.find((e) => e.alive);
      if (t) t.alive = false;
      sys.update(TRIAL_ARENA.waveInterval + 0.1);
    }
    expect(g.spawned.length).toBe(TRIAL_LAYERS[0].quota);
  });

  it('场内击杀算数，世界里顺手杀的不算（口径收窄）', () => {
    sys = new TrialSystem(fakeGame());
    sys.start([]);
    emit('enemy-defeated', { type: 'soldier' });
    emit('enemy-defeated', { type: 'soldier', origin: null });
    emit('enemy-defeated', { type: 'soldier', origin: 'world' });
    expect(sys.getState().kills, '世界里的击杀被记进了试炼').toBe(0);
    emit('enemy-defeated', { type: 'soldier', origin: TRIAL_ORIGIN });
    expect(sys.getState().kills).toBe(1);
  });

  it('拿不到玩家位置 → 不刷怪，spawnerLive 如实为 false', () => {
    const g = { enemyManager: { spawnAt: () => { throw new Error('不该被调用'); }, despawn() {} } };
    sys = new TrialSystem(g);
    const st = sys.start([]);
    expect(st.spawnerLive).toBe(false);
    expect(st.arena).toBe(null);
    sys.update(1);
    expect(st.spawnedThisLayer).toBe(0);
  });

  it('没有刷怪入口 → 不刷、不炸，spawnerLive 为 false', () => {
    const g = fakeGame({ withSpawner: false });
    sys = new TrialSystem(g);
    const st = sys.start([]);
    expect(st.spawnerLive).toBe(false);
    sys.update(3);
    expect(sys.getState().state).toBe('running');
  });

  it('刷怪入口返回 null 时不记进账、不炸', () => {
    const g = fakeGame();
    g.enemyManager.spawnAt = () => null;
    sys = new TrialSystem(g);
    const st = sys.start([]);
    expect(st.spawnedThisLayer).toBe(0);
    expect(st.aliveCount).toBe(0);
  });

  it('**击杀派发栈里不 despawn**：此刻 splice 正在遍历的数组会跳过下一只敌人', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start([]);
    // 打满第 1 层 → 进第 2 层，上一层残余进待清理桶
    for (let i = 0; i < TRIAL_LAYERS[0].quota; i += 1) 击杀一只(g);
    expect(sys.getState().layer).toBe(2);
    expect(g.despawned.length, '在事件栈里就 despawn 了 —— 会跳过一只敌人的那一帧更新').toBe(0);
    sys.update(0.016);
    expect(g.despawned.length, '下一帧没清').toBeGreaterThan(0);
  });

  it('通关 / 超时 / 死亡 / 放弃都清场（不清的话玩家被一堆残怪围着）', () => {
    const 结束路 = [
      ['通关', (g) => { for (const r of TRIAL_LAYERS) for (let i = 0; i < r.quota; i += 1) 击杀一只(g); }],
      ['超时', (_g, s) => s.update(TRIAL_LAYERS[0].seconds + 1)],
      ['死亡', () => emit('player-death-count', { count: 1 })],
      ['放弃', (_g, s) => s.abandon()],
    ];
    for (const [名字, 结束] of 结束路) {
      const g = fakeGame();
      const s = new TrialSystem(g);
      s.start([]);
      expect(g.spawned.length).toBeGreaterThan(0);
      结束(g, s);
      s.update(0.016);
      expect(g.despawned.length, `${名字} 之后没有清场`).toBe(g.spawned.length);
      s.dispose();
    }
  });

  it('dispose 同步清场（它不在 update 栈里，没有遍历冲突）', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start([]);
    expect(g.despawned.length).toBe(0);
    sys.dispose();
    expect(g.despawned.length).toBe(g.spawned.length);
    sys = null;
  });

  it('换层时上一层的残留进清理、本层的账从零开始', () => {
    const g = fakeGame();
    sys = new TrialSystem(g);
    sys.start([]);
    const 第一层刷的 = g.spawned.length;
    for (let i = 0; i < TRIAL_LAYERS[0].quota; i += 1) 击杀一只(g);
    const st = sys.getState();
    expect(st.layer).toBe(2);
    expect(st.spawnedThisLayer, '换层之后本层已刷数没归零').toBe(TRIAL_ARENA.waveSize);
    expect(st.kills).toBe(0);
    sys.update(0.016);
    expect(g.despawned.length, '上一层的东西没清').toBe(第一层刷的);
  });
});

describe('位面试炼 · 接线与文案', () => {
  it('Game 装配了系统与页签，并在"在玩的帧"里喂 dt', () => {
    const s = 源('core/Game.js');
    expect(s).toMatch(/_adopt\('game\/TrialSystem', new TrialSystem\(this\)\)/);
    expect(s).toMatch(/this\.trialTab = new TrialJournalTab\(this\)/);
    expect(s).toMatch(/走舱壁\(this, 'trial', \(\) => this\.trial\?\.update\(dt\)\)/);
  });

  it('注册表有 trial 页签、HUD 有渲染器与计数分支', () => {
    expect(源('ui/JournalTabRegistry.js')).toMatch(/trial: 'journal_tab_trial'/);
    const hud = 源('ui/HUD.js');
    expect(hud).toMatch(/trial: \(game, panel\) => game\.trialTab\.render\(panel\)/);
    expect(hud).toMatch(/k === 'trial'/);
  });

  it('敌人身上真的有 origin 这一格，死亡时随事件带出去', () => {
    const enemy = 源('combat/Enemy.js');
    expect(enemy).toMatch(/this\.origin = config\.origin \?\? null/);
    expect(enemy).toMatch(/origin: this\.origin/);
    // 出生咽喉把这个字段透传给 Enemy（`...rest` 展开），不许在中间丢掉
    const mgr = 源('combat/EnemyManager.js');
    expect(mgr).toMatch(/type, x, z, \.\.\.rest/);
  });

  it('文案双表都登记了 44 个 trial_ 键，且中英都非空', () => {
    const zh = Object.keys(STRINGS_ZH).filter((k) => k.startsWith('trial_') || k === 'journal_tab_trial');
    const en = Object.keys(STRINGS_EN).filter((k) => k.startsWith('trial_') || k === 'journal_tab_trial');
    expect(zh.sort()).toEqual(en.sort());
    expect(zh.length).toBe(44);
    for (const k of zh) {
      expect(STRINGS_ZH[k].length, `中文缺 ${k}`).toBeGreaterThan(0);
      expect(STRINGS_EN[k].length, `英文缺 ${k}`).toBeGreaterThan(0);
    }
  });

  it('雾词缀落到 ZoneFog 上，结束与销毁都归位', () => {
    const g = fakeGame();
    const 推过 = [];
    g.zoneFog = { setDensityScale: (n) => 推过.push(n) };
    const s = new TrialSystem(g);
    s.start(['heavy-fog']);                 // fogMul 1.9
    expect(推过.at(-1), '开层没把雾倍率推下去').toBe(1.9);
    s.abandon();
    expect(推过.at(-1), '放弃之后没有归位').toBe(1);
    s.start(['gloom-veil']);                // fogMul 1.45
    expect(推过.at(-1)).toBe(1.45);
    s.dispose();
    expect(推过.at(-1), 'dispose 之后没有归位').toBe(1);
  });

  it('没有 zoneFog 时不炸（单测 / 无渲染环境）', () => {
    const g = fakeGame();
    const s = new TrialSystem(g);
    expect(() => s.start(['heavy-fog'])).not.toThrow();
    expect(() => s.dispose()).not.toThrow();
  });

  it('HUD 有试炼随身读数：元素、0.2 秒节流、最后 10 秒变红、只读公开快照', () => {
    const hud = 源('ui/HUD.js');
    expect(hud).toMatch(/id="trial-hud"/);
    expect(hud).toMatch(/_renderTrialHud\(\)/);
    expect(hud).toMatch(/this\._trialTick >= 0\.2/);
    expect(hud).toMatch(/is-urgent/);
    // 读数走公开快照，不读系统内部字段（"UI 只读系统交出来的东西"）
    expect(hud).toMatch(/this\.game\.trial\?\.getState\?\.\(\)/);
    expect(hud).not.toMatch(/this\.game\.trial\._/);
    // 倒计时是 m:ss，不是"剩余 N 秒"（40px 宽的地方塞不下三个字）
    expect(hud).toMatch(/Math\.floor\(s \/ 60\)/);
  });

  it('UI 里没有裸中文（文案一律走 t()）', () => {
    const s = 源('ui/TrialJournalTab.js');
    // 去掉注释与模板里的中文标点后再找汉字
    const 去注释 = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(去注释).not.toMatch(/[\u4e00-\u9fa5]/);
  });

  it('状态与结束原因的键名是**显式映射**，不是模板串拼出来的', () => {
    const s = 源('ui/TrialJournalTab.js');
    expect(s).not.toMatch(/t\(`trial_state_\$\{/);
    expect(s).not.toMatch(/t\(`trial_reason_\$\{/);
    expect(s).toMatch(/idle: 'trial_state_idle'/);
    expect(s).toMatch(/timeout: 'trial_reason_timeout'/);
  });
});
