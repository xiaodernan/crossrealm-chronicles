/**
 * 成就系统门禁 —— 钉 `game/AchievementSystem.js` 的**事件→统计→解锁**链。
 *
 * 通过真实 EventBus（原生 window 事件）驱动。几条"写错不抛、只静默算错/重复解锁"的不变量：
 * - **假人不计击杀**（训练木桩不算战绩，与 CombatSessionStats 同规则）。
 * - Boss 旗标按 bossId 置位（shadow-warden→boss1 等）。
 * - 达到阈值即解锁；**已解锁的不再重复解锁**（不重复 toast / 广播）。
 * - 解锁副作用：toast、`stats.onAchievementUnlocked`、广播 `achievement-unlocked`。
 * - `spell-cast` 只对 charged 计蓄力；`journal-entry` 的 fragment 才计碎片。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { AchievementSystem } from '../src/game/AchievementSystem.js';

let dialog, game, sys, unlockedEvents, capture;

beforeEach(() => {
  unlockedEvents = [];
  capture = (e) => { unlockedEvents.push(e.detail); };
  globalThis.window.addEventListener('achievement-unlocked', capture);
  dialog = { toast: vi.fn() };
  game = { stats: { onAchievementUnlocked: vi.fn() } };
  sys = new AchievementSystem(dialog);
  sys.game = game; // 构造只收 dialog；解锁时读 this.game.stats
});
afterEach(() => {
  sys?.dispose();
  globalThis.window.removeEventListener('achievement-unlocked', capture);
  sys = null;
});

describe('AchievementSystem 假人不计击杀 + 首杀解锁', () => {
  it('dummy 不加击杀；普通击杀达 1 → first-blood 解锁', () => {
    emit('enemy-defeated', { type: 'dummy' });
    expect(sys.stats.kills).toBe(0);
    expect(sys.unlocked.has('first-blood')).toBe(false);

    emit('enemy-defeated', { type: 'normal' });
    expect(sys.stats.kills).toBe(1);
    expect(sys.unlocked.has('first-blood')).toBe(true);
  });
});

describe('AchievementSystem Boss 旗标', () => {
  it('按 bossId 置对应旗标', () => {
    emit('enemy-defeated', { type: 'normal', bossId: 'shadow-warden' });
    expect(sys.stats.boss1).toBe(true);
    emit('enemy-defeated', { type: 'normal', bossId: 'chaos-overlord' });
    expect(sys.stats.chaosBoss).toBe(true);
  });
});

describe('AchievementSystem 阈值解锁 + 幂等 + 副作用', () => {
  it('弹反满 5 才解锁 parry-master；解锁副作用齐全且只一次', () => {
    for (let i = 0; i < 4; i += 1) emit('parry-success');
    expect(sys.unlocked.has('parry-master')).toBe(false);
    emit('parry-success'); // 第 5 次
    expect(sys.unlocked.has('parry-master')).toBe(true);
    expect(dialog.toast).toHaveBeenCalled();
    expect(game.stats.onAchievementUnlocked).toHaveBeenCalledWith('parry-master');
    expect(unlockedEvents.filter((a) => a.id === 'parry-master')).toHaveLength(1);

    emit('parry-success'); // 第 6 次：已解锁，不再重复
    expect(unlockedEvents.filter((a) => a.id === 'parry-master')).toHaveLength(1);
  });
});

describe('AchievementSystem 事件计数细节', () => {
  it('spell-cast 只对 charged 计蓄力', () => {
    emit('spell-cast', { charged: true });
    emit('spell-cast', { charged: false });
    expect(sys.stats.charged).toBe(1);
  });

  it('journal-entry：fragment 才计碎片，但每次计日志条目', () => {
    emit('journal-entry', { category: 'fragment' });
    emit('journal-entry', { category: 'other' });
    expect(sys.stats.loreFragments).toBe(1);
    expect(sys.stats.journalEntries).toBe(2);
  });
});

describe('AchievementSystem 存档', () => {
  it('toJSON/fromJSON 存读 unlocked 与 stats', () => {
    emit('enemy-defeated', { type: 'normal' }); // kills 1, first-blood 解锁
    // toJSON 返回的 stats 是**活引用**（不是快照），真存档靠 JSON.stringify 立即定格；
    // 这里也走一次 JSON 往返取真快照，避免后续改 sys.stats 反污染 json.stats。
    const json = JSON.parse(JSON.stringify(sys.toJSON()));
    expect(json.unlocked).toContain('first-blood');
    expect(json.stats.kills).toBe(1);

    sys.unlocked = new Set();
    sys.stats.kills = 0;
    sys.fromJSON(json);
    expect(sys.unlocked.has('first-blood')).toBe(true);
    expect(sys.stats.kills).toBe(1);
    sys.fromJSON(null); // 空档 → 安全 no-op
    expect(sys.stats.kills).toBe(1);
  });
});
