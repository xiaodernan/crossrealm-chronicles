/**
 * 行为侧的键码也只问生效表（W-A7 切片7）。
 *
 * 切片6 把"屏幕上写的键名"收成了一个出口，但**判定**这一侧还留着三处抄来的物理键：
 * `Game.hotkeyBlocked` 里世界地图的放行名单（`KeyG`/`Escape`/`Tab`）、`Dialog` 关对话的
 * `Escape`、`CombatCinematicSkip` 跳演出的 `Escape`。玩家把"世界地图"改到 `C` 之后，
 * 按 `C` 开得出地图，可地图开着时 `G` 仍然穿透、`C` 反而被自己的面板吞掉（B50）。
 *
 * 所以这一片盯的是"文案改了、手上的键没改"这一族：三处判定全部现问现取，
 * 并把放行判据从 `Game` 的方法体里搬成纯函数（此前它对全仓零测试）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  UI_HOTKEYS,
  applyHotkeyOverrides,
  setHotkeyTable,
  hotkeyCodeFor,
  isMapPassThrough,
  MAP_PASSTHROUGH_ACTIONS,
} from '../src/content/hotkeys.js';
import { HotkeyRouter, hotkeyBlockedBy } from '../src/ui/HotkeyRouter.js';
import { OVERLAY_LAYERS } from '../src/ui/OverlayStack.js';
import { keyText } from '../src/content/keyHints.js';
import { keyLabel } from '../src/content/keyLabels.js';
import { Dialog } from '../src/ui/Dialog.js';
import { CombatCinematicSkip } from '../src/cinematic/CombatCinematicSkip.js';
import { Game } from '../src/core/Game.js';

const SRC = join(process.cwd(), 'src');

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const full = join(dir, n);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.js$/.test(n) ? [full] : [];
});

const rel = (file) => file.slice(SRC.length + 1).replace(/\\/g, '/');

const FILES = walk(SRC).map((f) => ({ path: f, name: rel(f), source: readFileSync(f, 'utf8') }));

const sourceOf = (name) => {
  const found = FILES.find((f) => f.name === name);
  expect(found, `${name} 不在了`).toBeTruthy();
  return found.source;
};

/** 出厂表里那三个"地图例外"动作的键码（测试自己按动作取，不抄字面量） */
const factoryCodes = () => ({
  worldMap: hotkeyCodeFor('worldMap'),
  escape: hotkeyCodeFor('escape'),
  zonePanel: hotkeyCodeFor('zonePanel'),
});

const remap = (overrides) => setHotkeyTable(applyHotkeyOverrides(UI_HOTKEYS, overrides));

/** 状态字段名与 `ui/OverlayStack.js` 的 `state` 逐字对齐（切片10；对齐由 overlay-stack 的门禁钉住） */
const panels = (over = {}) => {
  const base = {
    worldMapOpen: false,
    autoPlayActive: false,
    helpOpen: false,
    cinematicActive: false,
    settingsOpen: false,
    fastTravelOpen: false,
    pauseMenuOpen: false,
    dialogOpen: false,
    upgradeOpen: false,
  journalOpen: false,
  };
  for (const k of Object.keys(over)) expect(base, `状态名 "${k}" 不在层表里`).toHaveProperty(k);
  return { ...base, ...over };
};

/* ------------------------------------------------------------------ 桩 */

const elStub = () => ({
  textContent: '',
  innerHTML: '',
  className: '',
  style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {},
  removeEventListener() {},
  appendChild() {},
  removeChild() {},
  querySelector: () => null,
  querySelectorAll: () => [],
});

