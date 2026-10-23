// 门禁：切片17 —— content/hotkeys.js 的 activeHotkeyTable 冗余 getter 收口。
//
// 改前复核（切片14 曾因"像漏接线"而暂缓，本切片查清它不是漏接线）：
//   - 模块级镜像 ACTIVE_HOTKEYS 的真读路是 hotkeyCodeFor（:129 直接读它），HUD/交互条/教程
//     的提示文案走这条路（Game.js:670 注释点明"问的是模块级生效表"）。
//   - 整表读的是 game.hotkeyTable（SettingsPanel.js:431），与镜像同一次 setHotkeyTable 写入
//     （Game.js:661/671 同一个对象），两者一致。
//   所以 activeHotkeyTable（只回整表）没有真消费者 —— 是冗余 getter，不是"谁该读它却没接"。
//   收口：删掉它；镜像仍由 hotkeyCodeFor 提供读路，整表由 game.hotkeyTable 提供。
import { describe, it, expect } from 'vitest';
import * as hotkeys from '../src/content/hotkeys.js';

describe('切片17：hotkeys 冗余 getter activeHotkeyTable 收口', () => {
  it('activeHotkeyTable 不再导出（整表读 game.hotkeyTable，单键读 hotkeyCodeFor）', () => {
    expect(hotkeys.activeHotkeyTable).toBeUndefined();
  });

  it('镜像的真读路 hotkeyCodeFor 仍在且生效（写 setHotkeyTable → 读 hotkeyCodeFor）', () => {
    hotkeys.setHotkeyTable([{ action: 'zzz-slice17', code: 'KeyZ' }]);
    expect(hotkeys.hotkeyCodeFor('zzz-slice17')).toBe('KeyZ');
    hotkeys.setHotkeyTable(hotkeys.UI_HOTKEYS); // 还原，避免污染同文件后续用例
  });
});
