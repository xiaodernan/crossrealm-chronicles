/**
 * i18n 键名规范 / 模板约定 / 运行时口径门禁（W-D2 切片56）。
 *
 * 为什么单开一份：`tests/i18n.test.js` 背着 ~77s 的死键全表扫描，而这些检查全是
 * 纯静态的正则/集合运算，毫秒级；混在一起会让每次定向验证都为快检查等慢门禁。
 * 本文件是「新内容接入规范」（docs/I18N_GUIDE.md）的门禁化：规范里写的每条约定，
 * 这里都有一条腿盯着，且每条静态腿都带反向控制（假钉子必须被点名，防"永远全过"）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS_ZH, STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRINGS_EN, STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';
import { t, setLanguage, LANGUAGES } from '../src/engine/i18n.js';

describe('键名规范（W-D2 切片56：小写 snake_case，命名族不漂移）', () => {
  const NAME_RE = /^[a-z][a-z0-9_]*$/;

  it('两表全部键名都合规', () => {
    const badZh = ZH_KEYS.filter((k) => !NAME_RE.test(k));
    const badEn = EN_KEYS.filter((k) => !NAME_RE.test(k));
    expect(badZh, '中文表不合规键名').toEqual([]);
    expect(badEn, '英文表不合规键名').toEqual([]);
  });

  it('反向控制：尺子必须筛得出不合规键名（防"永远返回空"）', () => {
    const probe = ['good_key', 'Bad-Key', 'has space', 'UPPER', '9leading'];
    expect(probe.filter((k) => !NAME_RE.test(k))).toEqual(['Bad-Key', 'has space', 'UPPER', '9leading']);
  });
});

describe('_fmt 后缀与 ${} 占位的双向约定（W-D2 切片56）', () => {
  const hasHolder = (v) => /\$\{\w+(?:\|[^}]*)?\}/.test(v);

  it('_fmt 后缀键：两表模板都带 ${} 占位（后缀承诺了插值，模板里就得有得可插）', () => {
    const fmtKeys = ZH_KEYS.filter((k) => k.endsWith('_fmt'));
    expect(fmtKeys.length, '一个 _fmt 键都没有，扫描坏了').toBeGreaterThan(0);
    expect(fmtKeys.filter((k) => !hasHolder(STRINGS_ZH[k])), '中文表 _fmt 键缺占位').toEqual([]);
    expect(fmtKeys.filter((k) => !hasHolder(STRINGS_EN[k])), '英文表 _fmt 键缺占位').toEqual([]);
  });

  it('反向控制：缺占位的假 _fmt 键必须被点名', () => {
    const fake = { a_fmt: '没有占位', b_fmt: '有 ${x} 占位' };
    expect(Object.keys(fake).filter((k) => k.endsWith('_fmt') && !hasHolder(fake[k]))).toEqual(['a_fmt']);
  });

  it('含 ${} 占位的键不许走 data-i18n 走查：走查不插值，挂上去就漏出字面量 ${x}', () => {
    const placeholderKeys = new Set(ZH_KEYS.filter((k) => hasHolder(STRINGS_ZH[k])));
    expect(placeholderKeys.size, '一个占位键都没有，扫描坏了').toBeGreaterThan(0);
    const walk = (dir) => readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
    const files = [...walk(join(process.cwd(), 'src')), join(process.cwd(), 'index.html')];
    const leaks = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const rel = file.slice(process.cwd().length + 1).replace(/\\/g, '/');
      for (const m of text.matchAll(/data-i18n(?:-aria)?\s*=\s*["'`]\s*([a-z0-9_]+)/g)) {
        if (placeholderKeys.has(m[1])) leaks.push(`${rel}: data-i18n="${m[1]}"`);
      }
    }
    expect(leaks, '占位键被挂上 DOM 走查，换语言后玩家会看到字面量 ${...}').toEqual([]);
    // 反向控制：探针键必须真的在占位集合里，且过滤器点名它
    expect(placeholderKeys.has('hud_souls_display_fmt'), '探针键 hud_souls_display_fmt 应含占位').toBe(true);
    const probeRefs = ['common_confirm', 'hud_souls_display_fmt'];
    expect(probeRefs.filter((k) => placeholderKeys.has(k))).toEqual(['hud_souls_display_fmt']);
  });
});

describe('英文复数标记（W-D2 切片58：${param|单数|复数} 计数名词单元）', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('英文表所有标记都是三段式，且替代段是纯词（不含 ${ } |）', () => {
    const bad = [];
    for (const [key, value] of Object.entries(STRINGS_EN)) {
      for (const m of value.matchAll(/\$\{[^}]*\}/g)) {
        if (!m[0].includes('|')) continue;
        if (!/^\$\{\w+\|[^|}]*\|[^|}]*\}$/.test(m[0])) bad.push(key + ': ' + m[0]);
      }
    }
    expect(bad, '这些标记不是三段式，或替代段里混了 ${ } |').toEqual([]);
  });

  it('中文表零标记：中文靠量词，不靠词形变化', () => {
    const bad = Object.entries(STRINGS_ZH).filter(([, v]) => /\$\{\w+\|/.test(v)).map(([k]) => k);
    expect(bad, '中文表不该出现复数标记').toEqual([]);
  });

  it('反向控制：二段式假标记与中文标记都必须被点名（防扫描永远返回空）', () => {
    const segs = [...'x ${n|time} y'.matchAll(/\$\{[^}]*\}/g)].map((m) => m[0]).filter((s) => s.includes('|'));
    expect(segs.every((s) => /^\$\{\w+\|[^|}]*\|[^|}]*\}$/.test(s))).toBe(false);
    expect(/\$\{\w+\|/.test('中文 ${n|次|回}')).toBe(true);
  });

  it('运行时：计数 1 取单数、其余取复数（真键实测，中英落位一致）', () => {
    expect(t('cg_view_count_fmt', { n: 1 })).toBe('Viewed 1 time');
    expect(t('cg_view_count_fmt', { n: 3 })).toBe('Viewed 3 times');
    expect(t('skill_lock_flag_fmt', { flag: 'X', count: 1, have: 0 })).toBe('Trigger story flag X 1 time (0/1)');
    expect(t('skill_lock_flag_fmt', { flag: 'X', count: 2, have: 0 })).toBe('Trigger story flag X 2 times (0/2)');
    setLanguage('zh');
    expect(t('cg_view_count_fmt', { n: 1 })).toBe('观看 1 次');
    setLanguage('en');
  });
});

describe('文档语言声明（W-D2 切片59：<html lang> 跟着语言切）', () => {
  afterEach(() => {
    delete globalThis.document;
  });

  it('setLanguage 把 document.documentElement.lang 切成该语言的 BCP47 标签', () => {
    globalThis.document = { documentElement: {} };
    setLanguage('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
    setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('LANGUAGES 每条都带 htmlLang：加语言只改名册这一处', () => {
    for (const l of LANGUAGES) {
      expect(l.htmlLang, l.code + ' 缺 htmlLang').toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
    }
  });

  it('反向控制：缺 htmlLang 的假名册必须被点名（防扫描永远返回空）', () => {
    const 假名册 = [{ code: 'zh', htmlLang: 'zh-CN' }, { code: 'en' }];
    const 缺的 = 假名册.filter((l) => !/^[a-z]{2}(-[A-Z]{2})?$/.test(l.htmlLang ?? ''));
    expect(缺的.map((l) => l.code)).toEqual(['en']);
  });
});

describe('缺键告警去重（W-D2 切片56 运行时口径）', () => {
  beforeEach(() => {
    setLanguage('zh');
  });

  it('同一个缺失键整局只 warn 一次，但每次调用都返回 [MISSING: key]', () => {
    const key = 's56_probe_missing_alpha';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(t(key)).toBe(`[MISSING: ${key}]`);
      expect(t(key)).toBe(`[MISSING: ${key}]`);
      expect(t(key)).toBe(`[MISSING: ${key}]`);
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes(key));
      expect(hits.length, '同一个缺失键只许告警一次（t() 在每帧路径上，逐帧刷屏会埋掉真正的报错）').toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('不同缺失键各告警一次：去重是按键分的，不是全局静音', () => {
    const key = 's56_probe_missing_beta';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      t(key);
      const hits = warn.mock.calls.filter((c) => String(c[0]).includes(key));
      expect(hits.length).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });
});
