/**
 * 模态层清单（W-A7 切片10 / 修 **B46**）。
 *
 * B46 的形状：「面板开着时哪些热键被挡」与「这一下返回键归谁」是同一件事的两半，
 * 却长在两个函数里 —— `hotkeyBlockedBy` 的名单连 Escape 一起挡，`escapeRoute` 的级联
 * 压根没有 settings / fastTravel 两层。结果是"从暂停菜单进设置、再按 Escape 想退回去"
 * 这条路根本不存在（设置面板把包括返回键在内的所有键都吃了），而级联里多出来的那两层
 * 永远轮不到。
 *
 * 这一片的门禁因此分两路：
 * 1. **行为**：一张表答完两个问题（谁吃返回键 / 谁挡别的键），逐层、逐对、逐码验；
 * 2. **防漂移**：表的 `state` 名必须与 `Game.overlayState()` 返回的键一一对齐，
 *    `runEscape` 必须为每个 `back: true` 的层准备一个 case 且不多不少，
 *    `HotkeyRouter.js` 里不许再出现第二份名单或第二套顺序。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { UI_HOTKEYS, UI_NAV_ACTIONS, hotkeyCodeFor, applyHotkeyOverrides, setHotkeyTable, isMapPassThrough, isNavCode } from '../src/content/hotkeys.js';
import {
  OVERLAY_LAYERS,
  OVERLAY_LAYER_BY_STATE,
  assertOverlayLayers,
  topBackLayer,
  topNavLayer,
  overlayBlocksHotkeys,
} from '../src/ui/OverlayStack.js';
import { HotkeyRouter, escapeRoute, hotkeyBlockedBy } from '../src/ui/HotkeyRouter.js';

const SRC = join(process.cwd(), 'src');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.js$/.test(n) ? [full] : [];
});

const FILES = walk(SRC).map((f) => ({ name: f.slice(SRC.length + 1).replace(/\\/g, '/'), source: readFileSync(f, 'utf8') }));
const sourceOf = (name) => {
  const found = FILES.find((f) => f.name === name);
  expect(found, `${name} 不在了`).toBeTruthy();
  return found.source;
};

const LAYER_NAMES = ['endCredits', 'dialog', 'worldMap', 'autoPlay', 'help', 'cinematic',
  'settings', 'fastTravel', 'pauseMenu', 'combatCinematic', 'upgrade'];

/** 状态进、状态出：字段名全部现问表；写错一个状态名立刻红（测试里的字面量也因此被钉住） */
const state = (over = {}) => {
  const base = {};
  for (const l of OVERLAY_LAYERS) base[l.state] = false;
  for (const k of Object.keys(over)) {
    expect(OVERLAY_LAYER_BY_STATE.has(k), `状态名 "${k}" 不在层表里`).toBe(true);
  }
  return { ...base, ...over };
};

/** 表里"吃返回键"的层与"不吃"的层（切片10 之后只剩升级面板一个硬模态：它没有返回路径） */
const BACK = OVERLAY_LAYERS.filter((l) => l.back).map((l) => l.layer);
const HARD = OVERLAY_LAYERS.filter((l) => !l.back).map((l) => l.layer);

/** 层名 → 状态字段名（一律现问表，测试里抄字面量就是第二份真源） */
const stateKey = (layer) => OVERLAY_LAYERS.find((l) => l.layer === layer).state;

const OTHER_CODES = ['KeyH', 'KeyM', 'KeyG', 'Tab', 'Digit1', 'F2', 'F10', 'KeyP'];

/* ------------------------------------------------------------ 表本身 */

