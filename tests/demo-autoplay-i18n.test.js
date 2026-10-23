/**
 * 演出层 toast 双表化（W-D2 切片31）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片27 收了三个演出层遮罩的**静态**文案（badge / status / hint），但演出进行中弹出的
 * toast 与教程提示仍是裸中文：CombatTutorialDirector 的四条演出提示、DemoRunner 的
 * 开始/通关/退出/步骤出错、PlayerAutoPlay 的开始/完成/停止/步骤失败 —— 英文玩家在
 * 每一次连击终结、每一次自动通关起停时读到的都是一屏中文，而没有任何门禁会响。
 *
 * 同片抓出的真 bug（与切片30 的 CG 卡片同族）：演示/自动通关的步骤标签 `step.label`
 * **本身就是 i18n 键**（`demo_step_*` / `zone_name_*` / Boss shortNameKey），但
 * DemoRunner 的状态行与 PlayerAutoPlay 的步骤 toast 都在**裸渲染键名** —— 英文玩家
 * 看到的是 `1/32 · demo_step_anchor`。修法：三处显示出口统一 `t(step.label, step.params)`。
 *
 * ## 口径
 *
 * 1. 钉文案腿：12 个新键的中英原值逐字钉死（附反向控制）。
 * 2. 静态腿：三个文件去注释后零 CJK（模板字符串里的裸文案也只有这条能抓到）。
 * 3. 行为腿：三个组件真跑一遍 —— EventBus 真发事件 / 真 beginWatch / 真 begin ——
 *    中英两语逐字对，英文下零中文；toast 桩与 Dialog.js 同口径（出口过 keyText）。
 * 4. 键数腿：双表对齐且键数只增不减（2269 → 2281）。
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CombatTutorialDirector } from '../src/game/CombatTutorialDirector.js';
import { DemoRunner } from '../src/player/DemoRunner.js';
import { PlayerAutoPlay } from '../src/player/PlayerAutoPlay.js';
import { setLanguage } from '../src/engine/i18n.js';
import { emit, offAll } from '../src/engine/EventBus.js';
import { keyText, keyHint } from '../src/content/keyHints.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const 含汉 = /[\u4e00-\u9fff]/;

const FILES = [
  'src/game/CombatTutorialDirector.js',
  'src/player/DemoRunner.js',
  'src/player/PlayerAutoPlay.js',
];

/** 12 个新键：键 → [中文原值, 英文原值] */
const KEYS = {
  tutorial_toast_finisher: ['连击终结：镜头绕轨锁定 — 此时无法移动/攻击', 'Combo finisher: camera orbit locked — you cannot move or attack'],
  tutorial_toast_riposte: ['致命反击：慢镜头中输入已锁定', 'Riposte: input is locked during the slow motion'],
  tutorial_toast_boss_kill: ['Boss 击破：全屏演出期间输入锁定', 'Boss defeated: input locked during the full-screen cinematic'],
  tutorial_toast_execution: ['处决：短瞬间无法操作', 'Execution: a brief moment without control'],
  demo_toast_start: ['观看模式已开始 — 金色小人将跑完全流程 · {escape} 退出', 'Watch mode started — the golden runner will clear the full game · {escape} to exit'],
  demo_toast_complete: ['小人已跑完全流程通关！按 {questTracker} 可自己继续探索', 'The runner finished the full game! Press {questTracker} to keep exploring yourself'],
  demo_toast_stopped: ['已退出观看模式', 'Watch mode exited'],
  demo_toast_step_error: ['演示步骤出错：${label}', 'Demo step failed: ${label}'],
  autoplay_toast_start: ['自动通关开始 — 你的角色将跑图并遭遇全部 Boss · {escape} 停止', 'Auto-play started — your character will run the map and face every Boss · {escape} to stop'],
  autoplay_toast_complete: ['🎉 自动通关完成！任务已全部推进', '🎉 Auto-play complete! All quests advanced'],
  autoplay_toast_stopped: ['已停止自动通关，可继续手动探索', 'Auto-play stopped — you can keep exploring manually'],
  autoplay_toast_step_failed: ['步骤失败：${label}', 'Step failed: ${label}'],
};

