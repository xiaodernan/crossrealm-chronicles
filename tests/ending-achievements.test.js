/**
 * 终局成就门禁（W-E3 切片49）—— 成就墙也得记住玩家最后怎么选。
 *
 * 切片46/48 把 `game-completed` 那一刻的正文与片尾字幕按抉择分了岔，但成就系统
 * 对终局一无所知：玩家通关后打开成就墙，两条结局一条也不在里面。更糟的是
 * 「选择」只活在 `quests.stats.decisions`，成就自己的 `stats` 不落那两格，
 * 读档后成就系统无从复核。
 *
 * 这一片的判据：
 * 1. 只有 `game-completed` 那一刻读抉择 —— 玩家刚点按钮还没走到石阶/熄火环时，
 *    不能提前发「留灯的人 / 熄灯的人」。
 * 2. 留灯与熄灯各解锁各的，不互相顶替。
 * 3. 没有终局抉择的老档 / 跳关档：一枚都不解锁，也不假装。
 * 4. 幂等：同一条事件再来一次不重复 toast / 广播。
 * 5. `toJSON/fromJSON` 往返保留两格旗标（否则读档后成就统计回退）。
 * 6. 文案键双表都存在，且两条描述不是同一句。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { AchievementSystem, ACHIEVEMENTS } from '../src/game/AchievementSystem.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';

let sys;
let onUnlocked;

const 装 = (decisions) => {
  onUnlocked = vi.fn();
  sys = new AchievementSystem({ toast: vi.fn() });
  sys.game = {
    stats: { onAchievementUnlocked: onUnlocked },
    quests: { stats: { decisions } },
  };
};

beforeEach(() => { sys = null; });
afterEach(() => { sys?.dispose(); sys = null; });

describe('终局成就（W-E3 切片49）', () => {
  it('留灯：通关那一刻只解锁 ending-keep', () => {
    装(new Set(['choice_final_keep']));
    emit('game-completed');
    expect(sys.stats.endingKeep).toBe(true);
    expect(sys.stats.endingQuiet).toBe(false);
    expect(sys.unlocked.has('ending-keep')).toBe(true);
    expect(sys.unlocked.has('ending-quiet')).toBe(false);
    expect(onUnlocked).toHaveBeenCalledWith('ending-keep');
  });

  it('熄灯：通关那一刻只解锁 ending-quiet', () => {
    装(new Set(['choice_final_quiet']));
    emit('game-completed');
    expect(sys.stats.endingKeep).toBe(false);
    expect(sys.stats.endingQuiet).toBe(true);
    expect(sys.unlocked.has('ending-keep')).toBe(false);
    expect(sys.unlocked.has('ending-quiet')).toBe(true);
    expect(onUnlocked).toHaveBeenCalledWith('ending-quiet');
  });

  it('老档 / 跳关档没有终局抉择：两枚都不解锁', () => {
    装(new Set());
    emit('game-completed');
    expect(sys.stats.endingKeep).toBe(false);
    expect(sys.stats.endingQuiet).toBe(false);
    expect(sys.unlocked.has('ending-keep')).toBe(false);
    expect(sys.unlocked.has('ending-quiet')).toBe(false);
  });

  it('缺 stats 也不抛，且不发奖（防读档半截对象）', () => {
    sys = new AchievementSystem({ toast: vi.fn() });
    sys.game = { stats: { onAchievementUnlocked: vi.fn() }, quests: {} };
    expect(() => emit('game-completed')).not.toThrow();
    expect(sys.unlocked.has('ending-keep')).toBe(false);
  });

  it('幂等：同一条 game-completed 再来一次不重复广播', () => {
    const events = [];
    const capture = (e) => events.push(e.detail.id);
    globalThis.window.addEventListener('achievement-unlocked', capture);
    装(new Set(['choice_final_keep']));
    emit('game-completed');
    emit('game-completed');
    globalThis.window.removeEventListener('achievement-unlocked', capture);
    expect(events.filter((id) => id === 'ending-keep')).toHaveLength(1);
  });

  it('存档往返保留两格旗标与已解锁记录', () => {
    装(new Set(['choice_final_quiet']));
    emit('game-completed');
    const json = JSON.parse(JSON.stringify(sys.toJSON()));
    expect(json.stats.endingQuiet).toBe(true);
    expect(json.unlocked).toContain('ending-quiet');

    sys.unlocked = new Set();
    sys.stats.endingQuiet = false;
    sys.fromJSON(json);
    expect(sys.stats.endingQuiet).toBe(true);
    expect(sys.unlocked.has('ending-quiet')).toBe(true);
  });

  it('名册与双表对齐：两条都有 check 函数、两语文案都在、描述不重复', () => {
    const 行 = ACHIEVEMENTS.filter((a) => a.id === 'ending-keep' || a.id === 'ending-quiet');
    expect(行.map((a) => a.id)).toEqual(['ending-keep', 'ending-quiet']);
    for (const a of 行) {
      expect(typeof a.check, a.id + ' 没有判据').toBe('function');
      for (const [名, 表] of [['zh', STRINGS_ZH], ['en', STRINGS_EN]]) {
        expect(表[a.title], 名 + ' 表里没有 ' + a.title).toBeTypeOf('string');
        expect(表[a.desc], 名 + ' 表里没有 ' + a.desc).toBeTypeOf('string');
      }
    }
    expect(STRINGS_ZH[行[0].desc]).not.toBe(STRINGS_ZH[行[1].desc]);
    expect(STRINGS_EN[行[0].desc]).not.toBe(STRINGS_EN[行[1].desc]);
  });
});
