/**
 * 面板之间的来路与退回（W-A7 切片12 / W-D1「真栈」第一格 / 修 **B53**）。
 *
 * B53 的形状：从暂停菜单进"设置"时，菜单调的是 `this.hide()`。一行代码办了两件事 ——
 * 面板收起 + `paused` 被撤掉。于是"暂停"这件事的真源从"菜单开着"搬到了
 * `Game.update()` 里那一串 `.open` 的合取（`canPlay`），而玩家这边看到的是：
 * 关掉设置之后**不在菜单里**了（要再按一次返回重新开一次菜单，而且从头走位）。
 *
 * 这一片把它变成真压着：下层不关，只让位（视觉让位是 CSS，状态不让）。于是
 * - 层表那一行顺序天然回答"先关谁"（切片10 的级联一字不改就管用）；
 * - `topNavLayer` 天然回答"焦点在哪个面板"；
 * - 关掉上层要落回**当初那一格** —— 那份记忆只能有一处（`FocusNav` 的 park / restore），
 *   散到各个面板的私有字段里就是"现在选中谁"的第二个答案（切片11 立的规矩）。
 *
 * 门禁因此两层：行为（真 `PauseMenu` / `HelpManual` / `SettingsPanel` 挂在假 DOM 上被真点击）
 * + 防漂移（写点与读点各只有登记的那几处、旧写法一贴回来就红、下层不许用"看不见也就聚焦不上"的方式让位）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parkFocus, restoreParkedFocus } from '../src/ui/FocusNav.js';
import {
  OVERLAY_LAYERS, topBackLayer, topNavLayer, overlayBlocksHotkeys, OVERLAY_LAYER_BY_STATE,
} from '../src/ui/OverlayStack.js';
import { hotkeyCodeFor, UI_HOTKEYS, UI_NAV_ACTIONS } from '../src/content/hotkeys.js';
import { fakeDoc, fakePanel, fakeItem, fakeBox } from './helpers/fakePanelDom.js';
import { PauseMenu } from '../src/ui/PauseMenu.js';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { HelpManual } from '../src/ui/HelpManual.js';
import { Game } from '../src/core/Game.js';

const SRC = join(process.cwd(), 'src');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  if (statSync(full).isDirectory()) return walk(full);
  const ext = full.slice(full.lastIndexOf('.'));
  return ['.js', '.css'].includes(ext) ? [full] : [];
});

const FILES = walk(SRC).map((f) => ({
  name: f.slice(SRC.length + 1).replace(/\\/g, '/'),
  source: readFileSync(f, 'utf8'),
}));

const sourceOf = (name) => {
  const found = FILES.find((f) => f.name === name);
  expect(found, `${name} 不在了`).toBeTruthy();
  return found.source;
};

const ORIGINAL_DOC = globalThis.document;
const ORIGINAL_WINDOW = globalThis.window;

afterEach(() => {
  globalThis.document = ORIGINAL_DOC;
  globalThis.window = ORIGINAL_WINDOW;
  restoreParkedFocus();      // 一格账：上一片的park不许漏进下一片（测试之间也要"读完即清"）
});

/** 状态进、状态出：字段名一律现问表（抄字面量就是第二份真源） */
const state = (over = {}) => {
  const base = {};
  for (const l of OVERLAY_LAYERS) base[l.state] = false;
  return { ...base, ...over };
};

/* ------------------------------------------- 假 DOM 上挂真面板类 */

