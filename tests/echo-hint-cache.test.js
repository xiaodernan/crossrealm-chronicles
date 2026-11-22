/**
 * EchoHintCache 门禁 —— 回声提示的本地结果缓存（省 token）。
 *
 * 钉住：坏档自愈 / 有上限 / 值限长 / 中英文分键 / 最近使用刷新。
 * 变异判据：去掉上限 → 超限用例红；去掉 lang 分键 → 双语用例红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { EchoHintCache } from '../src/game/EchoHintCache.js';

const LS = 'crossrealm_echo_hint_cache_v1';
let realLS;
const store = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => data.clear(),
  };
};

beforeEach(() => { realLS = globalThis.localStorage; globalThis.localStorage = store(); });
afterEach(() => { globalThis.localStorage = realLS; });

describe('EchoHintCache', () => {
  it('空缓存：get 返回 null', () => {
    const c = new EchoHintCache();
    expect(c.get('echo-a', 'zh')).toBeNull();
    expect(c.size()).toBe(0);
  });

  it('写入后可读回；中英文分键互不覆盖', () => {
    const c = new EchoHintCache();
    expect(c.set('echo-a', 'zh', '中文提示')).toBe(true);
    expect(c.set('echo-a', 'en', 'english hint')).toBe(true);
    expect(c.get('echo-a', 'zh')).toBe('中文提示');
    expect(c.get('echo-a', 'en')).toBe('english hint');
    expect(c.get('echo-b', 'zh')).toBeNull();
  });

  it('重启（新实例）后仍在', () => {
    const c1 = new EchoHintCache();
    c1.set('echo-a', 'zh', '中文提示');
    const c2 = new EchoHintCache();
    expect(c2.get('echo-a', 'zh')).toBe('中文提示');
  });

  it('非法输入拒收：非字符串 / 空串 / 超长', () => {
    const c = new EchoHintCache();
    expect(c.set('echo-a', 'zh', null)).toBe(false);
    expect(c.set('echo-a', 'zh', 123)).toBe(false);
    expect(c.set('echo-a', 'zh', '   ')).toBe(false);
    expect(c.set('echo-a', 'zh', 'x'.repeat(241))).toBe(false);
    expect(c.set('', 'zh', 'x')).toBe(false);
    expect(c.size()).toBe(0);
  });

  it('上限 60 条：超限丢最旧，最新仍在', () => {
    const c = new EchoHintCache();
    for (let i = 0; i < 70; i++) c.set(`e${i}`, 'zh', `hint ${i}`);
    expect(c.size()).toBeLessThanOrEqual(60);
    expect(c.get('e69', 'zh')).toBe('hint 69');
    expect(c.get('e0', 'zh')).toBeNull(); // 最旧的被挤掉
  });

  it('重复写入同一键：刷新最近使用次序，不重复占位', () => {
    const c = new EchoHintCache();
    c.set('a', 'zh', 'A');
    c.set('b', 'zh', 'B');
    c.set('a', 'zh', 'A2'); // a 变最近 → 插入序变成 b, a
    expect(c.size()).toBe(2);
    expect(c.get('a', 'zh')).toBe('A2');
    for (let i = 0; i < 58; i++) c.set(`n${i}`, 'zh', `N${i}`); // 恰好 60 条
    expect(c.size()).toBe(60);
    c.set('n58', 'zh', 'N58'); // 第 61 条 → 挤掉最旧的 b
    expect(c.size()).toBe(60);
    // a 因刚被刷新过而幸存；b 是最旧的，先死
    expect(c.get('a', 'zh')).toBe('A2');
    expect(c.get('b', 'zh')).toBeNull();
  });

  it('坏档（非法 JSON / 非对象 / 混入非字符串）自愈', () => {
    localStorage.setItem(LS, '{not-json');
    expect(() => new EchoHintCache()).not.toThrow();
    expect(new EchoHintCache().size()).toBe(0);

    // 只认 `id|zh|en` 形状：无 lang 后缀的裸键、非字符串值、超长值一律过滤
    localStorage.setItem(LS, JSON.stringify({
      'ok|zh': 'fine', bare: 'nokey', 'bad|zh': 42, 'huge|zh': 'x'.repeat(300),
    }));
    const c = new EchoHintCache();
    expect(c.get('ok', 'zh')).toBe('fine');
    expect(c.size()).toBe(1);
  });
});

describe('接线：PopCultureJournalTab 的缓存优先级（静态门禁）', () => {
  const src = () => readFileSync('src/ui/PopCultureJournalTab.js', 'utf8');

  it('缓存读取发生在 fetchEchoHint 之前（命中即零请求）', () => {
    const s = src();
    const getIdx = s.indexOf('echoHintCache.get(');
    const fetchIdx = s.indexOf('fetchEchoHint({');
    expect(getIdx).toBeGreaterThan(0);
    expect(fetchIdx).toBeGreaterThan(0);
    expect(getIdx).toBeLessThan(fetchIdx);
  });

  it('请求成功后把提示写进缓存', () => {
    const s = src();
    expect(s).toMatch(/echoHintCache\.set\(id, lang, data\.hint\)/);
    const setIdx = s.indexOf('echoHintCache.set(');
    const fetchIdx = s.indexOf('fetchEchoHint({');
    expect(setIdx).toBeGreaterThan(fetchIdx);
  });
});
