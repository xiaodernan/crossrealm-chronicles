import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { PerfHUD } from '../src/engine/PerfHUD.js';

/** PerfHUD 只在可见时写 DOM；node 环境给一个够用的最小 document */
beforeAll(() => {
  const makeEl = (tag) => ({
    tag,
    style: {},
    children: [],
    innerHTML: '',
    textContent: '',
    className: '',
    appendChild(c) { this.children.push(c); return c; },
    remove() { this.removed = true; },
  });
  globalThis.document = {
    created: 0,
    createElement(tag) { this.created++; return makeEl(tag); },
    head: makeEl('head'),
    body: makeEl('body'),
  };
});

const fakeRenderer = (over = {}) => ({
  info: {
    memory: { geometries: 0, textures: 0 },
    render: { calls: 0, triangles: 0 },
    programs: [],
    ...over,
  },
});
const fakeScene = (nodes = 1) => ({
  traverse(fn) { for (let i = 0; i < nodes; i++) fn(); },
});

let hud;
beforeEach(() => { hud = new PerfHUD({ renderer: fakeRenderer(), scene: fakeScene(10) }); });

describe('PerfHUD', () => {
  it('默认隐藏且一个 DOM 节点都不建', () => {
    expect(hud.visible).toBe(false);
    hud.update(1 / 60);
    expect(document.created).toBe(0);
  });

  it('按 250ms 节流刷新，帧率取窗口平均', () => {
    hud.toggle(true);
    for (let i = 0; i < 10; i++) hud.update(1 / 60);
    expect(hud.el.innerHTML).toBe('');           // 166ms，还没到刷新点
    for (let i = 0; i < 8; i++) hud.update(1 / 60);
    expect(hud.el.innerHTML).toContain('FPS');
    expect(hud.stats().fps).toBeCloseTo(60, 0);
  });

  it('隐藏时仍然计帧，打开即有准确读数', () => {
    for (let i = 0; i < 120; i++) hud.update(1 / 30);
    hud.toggle(true);
    hud.update(1 / 30);
    expect(hud.stats().fps).toBeCloseTo(30, 0);
  });

  it('泄漏监控给出相对历史最低点的净增长', () => {
    let n = 10;
    hud.gauge('小怪', () => n, { leak: true, tolerance: 4 });
    expect(hud.stats().leaks['小怪'].growth).toBe(0);
    n = 24;
    expect(hud.stats().leaks['小怪']).toEqual({ value: 24, growth: 14 });
    n = 12;
    // 回落不清零基线：真正的判据是"是否长期高于最低点"
    expect(hud.stats().leaks['小怪'].growth).toBe(2);
  });

  it('gauge 可链式注册', () => {
    expect(hud.gauge('a', () => 1).gauge('b', () => 2)).toBe(hud);
    hud.toggle(true);
    hud.update(0.3);
    expect(hud.el.innerHTML).toContain('a: 1');
  });
});
