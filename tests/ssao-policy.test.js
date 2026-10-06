/**
 * SSAO 门禁（W-C4 切片5 / B98 复查修复）—— 与 aa-policy.test.js 同一套口径。
 *
 * ## 这份门禁钉的是什么
 * 初版实现对着想当然的 API 写了三处失实（B98）：`pass.output = 1`（枚举 1 是
 * OUTPUT.Diffuse —— 纯场景拷贝，AO 根本不进画面，画面零变化还白付三趟渲染的钱）、
 * 构造第 5 参传 radius/bias/intensity/samples（GTAOPass 只认 depthTexture/normalTexture，
 * 其余静默丢弃）、更新写 `uniforms.bias` / `uniforms.intensity`（GTAOShader 里不存在
 * 这两个 uniform，切档当场 TypeError）。外加两条链上问题：SSAO 插在 bloom 之后
 * （AO 调制漫反射亮度，bloom 应基于 AO 后亮度）、出厂 medium 档必超 B94 的
 * draw call 验收线（GTAO 每帧多一趟全场景法线渲染）。
 *
 * - AO 进画面的开关 = `GTAOPass.OUTPUT.Default`（先拷场景色再乘法混合 AO）；
 * - 半径/采样走官方 `pass.updateGtaoMaterial()`（samples 落 defines + needsUpdate）；
 * - 强度真身 = `pass.blendIntensity`；
 * - 挂/摘/换档收口在 `setSsaoQuality` 一个出口（摘除含 dispose —— B76 泄漏族教训）；
 * - 出厂 off（B94 账），画质预设的 medium / high 档主动推它开是玩家的选择。
 *
 * 行为钉子全走真 GTAOPass + 真 EffectComposer + 假 renderer —— 不需要 WebGL。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { PerspectiveCamera, Scene } from 'three';
import {
  SSAO_QUALITY_PRESETS, SSAO_QUALITY_NAMES, DEFAULT_SSAO_QUALITY,
  normalizeSsaoQuality, ssaoPresetOf,
} from '../src/engine/ssaoSettings.js';
import {
  SSAO_INSERT_INDEX, createSsaoPass, updateSsaoQuality, setSsaoQuality,
} from '../src/engine/SsaoPass.js';
import { GRAPHICS_PRESETS } from '../src/engine/graphicsPresets.js';

const ROOT = process.cwd();

/** 剥掉注释：不然说明文字里的字段名会被当成接线（与 aa-policy / composer-chain 同款） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

const readSrc = (p) => stripComments(readFileSync(join(ROOT, p), 'utf-8'));

/** 假 renderer：EffectComposer 构造只读 getPixelRatio / getSize 两个口子 */
const fakeRenderer = () => ({
  getPixelRatio: () => 1,
  getSize: (v) => v.set(800, 600),
  setRenderTarget: vi.fn(),
  render: vi.fn(),
});

/** 真 composer + 真 scene/camera（免 WebGL）；neighbors 用带名字的 stub pass 当链上邻居 */
const makeGame = (neighbors = []) => {
  const composer = new EffectComposer(fakeRenderer());
  for (const name of neighbors) composer.addPass({ name, setSize: vi.fn() });
  return {
    composer,
    scene: new Scene(),
    camera: new PerspectiveCamera(60, 16 / 9, 0.1, 1000),
    ssaoPass: null,
  };
};

describe('名册与出厂档（ssaoSettings.js）', () => {
  it('四档名册冻结，每档只有 GTAOPass 真 API 认的字段 —— bias 不得回流（B98）', () => {
    expect(SSAO_QUALITY_NAMES).toEqual(['off', 'low', 'medium', 'high']);
    for (const name of SSAO_QUALITY_NAMES) {
      const preset = SSAO_QUALITY_PRESETS[name];
      expect(Object.keys(preset).sort()).toEqual(['enabled', 'intensity', 'radius', 'samples']);
    }
  });

  it('出厂档 off 钉死（B94 的账：GTAO 每帧多一趟全场景法线渲染，draw call 近翻倍）', () => {
    expect(DEFAULT_SSAO_QUALITY).toBe('off');
    expect(SSAO_QUALITY_PRESETS.off.enabled).toBe(false);
  });

  it('normalizeSsaoQuality：认得出归一，认不出回落出厂 —— 存储脏值不炸开机', () => {
    expect(normalizeSsaoQuality('medium')).toBe('medium');
    expect(normalizeSsaoQuality(' HIGH ')).toBe('high');
    expect(normalizeSsaoQuality('OFF')).toBe('off');
    expect(normalizeSsaoQuality(1)).toBe('off');
    expect(normalizeSsaoQuality('2')).toBe('off');
    expect(normalizeSsaoQuality(null)).toBe('off');
    expect(normalizeSsaoQuality(undefined)).toBe('off');
    expect(normalizeSsaoQuality({})).toBe('off');
  });

  it('ssaoPresetOf：认不出当场抛且说得出名单（内部口径，与 shadowClassOf 同款）', () => {
    expect(() => ssaoPresetOf('武器')).toThrow(/未知档位/);
    expect(() => ssaoPresetOf('武器')).toThrow(/off \/ low \/ medium \/ high/);
    expect(ssaoPresetOf('low')).toEqual(SSAO_QUALITY_PRESETS.low);
  });
});

