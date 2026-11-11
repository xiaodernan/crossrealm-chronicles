/**
 * 新纪录播报接线（W-G7 切片1）—— source 断言（同 W-X6/W-X8 纪律）
 *
 * Game.js 在 boss-defeated 里记账（`bossBestTimes.consider`）之后，
 * 必须在**刚打破最速的这一刻** toast 一次 "新纪录 · {clock}"。钉住：
 * 1) consider 的结构（improved 必须接住、clearTimeMs 原样入账）；
 * 2) toast 的位置在 consider 之后（"先记账、再播报"）；
 * 3) 只在 improved 时播（`if (improved)` 守卫存在）；
 * 4) 时钟格式出口是 msClock.js（结局结算/传说碑同一口径）；
 * 5) 文案两表登记、占位符对齐、键数 2865（登记处 tests/helpers/i18nKeyCount.js）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { 键数问题 } from './helpers/i18nKeyCount.js';

const GAME = readFileSync(join(process.cwd(), 'src/core/Game.js'), 'utf8');

describe('W-G7 新纪录接线', () => {
  it('记账发生在 toast 之前，且 improved 被接住', () => {
    const iConsider = GAME.indexOf('bossBestTimes.consider(bossId, clearTimeMs)');
    const iImproved = GAME.indexOf('improved');
    const iToast = GAME.indexOf('boss_best_time_new_record_fmt');
    expect(iConsider).toBeGreaterThan(-1);
    expect(iImproved).toBeGreaterThan(-1);
    expect(iToast).toBeGreaterThan(iConsider);
  });

  it('只在 improved 时播报：toast 位于 if (improved) 守卫之后', () => {
    const iGuard = GAME.indexOf('if (improved)');
    const iToast = GAME.indexOf('boss_best_time_new_record_fmt');
    expect(iGuard).toBeGreaterThan(-1);
    expect(iToast).toBeGreaterThan(iGuard);
  });

  it('时钟格式来自共享出口 msClock.js（结局结算与传说碑同一口径）', () => {
    expect(GAME).toContain("import { fmtClock } from '../ui/msClock.js';");
    expect(GAME).toContain('fmtClock(clearTimeMs)');
  });
});

describe('W-G7 文案腿', () => {
  it('中英原值逐字钉死', () => {
    expect(STRINGS_ZH.boss_best_time_new_record_fmt).toBe('新纪录 · ${clock}');
    expect(STRINGS_EN.boss_best_time_new_record_fmt).toBe('New record · ${clock}');
  });

  it('占位符中英对齐且只有 clock', () => {
    const 占位 = (s) => [...s.matchAll(/\$\{(\w+)\}/g)].map((m) => m[1]).sort();
    expect(占位(STRINGS_ZH.boss_best_time_new_record_fmt)).toEqual(占位(STRINGS_EN.boss_best_time_new_record_fmt));
    expect(占位(STRINGS_ZH.boss_best_time_new_record_fmt)).toEqual(['clock']);
  });

  it('键数 2865：两表相等且等于登记值', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(键数问题(ZH_KEYS, EN_KEYS), '键数与登记值不符').toEqual([]);
  });
});
