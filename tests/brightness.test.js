/**
 * 画面亮度门禁（W-E3 切片61）—— 设置面板第一次能改"游戏里多亮"。
 *
 * ## 改前
 * 曝光由 `core/Game.js` 的昼夜算式独占：`1.08 + daylight * 0.38` 每帧覆写，
 * 玩家没有任何入口。显示器亮度是系统级的，而"暗环境里看不清暗部"需要的是游戏内曝光。
 *
 * ## 这一格的形状
 * 存的是**倍率**（0.7 ~ 1.4，出厂 1），乘在昼夜基线上 —— 存绝对值会把昼夜曲线整条抹平
 * （夜里和正午一样亮），那不是调亮度，是改光照。写入口只有 `Game.setExposureScale` 一处，
 * 面板 / 存档 / 开机三条路都汇到 `SettingsManager.applyToGame`。
 *
 * ## 用例分四层
 * 1. 名册与出厂；2. 脏值清洗（夹回量程、吸到位、回出厂）；3. 落地（倍率乘在基线上、
 * 写入口唯一）；4. 壳页与面板的接线（量程从名册灌、回显百分比、两条文案键都在）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRIGHTNESS, DEFAULT_BRIGHTNESS, normalizeBrightness, brightnessPercent,
} from '../src/engine/brightness.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let real;
beforeEach(() => {
  const store = new Map();
  real = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
});
afterEach(() => { globalThis.localStorage = real; });

describe('画面亮度（W-E3 切片61）', () => {
  it('名册与出厂：0.7 ~ 1.4、步长 0.05、出厂 1 = 逐帧不变', () => {
    expect(BRIGHTNESS).toEqual({ min: 0.7, max: 1.4, step: 0.05, default: 1 });
    expect(DEFAULT_BRIGHTNESS).toBe(1);
    expect(new SettingsManager().get('brightness')).toBe(1);
    expect(brightnessPercent(1)).toBe('100%');
    expect(brightnessPercent(0.7)).toBe('70%');
    expect(brightnessPercent(1.4)).toBe('140%');
  });

  it('脏值清洗：夹回量程、吸到步长、认不出的回出厂', () => {
    for (const bad of [null, undefined, '', '   ', NaN, Infinity, {}, [], true]) {
      expect(normalizeBrightness(bad), `${JSON.stringify(bad)} 没回出厂`).toBe(1);
    }
    expect(normalizeBrightness(0.1)).toBe(0.7);
    expect(normalizeBrightness(9)).toBe(1.4);
    expect(normalizeBrightness('1.2')).toBe(1.2);
    // 1.23 不在 0.05 的格点上：吸到最近的 1.25，而不是原样存进去
    expect(normalizeBrightness(1.23)).toBe(1.25);
    // 浮点尾巴不许漏出来（0.7 存成 0.7000000000000001 会让回显与下一次比较都不稳）
    expect(normalizeBrightness(0.7)).toBe(0.7);
    expect(normalizeBrightness(1.15)).toBe(1.15);
  });

  it('落地：倍率乘在昼夜基线上，写入口只有 Game.setExposureScale 一处', () => {
    const 收到 = [];
    const 假游戏 = { setExposureScale: (v) => 收到.push(v) };
    const s = new SettingsManager();
    s.set('brightness', 1.25);
    s.applyToGame(假游戏);
    expect(收到).toEqual([1.25]);
    // 脏值在落地前也夹过一次（存储是玩家可写的）
    s.set('brightness', 99);
    s.applyToGame(假游戏);
    expect(收到).toEqual([1.25, 1.4]);

    const 源 = 读('src/core/Game.js');
    expect(源, 'setExposureScale 没把倍率乘回昼夜基线').toContain('(1.08 + daylight * 0.38) * this.exposureScale');
    expect(源, '每帧的昼夜基线也没乘倍率').toMatch(/this\.daylight = daylight;\n\s*this\.renderer\.toneMappingExposure = \(1\.08 \+ daylight \* 0\.38\) \* this\.exposureScale;/);

    // 全仓 `toneMappingExposure =` 只许出现在 Game.js（两处：方法里一次 + 每帧一次）
    const 写点 = [];
    for (const f of walk(join(process.cwd(), 'src')).filter((p) => p.endsWith('.js'))) {
      const 相对 = f.slice(process.cwd().length + 1).replace(/\\/g, '/');
      读(相对).split('\n').forEach((行, i) => {
        if (行.includes('.toneMappingExposure =')) 写点.push(`${相对}:${i + 1}`);
      });
    }
    expect(写点.map((x) => x.split(':')[0])).toEqual(['src/core/Game.js', 'src/core/Game.js']);
  });

  it('壳页与面板：量程从名册灌进来、百分比回显、文案键在双表里', () => {
    const 壳 = 读('index.html');
    expect(壳, '设置面板没有亮度这一行').toContain('id="set-brightness"');
    expect(壳, '亮度没有百分比回显').toContain('id="set-brightness-value"');
    expect(壳).toContain('data-i18n="settings_brightness"');

    const 面板 = 读('src/ui/SettingsPanel.js');
    expect(面板, '面板没有从名册灌量程').toContain('bri.min = String(BRIGHTNESS.min)');
    expect(面板).toContain('bri.max = String(BRIGHTNESS.max)');
    expect(面板).toContain('bri.step = String(BRIGHTNESS.step)');
    expect(面板, '拖滑杆没有回显百分比').toContain('brightnessPercent(s.get(\'brightness\'))');
    expect(面板, '刷新时没有回显清洗过的值').toContain("set('set-brightness', normalizeBrightness(d.brightness))");

    for (const [名, 表] of [['中文', STRINGS_ZH], ['英文', STRINGS_EN]]) {
      expect(表.settings_brightness, `${名}表缺 settings_brightness`).toBeTruthy();
    }
  });
});
