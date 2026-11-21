import { describe, it, expect } from 'vitest';
import { sortVolumeIds } from '../src/ui/CanonJournalTab.js';

/**
 * W-Z496 典籍馆 290 卷阅读顺序：卷号 "00".."289" 必须按数值排，
 * 默认字典序会把 100 排在 99 前、18 排在 180 前（"1" < "9"），
 * 让读者「下一章」在 100→101→…→18 之间乱跳。
 */
describe('典籍馆卷号数值排序（W-Z496）', () => {
  it('0..289 全部按数值升序，无字典序错位', () => {
    const ids = Array.from({ length: 290 }, (_, i) => String(i).padStart(2, '0'));
    const shuffled = [...ids].reverse();
    const sorted = sortVolumeIds(shuffled);
    expect(sorted).toEqual(ids);
    expect(sorted[99]).toBe('99');
    expect(sorted[100]).toBe('100');
    expect(sorted[sorted.length - 1]).toBe('289');
  });

  it('默认字典序确会错位（证明这把尺咬得住，不是空跑）', () => {
    const ids = Array.from({ length: 290 }, (_, i) => String(i).padStart(2, '0'));
    const naive = [...ids].sort();
    expect(naive).not.toEqual(ids);
    expect(naive.indexOf('100')).toBeLessThan(naive.indexOf('99'));
  });

  it('非数字 id 用字典序兜底，不抛', () => {
    expect(sortVolumeIds(['prologue', '00', 'epilogue'])).toEqual(['00', 'epilogue', 'prologue']);
  });
});