/**
 * 键/鼠/柄显示名门禁 —— 钉 `ui/keyLabels.js`（W-A7：显示名的唯一真源）。
 *
 * 这份映射被 HUD / 说明书 / 提示条 / 设置面板共用（refs 多），但它的**函数本身
 * 从没被直接断言**（keyText/keyHint 有 i18n 用例，keyLabel/padSourceLabel 没有）。
 * 几条"写错不抛、只静默显示成空白或错字"的不变量：
 * - 已知键码走 i18n 文案键（表里存的是"这句话住哪一格"，不是那句话本身）；
 * - `KeyW`/`Digit5` 提取出 `W`/`5`；**未列到的键码原样显示**（原样仍可读，空白不可读）；
 * - 鼠标/手柄同理：已知走文案键、未知原样；
 * - 摇杆方向四向箭头、未知回落 `?`；
 * - `padSourceLabel`：button→按钮名、stick→摇杆方向、**认不出的形状返回 null**
 *   （"说不出口的格子不许编一个名字"）。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect } from 'vitest';
import { t } from '../src/engine/i18n.js';
import {
  KEY_LABELS, MOUSE_LABELS, PAD_BUTTON_LABELS,
  keyLabel, mouseLabel, padButtonLabel, padStickLabel, padSourceLabel,
} from '../src/ui/keyLabels.js';

describe('keyLabel 键码 → 显示名', () => {
  it('已知键码走 i18n 文案键', () => {
    expect(keyLabel('Escape')).toBe(t(KEY_LABELS.Escape));
    expect(keyLabel('Space')).toBe(t(KEY_LABELS.Space));
    expect(keyLabel('ArrowUp')).toBe(t(KEY_LABELS.ArrowUp));
  });

  it('Key/Digit 前缀提取字母 / 数字', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('KeyA')).toBe('A');
    expect(keyLabel('Digit5')).toBe('5');
    expect(keyLabel('Digit0')).toBe('0');
  });

  it('未列到的键码原样显示（不是空白）', () => {
    expect(keyLabel('Numpad5')).toBe('Numpad5');
    expect(keyLabel('F13')).toBe('F13');
  });
});

describe('mouseLabel 鼠标出口', () => {
  it('已知走文案键、未知原样', () => {
    expect(mouseLabel('left')).toBe(t(MOUSE_LABELS.left));
    expect(mouseLabel('right')).toBe(t(MOUSE_LABELS.right));
    expect(mouseLabel('middle')).toBe('middle');
  });
});

describe('padButtonLabel 手柄按钮', () => {
  it('已知走文案键、未知原样', () => {
    expect(padButtonLabel('a')).toBe(t(PAD_BUTTON_LABELS.a));
    expect(padButtonLabel('dpadUp')).toBe(t(PAD_BUTTON_LABELS.dpadUp));
    expect(padButtonLabel('unknownBtn')).toBe('unknownBtn');
  });
});

describe('padStickLabel 摇杆方向', () => {
  it('四向箭头 + 未知回落 ?', () => {
    expect(padStickLabel('up')).toBe(t('pad_stick_label', { arrow: '↑' }));
    expect(padStickLabel('down')).toBe(t('pad_stick_label', { arrow: '↓' }));
    expect(padStickLabel('left')).toBe(t('pad_stick_label', { arrow: '←' }));
    expect(padStickLabel('right')).toBe(t('pad_stick_label', { arrow: '→' }));
    expect(padStickLabel('nope')).toBe(t('pad_stick_label', { arrow: '?' }));
  });
});

describe('padSourceLabel 物理来源', () => {
  it('null / undefined → null', () => {
    expect(padSourceLabel(null)).toBeNull();
    expect(padSourceLabel(undefined)).toBeNull();
  });

  it('button → padButtonLabel(name)', () => {
    expect(padSourceLabel({ kind: 'button', name: 'a' })).toBe(padButtonLabel('a'));
  });

  it('stick → padStickLabel(dir)', () => {
    expect(padSourceLabel({ kind: 'stick', dir: 'up' })).toBe(padStickLabel('up'));
  });

  it('认不出的形状 → null（不许编一个名字）', () => {
    expect(padSourceLabel({ kind: 'weird' })).toBeNull();
  });
});
