/**
 * 闪光强度门禁（W-D6 切片68）—— 光敏玩家的"别闪我"出口。
 *
 * ## 这一片补的是什么
 * 处决 / Boss 击杀的整屏白闪、Boss 转阶段的径向闪光、混沌边境的闪电点光、
 * 两位面致敬层的交互闪，此前各自写死。玩家只能一起吞下；对光敏性癫痫或对强闪
 * 不适的玩家，这不是"效果重不重"，而是能不能玩。
 *
 * ## 三档
 * `full` = 1（出厂，逐像素不变）、`reduced` = 0.35、`off` = 0。
 * **只乘玩家看得见的闪光**：Triad 的常驻 0.08 氛围层留着，敌人受击的自发光小闪不碰。
 *
 * ## 用例分五层
 * 1. 名册与出厂；2. 脏值回落；3. 模块当前档与三条算式；4. 五个消费者的接线；
 * 5. 设置层 / 面板 / 双表 / 写入口唯一。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLASH_STRENGTHS, FLASH_STRENGTH_IDS, DEFAULT_FLASH_STRENGTH,
  normalizeFlashStrength, flashScaleOf, flashStrengthOptions,
  setFlashStrength, getFlashStrength, flashScale, resetFlashStrength,
  screenFlashOpacity, triadFlashOpacity, wave4FlashOpacity,
} from '../src/engine/flashStrength.js';
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
  resetFlashStrength();
});
afterEach(() => { globalThis.localStorage = real; resetFlashStrength(); });

describe('闪光强度（W-D6 切片68）', () => {
  it('名册与出厂：全开 / 减弱 / 关闭，出厂 full = 1 逐像素不变', () => {
    expect([...FLASH_STRENGTH_IDS]).toEqual(['full', 'reduced', 'off']);
    expect(FLASH_STRENGTHS).toEqual({ full: 1, reduced: 0.35, off: 0 });
    expect(DEFAULT_FLASH_STRENGTH).toBe('full');
    expect(flashScaleOf('full')).toBe(1);
    expect(flashScaleOf('reduced')).toBe(0.35);
    expect(flashScaleOf('off')).toBe(0);
    expect(Object.isFrozen(FLASH_STRENGTHS)).toBe(true);
  });

  it('脏值回落出厂、不抛；认不出的档按 1 算', () => {
    for (const bad of [null, undefined, '', 'FULL', 1, 0.35, {}, [], true]) {
      expect(normalizeFlashStrength(bad), `${JSON.stringify(bad)} 没回落出厂`).toBe('full');
      expect(flashScaleOf(bad), `${JSON.stringify(bad)} 没按出厂倍率算`).toBe(1);
    }
    expect(flashStrengthOptions()).toEqual([...FLASH_STRENGTH_IDS]);
  });

  it('模块当前档：set 返回落地值、脏值回落；三条算式出厂逐位相同', () => {
    expect(getFlashStrength()).toBe('full');
    expect(flashScale()).toBe(1);
    expect(setFlashStrength('reduced')).toBe('reduced');
    expect(flashScale()).toBe(0.35);
    expect(setFlashStrength('nope')).toBe('full');
    expect(flashScale()).toBe(1);

    // 整屏闪光：0.55 / 0.38 两档基准分别乘倍率
    expect(screenFlashOpacity(0.55)).toBeCloseTo(0.55, 12);
    setFlashStrength('reduced');
    expect(screenFlashOpacity(0.55)).toBeCloseTo(0.1925, 12);
    setFlashStrength('off');
    expect(screenFlashOpacity(0.55)).toBe(0);

    // Triad：出厂 0.14（常驻 0.08 + 闪光 0.06），off 只剩常驻氛围
    resetFlashStrength();
    expect(triadFlashOpacity()).toBeCloseTo(0.14, 12);
    setFlashStrength('off');
    expect(triadFlashOpacity()).toBeCloseTo(0.08, 12);

    // Wave4：pulse=0 时出厂 0.1，off 为 0
    resetFlashStrength();
    expect(wave4FlashOpacity(0)).toBeCloseTo(0.1, 12);
    setFlashStrength('off');
    expect(wave4FlashOpacity(0)).toBe(0);
  });

  it('五个消费者都走同一把倍率，敌人受击小闪不接这一格', () => {
    expect(读('src/cinematic/CombatCameraDirector.js')).toContain('String(screenFlashOpacity(kind === \'bossKill\' ? 0.55 : 0.38))');
    expect(读('src/ui/BossPhaseDirector.js')).toContain('String(screenFlashOpacity(0.6))');
    expect(读('src/effects/ChaosLightning.js')).toContain('2.8 * flashScale()');
    expect(读('src/effects/PopCultureTriadVisualPass.js')).toContain('triadFlashOpacity()');
    expect(读('src/effects/PopCultureWave4VisualPass.js')).toContain('wave4FlashOpacity(this.pulse)');
    // 负面：命中反馈的小闪不该被这一格吞掉（那是打击感的一部分）
    expect(读('src/combat/Enemy.js'), '敌人受击小闪也接了闪光强度 —— 这一格只管整屏闪光').not.toContain('flashStrength');
  });

  it('设置层与面板：DEFAULTS / applyToGame / 选项现推 / 四条键在双表', () => {
    expect(new SettingsManager().get('flashStrength')).toBe('full');

    const s = new SettingsManager();
    s.set('flashStrength', 'reduced');
    s.applyToGame({});
    expect(getFlashStrength(), 'applyToGame 没有把档位落到模块').toBe('reduced');
    s.set('flashStrength', 'nope');
    s.applyToGame({});
    expect(getFlashStrength(), '存储里的脏档没有回落').toBe('full');

    // 写入口唯一：全仓 `setFlashStrength(` 只许出现在 SettingsManager 与模块定义自身
    const 写点 = [];
    for (const f of walk(join(process.cwd(), 'src')).filter((p) => p.endsWith('.js'))) {
      const 相对 = f.slice(process.cwd().length + 1).replace(/\\/g, '/');
      读(相对).split('\n').forEach((行, i) => {
        // `resetFlashStrength(` 里也含这一串：按词边界认，免得把收尾函数算成写入口
        if (/(^|[^\w])setFlashStrength\(/.test(行)) 写点.push(`${相对}:${i + 1}`);
      });
    }
    expect(写点.map((x) => x.split(':')[0]).sort(), '面板绕过了 applyToGame 直接改档')
      .toEqual(['src/core/SettingsManager.js', 'src/engine/flashStrength.js']);

    const 壳 = 读('index.html');
    expect(壳, '设置面板没有闪光强度这一行').toContain('id="set-flash"');
    expect(壳).toContain('data-i18n="settings_flash"');
    const 面板 = 读('src/ui/SettingsPanel.js');
    expect(面板, '面板没有从名册取选项').toContain('flashStrengthOptions()');
    expect(面板, '文案键没有在 t() 现场拼').toContain('t(`settings_flash_${id}`)');
    expect(面板, '刷新时没有回显清洗过的值').toContain("set('set-flash', normalizeFlashStrength(d.flashStrength))");

    const 文案 = FLASH_STRENGTH_IDS.map((id) => `settings_flash_${id}`);
    expect(new Set(文案).size).toBe(文案.length);
    for (const [名, 表] of [['中文', STRINGS_ZH], ['英文', STRINGS_EN]]) {
      expect(表.settings_flash, `${名}表缺 settings_flash`).toBeTruthy();
      for (const key of 文案) expect(表[key], `${名}表缺 ${key}`).toBeTruthy();
    }
    expect(STRINGS_ZH.settings_flash_full).not.toBe(STRINGS_ZH.settings_flash_reduced);
    expect(STRINGS_EN.settings_flash_full).not.toBe(STRINGS_EN.settings_flash_off);
  });
});
