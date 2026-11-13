/**
 * W-Z25：设置页「在场人数」——按钮按下才拉 /api/presence/world/count（在场服务，W-Z-同游，:8084）
 *
 * 必须钉住：
 * 1) OnlineServices.fetchPresenceCount 默认关闭（enabled=false → null，fetchImpl 零调用）；
 * 2) channel 白名单与服务端同源（`^[A-Za-z0-9_-]{1,32}$`），注入/超长/空白直接 null（零外呼）；
 * 3) 启用 + fetchImpl 成功原样返回 { channel, count }；非 2xx / 异常 / 超时 / 脏数据 → null（吞错）；
 * 4) 面板 index.html / SettingsPanel.js 挂 #set-online-presence + #set-online-presence-result，结果行只有 textContent；
 * 5) zh/en 双表有新的两键（settings_online_presence_btn / settings_online_presence_fmt）。
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OnlineServices } from '../src/online/OnlineServices.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';

const ROOT = process.cwd();
const PANEL = readFileSync(join(ROOT, 'src/ui/SettingsPanel.js'), 'utf8');
const INDEX = readFileSync(join(ROOT, 'index.html'), 'utf8');

describe('fetchPresenceCount 未启用 → null', () => {
  it('enabled=false 时 fetchImpl 零调用', async () => {
    const fetchImpl = vi.fn();
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: false, fetchImpl });
    expect(await o.fetchPresenceCount()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fetchPresenceCount channel 白名单（与服务端同源）', () => {
  it('注入 / 超长 / 空格 / 空串 / 非字符串 → null 且零外呼', async () => {
    const bads = ['bad channel!', 'x'.repeat(33), '', 'world/../x', '中文', null, 42];
    const fetchImpl = vi.fn();
    for (const bad of bads) {
      const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
      expect(await o.fetchPresenceCount(bad), String(bad)).toBeNull();
      expect(fetchImpl, String(bad)).not.toHaveBeenCalled();
    }
  });

  it('显式传 undefined 等同默认 world 频道（默认参数别名，不是白名单旁路）', async () => {
    const payload = { channel: 'world', count: 7 };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.fetchPresenceCount(undefined)).toEqual({ channel: 'world', count: 7 });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:1/api/presence/world/count');
  });
});

describe('fetchPresenceCount 启用路径', () => {
  it('200 → 原样返回 { channel, count }', async () => {
    const payload = { channel: 'world', count: 3 };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.fetchPresenceCount()).toEqual({ channel: 'world', count: 3 });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:1/api/presence/world/count');
  });

  it('负数 / 非数字 count → null（脏数据不当合法值回）', async () => {
    for (const count of [-1, 'x', null]) {
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ channel: 'world', count }) });
      const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
      expect(await o.fetchPresenceCount(), String(count)).toBeNull();
    }
  });

  it('count 小数 → floor 取整', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ channel: 'world', count: 3.7 }) });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect((await o.fetchPresenceCount()).count).toBe(3);
  });

  it('非 2xx → null 且 200 之外不解析 json', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, json: vi.fn(() => { throw new Error('nope'); }) });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.fetchPresenceCount()).toBeNull();
  });

  it('fetch 抛错 → 吞错回 null，不向上抛', async () => {
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    await expect(o.fetchPresenceCount()).resolves.toBeNull();
  });
});

describe('面板接线存在（源码结构断言）', () => {
  it('index.html 里有 set-online-presence / set-online-presence-result，挂 data-i18n', () => {
    expect(INDEX).toContain('id="set-online-presence"');
    expect(INDEX).toContain('id="set-online-presence-result"');
    expect(INDEX).toContain('data-i18n="settings_online_presence_btn"');
  });
  it('SettingsPanel 里有监听器，调 fetchPresenceCount，写 textContent 结果', () => {
    expect(PANEL).toContain("getElementById('set-online-presence')");
    expect(PANEL).toContain('onlineServices.fetchPresenceCount()');
    expect(PANEL).toContain("t('settings_online_presence_fmt'");
    expect(PANEL).toContain("t('settings_online_lb_unavailable'");
    expect(PANEL).not.toContain("presence-result').innerHTML");
  });
});

describe('zh/en 双表键齐全', () => {
  const keys = ['settings_online_presence_btn', 'settings_online_presence_fmt'];
  it('zh', () => { const set = new Set(ZH_KEYS); for (const k of keys) expect(set).toContain(k); });
  it('en', () => { const set = new Set(EN_KEYS); for (const k of keys) expect(set).toContain(k); });
});
