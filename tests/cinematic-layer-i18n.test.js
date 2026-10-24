/**
 * 演出层 / 拍照层文案的双表门禁（W-D2 切片34）。
 *
 * ## 这一片解决什么
 *
 * 切片17 收了 `BOSS_CINEMATICS`（过场标题 / 副标题 / 正文），切片27/31 收了演出层遮罩与
 * toast。但**战斗演出的那一行大字**与**拍照模式**这一族一直是裸中文：
 *
 * - `CombatCameraDirector.PRESETS` 四格 `label`（连击终结 / 致命反击 / 处决 / Boss 击破）
 *   在 `play()` 那一刻写进一个**运行时新建**的 div —— `applyTranslations` 的文档走查
 *   从开机起就跑，那时这个 div 还不存在，于是永远够不到它；
 * - `CombatCinematicSkip` 的跳过 toast 与首次提示；
 * - `PhotoModeDirector` 的常驻提示与进出两句 toast。
 *
 * 英文玩家在慢镜头里看到「连击终结」、在拍照模式里看到「拍照模式 · P 退出 · 滚轮缩放」，
 * 没有一处会报错，也没有任何门禁会响。
 *
 * ## 机制
 *
 * 标签改存**文案键**（`labelKey`），播出那一刻 `t()` 展开；`{escape}` / `{photoMode}`
 * 占位照旧走 `keyText(t(键))`（承切片27 的单花括号口径）。三格复用既有键
 * （`tip_finisher_title` / `cg_gallery_riposte` / `caption_execution`）—— 那三个值在
 * 双表里都已占满「同文案最多两键」的上限，新开必红；`bossKill` 没有同值键，新开一格。
 *
 * ## 用例分七层
 * ① 钉文案腿：6 个新键 + 3 个复用键的中英原值逐字钉死；
 * ② 键登记腿：九个键两表都在场，键数 2291 → 2297 → 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409；
 * ③ 静态腿：三个文件里去注释后**字符串字面量里**再无中文（标识符里的中文是仓库惯例，不算）；
 * ④ 信标大字腿：真构造导演，`play()` 写进 DOM 的是展开句，中英两语各一遍；
 * ⑤ 跳过腿：`skip()` 的 toast 与调度到期的首次提示都是展开句，占位符不留花括号；
 * ⑥ 拍照腿：进 / 出 / 常驻提示三处都是展开句；
 * ⑦ 反面证据：尺子自己要被量过（键表过滤器、占位符真的被换掉）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { CombatCameraDirector } from '../src/cinematic/CombatCameraDirector.js';
import { CombatCinematicSkip } from '../src/cinematic/CombatCinematicSkip.js';
import { PhotoModeDirector } from '../src/cinematic/PhotoModeDirector.js';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { setLanguage } from '../src/engine/i18n.js';
import { keyHint } from '../src/ui/keyHints.js';
import { scheduler } from '../src/engine/Scheduler.js';
import { offAll } from '../src/engine/EventBus.js';

const ROOT = process.cwd();
const 读 = (p) => readFileSync(join(ROOT, p), 'utf8');

/** 6 个新键 + 3 个复用键：键 → [中文原值, 英文原值] */
const KEYS = {
  cine_label_boss_kill: ['Boss 击破', 'Boss Slain'],
  cine_skip_toast: ['演出已跳过', 'Cinematic skipped'],
  cine_skip_hint: ['按 {escape} 可跳过战斗演出', 'Press {escape} to skip the cinematic'],
  photo_hint: ['拍照模式 · {photoMode} 退出 · 滚轮缩放', 'Photo mode · {photoMode} to exit · scroll to zoom'],
  photo_toast_hidden: ['拍照模式 — UI 已隐藏', 'Photo mode — UI hidden'],
  photo_toast_exit: ['已退出拍照模式', 'Exited photo mode'],
  // 复用：同值键在双表里已占满「同文案最多两键」上限，新开必红
  tip_finisher_title: ['连击终结', 'Combo Finisher'],
  cg_gallery_riposte: ['致命反击', 'Riposte'],
  caption_execution: ['处决', 'Execution'],
};

const 三个文件 = [
  'src/cinematic/CombatCameraDirector.js',
  'src/cinematic/CombatCinematicSkip.js',
  'src/cinematic/PhotoModeDirector.js',
];

