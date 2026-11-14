/**
 * W-Z52 顾问 FAB 未读金点 —— 源码接线 + DOM 存在性门禁
 *
 * 钉三条：
 * 1) index.html 的 #advisor-fab 内有 #fab-notify-dot（aria-hidden，不打断读屏）
 * 2) style.css 有 .fab-notify-dot 注册（否则那枚点永远透明）
 * 3) AdvisorPanel 订阅了 notifyTracker 并在两个出口调 _renderFabDot()
 *    （订阅回调 + refresh().then——前者管「状态变了」，后者管「标记已读后立即熄灭」）
 * 4) Game.js 开局在 onlineServices.enabled() 时 refresh()（否则金点永远不亮；未开在线时零网络）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');
const HTML = read('index.html');
const CSS = read('src/style.css');
const PANEL = read('src/ui/AdvisorPanel.js');
const GAME = read('src/core/Game.js');

describe('FAB 未读金点（W-Z52）', () => {
  it('index.html：#advisor-fab 内有 aria-hidden 的 #fab-notify-dot', () => {
    const fabStart = HTML.indexOf('id="advisor-fab"');
    const fabEnd = HTML.indexOf('</button>', fabStart);
    expect(fabStart).toBeGreaterThan(-1);
    const fab = HTML.slice(fabStart, fabEnd);
    expect(fab).toContain('id="fab-notify-dot"');
    expect(fab).toContain('aria-hidden="true"');
  });

  it('style.css：.fab-notify-dot 注册了金色点 + hidden 分支', () => {
    expect(CSS).toMatch(/\.fab-notify-dot\s*\{/);
    expect(CSS).toMatch(/\.fab-notify-dot\.hidden\s*\{[^}]*display:\s*none/);
  });

  it('AdvisorPanel：订阅 notifyTracker 后调 _renderFabDot，两个出口都在', () => {
    expect(PANEL).toContain('this._renderFabDot();');
    expect(PANEL).toContain('notifyTracker.unreadCount()');
    // 订阅回调（状态变化）与 refresh().then（标记已读后）各一次
    const calls = (PANEL.match(/this\._renderFabDot\(\)/g) ?? []).length;
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it('AdvisorPanel：_renderFabDot 用 notifyTracker 状态 + unreadCount 判定显示', () => {
    const i = PANEL.indexOf('_renderFabDot() {');
    expect(i).toBeGreaterThan(-1);
    const body = PANEL.slice(i, PANEL.indexOf('\n  }', i));
    expect(body).toContain('notifyTracker.unreadCount()');
    expect(body).toContain("classList.toggle('hidden'");
  });

  it('Game.js：开局在线启用时 refresh()（默认关闭 = 零网络契约不破）', () => {
    expect(GAME).toMatch(/if\s*\(onlineServices\.enabled\(\)\)\s*void notifyTracker\.refresh\(\)/);
  });
});
