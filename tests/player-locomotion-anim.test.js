/**
 * 玩家动画的两笔账（B135）—— 谁推进 mixer / 谁认领移动档。
 *
 * ## 这一片在收什么
 *
 * 2026-10-27 的提交 `59fca78` 把 mixer 的推进从 `CharacterModel.update(dt)` 挪到了
 * `PlayerAnimationAdapter.update(dt)`，落地时 **13 道门禁红了**
 * （`player-weapon-hand-grip` 6 + `player-skeleton-moves` 7）。根因不是数值漂移：
 *
 * - `CharacterModel` 是 mixer 的**所有者**（`load()` 里 `new THREE.AnimationMixer(model)`），
 *   `actions` / `currentAction` / `actionLock` 三本账也都在它那儿；
 * - 而"只调 `cm.update(dt)`"是**出货路径**（`src/player/WeaponGrip.js` 头注与四道门禁
 *   都按它写），推进一挪走，那条路径就不再推帧 ⇒ 骨头不动 ⇒
 *   "剑尖行程是手的几倍"那类读数塌掉。
 *
 * 于是这一片把两条口径定死：
 * ① **mixer 只有一个推进口**，且是所有者自己（`CharacterModel.update(dt)`）；
 * ② **移动档的愿望不会被丢掉**：招式锁住身体时播不了，但"玩家正在走"要记着，
 *    招式一结束就按它认领 —— 改前愿望没有载体，玩家会一路滑行（脚下在动、身体是站姿）。
 *
 * ## 为什么用假 mixer 而不是真 GLB
 *
 * 这一片要量的是**状态机与所有权**，不是骨骼运动。真 GLB 要素材、要网络、要一堆
 * 与本片无关的读数。假 mixer 走的是真 `CharacterModel` 的方法（`setMovementState` /
 * `playLocomotion` / `update`），只有"动画动作"那一层是替身 —— 这正是本片要量的边界。
 *
 * ## 每条结构腿都配**反向控制**
 *
 * "源码里没有 `mixer.update`"这类断言，写错方向就会恒真。本文件给每条都配了一条
 * **会红的对照臂**：把判据反过来念（"适配器不许推进 mixer"）时它必须红 ——
 * 否则那条判据就是摆设。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { CharacterModel } from '../src/player/CharacterModel.js';
import { PlayerAnimationAdapter } from '../src/player/animation/PlayerAnimationAdapter.js';

const SRC = join(process.cwd(), 'src');
const 读 = (...相对) => readFileSync(join(SRC, ...相对), 'utf8');

/**
 * 去注释 —— 与 `tests/camera-finite-guard.test.js` 同一把尺。
 *
 * 注释里引用的旧写法不是写者：`src/player/WeaponGrip.js` 的头注里就写着
 * `mixer.update(0)`（那是**探针口径**的说明，不是出货代码在推帧）。
 * 下面每条用它的结构腿都配一条**不剥注释**的反向见证 ——
 * 剥掉的必须正好是那一行注释，不是一个写者。
 */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(\/\/|[*/]).*$/gm, '');

/** 假动作：只实现 CharacterModel 真用到的那几个口子 */
function fakeAction(clipName, loop = 'loopRepeat') {
  const a = {
    clipName,
    loop,
    timeScale: 1,
    fades: [],
    played: 0,
    reset() { a.played = 0; return a; },
    setLoop(l) { a.loop = l; return a; },
    setEffectiveTimeScale(ts) { a.timeScale = ts; return a; },
    fadeIn(fade) { a.fades.push(['in', fade]); return a; },
    fadeOut(fade) { a.fades.push(['out', fade]); return a; },
    play() { a.played += 1; return a; },
    getClip() { return { name: clipName }; },
  };
  return a;
}

/** three 的 LoopOnce —— 招式片段是"播一次就停"的那种循环模式（值取自 three，不手抄） */
const LOOP_ONCE = THREE.LoopOnce;

/**
 * 一个**真** `CharacterModel`，只把 mixer / actions / catalog 换成替身。
 * 其余（`combatState` / `actionLock` / `_playLoop` / `playLocomotion` / `update`）
 * 全是生产代码 —— 这一片要量的正是它们的接线。
 */
function makeModel({ catalog } = {}) {
  const cm = new CharacterModel();
  cm.mixer = { update: () => {} };
  cm.catalog = catalog ?? { idle: 'Idle', walk: 'Walk', run: 'Run' };
  cm.actions = {
    Idle: fakeAction('Idle'),
    Walk: fakeAction('Walk'),
    Run: fakeAction('Run'),
    '__sk:attack1': fakeAction('__sk:attack1', LOOP_ONCE),
  };
  cm.currentAction = cm.actions.Idle;
  return cm;
}

/** 现在在播哪一段（clip 名） */
const 在播 = (cm) => cm.currentAction?.getClip?.()?.name ?? null;

