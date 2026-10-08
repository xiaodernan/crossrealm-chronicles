/**
 * 全局桩的**构造器**门禁（本轮新增）。
 *
 * ## 为什么需要它
 *
 * 测试为了让某个方法跑得起来，常给 `globalThis` 挂桩。挂 `window` / `document` /
 * `localStorage` 这类**普通对象**没问题 —— 它们本来就不是构造器。出事的是把**构造器**
 * 换成普通对象：`globalThis.URL = { createObjectURL: () => 'blob:x' }`。
 *
 * 症状与调用点毫无关系，所以极难查：
 * - `new URL(...)` 当场 TypeError；
 * - 任何 `x instanceof URL` 的读者也当场抛 —— 右操作数不可调用。
 *   本仓库实测（2026-10-08）：沙箱的 fs shim 内部就有一句 `instanceof URL`，
 *   于是 `tests/save-slots.test.js` 里那条**读源码**的门禁直接崩
 *   （`Right-hand side of 'instanceof' is not callable`），而报错栈里只有 shim，
 *   没有一行指向"这个文件把 URL 换掉了"。同一条红在全量跑里表现为"1 failed"，
 *   看起来像源码门禁本身坏了。
 *
 * 判据因此只有一句话：**`globalThis.<构造器>` 的右值必须还是个可 `new` / 可 `instanceof`
 * 的东西**（class / function / 另一个构造器 / `Object.assign` 出来的可调用体）。
 * 对象字面量、数组、字符串、数字一律红。
 *
 * ## 三条断言各管一件事
 *
 * - **口径**：构造器名单只有一份（本文件），且必须真的覆盖 `URL`（就是我们踩到的那一枚）。
 * - **前提当场成立**：`tests/` 全域扫一遍，违规必须为空；同时扫描器得**不是瞎的** ——
 *   它必须真的看见了那些**被允许**的普通对象桩（`window` / `document` / `localStorage`），
 *   否则"一条都没报"可能只是正则没匹配上。
 * - **反向控制**：同一套判据喂给人造样本，坏写法点名、好写法放行，各一条。
 *
 * 限度（写清楚，别当它比实际更强）：它只看 `globalThis.X = ...` 这一种赋值形态，
 * 不看 `Object.defineProperty(globalThis, 'X', ...)`、不看 `globalThis['X'] = ...`、
 * 也不管在 `window.X = ...` 上挂的同名桩 —— 今天仓库里没有那几种写法。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/**
 * 会被 `instanceof` / `new` 的全局构造器。只收**测试真可能去桩**的那些 ——
 * 名单越宽，误报越多（`window` / `document` / `navigator` / `localStorage` 刻意不在里面，
 * 它们本来就是普通对象）。
 */
const CONSTRUCTOR_GLOBALS = [
  'URL', 'Blob', 'File', 'FileReader', 'Response', 'Request', 'Headers', 'FormData',
  'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal',
  'Event', 'CustomEvent', 'EventTarget', 'ProgressEvent',
  'MessageChannel', 'Worker', 'Image', 'Audio', 'AudioContext', 'DOMParser',
  'XMLHttpRequest', 'WebSocket', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'OffscreenCanvas', 'Path2D', 'Node', 'Element', 'HTMLElement', 'HTMLCanvasElement',
  'CanvasRenderingContext2D', 'Storage', 'Navigator',
];

/** 只剥注释、保留字符串 —— 判据要找的正是"赋值写成什么样"，字符串里的键名不算注释 */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const 名字表 = CONSTRUCTOR_GLOBALS.join('|');
const 赋值 = new RegExp(`globalThis\\.(${名字表})\\s*=\\s*([^\\n;]*)`, 'g');