/** 只记录监听器的 window/document 桩：本片要的是"按下这一下走没走对分支" */
function installDom() {
  const handlers = [];
  const dispatched = [];
  const doc = () => {
    const stub = elStub();
    stub.addEventListener = (type, fn) => { handlers.push({ type, fn }); };
    return stub;
  };
  globalThis.window = {
    addEventListener: (type, fn) => { handlers.push({ type, fn }); },
    removeEventListener: () => {},
    dispatchEvent: (ev) => { dispatched.push(ev?.type); return true; },
  };
  globalThis.document = {
    getElementById: () => doc(),
    createElement: () => doc(),
    body: doc(),
    addEventListener: (type, fn) => { handlers.push({ type, fn }); },
    removeEventListener: () => {},
  };
  return {
    dispatched,
    /** 派发一次 keydown：返回事件对象，`prevented`/`stopped` 由被测方写回 */
    press(code) {
      const ev = {
        code,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
      };
      for (const h of handlers) if (h.type === 'keydown') h.fn(ev);
      return ev;
    },
  };
}

/* -------------------------------------------------- 地图放行名单问表 */

describe('世界地图开着时放行谁：名单从生效表现问（B50）', () => {
  afterEach(() => setHotkeyTable(UI_HOTKEYS));

  it('出厂表：例外只有 worldMap / escape / zonePanel 那三个当前码', () => {
    const { worldMap, escape, zonePanel } = factoryCodes();
    const open = panels({ worldMapOpen: true });
    expect(hotkeyBlockedBy(open, worldMap)).toBe(false);
    expect(hotkeyBlockedBy(open, escape)).toBe(false);
    expect(hotkeyBlockedBy(open, zonePanel)).toBe(false);
    for (const other of ['KeyH', 'KeyM', 'Digit1', 'F2']) {
      expect(hotkeyBlockedBy(open, other), other).toBe(true);
    }
  });

  it('改绑之后例外跟着搬：新码放行，出厂那三个反而被拦', () => {
    remap({ worldMap: 'KeyC', zonePanel: 'KeyY', escape: 'KeyZ' });
    const open = panels({ worldMapOpen: true });
    expect([hotkeyCodeFor('worldMap'), hotkeyCodeFor('escape'), hotkeyCodeFor('zonePanel')])
      .toEqual(['KeyC', 'KeyZ', 'KeyY']);
    expect(hotkeyBlockedBy(open, 'KeyC')).toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyY')).toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyZ')).toBe(false);
    // 旧码不再特殊：地图开着时按出厂 G 只会重开地图？不 —— 它被面板拦住
    expect(hotkeyBlockedBy(open, 'KeyG')).toBe(true);
    expect(hotkeyBlockedBy(open, 'Escape')).toBe(true);
    expect(hotkeyBlockedBy(open, 'Tab')).toBe(true);
  });

  it('复位之后回到出厂判定', () => {
    const { worldMap, escape, zonePanel } = factoryCodes();
    remap({ worldMap: 'KeyC' });
    setHotkeyTable(UI_HOTKEYS);
    const open = panels({ worldMapOpen: true });
    expect(hotkeyBlockedBy(open, worldMap)).toBe(false);
    expect(hotkeyBlockedBy(open, escape)).toBe(false);
    expect(hotkeyBlockedBy(open, zonePanel)).toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyC')).toBe(true);
  });

  it('只搬动其中一个动作时，另两个例外留在原地', () => {
    const { escape, zonePanel } = factoryCodes();
    remap({ worldMap: 'KeyC' });
    const open = panels({ worldMapOpen: true });
    expect(hotkeyBlockedBy(open, 'KeyC')).toBe(false);
    expect(hotkeyBlockedBy(open, escape)).toBe(false);
    expect(hotkeyBlockedBy(open, zonePanel)).toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyG')).toBe(true);
  });

  it('今天表里没有"连返回键都不给"的一层：升级面板也把返回键让给级联（切片24 / B55）', () => {
    // 切片10 那一版它是硬模态，纯手柄玩家在营火升级完退不出去（六条输入路全不变，改前读数在档）。
    // 今天它与设置 / 说明书同档：放行返回键与走焦键，其余照挡 —— "挡谁"仍然只有一处判据
    const open = panels({ upgradeOpen: true, worldMapOpen: true });
    expect(hotkeyBlockedBy(open, hotkeyCodeFor('escape')), '返回键要交给级联，由层序决定吃它的是谁').toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyG')).toBe(true);
    expect(hotkeyBlockedBy(open, 'Tab')).toBe(true);
    // 对话在切片10 之后不再是硬模态：它的返回键要放行给级联（B52）
    const dialog = panels({ dialogOpen: true });
    expect(hotkeyBlockedBy(dialog, hotkeyCodeFor('escape'))).toBe(false);
  });

  it('有返回层的模态：只放行返回键本身，其余一概拦住（B46 的修法）', () => {
    const { worldMap, zonePanel } = factoryCodes();
    for (const name of ['pauseMenuOpen', 'settingsOpen', 'fastTravelOpen', 'helpOpen', 'upgradeOpen']) {
      const open = panels({ [name]: true });
      expect(hotkeyBlockedBy(open, hotkeyCodeFor('escape')), `${name} 的返回键`).toBe(false);
      for (const code of ['KeyH', 'KeyG', 'Tab', 'Digit1', 'F2']) {
        expect(hotkeyBlockedBy(open, code), `${name} + ${code}`).toBe(true);
      }
    }
    // 地图那份放行名单不许从模态底下钻出去：模态 + 地图时仍按模态算
    const both = panels({ pauseMenuOpen: true, worldMapOpen: true });
    expect(hotkeyBlockedBy(both, worldMap)).toBe(true);
    expect(hotkeyBlockedBy(both, zonePanel)).toBe(true);
    expect(hotkeyBlockedBy(both, hotkeyCodeFor('escape'))).toBe(false);
  });

  it('改绑之后返回键的放行跟着搬：新码放行，出厂 `Escape` 反而被拦', () => {
    remap({ escape: 'KeyZ' });
    const open = panels({ pauseMenuOpen: true });
    expect(hotkeyBlockedBy(open, 'KeyZ')).toBe(false);
    expect(hotkeyBlockedBy(open, 'Escape')).toBe(true);
  });

  it('面板全关：谁都不拦', () => {
    for (const code of ['KeyG', 'Escape', 'Tab', 'KeyH', 'Digit1']) {
      expect(hotkeyBlockedBy(panels(), code)).toBe(false);
    }
  });

  it('`isMapPassThrough`：未登记的码与 null 都不算例外', () => {
    expect(isMapPassThrough('KeyQ')).toBe(false);
    expect(isMapPassThrough(null)).toBe(false);
    expect(isMapPassThrough(hotkeyCodeFor('worldMap'))).toBe(true);
  });

  it('放行名单里那三个动作必须都在表里（少一个 = 例外静默变空，地图吞掉所有键）', () => {
    for (const action of MAP_PASSTHROUGH_ACTIONS) {
      expect(UI_HOTKEYS.some((e) => e.action === action), action).toBe(true);
    }
    expect(() => isMapPassThrough('KeyG')).not.toThrow();
  });

  it('端到端：地图开着 + 改绑之后，路由器派发的是新码那一格', () => {
    const table = remap({ zonePanel: 'KeyY' });
    const calls = [];
    const router = new HotkeyRouter({
      table,
      isBlocked: (code) => hotkeyBlockedBy(panels({ worldMapOpen: true }), code),
      onAction: (a) => calls.push(a),
    });
    const keys = {};
    keys.Tab = true;         // 出厂的区域面板键：改绑之后它不再是例外，被地图吞掉
    keys.KeyY = true;        // 现在的区域面板键
    router.poll(keys);
    expect(calls).toEqual(['zonePanel']);
  });
});