/** 极简词法扫描：只取字符串/模板字面量的区间（标识符里的中文是仓库惯例，不当文案） */
function 字符串字面量(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const nx = src[i + 1];
    if (c === '/' && nx === '/') { while (i < n && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && nx === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1; i += 2; continue; }
    if (c === "'" || c === '"') {
      const q = c; const start = i; i += 1;
      while (i < n) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) { i += 1; break; } if (src[i] === '\n') break; i += 1; }
      out.push({ start, end: i, tpl: false }); continue;
    }
    if (c === '`') {
      const start = i; i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') { i += 1; break; }
        if (src[i] === '$' && src[i + 1] === '{') { i += 2; continue; }
        i += 1;
      }
      out.push({ start, end: i, tpl: true }); continue;
    }
    i += 1;
  }
  return out;
}

/** 模板串里 ${...} 是插值（标识符 / 表达式），不是文案 —— 剔掉再判中文 */
const 文案部分 = (src, s) => (s.tpl ? src.slice(s.start, s.end).replace(/\$\{[^}]*\}/g, '') : src.slice(s.start, s.end));

class FakeElement {
  constructor() {
    this.children = [];
    this.style = { setProperty() {}, opacity: '' };
    this.classList = { add() {}, remove() {}, contains: () => false };
    this.textContent = '';
    this.innerHTML = '';
  }
  appendChild(c) { this.children.push(c); return c; }
  setAttribute() {}
  getElementById() { return null; }
}

const 装DOM = () => {
  globalThis.document = { createElement: () => new FakeElement(), body: new FakeElement() };
  globalThis.requestAnimationFrame = () => 0;
};

const mkPlayerStub = () => ({
  position: new THREE.Vector3(0, 0, 0),
  combat: { lockTarget: null },
  getCombatForwardXZ: () => new THREE.Vector3(0, 0, 1),
  timeSlow: 1,
});

const mk导演 = () => {
  const game = {
    player: mkPlayerStub(),
    cinematicActive: false,
    cinematics: null,
    restScene: null,
    combatInputLock: { lock() {}, release() {} },
    audio: { heavyHit() {}, executionSting() {} },
    executionFx: { burst() {} },
    dialog: { toast: () => {} },
  };
  return { game, d: new CombatCameraDirector(game) };
};

beforeAll(() => { 装DOM(); });
beforeEach(() => { setLanguage('zh'); scheduler.clearAll(); });
afterAll(() => {
  setLanguage('zh');
  offAll('cinematic/CombatCameraDirector');
  offAll('combat-cinematic-skip');
  delete globalThis.document;
  delete globalThis.requestAnimationFrame;
});

/* ------------------------------------------------------------------ *
 * ① 钉文案
 * ------------------------------------------------------------------ */

describe('① 钉文案：6 个新键 + 3 个复用键的中英原值逐字钉死', () => {
  it('九个键的中英原值与切片34 收口时逐字相同', () => {
    expect(Object.keys(KEYS)).toHaveLength(9);
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(STRINGS_ZH[key], `zh 表里 ${key} 的原值被改了`).toBe(zh);
      expect(STRINGS_EN[key], `en 表里 ${key} 的原值被改了`).toBe(en);
    }
  });

  it('复用键的两个值已占满「同文案最多两键」上限，第三个也仍选复用（一个词一个住址）', () => {
    const 已满 = ['连击终结', '处决'];
    for (const v of 已满) {
      const 同值键 = Object.keys(STRINGS_ZH).filter((k) => STRINGS_ZH[k] === v);
      expect(同值键.length, `${v} 已有 ${同值键.length} 个键`).toBe(2);
    }
    // 致命反击今天只有一个键 —— 还空着一个位，但同一个词不该有两个住址
    const 反击键 = Object.keys(STRINGS_ZH).filter((k) => STRINGS_ZH[k] === '致命反击');
    expect(反击键).toEqual(['cg_gallery_riposte']);
  });
});

/* ------------------------------------------------------------------ *
 * ② 键登记与键数
 * ------------------------------------------------------------------ */

