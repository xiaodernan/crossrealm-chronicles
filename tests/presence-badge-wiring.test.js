/**
 * W-Z26「星图微光」：顾问徽章接线（index.html + AdvisorPanel + style.css 结构断言）
 *
 * 1) index.html：presence 徽章元素在 advisor-head-actions 里，aria-live 合规
 * 2) AdvisorPanel：查 presenceTracker / #advisor-presence，文本只走 settings_online_presence_fmt + textContent
 * 3) style.css：.advisor-presence 有月白微尘样式 + prefers-reduced-motion 降级
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PANEL = readFileSync(join(ROOT, 'src/ui/AdvisorPanel.js'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');
const CSS = readFileSync(join(ROOT, 'src/style.css'), 'utf8');
const beat = readFileSync(join(ROOT, 'src/online/PresenceBeat.js'), 'utf8');
const tracker = readFileSync(join(ROOT, 'src/online/presenceTracker.js'), 'utf8');

describe('index.html 徽章元素', () => {
  it('advisor-presence + advisor-presence-text 在 advisor-head-actions 容器内', () => {
    const headMatch = INDEX.match(/<div class="advisor-head-actions">[\s\S]*?<\/div>/);
    expect(headMatch, 'advisor-head-actions 容器没找到').not.toBeNull();
    expect(headMatch[0]).toContain('id="advisor-presence"');
    expect(headMatch[0]).toContain('id="advisor-presence-text"');
    expect(headMatch[0]).toContain('class="advisor-presence');
  });

  it('徽章 aria-live=polite，初始 hidden', () => {
    expect(INDEX).toContain('id="advisor-presence" class="advisor-presence hidden" aria-live="polite"');
  });
});

describe('AdvisorPanel 订阅与文本口径', () => {
  it('import presenceTracker，订阅返回 unsubscribe', () => {
    expect(PANEL).toContain("from '../online/presenceTracker.js'");
    expect(PANEL).toContain('presenceTracker.subscribe(');
    expect(PANEL).toContain('this._presenceUnsub?.()');
  });

  it('徽章只走 textContent + settings_online_presence_fmt，绝不 innerHTML', () => {
    expect(PANEL).toContain('settings_online_presence_fmt');
    expect(PANEL).not.toMatch(/presence[\s\S]{0,120}innerHTML/);
  });

  it('dispose() 退订', () => {
    expect(PANEL).toContain('this._presenceUnsub?.();');
  });
});

describe('style.css 徽章样式', () => {
  it('.advisor-presence 月白主题 + .hidden 显隐 + 呼吸点 + 减少动态降级', () => {
    expect(CSS).toContain('.advisor-presence');
    expect(CSS).toContain('.advisor-presence.hidden');
    expect(CSS).toContain('.advisor-presence-dot');
    expect(CSS).toMatch(/\.advisor-presence-dot[\s\S]{0,400}@media \(prefers-reduced-motion/);
  });
});

describe('心跳与跟踪器源文件存在、不自建计时器', () => {
  it('PresenceBeat 用 update(dt) 轴累计，B39 无裸 setInterval', () => {
    expect(beat).toContain('async update(dt)');
    expect(beat).not.toMatch(/setInterval\s*\(/);
    expect(beat).toContain('BEAT_INTERVAL_S');
  });

  it('presenceTracker 用 EventSource（浏览器原生自动重连），不自建 rAF', () => {
    expect(tracker).toContain("new EventSource(");
    expect(tracker).not.toMatch(/requestAnimationFrame|setInterval\s*\(/);
  });
});
