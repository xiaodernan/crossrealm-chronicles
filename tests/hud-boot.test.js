/**
 * HUD 开机构造的运行期门禁（W-D1 切片3，关 B105 那一族）。
 *
 * ## 为什么必须真构造一遍
 * B105 的病灶是**模板**：`buildHUD()` 把 8 个统计格写成 `data-ktext="魂 {souls} · Lv.{level}"`，
 * 而 `data-ktext` 只认键位表里登记过的动作名。`buildHUD()` 末尾就调 `refreshKeyHints()`，
 * 也就是说**构造函数走到一半就会抛** —— 玩家看到的是"游戏初始化失败"。
 * 静态扫描（`tests/key-hint-source.test.js`）已经把这类占位挡在源码层，
 * 但"源码里扫得到"与"真跑起来不抛"终究是两件事：模板一旦由拼接生成、
 * 或占位被塞进扫描器看不见的字符串里，静态那道就过不了真路径。
 * 这一片补的就是**真路径**：把 HUD 挂进一份会解析 `innerHTML` 的假文档里 new 一遍。
 *
 * ## 桩的三条形状（承 `tests/helpers/fakeMarkupDom.js` 的纪律）
 * 1. `innerHTML` 写进去的才存在 —— 模板里没有的格子，这里就没有；
 * 2. `getElementById` 走**文档树**，不是手摆的 host 表：`buildHUD()` 之后才有
 *    `boss-bar-wrap` 等格子，手摆等于替被测方先把格子准备好；
 * 3. `localStorage` / `document` / `window` 只在本用例范围内装上、收工拆掉 ——
 *    装着不拆会把"有 document"这个前提漏给同一个 worker 里后面的文件。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeMarkupDom, node } from './helpers/fakeMarkupDom.js';
import { refreshKeyText, hintDevice } from '../src/ui/keyHints.js';
import { offAll, listenerCount } from '../src/engine/EventBus.js';
import { HUD } from '../src/ui/HUD.js';

const HUD_TAG = 'ui/HUD';

/** 最小 localStorage：`attachDraggable` / `attachCollapsible` 构造期就要读一次 */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/**
 * 一份够 HUD 开机用的文档：壳页里不在 `#hud` 内的宿主先立起来，
 * `#hud` 自己是空容器 —— 里面的格子全部由 `buildHUD()` 写出来。
 */
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

  /* 先问手摆的宿主（壳页那几个），再按 id 走树 —— 模板里写出来的格子只有这一条路 */
  doc.getElementById = (id) => doc.hosts[id] ?? doc.body.querySelectorAll(`#${id}`)[0] ?? null;
  doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.body.querySelector(sel);
  return doc;
}

/** 构造期 HUD 会摸到的那几处：`quests.notifyUpdate()` 这一条要真的把事件派出去 */
function bootGame() {
  return {
    inputDevice: { current: () => null },
    dialog: { toast: () => {} },
    quests: {
      notifyUpdate() {
        window.dispatchEvent(new CustomEvent('quest-updated', {
          detail: { chapter: 2, current: { title: 'obj_anchor_title', progress: '0/1' } },
        }));
      },
      getProgressText: () => '0/1',
    },
  };
}

describe('HUD 开机构造', () => {
  let doc;
  let hud;

  beforeAll(() => {
    doc = bootDoc();
    globalThis.document = doc;
    globalThis.localStorage = fakeStorage();
    hud = new HUD(bootGame());   // B105 就死在这一行里：构造 = 模板 + 开机刷新
  });

  afterAll(() => {
    offAll(HUD_TAG);
    delete globalThis.document;
    delete globalThis.localStorage;
    doc = null;
    hud = null;
  });

  it('构造走完了整条开机刷新：模板里的键名占位一个都没剩下', () => {
    // #controls-hint 那两行出厂就带 {attackLight} 这类占位；refreshKeyHints 没跑就会原样留着
    const hint = doc.getElementById('controls-hint');
    expect(hint, '#controls-hint 在模板里').toBeTruthy();
    expect(hint.textContent).not.toMatch(/\{/);
    expect(hint.textContent).toContain('连击');

    // data-keys 那一族同理：展开失败就还是空串
    const parry = doc.querySelector('[data-keys="parry"]');
    expect(parry).toBeTruthy();
    expect(parry.textContent).not.toBe('');
  });

  it('统计格是出厂字面量，事件写者照样改得动（B105 的修复语义）', () => {
    expect(doc.getElementById('souls-display').textContent).toBe('魂 0 · Lv.1');
    expect(doc.getElementById('chapter-display').textContent).toBe('Chapter 2');  // 构造期 quests 已派过一次

    window.dispatchEvent(new CustomEvent('stats-changed', { detail: { souls: 12, level: 3 } }));
    expect(doc.getElementById('souls-display').textContent).toBe('魂 12 · Lv.3');
  });

  it('构造期挂上的监听在册（订阅那一半没有静默失败）', () => {
    expect(listenerCount(HUD_TAG)).toBeGreaterThan(10);
    expect(hintDevice()).toBeNull();   // 没人按过键 → 还是键盘那一套
  });

  it('反面控制：同一份文档里塞一条数据变量占位，同一套刷新当场抛', () => {
    const bad = node('div', doc);
    bad.dataset.ktext = '魂 {souls} · Lv.{level}';
    doc.body.appendChild(bad);
    try {
      expect(() => refreshKeyText(doc)).toThrow(/不是任何已登记的动作/);
    } finally {
      bad.detach();
    }
    // 造完的坏格子必须撤掉：它留在文档里会让后面每一次刷新都抛，假红就分不清是谁了
    expect(bad.parent).toBeNull();
    expect(hud).toBeTruthy();
  });

  it('区域面板关闭提示走 i18n + 键位真渲染（W-D2 余：不残留字面占位）', () => {
    // 这一格是切片9 收尾时漏的一处：曾经写成 data-i18n + data-params，而 refreshKeyText
    // 只认 data-ktext / data-keys —— 那个写法在运行期把"hud_journal_close_hint"当字面量摆出来。
    // 改走 t() + keyText 之后，这里断言落地的文案是解析过的、且不再含占位或键名。
    // 区名/副标题/描述现在都是文案键（W-D2 切片16i）：夹具也得给键，否则 t() 只会摆出 [MISSING:]
    hud.updateZonePanel({ name: 'zone_name_hub', subtitle: 'zone_subtitle_hub', description: 'zone_desc_hub' });
    const ps = hud.zonePanel.querySelectorAll('p');
    const closeHint = ps[ps.length - 1];
    expect(closeHint.textContent).toContain('关闭');
    expect(closeHint.textContent, '占位没被解析').not.toContain('${zonePanel}');
    expect(closeHint.textContent, '键名当字面量摆出来了').not.toContain('hud_journal_close_hint');
  });

  it('日志标题把键名占位解析进 i18n（同一处漏网：t() 漏传参会摆出 ${journal}）', () => {
    // hud_journal_title 含 ${journal}，调用方必须传 { journal: keyText('{journal}') }；
    // 漏传参时 t() 原样返回 '跨界日志 · ${journal} 关闭'，玩家面前会出现模板语法。
    hud.game.storyJournal = {
      getFiltered: () => [],
      getCounts: () => ({}),
      entries: { length: 0 },
    };
    hud.updateJournal();
    const h2 = hud.journalPanel.querySelector('h2');
    expect(h2.textContent).toContain('跨界日志');
    expect(h2.textContent).toContain('关闭');
    expect(h2.textContent, '占位没被解析').not.toContain('${journal}');
  });
});