/* -------------------------------------------------- 对话框与战斗演出 */

/**
 * 只给 `overlayState()` 与 `runEscape()` 真读到的字段，形状与生产一致：
 * 被测的是**生产的那两个方法**（`Game.prototype.*` 借给一个假 this），不是测试里重抄的 switch。
 */
const escapeGame = () => {
  const calls = [];
  const g = {
    worldMapPanel: { open: false, hide() { calls.push('worldMap'); this.open = false; return true; } },
    playerAutoPlay: { active: false, stop() { calls.push('autoPlay'); return true; } },
    helpManual: { open: false, hide() { calls.push('help'); this.open = false; return true; } },
    cinematicActive: false,
    cinematics: { skip() { calls.push('cinematic'); return true; } },
    settingsPanel: { open: false, hide() { calls.push('settings'); this.open = false; return true; } },
    fastTravelPanel: { open: false, hide() { calls.push('fastTravel'); return true; } },
    pauseMenu: { open: false, toggle() { calls.push('pauseMenu'); this.open = !this.open; return true; } },
    dialog: { open: false, hide() { calls.push('dialog'); this.open = false; }, toast() {} },
    upgrade: { open: false },
    endCredits: {
      active: false,
      trySkip() { if (!this.active) return false; calls.push('endCredits'); this.active = false; return true; },
    },
    combatCinematicSkip: { on: false, canSkip() { return this.on; }, skip() { calls.push('combatCinematic'); } },
  };
  g.overlayState = () => Game.prototype.overlayState.call(g);
  g.runEscape = () => Game.prototype.runEscape.call(g);
  return { g, calls };
};

