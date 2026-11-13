/**
 * W-Z31「炉主」—— 全母题终段档：echo-keeper
 *
 * 顿住四件大事：
 * 1) 成就确实进入了 ACHIEVEMENTS_POP_CULTURE（生产名册）
 * 2) 解锁判据只认满十七母题（17 条件 AND）——缺商议补充任何一项就不该放水；
 * 3) strings 双表中 ach_echo_keeper_title / ach_echo_keeper_desc 都在；
 * 4) MASTER 册（大成就）里包含 echo-keeper —— 牌匾走烫金、金迸特效才会唤起。
 */
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS_POP_CULTURE } from '../src/content/achievements.js';
import { MASTER_ACHIEVEMENT_IDS } from '../src/content/masterAchievements.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { ACHIEVEMENTS } from '../src/game/AchievementSystem.js';

const allSix = {
  echoWizard: 6, echoSpace: 6, echoUpside: 6, echoWestern: 6, echoGangster: 6,
  echoSciFi: 6, echoCyber: 6, echoSamurai: 6, echoCosmic: 6, echoStarport: 6,
  echoGloom: 6, echoRadiant: 6, echoVoidMaw: 6, echoAbysssalt: 6, echoMiddleEarth: 6,
  echoHomecoming: 10, echoCrossover: 3,
};

describe('echo-keeper 进册与解锁签', () => {
  it('ACHIEVEMENTS_POP_CULTURE 里登记了，且 ACHIEVEMENTS 合并名册也包含', () => {
    expect(ACHIEVEMENTS_POP_CULTURE.find((a) => a.id === 'echo-keeper')).toBeTruthy();
    expect(ACHIEVEMENTS.find((a) => a.id === 'echo-keeper')).toBeTruthy();
  });

  it('MASTER_ACHIEVEMENT_IDS 包含 echo-keeper（牌匾与金迸都挂钩）', () => {
    expect(MASTER_ACHIEVEMENT_IDS).toContain('echo-keeper');
  });

  it('全 17 母题满档 → check 放行', () => {
    const keeper = ACHIEVEMENTS_POP_CULTURE.find((a) => a.id === 'echo-keeper');
    expect(keeper.check(allSix)).toBe(true);
  });

  it.each([
    ['echoWizard', 6], ['echoSpace', 6], ['echoUpside', 6],
    ['echoWestern', 6], ['echoGangster', 6], ['echoSciFi', 6],
    ['echoCyber', 6], ['echoSamurai', 6], ['echoCosmic', 6],
    ['echoStarport', 6], ['echoGloom', 6], ['echoRadiant', 6], ['echoVoidMaw', 6],
    ['echoAbysssalt', 6], ['echoMiddleEarth', 6], ['echoHomecoming', 10], ['echoCrossover', 3],
  ])('缺一[%s >= %i] → 不放水', (key, n) => {
    const keeper = ACHIEVEMENTS_POP_CULTURE.find((a) => a.id === 'echo-keeper');
    const stats = { ...allSix, [key]: n - 1 };
    expect(keeper.check(stats)).toBe(false);
  });

  it('完全缺的 stats（fixture-free）→ 不放水（check 不炸）', () => {
    const keeper = ACHIEVEMENTS_POP_CULTURE.find((a) => a.id === 'echo-keeper');
    expect(keeper.check({})).toBe(false);
  });

  it('zh/en 双表 ach_echo_keeper_title / desc 都存在', () => {
    expect(typeof STRINGS_ZH.ach_echo_keeper_title).toBe('string');
    expect(typeof STRINGS_ZH.ach_echo_keeper_desc).toBe('string');
    expect(typeof STRINGS_EN.ach_echo_keeper_title).toBe('string');
    expect(typeof STRINGS_EN.ach_echo_keeper_desc).toBe('string');
    expect(STRINGS_ZH.ach_echo_keeper_desc.length).toBeGreaterThan(0);
    expect(STRINGS_EN.ach_echo_keeper_desc.length).toBeGreaterThan(0);
  });
});
