/**
 * 在线伙伴服务的设置页开关（W-X6）
 * —— 默认关闭的纪律在这里第一次有一格 "玩家可以在面板里翻开" 的入口，
 *    而它翻的不是"画面偏好"，而是一项授权：写 localStorage + 运行时单例。
 *
 * 三件事必须由测试钉住：
 * 1) `setEnabled` 真的翻了运行时单例（不重载就生效的前提）；
 * 2) 设置面板里那一格存在、且只有"两个键"的 i18n（settings_online / _toggle / _hint）——zh/en 双表都在；
 * 3) SettingsPanel 源码里确实读写了 localStorage crossrealm_online 与 onlineServices
 *    —— 删掉这段接线，开关就退化成一个查不到行为的装饰。
 *
 * 注意：本测试不启动 DOM、不断言真实网络；jsdom 行为由 settings-panel-boot 冒烟兜底。
 */
import { describe, expect, it } from 'vitest';
import { readSrc } from './helpers/srcText.js';
import { OnlineServices, onlineServices } from '../src/online/OnlineServices.js';
import { STRING_KEYS as ZH_KEYS } from '../src/content/strings.zh.js';
import { STRING_KEYS as EN_KEYS } from '../src/content/strings.en.js';

const PANEL = readSrc('src/ui/SettingsPanel.js');
const INDEX_HTML = readSrc('index.html');

describe('setEnabled 运行时翻转（不经 SettingsStore）', () => {
  it('默认关闭 ⇒ setEnabled(true) 后启用，再翻回关闭', async () => {
    const o = new OnlineServices({ baseUrl: 'http://localhost:1', enabled: false, fetchImpl: () => { throw new Error('不该发'); } });
    expect(o.enabled()).toBe(false);
    o.setEnabled(true);
    expect(o.enabled()).toBe(true);
    o.setEnabled(false);
    expect(o.enabled()).toBe(false);
  });

  it('单例在 ../online/OnlineServices.js 里导出（面板挂载的就是它）', () => {
    expect(onlineServices).toBeInstanceOf(OnlineServices);
    expect(typeof onlineServices.setEnabled).toBe('function');
  });
});

describe('面板接线存在（源码结构断言，删接线即红）', () => {
  it('index.html 里设置面板有 set-online 复选框，三键 i18n 都挂着', () => {
    expect(INDEX_HTML).toContain('id="set-online"');
    expect(INDEX_HTML).toContain('data-i18n="settings_online_toggle"');
    expect(INDEX_HTML).toContain('data-i18n="settings_online_hint"');
    expect(INDEX_HTML).toContain('settings_online');
  });

  it('SettingsPanel 读 resolveEnabled、写 localStorage crossrealm_online、翻 onlineServices', () => {
    expect(PANEL).toContain('set-online');
    expect(PANEL).toContain("localStorage.setItem('crossrealm_online'");
    expect(PANEL).toContain('onlineServices.setEnabled');
    expect(PANEL).toContain('OnlineServices.resolveEnabled()');
  });
});

describe('zh/en 双表三键齐全', () => {
  const keys = ['settings_online', 'settings_online_toggle', 'settings_online_hint'];
  it('zh 表', () => {
    const set = new Set(ZH_KEYS);
    for (const k of keys) expect(set).toContain(k);
  });
  it('en 表', () => {
    const set = new Set(EN_KEYS);
    for (const k of keys) expect(set).toContain(k);
  });
});