describe('一张表：层序、字段名与 blocks 的取值域', () => {
  it('层名与顺序 = 那份产品决策本身，动它必须过这里', () => {
    expect(OVERLAY_LAYERS.map((l) => l.layer)).toEqual(LAYER_NAMES);
  });
  it('出厂表自检通过，且 `blocks` 只允许 true / false / \'map\'', () => {
    expect(() => assertOverlayLayers()).not.toThrow();
    expect(() => assertOverlayLayers([{ layer: 'a', state: 'x', blocks: 'yes' }])).toThrow(/blocks/);
  });

  it('重复的 state 或重复的层名在加载期就抛（不许等到按下才炸）', () => {
    expect(() => assertOverlayLayers([
      { layer: 'a', state: 'same', blocks: true },
      { layer: 'b', state: 'same', blocks: false },
    ])).toThrow(/状态字段重复/);
    expect(() => assertOverlayLayers([
      { layer: 'dup', state: 'x', blocks: true },
      { layer: 'dup', state: 'y', blocks: true },
    ])).toThrow(/名字重复/);
  });

  it("走放行名单的只有世界地图那一层；切片24 之后**没有不吃返回键的一层**", () => {
    expect(OVERLAY_LAYERS.filter((l) => l.blocks === 'map').map((l) => l.layer)).toEqual(['worldMap']);
    // 切片10 那一版把升级面板留成唯一硬模态（只能鼠标点"继续探索"）—— 真浏览器读数里
    // Escape / ↑↓ / Tab / 手柄 B / A / Start 六条路全都不改变任何东西，纯手柄玩家退不出去（B55）。
    // 今天它是普通模态：`HARD` 该是空表，哪天有人再加一行 `back:false`，这里会红得很有说服力
    expect(HARD, '又出现了一层不吃返回键的面板：那必须是"鼠标之外真的没有路"才行').toEqual([]);
    expect(BACK).toEqual(LAYER_NAMES.filter((n) => !HARD.includes(n)));
  });

  it('每一行逐字钉死：back / blocks / nav 的改动必须由人在这里签字（表不许自己给自己发通行证）', () => {
    // 上面那些"按列循环"的用例读的就是这张表本身，改表内容它们会跟着变 —— 所以逐行快照是唯一能咬住内容漂移的地方
    expect(OVERLAY_LAYERS.map((l) => `${l.layer}|${l.state}|${l.back ? 'back' : 'hard'}|${l.blocks}|${l.nav ?? '-'}`)).toEqual([
      'endCredits|endCreditsSkippable|back|false|-',
      'dialog|dialogOpen|back|true|-',
      'worldMap|worldMapOpen|back|map|-',
      'autoPlay|autoPlayActive|back|false|-',
      'help|helpOpen|back|true|help-manual',
      'cinematic|cinematicActive|back|false|-',
      'settings|settingsOpen|back|true|settings-panel',
      'fastTravel|fastTravelOpen|back|true|fast-travel-panel',
      'pauseMenu|pauseMenuOpen|back|true|pause-menu',
      'combatCinematic|combatCinematicSkippable|back|false|-',
      'upgrade|upgradeOpen|back|true|upgrade-panel',   // 切片24：从硬模态改成吃得掉、走得进的一层（B55）
    ]);
  });

  it('对话压在地图之前、演出压在菜单之后（这两处顺序都是签字过的产品决策）', () => {
    expect(BACK.indexOf('dialog')).toBeLessThan(BACK.indexOf('worldMap'));
    expect(BACK.indexOf('pauseMenu')).toBeLessThan(BACK.indexOf('combatCinematic'));
    expect(BACK.indexOf('cinematic')).toBeLessThan(BACK.indexOf('combatCinematic'));
    expect(topBackLayer(state({ [stateKey('dialog')]: true, [stateKey('worldMap')]: true }))).toBe('dialog');
    // 演出让路给菜单：菜单开着时那一下归菜单，跳演出留给下一次
    expect(topBackLayer(state({ [stateKey('pauseMenu')]: true, [stateKey('combatCinematic')]: true }))).toBe('pauseMenu');
  });

  it('每一层的状态字段名能反查回自己（消费方按字段名进表）', () => {
    for (const l of OVERLAY_LAYERS) {
      expect(OVERLAY_LAYER_BY_STATE.get(l.state)).toBe(l);
    }
  });
});

/* -------------------------------------------------------- 谁吃返回键 */

