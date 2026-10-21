/**
 * 焦点陷阱（W-D6 切片14）。
 *
 * ## 这片防的是什么
 *
 * 模态开着时，Tab **不在热键表里派发**（它出厂绑的是 `zonePanel`，被 `overlayBlocksHotkeys`
 * 拦下），于是路由器不做 `preventDefault` —— 浏览器自己那一指"走到下一个可聚焦元素"就此漏了
 * 过去。症状是焦点走出模态：暂停菜单压着设置面板时，设置面板那一层已被 CSS 让位成
 * `opacity: 0`（鼠标点不着，`style.css` 那条 `body:has(...)`），但 Tab 走得进去；对话框那条
 * 更早，焦点会一路落到 `#game-guide` / `#autoplay-fab` 上。玩家按一下 Tab，看得见的模态还开着，
 * 焦点已经在看不见的地方，再按 Enter 触发的是背后的东西。
 *
 * ## 三条判据各有一种死法
 *
 * 1. **该不该拦只能问层表**：顶层那一层登记了 `nav` 宿主才拦。自己另写一份"哪些面板开着"的
 *    清单，那天层表加一层（或改顺序）陷阱就跟不上 —— 与 B46 同族。
 * 2. **落点只能走 `FocusNav` 那一份清单**：`moveFocusWithin` 自带环绕，Tab 与 Shift+Tab
 *    因此都在模态里打转，不会掉出模态。
 * 3. **没有宿主就不拦**：世界地图 / 自动演示 / 过场这几层没有 `nav`，强行拦下等于把 Tab
 *    吞掉（玩家按了没反应且焦点一动不动）。与"方向键在野外是死键"同一条口径。
 *
 * 另有一条静态门禁钉住接线本身：`Game` 的 keydown 监听里仍然一个键码字面量都没有
 * （`Tab` 那个字面量住在 `ui/FocusNav.js`，因为"浏览器哪个键管移焦"是焦点知识），
 * 且监听里真的调用了陷阱那一格。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/core/Game.js';
import { UI_HOTKEYS, UI_ACTIONS, hotkeyCodeFor, setHotkeyTable } from '../src/content/hotkeys.js';
import { fakeDoc, fakePanel } from './helpers/fakePanelDom.js';

const sourceOf = (rel) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

/**
 * 假 game：只给 `overlayState()` 真读的那几格。与 `focus-nav` 那片各写一份是故意的 ——
 * 那边的 `worldMapPanel` 是光壳，这边要多开几层、还要真的把焦点落进宿主。
 * 层表那半边不走私货：`overlayState` 调的是 `Game.prototype` 真身。
 */
const trapGame = (overrides = {}) => {
  const g = {
    worldMapPanel: { open: false },
    playerAutoPlay: { active: false },
    helpManual: { open: false },
    cinematicActive: false,
    settingsPanel: { open: false },
    fastTravelPanel: { open: false },
    pauseMenu: { open: false },
    dialog: { open: false },
    upgrade: { open: false },
    ...overrides,
  };
  g.overlayState = () => Game.prototype.overlayState.call(g);
  g.overlayStack = {
    toStateMap: () => ({
      worldMapOpen: !!(g.worldMapPanel?.open),
      autoPlayActive: !!(g.playerAutoPlay?.active),
      helpOpen: !!(g.helpManual?.open),
      cinematicActive: !!g.cinematicActive,
      settingsOpen: !!(g.settingsPanel?.open),
      fastTravelOpen: !!(g.fastTravelPanel?.open),
      pauseMenuOpen: !!(g.pauseMenu?.open),
      dialogOpen: !!(g.dialog?.open),
      upgradeOpen: !!(g.upgrade?.open),
      journalOpen: !!(g.hud?.journalOpen),
    }),
  };
  return g;
};

/** 按一下 Tab（或 Shift+Tab），走的是生产那条 `Game.prototype.trapFocusKey` */
const pressTab = (g, shift = false) =>
  Game.prototype.trapFocusKey.call(g, { code: 'Tab', shiftKey: shift });

afterEach(() => {
  delete globalThis.document;
  setHotkeyTable(UI_HOTKEYS);
});

describe('模态开着：Tab 在顶层那一层的清单里环绕', () => {
  it('从外面进来落第一格，再按往下走，到底绕回第一格', () => {
    const g = trapGame({ pauseMenu: { open: true } });
    const doc = fakeDoc();
    const menu = fakePanel(['resume', 'save', 'settings-btn', 'quit'], doc);
    doc.hosts['pause-menu'] = menu.host;
    globalThis.document = doc;

    expect(pressTab(g)).toBe(true);
    expect(menu.active()).toBe('resume');
    expect(pressTab(g)).toBe(true);
    expect(menu.active()).toBe('save');
    expect(pressTab(g)).toBe(true);
    expect(menu.active()).toBe('settings-btn');
    expect(pressTab(g)).toBe(true);
    expect(menu.active()).toBe('quit');
    expect(pressTab(g)).toBe(true);
    expect(menu.active(), '环绕：最后一格再 Tab 回第一格，不会掉出模态').toBe('resume');
  });

  it('Shift+Tab 反向环绕：第一格再往上落最后一格', () => {
    const g = trapGame({ pauseMenu: { open: true } });
    const doc = fakeDoc();
    const menu = fakePanel(['resume', 'save'], doc);
    doc.hosts['pause-menu'] = menu.host;
    globalThis.document = doc;

    expect(pressTab(g)).toBe(true);
    expect(menu.active()).toBe('resume');
    expect(pressTab(g, true)).toBe(true);
    expect(menu.active()).toBe('save');
  });

  it('焦点始终留在模态宿主里：每一步之后 activeElement 都是那一格清单上的', () => {
    const g = trapGame({ dialog: { open: true } });
    const doc = fakeDoc();
    const dialog = fakePanel(['continue', 'accept'], doc);
    doc.hosts['dialog-overlay'] = dialog.host;
    globalThis.document = doc;

    for (let i = 0; i < 6; i++) {
      expect(pressTab(g)).toBe(true);
      expect(dialog.items.map((e) => e.id)).toContain(doc.activeElement?.id);
    }
  });
});

