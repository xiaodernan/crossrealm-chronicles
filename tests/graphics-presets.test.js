/**
 * 画质预设门禁 —— 钉 `engine/graphicsPresets.js`（W-D3 切片1，低/中/高三档）。
 *
 * 纯逻辑、被 `SettingsManager`/`SettingsPanel` 消费，但**没有专门测试**（仅 ssao-policy
 * 顺带 import）。几条"写错不抛、只静默错档"的不变量：
 * - **单调**：越高档画质越好 —— shadowQuality/msaaSamples/pixelRatio/bloomStrength/
 *   enemyLodDistance 逐档不减；ssaoQuality 按名册下标不减（low=off < medium < high）。
 *   有人把 low 的像素比写成比 high 还大，就是"选低画质反而更卡"，肉眼看不出。
 * - **名册驱动**：三档值来自 shadowPolicy/aaPolicy/ssaoSettings 的名册，加删档面板自动跟上。
 * - `normalizeGraphicsPreset` 非法回落出厂档；`getGraphicsPreset` 非法抛错、返回副本。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import {
  GRAPHICS_PRESETS, PRESET_NAMES, DEFAULT_GRAPHICS_PRESET,
  normalizeGraphicsPreset, getGraphicsPreset,
} from '../src/engine/graphicsPresets.js';
import { SSAO_QUALITY_NAMES } from '../src/engine/ssaoSettings.js';

describe('GRAPHICS_PRESETS 结构与名册', () => {
  it('三档 low/medium/high，名册按此顺序', () => {
    expect(PRESET_NAMES).toEqual(['low', 'medium', 'high']);
  });

  it('出厂默认档是合法档位', () => {
    expect(PRESET_NAMES).toContain(DEFAULT_GRAPHICS_PRESET);
  });

  it('每档都含六个字段且类型正确', () => {
    for (const name of PRESET_NAMES) {
      const p = GRAPHICS_PRESETS[name];
      expect(typeof p.shadowQuality, `${name}.shadowQuality`).toBe('number');
      expect(typeof p.msaaSamples, `${name}.msaaSamples`).toBe('number');
      expect(typeof p.ssaoQuality, `${name}.ssaoQuality`).toBe('string');
      expect(typeof p.pixelRatio, `${name}.pixelRatio`).toBe('number');
      expect(typeof p.bloomStrength, `${name}.bloomStrength`).toBe('number');
      expect(typeof p.enemyLodDistance, `${name}.enemyLodDistance`).toBe('number');
    }
  });
});

describe('GRAPHICS_PRESETS 单调（越高档画质越好）', () => {
  for (const f of ['shadowQuality', 'msaaSamples', 'pixelRatio', 'bloomStrength', 'enemyLodDistance']) {
    it(`${f}: low ≤ medium ≤ high`, () => {
      expect(GRAPHICS_PRESETS.low[f], 'low≤medium').toBeLessThanOrEqual(GRAPHICS_PRESETS.medium[f]);
      expect(GRAPHICS_PRESETS.medium[f], 'medium≤high').toBeLessThanOrEqual(GRAPHICS_PRESETS.high[f]);
    });
  }

  it('ssaoQuality: 名册下标 low ≤ medium ≤ high', () => {
    const idx = (q) => SSAO_QUALITY_NAMES.indexOf(q);
    expect(idx(GRAPHICS_PRESETS.low.ssaoQuality), 'low 档必须是合法 SSAO 档').toBeGreaterThanOrEqual(0);
    expect(idx(GRAPHICS_PRESETS.low.ssaoQuality)).toBeLessThanOrEqual(idx(GRAPHICS_PRESETS.medium.ssaoQuality));
    expect(idx(GRAPHICS_PRESETS.medium.ssaoQuality)).toBeLessThanOrEqual(idx(GRAPHICS_PRESETS.high.ssaoQuality));
  });
});

describe('normalizeGraphicsPreset 回落', () => {
  it('合法名（大小写/空白不敏感）→ 归一', () => {
    expect(normalizeGraphicsPreset('low')).toBe('low');
    expect(normalizeGraphicsPreset('HIGH')).toBe('high');
    expect(normalizeGraphicsPreset('  Medium ')).toBe('medium');
  });

  it('非法 / 非字符串 → 出厂默认档', () => {
    for (const bad of ['ultra', '', null, undefined, 123, {}, []]) {
      expect(normalizeGraphicsPreset(bad), `坏值 ${JSON.stringify(bad)}`).toBe(DEFAULT_GRAPHICS_PRESET);
    }
  });
});

describe('getGraphicsPreset 取档 + 返回副本', () => {
  it('合法档返回该档值', () => {
    const p = getGraphicsPreset('high');
    expect(p.shadowQuality).toBe(GRAPHICS_PRESETS.high.shadowQuality);
    expect(p.pixelRatio).toBe(2.0);
  });

  it('非法档抛错（消息含可用档位）', () => {
    expect(() => getGraphicsPreset('ultra')).toThrow(/未知档位/);
    expect(() => getGraphicsPreset('ultra')).toThrow(/low, medium, high/);
  });

  it('返回副本：改返回值不污染冻结的出厂表', () => {
    const p = getGraphicsPreset('low');
    p.pixelRatio = 999;
    expect(GRAPHICS_PRESETS.low.pixelRatio).not.toBe(999);
  });
});