/** 真 `PauseMenu` / `SettingsPanel` / `HelpManual` 挂在同一份假 DOM 上（焦点只有一份事实） */
function mount() {
  const doc = fakeDoc({});
  const registry = doc.hosts;
  doc.exitPointerLock = () => {};
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  globalThis.document = doc;
  globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, document: doc };

  const menu = fakePanel(
    ['pause-resume', 'pause-save', 'pause-export', 'pause-import', 'pause-settings', 'pause-manual'],
    doc, 'pause-menu',
  );
  registry['pause-menu'] = menu.host;
  for (const it of menu.items) registry[it.id] = it;
  registry['pause-import-file'] = fakeItem('pause-import-file', { tag: 'input', type: 'file' });

  const settings = fakePanel([{ id: 'set-master-vol', tag: 'input', type: 'range' }], doc, 'settings-panel');
  registry['settings-panel'] = settings.host;
  for (const it of settings.items) registry[it.id] = it;
  registry['settings-close'] = fakeItem('settings-close');

  registry['help-manual'] = fakeBox('help-manual');
  registry['help-nav'] = fakeBox('help-nav');
  registry['help-body'] = fakeBox('help-body');
  registry['help-close'] = fakeItem('help-close');

  const game = {
    paused: false,
    settings: { data: {}, get: () => ({}), set() {}, applyToGame() {} },
    padInput: null,
    rebuildHotkeys() {},
  };
  game.settingsPanel = new SettingsPanel(game);
  game.helpManual = new HelpManual(game);
  game.pauseMenu = new PauseMenu(game);
  const active = () => doc.activeElement?.id ?? null;
  return { doc, game, menu, settings, active };
}

/* -------------------------------------------------- 那一格账（纯函数） */

describe('parkFocus / restoreParkedFocus：焦点历史只有一格账', () => {
  it('park 要的是宿主而不是某一格：宿主由 doc 现查（与生产同一条取法）', () => {
    const doc = fakeDoc();
    const { host, items } = fakePanel(['a', 'b', 'c'], doc, 'pause-menu');
    doc.hosts['pause-menu'] = host;
    items[2].focus();
    expect(parkFocus(host, doc)).toBe(2);
    expect(restoreParkedFocus(doc)).toBe(true);
    expect(doc.activeElement).toBe(items[2]);
    expect(restoreParkedFocus(doc)).toBe(false);            // 同一条来路不退第二次
  });

  it('焦点不在清单里（还在 body）就不记账 —— 没有来路也不许编一条', () => {
    const doc = fakeDoc();
    const { host } = fakePanel(['a', 'b'], doc, 'pause-menu');
    doc.hosts['pause-menu'] = host;
    expect(parkFocus(host, doc)).toBe(-1);
    expect(restoreParkedFocus(doc)).toBe(false);
    expect(doc.activeElement).toBe(null);
  });

  it('退回的是"当初那一格"，不是它的下一格（下标原样，不+offset）', () => {
    const doc = fakeDoc();
    const { host, items } = fakePanel(['a', 'b', 'c'], doc, 'pause-menu');
    doc.hosts['pause-menu'] = host;
    items[1].focus();
    parkFocus(host, doc);
    items[0].focus();                                        // 玩家被别的事挪走了
    expect(restoreParkedFocus(doc)).toBe(true);
    expect(doc.activeElement).toBe(items[1]);
  });

  it('连着 park 两次只留最后那一次（一格账，不是一叠）', () => {
    const doc = fakeDoc();
    const one = fakePanel(['x1', 'x2'], doc, 'panel-one');
    const two = fakePanel(['y1', 'y2'], doc, 'panel-two');
    doc.hosts['panel-one'] = one.host;
    doc.hosts['panel-two'] = two.host;
    one.items[0].focus();
    parkFocus(one.host, doc);
    two.items[1].focus();
    parkFocus(two.host, doc);
    expect(restoreParkedFocus(doc)).toBe(true);
    expect(doc.activeElement).toBe(two.items[1]);
    one.items[0].focus();
    expect(restoreParkedFocus(doc)).toBe(false);            // panel-one 那条早就被覆盖掉了
  });

  it('清单变短了也不抛：下标钳到最后一格', () => {
    const doc = fakeDoc();
    const { host, items } = fakePanel(['a', 'b', 'c'], doc, 'pause-menu');
    doc.hosts['pause-menu'] = host;
    items[2].focus();
    parkFocus(host, doc);
    items.length = 1;                                        // 演"这一格被重绘掉了"
    expect(restoreParkedFocus(doc)).toBe(true);
    expect(doc.activeElement).toBe(items[0]);
  });

  it('宿主查不到（面板不在了）→ false，但账同样清掉：不许留着下次凭空退回去', () => {
    const doc = fakeDoc();
    const { host, items } = fakePanel(['a', 'b'], doc, 'pause-menu');
    doc.hosts['pause-menu'] = host;
    items[1].focus();
    parkFocus(host, doc);
    doc.hosts['pause-menu'] = null;
    expect(restoreParkedFocus(doc)).toBe(false);
    doc.hosts['pause-menu'] = host;
    expect(restoreParkedFocus(doc)).toBe(false);
  });

  it('那一格聚焦不上时回报 false：调过 `focus()` 不等于焦点真的落回去了', () => {
    const doc = fakeDoc();
    const { host, items } = fakePanel(['a', 'b'], doc, 'pause-menu');
    doc.hosts['pause-menu'] = host;
    const original = items[1];
    original.focus();
    expect(parkFocus(host, doc)).toBe(1);
    // 演"重绘之后第 1 格换成了聚焦不上的那一格"（例如被塞成了隐藏控件）
    items[1] = fakeItem('b', { acceptsFocus: false });
    items[1].doc = doc;
    expect(restoreParkedFocus(doc)).toBe(false);
    expect(doc.activeElement).toBe(original);                  // 焦点没被我们"假装"挪动过
  });
});