/** EventBus 住在 window 上：装一个最小 window（ending-upgrade-i18n 同款） */
const handlers = new Map();
function 装窗() {
  handlers.clear();
  globalThis.window = {
    addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
    removeEventListener(type, fn) { handlers.get(type)?.delete(fn); },
    dispatchEvent(event) { handlers.get(event.type)?.forEach((fn) => fn(event)); return true; },
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
}

/** toast 桩与 Dialog.js 同口径：出口过一遍 keyText（`{动作}` 占位在这一步展开） */
function 建对话框(账) {
  return { toast: (m) => 账.push(keyText(m)) };
}

/** Promise 链走完一拍（`.catch` 挂在 rejection 上，要等微任务真跑完） */
const 冲刷 = () => new Promise((r) => setTimeout(r, 0));

/** DemoRunner 的最小世界：只补它真会读的那几格 */
function 建演示(账) {
  const scene = new THREE.Scene();
  const world = { getGroundHeight: () => 0 };
  const player = {
    position: new THREE.Vector3(0, 0, 55),
    velocity: new THREE.Vector3(),
    yaw: 0, targetYaw: 0, pitch: 0, targetPitch: 0,
    mesh: { visible: true },
    fpWeaponGroup: null,
    cameraMode: 'third',
    currentCameraPos: new THREE.Vector3(),
  };
  const game = {
    dialog: 建对话框(账),
    player,
    quests: { syncProgress() {} },
    spectatorCamera: { reset() {}, update() {} },
  };
  return new DemoRunner(scene, world, game);
}

/** PlayerAutoPlay 的最小世界 */
function 建自动通关(账) {
  const player = {
    cameraMode: 'third',
    currentCameraPos: { set() {} },
    targetYaw: 0, pitch: 0, targetPitch: 0,
    mesh: { visible: false },
    velocity: { set() {} },
  };
  const game = { dialog: 建对话框(账), player, quests: { syncProgress() {} } };
  return new PlayerAutoPlay(game);
}

describe('演出层 toast 双表化（W-D2 切片31）', () => {
  beforeAll(() => { setLanguage('zh'); });
  afterEach(() => {
    offAll('game/CombatTutorialDirector');
    delete globalThis.window;
    delete globalThis.CustomEvent;
    delete globalThis.document;
    setLanguage('zh');
  });

  it('钉文案腿：12 个新键的中英原值逐字钉死', () => {
    expect(Object.keys(KEYS)).toHaveLength(12);
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
    // 反向控制：过滤器必须能点名没登记的键
    expect(Object.keys(KEYS).filter((k) => !(k in STRINGS_ZH)), '有键没进 zh 表').toEqual([]);
    expect(['demo_toast_start', 'no_such_key_xyz'].filter((k) => !(k in STRINGS_EN))).toEqual(['no_such_key_xyz']);
  });

  it('静态腿：三个文件去注释后零 CJK（模板字符串里的裸文案也只有这条能抓到）', () => {
    for (const f of FILES) {
      const src = 读(f)
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/\/\/[^\n]*/g, '');
      expect(src, `${f} 里去掉注释还有中文`).not.toMatch(含汉);
    }
  });

  it('行为腿·CombatTutorialDirector：四条演出提示中英两语逐字对', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      装窗();
      const toasts = [];
      const tips = [];
      const game = {
        dialog: 建对话框(toasts),
        contextualTutorial: { showTip: (k, m) => tips.push([k, m]) },
      };
      const ctd = new CombatTutorialDirector(game);
      emit('combo-finisher');
      emit('combat-riposte');
      emit('combat-execution', { boss: true });
      emit('combat-execution', {});
      const want = lang === 'zh'
        ? ['连击终结：镜头绕轨锁定 — 此时无法移动/攻击', '致命反击：慢镜头中输入已锁定', 'Boss 击破：全屏演出期间输入锁定', '处决：短瞬间无法操作']
        : ['Combo finisher: camera orbit locked — you cannot move or attack', 'Riposte: input is locked during the slow motion', 'Boss defeated: input locked during the full-screen cinematic', 'Execution: a brief moment without control'];
      expect(toasts, `${lang}: 演出提示文案不对`).toEqual(want);
      // showTip 与 toast 必须同源：两边各收一份坏字，正是"两边一起漏"的形状
      expect(tips.map(([, m]) => m), `${lang}: 教程提示与 toast 不同源`).toEqual(want);
      expect(tips.map(([k]) => k), `${lang}: 教程提示的 id 不对`).toEqual(['combat-finisher', 'combat-riposte', 'combat-bossKill', 'combat-execution']);
      if (lang === 'en') {
        for (const s of [...toasts, ...tips.flat()]) expect(s, '英文演出层夹中文').not.toMatch(含汉);
      }
      ctd.dispose();
    }
    setLanguage('zh');
  });

  it('行为腿·DemoRunner：开始/状态行/通关/退出/步骤出错中英两语逐字对', async () => {
    globalThis.document = makeMarkupDom();
    const 错 = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const lang of ['zh', 'en']) {
        setLanguage(lang);
        const toasts = [];
        const dr = 建演示(toasts);
        dr.beginWatch([{ label: 'demo_step_anchor' }], () => {});
        expect(toasts[0], `${lang}: 开始 toast 不对`).toBe(
          lang === 'zh'
            ? `观看模式已开始 — 金色小人将跑完全流程 · ${keyHint('escape')} 退出`
            : `Watch mode started — the golden runner will clear the full game · ${keyHint('escape')} to exit`,
        );
        // 状态行：步骤标签是 i18n 键，必须过 t()（修前这里裸渲染 demo_step_anchor）
        dr._beginStep();
        expect(dr.statusEl.textContent, `${lang}: 状态行裸渲染键名`).toBe(
          lang === 'zh' ? '1/1 · 枢纽 · 世界之锚' : '1/1 · Hub · World Anchor',
        );
        // 步骤出错臂：label 带插值参数
        dr._steps = [{ label: 'demo_step_dungeons', params: { n: 4 } }];
        dr._stepIndex = 0;
        dr._onStepAction = () => Promise.reject(new Error('boom'));
        dr._startAction();
        await 冲刷();
        expect(toasts[toasts.length - 1], `${lang}: 步骤出错 toast 不对`).toBe(
          lang === 'zh' ? '演示步骤出错：4 座地下城' : 'Demo step failed: 4 Dungeons',
        );
        // 完成臂
        dr.stop(true);
        expect(toasts[toasts.length - 1], `${lang}: 通关 toast 不对`).toBe(
          lang === 'zh'
            ? `小人已跑完全流程通关！按 ${keyHint('questTracker')} 可自己继续探索`
            : `The runner finished the full game! Press ${keyHint('questTracker')} to keep exploring yourself`,
        );
        // 退出臂（换一具实例：stop 之后 active 已落，第二次调用会被早退挡掉）
        const toasts2 = [];
        const dr2 = 建演示(toasts2);
        dr2.beginWatch([{ label: 'demo_step_anchor' }], () => {});
        dr2.stop(false);
        expect(toasts2[toasts2.length - 1], `${lang}: 退出 toast 不对`).toBe(
          lang === 'zh' ? '已退出观看模式' : 'Watch mode exited',
        );
        if (lang === 'en') {
          for (const s of [...toasts, ...toasts2]) expect(s, '英文演出层夹中文').not.toMatch(含汉);
        }      }
    } finally {
      错.mockRestore();
    }
    setLanguage('zh');
  });

  it('行为腿·PlayerAutoPlay：开始/步骤 toast/状态行/失败/停止/完成中英两语逐字对', async () => {
    globalThis.document = makeMarkupDom();
    const 错 = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const lang of ['zh', 'en']) {
        setLanguage(lang);
        const toasts = [];
        const pa = 建自动通关(toasts);
        pa.begin([{ label: 'demo_step_anchor' }], () => {});
        expect(toasts[0], `${lang}: 开始 toast 不对`).toBe(
          lang === 'zh'
            ? `自动通关开始 — 你的角色将跑图并遭遇全部 Boss · ${keyHint('escape')} 停止`
            : `Auto-play started — your character will run the map and face every Boss · ${keyHint('escape')} to stop`,
        );
        // 步骤推进：状态行与 toast 都必须是译过的标签（修前两处都是裸键名）
        pa._advanceStep();
        expect(pa.statusEl.textContent, `${lang}: 状态行裸渲染键名`).toBe(
          lang === 'zh' ? '1/1 · 枢纽 · 世界之锚' : '1/1 · Hub · World Anchor',
        );
        expect(toasts[toasts.length - 1], `${lang}: 步骤 toast 裸渲染键名`).toBe(
          lang === 'zh' ? '枢纽 · 世界之锚' : 'Hub · World Anchor',
        );
        // 步骤失败臂
        pa._steps = [{ label: 'demo_step_kill_soldier' }];
        pa._stepIndex = 0;
        pa._onStepAction = () => Promise.reject(new Error('boom'));
        pa._runAction();
        await 冲刷();
        expect(toasts[toasts.length - 1], `${lang}: 步骤失败 toast 不对`).toBe(
          lang === 'zh' ? '步骤失败：击败影之战士' : 'Step failed: Defeat the Shadow Warriors',
        );
        // 手动停止臂
        pa.stop(false);
        expect(toasts[toasts.length - 1], `${lang}: 停止 toast 不对`).toBe(
          lang === 'zh' ? '已停止自动通关，可继续手动探索' : 'Auto-play stopped — you can keep exploring manually',
        );
        // 完成臂（换一具实例：stop 之后 active 已落）
        const toasts2 = [];
        const pa2 = 建自动通关(toasts2);
        pa2.begin([{ label: 'demo_step_anchor' }], () => {});
        pa2.stop(true);
        expect(toasts2[toasts2.length - 1], `${lang}: 完成 toast 不对`).toBe(
          lang === 'zh' ? '🎉 自动通关完成！任务已全部推进' : '🎉 Auto-play complete! All quests advanced',
        );
        if (lang === 'en') {
          for (const s of [...toasts, ...toasts2]) expect(s, '英文演出层夹中文').not.toMatch(含汉);
        }
      }
    } finally {
      错.mockRestore();
    }
    setLanguage('zh');
  });

  it('键数腿：双表对齐且键数只增不减（2269 → 2281）', () => {
    const zhKeys = Object.keys(STRINGS_ZH);
    const enKeys = Object.keys(STRINGS_EN);
    expect(zhKeys.length).toBe(enKeys.length);
    expect(zhKeys.length).toBeGreaterThanOrEqual(2281);
  });
});
