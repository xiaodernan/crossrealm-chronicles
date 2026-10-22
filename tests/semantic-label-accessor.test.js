// 门禁：semanticColors 不得暴露"只回原始 i18n 键"的死导出。
//
// 改前普查：W-D2 切片16t 加过 `semanticLabelKey`（只回 `sem_label_*` 原始键），
// 但全仓没有任何消费者 —— 真正被用到的标签出口是 `semanticLabel`（它自己按语言把键
// 展开成显示名，见 gear.js / semantic-colors.test.js）。两个出口并存 = 一份"看起来有人用、
// 其实没人用"的假 API。这条门禁把"死键出口"这一格钉死：删了不许回潮。
import { describe, it, expect } from 'vitest';
import * as semanticColors from '../src/content/semanticColors.js';

describe('semanticColors 标签出口单一所有者', () => {
  it('semanticLabelKey（只回原始键的死导出）不存在', () => {
    expect(semanticColors.semanticLabelKey).toBeUndefined();
  });

  it('真正的标签出口 semanticLabel（按语言展开）仍在且可用', () => {
    expect(typeof semanticColors.semanticLabel).toBe('function');
    expect(semanticColors.semanticLabel('danger')).toBeTruthy();
  });
});
