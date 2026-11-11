/**
 * W-V2 切片1：Boss 阶段史诗演出的纯逻辑门禁
 *
 * 钉住三条契约：
 * 1. 罗马数字映射按表出——越界/非数/小数一律空串（宁空不错）；
 * 2. 史诗演出只认 phase ≥ 2——门槛阶段（1）不惊动观众；
 * 3. CINE_PHASES 冻结——运行时谁要改它，这里先红。
 * （DOM 侧的黑边/水印是 BossPhaseDirector + style.css 的事，用例不解析 HTML。）
 */
import { describe, it, expect } from 'vitest';
import { romanNumeral, isCinePhase, CINE_PHASES } from '../src/ui/bossPhaseCine.js';

describe('W-V2 bossPhaseCine · romanNumeral', () => {
  it('1..8 逐个按表映射', () => {
    const expected = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
    for (let i = 1; i <= 8; i++) {
      expect(romanNumeral(i)).toBe(expected[i - 1]);
    }
  });

  it('字符串输入也接受（事件细节常来自 JSON）', () => {
    expect(romanNumeral('2')).toBe('II');
    expect(romanNumeral('3')).toBe('III');
  });

  it('越界/非数/NaN 一律空串', () => {
    expect(romanNumeral(0)).toBe('');
    expect(romanNumeral(9)).toBe('');
    expect(romanNumeral(-1)).toBe('');
    expect(romanNumeral(NaN)).toBe('');
    expect(romanNumeral(Infinity)).toBe('');
    expect(romanNumeral(undefined)).toBe('');
    expect(romanNumeral('三')).toBe('');
  });

  it('小数截断到整数格', () => {
    expect(romanNumeral(2.9)).toBe('II');
  });
});

describe('W-V2 bossPhaseCine · isCinePhase', () => {
  it('只认 2 和 3', () => {
    expect(isCinePhase(2)).toBe(true);
    expect(isCinePhase(3)).toBe(true);
    expect(isCinePhase(1)).toBe(false);
    expect(isCinePhase(0)).toBe(false);
    expect(isCinePhase(4)).toBe(false);
  });

  it('非数一律不演出', () => {
    expect(isCinePhase(undefined)).toBe(false);
    expect(isCinePhase('三')).toBe(false);
    expect(isCinePhase(NaN)).toBe(false);
  });

  it('CINE_PHASES 冻结且恰好两格', () => {
    expect(Object.isFrozen(CINE_PHASES)).toBe(true);
    expect(CINE_PHASES).toEqual([2, 3]);
  });
});
