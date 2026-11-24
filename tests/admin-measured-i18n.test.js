import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 炉边盘实测卡的 i18n 接线门禁。
 *
 * 抓到的真 bug：meas_tr5 / meas_tr6 的 trend 是硬编码在 HTML 里的中文，
 * 没有 data-i18n，也没有字典键 —— 切英文时这两格永远是中文。
 * 现在两条都补齐了，这一门保证以后新增的 meas_* 卡不再漏接线。
 */
const html = readFileSync(join(process.cwd(), 'docs', 'admin', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

describe('炉边盘实测卡 i18n 接线', () => {
  it('每个 data-i18n="meas_*" 键都在字典里有对应值', () => {
    const used = [...new Set([...html.matchAll(/data-i18n="(meas_[a-z0-9_]+)"/g)].map(m => m[1]))];
    const dict = new Set([...html.matchAll(/([a-z][a-z0-9_]+):\s*['"`]/g)].map(m => m[1]));
    const missing = used.filter(k => !dict.has(k));
    expect(used.length).toBeGreaterThan(50);
    expect(missing, `这些卡引用了不存在的字典键：${missing.join(', ')}`).toEqual([]);
  });

  it('meas_tr5 / meas_tr6 既有 data-i18n 又有中英两条字典', () => {
    for (const id of ['meas_tr5', 'meas_tr6']) {
      expect(html).toMatch(new RegExp(`data-i18n="${id}"`));
      expect(new RegExp(`${id}:\\s*'[^']+'`, 'g').exec(html), `${id} 字典值不足两条`).toBeTruthy();
      expect([...html.matchAll(new RegExp(`${id}:\\s*'[^']*'`, 'g'))].length, `${id} 应有中英两条`).toBe(2);
    }
  });

  it('英文半区的 meas_tr6 不含汉字', () => {
    const enBlock = html.slice(html.indexOf("meas_l4: 'Single-IP flood shed'"));
    const line = enBlock.split('\n').find(l => l.includes('meas_tr6:'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