describe('createSsaoPass / updateSsaoQuality（GTAOPass 真 API 口径）', () => {
  it('off 档返回 null —— 调用方以此决定挂还是不挂', () => {
    expect(createSsaoPass(new Scene(), new PerspectiveCamera(), 800, 600, 'off')).toBeNull();
  });

  it('AO 必须进画面：output = OUTPUT.Default（B98 核心 —— 枚举 1 是 Diffuse，AO 白算）', () => {
    const pass = createSsaoPass(new Scene(), new PerspectiveCamera(), 800, 600, 'medium');
    expect(pass).toBeInstanceOf(GTAOPass);
    expect(pass.output).toBe(GTAOPass.OUTPUT.Default);
  });

  it('参数按名册落上真身：强度走 blendIntensity、半径走 uniform、采样走 defines', () => {
    const pass = createSsaoPass(new Scene(), new PerspectiveCamera(), 800, 600, 'medium');
    expect(pass.blendIntensity).toBe(1.5);
    expect(pass.gtaoMaterial.uniforms.radius.value).toBe(1.0);
    expect(pass.gtaoMaterial.defines.SAMPLES).toBe(16);
  });

  it('换档不炸且逐项落上（B98：原实现写不存在的 uniforms.bias/intensity 当场 TypeError）', () => {
    const pass = createSsaoPass(new Scene(), new PerspectiveCamera(), 800, 600, 'medium');
    expect(() => updateSsaoQuality(pass, 'high')).not.toThrow();
    expect(pass.gtaoMaterial.uniforms.radius.value).toBe(2.0);
    expect(pass.blendIntensity).toBe(2.0);
    expect(pass.gtaoMaterial.defines.SAMPLES).toBe(32);
    updateSsaoQuality(pass, 'off');
    expect(pass.enabled).toBe(false);
  });

  it('updateSsaoQuality(null) 安全返回 —— pass 不存在的档位切换不炸', () => {
    expect(updateSsaoQuality(null, 'medium')).toBeNull();
  });
});

