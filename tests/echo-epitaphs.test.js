/**
 * W-Z29「卷帙残章」：星尘铭文——每个母题毕业时在成就墙上留一行字
 *
 * 钉住：
 * 1) ECHO_EPITAPHS：17 条目 × 母题全部存在；每条 key 双表齐备
 * 2) 每个母题对应的解锁成就是「成结档」成就：_6 / -master（echo-crossover 除外——它只有三枚）
 * 3) AchievementsJournalTab 源码接线：import ECHO_EPITAPHS / epitaph grid 渲染分支 / 锁态分支
 * 4) style.css 里登记了 .ach-ept-grid 与 .ach-epitaph-unlocked 两族样式
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ECHO_EPITAPHS } from '../src/content/echoEpitaphs.js';
import { ACHIEVEMENTS } from '../src/game/AchievementSystem.js';
import { FRANCHISE } from '../src/content/franchises.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

const ROOT = process.cwd();
const PANEL = readFileSync(join(ROOT, 'src/ui/AchievementsJournalTab.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'src/style.css'), 'utf8');

describe('ECHO_EPITAPHS 数据表', () => {
  it('17 条母题 × 17 条铭文，键全双表齐', () => {
    expect(ECHO_EPITAPHS.length).toBe(17);
    for (const e of ECHO_EPITAPHS) {
      expect(typeof STRINGS_ZH[e.key], e.key + ' zh').toBe('string');
      expect(typeof STRINGS_EN[e.key], e.key + ' en').toBe('string');
      expect(STRINGS_ZH[e.key].length, e.key + ' zh 长度').toBeGreaterThan(0);
      expect(STRINGS_EN[e.key].length, e.key + ' en 长度').toBeGreaterThan(0);
    }
  });

  it('每个解锁成就都存在于名册，且 id 以 -6 或 -master 结尾（唯一 crossover 例外）', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const e of ECHO_EPITAPHS) {
      expect(ids.has(e.ach), `${e.franchise} → ${e.ach} 未登记`).toBe(true);
      const okTier = /-6$/.test(e.ach) || e.ach.endsWith('-master') || e.ach === 'echo-crossover';
      expect(okTier, e.ach + ' 不是终段档（-6 / -master / echo-crossover）').toBe(true);
    }
  });

  it('franchise 字段全部是 FRANCHISE 名册里的合法 id', () => {
    const valid = new Set(Object.values(FRANCHISE));
    for (const e of ECHO_EPITAPHS) expect(valid.has(e.franchise), e.franchise).toBe(true);
  });
});

describe('AchievementsJournalTab 接线', () => {
  it('import ECHO_EPITAPHS 且渲染 unlock/lock 两支', () => {
    expect(PANEL).toContain("from '../content/echoEpitaphs.js'");
    expect(PANEL).toContain("t('ach_epitaphs_title')");
    expect(PANEL).toContain("t('ach_epitaphs_hint')");
    expect(PANEL).toContain("t('ach_epitaphs_locked')");
    expect(PANEL).toContain('t(e.themeKey)');
    expect(PANEL).toContain('ach-epitaph-unlocked');
  });
});

describe('style.css 样式面', () => {
  it('.ach-ept-grid / .ach-epitaph-unlocked 都登记了', () => {
    expect(CSS).toContain('.ach-ept-grid');
    expect(CSS).toContain('.ach-epitaph-unlocked');
  });
});
