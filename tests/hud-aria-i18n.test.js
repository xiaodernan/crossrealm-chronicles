/**
 * HUD aria-label 无障碍文案双表化（W-D2 切片32）。
 *
 * ## 为什么要有这道门禁
 *
 * 切片27/28/31 收的是**看得见**的文案，而 `aria-label` 是**读屏软件念**的那一层：
 * 它既不是 textContent（`data-i18n` 换不到它）、也不是 `{动作}` 占位（`keyText` 不碰
 * 属性）—— 于是 HUD 里 11 处 aria-label（当前任务 / Boss 血量 / 状态条 / 法术快捷栏 /
 * 四个法术槽 / 蓄力进度 / 折叠展开 / 罗盘）一直是裸中文，英文玩家开着读屏软件听到的是
 * 中文，而没有任何门禁会响。
 *
 * ## 机制
 *
 * `applyTranslations` 多扫一遍 `[data-i18n-aria]`：属性值就是键名，与 `data-i18n`
 * 同一份契约（找不到键保持原文不动，不把 [MISSING:] 写进玩家界面）。换语言走的是
 * `SettingsManager.applyToGame` 里那两行（setLanguage + applyTranslations），所以
 * aria-label 与文本标签同一次走查里一起换。
 *
 * ## 口径
 *
 * 1. 钉文案腿：10 个新键 + 1 个复用键（hud_quest_label）的中英原值逐字钉死。
 * 2. 静态腿：HUD.js 无 aria-label 中文字面量、恰好 11 处 data-i18n-aria；
 *    全仓 src 再无第二处 aria-label 中文字面量（这一族收口）。
 * 3. 键登记腿：HUD.js 里每个 data-i18n-aria 的键都在两表登记（附反向控制）。
 * 4. 行为腿：真构造 HUD（承 hud-boot 的装配桩），真 applyTranslations，
 *    中英两语 11 处 aria-label 逐字对；切英文再走一遍全部改口；
 *    缺键元素保持原文（契约腿）。
 * 5. 键数腿：双表对齐且键数只增不减（2281 → 2291）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { HUD } from '../src/ui/HUD.js';
import { setLanguage, applyTranslations } from '../src/engine/i18n.js';
import { STRINGS_ZH } from '../src/content/strings.zh.js';
import { STRINGS_EN } from '../src/content/strings.en.js';
import { offAll } from '../src/engine/EventBus.js';

const 读 = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const 含汉 = /[\u4e00-\u9fff]/;
const HUD_TAG = 'ui/HUD';

/** 10 个新键 + 1 个复用键：键 → [中文原值, 英文原值] */
const KEYS = {
  hud_aria_boss_hp: ['Boss 血量', 'Boss HP'],
  hud_aria_status_bars: ['状态条', 'Status Bars'],
  hud_aria_spell_bar: ['法术快捷栏', 'Spell Bar'],
  hud_aria_spell_slot_1: ['法术 1', 'Spell 1'],
  hud_aria_spell_slot_2: ['法术 2', 'Spell 2'],
  hud_aria_spell_slot_3: ['法术 3', 'Spell 3'],
  hud_aria_spell_slot_4: ['法术 4', 'Spell 4'],
  hud_aria_charge: ['蓄力进度', 'Charge Progress'],
  hud_aria_collapse: ['折叠/展开', 'Collapse/Expand'],
  hud_aria_compass: ['罗盘', 'Compass'],
  hud_quest_label: ['当前任务', 'Current Quest'],   // 复用：quest 面板的可见标签同一键
};

/** 最小 localStorage：attachDraggable / attachCollapsible 构造期就要读一次（承 hud-boot） */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** 一份够 HUD 开机用的文档（承 tests/hud-boot.test.js 的装配桩） */
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

/** 11 处 aria-label 的落点与两语文案（顺序即模板里的顺序） */
const ARIA_SPOTS = [
  ['#quest-panel', '当前任务', 'Current Quest'],
  ['#boss-bar-wrap', 'Boss 血量', 'Boss HP'],
  ['.status-bars', '状态条', 'Status Bars'],
  ['#spell-bar', '法术快捷栏', 'Spell Bar'],
  ['[data-slot="1"]', '法术 1', 'Spell 1'],
  ['[data-slot="2"]', '法术 2', 'Spell 2'],
  ['[data-slot="3"]', '法术 3', 'Spell 3'],
  ['[data-slot="4"]', '法术 4', 'Spell 4'],
  ['#charge-wrap', '蓄力进度', 'Charge Progress'],
  ['.panel-collapse-btn', '折叠/展开', 'Collapse/Expand'],
  ['#compass', '罗盘', 'Compass'],
];