describe('topBackLayer：这一下返回归哪一层', () => {
  it('什么都没开着 → 返回键归暂停菜单（那是"打开它"，不是关掉什么）', () => {
    expect(topBackLayer(state())).toBe('pauseMenu');
    expect(escapeRoute(state())).toBe(topBackLayer(state()));   // 旧名字只是转发
  });

  it('逐层单独为真各归其主；两个硬模态不吃级联', () => {
    for (const name of BACK) {
      expect(topBackLayer(state({ [stateKey(name)]: true })), name).toBe(name);
    }
    for (const name of HARD) {
      expect(topBackLayer(state({ [stateKey(name)]: true })), `${name} 不该吃返回键`).toBe('pauseMenu');
    }
  });

  it('任意两层同时开着：表里靠前那个吃掉（全对遍历，插一层就红）', () => {
    for (let i = 0; i < BACK.length; i += 1) {
      for (let j = i + 1; j < BACK.length; j += 1) {
        const a = stateKey(BACK[i]);
        const b = stateKey(BACK[j]);
        expect(topBackLayer(state({ [a]: true, [b]: true })), `${BACK[i]} vs ${BACK[j]}`)
          .toBe(BACK[i]);
      }
    }
  });

  it('整条阶梯：从上往下逐层让位，次序与表完全一致', () => {
    const open = {};
    for (const l of OVERLAY_LAYERS) if (l.back) open[l.state] = true;
    for (const name of BACK) {
      expect(topBackLayer(state(open)), name).toBe(name);
      delete open[stateKey(name)];
    }
    expect(topBackLayer(state(open))).toBe('pauseMenu');
  });

  it('切片10 新增的两层（设置 / 快速旅行）真的在级联里，且排在暂停菜单之前', () => {
    expect(topBackLayer(state({ [stateKey('settings')]: true, [stateKey('pauseMenu')]: true }))).toBe('settings');
    expect(topBackLayer(state({ [stateKey('fastTravel')]: true, [stateKey('pauseMenu')]: true }))).toBe('fastTravel');
  });
});

/* -------------------------------------------------- 焦点归哪一层 */

describe('topNavLayer：↑↓ 走进哪个面板（切片11，与返回键同一张表）', () => {
  const NAV = OVERLAY_LAYERS.filter((l) => l.nav).map((l) => l.layer);

  it('登记的层就是"焦点进得去"的那几层：说明书 / 设置 / 快速旅行 / 暂停菜单 / 升级面板', () => {
    // 升级面板那九格（三张页签 + 五项属性 + 继续探索）一直在那里，只是没人认领（切片24 / B55）
    expect(NAV).toEqual(['help', 'settings', 'fastTravel', 'pauseMenu', 'upgrade']);
  });

  it('世界地图刻意不在名单里：那一格里只有"关闭"一格可停，认领它是给自己加一个假落点', () => {
    // 地图真正缺的是平移/缩放的键盘入口（那是要新登记动作的事），不是"焦点落在关闭按钮上"
    expect(NAV).not.toContain('worldMap');
    expect(topNavLayer(state({ worldMapOpen: true }))).toBe(null);
  });

  it('说明书与快速旅行各自压着菜单时：接焦点的与吃返回键的是同一个面板', () => {
    for (const upper of ['help', 'fastTravel']) {
      const row = OVERLAY_LAYERS.find((l) => l.layer === upper);
      const both = state({ [row.state]: true, pauseMenuOpen: true });
      expect(topBackLayer(both), upper).toBe(upper);
      expect(topNavLayer(both).layer, upper).toBe(topBackLayer(both));
    }
  });

  it('野外（全关）没有面板收焦点：↑↓ 落空是正确答案，不是漏判', () => {
    expect(topNavLayer(state())).toBe(null);
    for (const l of OVERLAY_LAYERS.filter((x) => !x.nav)) {
      expect(topNavLayer(state({ [l.state]: true })), l.layer).toBe(null);
    }
  });

  it('两个收焦点的层同时开着：表里靠前那个接住，且与 `topBackLayer` 说的是同一个面板', () => {
    const both = state({ settingsOpen: true, pauseMenuOpen: true });
    expect(topNavLayer(both).layer).toBe('settings');
    expect(topBackLayer(both)).toBe(topNavLayer(both).layer);
  });

  it('不收返回键的层不许认领焦点：那样那一格焦点永远走不进去（↑↓ 被硬模态挡在外面）', () => {
    expect(() => assertOverlayLayers([
      { layer: 'hard', state: 'x', blocks: true, back: false, nav: 'some-host' },
    ])).toThrow(/不吃返回键/);
    expect(() => assertOverlayLayers([
      { layer: 'a', state: 'x', blocks: false, back: true, nav: 'same-host' },
      { layer: 'b', state: 'y', blocks: false, back: true, nav: 'same-host' },
    ])).toThrow(/被两层认领/);
    expect(() => assertOverlayLayers([
      { layer: 'a', state: 'x', blocks: false, back: true, nav: '' },
    ])).toThrow(/DOM id/);
  });
});

/* ------------------------------------------------------------ 挡不挡 */

