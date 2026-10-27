/**
 * 本局战斗统计门禁 —— 钉 `ui/CombatSessionStats.js`。
 *
 * 通过真实 `EventBus` 驱动（事件名/载荷是契约的一部分）。几条"写错不抛、只静默算错"的不变量：
 * - **假人不计数**：`enemy-defeated` 里 `type === 'dummy'` 不加击杀（训练木桩不该算战绩）。
 * - 弹反 / 终结 / 处决各自 +1；**player-respawn 清零全部**。
 * - `toggle` 切可见性（classList 'hidden' 反向）；**不可见时 refresh 不写 DOM**。
 * - 可见时 refresh 渲染击杀/弹反/终结/处决 + 风格 + 连杀最佳。
 *
 * EventBus 监听在构造期注册，`afterEach` 用 `dispose()` 结清。
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { CombatSessionStats } from '../src/ui/CombatSessionStats.js';

function makeClassList() {
  const s = new Set();
  return {
    add: (c) => s.add(c),
    remove: (c) => s.delete(c),
    contains: (c) => s.has(c),
    toggle: (c, on) => { if (on) s.add(c); else s.delete(c); },
  };
}

let realDoc, el, game, stats;

beforeEach(() => {
  el = { id: '', className: '', innerHTML: '', classList: makeClassList() };
  game = {
    combatStyle: { getRank: () => ({ label: 'S' }) },
    soulStreak: { best: 5 },
  };
  realDoc = globalThis.document;
  globalThis.document = {
    createElement: vi.fn(() => el),
    body: { appendChild: vi.fn() },
  };
  stats = new CombatSessionStats(game);
});

afterEach(() => {
  stats?.dispose();
  stats = null;
  globalThis.document = realDoc;
});

describe('CombatSessionStats 计数', () => {
  it('假人（dummy）不计击杀；普通敌人计', () => {
    emit('enemy-defeated', { type: 'dummy' });
    expect(stats.kills).toBe(0);
    emit('enemy-defeated', { type: 'normal' });
    expect(stats.kills).toBe(1);
  });

  it('弹反 / 终结 / 处决各 +1', () => {
    emit('parry-success');
    emit('combo-finisher');
    emit('combat-execution');
    expect(stats.parries).toBe(1);
    expect(stats.finishers).toBe(1);
    expect(stats.executions).toBe(1);
  });

  it('player-respawn 清零全部计数', () => {
    emit('enemy-defeated', { type: 'normal' });
    emit('parry-success');
    emit('combo-finisher');
    emit('combat-execution');
    emit('player-respawn');
    expect(stats.kills).toBe(0);
    expect(stats.parries).toBe(0);
    expect(stats.finishers).toBe(0);
    expect(stats.executions).toBe(0);
  });
});

describe('CombatSessionStats 显隐与渲染', () => {
  it('toggle 切可见性（hidden 反向）', () => {
    expect(stats.visible).toBe(false);
    stats.toggle();
    expect(stats.visible).toBe(true);
    expect(el.classList.contains('hidden')).toBe(false);
    stats.toggle();
    expect(stats.visible).toBe(false);
    expect(el.classList.contains('hidden')).toBe(true);
  });

  it('不可见时 refresh 不写 DOM；可见时渲染计数与风格/连杀', () => {
    emit('enemy-defeated', { type: 'normal' }); // 不可见 → 不写 innerHTML
    expect(el.innerHTML).toBe('');
    stats.toggle(); // 可见 → refresh 写
    expect(el.innerHTML).toContain('击杀 1');
    expect(el.innerHTML).toContain('风格 S');
    expect(el.innerHTML).toContain('连杀最佳 ×5');
  });
});
