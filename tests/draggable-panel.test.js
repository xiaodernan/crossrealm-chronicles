// DraggablePanel 的覆盖 —— 这个 UI 交互模块此前零测试，而它的拖动逻辑有真行为值得钉住：
// ① 位置持久化（刷新后回到原位）；② 拖动跟手；③ **夹取**（面板不会被拖出视口 —— 夹错就是
// 面板拖到屏幕外再也拿不回来）；④ 点在按钮/输入框上不触发拖动（否则点"关闭"会先拖走面板）。
// 用最小假 DOM（真实 pointer 事件序列），不引入 jsdom。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { attachDraggable } from '../src/ui/DraggablePanel.js';

/** 最小假面板 + 假把手：够 attachDraggable 用（classList/style/rect/offset/pointer 捕获） */
function makePanel({ id = 'panel', rect = { left: 100, top: 100 }, w = 200, h = 150 } = {}) {
  const listeners = new Map();
  const classes = new Set();
  const on = (n, fn) => { if (!listeners.has(n)) listeners.set(n, []); listeners.get(n).push(fn); };
  const fire = (n, ev) => { for (const fn of [...(listeners.get(n) ?? [])]) fn(ev); };

  const handle = {
    title: '',
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    addEventListener: on,
  };
  const el = {
    id,
    style: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    querySelector: () => handle,
    getBoundingClientRect: () => rect,
    get offsetWidth() { return w; },
    get offsetHeight() { return h; },
    addEventListener: on,
    appendChild: () => {},
  };
  return { el, handle, fire };
}

const down = (x, y, extra = {}) => ({ button: 0, clientX: x, clientY: y, pointerId: 1, preventDefault: () => {}, target: { closest: () => null }, ...extra });
const move = (x, y) => ({ clientX: x, clientY: y, pointerId: 1 });
const up = (x, y) => ({ clientX: x, clientY: y, pointerId: 1 });

let savedStore;
beforeEach(() => {
  savedStore = globalThis.localStorage;
  const m = new Map();
  globalThis.localStorage = {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  globalThis.window.innerWidth = 1000;
  globalThis.window.innerHeight = 800;
});
afterEach(() => {
  globalThis.localStorage = savedStore;
});

describe('DraggablePanel.attachDraggable', () => {
  it('有存档时把面板放回存档位置（left/top，right/bottom 归 auto）', () => {
    localStorage.setItem('crossrealm_drag_panel', JSON.stringify({ x: 300, y: 200 }));
    const { el } = makePanel();
    attachDraggable(el);
    expect(el.style.left).toBe('300px');
    expect(el.style.top).toBe('200px');
    expect(el.style.right).toBe('auto');
    expect(el.style.bottom).toBe('auto');
  });

  it('拖动跟手：pointerdown → pointermove 的位移加到起点上', () => {
    const { el, fire } = makePanel({ rect: { left: 100, top: 100 } });
    attachDraggable(el);
    fire('pointerdown', down(150, 150));
    fire('pointermove', move(200, 180));
    expect(el.style.left).toBe('150px'); // 100 + (200-150)
    expect(el.style.top).toBe('130px');  // 100 + (180-150)
  });

  it('夹取：拖向左上不越出 4px 边距', () => {
    const { el, fire } = makePanel({ rect: { left: 100, top: 100 } });
    attachDraggable(el);
    fire('pointerdown', down(150, 150));
    fire('pointermove', move(-2000, -2000));
    expect(el.style.left).toBe('4px');
    expect(el.style.top).toBe('4px');
  });

  it('夹取：拖向右下不越出视口（innerWidth - 宽 - 4 / innerHeight - 高 - 4）', () => {
    const { el, fire } = makePanel({ rect: { left: 100, top: 100 }, w: 200, h: 150 });
    attachDraggable(el);
    fire('pointerdown', down(150, 150));
    fire('pointermove', move(9000, 9000));
    expect(el.style.left).toBe('796px'); // 1000 - 200 - 4
    expect(el.style.top).toBe('646px');  // 800 - 150 - 4
  });

  it('点在按钮上不触发拖动（否则点关闭会先拖走面板）', () => {
    const { el, fire } = makePanel({ rect: { left: 100, top: 100 } });
    attachDraggable(el);
    fire('pointerdown', down(150, 150, { target: { closest: (sel) => (sel.includes('button') ? {} : null) } }));
    fire('pointermove', move(300, 300));
    expect(el.style.left).toBeUndefined(); // 没进拖动，left 没被写
  });

  it('松手时把当前位置写进 localStorage', () => {
    const { el, fire } = makePanel({ rect: { left: 100, top: 100 } });
    attachDraggable(el);
    fire('pointerdown', down(150, 150));
    fire('pointermove', move(200, 180));
    fire('pointerup', up(200, 180));
    expect(JSON.parse(localStorage.getItem('crossrealm_drag_panel'))).toEqual({ x: 150, y: 130 });
  });
});
