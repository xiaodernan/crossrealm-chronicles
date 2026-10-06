/**
 * 抗锯齿策略的单一所有者（W-C4 切片1）—— 与 shadow-policy.test.js 同一套口径。
 *
 * ## 这份门禁钉的是什么
 * `antialias: true` 是死参数：每一帧都走 EffectComposer，canvas 的 MSAA 帧缓冲
 * 只对"直接画到 canvas 的几何边"有效，全屏三角没有几何边。抗锯齿的真身是
 * composer render target 的 `samples` 字段（three 0.172 的 EffectComposer 自建
 * target 默认 **不设 samples = 0**，即自切 composer 链起全屏就没有过抗锯齿）。
 *
 * - 名册冻结 + 认不出当场抛（`msaaSamplesOf`，与 `shadowQualityOf` 同口径）；
 * - 存储侧回落不抛（`normalizeMsaaSamples`，一行手改的 localStorage 不该炸开机）；
 * - `applyMsaaSamples` 是唯一落档出口：换档伴随 dispose（懒重建），同档幂等；
 * - Game.js 接线扫描：不许再出现 `antialias:`，必须走 `applyMsaaSamples`。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  MSAA_SAMPLES, DEFAULT_MSAA_SAMPLES,
  msaaSamplesOf, normalizeMsaaSamples, applyMsaaSamples,
} from '../src/engine/aaPolicy.js';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** 剥掉注释：不然说明文字里的 `antialias` 会被当成接线（与 shadow-policy 同款） */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((ln) => { const i = ln.indexOf('//'); return i >= 0 ? ln.slice(0, i) : ln; }).join('\n');

describe('名册', () => {
  it('三档冻结：0（关）/ 2 / 4，出厂 4', () => {
    expect(MSAA_SAMPLES).toEqual([0, 2, 4]);
    expect(Object.isFrozen(MSAA_SAMPLES)).toBe(true);
    expect(DEFAULT_MSAA_SAMPLES).toBe(4);
  });

  it('msaaSamplesOf：登记档原样返回，认不出当场抛（说得出有哪些档）', () => {
    for (const n of MSAA_SAMPLES) expect(msaaSamplesOf(n)).toBe(n);
    expect(() => msaaSamplesOf(8)).toThrow(/8/);
    expect(() => msaaSamplesOf(1)).toThrow(/0 \/ 2 \/ 4/);
  });

  it('normalizeMsaaSamples：脏值回落出厂，不抛 —— 存储是玩家可写的', () => {
    expect(normalizeMsaaSamples(2)).toBe(2);
    expect(normalizeMsaaSamples(undefined)).toBe(4);
    expect(normalizeMsaaSamples(NaN)).toBe(4);
    expect(normalizeMsaaSamples(99)).toBe(4);
    expect(normalizeMsaaSamples('4')).toBe(4);   // 字符串不是登记档 —— 落回数字
  });
});

describe('applyMsaaSamples', () => {
  /** 假 composer：两张交换 target 带 samples 字段与 dispose 侦测，口径同真 */
  const fakeComposer = () => {
    const rt = () => ({ samples: 0, dispose: vi.fn() });
    return { renderTarget1: rt(), renderTarget2: rt() };
  };

  it('两张交换 target 一起落档 —— pass 链每帧换手，只落一张等于半数帧不抗锯齿', () => {
    const c = fakeComposer();
    applyMsaaSamples(c, 2);
    expect(c.renderTarget1.samples).toBe(2);
    expect(c.renderTarget2.samples).toBe(2);
  });

  it('换档伴随 dispose：已建过的 framebuffer 只改 samples 不会重建，拆了才懒重建', () => {
    const c = fakeComposer();
    applyMsaaSamples(c, 4);
    expect(c.renderTarget1.dispose).toHaveBeenCalledTimes(1);
    expect(c.renderTarget2.dispose).toHaveBeenCalledTimes(1);
  });

  it('同档幂等：不重复 dispose，设置面板开合重放不拆活着的帧缓冲', () => {
    const c = fakeComposer();
    applyMsaaSamples(c, 4);
    c.renderTarget1.dispose.mockClear();
    c.renderTarget2.dispose.mockClear();
    applyMsaaSamples(c, 4);
    expect(c.renderTarget1.dispose).not.toHaveBeenCalled();
    expect(c.renderTarget2.dispose).not.toHaveBeenCalled();
  });

  it('未登记的档当场抛 —— 静默落默认会让"写错档"变成"悄悄没抗锯齿"', () => {
    const c = fakeComposer();
    expect(() => applyMsaaSamples(c, 8)).toThrow(/8/);
    expect(c.renderTarget1.samples).toBe(0);     // 抛了就不动 target
  });

  it('没有 composer / 缺 target 都安全（调用方是可选链的口，不重复设防）', () => {
    expect(applyMsaaSamples(null, 4)).toBe(null);
    expect(applyMsaaSamples({}, 4)).toBeDefined();
  });
});

describe('接线门禁（Game.js）', () => {
  it('Game.js 不再传 antialias（死参数），MSAA 只走 applyMsaaSamples 一条路', () => {
    const src = stripComments(readFileSync(join(SRC, 'core', 'Game.js'), 'utf8'));
    expect(src).toMatch(/applyMsaaSamples\(this\.composer,\s*DEFAULT_MSAA_SAMPLES\)/);
    expect(src).not.toMatch(/antialias\s*:/);
  });

  it('反面证据：那把正则认得出真传了 antialias 的写法', () => {
    const bad = 'new THREE.WebGLRenderer({ antialias: true });';
    expect(/antialias\s*:/.test(bad)).toBe(true);
  });

  it('SettingsManager 只经 normalizeMsaaSamples + applyMsaaSamples 落档，不裸写 samples', () => {
    const src = stripComments(readFileSync(join(SRC, 'core', 'SettingsManager.js'), 'utf8'));
    expect(src).toMatch(/applyMsaaSamples\(game\.composer,\s*normalizeMsaaSamples\(this\.get\('msaaSamples'\)\)\)/);
    expect(src).not.toMatch(/renderTarget[12]\.samples\s*=/);
  });
});
