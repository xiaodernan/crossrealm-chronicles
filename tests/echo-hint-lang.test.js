/**
 * 回声提示的语言透传门禁（与 DeathHint 墓志双语同源）。
 *
 * 服务端 echo-hint 在英文模式下必须收 lang=en，否则会把英文输入翻成中文短句、
 * guard 还按 60 字（中文口径）截断英文。本文件钉住两层：
 *  ① OnlineServices.fetchEchoHint 把 lang 透传进请求体（给了才带，保持向后兼容）；
 *  ② PopCultureJournalTab 按当前语言动态取 lang，不写死。
 *
 * 变异判据：把 lang 从请求体删掉 / 前端写死 'zh' → 对应用例红。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { OnlineServices } from '../src/online/OnlineServices.js';
import { setLanguage, getLanguage } from '../src/engine/i18n.js';

const BASE = 'http://localhost:9999';

describe('fetchEchoHint 请求体透传 lang', () => {
  it('给了 lang：请求体带 lang=en', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ available: true, hint: 'x' }) });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    await svc.fetchEchoHint({ franchise: 'stars', title: 'Engine Hum', desc: 'x', lang: 'en' });
    const [, init] = fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ franchise: 'stars', title: 'Engine Hum', lang: 'en' });
  });

  it('没给 lang：请求体不含 lang（老调用方兼容）', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ available: true, hint: 'x' }) });
    const svc = new OnlineServices({ baseUrl: BASE, fetchImpl: fetch, enabled: true });
    await svc.fetchEchoHint({ franchise: 'stars', title: '引擎低鸣', desc: '' });
    const [, init] = fetch.mock.calls[0];
    expect(JSON.parse(init.body)).not.toHaveProperty('lang');
  });
});

describe('回声提示 lang 取自当前语言（静态门禁）', () => {
  it('getLanguage 随 setLanguage 切换（依赖前提自证）', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    setLanguage('zh');
    expect(getLanguage()).toBe('zh');
  });

  it('PopCultureJournalTab 的 fetchEchoHint 调用带动态 lang，不写死 zh', () => {
    const src = readFileSync('src/ui/PopCultureJournalTab.js', 'utf8');
    const call = src.slice(src.indexOf('fetchEchoHint({'), src.indexOf('fetchEchoHint({') + 200);
    expect(call).toMatch(/getLanguage\(\)/);
    expect(call).not.toMatch(/lang:\s*'zh'/);
  });
});
