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
import { keyText } from '../src/content/keyHints.js';
import { keyLabel } from '../src/content/keyLabels.js';
import { Dialog } from '../src/ui/Dialog.js';
import { CombatCinematicSkip } from '../src/cinematic/CombatCinematicSkip.js';

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

const panels = (over = {}) => ({
  upgrade: false,
  dialog: false,
  pauseMenu: false,
  settingsPanel: false,
  fastTravel: false,
  helpManual: false,
  worldMap: false,
  ...over,
});

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

/** 一个"正在播演出"的假 Game：只给 `canSkip()` 与 `skip()` 真正读到的字段 */
const cinematicsGame = () => ({
  combatCamera: { active: true, blocksInputUntil: 0, skip() { this.skips = (this.skips ?? 0) + 1; } },
  combatInputLock: { locked: false, release() {} },
  dialog: { open: false, toast() {} },
  pauseMenu: { open: false },
  upgrade: { open: false },
  player: { timeSlow: 0.2 },
  executionSkipFx: { burst() {} },
});

/* -------------------------------------------------- 地图放行名单问表 */

describe('世界地图开着时放行谁：名单从生效表现问（B50）', () => {
  afterEach(() => setHotkeyTable(UI_HOTKEYS));

  it('出厂表：例外只有 worldMap / escape / zonePanel 那三个当前码', () => {
    const { worldMap, escape, zonePanel } = factoryCodes();
    const open = panels({ worldMap: true });
    expect(hotkeyBlockedBy(open, worldMap)).toBe(false);
    expect(hotkeyBlockedBy(open, escape)).toBe(false);
    expect(hotkeyBlockedBy(open, zonePanel)).toBe(false);
    for (const other of ['KeyH', 'KeyM', 'Digit1', 'F2']) {
      expect(hotkeyBlockedBy(open, other), other).toBe(true);
    }
  });

  it('改绑之后例外跟着搬：新码放行，出厂那三个反而被拦', () => {
    remap({ worldMap: 'KeyC', zonePanel: 'KeyY', escape: 'KeyZ' });
    const open = panels({ worldMap: true });
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
    const open = panels({ worldMap: true });
    expect(hotkeyBlockedBy(open, worldMap)).toBe(false);
    expect(hotkeyBlockedBy(open, escape)).toBe(false);
    expect(hotkeyBlockedBy(open, zonePanel)).toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyC')).toBe(true);
  });

  it('只搬动其中一个动作时，另两个例外留在原地', () => {
    const { escape, zonePanel } = factoryCodes();
    remap({ worldMap: 'KeyC' });
    const open = panels({ worldMap: true });
    expect(hotkeyBlockedBy(open, 'KeyC')).toBe(false);
    expect(hotkeyBlockedBy(open, escape)).toBe(false);
    expect(hotkeyBlockedBy(open, zonePanel)).toBe(false);
    expect(hotkeyBlockedBy(open, 'KeyG')).toBe(true);
  });

  it('其余六个模态面板开着时一切放行都不给（含那条例外码）', () => {
    const keys = ['upgrade', 'dialog', 'pauseMenu', 'settingsPanel', 'fastTravel', 'helpManual'];
    for (const name of keys) {
      const open = panels({ [name]: true, worldMap: true });
      for (const code of Object.values(factoryCodes())) {
        expect(hotkeyBlockedBy(open, code), `${name} + ${code}`).toBe(true);
      }
    }
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
      isBlocked: (code) => hotkeyBlockedBy(panels({ worldMap: true }), code),
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

describe('关对话与跳演出：那一下也问表', () => {
  let dom;

  beforeEach(() => { dom = installDom(); });
  afterEach(() => {
    setHotkeyTable(UI_HOTKEYS);
    delete globalThis.window;
    delete globalThis.document;
  });

  it('出厂表：`Escape` 关掉开着的对话，并且真的走 `hide()`', () => {
    const dialog = new Dialog();
    dialog.open = true;
    dom.press('Escape');
    expect(dialog.open).toBe(false);
    expect(dom.dispatched).toContain('dialog-overlay-hidden');
  });

  it('改绑 `escape` → `KeyZ` 之后：`Escape` 不再关对话，`KeyZ` 关', () => {
    const dialog = new Dialog();
    remap({ escape: 'KeyZ' });
    dialog.open = true;
    dom.press('Escape');
    expect(dialog.open).toBe(true);
    expect(dom.dispatched).not.toContain('dialog-overlay-hidden');
    dom.press('KeyZ');
    expect(dialog.open).toBe(false);
  });

  it('对话没开着时按对的键什么都不做（不派发隐藏事件、不抛）', () => {
    const dialog = new Dialog();
    expect(() => dom.press('Escape')).not.toThrow();
    expect(dialog.open).toBe(false);
    expect(dom.dispatched).toEqual([]);
  });

  it('战斗演出：可跳过时按生效的 `escape` 码跳一次', () => {
    const game = cinematicsGame();
    const skipper = new CombatCinematicSkip(game);
    expect(skipper.canSkip()).toBe(true);
    dom.press('Escape');
    expect(skipper.skipped).toBe(1);
    expect(dom.dispatched).toContain('combat-cinematic-skipped');
  });

  it('改绑之后：出厂 `Escape` 不跳，新码跳', () => {
    const game = cinematicsGame();
    const skipper = new CombatCinematicSkip(game);
    remap({ escape: 'KeyZ' });
    dom.press('Escape');
    expect(skipper.skipped).toBe(0);
    dom.press('KeyZ');
    expect(skipper.skipped).toBe(1);
  });

  it('没在播演出时按键不跳（判据仍然是 `canSkip()`）', () => {
    const game = cinematicsGame();
    game.combatCamera.active = false;
    const skipper = new CombatCinematicSkip(game);
    dom.press('Escape');
    expect(skipper.skipped).toBe(0);
  });

  it('对话框开着时演出那条不抢这一下（否则对话还没关就先跳演出）', () => {
    const game = cinematicsGame();
    game.dialog.open = true;
    const skipper = new CombatCinematicSkip(game);
    dom.press('Escape');
    expect(skipper.skipped).toBe(0);
  });

  it('跳过那一下同时吃掉事件：不挡浏览器默认行为的话 Escape 会退全屏，不 `stopPropagation` 的话下一帧路由再跳一次', () => {
    const game = cinematicsGame();
    new CombatCinematicSkip(game);
    const ev = dom.press('Escape');
    expect(ev.prevented).toBe(true);
    expect(ev.stopped).toBe(true);
  });
});

/* -------------------------------------------------------- 静态门禁 */

/** 键码形状的字符串字面量：`'KeyG'` / `'Escape'` / `'Tab'` / `'Digit1'` / `'F2'` … */
const CODE_LITERAL = /'(?:Key[A-Z]|Digit[0-9]|F[0-9]{1,2}|Escape|Tab|Space|Shift(?:Left|Right)|Control(?:Left|Right)|Backquote|Numpad[0-9A-Za-z]*)'/;
/**
 * 把物理键码当判据的两写法：`e.code === 'Escape'` 与 `code !== 'KeyG'`
 * （后者是 `hotkeyBlocked(code)` 原来的样子 —— 参数名不带 `e.` 前缀，所以正则一起收）。
 */
const CODE_COMPARE = /\bcode\s*[!=]==\s*'(?:Key[A-Z]|Digit[0-9]|F[0-9]{1,2}|Escape|Tab|Space|Backquote|[A-Za-z]+(?:Left|Right))'/;

describe('静态门禁：行为侧不许再抄物理键码', () => {
  it('全仓没有一处把键码字面量拿来比较 `.code`（改一处就是第二个键位真源）', () => {
    const offenders = FILES
      .filter(({ source }) => CODE_COMPARE.test(source))
      .map(({ name, source }) => `${name}: ${source.match(CODE_COMPARE)[0]}`);
    expect(offenders).toEqual([]);
  });

  it('这条扫描咬得住：把对话框那行改回死键名立刻红（防空跑门禁）', () => {
    const original = sourceOf('ui/Dialog.js');
    const reverted = original
      .replace(/e\.code === hotkeyCodeFor\('escape'\)/, "e.code === 'Escape'");
    expect(reverted, '替换没命中：那一行的写法变了，请把这条自证一起改').not.toBe(original);
    expect(CODE_COMPARE.test(original)).toBe(false);
    expect(CODE_COMPARE.test(reverted)).toBe(true);
  });

  it('`Game.hotkeyBlocked` 只喂面板现状，判据本体在纯函数里', () => {
    const game = sourceOf('core/Game.js');
    const body = game.match(/hotkeyBlocked\(code\)\s*\{[\s\S]*?\n {2}\}/);
    expect(body, '找不到 hotkeyBlocked 的方法体').toBeTruthy();
    expect(body[0]).toContain('return hotkeyBlockedBy({');
    expect(body[0]).not.toMatch(CODE_LITERAL);
    // 七个现状一个都不许漏喂：漏一个 = 那个面板从此拦不住热键
    for (const [key, field] of Object.entries({
      upgrade: 'this.upgrade.open',
      dialog: 'this.dialog.open',
      pauseMenu: 'this.pauseMenu.open',
      settingsPanel: 'this.settingsPanel.open',
      fastTravel: 'this.fastTravelPanel.open',
      helpManual: 'this.helpManual.open',
      worldMap: '!!this.worldMapPanel?.open',
    })) expect(body[0], `少喂 ${key}`).toContain(`${key}: ${field}`);
  });

  it('迁移点点名：这三处都在现问生效表', () => {
    expect(sourceOf('ui/Dialog.js')).toContain("hotkeyCodeFor('escape')");
    expect(sourceOf('cinematic/CombatCinematicSkip.js')).toContain("hotkeyCodeFor('escape')");
    expect(sourceOf('ui/HotkeyRouter.js')).toContain('!isMapPassThrough(code)');
  });

  it('显示与判定同一把键：`keyText` 里写出来的键名就是放行判据认的那个码', () => {
    for (const overrides of [{}, { escape: 'KeyZ' }, { escape: 'KeyZ', zonePanel: 'Digit7' }]) {
      remap(overrides);
      const sentence = keyText('按 {escape} 可跳过战斗演出');
      expect(sentence).toContain(keyLabel(hotkeyCodeFor('escape')));
      expect(hotkeyBlockedBy(panels({ worldMap: true }), hotkeyCodeFor('escape'))).toBe(false);
    }
  });
});
