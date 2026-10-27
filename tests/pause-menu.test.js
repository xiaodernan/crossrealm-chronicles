/**
 * 暂停菜单门禁 —— 钉 `ui/PauseMenu.js` 的**槽位回落 / 时刻格式 / 暂停开关**。
 *
 * 纯 DOM 耦合、此前零直接测试。`FocusNav` 与 `SaveSystem` mock 成轻量桩，聚焦逻辑：
 * - **selectedSlot 回落**：选择器不在或值非法（NaN / 负数 / 非整数）→ 槽 0
 *   （"面板坏了不能连保存一起坏"）。
 * - **时刻格式**：数字时间戳 → `M/D HH:MM`（月日不补零、时分补零）；非数字 → '?'。
 * - **show/hide/toggle**：`open` 与 `game.paused` 同步翻转。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/ui/FocusNav.js', () => ({ focusFirstItem: vi.fn(), parkFocus: vi.fn() }));
vi.mock('../src/game/SaveSystem.js', () => ({
  SaveSystem: {
    listSlots: vi.fn(() => []),
    save: vi.fn(), load: vi.fn(), exportFile: vi.fn(), importFile: vi.fn(),
  },
}));

const { PauseMenu } = await import('../src/ui/PauseMenu.js');

let realDoc, slotSelect, game, menu;

beforeEach(() => {
  slotSelect = { value: '0', textContent: '', options: [], appendChild: vi.fn() };
  game = { paused: false, settingsPanel: { show: vi.fn() } };
  realDoc = globalThis.document;
  globalThis.document = {
    getElementById: vi.fn((id) => (id === 'pause-slot' ? slotSelect : null)),
    createElement: vi.fn(() => ({ value: '', textContent: '' })),
    exitPointerLock: vi.fn(),
  };
  menu = new PauseMenu(game);
});

afterEach(() => { globalThis.document = realDoc; });

describe('PauseMenu.selectedSlot 回落', () => {
  it('合法整数 → 原值', () => {
    slotSelect.value = '2';
    expect(menu.selectedSlot()).toBe(2);
    slotSelect.value = '0';
    expect(menu.selectedSlot()).toBe(0);
  });

  it('非法值（NaN / 负数 / 非整数）→ 槽 0', () => {
    slotSelect.value = 'x';
    expect(menu.selectedSlot()).toBe(0);
    slotSelect.value = '-1';
    expect(menu.selectedSlot()).toBe(0);
    slotSelect.value = '1.5';
    expect(menu.selectedSlot()).toBe(0);
  });
});

describe('PauseMenu.时刻 格式', () => {
  it('数字时间戳 → M/D HH:MM（时分补零）', () => {
    const ts = new Date(2026, 0, 15, 9, 5).getTime();
    expect(menu.时刻(ts)).toBe('1/15 09:05');
  });

  it('非数字 → ?', () => {
    expect(menu.时刻('x')).toBe('?');
    expect(menu.时刻(undefined)).toBe('?');
    expect(menu.时刻(null)).toBe('?');
  });
});

describe('PauseMenu show / hide / toggle', () => {
  it('show 置 open + paused；hide 撤销；toggle 两向', () => {
    menu.show();
    expect(menu.open).toBe(true);
    expect(game.paused).toBe(true);
    menu.hide();
    expect(menu.open).toBe(false);
    expect(game.paused).toBe(false);
    menu.toggle(); // 关 → 开
    expect(menu.open).toBe(true);
    menu.toggle(); // 开 → 关
    expect(menu.open).toBe(false);
    expect(game.paused).toBe(false);
  });
});
