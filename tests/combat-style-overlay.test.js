/**
 * 战斗风格浮层门禁 —— 钉 `ui/CombatStyleOverlay.js`。
 *
 * 通过真实 `EventBus` 驱动（事件名/载荷是契约的一部分）。几条"写错不抛、只静默错显/错隐"的不变量：
 * - **无标签且分数≤0 → 直接隐藏**（空档不该占屏），且不再更新 rank/label。
 * - 有标签 → rank/color 落位、label 走文案键 `t(label)` 再套 `combat_style_score_fmt`；
 *   只有分数无标签 → 只显示分数本身。
 * - 显示后 `hideTimer=2.2`；`update` 倒计时归零且**没有锁定目标**才隐藏
 *   （锁着目标时风格条要留着，方便玩家看连段评级）。
 *
 * EventBus 监听在构造期注册，`afterEach` 用 `dispose()` 结清。
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emit } from '../src/engine/EventBus.js';
import { t } from '../src/engine/i18n.js';
import { CombatStyleOverlay } from '../src/ui/CombatStyleOverlay.js';

function makeClassList() {
  const s = new Set();
  return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) };
}

let realDoc, el, rankEl, labelEl, game, overlay;

beforeEach(() => {
  rankEl = { textContent: '', style: {} };
  labelEl = { textContent: '' };
  el = {
    id: '', className: '', innerHTML: '',
    classList: makeClassList(),
    querySelector: vi.fn((sel) => (sel === '.css-rank' ? rankEl : sel === '.css-label' ? labelEl : null)),
  };
  game = { player: { combat: { lockedTarget: null } } };
  realDoc = globalThis.document;
  globalThis.document = { createElement: vi.fn(() => el), body: { appendChild: vi.fn() } };
  overlay = new CombatStyleOverlay(game);
});

afterEach(() => {
  overlay?.dispose();
  overlay = null;
  globalThis.document = realDoc;
});

describe('CombatStyleOverlay 事件驱动显隐', () => {
  it('无标签且分数≤0 → 隐藏，且不更新 rank/label', () => {
    emit('combat-style-changed', { rank: 'S', label: null, score: 0 });
    expect(el.classList.contains('hidden')).toBe(true);
    expect(rankEl.textContent).toBe(''); // 早退，没写
  });

  it('有标签 → rank/color 落位、label 套分数格式', () => {
    emit('combat-style-changed', { rank: 'S', color: '#f00', label: 'style_key', score: 100 });
    expect(rankEl.textContent).toBe('S');
    expect(rankEl.style.color).toBe('#f00');
    expect(labelEl.textContent).toBe(t('combat_style_score_fmt', { label: t('style_key'), score: 100 }));
    expect(el.classList.contains('hidden')).toBe(false);
    expect(overlay.hideTimer).toBe(2.2);
  });

  it('只有分数无标签 → 只显示分数本身，rank 回落 —', () => {
    emit('combat-style-changed', { score: 50 });
    expect(rankEl.textContent).toBe('—');
    expect(labelEl.textContent).toBe('50');
    expect(el.classList.contains('hidden')).toBe(false);
  });
});

describe('CombatStyleOverlay update 倒计时', () => {
  it('倒计时归零且无锁定目标 → 隐藏', () => {
    emit('combat-style-changed', { rank: 'A', label: 'style_key', score: 10 }); // hideTimer=2.2
    overlay.update(2.2);
    expect(overlay.hideTimer).toBeLessThanOrEqual(0);
    expect(el.classList.contains('hidden')).toBe(true);
  });

  it('倒计时归零但锁定目标仍在 → 不隐藏', () => {
    game.player.combat.lockedTarget = { id: 'boss' };
    emit('combat-style-changed', { rank: 'A', label: 'style_key', score: 10 });
    overlay.update(2.2);
    expect(overlay.hideTimer).toBeLessThanOrEqual(0);
    expect(el.classList.contains('hidden')).toBe(false); // 锁目标时留着
  });
});
