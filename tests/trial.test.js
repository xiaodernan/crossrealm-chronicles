/**
 * 位面试炼（W-F3 切片1）。
 *
 * 这一片真正要钉住的是**"词缀第一次改规则"这件事是真的**：
 * ① 内容层八条词缀的 id 与 `content/seasons.js` 逐字对齐（不靠人肉复制）；
 * ② 折叠规则把加项相加、乘项相乘，未知 id 当场抛（悄悄忽略 = 玩家成绩与规则对不上）；
 * ③ 运行时按世界时走秒、超时/死亡/放弃三条结束路互斥、五层打完才算通关；
 * ④ 灼烧走玩家受伤的既有入口，且**按秒结算**（每帧打 0.04 点会把事件刷爆）；
 * ⑤ 接线三处（Game / 注册表 / HUD）静态钉住 —— 仓库有过"加了系统却打不开"的旧病。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRIAL_MAX_LAYERS, TRIAL_LAYERS, TRIAL_AFFIX_EFFECTS, TRIAL_BASE_EFFECT,
  trialLayerOf, trialModifiers, layerSeconds, layerQuota, layerScale, trialScore,
} from '../src/content/trial.js';
import { SEASON_MODIFIERS } from '../src/content/seasons.js';
import { ENEMY_ROSTER } from '../src/content/enemies.js';
import { TrialSystem } from '../src/game/TrialSystem.js';
import { emit, listenerCount } from '../src/engine/EventBus.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 源 = (rel) => readFileSync(join(process.cwd(), 'src', ...rel.split('/')), 'utf8');

/** 造一个只记伤害的假 game：试炼只需要 `player.combat.takeDamage`（Game 上没有 `combat` 这一格） */
function fakeGame() {
  const hits = [];
  return { hits, player: { combat: { takeDamage: (n, el) => hits.push([n, el]) } } };
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
    sys = new TrialSystem(fakeGame());
    const seen = [];
    window.addEventListener('trial-layer-cleared', (e) => seen.push(e.detail));
    sys.start([]);
    for (let i = 0; i < TRIAL_LAYERS[0].quota; i += 1) emit('enemy-defeated', { type: 'soldier' });
    expect(seen.length).toBe(1);
    expect(seen[0].layer).toBe(1);
    expect(seen[0].quota).toBe(TRIAL_LAYERS[0].quota);
    expect(sys.getState().layer).toBe(2);
    expect(sys.getState().kills).toBe(0);
  });

  it('五层打完 → finished，成绩 = 层数×100 + 剩余秒/10，并记进 best', () => {
    sys = new TrialSystem(fakeGame());
    const done = [];
    window.addEventListener('trial-finished', (e) => done.push(e.detail));
    sys.start([]);
    for (const row of TRIAL_LAYERS) {
      for (let i = 0; i < row.quota; i += 1) emit('enemy-defeated', { type: 'soldier' });
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
    emit('enemy-defeated', { type: 'soldier' });
    expect(sys.getState().kills).toBe(0);
    sys = null;
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

  it('文案双表都登记了 33 个 trial_ 键，且中英都非空', () => {
    const zh = Object.keys(STRINGS_ZH).filter((k) => k.startsWith('trial_') || k === 'journal_tab_trial');
    const en = Object.keys(STRINGS_EN).filter((k) => k.startsWith('trial_') || k === 'journal_tab_trial');
    expect(zh.sort()).toEqual(en.sort());
    expect(zh.length).toBe(33);
    for (const k of zh) {
      expect(STRINGS_ZH[k].length, `中文缺 ${k}`).toBeGreaterThan(0);
      expect(STRINGS_EN[k].length, `英文缺 ${k}`).toBeGreaterThan(0);
    }
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
