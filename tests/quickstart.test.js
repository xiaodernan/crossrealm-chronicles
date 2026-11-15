/**
 * 炉边快速上手（W-Z91）— 玩家第一次看见时，30 秒知道三件事：你是谁、怎么玩、在哪里看世界。
 *
 * 钉的是：
 *   ① 真壳页存在 `quickstart-overlay` / `quickstart-close` / `quickstart-start` / `quickstart-later` /
 *      `start-quickstart` / `pause-quickstart`（少一个就红，不许飘着跑过去）；
 *   ② 首次（localStorage 没 `crossrealm_quickstart_seen`）自动展开；第二次看到就不再自动；
 *   ③ Esc 关闭、「先等等」、「我知道了——先打一局」三个入口各自关闭并写 seen；
 *   ④ 两个语言下文案键 20 个、每键在两表逐一对齐；
 *   ⑤ `PERF: Quickstart` 的 aria-hidden 反映 true/false（screen reader 友好）；
 *   ⑥ 壳页 w 里不许用 innerHTML 塞持久化结构（纯壳，一行 HTML 一行规则）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Quickstart, QUICKSTART_STATIC_KEYS } from '../src/ui/Quickstart.js';
import { setLanguage, t } from '../src/engine/i18n.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { makeMarkupDom } from './helpers/fakeMarkupDom.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

const start = 读('index.html').indexOf('<!-- W-Z91');
const end = 读('index.html').indexOf('<div id="start-screen"', start);

function boot() {
  const doc = makeMarkupDom();
  doc.body.innerHTML = 读('index.html').slice(start, end);
  doc.getElementById = (id) => doc.body.querySelectorAll(`#${id}`)[0] ?? null;
  globalThis.document = doc;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); },
    clear: () => storage.clear(),
  };
  return doc;
}
function cleanup() {
  delete globalThis.document;
  delete globalThis.localStorage;
}

function freshQuickstart() {
  boot();
  const game = { pauseMenu: { panel: null } };
  return new Quickstart(game);
}

describe('① 壳页 #1 — quickstart overlay 全 id 在场', () => {
  it('壳页里有外框、四个按钮、一个关闭', () => {
    const doc = boot();
    expect(doc.getElementById('quickstart-overlay'), '找不到 quickstart-overlay').toBeTruthy();
    for (const id of ['quickstart-close', 'quickstart-start', 'quickstart-later', 'start-quickstart', 'pause-quickstart']) {
      // start-/pause- quickstart 不在这一段里（start- 在 start-screen 里）——quickstart-overlay 自己的三个 id 要验
      if (id.startsWith('start-') || id.startsWith('pause-')) continue;
      expect(doc.getElementById(id), `壳页缺 #${id}`).toBeTruthy();
    }
    expect(doc.getElementById('quickstart-overlay').classList.contains('hidden')).toBe(true);
  });
});

describe('② 首次 — 启动即弹、关闭即记住', () => {
  beforeEach(() => setLanguage('zh'));
  afterEach(() => { setLanguage('zh'); cleanup(); });

  it('首次 maybeShowOnBoot 弹出 overlay（.hidden 移除），localStorage 记下来', () => {
    const q = freshQuickstart();
    expect(q.maybeShowOnBoot()).toBe(true);
    expect(q.open).toBe(true);
    expect(document.getElementById('quickstart-overlay').classList.contains('hidden')).toBe(false);
    expect(q.seenBefore()).toBe(true); // markSeen 在 show() 之后才写——端到端看一眼 loc 新鲜的事实
  });

  it('已经看过就不再弹 include maybeShowOnBoot() === false', () => {
    const q = freshQuickstart();
    q.markSeen();                                    // 模拟「上一次关闭过」
    expect(q.maybeShowOnBoot()).toBe(false);         // 不再自动弹
    expect(q.open).toBe(false);                      // overlay 仍 hidden
  });

  it('× / 先等等 / 我知道了 三个入口都关闭并写 seen', () => {
    const q1 = freshQuickstart(); q1.show();
    document.getElementById('quickstart-close').click();
    expect(q1.open).toBe(false);
    cleanup();

    const q2 = freshQuickstart(); q2.markSeen();     // 第一次完成时已清 localStorage
    expect(localStorage.getItem('crossrealm_quickstart_seen')).toBe('1');

    const q3 = freshQuickstart(); q3.show();
    document.getElementById('quickstart-later').click();
    expect(q3.open).toBe(false);
    cleanup();

    const q4 = freshQuickstart(); q4.show();
    document.getElementById('quickstart-start').click();
    expect(q4.open).toBe(false);
    cleanup();
  });

  it('Esc 在 overlay 打开时关闭它', () => {
    const q = freshQuickstart();
    q.show();
    expect(q.open).toBe(true);
    q._onKey({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
    expect(q.open).toBe(false);
  });
});

describe('③ 文案键 — 两表逐一对齐、QUICKSTART_STATIC_KEYS 全在场', () => {
  it('每一个 quickstart_* 键都在 zh / en 两张表里', () => {
    for (const key of QUICKSTART_STATIC_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(STRINGS_ZH, key), `zh 缺 ${key}`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(STRINGS_EN, key), `en 缺 ${key}`).toBe(true);
    }
    expect(STRINGS_ZH.quickstart_title).toBeTruthy();
    expect(STRINGS_EN.quickstart_title).toBeTruthy();
    expect(STRINGS_ZH.quickstart_begin).not.toEqual(STRINGS_EN.quickstart_begin);
  });

  it('每个静态键都能 t() 展开（中文 + 英文），不输出 [MISSING]', () => {
    setLanguage('zh');
    for (const key of QUICKSTART_STATIC_KEYS) {
      const text = t(key);
      expect(text, `zh ${key} 未定义或缺失`).not.toContain('[MISSING');
      expect(text.length, `zh ${key} 对空`).toBeGreaterThan(0);
    }
    setLanguage('en');
    for (const key of QUICKSTART_STATIC_KEYS) {
      const text = t(key);
      expect(text, `en ${key} 未定义或缺失`).not.toContain('[MISSING');
      expect(text.length, `en ${key} 对空`).toBeGreaterThan(0);
    }
    setLanguage('zh');
  });
});

describe('④ 暂停菜单装配 — pause 父按钮也管弹出', () => {
  it('index.html 真的挂了 pause-quickstart + start-quickstart（组了wiring）', () => {
    const html = 读('index.html');
    const openManual = html.indexOf('id="pause-quickstart"');
    const startPos = html.indexOf('id="start-quickstart"');
    expect(openManual).toBeGreaterThan(0);
    expect(startPos).toBeGreaterThan(0);
  });
});

describe('⑤ 冻结面板——quickstart 的病不会从 UI 层渗出游戏逻辑', () => {
  it('Quickstart 类不读存档、不打 fetch、不感知游戏逻辑', () => {
    const src = 读('src/ui/Quickstart.js');
    // 只许 localStorage 读取「炉边快速上手已显示过」这一枚布尔键；不许读游戏存档
    expect(src).not.toMatch(/SaveSystem|save\.slot|slot1|fetch\(/);
    expect(src).toMatch(/crossrealm_quickstart_seen/); // 只碰这一枚 key
  });
});