describe('overlayBlocksHotkeys：有返回层的模态只放行返回键本身', () => {
  afterEach(() => setHotkeyTable(UI_HOTKEYS));

  it('模态全关：谁都不拦', () => {
    for (const code of [...OTHER_CODES, hotkeyCodeFor('escape')]) {
      expect(overlayBlocksHotkeys(state(), code), code).toBe(false);
    }
  });

  it('每一层单独开着时，判据只由 `blocks` 那一列决定（不靠函数里再抄名单）', () => {
    const back = hotkeyCodeFor('escape');
    for (const l of OVERLAY_LAYERS) {
      const open = state({ [l.state]: true });
      if (l.blocks === false) {
        for (const code of OTHER_CODES) {
          expect(overlayBlocksHotkeys(open, code), `${l.layer} + ${code}`).toBe(false);
        }
      } else if (l.blocks === 'map') {
        expect(overlayBlocksHotkeys(open, 'KeyH'), l.layer).toBe(true);
        expect(overlayBlocksHotkeys(open, hotkeyCodeFor('zonePanel')), l.layer).toBe(false);
      } else if (l.back) {
        expect(overlayBlocksHotkeys(open, back), `${l.layer} 的返回键`).toBe(false);
        for (const code of OTHER_CODES) {
          expect(overlayBlocksHotkeys(open, code), `${l.layer} + ${code}`).toBe(true);
        }
      } else {
        expect(overlayBlocksHotkeys(open, back), `${l.layer} 连返回键都挡`).toBe(true);
      }
    }
  });

  it('升级面板今天是有返回层的一层（切片24 / B55）：别的 UI 热键照挡，返回键交给级联', () => {
    const open = state({ upgradeOpen: true, worldMapOpen: true });
    expect(overlayBlocksHotkeys(open, 'KeyG')).toBe(true);
    expect(overlayBlocksHotkeys(open, 'Tab')).toBe(true);
    // 返回键不再被挡。级联按层序吃：地图排在前面，所以这一下先还地图的自由，升级面板留到下一次
    expect(overlayBlocksHotkeys(open, hotkeyCodeFor('escape'))).toBe(false);
    expect(topBackLayer(open)).toBe('worldMap');
    expect(topBackLayer(state({ upgradeOpen: true })), '单开升级面板时，这一下该由它吃掉').toBe('upgrade');
  });

  it('对话不是硬模态：它 + 地图时按有返回层的模态算（B52 之后它归级联管）', () => {
    const open = state({ dialogOpen: true, worldMapOpen: true });
    expect(overlayBlocksHotkeys(open, 'KeyG')).toBe(true);
    expect(overlayBlocksHotkeys(open, 'Tab')).toBe(true);
    expect(overlayBlocksHotkeys(open, hotkeyCodeFor('escape'))).toBe(false);
  });

  it('地图 + 有返回层的模态：模态说话，但返回键仍然归级联', () => {
    const open = state({ worldMapOpen: true, pauseMenuOpen: true });
    expect(overlayBlocksHotkeys(open, 'Tab')).toBe(true);
    expect(overlayBlocksHotkeys(open, 'KeyG')).toBe(true);
    expect(overlayBlocksHotkeys(open, hotkeyCodeFor('escape'))).toBe(false);
  });

  it('返回键是哪个码问生效表：改绑之后放行跟着搬，出厂 `Escape` 反而被拦', () => {
    setHotkeyTable(applyHotkeyOverrides(UI_HOTKEYS, { escape: 'KeyZ' }));
    const open = state({ settingsOpen: true });
    expect(overlayBlocksHotkeys(open, 'KeyZ')).toBe(false);
    expect(overlayBlocksHotkeys(open, 'Escape')).toBe(true);
  });

  it('移焦键与返回键同等待遇：有返回层的模态放行它，硬模态不放（切片11）', () => {
    for (const l of OVERLAY_LAYERS) {
      const open = state({ [l.state]: true });
      const passed = UI_NAV_ACTIONS.map((a) => hotkeyCodeFor(a)).filter((c) => !overlayBlocksHotkeys(open, c));
      // 全表只有世界地图那一层 `blocks: false`，其余挡键的层里不吃返回键的只有升级面板
      expect(passed, l.layer).toEqual(l.blocks === true && !l.back ? [] : UI_NAV_ACTIONS.map((a) => hotkeyCodeFor(a)));
    }
  });

  it('改绑之后移焦键跟着搬：新码放行、出厂的 ↑↓ 反而被拦（层表不许抄物理键）', () => {
    setHotkeyTable(applyHotkeyOverrides(UI_HOTKEYS, { uiUp: 'KeyI', uiDown: 'KeyK' }));
    const open = state({ pauseMenuOpen: true });
    expect(isNavCode('KeyI')).toBe(true);
    expect(isNavCode('ArrowUp')).toBe(false);
    expect(overlayBlocksHotkeys(open, 'KeyI')).toBe(false);
    expect(overlayBlocksHotkeys(open, 'ArrowUp')).toBe(true);
  });

  it('只有世界地图一层时，那份名单仍与 `isMapPassThrough` 同一个口径', () => {
    const open = state({ worldMapOpen: true });
    for (const code of ['KeyG', 'Escape', 'Tab', 'KeyH']) {
      expect(overlayBlocksHotkeys(open, code), code).toBe(!isMapPassThrough(code));
    }
  });
});

