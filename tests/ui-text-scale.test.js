/**
 * 界面文字档（W-D6 切片69）回归门禁。
 *
 * 起因：重建 `src/engine/uiTextScale.js` 时把 `uiTextScaleOptions` 导出成
 * `{ value, label }` 对象**数组**，而 `SettingsPanel` 按 `uiTextScaleOptions()`
 * 函数调用 ⇒ 真实启动页 `new Game()` 当场 TypeError（"uiTextScaleOptions is not
 * a function or its return value is not iterable"），玩家看到的是开机报错。
 * 单测全绿是因为假 DOM 里没有 `set-ui-text`，面板构造期那一格分支根本没跑。
 *
 * 本文件钉两件事：
 *   ① 导出形制：`uiTextScaleOptions` 必须是函数，调用返回档位 id 名册；
 *   ② 面板接线：假 DOM 里真有 `set-ui-text` 时，构造面板能把选项从名册现推出来，
 *      change 事件写设置 + 落地（与 color-vision ⑥ 同一口径）。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { SettingsManager } from '../src/core/SettingsManager.js';
import {
  DEFAULT_UI_TEXT_SCALE,
  UI_TEXT_SCALE_IDS,
  uiTextScaleOptions,
  normalizeUiTextScale,
} from '../src/engine/uiTextScale.js';
import { t } from '../src/engine/i18n.js';

const ORIGINAL_DOC = globalThis.document;
afterEach(() => {
  globalThis.document = ORIGINAL_DOC;
});

describe('界面文字档：名册与脏值回落', () => {
  it('三档名册 small / medium / large，出厂 medium', () => {
    expect([...UI_TEXT_SCALE_IDS]).toEqual(['small', 'medium', 'large']);
    expect(DEFAULT_UI_TEXT_SCALE).toBe('medium');
  });

  it('脏值回落 medium，不抛', () => {
    expect(normalizeUiTextScale('huge')).toBe('medium');
    expect(normalizeUiTextScale('')).toBe('medium');
    expect(normalizeUiTextScale(null)).toBe('medium');
    expect(normalizeUiTextScale('large')).toBe('large');
  });
});

describe('界面文字档：uiTextScaleOptions 是函数（面板 call-site 契约）', () => {
  it('是函数，调用返回档位 id 名册（不是对象数组）', () => {
    expect(typeof uiTextScaleOptions).toBe('function');
    const ids = uiTextScaleOptions();
    expect([...ids]).toEqual([...UI_TEXT_SCALE_IDS]);
    // 与 color-vision 面板现推同一口径：元素必须是字符串 id，不是 { value, label } 对象
    for (const id of ids) {
      expect(typeof id).toBe('string');
    }
  });
});

describe('界面文字档：面板接线（假 DOM + 真构造）', () => {
  it('set-ui-text 分支：选项从名册现推，change 写设置并落地', () => {
    const opts = [];
    const sel = {
      value: 'medium',
      listeners: {},
      appendChild: (o) => opts.push(o),
      addEventListener: (type, fn) => { (sel.listeners[type] ??= []).push(fn); },
      dispatchEvent: (e) => {
        sel.listeners[e.type]?.forEach((fn) => fn({ target: sel }));
        return true;
      },
    };
    globalThis.document = {
      getElementById: (id) => (id === 'set-ui-text' ? sel : null),
      createElement: () => ({}),
    };
    const settings = new SettingsManager();
    settings.data = { ...settings.data, uiTextScale: 'medium' };
    settings.save = () => {};
    const game = { settings };
    expect(() => new SettingsPanel(game)).not.toThrow();
    expect(opts.map((o) => o.value), '选项不是从名册现推的 —— 面板抄了第二份名单')
      .toEqual([...UI_TEXT_SCALE_IDS]);
    expect(opts.map((o) => o.textContent))
      .toEqual(UI_TEXT_SCALE_IDS.map((id) => t(`settings_ui_text_${id}`)));
    expect(sel.value, '面板没回显当前档').toBe('medium');
    sel.value = 'large';
    sel.dispatchEvent({ type: 'change' });
    expect(settings.get('uiTextScale'), 'change 没有写进设置').toBe('large');
  });
});