/* ------------------------------------- 真栈的现状：层表原样管得住两层 */

describe('两层同时开着：级联与焦点仍然只由那张表回答', () => {
  const key = (name) => OVERLAY_LAYER_BY_STATE.get(name);

  it('设置压着菜单：这一下返回归设置，关掉之后才轮到菜单', () => {
    const both = state({ settingsOpen: true, pauseMenuOpen: true });
    expect(topBackLayer(both)).toBe('settings');
    expect(topBackLayer(state({ pauseMenuOpen: true }))).toBe('pauseMenu');
  });

  it('收焦点的面板与吃返回键的面板是同一个（两层都开着时）', () => {
    const both = state({ settingsOpen: true, pauseMenuOpen: true });
    expect(topNavLayer(both).layer).toBe(topBackLayer(both));
    expect(topNavLayer(state({ pauseMenuOpen: true })).layer).toBe('pauseMenu');
  });

  it('真栈不许放宽放行名单：菜单 + 设置同时开着时，除返回与移焦/调值键一概拦住', () => {
    const both = state({ settingsOpen: true, pauseMenuOpen: true });
    for (const e of UI_HOTKEYS) {
      // 放行名单问的是**动作**不是键码：改绑之后 ← 换成别的键照样放行、照样被拦（切片16 加 ← → 一并进这份名单）
      const pass = e.action === 'escape' || UI_NAV_ACTIONS.includes(e.action);
      expect(overlayBlocksHotkeys(both, e.code), `${e.action} (${e.code})`).toBe(!pass);
    }
    expect(overlayBlocksHotkeys(both, hotkeyCodeFor('escape'))).toBe(false);
  });

  it('让位不改变放行判据：菜单单独开着、与设置压着开着，拦的是同一批键', () => {
    // 这条是"真栈不许顺手放宽闸门"的正面证据：多开一层不该让任何热键从菜单底下钻出去
    const alone = state({ pauseMenuOpen: true });
    const both = state({ settingsOpen: true, pauseMenuOpen: true });
    for (const e of UI_HOTKEYS) {
      expect(overlayBlocksHotkeys(both, e.code), `${e.action} (${e.code})`)
        .toBe(overlayBlocksHotkeys(alone, e.code));
    }
  });

  it('升级面板单独开着时仍然连返回都不给：它没有退回的地方，让位机制不许给它加一条', () => {
    const open = state({ upgradeOpen: true });
    for (const code of ['KeyG', 'F10', hotkeyCodeFor('escape'), 'ArrowDown']) {
      expect(overlayBlocksHotkeys(open, code), code).toBe(true);
    }
  });

  it('说明书那条同理：help 排得比菜单靠前，所以先关 help', () => {
    const both = state({ helpOpen: true, pauseMenuOpen: true });
    expect(topBackLayer(both)).toBe('help');
    expect(key('helpOpen').layer).toBe('help');
  });
});

/* ---------------------------------- 真面板类被真点击：让位与退回的行为 */