/** 起一招并把身体占住（招式片段 = LoopOnce） */
function 起招(cm, 招式 = '__sk:attack1', 锁 = 0.42) {
  cm.combatState = 'combo1';
  cm.actionLock = 锁;
  cm.currentAction = cm.actions[招式];
}

describe('① mixer 只有一个推进口，且是所有者自己', () => {
  it('`src/player/**` 里 `mixer.update` 只出现一次，且落在 CharacterModel', () => {
    const 命中 = [];
    const 走 = (目录) => {
      for (const 名 of readdirSync(目录, { withFileTypes: true })) {
        const 全 = join(目录, 名.name);
        if (名.isDirectory()) { 走(全); continue; }
        if (!名.name.endsWith('.js')) continue;
        const 源 = readFileSync(全, 'utf8');
        const 次数 = (codeOnly(源).match(/mixer\??\.\s*update\s*\(/g) ?? []).length;
        if (次数) 命中.push({ 文件: 全.slice(SRC.length + 1).replace(/\\/g, '/'), 次数 });
      }
    };
    走(join(SRC, 'player'));
    expect(命中.map((h) => h.文件), 'mixer 的推进口不止一处 —— 两个口就是两份节奏').toEqual(['player/CharacterModel.js']);
    expect(命中[0].次数, 'CharacterModel 里 mixer.update 出现多次').toBe(1);
  });

  it('反向见证：不剥注释的话，命中的正是 WeaponGrip 头注里那行探针口径', () => {
    // 剥掉的必须正好是**一行注释**，不是一个写者 —— 这条把"过滤器"钉住，
    // 免得它日后变成一个藏东西的地方（`camera-finite-guard` 那条腿的同一形状）。
    const 命中 = [];
    const 走 = (目录) => {
      for (const 名 of readdirSync(目录, { withFileTypes: true })) {
        const 全 = join(目录, 名.name);
        if (名.isDirectory()) { 走(全); continue; }
        if (!名.name.endsWith('.js')) continue;
        const 源 = readFileSync(全, 'utf8');
        if ((源.match(/mixer\??\.\s*update\s*\(/g) ?? []).length) {
          命中.push(全.slice(SRC.length + 1).replace(/\\/g, '/'));
        }
      }
    };
    走(join(SRC, 'player'));
    expect(命中.sort(), '不剥注释时多命中的那一处不是"注释里引用的旧写法"').toEqual([
      'player/CharacterModel.js',
      'player/WeaponGrip.js',
    ]);
  });

  it('适配器**不许**推进 mixer（反向控制：把判据反过来念，它必须红）', () => {
    const 源 = codeOnly(读('player', 'animation', 'PlayerAnimationAdapter.js'));
    expect(源, '适配器又去推 mixer 了 —— 所有者与推进者必须同一家').not.toMatch(/mixer\??\.\s*update\s*\(/);
    expect(读('player', 'CharacterModel.js'), 'CharacterModel 里没有 mixer 推进口').toMatch(/mixer\?\.update\s*\(\s*dt\s*\)/);
  });

  it('出货路径 `cm.update(dt)` 真的推帧（假 mixer 记一次）', () => {
    const cm = makeModel();
    let 推了 = 0;
    cm.mixer = { update: () => { 推了 += 1; } };
    cm.update(1 / 60);
    expect(推了, 'cm.update(dt) 没有推进 mixer —— 那条出货路径就断了').toBe(1);
  });
});

describe('② 移动档的愿望不会被丢掉（B135 的正题）', () => {
  it('招式锁住身体时播不了，但愿望要记着', () => {
    const cm = makeModel();
    cm.actionLock = 0.3;              // 身体被招式占着
    cm.combatState = 'combo1';
    cm.setMovementState(true, false); // 玩家在走
    expect(cm.moving, '愿望（正在走）被丢了').toBe(true);
    expect(cm.sprinting).toBe(false);
    expect(在播(cm), '身体被占着时不该抢播放').toBe('Idle');
  });

  it('招式结束后按愿望认领移动档 —— 不是硬回 Idle（改前的滑行）', () => {
    const cm = makeModel();
    cm.setMovementState(true, false);         // 正在走 ⇒ 走那一档
    expect(在播(cm)).toBe('Walk');
    起招(cm);                                 // 起招：身体被占住
    cm.actionLock = 0;                         // 招式打完
    cm.update(1 / 60);
    expect(cm.combatState, '招式结束没有回到可播的状态').not.toBe('combo1');
    expect(在播(cm), '招式结束后硬回 Idle ⇒ 玩家走着走着滑成站姿').toBe('Walk');
  });

  it('站着不动时招式结束回 Idle（愿望是 idle 就回 idle）', () => {
    const cm = makeModel();
    cm.setMovementState(false, false);
    起招(cm);
    cm.actionLock = 0;
    cm.update(1 / 60);
    expect(在播(cm)).toBe('Idle');
  });

  it('疾跑那一档是 run（愿望字段说了算）', () => {
    const cm = makeModel();
    cm.setMovementState(true, true);
    expect(在播(cm)).toBe('Run');
    expect(cm.locomotionKind()).toBe('run');
    cm.setMovementState(true, false);
    expect(在播(cm)).toBe('Walk');
    expect(cm.locomotionKind()).toBe('walk');
    cm.setMovementState(false, false);
    expect(在播(cm)).toBe('Idle');
    expect(cm.locomotionKind()).toBe('idle');
  });

  it('已经在播那一档时不重播（`_playLoop` 会 reset —— 重播 Idle 是可见的顿挫）', () => {
    const cm = makeModel();
    cm.setMovementState(false, false);
    const 播过 = cm.actions.Idle.played;
    cm.setMovementState(false, false);  // 再来一次同样的愿望
    expect(cm.actions.Idle.played, '同一档被重播了（reset ⇒ 从第 0 帧重来）').toBe(播过);
  });

  it('招式期间身体被占着时，移动档不许抢播放', () => {
    const cm = makeModel();
    起招(cm, '__sk:attack1', 0.5);
    cm.setMovementState(true, false);
    expect(在播(cm), '招式期间移动档抢了播放').not.toBe('Walk');
  });
});

describe('③ 适配器不写别人家的内部字段', () => {
  it('适配器不许写 `cm._*` 私字段（`_pendingAction` 那一族）', () => {
    const 源 = codeOnly(读('player', 'animation', 'PlayerAnimationAdapter.js'));
    expect(源, '适配器又在写 CharacterModel 的私字段').not.toMatch(/cm\._\w+\s*=/);
  });

  it('`_pendingAction` 全仓归零（它从来没人读过）', () => {
    const 源 = codeOnly(读('player', 'animation', 'PlayerAnimationAdapter.js'));
    expect(源).not.toMatch(/_pendingAction/);
  });

  it('适配器只走公开接口：它调的是 `playLocomotion`（不是 `actions` / `currentAction`）', () => {
    const 源 = codeOnly(读('player', 'animation', 'PlayerAnimationAdapter.js'));
    expect(源, '适配器没有走公开接口').toMatch(/playLocomotion\?\.\(\)/);
    expect(源, '适配器还在读 CharacterModel 的内部账').not.toMatch(/cm\.(actions|currentAction)\b/);
  });

  it('适配器的 sync 真的会让移动档被认领（不是空转）', () => {
    const cm = makeModel();
    const adapter = new PlayerAnimationAdapter(cm);
    cm.setMovementState(true, false);
    起招(cm);
    cm.actionLock = 0;               // 身体空出来了，但没人认领移动档
    cm.combatState = 'idle';
    adapter.syncFromEntity();
    expect(在播(cm), '适配器的 sync 依旧是空转').toBe('Walk');
  });

  it('反向控制：适配器什么都不做 ⇒ 移动档不会被认领（证明上一条不是恒真）', () => {
    const cm = makeModel();
    cm.setMovementState(true, false);
    起招(cm);
    cm.actionLock = 0;
    cm.combatState = 'idle';
    // 不调适配器：没人认领 ⇒ 停在招式那一段
    expect(在播(cm)).toBe('__sk:attack1');
  });
});

describe('④ 名册与参数只有一份', () => {
  it('移动档三档的倍速与淡入只有一个出处（`LOCOMOTION_CLIPS`）', () => {
    const 源 = codeOnly(读('player', 'CharacterModel.js'));
    // 三档的倍速各只许出现一次。
    // **小数点必须转义** —— 不转义的话 `\b1.08\b` 里的 `.` 是"任意字符"，
    // 于是"1?08"这种别的字面量也会被算进去（第一版就带着这个洞）。
    for (const 倍速 of ['1.28', '1.08']) {
      const 次数 = (源.match(new RegExp(`\\b${倍速.replace('.', '\\.')}\\b`, 'g')) ?? []).length;
      expect(次数, `倍速 ${倍速} 在 CharacterModel 里出现了 ${次数} 次 —— 有第二份表`).toBe(1);
    }
    // "招式结束回 Idle"那条路不再自己写一份 Idle 参数
    expect(源, '收招那条路又自己写了一遍 Idle').not.toMatch(/const idle = this\.catalog\.idle/);
  });

  it('`locomotionKind()` 是愿望的唯一出口（移动档没有第二个判据）', () => {
    const cm = makeModel();
    cm.setMovementState(true, true);
    expect(cm.locomotionKind()).toBe('run');
    cm.setMovementState(true, false);
    expect(cm.locomotionKind()).toBe('walk');
    cm.setMovementState(false, false);
    expect(cm.locomotionKind()).toBe('idle');
  });
});