/** 右值长得可调用吗 —— class / function / 标识符 / Object.assign / 箭头函数都算 */
function 可调用(rhs) {
  const v = rhs.trim();
  if (!v) return true; // 跨行赋值：右值在下一行，本行截不到 —— 不误报
  if (/^[[{]/.test(v)) return false; // 对象字面量 / 数组字面量
  if (/^['"`\d]/.test(v)) return false; // 字符串 / 数字字面量
  if (/^(true|false|null)$/.test(v)) return false;
  return true;
}

/** 从一份源码里挑出"把构造器换成非可调用值"的赋值 */
export function 违规赋值(source) {
  const code = stripComments(source);
  const out = [];
  for (const m of code.matchAll(赋值)) {
    if (!可调用(m[2])) out.push({ name: m[1], rhs: m[2].trim() });
  }
  return out;
}

/** 从一份源码里挑出**所有**构造器赋值（含合法的）—— 用来证明扫描器不是瞎的 */
export function 全部构造器赋值(source) {
  const code = stripComments(source);
  return [...code.matchAll(赋值)].map((m) => ({ name: m[1], rhs: m[2].trim() }));
}

/** 从一份源码里挑出"给普通对象挂桩"的赋值 —— 这类是合法的，用来给扫描器当正面样本 */
const 普通对象赋值 = /globalThis\.(window|document|navigator|localStorage|sessionStorage)\s*=\s*\{/g;
export function 普通对象桩(source) {
  return [...stripComments(source).matchAll(普通对象赋值)].length;
}

function 测试文件() {
  return readdirSync(join(ROOT, 'tests'))
    .filter((n) => n.endsWith('.js'))
    .map((n) => `tests/${n}`);
}

describe('全局桩不许把构造器换成普通对象', () => {
  it('构造器名单非空，且覆盖我们踩到的那一枚（URL）', () => {
    expect(CONSTRUCTOR_GLOBALS.length).toBeGreaterThan(0);
    expect(CONSTRUCTOR_GLOBALS, 'URL 不在名单里 —— 这条门禁就管不到它自己踩过的那个坑').toContain('URL');
  });

  it('tests/ 全域没有"把构造器换成非可调用值"的赋值', () => {
    const 违规 = [];
    for (const file of 测试文件()) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      for (const v of 违规赋值(src)) 违规.push(`${file}: globalThis.${v.name} = ${v.rhs}`);
    }
    expect(
      违规,
      `这些桩把构造器换成了普通对象 —— 同一进程里所有 \`instanceof\` 的读者会当场抛，`
      + `而报错栈不会指向这里：\n${违规.join('\n')}\n`
      + '改法：用子类（`class extends 真构造器 { static 缺的方法() {} }`），或把方法挂到真构造器上。'
    ).toEqual([]);
  });

  it('扫描器不是瞎的：它真的看见了被允许的普通对象桩与合法的构造器桩', () => {
    const files = 测试文件();
    expect(files.length, 'tests/ 一个文件都没列出来 —— 扫描器坏了').toBeGreaterThan(20);
    let 普通 = 0;
    let 构造器 = 0;
    for (const file of files) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      普通 += 普通对象桩(src);
      构造器 += 全部构造器赋值(src).length;
    }
    expect(普通, '一处 `globalThis.window = {` 都没扫到 —— 正则或注释剥离坏了').toBeGreaterThan(0);
    expect(构造器, '一处构造器赋值都没扫到 —— 名单与正则对不上（URL 那两处应当在里面）').toBeGreaterThan(0);
  });

  it('反向控制：坏写法点名，好写法放行', () => {
    // 样本一律**拼**出来（`G` + 名字），否则这些反面样本的字面量本身会被上面那条
    // 全域扫描当成真违规 —— 门禁扫自己的源码时，"举例说明"与"真的这么写"必须分得开。
    const G = 'globalThis.';
    const 桩 = (name, rhs) => `${G}${name} = ${rhs};`;
    // 坏：换成普通对象（这正是踩过的坑）
    expect(违规赋值(桩('URL', "{ createObjectURL: () => 'blob:x' }")))
      .toEqual([{ name: 'URL', rhs: "{ createObjectURL: () => 'blob:x' }" }]);
    // 坏：换成数组 / 字面量
    expect(违规赋值(桩('CustomEvent', '[]')).length).toBe(1);
    expect(违规赋值(桩('Blob', "'nope'")).length).toBe(1);
    // 好：子类、函数、标识符、Object.assign 都不报
    expect(违规赋值(桩('URL', 'class extends URL { static createObjectURL() {} }'))).toEqual([]);
    expect(违规赋值(桩('Blob', 'class {}'))).toEqual([]);
    expect(违规赋值(桩('URL', '原URL'))).toEqual([]);
    expect(违规赋值(桩('CustomEvent', 'Object.assign(Event, { x: 1 })'))).toEqual([]);
    // 跨行的对象字面量照样要点名（`\s*` 会吃掉换行，右值第一枚非空白字符就是 `{`）
    expect(违规赋值(`${G}URL =\n  { createObjectURL: () => 1 };`).length).toBe(1);
    // 跨行的**子类**不报（右值第一枚字符是 `class`）
    expect(违规赋值(`${G}URL =\n  class extends URL {};`)).toEqual([]);
    // 普通对象不在名单里：window / document 挂桩是合法的
    expect(违规赋值(桩('window', '{ addEventListener() {} }'))).toEqual([]);
    expect(违规赋值(桩('document', '{ createElement: () => ({}) }'))).toEqual([]);
    // 注释里提到它不算
    expect(违规赋值(`// 反面样本：${G}URL = { createObjectURL() {} };`)).toEqual([]);
  });
});
