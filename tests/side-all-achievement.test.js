/**
 * 环游诸界成就门禁（W-Z21）— 完成全部支线也该住进成就墙
 *
 * 支线系统的 `getProgress()` 早就有「已完成 / 总数」这一格（SideQuestSystem 唯一一份名单），
 * 但成就系统对支线一无所知：玩家把支线一个一个做完，成就页上永远看不到那枚。
 * 更傲慢的是：成就自己记的 `stats` 里没有任何一格数支线的个数。
 *
 * 这一片的判据：
 * 1. `side-quest-complete` 事件每发一次，`stats.sideQuests` +1（与 SideQuestSystem 的广播对齐）
 * 2. 只有数到侧轨名单总长（`SIDE_QUESTS_ALL.length` 现算，不另抄一份）那一刻才解锁 side-all
 * 3. 挂载（extras attach）那一刻按 `game.sideQuests.completed` 回填老存档——
 *    只补不改：只在读数低于实际值时才往上对齐，早已达成的成就直接追认
 * 4. `toJSON/fromJSON` 往返保留这格（否则读档后成就统计回退）
 * 5. 名册与双表对齐：title/desc 中文英文都在、两张文案表键数一致
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { AchievementSystem, ACHIEVEMENTS } from '../src/game/AchievementSystem.js';
import { attachAchievementExtras } from '../src/game/AchievementSystemExtras.js';
import { SIDE_QUESTS_ALL } from '../src/content/sideQuests.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

let sys;
let extras;
let onUnlocked;

const SIDE_ALL_ID = 'side-all';

beforeEach(() => {
  onUnlocked = vi.fn();
  sys = new AchievementSystem({ toast: vi.fn() });
  sys.game = { stats: { onAchievementUnlocked: onUnlocked } };
});

afterEach(() => {
  extras?.dispose?.();
  extras = null;
  sys?.dispose();
  sys = null;
});

describe('环游诸界成就（W-Z21）', () => {
  it('事件逐条进账：57 次不放水，第 58 次当场解锁', () => {
    extras = attachAchievementExtras(sys);
    for (let i = 0; i < SIDE_QUESTS_ALL.length - 1; i++) emit('side-quest-complete');
    expect(sys.stats.sideQuests).toBe(SIDE_QUESTS_ALL.length - 1);
    expect(sys.unlocked.has(SIDE_ALL_ID)).toBe(false);

    emit('side-quest-complete');
    expect(sys.stats.sideQuests).toBe(SIDE_QUESTS_ALL.length);
    expect(sys.unlocked.has(SIDE_ALL_ID)).toBe(true);
    expect(onUnlocked).toHaveBeenCalledWith(SIDE_ALL_ID);
  });

  it('回填：老存档的支线完成集在挂载那一刻被补齐，成就直接追认', () => {
    const fakeCompleted = new Set(SIDE_QUESTS_ALL.map((q) => q.id));
    sys.game = {
      stats: { onAchievementUnlocked: onUnlocked },
      sideQuests: { completed: fakeCompleted },
    };
    extras = attachAchievementExtras(sys);
    expect(sys.stats.sideQuests).toBe(SIDE_QUESTS_ALL.length);
    expect(sys.unlocked.has(SIDE_ALL_ID)).toBe(true);
  });

  it('回填不下调：存档自带更高的计数不被覆盖', () => {
    sys.game = {
      stats: { onAchievementUnlocked: onUnlocked },
      sideQuests: { completed: new Set(SIDE_QUESTS_ALL.slice(0, 2).map((q) => q.id)) },
    };
    sys.stats.sideQuests = 99;
    extras = attachAchievementExtras(sys);
    expect(sys.stats.sideQuests).toBe(99);
  });

  it('没有 sideQuests 的 game（半截对象 / 单测桩）也不抛', () => {
    sys.game = { stats: { onAchievementUnlocked: vi.fn() } };
    expect(() => { extras = attachAchievementExtras(sys); }).not.toThrow();
    expect(sys.stats.sideQuests).toBe(0);
  });

  it('存档往返保留这格与已解锁记录', () => {
    sys.game = { stats: { onAchievementUnlocked: onUnlocked } };
    extras = attachAchievementExtras(sys);
    for (let i = 0; i < SIDE_QUESTS_ALL.length; i++) emit('side-quest-complete');

    const json = JSON.parse(JSON.stringify(sys.toJSON()));
    expect(json.stats.sideQuests).toBe(SIDE_QUESTS_ALL.length);
    expect(json.unlocked).toContain(SIDE_ALL_ID);

    sys.unlocked = new Set();
    sys.stats.sideQuests = 0;
    sys.fromJSON(json);
    expect(sys.stats.sideQuests).toBe(SIDE_QUESTS_ALL.length);
    expect(sys.unlocked.has(SIDE_ALL_ID)).toBe(true);
  });

  it('名册与双表对齐：check 函数、中文英文键都在、描述不是空串', () => {
    const row = ACHIEVEMENTS.find((a) => a.id === SIDE_ALL_ID);
    expect(row, 'side-all 没有进成就名册').toBeTruthy();
    expect(typeof row.check).toBe('function');
    expect(row.check({ sideQuests: SIDE_QUESTS_ALL.length })).toBe(true);
    expect(row.check({ sideQuests: SIDE_QUESTS_ALL.length - 1 })).toBe(false);
    for (const [lang, table] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
      expect(typeof table[row.title], lang + ' 表没有 ' + row.title).toBe('string');
      expect(typeof table[row.desc], lang + ' 表没有 ' + row.desc).toBe('string');
      expect(table[row.desc].length).toBeGreaterThan(0);
    }
  });
});