describe('② 键登记：九个键两表都在场，键数只增不减', () => {
  it('九个键中英两表一个不缺', () => {
    const zh = new Set(ZH_KEYS);
    const en = new Set(EN_KEYS);
    for (const key of Object.keys(KEYS)) {
      expect(zh.has(key), `中文表缺 ${key}`).toBe(true);
      expect(en.has(key), `英文表缺 ${key}`).toBe(true);
    }
  });

  it('键数 2291 → 2297 → 2304 → 2307 → 2323 → 2349 → 2353 → 2356 → 2371 → 2388 → 2399 → 2404 → 2406 → 2409，两表逐键对齐', () => {
    expect(ZH_KEYS.length).toBe(EN_KEYS.length);
    expect(ZH_KEYS.length, '键数不是 2409 —— 双表被别处改过').toBe(2409);
  });

  it('新键的占位符与旧版逐字相同（{escape} / {photoMode} 没被改名字）', () => {
    expect(STRINGS_ZH.cine_skip_hint).toContain('{escape}');
    expect(STRINGS_EN.cine_skip_hint).toContain('{escape}');
    expect(STRINGS_ZH.photo_hint).toContain('{photoMode}');
    expect(STRINGS_EN.photo_hint).toContain('{photoMode}');
  });
});

/* ------------------------------------------------------------------ *
 * ③ 静态腿
 * ------------------------------------------------------------------ */

