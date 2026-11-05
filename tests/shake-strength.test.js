/**
 * 震屏强度门禁（W-E3 切片58）—— 打击反馈的**画面那一半**第一次有了开关。
 *
 * ## 这一片补的是什么
 * `vibration` 的注释里写着"打击反馈有两路输出，玩家只想关其中一路"，可当时能关的只有手柄马达：
 * 相机抖动除了 `autoPlayMode`（给演示截图用）根本没有出口。对"看晃动会晕"的玩家，
 * 要关的恰恰是画面这一路 —— 关不掉的那一路才是问题。
 *
 * ## 三档
 * `full` = 1（出厂，逐帧与没有这一格相同）、`reduced` = 0.45、`off` = 0。
 * **只乘相机**：马达吃的是原始强度（关画面抖动不等于关触感），两格各管一路、互不代偿。
 *
 * ## 用例分五层
 * 1. 出厂逐位不变；2. 三档的倍率与累积；3. 换到 off 当场清残留；4. 马达不吃档位；
 * 5. 设置层与面板的接线（脏值回落、写入口只有一处、四条文案键在双表里）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Shake } from '../src/engine/Shake.js';
import { SHAKE } from '../src/content/tuning.js';
import {
  SHAKE_STRENGTHS, SHAKE_STRENGTH_IDS, DEFAULT_SHAKE_STRENGTH,
  normalizeShakeStrength, shakeScaleOf, shakeStrengthOptions,
} from '../src/engine/shakeStrength.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('震屏强度（W-E3 切片58）', () => {
  it('出厂 full = 1：`add()` 的累积与"没有这一格"逐位相同', () => {
    for (const intensity of [0.03, 0.11, 0.35]) {
      const s = new Shake();
      expect(s.scale, '出厂倍率不是 1 —— 默认玩家会察觉到差别').toBe(1);
      s.add(intensity);
      expect(s.strength).toBe(Math.min(1, intensity / SHAKE.ref));
    }
  });

  it('三档各乘各的：reduced 是 0.45 倍，off 一记都不积累', () => {
    const 基准 = new Shake();
    基准.add(0.3);
    const 减弱 = new Shake().setScale(SHAKE_STRENGTHS.reduced);
    减弱.add(0.3);
    expect(减弱.strength).toBeCloseTo(基准.strength * 0.45, 10);
    const 关 = new Shake().setScale(SHAKE_STRENGTHS.off);
    关.add(0.3);
    expect(关.strength).toBe(0);
    关.update(1 / 60);
    expect(关.offset.lengthSq(), '关掉了还在偏移').toBe(0);
  });

  it('换到 off 当场清残留：正在衰减的那一下不许晃完', () => {
    const s = new Shake();
    s.add(0.35);
    s.update(1 / 60);
    expect(s.offset.lengthSq()).toBeGreaterThan(0);
    s.setScale(SHAKE_STRENGTHS.off);
    expect(s.strength, '换档没有清 trauma').toBe(0);
    expect(s.offset.lengthSq(), '换档没有清 offset').toBe(0);
  });

  it('马达吃的是原始强度：关画面不等于关触感', () => {
    for (const 档 of SHAKE_STRENGTH_IDS) {
      const 收到 = [];
      const s = new Shake().setScale(SHAKE_STRENGTHS[档]).setImpactSink((v) => 收到.push(v));
      s.add(0.12);
      expect(收到, `${档} 档把手柄震动也一起吃了`).toEqual([0.12]);
    }
  });

  it('设置层：出厂 full、脏值回落出厂、写入口只有 applyToGame 一处', () => {
    expect(new SettingsManager().get('shakeStrength')).toBe(DEFAULT_SHAKE_STRENGTH);
    expect(DEFAULT_SHAKE_STRENGTH).toBe('full');
    for (const bad of ['', null, undefined, 'FULL', 0.5, 'nope', {}]) {
      expect(normalizeShakeStrength(bad), `${JSON.stringify(bad)} 没回落出厂`).toBe('full');
    }
    expect(shakeScaleOf('reduced')).toBe(0.45);
    expect(shakeScaleOf('nope'), '认不出的档该按出厂算').toBe(1);

    const 源 = 读('src/core/SettingsManager.js');
    expect(源, 'applyToGame 里没有把档位落到 shake.setScale').toContain('game.shake?.setScale(shakeScaleOf(');
    // 写入口只有一处：全仓 `shake.setScale(` 只许出现在 SettingsManager 与 Shake 自己身上
    const 文件 = ['src/core/Game.js', 'src/ui/SettingsPanel.js', 'src/player/PlayerController.js',
      'src/cinematic/CombatCameraDirector.js'];
    for (const f of 文件) {
      expect(读(f).includes('.setScale(shakeScaleOf('), `${f} 也去改档位了 —— 写入口应当只有一处`).toBe(false);
    }
  });

  it('面板与文案：选项从名册现推，四条键在双表里都有且各不相同', () => {
    const 选项 = shakeStrengthOptions();
    expect(选项).toEqual([...SHAKE_STRENGTH_IDS]);
    // 文案键由面板在现场拼（t(`settings_shake_${id}`)），这里按同一条规则展开
    const 文案 = 选项.map((id) => `settings_shake_${id}`);
    expect(new Set(文案).size).toBe(文案.length);
    for (const key of ['settings_shake', ...文案]) {
      expect(STRINGS_ZH[key], `${key} 缺中文`).toBeTruthy();
      expect(STRINGS_EN[key], `${key} 缺英文`).toBeTruthy();
    }
    expect(STRINGS_ZH.settings_shake_off).not.toBe(STRINGS_ZH.settings_shake_full);
    expect(读('index.html'), '设置面板里没有震屏这一行').toContain('id="set-shake"');
    expect(读('src/ui/SettingsPanel.js'), '面板没有从名册取选项').toContain('shakeStrengthOptions()');
  });
});
