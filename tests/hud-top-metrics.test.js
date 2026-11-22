/**
 * HUD 顶栏高度 → `--hud-top-h` 的门禁（2026-11-22 桌面档重叠）。
 *
 * ## 修的是什么
 * `.quest-panel` 的 `top` 曾写死 `90px`，等于假设"顶栏永远一行"。1280×800 + en 大档下
 * `.hud-stats` 换到第二行，顶栏底 117.4px，任务面板被压进 27.4px —— 这是
 * `npm run walkthrough:ui` 扩到桌面视口后**第一次跑就红**的那一格。
 *
 * ## 这一层测什么、不测什么
 * 真布局由走查（真浏览器）负责；这里钉住三件在 jsdom 里也能钉的事：
 *   ① CSS 的 `top` 必须问 `var(--hud-top-h)`，不许再写死像素；
 *   ② 量到有限高度就写变量、量不到（0 / 非有限）就不写，同值不重写；
 *   ③ `dispose()` 必须断开观察者（否则销毁后的 HUD 还在被布局回调戳）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { offAll } from '../src/engine/EventBus.js';
import { HUD } from '../src/ui/HUD.js';

const HUD_TAG = 'ui/HUD';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function bootDoc() {
  const doc = makeMarkupDom();
  const html = node('html', doc);
  html.style.setProperty = (name, value) => { html.style[name] = value; };
  html.appendChild(doc.body);
  doc.documentElement = html;
  for (const id of ['hud', 'minimap-wrap', 'minimap', 'zone-panel', 'zone-banner', 'journal-panel', 'pause-journal']) {
    const el = node(id === 'minimap' ? 'canvas' : 'div', doc);
    el.id = id;
    doc.body.appendChild(el);
    doc.hosts[id] = el;
  }
  doc.getElementById = (id) => doc.hosts[id] ?? doc.body.querySelectorAll(`#${id}`)[0] ?? null;
  doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.body.querySelector(sel);
  return doc;
}

function bootGame() {
  return {
    inputDevice: { current: () => null },
    dialog: { toast: () => {} },
    quests: {
      notifyUpdate() {},
      getProgressText: () => '0/1',
    },
  };
}

describe('HUD 顶栏高度（--hud-top-h）', () => {
  let doc;
  let hud;

  beforeEach(() => {
    doc = bootDoc();
    globalThis.document = doc;
    globalThis.localStorage = fakeStorage();
    hud = new HUD(bootGame());
  });

  afterEach(() => {
    hud?.dispose?.();
    offAll(HUD_TAG);
    delete globalThis.document;
    delete globalThis.localStorage;
    delete globalThis.ResizeObserver;
    doc = null;
    hud = null;
  });

  it('CSS：quest-panel 的 top 读 --hud-top-h，不再写死像素', () => {
    const css = readFileSync('src/style.css', 'utf8');
    const start = css.indexOf('.quest-panel {');
    expect(start).toBeGreaterThanOrEqual(0);
    const block = css.slice(start, css.indexOf('}', start));
    expect(block).toMatch(/top:\s*calc\([^;]*var\(--hud-top-h/);
    expect(block).not.toMatch(/top:\s*\d+px/);
  });

  it('量到有限高度就写变量；0 与非有限数不写', () => {
    expect(hud.hudTop, '模板里应有 .hud-top').toBeTruthy();
    hud.hudTop.getBoundingClientRect = () => ({ height: 117.4 });
    hud._syncHudTopHeight();
    expect(doc.documentElement.style['--hud-top-h']).toBe('117.4px');

    hud.hudTop.getBoundingClientRect = () => ({ height: 0 });
    hud._syncHudTopHeight();
    expect(doc.documentElement.style['--hud-top-h']).toBe('117.4px');

    hud.hudTop.getBoundingClientRect = () => ({ height: NaN });
    hud._syncHudTopHeight();
    expect(doc.documentElement.style['--hud-top-h']).toBe('117.4px');
  });

  it('同值不重写（ResizeObserver 自身写入会再触发一轮，重写会自激）', () => {
    let writes = 0;
    const raw = doc.documentElement.style.setProperty;
    doc.documentElement.style.setProperty = (n, v) => { writes += 1; raw(n, v); };
    hud.hudTop.getBoundingClientRect = () => ({ height: 88 });
    hud._syncHudTopHeight();
    hud._syncHudTopHeight();
    hud._syncHudTopHeight();
    expect(writes).toBe(1);
  });

  it('有 ResizeObserver 时观察顶栏，dispose() 断得掉', () => {
    const seen = { observed: null, disconnected: 0 };
    class FakeRO {
      constructor(cb) { this.cb = cb; }
      observe(el) { seen.observed = el; }
      disconnect() { seen.disconnected += 1; }
    }
    globalThis.ResizeObserver = FakeRO;
    const h2 = new HUD(bootGame());
    h2.hudTop.getBoundingClientRect = () => ({ height: 64 });
    expect(seen.observed).toBe(h2.hudTop);
    h2.dispose();
    expect(seen.disconnected).toBe(1);
  });
});