describe('③ 静态腿：三个文件的字符串字面量里再无中文', () => {
  it('去注释后，字符串/模板字面量里一个中文字符都不剩', () => {
    for (const f of 三个文件) {
      const src = 读(f);
      const 漏网 = [];
      for (const s of 字符串字面量(src)) {
        const text = 文案部分(src, s);
        if (/[\u4e00-\u9fff]/.test(text)) {
          漏网.push(`第 ${src.slice(0, s.start).split('\n').length} 行: ${text.replace(/\s+/g, ' ').slice(0, 60)}`);
        }
      }
      expect(漏网, `${f} 的字符串字面量里还有中文`).toEqual([]);
    }
  });

  it('扫描器自证：喂一段带中文的假源码，它必须咬得住（不是永真）', () => {
    const 假 = "const a = '裸中文';\nconst 标识符中文 = 1;\nconst b = `prefix${标识符中文}`;\n// 注释里的中文不算\n";
    const 漏网 = [];
    for (const s of 字符串字面量(假)) {
      const text = 文案部分(假, s);
      if (/[\u4e00-\u9fff]/.test(text)) 漏网.push(text);
    }
    expect(漏网, '扫描器把该报的放过去了').toEqual(["'裸中文'"]);
  });

  it('CombatCameraDirector 的四格 labelKey 都在两表里，且没有 label 残留', () => {
    const src = 读('src/cinematic/CombatCameraDirector.js');
    const 块 = src.slice(src.indexOf('const PRESETS = {'), src.indexOf('\n};', src.indexOf('const PRESETS = {')));
    const keys = [...块.matchAll(/labelKey:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(keys).toEqual(['tip_finisher_title', 'cg_gallery_riposte', 'caption_execution', 'cine_label_boss_kill']);
    expect(块).not.toMatch(/label:/);
    for (const k of keys) {
      expect(new Set(ZH_KEYS).has(k), `${k} 不在中文表`).toBe(true);
      expect(new Set(EN_KEYS).has(k), `${k} 不在英文表`).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * ④ 信标大字
 * ------------------------------------------------------------------ */

describe('④ 信标大字：play() 写进 DOM 的是展开句', () => {
  it('四套 preset 中文下写的是那四个词', () => {
    const { d } = mk导演();
    for (const [kind, want] of [['finisher', '连击终结'], ['riposte', '致命反击'], ['execution', '处决'], ['bossKill', 'Boss 击破']]) {
      d.label.textContent = '';
      d.play(kind, { position: { x: 0, y: 0, z: 4 } });
      expect(d.label.textContent, `${kind} 的大字不对`).toBe(want);
    }
  });

  it('切到英文：同一批 preset 写的是英文', () => {
    setLanguage('en');
    const { d } = mk导演();
    for (const [kind, want] of [['finisher', 'Combo Finisher'], ['riposte', 'Riposte'], ['execution', 'Execution'], ['bossKill', 'Boss Slain']]) {
      d.label.textContent = '';
      d.play(kind, { position: { x: 0, y: 0, z: 4 } });
      expect(d.label.textContent, `${kind} 的大字没跟着换`).toBe(want);
    }
  });
});

/* ------------------------------------------------------------------ *
 * ⑤ 跳过
 * ------------------------------------------------------------------ */

describe('⑤ 跳过：toast 与首次提示都是展开句', () => {
  const mk跳过 = () => {
    const 收到 = [];
    const game = {
      player: mkPlayerStub(),
      combatCamera: { active: true, skip() {}, blocksInputUntil: 0 },
      combatInputLock: { locked: true, release() {} },
      dialog: { toast: (m, d) => 收到.push([m, d]) },
      executionSkipFx: { burst() {} },
    };
    return { 收到, s: new CombatCinematicSkip(game) };
  };

  it('skip() 的 toast 中英两语各一句', () => {
    const a = mk跳过();
    a.s.skip();
    expect(a.收到).toEqual([['演出已跳过', 1400]]);
    const b = mk跳过();
    setLanguage('en');
    b.s.skip();
    expect(b.收到).toEqual([['Cinematic skipped', 1400]]);
  });

  it('首次提示走 keyText(t(键))：占位符换成键名、不留花括号', () => {
    const a = mk跳过();
    a.s._maybeHint();
    scheduler.update(0.5);
    expect(a.收到).toHaveLength(1);
    const [文案, 时长] = a.收到[0];
    expect(时长).toBe(3200);
    expect(文案).toContain('跳过战斗演出');
    expect(文案).not.toContain('{escape}');
    expect(文案).not.toContain('{');
  });

  it('切到英文：提示是英文，占位符同样被换掉', () => {
    setLanguage('en');
    const a = mk跳过();
    a.s._maybeHint();
    scheduler.update(0.5);
    expect(a.收到).toHaveLength(1);
    expect(a.收到[0][0]).toContain('skip the cinematic');
    expect(a.收到[0][0]).not.toContain('{');
  });
});

/* ------------------------------------------------------------------ *
 * ⑥ 拍照模式
 * ------------------------------------------------------------------ */

describe('⑥ 拍照模式：常驻提示与进出两句 toast 都是展开句', () => {
  const mk拍照 = () => {
    const 收到 = [];
    const el = new FakeElement();
    globalThis.document = {
      createElement: () => el,
      body: new FakeElement(),
      getElementById: () => new FakeElement(),
    };
    const game = { dialog: { toast: (m, d) => 收到.push([m, d]) }, player: {} };
    return { 收到, el, p: new PhotoModeDirector(game) };
  };

  it('进入：常驻提示与 toast 都是中文展开句', () => {
    const { 收到, el, p } = mk拍照();
    p.toggle();
    expect(el.textContent).toBe(`拍照模式 · ${keyHint('photoMode')} 退出 · 滚轮缩放`);
    expect(收到).toEqual([['拍照模式 — UI 已隐藏', 2200]]);
  });

  it('切到英文再进出：提示与两句 toast 全英文，占位符不留花括号', () => {
    setLanguage('en');
    const { 收到, el, p } = mk拍照();
    p.toggle();
    expect(el.textContent).toBe(`Photo mode · ${keyHint('photoMode')} to exit · scroll to zoom`);
    expect(el.textContent).not.toContain('{');
    expect(收到).toEqual([['Photo mode — UI hidden', 2200]]);
    p.toggle();
    expect(收到[1]).toEqual(['Exited photo mode', undefined]);
  });
});

/* ------------------------------------------------------------------ *
 * ⑦ 反面证据
 * ------------------------------------------------------------------ */

describe('⑦ 反面证据：尺子自己要被量过', () => {
  it('键表过滤器认得出没登记的键（①② 两条不是永真）', () => {
    expect(Object.keys(KEYS).filter((k) => !(k in STRINGS_ZH))).toEqual([]);
    expect(Object.keys(KEYS).filter((k) => !(k in STRINGS_EN))).toEqual([]);
    expect(['photo_hint', 'no_such_key_xyz'].filter((k) => !(k in STRINGS_EN))).toEqual(['no_such_key_xyz']);
  });

  it('九个键的中英原值两两不同（否则"切成英文"那条断言是永真的）', () => {
    for (const [key, [zh, en]] of Object.entries(KEYS)) {
      expect(zh, `${key} 的中英原值一样`).not.toBe(en);
    }
  });

  it('「同值键恰好两个」这条判据能被人造表复现（不是永远为真）', () => {
    const 数 = (表, v) => Object.keys(表).filter((k) => 表[k] === v).length;
    const 假表 = { a: '同', b: '同', c: '别的' };
    expect(数(假表, '同')).toBe(2);
    expect(数(假表, '别的')).toBe(1);
  });
});
