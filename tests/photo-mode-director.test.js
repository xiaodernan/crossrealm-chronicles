/**
 * 拍照模式门禁 —— 钉 `cinematic/PhotoModeDirector.js`。
 *
 * 纯 DOM 耦合（`document`/`window`），此前零直接测试。三条"写错不抛、只静默漏隐藏/漏广播"的不变量：
 * - **开/关两向都要切对**：active 时 HUD/日志面板挂 `photo-hidden`、提示条去掉 `hidden`；
 *   退出时全部还原。漏一处 → 截图里混进 HUD，或退出后 HUD 永远不见。
 * - **`photo-mode-changed` 事件带的是"新"状态**（`detail.active`），两向各一次。
 * - toast：开 → `photo_toast_hidden`（2200ms）、关 → `photo_toast_exit`；active 时退出指针锁。
 * - `update`：active 才把缩放归零，非 active 不碰。
 *
 * 用 `stubDoc`/classList 夹具（沿用 `rumble.test.js` 的做法），不引真 DOM。
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t } from '../src/engine/i18n.js';
import { PhotoModeDirector } from '../src/cinematic/PhotoModeDirector.js';

function makeClassList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    _set: set,
  };
}
function makeEl() {
  return { id: '', className: '', textContent: '', classList: makeClassList() };
}

let realDoc, realWin;
let created, hudEl, journalEl, dispatched, game;

beforeEach(() => {
  created = makeEl();
  hudEl = makeEl();
  journalEl = makeEl();
  dispatched = [];
  game = { dialog: { toast: vi.fn() }, player: { adjustZoom: vi.fn() } };

  realDoc = globalThis.document;
  realWin = globalThis.window;
  globalThis.document = {
    createElement: vi.fn(() => created),
    body: { appendChild: vi.fn() },
    getElementById: vi.fn((id) => (id === 'hud' ? hudEl : id === 'journal-panel' ? journalEl : null)),
    exitPointerLock: vi.fn(),
  };
  globalThis.window = {
    dispatchEvent: vi.fn((e) => { dispatched.push(e); return true; }),
  };
});

afterEach(() => {
  globalThis.document = realDoc;
  globalThis.window = realWin;
});

describe('PhotoModeDirector 构造', () => {
  it('建提示条、挂 body、初始未激活', () => {
    const pm = new PhotoModeDirector(game);
    expect(globalThis.document.createElement).toHaveBeenCalledWith('div');
    expect(globalThis.document.body.appendChild).toHaveBeenCalledWith(created);
    expect(created.id).toBe('photo-mode-hint');
    expect(pm.active).toBe(false);
  });
});

describe('PhotoModeDirector toggle 开/关两向', () => {
  it('开启：HUD/日志挂 photo-hidden、提示条去掉 hidden、toast 2200、退出指针锁', () => {
    const pm = new PhotoModeDirector(game);
    pm.toggle();
    expect(pm.active).toBe(true);
    expect(hudEl.classList.contains('photo-hidden')).toBe(true);
    expect(journalEl.classList.contains('photo-hidden')).toBe(true);
    expect(created.classList.contains('hidden')).toBe(false);
    expect(game.dialog.toast).toHaveBeenCalledWith(t('photo_toast_hidden'), 2200);
    expect(globalThis.document.exitPointerLock).toHaveBeenCalled();
  });

  it('关闭：全部还原、提示条加 hidden、toast 退出', () => {
    const pm = new PhotoModeDirector(game);
    pm.toggle(); // on
    pm.toggle(); // off
    expect(pm.active).toBe(false);
    expect(hudEl.classList.contains('photo-hidden')).toBe(false);
    expect(journalEl.classList.contains('photo-hidden')).toBe(false);
    expect(created.classList.contains('hidden')).toBe(true);
    expect(game.dialog.toast).toHaveBeenLastCalledWith(t('photo_toast_exit'));
  });

  it('每次 toggle 都广播 photo-mode-changed，且 detail.active 是新状态', () => {
    const pm = new PhotoModeDirector(game);
    pm.toggle(); // on
    pm.toggle(); // off
    expect(dispatched).toHaveLength(2);
    expect(dispatched[0].type).toBe('photo-mode-changed');
    expect(dispatched[0].detail.active).toBe(true);
    expect(dispatched[1].detail.active).toBe(false);
  });

  it('HUD/日志不在场也不抛（可选链）', () => {
    globalThis.document.getElementById = vi.fn(() => null);
    const pm = new PhotoModeDirector(game);
    expect(() => pm.toggle()).not.toThrow();
    expect(pm.active).toBe(true);
  });
});

describe('PhotoModeDirector update', () => {
  it('active 才把缩放归零；非 active 不碰 player', () => {
    const pm = new PhotoModeDirector(game);
    pm.update(0.016);
    expect(game.player.adjustZoom).not.toHaveBeenCalled();
    pm.toggle(); // on
    pm.update(0.016);
    expect(game.player.adjustZoom).toHaveBeenCalledWith(0);
  });
});