/* ------------------------------------------------------ 经路由器派发 */

describe('端到端：暂停菜单开着时按返回键真的有人吃（B46 的场景）', () => {
  afterEach(() => setHotkeyTable(UI_HOTKEYS));

  const mk = (open) => {
    const calls = [];
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: (code) => hotkeyBlockedBy(state(open), code),
      onAction: (a) => calls.push(a),
    });
    return { router, calls };
  };

  it('菜单 + 设置同时开着：这一下派发 escape，别的键照挡', () => {
    const { router, calls } = mk({ settingsOpen: true, pauseMenuOpen: true });
    router.poll({ Escape: true, KeyH: true, F10: true });
    expect(calls).toEqual(['escape']);
  });

  it('菜单开着：除返回键与移焦键以外一律不派发（放行只给那两格）', () => {
    const { router, calls } = mk({ pauseMenuOpen: true });
    const keys = {};
    for (const e of UI_HOTKEYS) {
      if (e.action !== 'escape' && !UI_NAV_ACTIONS.includes(e.action)) keys[e.code] = true;
    }
    router.poll(keys);
    expect(calls).toEqual([]);
  });

  it('菜单开着：↑↓ 派发得出来（否则面板里只能鼠标点，切片11 要的就是这一格）', () => {
    const { router, calls } = mk({ pauseMenuOpen: true });
    router.poll({ ArrowUp: true, ArrowDown: true });
    expect(calls).toEqual(['uiUp', 'uiDown']);
  });

  it('对话开着：返回键放行给级联（它自己不再听 keydown，见 B52 那条静态门禁）', () => {
    const { router, calls } = mk({ dialogOpen: true });
    router.poll({ Escape: true });
    expect(calls).toEqual(['escape']);            // 派发一次，由 `runEscape` 决定关对话
    router.poll({ Escape: true });                // 同一下按住不重发
    expect(calls).toEqual(['escape']);
  });

  it('过场开着：它不挡别的键，只吃返回键那一格（跳过演出）', () => {
    const { router, calls } = mk({ cinematicActive: true });
    router.poll({ Escape: true });
    expect(calls).toEqual(['escape']);
  });
});

/* -------------------------------------------------------- 静态门禁 */

