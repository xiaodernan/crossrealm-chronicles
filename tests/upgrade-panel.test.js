/**
 * 升级面板门禁 —— 钉 `ui/UpgradePanel.js` 的 `upgrade(stat)`。
 *
 * 只钉**升级那一步的逻辑**（渲染部分 DOM 太重、且是表现层）：构造期所有 `getElementById` 返回
 * null（可选链把监听都跳过），`refresh` 用桩替换，聚焦 upgrade 的成败两路。
 *
 * 关键不变量（"推送只有一处"，W-D2 那族：别手抄第二份 chore）：
 * - **成功**：`stats.levelUp(stat)` 真 → 回满 hp/stamina、给技能点、升级音、toast、refresh；
 *   但**不自己再调 `applyToCombat` / `syncMana`** —— 升级后的推送只有 `PlayerStats.levelUp`
 *   内部那一处；这里再抄一遍，少抄一句的症状是"蓝条没跟着变"。
 * - **失败**：`levelUp` 假 → 只弹"魂不够"，hp/stamina 不动、不给点、不刷新。
 *
 * 两枚变异探针走真代码路径（grep 确认落盘、预言命中、原字节还原）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { t } from '../src/engine/i18n.js';
import { UpgradePanel } from '../src/ui/UpgradePanel.js';

let realDoc, game, panel;

beforeEach(() => {
  realDoc = globalThis.document;
  globalThis.document = { getElementById: vi.fn(() => null) }; // 构造期监听全跳过
  game = {
    stats: { levelUp: vi.fn(() => true), maxHp: 100, maxStamina: 50 },
    player: { combat: { hp: 10, stamina: 5, applyToCombat: vi.fn(), syncMana: vi.fn() } },
    weaponSkills: { addPoint: vi.fn() },
    audio: { levelUp: vi.fn() },
    dialog: { toast: vi.fn() },
    overlayStack: { close: vi.fn() },
  };
  panel = new UpgradePanel(game);
  panel.refresh = vi.fn(); // 跳过渲染
});

afterEach(() => { globalThis.document = realDoc; });

describe('UpgradePanel.upgrade 成功路径', () => {
  it('回满 hp/stamina、给技能点、升级音、toast、refresh', () => {
    panel.upgrade('hp');
    expect(game.player.combat.hp).toBe(100);        // = maxHp
    expect(game.player.combat.stamina).toBe(50);    // = maxStamina
    expect(game.weaponSkills.addPoint).toHaveBeenCalledWith(1);
    expect(game.audio.levelUp).toHaveBeenCalled();
    expect(game.dialog.toast).toHaveBeenCalledWith(t('upgrade_success', { stat: 'hp' }));
    expect(panel.refresh).toHaveBeenCalled();
  });

  it('不自己再调 applyToCombat / syncMana（推送只有 levelUp 那一处）', () => {
    panel.upgrade('hp');
    expect(game.player.combat.applyToCombat).not.toHaveBeenCalled();
    expect(game.player.combat.syncMana).not.toHaveBeenCalled();
  });

  it('weaponSkills 不在也不抛（可选链）', () => {
    delete game.weaponSkills;
    expect(() => panel.upgrade('hp')).not.toThrow();
  });
});

describe('UpgradePanel.upgrade 失败路径', () => {
  it('levelUp 假 → 只弹"魂不够"，hp/stamina 不动、不给点、不刷新', () => {
    game.stats.levelUp.mockReturnValue(false);
    panel.upgrade('hp');
    expect(game.dialog.toast).toHaveBeenCalledWith(t('upgrade_not_enough_souls'));
    expect(game.player.combat.hp).toBe(10);       // 未改
    expect(game.player.combat.stamina).toBe(5);
    expect(game.weaponSkills.addPoint).not.toHaveBeenCalled();
    expect(panel.refresh).not.toHaveBeenCalled();
  });
});
