/**
 * 英文表纯净门禁 —— 「英文模式无中文」的最后一道关。
 *
 * 用户明确要求：英文模式下全部统一英文，不许中英夹杂。
 * 实测（改前）：`strings.en.js` 有 4 处 `English · 中文` 并列——
 *   trilance_cast_cta / trilance_cast_done / trilance_aligned_title / trilance_staggered_title，
 * 玩家在英文模式的「三日曜盘」页签上会看到「起曜盘 / 本周曜盘已起 / 合帘 / 余响」。
 *
 * 钉住三件事：
 *  ① 英文表的**值**里不许出现 CJK 汉字；
 *  ② 英文表的值里不许出现中文标点（，。！？；：、（）【】「」）；
 *  ③ 反向控制：中文表必须有汉字（否则说明表被清空了、门禁会假绿）。
 *
 * 变异判据：往英文表塞回一处中文 → ①红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const EN = readFileSync('src/content/strings.en.js', 'utf8');
const ZH = readFileSync('src/content/strings.zh.js', 'utf8');

/** 抽出「键: '值'」里的值（单引号字符串，够用：两表都是这个写法） */
const values = (src) => {
  const out = [];
  const re = /^\s*([a-z0-9_]+):\s*'((?:[^'\\]|\\.)*)'/gm;
  let m;
  while ((m = re.exec(src)) !== null) out.push([m[1], m[2]]);
  return out;
};

describe('英文表纯净（英文模式无中文）', () => {
  it('英文表的值里没有 CJK 汉字', () => {
    const bad = values(EN).filter(([, v]) => /[\u4e00-\u9fa5]/.test(v));
    expect(bad.map(([k]) => k), `英文表仍有中文：${bad.map(([k]) => k).join(', ')}`).toEqual([]);
  });

  it('英文表的值里没有中文标点', () => {
    const bad = values(EN).filter(([, v]) => /[，。！？；：、（）【】「」《》]/.test(v));
    expect(bad.map(([k]) => k)).toEqual([]);
  });

  it('反向控制：中文表确实有大量汉字（门禁不会因为表被清空而假绿）', () => {
    const withHan = values(ZH).filter(([, v]) => /[\u4e00-\u9fa5]/.test(v));
    expect(withHan.length).toBeGreaterThan(1000);
  });
});