describe('HUD aria-label 双表化（W-D2 切片32）', () => {
  beforeAll(() => { setLanguage('zh'); });
  afterAll(() => { offAll(HUD_TAG); setLanguage('zh'); delete globalThis.document; delete globalThis.localStorage; });

  it('钉文案腿：10 个新键 + 1 个复用键的中英原值逐字钉死', () => {
    expect(Object.keys(KEYS)).toHaveLength(11);
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
    // 反向控制：过滤器必须能点名没登记的键
    expect(Object.keys(KEYS).filter((k) => !(k in STRINGS_ZH))).toEqual([]);
    expect(['hud_aria_compass', 'no_such_key_xyz'].filter((k) => !(k in STRINGS_EN))).toEqual(['no_such_key_xyz']);
  });

  it('静态腿：HUD.js 无 aria-label 中文字面量、恰好 11 处 data-i18n-aria', () => {
    const src = 读('src/ui/HUD.js');
    const 裸 = [...src.matchAll(/aria-label="[^"]*"/g)].filter((m) => 含汉.test(m[0]));
    expect(裸.map((m) => m[0]), 'HUD.js 里还有带中文的 aria-label 字面量').toEqual([]);
    expect((src.match(/data-i18n-aria=/g) ?? []).length, 'data-i18n-aria 处数不对').toBe(11);
  });

  it('静态腿·全仓收口：src 下再没有第二处 aria-label 中文字面量', () => {
    const files = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p);
      }
    };
    walk('src');
    expect(files.length, 'src 文件一个都没扫到，扫描坏了').toBeGreaterThan(50);
    const 漏网 = [];
    for (const f of files) {
      const src = 读(f);
      for (const m of src.matchAll(/aria-label="[^"]*"/g)) {
        if (含汉.test(m[0])) 漏网.push(f + ': ' + m[0]);
      }
    }
    expect(漏网, '还有文件在 aria-label 里写裸中文').toEqual([]);
  });
  it('键登记腿：HUD.js 里每个 data-i18n-aria 的键都在两表登记', () => {
    const src = 读('src/ui/HUD.js');
    const keys = [...src.matchAll(/data-i18n-aria="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length, 'data-i18n-aria 一个都没扫到，扫描坏了').toBe(11);
    for (const k of keys) {
      expect(STRINGS_ZH[k], `zh 表里没有 aria 键 ${k}`).toBeTypeOf('string');
      expect(STRINGS_EN[k], `en 表里没有 aria 键 ${k}`).toBeTypeOf('string');
    }
  });

  it('行为腿：真构造 HUD + 真 applyTranslations，中英两语 11 处逐字对', () => {
    for (const lang of ['zh', 'en']) {
      setLanguage(lang);
      const doc = bootDoc();
      globalThis.document = doc;
      globalThis.localStorage = fakeStorage();
      const hud = new HUD(bootGame());
      applyTranslations(doc);
      for (const [sel, zh, en] of ARIA_SPOTS) {
        const el = doc.querySelector(sel);
        expect(el, `${lang}: 模板里找不到 ${sel}`).toBeTruthy();
        expect(el.getAttribute('aria-label'), `${lang}: ${sel} 的 aria-label 不对`).toBe(lang === 'zh' ? zh : en);
      }
      if (lang === 'en') {
        for (const [sel] of ARIA_SPOTS) {
          expect(doc.querySelector(sel).getAttribute('aria-label'), '英文 aria 夹中文').not.toMatch(含汉);
        }
      }
      hud.dispose?.();
    }
    setLanguage('zh');
  });

  it('行为腿·换语言：切英文后同一棵树里的 aria-label 全部改口', () => {
    setLanguage('zh');
    const doc = bootDoc();
    globalThis.document = doc;
    globalThis.localStorage = fakeStorage();
    const hud = new HUD(bootGame());
    applyTranslations(doc);
    expect(doc.querySelector('#compass').getAttribute('aria-label')).toBe('罗盘');
    // SettingsManager.applyToGame 的那两行：setLanguage + applyTranslations
    setLanguage('en');
    applyTranslations(doc);
    for (const [sel, , en] of ARIA_SPOTS) {
      expect(doc.querySelector(sel).getAttribute('aria-label'), `换语言后 ${sel} 没改口`).toBe(en);
    }
    hud.dispose?.();
    setLanguage('zh');
  });

  it('契约腿：data-i18n-aria 指向不存在的键时保持原文（不写 [MISSING:] 进玩家界面）', () => {
    setLanguage('zh');
    const doc = bootDoc();
    globalThis.document = doc;
    globalThis.localStorage = fakeStorage();
    const hud = new HUD(bootGame());
    const 坏 = node('div', doc);
    坏.setAttribute('aria-label', '保持我');
    坏.dataset.i18nAria = 'no_such_key_xyz';
    doc.body.appendChild(坏);
    applyTranslations(doc);
    expect(坏.getAttribute('aria-label'), '缺键时被写成了报错字样').toBe('保持我');
    坏.detach();
    hud.dispose?.();
  });

  it('键数腿：双表对齐且键数只增不减（2281 → 2291）', () => {
    const zhKeys = Object.keys(STRINGS_ZH);
    const enKeys = Object.keys(STRINGS_EN);
    expect(zhKeys.length).toBe(enKeys.length);
    expect(zhKeys.length).toBeGreaterThanOrEqual(2291);
  });
});
