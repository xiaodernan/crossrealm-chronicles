/**
 * W-Z55「炉主之名」—— 出场页回声奖励门禁
 *
 * 钉四条：
 * 1) index.html：#start-keeper 存在，初始 hidden，aria-hidden="true"（装饰性，炉主身份在成就墙为真）
 * 2) strings 双表都有 start_keeper_badge（"炉主 · 火没有灭" 这句不会裸键出镜）
 * 3) main.js：boot 路径里有 echo-keeper 判定 → 移除 hidden（没通关的人不会看见）
 * 4) style.css：.start-keeper 注册了（否则 hidden 解除也全透明）
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');
const HTML = read('index.html');
const MAIN = read('src/main.js');
const CSS = read('src/style.css');
const ZH = read('src/content/strings.zh.js');
const EN = read('src/content/strings.en.js');

describe('炉主之名（W-Z55）', () => {
  it('index.html：#start-keeper 初始 hidden + aria-hidden', () => {
    const i = HTML.indexOf('id="start-keeper"');
    expect(i).toBeGreaterThan(-1);
    const el = HTML.slice(i - 80, HTML.indexOf('</p>', i));
    expect(el).toContain('class="start-keeper hidden"');
    expect(el).toContain('aria-hidden="true"');
    expect(el).toContain('start-keeper-glyph');
  });

  it('双表 start_keeper_badge 都在（键不在 → 玩家看到 [MISSING]）', () => {
    expect(ZH).toMatch(/start_keeper_badge: '炉主 · 火没有灭'/);
    expect(EN).toMatch(/start_keeper_badge: 'Echo-keeper · the flame endures'/);
  });

  it('main.js：boot 路径显式 echo-keeper 判定', () => {
    expect(MAIN).toContain("document.getElementById('start-keeper')");
    expect(MAIN).toMatch(/achievements\?\.unlocked\?\.has\?\.\('echo-keeper'\)/);
    expect(MAIN).toContain("classList.remove('hidden')");
  });

  it('style.css：.start-keeper 注册 + hidden 分支', () => {
    expect(CSS).toMatch(/\.start-keeper\s*\{/);
    expect(CSS).toMatch(/\.start-keeper\.hidden\s*\{[^}]*display:\s*none/);
  });
});
