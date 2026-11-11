/**
 * HUD Boss 胜利金潮（W-V7）——`boss-defeated` 那一刻 body 挂上 `boss-victory` 2.4s。
 *
 * 桩形状沿用 tests/hud-boot.test.js：假文档只收 innerHTML 里真的写出来的格子。
 * 断言两条：
 *   1. 派发 boss-defeated → body 立刻落上 boss-victory（潮起）；
 *   2. dispose → body 上的 boss-victory 被收干净（潮落），不会漏给下一个用例。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

describe('HUD Boss 胜利金潮（W-V7）', () => {
  let doc;

  beforeAll(() => {
    globalThis.localStorage = fakeStorage();
  });

  afterAll(() => {
    offAll(HUD_TAG);
    delete globalThis.document;
    delete globalThis.localStorage;
  });

  beforeEach(() => {
    offAll(HUD_TAG);
    doc = bootDoc();
    globalThis.document = doc;
  });

  it('boss-defeated → body 挂上 boss-victory（潮起），dispose 收干净（潮落）', () => {
    const hud = new HUD(bootGame());
    expect(doc.body.classList.contains('boss-victory')).toBe(false);
    window.dispatchEvent(new CustomEvent('boss-defeated', { detail: { bossId: 'void-chronarch' } }));
    expect(doc.body.classList.contains('boss-victory')).toBe(true);
    hud.dispose();
    expect(doc.body.classList.contains('boss-victory')).toBe(false);
  });
});
