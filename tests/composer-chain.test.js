/**
 * composer 链序门禁（W-C4 切片3）—— 与 aa-policy.test.js 同一套口径。
 *
 * ## 这份门禁钉的是什么
 * `renderer.toneMapping = ACESFilmicToneMapping` 与 `outputColorSpace = SRGBColorSpace`
 * 只对"直接 WebGLRenderer.render() 到 canvas"的路径生效；每一帧都走 EffectComposer，
 * 显示变换真身在链尾 pass 上。切片3 之前链尾是 UnrealBloomPass：
 * 场景主体经它的 MeshBasicMaterial blit 上屏（内建材质带 tone mapping + sRGB chunk，
 * 主体没断链），但 bloom 光晕的 additive 叠加走 CopyShader（`gl_FragColor = opacity * texel`，
 * 裸输出）—— 是把**线性 bloom 值加到已 sRGB 编码的像素上**，光晕比线性合成弱，
 * 且发生在 ACES 曲线之外。
 *
 * - OutputPass 站链尾：bloom 改画回线性 readBuffer，场景 + bloom 先线性合成，
 *   再由 OutputPass 一次性 ACES + sRGB（tone mapping 参数按 renderer 现状实时重建）。
 * - **铁律**：后续一切 pass（LUT / SSAO / 景深）必须插在 OutputPass 之前 ——
 *   显示变换之后是 sRGB 空间，任何在线性空间做分级的 pass 站它后面就静默失效。
 *   OutputPass 是链上唯一被允许站链尾的 pass，本门禁按行扫描锁死这条顺序。
 * - OutputPass 行为钉子（真类 + 假 renderer，不需要 WebGL）：exposure 与显示变换
 *   按 renderer 现状**实时**读（不是构造快照），renderToScreen 与否决定画到哪。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  ACESFilmicToneMapping,
  NoToneMapping,
  SRGBColorSpace,
  LinearSRGBColorSpace,
} from 'three';

const ROOT = process.cwd();

/** 剥掉注释：不然说明文字里的 OutputPass 会被当成接线（与 aa-policy 同款） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

const gameSrc = () => stripComments(readFileSync(join(ROOT, 'src/core/Game.js'), 'utf-8'));

/** 按出现顺序摘出所有 addPass 的实参表达式 */
const addPassArgs = (src) => [...src.matchAll(/\.addPass\(\s*([^);]+)\s*\)/g)].map((m) => m[1]);

describe('Game.js 接线扫描', () => {
  it('必须 import OutputPass 并 addPass —— 显示变换要有落点', () => {
    const src = gameSrc();
    expect(src).toMatch(/import\s*\{\s*OutputPass\s*\}\s*from\s*'three\/addons\/postprocessing\/OutputPass\.js'/);
    expect(addPassArgs(src).some((a) => a.includes('OutputPass'))).toBe(true);
  });

  it('链序必须是 RenderPass -> bloom -> OutputPass —— bloom 光晕要在线性空间合成', () => {
    const args = addPassArgs(gameSrc()).filter((a) => a.includes('Pass'));
    expect(args.length).toBeGreaterThanOrEqual(3);
    expect(args[0]).toContain('RenderPass');
    expect(args[1]).toContain('bloomPass');
    expect(args[2]).toContain('OutputPass');
  });

  it('铁律：OutputPass 是最后一个 addPass —— 它后面不许再插任何 pass', () => {
    const args = addPassArgs(gameSrc());
    expect(args[args.length - 1]).toContain('OutputPass');
  });

  it('显示变换参数不许悄悄变：ACES + exposure 是链尾真身的输入', () => {
    const src = gameSrc();
    expect(src).toMatch(/renderer\.toneMapping\s*=\s*THREE\.ACESFilmicToneMapping/);
    expect(src).toMatch(/renderer\.toneMappingExposure\s*=/);
  });
});

describe('OutputPass 行为钉子（真类 + 假 renderer）', () => {
  /** 假 renderer：只供给 OutputPass.render 实际读取的四个口子 */
  const fakeRenderer = (over = {}) => ({
    outputColorSpace: SRGBColorSpace,
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1.28,
    setRenderTarget: vi.fn(),
    render: vi.fn(),
    ...over,
  });
  const buffers = () => ({ writeBuffer: { texture: 'w' }, readBuffer: { texture: 'r' } });

  it('exposure 按 renderer 现状实时读 —— 调曝光不用重建链', () => {
    const pass = new OutputPass();
    const r = fakeRenderer();
    const { writeBuffer, readBuffer } = buffers();
    pass.render(r, writeBuffer, readBuffer);
    expect(pass.uniforms.toneMappingExposure.value).toBe(1.28);
    r.toneMappingExposure = 2.0;
    pass.render(r, writeBuffer, readBuffer);
    expect(pass.uniforms.toneMappingExposure.value).toBe(2.0);
  });

  it('显示变换按 renderer 现状重建：sRGB + ACES 各自落 define，换 NoToneMapping 后 ACES define 消失', () => {
    const pass = new OutputPass();
    const r = fakeRenderer();
    const { writeBuffer, readBuffer } = buffers();
    pass.render(r, writeBuffer, readBuffer);
    expect(pass.material.defines.SRGB_TRANSFER).toBe('');
    expect(pass.material.defines.ACES_FILMIC_TONE_MAPPING).toBe('');

    r.toneMapping = NoToneMapping;
    pass.render(r, writeBuffer, readBuffer);
    expect(pass.material.defines.ACES_FILMIC_TONE_MAPPING).toBeUndefined();
    expect(pass.material.defines.SRGB_TRANSFER).toBe('');
  });

  it('输出不是 sRGB 色彩空间时不做 sRGB 编码（线性 readBuffer 不该被误编）', () => {
    const pass = new OutputPass();
    const r = fakeRenderer({ outputColorSpace: LinearSRGBColorSpace });
    const { writeBuffer, readBuffer } = buffers();
    pass.render(r, writeBuffer, readBuffer);
    expect(pass.material.defines.SRGB_TRANSFER).toBeUndefined();
  });

  it('renderToScreen 决定画到哪：链尾画屏、非链尾画 writeBuffer —— 链序错乱会静默输出到中间 target', () => {
    const pass = new OutputPass();
    const r = fakeRenderer();
    const { writeBuffer, readBuffer } = buffers();
    pass.renderToScreen = true;
    pass.render(r, writeBuffer, readBuffer);
    expect(r.setRenderTarget).toHaveBeenCalledWith(null);

    pass.renderToScreen = false;
    pass.render(r, writeBuffer, readBuffer);
    expect(r.setRenderTarget).toHaveBeenLastCalledWith(writeBuffer);
  });
});
