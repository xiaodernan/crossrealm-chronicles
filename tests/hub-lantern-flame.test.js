/**
 * 旅人之灯的焰色（W-V11）——通关后从暖纸琥珀换成金阳白。
 *
 * 门禁三条：
 *   1. hubLanternFlameColors(false) = 琥珀纸（未通关档的默认焰色，与 Wave11 刚落地时逐字一致）；
 *   2. hubLanternFlameColors(true) = 金阳白（通关档：color/emissive/intensity 全部更暖、更亮、更白）；
 *   3. 两档的 intensity 顺序（金 > 琥珀）、色值与 W-V5 金冕/W-V8 金迸系一致（暖金族）。
 */
import { describe, it, expect } from 'vitest';
import { hubLanternFlameColors } from '../src/world/PopCultureZoneEnhancerWave11.js';

describe('W-V11 旅人之灯焰色', () => {
  it('未通关：暖纸琥珀（Wave11 原始焰色，不许随手改）', () => {
    expect(hubLanternFlameColors(false)).toEqual({ color: 0xe8d6a8, emissive: 0xd8a850, intensity: 0.9 });
  });

  it('通关：金阳白（更暖、更亮、更白）', () => {
    expect(hubLanternFlameColors(true)).toEqual({ color: 0xfff3c4, emissive: 0xffd98a, intensity: 1.75 });
  });

  it('通关档比未通关档更亮（金阳 > 琥珀，金迸/金铃/金冕同族暖金）', () => {
    expect(hubLanternFlameColors(true).intensity).toBeGreaterThan(hubLanternFlameColors(false).intensity);
    expect(hubLanternFlameColors(true).emissive).toBe(0xffd98a);
  });
});
