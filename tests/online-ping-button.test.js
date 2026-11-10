/**
 * W-X10：设置页「在线服务连通性自检」—— ping /api/version 测试
 *
 * 三件事必须钉住：
 * 1) OnlineServices.ping 默认关闭（不启用时返回 null，fetchImpl 甚至根本不被调用到）；
 * 2) 启用 + fetchImpl 成功时返回 JSON；非 2xx / 异常 / AbortSignal 超时 → swallows 为 null；
 * 3) 设置面板 index.html / SettingsPanel.js 确实挂了 #set-online-ping 与 #set-online-ping-result；
 *    zh/en 双表三键齐全——缺键就是显示 "[MISSING:]"。
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

describe('ping 不启用 → null', () => {
  it('enabled=false 时 fetchImpl 零调用', async () => {
    const fetchImpl = vi.fn();
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: false, fetchImpl });
    expect(await o.ping()).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('ping 启用路径', () => {
  it('200 返回 JSON', async () => {
    const payload = { service: 'game-service', javaVersion: '25.0.1', version: '0.1.0', note: 'central' };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.ping()).toEqual(payload);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:1/api/version');
  });

  it('非 2xx → null', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.ping()).toBeNull();
  });

  it('fetch 抛错 → swallows → null', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: true, fetchImpl });
    expect(await o.ping()).toBeNull();
  });
});

describe('面板接线存在（源码结构断言）', () => {
  it('index.html 里有 set-online-ping 与 set-online-ping-result', () => {
    expect(INDEX).toContain('id="set-online-ping"');
    expect(INDEX).toContain('id="set-online-ping-result"');
    expect(INDEX).toContain('data-i18n="settings_online_ping"');
  });
  it('SettingsPanel 里有对应的监听器、调用 ping、写 i18n 结果', () => {
    expect(PANEL).toContain("getElementById('set-online-ping')");
    expect(PANEL).toContain('onlineServices.ping()');
    expect(PANEL).toContain("t('settings_online_ping_ok'");
    expect(PANEL).toContain("t('settings_online_ping_fail'");
  });
});

describe('zh/en 双表三键', () => {
  const keys = ['settings_online_ping', 'settings_online_ping_ok', 'settings_online_ping_fail'];
  it('zh', () => { const set = new Set(ZH_KEYS); for (const k of keys) expect(set).toContain(k); });
  it('en', () => { const set = new Set(EN_KEYS); for (const k of keys) expect(set).toContain(k); });
});