describe('菜单 → 上层面板：下层让位但不关，退回来落回原来那一格', () => {
  it('点"设置"：菜单仍然开着、仍然暂停，设置压在上面，焦点落进设置第一格', () => {
    const { game, menu, active } = mount();
    game.pauseMenu.show();
    expect(active()).toBe('pause-resume');
    menu.items[4].focus();                                   // 玩家走到"设置"那一格
    menu.items[4].click();                                   // 真点击：走构造函数挂的那个 click 监听
    expect(game.pauseMenu.open).toBe(true);
    expect(game.paused).toBe(true);                          // B53 的正身：进设置不再把暂停撤掉
    expect(game.settingsPanel.open).toBe(true);
    expect(active()).toBe('set-master-vol');
  });

  it('关掉设置（真按返回那条路也走这里）：回到菜单，且焦点在当初那一格', () => {
    const { game, menu, settings, active } = mount();
    game.pauseMenu.show();
    menu.items[4].focus();
    menu.items[4].click();
    game.settingsPanel.hide();
    expect(game.settingsPanel.open).toBe(false);
    expect(game.pauseMenu.open).toBe(true);
    expect(active()).toBe('pause-settings');
    expect(game.paused).toBe(true);
    // 再关菜单：一切回干净，账也清了（第三次按返回是"开菜单"，不是"再退一次"）
    game.pauseMenu.hide();
    settings.host.hidden = true;
    expect(restoreParkedFocus()).toBe(false);
  });

  it('说明书那条路同理：help 让位、hide 时把那一格还给菜单', () => {
    const { game, menu, active } = mount();
    game.pauseMenu.show();
    menu.items[5].focus();
    menu.items[5].click();                                   // 说明书那一格
    expect(game.helpManual.open).toBe(true);
    expect(game.pauseMenu.open).toBe(true);
    expect(game.paused).toBe(true);
    expect(active()).toBe('pause-manual');                   // help 还没有 nav 宿主：焦点留在原处
    game.helpManual.hide();
    expect(game.helpManual.open).toBe(false);
    expect(active()).toBe('pause-manual');
  });

  it('没有来路时（野外直接开设置）关它不回菜单 —— 不许凭空造出一层', () => {
    const { game, active } = mount();
    game.settingsPanel.show();
    expect(game.pauseMenu.open).toBe(false);
    expect(game.paused).toBe(false);                          // 菜单本来就没开：不替玩家暂停
    game.settingsPanel.hide();
    expect(active()).not.toBe('pause-resume');
    expect(restoreParkedFocus()).toBe(false);
  });

  it('鼠标点"关闭"按钮与按返回走的是同一个 hide()（退路只有一条）', () => {
    const { game, menu, active } = mount();
    game.pauseMenu.show();
    menu.items[4].focus();
    menu.items[4].click();
    globalThis.document.getElementById('settings-close').click();
    expect(game.settingsPanel.open).toBe(false);
    expect(game.pauseMenu.open).toBe(true);
    expect(active()).toBe('pause-settings');
  });

  it('退一次就用掉了：第二次关上层不再抢焦点', () => {
    const { game, menu, active } = mount();
    game.pauseMenu.show();
    menu.items[4].focus();
    menu.items[4].click();
    game.settingsPanel.hide();
    expect(active()).toBe('pause-settings');
    // 再进一次设置，但这回没有从菜单走位（野外直接开面板那个形状）：关它不该退到任何地方
    game.settingsPanel.show();
    expect(active()).toBe('set-master-vol');
    game.settingsPanel.hide();
    expect(active()).toBe('set-master-vol');
  });
});

/* ------------------------------------------------------------ 静态门禁 */