describe('关对话与跳演出：同一下按键只有一个消费者（B52）', () => {
  let dom;

  beforeEach(() => { dom = installDom(); });
  afterEach(() => {
    setHotkeyTable(UI_HOTKEYS);
    delete globalThis.window;
    delete globalThis.document;
  });

  it('对话不挂了：按 Escape 这一刻没人动它（从前是它自己关，然后派发口再拿同一下开菜单）', () => {
    const dialog = new Dialog();
    dialog.open = true;
    dom.press('Escape');
    expect(dialog.open).toBe(true);
    expect(dom.dispatched).not.toContain('dialog-overlay-hidden');
  });

  it('但 `hide()` 这条路一点没变：级联调用它照样收干净', () => {
    const dialog = new Dialog();
    dialog.open = true;
    dialog.hide();
    expect(dialog.open).toBe(false);
    expect(dom.dispatched).toContain('dialog-overlay-hidden');
  });

  it('战斗演出不挂了：按下不跳，级联那一下才跳', () => {
    const { g } = escapeGame();
    g.combatCamera = { active: true };           // 真对象的判据源，不用假 `on` 旗
    const skipper = new CombatCinematicSkip(g);
    g.combatCinematicSkip = skipper;
    expect(skipper.canSkip()).toBe(true);
    dom.press('Escape');
    expect(skipper.skipped).toBe(0);
    expect(dom.dispatched).not.toContain('combat-cinematic-skipped');
    g.runEscape();
    expect(skipper.skipped).toBe(1);             // 由 runEscape 那一格动手
    expect(dom.dispatched).toContain('combat-cinematic-skipped');
  });

  it('空场：兜底那格开菜单（一次只动一格）', () => {
    const { g, calls } = escapeGame();
    expect(g.runEscape()).toBe(true);
    expect(calls).toEqual(['pauseMenu']);
  });

  it('对话开着：只关对话，菜单不跟着弹（浏览器读数 R4 抓到的那个重影）', () => {
    const { g, calls } = escapeGame();
    g.dialog.open = true;
    g.runEscape();
    expect(calls).toEqual(['dialog']);
    expect(g.dialog.open).toBe(false);
    expect(g.pauseMenu.open).toBe(false);
    g.runEscape();                               // 下一次按键才轮到开菜单
    expect(calls).toEqual(['dialog', 'pauseMenu']);
  });

  it('对话压着地图：先还对话的自由（层表说对话在地图之上）', () => {
    const { g, calls } = escapeGame();
    g.dialog.open = true;
    g.worldMapPanel.open = true;
    g.runEscape();
    expect(calls).toEqual(['dialog']);
    expect(g.worldMapPanel.open).toBe(true);
  });

  it('演出可跳过时菜单也开着：先关菜单，演出留给下一次（守卫从手写名单搬进层序）', () => {
    const { g, calls } = escapeGame();
    g.combatCinematicSkip.on = true;
    g.pauseMenu.open = true;
    g.runEscape();
    expect(calls).toEqual(['pauseMenu']);
    g.runEscape();
    expect(calls).toEqual(['pauseMenu', 'combatCinematic']);
  });

  it('过场动画开着：这一下归 `cinematics.skip()`（它排在小地图与菜单之前）', () => {
    const { g, calls } = escapeGame();
    g.cinematicActive = true;
    g.runEscape();
    expect(calls).toEqual(['cinematic']);
  });

  it('片尾字幕开着：`trySkip()` 自己吃掉这一下，级联不再往下走', () => {
    const { g, calls } = escapeGame();
    g.endCredits.active = true;
    g.settingsPanel.open = true;                 // 就算设置也开着，字幕在最顶上
    g.runEscape();
    expect(calls).toEqual(['endCredits']);
    expect(g.settingsPanel.open).toBe(true);
  });

  it('升级面板开着：返回键派发得出来（吃它的是级联，不是路由），其余热键仍然挡着', () => {
    const calls = [];
    const router = new HotkeyRouter({
      table: UI_HOTKEYS,
      isBlocked: (code) => hotkeyBlockedBy(panels({ upgradeOpen: true, dialogOpen: false }), code),
      onAction: (a) => calls.push(a),
    });
    router.poll({ Escape: true, KeyH: true });
    // 只有 `escape` 穿过：谁吃掉这一下由层表回答（`Game.runEscape`），路由不管
    expect(calls).toEqual(['escape']);
  });

  it('改绑之后放行跟着搬：新码能穿过对话那一层，出厂 `Escape` 反而被挡', () => {
    remap({ escape: 'KeyZ' });
    const open = panels({ dialogOpen: true });
    expect(hotkeyBlockedBy(open, 'KeyZ')).toBe(false);
    expect(hotkeyBlockedBy(open, 'Escape')).toBe(true);
  });
});

