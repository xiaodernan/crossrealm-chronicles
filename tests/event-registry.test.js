import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GAME_EVENTS, REST_DIALOGUE_EVENTS } from '../src/engine/events.js';
import { installWindowShim } from './helpers/enemyHarness.js';

/**
 * 门禁：事件名必须有登记，且登记必须是真的（B44 的命名半区）。
 *
 * 为什么钉这么死：`new CustomEvent('a')` 与 `addEventListener('b')` 是两次独立的手抄，
 * 抄错不会报错，只会让下游永远醒不过来。本切片动手前抓到的三条活病例：
 *  - `CgGallerySystem` 监听 `dungeon-room-clear`，派发方是 `dungeon-room-cleared`
 *    → 「副本清房」这张 CG 从此不可能解锁；
 *  - `VoidBoss` 派发 `time-stop-end`，全仓无人监听 → HUD 的「⏳ 时停中」回不去；
 *  - `dungeon-enter` 从不带 `rerun`，HUD 却按它弹「深渊再探」→ 提示永不出现。
 * 三条都是静态扫描 + 一张登记表能当场问出来的问题。
 *
 * 口径：
 *  - `payload: null` ⇔ 没有任何派发位点带 `detail`（双向都查，注册表不许骗人）；
 *  - `hook` ⇔ 仓库内没有监听者（并逐条写明"为什么没人听也不影响表现"）；
 *  - 注册表里的每个名字都必须在代码里真的被生产或被消费 —— 不许留死条目；
 *  - 动态拼出来的事件名只允许 `REST_DIALOGUE_EVENTS` 这一个来源。
 */

const SRC = join(process.cwd(), 'src');
/** 登记表自身：它的字面量不算"代码里的引用"，否则每条都存在 = 门禁失效 */
const SELF = 'engine/events.js';