describe('层表说谁在最上面：Tab 就归谁', () => {
  it('设置压着暂停菜单：Tab 归设置，暂停菜单一格都没被碰', () => {
    const g = trapGame({ pauseMenu: { open: true }, settingsPanel: { open: true } });
    const doc = fakeDoc();
    const menu = fakePanel(['resume'], doc);
    const settings = fakePanel(['master-vol', 'close'], doc);
    doc.hosts['pause-menu'] = menu.host;
    doc.hosts['settings-panel'] = settings.host;
    globalThis.document = doc;

    expect(pressTab(g)).toBe(true);
    expect(settings.active()).toBe('master-vol');
    expect(pressTab(g)).toBe(true);
    expect(settings.active()).toBe('close');
    // 下层一格都没被聚焦过：焦点现状只有一份，所以要看 focus 次数而不是"菜单以为谁在前"
    expect(menu.items.map((e) => e.focusCount)).toEqual([0]);
  });

  it('世界地图开着（没有 nav 宿主）：不拦，浏览器照旧', () => {
    const g = trapGame({ worldMapPanel: { open: true } });
    const doc = fakeDoc();
    const menu = fakePanel(['resume'], doc);
    doc.hosts['pause-menu'] = menu.host;      // 宿主都在，只是层表不收
    globalThis.document = doc;
    expect(pressTab(g)).toBe(false);
    expect(doc.activeElement).toBe(null);
  });

  it('野外（什么都没开）：不拦', () => {
    const g = trapGame();
    const doc = fakeDoc();
    globalThis.document = doc;
    expect(pressTab(g)).toBe(false);
    expect(pressTab(g, true)).toBe(false);
  });

  it('宿主不在 DOM 里（还没渲染）：不拦，不抛', () => {
    const g = trapGame({ pauseMenu: { open: true } });
    globalThis.document = fakeDoc();          // 一个宿主都没给
    expect(pressTab(g)).toBe(false);
  });
});

describe('只管浏览器那一指', () => {
  it('别的键一律不拦：方向键 / 字母键都不是焦点陷阱的事', () => {
    const g = trapGame({ pauseMenu: { open: true } });
    const doc = fakeDoc();
    const menu = fakePanel(['resume'], doc);
    doc.hosts['pause-menu'] = menu.host;
    globalThis.document = doc;
    for (const code of ['ArrowDown', 'KeyW', 'Escape', 'Enter', 'KeyG']) {
      expect(Game.prototype.trapFocusKey.call(g, { code, shiftKey: false }), code).toBe(false);
    }
    expect(doc.activeElement).toBe(null);
  });
});

describe('静态门禁：接线与分工', () => {
  it('keydown 监听里真的接了陷阱那一格，且仍然一个键码字面量都没有', () => {
    const game = sourceOf('core/Game.js');
    const listener = game.match(/addEventListener\('keydown'[\s\S]*?\n\s{4}\}\)/);
    expect(listener, '找不到 keydown 监听器').toBeTruthy();
    expect(listener[0]).toMatch(/this\.trapFocusKey\(e\)/);
    expect(listener[0]).not.toMatch(/e\.code ===/);
    // `Tab` 那个字面量住在 FocusNav（"浏览器哪个键管移焦"是焦点知识），Game 不问键码
    expect(game).not.toMatch(/'(Key[A-Z]|Tab|Escape|Arrow(Up|Down|Left|Right)|Space|Enter|Backquote|F\d{1,2})'/);
  });

  it('trapFocusKey 问的是层表（topNavLayer），不自己开一份"哪些面板开着"的清单', () => {
    const game = sourceOf('core/Game.js');
    const body = game.match(/trapFocusKey\(e\)\s*\{[\s\S]*?\n\s{2}\}/);
    expect(body, '找不到 trapFocusKey 的函数体').toBeTruthy();
    expect(body[0]).toContain('topNavLayer(this.overlayState())');
    expect(body[0]).toContain('trapTabFocus(');
  });

  it('`Tab` 出厂仍绑 zonePanel：没模态时它照旧切区域面板，这一指没被陷阱抢走', () => {
    setHotkeyTable(UI_HOTKEYS);
    expect(hotkeyCodeFor('zonePanel')).toBe('Tab');
    expect(UI_ACTIONS).toContain('zonePanel');
  });
});