/* -------------------------------------------------------- 静态门禁 */

/** 键码形状的字符串字面量：`'KeyG'` / `'Escape'` / `'Tab'` / `'Digit1'` / `'F2'` … */
const CODE_LITERAL = /'(?:Key[A-Z]|Digit[0-9]|F[0-9]{1,2}|Escape|Tab|Space|Enter|Arrow[A-Za-z]+|Shift(?:Left|Right)|Control(?:Left|Right)|Backquote|Numpad[0-9A-Za-z]*)'/;
/**
 * 把物理键码当判据的两写法：`e.code === 'Escape'` 与 `code !== 'KeyG'`
 * （后者是 `hotkeyBlocked(code)` 原来的样子 —— 参数名不带 `e.` 前缀，所以正则一起收）。
 * `Arrow*` / `Enter` 从切片11 起也算：面板内导航认的同样是键码，抄死箭头 = 改绑之后那半失灵。
 */
const CODE_COMPARE = /\bcode\s*[!=]==\s*'(?:Key[A-Z]|Digit[0-9]|F[0-9]{1,2}|Escape|Tab|Space|Enter|Arrow[A-Za-z]+|Backquote|[A-Za-z]+(?:Left|Right))'/;

describe('静态门禁：行为侧不许再抄物理键码', () => {
  it('全仓没有一处把键码字面量拿来比较 `.code`（改一处就是第二个键位真源）', () => {
    const offenders = FILES
      .filter(({ source }) => CODE_COMPARE.test(source))
      .map(({ name, source }) => `${name}: ${source.match(CODE_COMPARE)[0]}`);
    expect(offenders).toEqual([]);
  });

  it('这条扫描咬得住：往层表里塞一处死键名比较立刻红（防空跑门禁）', () => {
    const original = sourceOf('ui/OverlayStack.js');
    // 返回键与移焦键两处：抄死任何一枚都是"改绑之后那半失灵"（切片7 的 B50、切片11 的 ↑）
    const smuggled = [
      ["code !== hotkeyCodeFor('escape')", "code !== 'Escape'"],
      ['&& !isNavCode(code)', "&& code !== 'ArrowUp'"],
    ];
    for (const [from, to] of smuggled) {
      const reverted = original.replace(from, to);
      expect(reverted, `锚点没命中：${from} 这一处的写法变了`).not.toBe(original);
      expect(CODE_COMPARE.test(reverted), `${to} 没被抓到`).toBe(true);
    }
    expect(CODE_COMPARE.test(original)).toBe(false);
  });

  it('`Game.hotkeyBlocked` 只喂模态现状，判据本体在纯函数里', () => {
    const game = sourceOf('core/Game.js');
    const body = game.match(/hotkeyBlocked\(code\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 hotkeyBlocked 的方法体').toBeTruthy();
    expect(body[0]).toContain('hotkeyBlockedBy(this.overlayState()');
    expect(body[0]).not.toMatch(CODE_LITERAL);
  });

  it('`Game.overlayState` 是唯一的现状生产者：九个字段一个都不许漏喂', () => {
    const game = sourceOf('core/Game.js');
    const body = game.match(/overlayState\(\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 overlayState 的方法体').toBeTruthy();
    // 漏喂一个 = 那个面板从此拦不住热键，也从此不进 Escape 级联
    for (const [key, field] of Object.entries({
      worldMapOpen: '!!this.worldMapPanel?.open',
      autoPlayActive: '!!this.playerAutoPlay?.active',
      helpOpen: '!!this.helpManual.open',
      cinematicActive: '!!this.cinematicActive',
      settingsOpen: 'this.settingsPanel.open',
      fastTravelOpen: 'this.fastTravelPanel.open',
      pauseMenuOpen: 'this.pauseMenu.open',
      dialogOpen: 'this.dialog.open',
      upgradeOpen: 'this.upgrade.open',
    })) expect(body[0], `少喂 ${key}`).toContain(`${key}: ${field}`);
  });

  it('本文件的 `panels()` 词表 = 层表的 `state` 列（两边各长一套名字就是 B46 的另一种活法）', () => {
    const inTable = OVERLAY_LAYERS.map((l) => l.state).filter((s) => !s.endsWith('Skippable')).sort();
    expect(Object.keys(panels()).sort()).toEqual(inTable);
  });

  it('迁移点收口：返回键的码从此只在层表里问一次，那两个消费者不再自己挂监听', () => {
    // 切片7 时它们是 `hotkeyCodeFor('escape')` + 自己的 keydown；切片10（B52）把监听撤了，
    // 判据搬进层表。留着任何一处 = 同一下按键两个消费者。
    for (const name of ['ui/Dialog.js', 'cinematic/CombatCinematicSkip.js']) {
      const src = sourceOf(name);
      expect(src, `${name} 又自己认领返回键了`).not.toContain('hotkeyCodeFor');
      expect(src, `${name} 又挂了 keydown`).not.toMatch(/addEventListener\('keydown'/);
    }
    const asking = FILES.filter(({ source }) => /hotkeyCodeFor\('escape'\)/.test(source)).map(({ name }) => name);
    expect(asking, '问生效表的地方不止一处').toEqual(['ui/OverlayStack.js']);
    expect(sourceOf('ui/OverlayStack.js')).toContain('!isMapPassThrough(code)');
  });

  it('显示与判定同一把键：`keyText` 里写出来的键名就是放行判据认的那个码', () => {
    for (const overrides of [{}, { escape: 'KeyZ' }, { escape: 'KeyZ', zonePanel: 'Digit7' }]) {
      remap(overrides);
      const sentence = keyText('按 {escape} 可跳过战斗演出');
      expect(sentence).toContain(keyLabel(hotkeyCodeFor('escape')));
      expect(hotkeyBlockedBy(panels({ worldMapOpen: true }), hotkeyCodeFor('escape'))).toBe(false);
    }
  });
});