describe('静态门禁：表、生产者与消费者必须指同一件事', () => {
  const SKIPPABLE = ['endCreditsSkippable', 'combatCinematicSkippable'];

  it('`Game.overlayState()` 返回的键 == 表里登记的 state（去掉那两个带副作用的谓词）', () => {
    const body = sourceOf('core/Game.js').match(/overlayState\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 overlayState 的方法体').toBeTruthy();
    const produced = [...body[0].matchAll(/^\s{6}([A-Za-z]+)\s*:/gm)].map((m) => m[1]).sort();
    const inTable = OVERLAY_LAYERS.map((l) => l.state).filter((s) => !SKIPPABLE.includes(s)).sort();
    expect(produced).toEqual(inTable);
    // 那两个 Skippable 不进生产者：它们按一次就有副作用，只能在 runEscape 里现算
    for (const s of SKIPPABLE) expect(produced, s).not.toContain(s);
  });

  it('`runEscape` 为每个 `back: true` 的层备一个 case，且没有多余 case', () => {
    const body = sourceOf('core/Game.js').match(/runEscape\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 runEscape 的方法体').toBeTruthy();
    const cases = [...body[0].matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]).sort();
    expect(cases).toEqual([...BACK].sort());
    for (const name of HARD) expect(cases, `${name} 不该出现在级联里`).not.toContain(name);
    expect(body[0]).toContain('default: return false');       // 级联加了层却没有 case = 静默失灵
    expect(body[0]).toContain('...this.overlayState()');      // 现状只有一个生产者
  });

  it('返回键只有一个消费者：对话与战斗演出都不再自己听 keydown（B52）', () => {
    for (const name of ['ui/Dialog.js', 'cinematic/CombatCinematicSkip.js']) {
      expect(sourceOf(name), `${name} 把 keydown 又挂回去了`).not.toContain("addEventListener('keydown'");
    }
    // 全仓听 keydown 的地方只有三处：输入记录（Game）、音频解锁、改绑捕获
    const listeners = FILES.filter((f) => f.source.includes("addEventListener('keydown'")).map((f) => f.name).sort();
    expect(listeners).toEqual(['audio/AudioManager.js', 'core/Game.js', 'ui/SettingsPanel.js']);
  });

  it('级联那两格真的动手：关对话走 `hide()`，跳演出走 `skip()`（吃掉键不等于办了事）', () => {
    const body = sourceOf('core/Game.js').match(/runEscape\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 runEscape 的方法体').toBeTruthy();
    expect(body[0]).toMatch(/case 'dialog':\s*this\.dialog\.hide\(\);?\s*(return true;|)/);
    expect(body[0]).toContain('this.combatCinematicSkip');
    expect(body[0]).toMatch(/case 'combatCinematic':\s*this\.combatCinematicSkip\?\.skip\?\.\(\)/);
  });

  it('`HotkeyRouter.js` 里没有第二份名单、第二套顺序（只许转发）', () => {
    const src = sourceOf('ui/HotkeyRouter.js');
    for (const l of OVERLAY_LAYERS) {
      expect(src, `HotkeyRouter 里出现了 ${l.state}`).not.toContain(l.state);
    }
    for (const name of LAYER_NAMES) expect(src, `HotkeyRouter 里出现了层名 ${name}`).not.toContain(name);
    expect(src).toContain('overlayBlocksHotkeys(state, code)');
    expect(src).toContain('topBackLayer(state)');
  });

  it('层表源码里 `nav:` 的宿主 id 互不重复（重复会让加载期就抛，测试只剩收集期崩 —— 所以这里另给一条断言）', () => {
    const hosts = [...sourceOf('ui/OverlayStack.js').matchAll(/\bnav: '([^']+)'/g)].map((m) => m[1]);
    expect(hosts.length, '一条 `nav` 都没扫到：写法变了，请把这条一起改').toBeGreaterThan(0);
    expect(new Set(hosts).size, `宿主被两层认领：${hosts.join(' / ')}`).toBe(hosts.length);
    // 扫出来的这一份与表里的内容必须一致（扫描器自己不许漂）
    expect(hosts.sort()).toEqual(OVERLAY_LAYERS.filter((l) => l.nav).map((l) => l.nav).sort());
  });

  it('状态字段名只出现在生产者与表两处（别处手抄一份就是 B46 复发）', () => {
    const allowed = new Set(['core/Game.js', 'ui/OverlayStack.js']);
    const offenders = [];
    for (const l of OVERLAY_LAYERS) {
      const key = new RegExp(`\\b${l.state}\\s*:`, 'g');
      for (const f of FILES) if (key.test(f.source) && !allowed.has(f.name)) offenders.push(`${f.name} -> ${l.state}`);
    }
    expect(offenders).toEqual([]);
  });

  it('这条扫描咬得住：把级联那行改回手写名单立刻红（防空跑门禁）', () => {
    const original = sourceOf('ui/HotkeyRouter.js');
    const reverted = original.replace(
      'export function hotkeyBlockedBy(state, code) {\n  return overlayBlocksHotkeys(state, code);',
      'export function hotkeyBlockedBy(state, code) {\n  if (state.pauseMenuOpen) return true;\n  return overlayBlocksHotkeys(state, code);',
    );
    expect(reverted, '锚点没命中：转发写法变了，请把这条自证一起改').not.toBe(original);
    const handWritten = (src) => OVERLAY_LAYERS.some((l) => src.includes(l.state));
    expect(handWritten(original), '转发版本来就不该带状态名').toBe(false);
    expect(handWritten(reverted), '手写名单没被抓到').toBe(true);
  });
});