describe('setSsaoQuality 挂/摘/换档（唯一落档出口）', () => {
  it('off 档不挂载：链上无 GTAOPass、game.ssaoPass 为空', () => {
    const game = makeGame(['RenderPass', 'bloom', 'ColorGrade', 'DoF', 'OutputPass']);
    setSsaoQuality(game, 'off');
    expect(game.ssaoPass).toBeNull();
    expect(game.composer.passes.some((p) => p instanceof GTAOPass)).toBe(false);
  });

  it('挂链位置钉死：RenderPass 之后、bloom 之前（AO 调制漫反射亮度），链尾 OutputPass 不动', () => {
    const game = makeGame(['RenderPass', 'bloom', 'ColorGrade', 'DoF', 'OutputPass']);
    setSsaoQuality(game, 'medium');
    const passes = game.composer.passes;
    expect(passes[SSAO_INSERT_INDEX]).toBeInstanceOf(GTAOPass);
    expect(passes[SSAO_INSERT_INDEX]).toBe(game.ssaoPass);
    expect(passes[SSAO_INSERT_INDEX + 1].name).toBe('bloom');
    expect(passes[passes.length - 1].name).toBe('OutputPass');
  });

  it('同档幂等：设置面板开合重放设置不重复挂链', () => {
    const game = makeGame();
    setSsaoQuality(game, 'medium');
    const pass = game.ssaoPass;
    setSsaoQuality(game, 'medium');
    expect(game.composer.passes.filter((p) => p instanceof GTAOPass)).toHaveLength(1);
    expect(game.ssaoPass).toBe(pass);
  });

  it('摘除必须 dispose（B76 泄漏族：只 removePass 不释放 = 4 张 render target 白白挂着）', () => {
    const game = makeGame();
    setSsaoQuality(game, 'medium');
    const pass = game.ssaoPass;
    const spy = vi.spyOn(pass, 'dispose');
    setSsaoQuality(game, 'off');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(game.ssaoPass).toBeNull();
    expect(game.composer.passes.some((p) => p instanceof GTAOPass)).toBe(false);
  });

  it('off → medium → off → low 往返：每次挂链都在 bloom 之前，旧 pass 已释放', () => {
    const game = makeGame(['RenderPass', 'bloom', 'OutputPass']);
    setSsaoQuality(game, 'medium');
    const first = game.ssaoPass;
    setSsaoQuality(game, 'off');
    setSsaoQuality(game, 'low');
    expect(game.ssaoPass).not.toBe(first);
    expect(game.ssaoPass.blendIntensity).toBe(1.0);
    expect(game.composer.passes[1]).toBe(game.ssaoPass);
    expect(game.composer.passes[2].name).toBe('bloom');
  });

  it('off → off 幂等不炸；game / composer 缺席时整体 no-op', () => {
    const game = makeGame();
    expect(() => setSsaoQuality(game, 'off')).not.toThrow();
    expect(() => setSsaoQuality(null, 'medium')).not.toThrow();
    expect(() => setSsaoQuality({}, 'medium')).not.toThrow();
  });
});

describe('接线扫描（唯一出口纪律）', () => {
  it('Game.js：开机走 setSsaoQuality 唯一出口落出厂档；半分辨率死口径不得回流（B98）', () => {
    const src = readSrc('src/core/Game.js');
    expect(src).toMatch(/import\s*\{\s*setSsaoQuality\s*\}\s*from\s*'\.\.\/engine\/SsaoPass\.js'/);
    expect(src).toMatch(/setSsaoQuality\(this,\s*DEFAULT_SSAO_QUALITY\)/);
    expect(src).not.toMatch(/innerWidth\s*\/\s*2/);
    expect(src).not.toMatch(/new\s+GTAOPass/);
  });

  it('SettingsManager：applyToGame 只走 setSsaoQuality 一个出口，不碰组装与挂摘细节', () => {
    const src = readSrc('src/core/SettingsManager.js');
    expect(src).toMatch(/import\s*\{\s*setSsaoQuality\s*\}\s*from\s*'\.\.\/engine\/SsaoPass\.js'/);
    expect(src).toMatch(/setSsaoQuality\(game,\s*this\.get\('ssaoQuality'\)\)/);
    expect(src).not.toMatch(/updateSsaoQuality|createSsaoPass|GTAOPass|insertPass|removePass/);
  });

  it('SsaoPass.js：坏写法的尺子 —— 不存在的 uniform 与数字字面量 output 不得回流（B98）', () => {
    const src = readSrc('src/engine/SsaoPass.js');
    expect(src).not.toMatch(/uniforms\.bias/);
    expect(src).not.toMatch(/uniforms\.intensity/);
    expect(src).not.toMatch(/\.output\s*=\s*\d/);
    expect(src).toMatch(/GTAOPass\.OUTPUT\.Default/);
  });

  it('设置面板与 HTML：SSAO 档下拉从名册现推、回显清洗值、控件存在', () => {
    const panel = readSrc('src/ui/SettingsPanel.js');
    expect(panel).toMatch(/SSAO_QUALITY_NAMES/);
    expect(panel).toMatch(/set-ssao/);
    expect(panel).toMatch(/normalizeSsaoQuality\(d\.ssaoQuality\)/);
    const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
    expect(html).toMatch(/id="set-ssao"/);
  });

  it('画质预设与名册联动：每档 ssaoQuality 都是名册认得的档位（W-D3 × W-C4 交界）', () => {
    for (const [name, preset] of Object.entries(GRAPHICS_PRESETS)) {
      expect(SSAO_QUALITY_NAMES).toContain(preset.ssaoQuality);
      if (name === 'low') expect(preset.ssaoQuality).toBe('off');
    }
  });
});