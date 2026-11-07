/**
 * SettingsPanel 构造期冒烟（W-D6 切片70 尾巴①收口）。
 *
 * 起因：`uiTextScaleOptions` 导出形制错（对象数组当函数调用）⇒ `new Game()` 开机即
 * TypeError、玩家看到白屏报错，而全部单测绿——假 DOM 里 `getElementById('set-ui-text')`
 * 恒 null，面板构造期那一格分支在测试里从没跑过。这是一族问题：面板每个 `set-*`
 * 分支在测试环境里都是"查不到 ⇒ 静默跳过"，真浏览器里是"照着跑 ⇒ 炸"。
 *
 * 修法：一份**通用元素桩**（Proxy：已知形状给默认值，未知属性给 no-op 函数），
 * `getElementById` 对任何 id 都返回它——构造期的每一格分支都会真的执行，
 * 任何一格里的"调用不存在的函数 / 展开非可迭代值"都当场抛出来。
 * 这不是替代各分支的行为断言，而是"开机这一刻别炸"的最低门槛。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { SettingsPanel } from '../src/ui/SettingsPanel.js';
import { SettingsManager } from '../src/core/SettingsManager.js';

/** 通用元素：能写属性（min/max/step/value/checked/textContent…），未知方法一律 no-op */
function universalElement() {
  const target = {
    value: '1', checked: true, textContent: '', innerHTML: '',
    className: '', id: '', min: '0', max: '1', step: '0.1',
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    style: { setProperty: () => {} },
    dataset: {},
    children: [],
  };
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'symbol') return t[prop];
      if (prop in t) return t[prop];
      const fn = () => {};
      t[prop] = fn;
      return fn;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

const ORIGINAL_DOC = globalThis.document;
afterEach(() => {
  globalThis.document = ORIGINAL_DOC;
});

describe('SettingsPanel 构造期冒烟（boot 白屏回归门）', () => {
  it('getElementById 对任何 id 都返回通用桩 ⇒ 构造不抛，且真触达了多数分支', () => {
    const elements = new Map();
    globalThis.document = {
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, universalElement());
        return elements.get(id);
      },
      createElement: () => universalElement(),
      addEventListener: () => {},
      documentElement: { style: { setProperty: () => {} } },
      body: universalElement(),
    };
    const settings = new SettingsManager();
    settings.save = () => {};
    const game = { settings };
    expect(() => new SettingsPanel(game)).not.toThrow();
    // 分支覆盖度的下限：构造期至少要摸过 15 个不同的 id
    // —— 若未来构造被静默砍成一行 return this，这条当场红
    expect(elements.size).toBeGreaterThanOrEqual(15);
  });
});
