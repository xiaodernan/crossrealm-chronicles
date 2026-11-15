/**
 * TrilanceReadingTab 成品渲染（W-Z129）：
 * - 未起盘：8 张中还没有 —— 3 个占位图 + 起盘按钮（zh/en 双语）；
 * - 起盘后：三个角色位（左阳/中阳/右阳 zh）→ render 展开 EN；
 * - 合帘（全 ★1）：按钮变"本周曜盘已起"，verdict=Aligned + bonus;
 * - 语言切 en 后：文案全英文（无 [MISSING]）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TrilanceReadingTab } from '../src/ui/TrilanceReadingTab.js';
import { TrilanceReadingSystem } from '../src/game/TrilanceReadingSystem.js';
import { setLanguage } from '../src/engine/i18n.js';

const fakePanel = () => ({
  innerHTML: '',
  querySelectorAll: () => [],
  querySelector: () => null,
});

const fakeGame = () => {
  const trilanceReading = new TrilanceReadingSystem({});
  const stats = { souls: 0, addSouls(n) { this.souls += n; } };
  return { trilanceReading, stats };
};

let realLS;
beforeEach(() => {
  realLS = globalThis.localStorage;
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
});
afterEach(() => { globalThis.localStorage = realLS; });

describe('TrilanceReadingTab —— 三日曜盘 UI', () => {
  it('未起盘（zh）：占位 ×3 + 起盘 CTA + 中文标题标签；无 MISSING', () => {
    setLanguage('zh');
    const panel = fakePanel();
    const tab = new TrilanceReadingTab(fakeGame());
    tab.render(panel);
    expect(panel.innerHTML).toContain('星轨 · 三日曜盘');
    expect(panel.innerHTML).toContain('起曜盘');
    expect(panel.innerHTML).not.toContain('[MISSING');
    expect((panel.innerHTML.match(/trilance-card-placeholder/g) ?? []).length).toBe(3);
  });

  it('起盘后（zh）：三个角色位 + aligned verdict + +30% bonus 行', () => {
    setLanguage('zh');
    const game = fakeGame();
    game.trilanceReading.castWeek(() => 0);
    const panel = fakePanel();
    const tab = new TrilanceReadingTab(game);
    tab.render(panel);
    expect(panel.innerHTML).toContain('左阳');
    expect(panel.innerHTML).toContain('中阳');
    expect(panel.innerHTML).toContain('右阳');
    expect(panel.innerHTML).toContain('合帘');
    expect(panel.innerHTML).toContain('合帘加成');
    expect(panel.innerHTML).not.toContain('[MISSING');
    // button 关闭
    expect(panel.innerHTML).toContain('已起');
  });

  it('切到 EN：文案全英文、角色位是 Left/Middle/Right、aligned 英文呈现', () => {
    setLanguage('en');
    const game = fakeGame();
    game.trilanceReading.castWeek(() => 0);
    const panel = fakePanel();
    const tab = new TrilanceReadingTab(game);
    tab.render(panel);
    expect(panel.innerHTML).toContain('The Trisolar Tide');
    expect(panel.innerHTML).toContain('Left Sun');
    expect(panel.innerHTML).toContain('Aligned');
    expect(panel.innerHTML).not.toContain('[MISSING');
  });

  it('history chips 出现（起过盘后）', () => {
    setLanguage('zh');
    const game = fakeGame();
    game.trilanceReading.castWeek(() => 0);
    const panel = fakePanel();
    const tab = new TrilanceReadingTab(game);
    tab.render(panel);
    expect(panel.innerHTML).toContain('trilance-history-chip');
  });
});
