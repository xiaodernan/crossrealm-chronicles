/**
 * SoulStreakSystem（连杀魂火）逻辑门禁 —— 此前零专门测试。
 *
 * 关键不变量：
 *  ① dummy 靶子不计入连杀（与 AchievementSystem 的 dummy 守卫同一口径）；
 *  ② 连杀 ≥3 才开始给魂，bonus = min(streak, 8) 封顶；
 *  ③ 4.5 秒窗口内续杀则续期，超时归零；
 *  ④ 死亡清空当前 streak 但不动历史最佳；
 *  ⑤ best 只增不减、存档往返幂等；
 *  ⑥ 事件 detail 带 { streak, bonus }，走真 window 事件（EventBus bridge）。
 *
 * 变异判据：把 dummy 守卫去掉 / bonus 封顶去掉 / 死亡不清零 / best 回退，
 * 各自对应的用例必须变红。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SoulStreakSystem } from '../src/game/SoulStreakSystem.js';
import { installWindowShim } from './helpers/enemyHarness.js';

let restoreShim;
const game = () => ({
  stats: { addSouls: vi.fn() },
  dialog: { toast: vi.fn() },
});
const defeated = (type) => window.dispatchEvent(new CustomEvent('enemy-defeated', {
  detail: type ? { type } : {},
}));

beforeEach(() => {
  restoreShim = installWindowShim();
  window.addEventListener('enemy-defeated', () => {}, { once: true }); // 确保事件通道存在
});
afterEach(() => {
  window.dispatchEvent(new CustomEvent('player-respawn', {})); // 触发各系统自清
  restoreShim?.();
});

describe('SoulStreakSystem —— 连杀魂火', () => {
  it('开局 streak/timer/best 全 0', () => {
    const s = new SoulStreakSystem(game());
    expect(s.streak).toBe(0);
    expect(s.timer).toBe(0);
    expect(s.best).toBe(0);
  });

  it('dummy 靶子不计连杀、不给魂、不派事件', () => {
    const g = game();
    const s = new SoulStreakSystem(g);
    const seen = [];
    const h = (e) => seen.push(e.detail);
    window.addEventListener('soul-streak', h);
    for (let i = 0; i < 5; i++) defeated('dummy');
    window.removeEventListener('soul-streak', h);
    expect(s.streak).toBe(0);
    expect(g.stats.addSouls).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('两杀只累计不给魂；第三杀开始给 bonus=3 并派事件', () => {
    const g = game();
    const s = new SoulStreakSystem(g);
    const seen = [];
    const h = (e) => seen.push(e.detail);
    window.addEventListener('soul-streak', h);
    defeated(); defeated();
    expect(s.streak).toBe(2);
    expect(g.stats.addSouls).not.toHaveBeenCalled();
    defeated();
    expect(g.stats.addSouls).toHaveBeenCalledWith(3);
    expect(seen).toEqual([{ streak: 3, bonus: 3 }]);
    expect(s.best).toBe(3);
    window.removeEventListener('soul-streak', h);
  });

  it('bonus 随 streak 增长但封顶 8', () => {
    const g = game();
    const s = new SoulStreakSystem(g);
    for (let i = 0; i < 12; i++) defeated();
    const vals = g.stats.addSouls.mock.calls.map((c) => c[0]);
    expect(vals).toEqual([3, 4, 5, 6, 7, 8, 8, 8, 8, 8]);
    expect(s.best).toBe(12);
  });

  it('窗口内续杀：timer 重置为 4.5，streak 不丢', () => {
    const s = new SoulStreakSystem(game());
    defeated();
    s.update(2.0);
    expect(s.timer).toBe(2.5);
    defeated();
    expect(s.streak).toBe(2);
    expect(s.timer).toBe(4.5);
  });

  it('窗口超时：streak 归零；再杀从 1 重新起算', () => {
    const g = game();
    const s = new SoulStreakSystem(g);
    defeated(); defeated();
    s.update(4.5);
    expect(s.streak).toBe(0);
    expect(s.best).toBe(2); // 历史最佳不动
    defeated();
    expect(s.streak).toBe(1);
    expect(g.stats.addSouls).not.toHaveBeenCalled();
  });

  it('死亡清空当前 streak 与 timer，但保留 best', () => {
    const s = new SoulStreakSystem(game());
    for (let i = 0; i < 4; i++) defeated();
    expect(s.streak).toBe(4);
    window.dispatchEvent(new CustomEvent('player-respawn'));
    expect(s.streak).toBe(0);
    expect(s.timer).toBe(0);
    expect(s.best).toBe(4);
  });

  it('fromJSON 是快照恢复：热读另一个槽会接受该档自己的 best（可更小）', () => {
    const s = new SoulStreakSystem(game());
    s.fromJSON({ best: 9 });
    expect(s.best).toBe(9);
    s.fromJSON({ best: 3 });
    expect(s.best).toBe(3); // 读新档就按新档走，不被当前会话的高值挡住
    defeated(); defeated();
    expect(s.best).toBe(3);
  });

  it('toJSON 只存 best，往返幂等', () => {
    const s = new SoulStreakSystem(game());
    for (let i = 0; i < 6; i++) defeated();
    const json = JSON.parse(JSON.stringify(s.toJSON()));
    expect(json).toEqual({ best: 6 });
    const s2 = new SoulStreakSystem(game());
    s2.fromJSON(json);
    expect(s2.best).toBe(6);
    expect(s2.streak).toBe(0); // 当前连杀不随存档恢复
  });

  it('坏存档 best 非法值不污染运行时 best', () => {
    const s = new SoulStreakSystem(game());
    s.fromJSON({ best: -7 });
    expect(s.best).toBe(0); // ← 守卫：负数不能当最佳
    s.fromJSON({ best: 'abc' });
    expect(s.best).toBe(0);
    s.fromJSON({ best: NaN });
    expect(s.best).toBe(0);
    defeated();
    expect(s.best).toBe(1);
  });
});
