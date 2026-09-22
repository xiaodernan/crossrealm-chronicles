import { describe, it, expect } from 'vitest';
import { SaveValidator, CURRENT_VERSION } from '../src/game/SaveValidator.js';
import v5 from '../tests/save_v5_fixture.json';

describe('SaveValidator v5', () => {
  it('接受仓库内的 v5 fixture', () => {
    expect(SaveValidator.validate(v5)).toEqual([]);
  });

  it('拒绝错误版本', () => {
    const bad = structuredClone(v5);
    bad.version = 4;
    expect(SaveValidator.validate(bad)).toContain(`version 必须为 ${CURRENT_VERSION}`);
  });

  it('拒绝缺失 player 字段', () => {
    const bad = structuredClone(v5);
    delete bad.player.hp;
    expect(SaveValidator.validate(bad).length).toBeGreaterThan(0);
  });

  it('要求镜头轨道角入档（v5 新增）', () => {
    const bad = structuredClone(v5);
    delete bad.player.yaw;
    expect(SaveValidator.validate(bad)).toContain('player.yaw 必须是有限数');
  });

  it('要求 spells/settings 为必填（v5 收紧）', () => {
    const bad = structuredClone(v5);
    delete bad.settings;
    delete bad.spells;
    const issues = SaveValidator.validate(bad);
    expect(issues).toContain('spells.mana 必须是有限数');
    expect(issues).toContain('缺少 settings 对象');
  });

  it('拒绝仍带派生字段 skillsUnlocked 的档（说明未走迁移）', () => {
    const bad = structuredClone(v5);
    bad.quests.stats.skillsUnlocked = 3;
    expect(SaveValidator.validate(bad)).toContain('quests.stats.skillsUnlocked 已在 v5 移除（派生值）');
  });

  it('把数字型 kills 规范化为对象（旧 Godot 导出兼容）', () => {
    const legacy = structuredClone(v5);
    legacy.quests.stats.kills = 12;
    expect(SaveValidator.validate(legacy).length).toBeGreaterThan(0);
    SaveValidator.normalize(legacy);
    expect(SaveValidator.validate(legacy)).toEqual([]);
  });
});
