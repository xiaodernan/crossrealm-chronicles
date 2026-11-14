/**
 * W-Z58「炉边传闻」—— 出场页门楣上的一条真实报讯
 *
 * 钉四条：
 * 1) pickTickerItem：world 优先、缺项回退首条、空/坏输入返回 null
 * 2) revealStartTicker：离线（onlineServices.enabled() === false）= 零 fetch 调用、元素保持 hidden
 * 3) revealStartTicker：成功后用 textContent 上墙、移除 hidden；fetch 炸了 = 静默不动
 * 4) index.html：#start-ticker 初始 hidden + aria-hidden + start_ticker_label；zh/en 双表键在
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickTickerItem, revealStartTicker } from '../src/online/startTicker.js';
import { onlineServices } from '../src/online/OnlineServices.js';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');

/** 手搓的最小 DOM 桩：只实现 revealStartTicker 用到的两个 id + classList */
function makeDoc({ hidden = true, withText = true } = {}) {
  const classes = new Set(hidden ? ['hidden'] : []);
  const el = {
    classList: {
      contains: (c) => classes.has(c),
      remove: (c) => classes.delete(c),
      add: (c) => classes.add(c),
    },
  };
  const text = withText ? { textContent: '' } : null;
  const doc = {
    getElementById: (id) => (id === 'start-ticker' ? el
      : id === 'start-ticker-text' ? text
      : null),
  };
  return { doc, el, text };
}

describe('炉边传闻（W-Z58）pickTickerItem', () => {
  it('world 优先', () => {
    const items = [
      { id: '1', kind: 'season', title: '换季', ts: 1 },
      { id: '2', kind: 'world', title: '世界事件', ts: 2 },
    ];
    expect(pickTickerItem(items)).toEqual(items[1]);
  });
  it('没有 world → 首条；空数组/非数组 → null；无标题 → null', () => {
    expect(pickTickerItem([{ id: '1', kind: 'season', title: '换季', ts: 1 }])).toMatchObject({ id: '1' });
    expect(pickTickerItem([])).toBeNull();
    expect(pickTickerItem(undefined)).toBeNull();
    expect(pickTickerItem([{ id: '1', kind: 'world' }])).toBeNull();
  });
});

describe('炉边传闻（W-Z58）revealStartTicker 离线 = 零网络', () => {
  it('enabled() === false → fetchRecents 不被调用、元素保持 hidden', () => {
    const fetchRecents = vi.fn();
    const spy = vi.spyOn(onlineServices, 'enabled').mockReturnValue(false);
    const { doc, el } = makeDoc({ hidden: true });
    const r = revealStartTicker(doc, fetchRecents);
    expect(r).toBe(false);
    expect(fetchRecents).not.toHaveBeenCalled();
    expect(el.classList.contains('hidden')).toBe(true);
    spy.mockRestore();
  });
});

describe('炉边传闻（W-Z58）revealStartTicker 在线路径', () => {
  it('成功 → textContent 上墙 + hidden 移除', async () => {
    const spy = vi.spyOn(onlineServices, 'enabled').mockReturnValue(true);
    const { doc, el, text } = makeDoc({ hidden: true });
    const fetcher = vi.fn(async () => ({ count: 1, items: [{ id: 'x', kind: 'world', title: '影界守护者被讨伐', ts: 10 }] }));
    revealStartTicker(doc, fetcher);
    await new Promise((r) => setTimeout(r, 0));
    expect(text.textContent).toBe('影界守护者被讨伐');
    expect(el.classList.contains('hidden')).toBe(false);
    spy.mockRestore();
  });
  it('报讯台断了 / 世界安静 → 静默、保持 hidden', async () => {
    const spy = vi.spyOn(onlineServices, 'enabled').mockReturnValue(true);
    const { doc, el } = makeDoc({ hidden: true });
    const boom = vi.fn(async () => { throw new Error('offline'); });
    revealStartTicker(doc, boom);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.classList.contains('hidden')).toBe(true);
    // 世界空 → 也不上墙
    const empty = vi.fn(async () => ({ count: 0, items: [] }));
    revealStartTicker(doc, empty);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.classList.contains('hidden')).toBe(true);
    spy.mockRestore();
  });
});

describe('炉边传闻（W-Z58）HTML / i18n / CSS 契约', () => {
  it('index.html：#start-ticker 初始 hidden + aria-hidden + 双 i18n 挂点', () => {
    const HTML = read('index.html');
    const i = HTML.indexOf('id="start-ticker"');
    expect(i).toBeGreaterThan(-1);
    const block = HTML.slice(i - 40, HTML.indexOf('</p>', i) + 4);
    expect(block).toContain('start-ticker hidden');
    expect(block).toContain('aria-hidden="true"');
    expect(block).toContain('data-i18n="start_ticker_label"');
    expect(block).toContain('id="start-ticker-text"');
  });
  it('双表 start_ticker_label 都在（缺键 = 玩家看到 [MISSING]）', () => {
    expect(read('src/content/strings.zh.js')).toMatch(/start_ticker_label: '此刻 · 炉边传闻'/);
    expect(read('src/content/strings.en.js')).toMatch(/start_ticker_label: 'Now · fireside rumors'/);
  });
  it('style.css 注册 .start-ticker / .start-ticker.hidden / .start-ticker-ember', () => {
    const CSS = read('src/style.css');
    expect(CSS).toMatch(/\.start-ticker\s*\{/);
    expect(CSS).toMatch(/\.start-ticker\.hidden\s*\{\s*display:\s*none/);
    expect(CSS).toMatch(/\.start-ticker-ember\s*\{/);
  });
  it('main.js：出场页解 hidden 之后触发 revealStartTicker', () => {
    const MAIN = read('src/main.js');
    expect(MAIN).toContain("import { revealStartTicker } from './online/startTicker.js'");
    expect(MAIN).toContain('revealStartTicker(document)');
  });
});