describe('静态门禁：来路只有一处写、一处读，旧写法一贴回来就红', () => {
  const callSites = (needle) => FILES
    .filter((f) => !f.name.endsWith('FocusNav.js'))
    .map((f) => ({ name: f.name, n: (f.source.match(needle) || []).length }))
    .filter(({ n }) => n > 0);

  it('`parkFocus(` 只有两处调用：菜单进设置、菜单进说明书', () => {
    expect(callSites(/parkFocus\(/g)).toEqual([
      { name: 'ui/HelpManual.js', n: 1 },
      { name: 'ui/PauseMenu.js', n: 1 },
    ]);
  });

  it('`restoreParkedFocus()` 只在"上层关掉"那一刻调用', () => {
    expect(callSites(/restoreParkedFocus\(/g)).toEqual([
      { name: 'ui/HelpManual.js', n: 1 },
      { name: 'ui/SettingsPanel.js', n: 1 },
    ]);
  });

  it('下层让位不许写回 `hide()`：菜单与说明书两处都不许再关自己（B53 复发）', () => {
    expect(sourceOf('ui/PauseMenu.js'), '菜单又把自己关掉了').not.toMatch(/pauseMenu\.hide\(\)/);
    expect(sourceOf('ui/HelpManual.js'), '说明书又把菜单关掉了').not.toMatch(/pauseMenu\.hide\(\)/);
    const handler = sourceOf('ui/PauseMenu.js')
      .match(/getElementById\('pause-settings'\)[\s\S]*?\}\);/);
    expect(handler, '找不到"设置"那一格的处理器').toBeTruthy();
    expect(handler[0], '让位那一下又调了 this.hide()').not.toContain('this.hide()');
  });

  it('还焦点必须在面板收起之后：先 `classList.add(\'hidden\')` 再 `restoreParkedFocus()`', () => {
    for (const name of ['ui/SettingsPanel.js', 'ui/HelpManual.js']) {
      const body = sourceOf(name).match(/hide\(\)\s*\{[\s\S]*?\n {2}\}/);
      expect(body, `${name} 找不到 hide() 的方法体`).toBeTruthy();
      const hid = body[0].indexOf("classList.add('hidden')");
      const back = body[0].indexOf('restoreParkedFocus(');
      expect(back, `${name} 关掉之后没有还焦点`).toBeGreaterThan(-1);
      expect(hid).toBeGreaterThanOrEqual(0);
      expect(back, `${name} 还焦点排在收起之前（下层还被压暗时落不进去）`).toBeGreaterThan(hid);
    }
  });

  it('"焦点原来在哪"只有一处记：面板里不许再开一份私有账', () => {
    const forbidden = /(?:cameFrom|fromLayer|parentLayer|previousLayer|prevOverlay|lastOverlay|openFrom|backLayer)/;
    const offenders = FILES
      .filter((f) => forbidden.test(f.source))
      .map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it('这条扫描咬得住：把一份私有账贴进面板立刻被抓（防空跑门禁）', () => {
    const original = sourceOf('ui/PauseMenu.js');
    const smuggled = original.replace(
      'parkFocus(this.panel);',
      'this._cameFrom = true; parkFocus(this.panel);',
    );
    expect(smuggled, '锚点没命中：让位那一行的写法变了，请把这条自证一起改').not.toBe(original);
    const forbidden = /(?:cameFrom|fromLayer|parentLayer|previousLayer|prevOverlay|lastOverlay|openFrom|backLayer)/;
    expect(forbidden.test(original), '现写法本来就不该有私有账').toBe(false);
    expect(forbidden.test(smuggled), '私有账没被抓到').toBe(true);
  });

  it('FocusNav 里那格账只有两处写：记下与清掉（不许多一个入口）', () => {
    const src = sourceOf('ui/FocusNav.js');
    expect((src.match(/\bparked = /g) || []).length).toBe(3);   // 声明时的 null + park 一处 + 清一处
    expect((src.match(/^let parked/mg) || []).length).toBe(1);
  });

  it('清单的唯一生产者仍然是 `navItems`：park 与 restore 不许自己再问一遍 DOM', () => {
    const src = sourceOf('ui/FocusNav.js');
    const navBody = src.match(/export function navItems[\s\S]*?\n\}/);
    expect(navBody, '找不到 navItems 的函数体').toBeTruthy();
    expect(src.replace(navBody[0], ''), '第二份清单算式').not.toContain('querySelectorAll');
    expect(navBody[0]).toContain('Array.from(host.querySelectorAll(NAV_SELECTOR))');
  });

  it('视觉让位靠 CSS 而不是"藏起来"：下层用 opacity 让位（藏起来就聚焦不回去了）', () => {
    const css = sourceOf('style.css');
    const rule = css.match(/body:has\(#settings-panel:not\(\.hidden\)\) #pause-menu,[\s\S]*?\{[^}]*\}/);
    expect(rule, '找不到压在下面的让位规则').toBeTruthy();
    expect(rule[0]).toContain('opacity: 0');
    expect(rule[0]).toContain('pointer-events: none');
    expect(rule[0], 'visibility / display 会让那一格聚焦不上').not.toMatch(/visibility|display:\s*none/);
    expect(css).toContain('body:has(#help-manual:not(.hidden)) #pause-menu');
  });

  it('这条也咬得住：把让位改成 visibility 版本立刻红（自证）', () => {
    const original = sourceOf('style.css');
    const smuggled = original.replace('  opacity: 0;\n  pointer-events: none;', '  visibility: hidden;');
    expect(smuggled, '锚点没命中：让位规则的写法变了').not.toBe(original);
    const isHiddenWay = (css) => {
      const rule = css.match(/body:has\(#settings-panel:not\(\.hidden\)\) #pause-menu,[\s\S]*?\{[^}]*\}/);
      return !rule || /visibility|display:\s*none/.test(rule[0]) || !rule[0].includes('opacity: 0');
    };
    expect(isHiddenWay(original), '现写法本该是 opacity 让位').toBe(false);
    expect(isHiddenWay(smuggled), 'visibility 版本没被抓到').toBe(true);
  });

  it('焦点这件事仍然只住在一个文件里（切片11 那条规矩没被本片破坏）', () => {
    const readers = FILES
      .filter((f) => f.name !== 'ui/FocusNav.js' && /\.(?:focus\(\)|activeElement)/.test(f.source))
      .map((f) => f.name);
    expect(readers).toEqual([]);
  });

  it('两处让位记的都是"脚下这个面板"：park 的参数不许指错', () => {
    // 记错对象 = 退回去时落在别处（或干脆落不回去），而行为测试只看得见"没落回去"这一半
    expect(sourceOf('ui/PauseMenu.js')).toContain('parkFocus(this.panel);');
    expect(sourceOf('ui/HelpManual.js')).toContain('parkFocus(this.game.pauseMenu.panel);');
  });

  it('park 只吃层表登记过的宿主：新面板要进来必须先登记 `nav`（不许多一份名单）', () => {
    const hosts = OVERLAY_LAYERS.filter((l) => l.nav).map((l) => l.nav).sort();
    expect(hosts).toEqual(['fast-travel-panel', 'help-manual', 'pause-menu', 'settings-panel']);
    // 让位那两处写的必须是层表里登记过的宿主，而不是现场再抄一个 DOM id
    for (const name of ['ui/PauseMenu.js', 'ui/HelpManual.js']) {
      const parkLine = sourceOf(name).match(/parkFocus\(([^)]*)\);/);
      expect(parkLine, `${name} 没有 parkFocus 这一行`).toBeTruthy();
      expect(parkLine[1], `${name} 的 park 参数不是面板自己的宿主`).not.toMatch(/getElementById/);
    }
  });

  it('下层面板让位时不许被 hide：两个让位点都只 park + show 上层', () => {
    // 注释里会提到 `hide()`（就是要解释为什么不用它），所以先剥掉注释再判代码形状
    const codeOnly = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const pause = codeOnly(sourceOf('ui/PauseMenu.js').match(/getElementById\('pause-settings'\)[\s\S]*?\}\);/)[0]);
    expect(pause, '让位那一下又去关下层面板了（B53 复发）').not.toMatch(/hide\(/);
    const help = codeOnly(sourceOf('ui/HelpManual.js').match(/getElementById\('pause-manual'\)[\s\S]*?\}\);/)[0]);
    expect(help, '让位那一下又去关下层面板了（B53 复发）').not.toMatch(/hide\(/);
    expect(pause).toContain('parkFocus(');
    expect(help).toContain('parkFocus(');
  });

  it('真栈不许长出第二套排序：层表里不许出现"自己记一层"的名字', () => {
    const src = sourceOf('ui/OverlayStack.js');
    // 这一片要防的不是"栈"这个字（文件名与测试名里都有），而是**又建了一套顺序**：
    // 一旦层表里出现 layerStack / stackOrder / pushLayer 这类东西，"先关谁"就同时住在两处
    expect(src, '层表之外又建了一套栈（吃返回键的顺序就有了两个答案）')
      .not.toMatch(/layerStack|modalStack|stackOrder|pushLayer|popLayer|pushedFrom|\btrail\b/i);
  });

  it('层表每行仍然只有那五个键：这一片没往里加"压着谁 / 从哪来"那种列', () => {
    // 允许的形状只有两种（有 `nav` 与没 `nav`）；多出一列 = 层表之外又养了一套顺序
    for (const l of OVERLAY_LAYERS) {
      expect(Object.keys(l).sort().join(','), `层 "${l.layer}" 的列变了`)
        .toMatch(/^back,blocks,layer,(nav,)?state$/);
    }
  });

  it('级联里每一档只关自己那一层：`runEscape` 不许顺手把下层一起撤掉', () => {
    const body = sourceOf('core/Game.js').match(/runEscape\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 runEscape 的方法体').toBeTruthy();
    for (const m of body[0].matchAll(/case '(settings|help|fastTravel|worldMap)': return this\.([A-Za-z]+)\.hide\(\);/g)) {
      expect(m[0], `${m[1]} 那一档多关了别的面板`).not.toContain('pauseMenu');
    }
    expect(body[0]).toMatch(/case 'settings': return this\.settingsPanel\.hide\(\);/);
    expect(body[0]).toMatch(/case 'help': return this\.helpManual\.hide\(\);/);
  });

  it('park 与 restore 只吃宿主与下标这一对：不许改成一叠（一格账的形状就是它的契约）', () => {
    const src = sourceOf('ui/FocusNav.js');
    expect(src, '账本变成了数组 = 两格账又回到面板各自记').not.toMatch(/parked\s*=\s*\[/);
  });
});

/* ------------------------------------- 真 `runEscape`：两层开着只关最上面那层 */

describe('`Game.runEscape` 走真级联：让位之后返回键仍然归上层', () => {
  const mkGame = (open) => {
    const calls = [];
    const panel = (name, flag) => ({
      open: flag,
      hide: () => { calls.push(name); },
    });
    return {
      game: {
        paused: open.pauseMenu,
        cinematicActive: false,
        worldMapPanel: panel('worldMap', open.worldMap),
        playerAutoPlay: { active: false, stop: () => calls.push('autoPlay') },
        helpManual: panel('help', open.help),
        settingsPanel: panel('settings', open.settings),
        fastTravelPanel: panel('fastTravel', open.fastTravel),
        pauseMenu: { ...panel('pauseMenu', open.pauseMenu), toggle: () => calls.push('pauseMenu.toggle') },
        dialog: panel('dialog', open.dialog),
        upgrade: panel('upgrade', open.upgrade),
        cinematics: { skip: () => calls.push('cinematic') },
        endCredits: null,
        combatCinematicSkip: null,
        overlayState: Game.prototype.overlayState,
        runEscape: Game.prototype.runEscape,
      },
      calls,
    };
  };

  it('设置压着菜单：这一下只关设置，菜单一下都不许被顺手关掉', () => {
    const { game, calls } = mkGame({ settings: true, pauseMenu: true });
    game.runEscape();
    expect(calls).toEqual(['settings']);
  });

  it('说明书压着菜单：同理只关说明书', () => {
    const { game, calls } = mkGame({ help: true, pauseMenu: true });
    game.runEscape();
    expect(calls).toEqual(['help']);
  });

  it('只剩菜单开着：这一下才轮到关菜单', () => {
    const { game, calls } = mkGame({ pauseMenu: true });
    game.runEscape();
    expect(calls).toEqual(['pauseMenu.toggle']);
  });

  it('什么都没开着：返回键仍然是"开菜单"（切片10 那条兜底没被改掉）', () => {
    const { game, calls } = mkGame({});
    game.runEscape();
    expect(calls).toEqual(['pauseMenu.toggle']);
  });
});