/** 浏览器原生事件名：不是游戏事件，允许直接挂在 addEventListener 上 */
const DOM_EVENT_NAMES = new Set([
  'change', 'click', 'contextmenu', 'input',
  'keydown', 'keyup', 'mousedown', 'mousemove',
  'pointercancel', 'pointerdown', 'pointerlockchange', 'pointermove', 'pointerup',
  'resize', 'wheel',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** 剥掉块注释与行注释（保留行数），字符串原样留着 —— 这里要看的就是字符串 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 从 code[start]（必须是 `(`）读到配对结束 */
function readBalanced(code, start) {
  const close = ')';
  let depth = 0;
  let quote = null;
  for (let i = start; i < code.length; i += 1) {
    const c = code[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(') depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  return null;
}

const dispatchSites = new Map(); // name -> [{ file, hasDetail }]
const dynamicDispatches = []; // 事件名不是字面量的位点
const templateDispatches = []; // 用模板字符串拼事件名的位点：一个都不许有
const listenerSites = new Map(); // name -> Set<file>

for (const abs of walk(SRC)) {
  const rel = relative(SRC, abs).replace(/\\/g, '/');
  const code = stripComments(readFileSync(abs, 'utf8'));
  for (const m of code.matchAll(/new\s+CustomEvent\(\s*/g)) {
    const open = code.indexOf('(', m.index + m[0].length - 1);
    const call = readBalanced(code, open);
    const literal = call?.match(/^\(\s*['"]([^'"]+)['"]/);
    if (literal) {
      const name = literal[1];
      if (!dispatchSites.has(name)) dispatchSites.set(name, []);
      dispatchSites.get(name).push({ file: rel, hasDetail: /\bdetail\s*:/.test(call) });
    } else {
      if (call?.startsWith('(`')) templateDispatches.push(rel);
      dynamicDispatches.push({ file: rel, expr: call?.slice(1, 60).trim() ?? '(unbalanced)' });
    }
  }
  for (const m of code.matchAll(/(?:add|remove)EventListener\(\s*['"]([^'"]+)['"]/g)) {
    if (rel === SELF) continue;
    const name = m[1];
    if (!listenerSites.has(name)) listenerSites.set(name, new Set());
    listenerSites.get(name).add(rel);
  }
}

const registered = Object.keys(GAME_EVENTS);
const gameDispatchNames = [...dispatchSites.keys()].filter((n) => !DOM_EVENT_NAMES.has(n));
const gameListenNames = [...listenerSites.keys()].filter((n) => !DOM_EVENT_NAMES.has(n));
const derivedNames = Object.values(REST_DIALOGUE_EVENTS);

const consumersOf = (name) => listenerSites.get(name) ?? new Set();
const producersOf = (name) => dispatchSites.get(name) ?? [];

describe('事件登记表与代码双向对齐（B44）', () => {
  it('登记表的形状：kebab-case 名字 + 每条都有用途说明', () => {
    expect(registered.length).toBeGreaterThanOrEqual(60);
    const bad = registered.filter((n) => !/^[a-z0-9][a-z0-9-]*$/.test(n));
    expect(bad).toEqual([]);
    const sloppy = registered.filter((n) => !GAME_EVENTS[n].desc || GAME_EVENTS[n].desc.length < 8);
    expect(sloppy).toEqual([]);
    const missing = registered.filter((n) => !('payload' in GAME_EVENTS[n]));
    expect(missing).toEqual([]);
  });

  it('代码里出现的每个自定义事件名都已登记（抄错名字当场变红）', () => {
    const unknown = [...new Set([...gameDispatchNames, ...gameListenNames])]
      .filter((n) => !(n in GAME_EVENTS));
    expect(unknown).toEqual([]);
  });

  it('登记表里没有死条目：每个名字都真的被生产或被消费', () => {
    const referenced = new Set([
      ...gameDispatchNames,
      ...gameListenNames,
      ...derivedNames, // 派生名族的字面量只存在于 events.js 里
    ]);
    const dead = registered.filter((n) => !referenced.has(n));
    expect(dead).toEqual([]);
  });

  it('payload: null 与"没人带 detail"是同一件事（两个方向都不许骗）', () => {
    const lyingNull = [];
    const lyingPayload = [];
    for (const name of registered) {
      const sites = producersOf(name);
      const withDetail = sites.filter((s) => s.hasDetail);
      if (GAME_EVENTS[name].payload === null && withDetail.length) {
        lyingNull.push(`${name} ← ${withDetail.map((s) => s.file).join(', ')}`);
      }
      // 派生名族的派发位点不是字面量，由 REST_DIALOGUE_EVENTS 那条用例单独钉
      const isDerived = derivedNames.includes(name);
      if (GAME_EVENTS[name].payload !== null && !isDerived && sites.length && !withDetail.length) {
        lyingPayload.push(name);
      }
    }
    expect(lyingNull).toEqual([]);
    expect(lyingPayload).toEqual([]);
  });

  it('无监听者的事件必须逐条写明理由（hook），写了理由的必须真的没人听', () => {
    const orphans = gameDispatchNames
      .filter((n) => consumersOf(n).size === 0)
      .sort();
    const marked = registered.filter((n) => GAME_EVENTS[n].hook).sort();
    expect(marked).toEqual(orphans);
    const thin = marked.filter((n) => GAME_EVENTS[n].hook.length < 12);
    expect(thin).toEqual([]);
  });

  it('动态事件名只有 REST_DIALOGUE_EVENTS 一个来源，且阶段合法', () => {
    expect(dynamicDispatches.map((d) => d.file)).toEqual(['game/RestDialogue.js']);
    /* 唯一允许的动态名必须是「查表」而不是「拼串」。
     * `rest-dialogue-${phase}` 同样会过上一条断言（还是这个文件里的动态位点），
     * 但它把 phase 拼错了就是一条无人监听、也无人报错的 CustomEvent —— B44 的原始病灶。
     * 所以这里钉住实现方式：名字只能从登记表里取。 */
    expect(templateDispatches).toEqual([]);
    const dialogueCode = stripComments(readFileSync(join(SRC, 'game/RestDialogue.js'), 'utf8'));
    expect(dialogueCode).toMatch(/REST_DIALOGUE_EVENTS\[/);
    expect(derivedNames.every((n) => n in GAME_EVENTS)).toBe(true);
    // 派生名族必须有人监听，否则它就是"静默消失"的下一个藏身处
    const deaf = derivedNames.filter((n) => consumersOf(n).size === 0);
    expect(deaf).toEqual([]);
  });

  it('登记表与其条目都是冻结的', () => {
    expect(Object.isFrozen(GAME_EVENTS)).toBe(true);
    expect(Object.isFrozen(REST_DIALOGUE_EVENTS)).toBe(true);
    expect(() => { GAME_EVENTS['__probe'] = {}; }).toThrow();
    expect(() => { GAME_EVENTS['zone-changed'].payload = null; }).toThrow();
  });
});

/*
 * 本切片修掉的三条活病例，钉成回归。
 * 三条都不需要跑起来才能确认 —— 它们各自的判据就是"某个字符串在不在某处出现"，
 * 而这正是修前修后唯一的区别。
 */
describe('B44 抓到的三条病例（回归钉）', () => {
  const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

  it('CG 图鉴认的是派发方真正发的那条名字', () => {
    const cg = read('game/CgGallerySystem.js');
    expect(cg).toMatch(/addEventListener\('dungeon-room-cleared'/);
    expect(cg).not.toMatch(/'dungeon-room-clear'/);
    expect(read('world/DungeonManager.js')).toMatch(/new CustomEvent\('dungeon-room-cleared'/);
  });

  it('时停结束有人把区副标题还回去', () => {
    const hud = read('ui/HUD.js');
    expect(hud).toMatch(/addEventListener\('time-stop-end'/);
    // 覆盖层要能撤，且只有开它的那一路能撤
    expect(hud).toMatch(/_clearSubtitleOverlay\('timeStop'\)/);
    expect(hud).toMatch(/_setSubtitleOverlay\('timeStop'/);
  });

  it('深渊再探真的带上了 HUD 要读的那个键', () => {
    const dm = read('world/DungeonManager.js');
    const at = dm.indexOf("new CustomEvent('dungeon-enter'");
    expect(at).toBeGreaterThan(-1);
    const call = dm.slice(at, at + 400);
    expect(call).toMatch(/rerun:/);
    // 判据不能是常量：clears 之后重进才算再探
    expect(call).toMatch(/this\.cleared\.has\(dungeon\.def\.id\)/);
  });
});

describe('营火对话的阶段映射（派生名族的行为面）', () => {
  let RestDialogue;

  beforeAll(async () => {
    installWindowShim();
    ({ RestDialogue } = await import('../src/game/RestDialogue.js'));
  });

  it('合法阶段派发到登记过的名字', () => {
    const seen = [];
    window.addEventListener('rest-dialogue-open', (e) => seen.push(['open', e.detail]));
    window.addEventListener('rest-dialogue-node', (e) => seen.push(['node', e.detail]));
    const dialogue = new RestDialogue({});
    dialogue._emit('open', 'hub', 'start', { speaker: '锚火看守', text: '第一行\n第二行' });
    dialogue._emit('node', 'hub', 'next', { speaker: '锚火看守', text: '另一句' });
    expect(seen.map((s) => s[0])).toEqual(['open', 'node']);
    // 负载形状与登记一致
    expect(Object.keys(seen[0][1]).sort()).toEqual(
      ['accent', 'linePreview', 'mood', 'nodeId', 'restId', 'speaker', 'speakerId'],
    );
    expect(seen[0][1].linePreview).toBe('第一行');
  });

  it('未知阶段直接抛错，而不是静默派发一条没人听的事件', () => {
    const dialogue = new RestDialogue({});
    expect(() => dialogue._emit('opn', 'hub', 'start', { text: 'x' })).toThrow(/未知对话阶段/);
    expect(() => dialogue._emit('constructor', 'hub', 'start', { text: 'x' })).toThrow(/未知对话阶段/);
  });

  afterAll(() => {
    delete globalThis.window;
    delete globalThis.CustomEvent;
  });
});
