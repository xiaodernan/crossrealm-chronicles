import { describe, it, expect } from 'vitest';
import { SaveValidator, CURRENT_VERSION } from '../src/game/SaveValidator.js';
import v6 from '../tests/save_v6_fixture.json';
import v17 from '../tests/save_v17_fixture.json';
import v16 from '../tests/save_v16_fixture.json';
import v13 from '../tests/save_v13_fixture.json';
import v12 from '../tests/save_v12_fixture.json';
import v11 from '../tests/save_v11_fixture.json';
import v10 from '../tests/save_v10_fixture.json';
import v9 from '../tests/save_v9_fixture.json';
import v8 from '../tests/save_v8_fixture.json';
import v7 from '../tests/save_v7_fixture.json';
import v5 from '../tests/save_v5_fixture.json';
import { migrate } from '../src/game/SaveMigrations.js';

describe('SaveValidator v17', () => {
  it('接受仓库内的 v17 fixture', () => {
    expect(SaveValidator.validate(v17)).toEqual([]);
  });

  it('拒绝错误版本', () => {
    const bad = structuredClone(v17);
    bad.version = 4;
    expect(SaveValidator.validate(bad)).toContain(`version 必须为 ${CURRENT_VERSION}`);
  });

  it('拒绝缺失 player 字段', () => {
    const bad = structuredClone(v17);
    delete bad.player.hp;
    expect(SaveValidator.validate(bad).length).toBeGreaterThan(0);
  });

  it('要求镜头轨道角入档（v5 新增）', () => {
    const bad = structuredClone(v17);
    delete bad.player.yaw;
    expect(SaveValidator.validate(bad)).toContain('player.yaw 必须是有限数');
  });

  it('要求 spells/settings 为必填（v5 收紧）', () => {
    const bad = structuredClone(v17);
    delete bad.settings;
    delete bad.spells;
    const issues = SaveValidator.validate(bad);
    expect(issues).toContain('spells.mana 必须是有限数');
    expect(issues).toContain('缺少 settings 对象');
  });

  it('拒绝仍带派生字段 skillsUnlocked 的档（说明未走迁移）', () => {
    const bad = structuredClone(v17);
    bad.quests.stats.skillsUnlocked = 3;
    expect(SaveValidator.validate(bad)).toContain('quests.stats.skillsUnlocked 已在 v5 移除（派生值）');
  });

  it('要求 stats.bag 是数组（v6 新增：背包入档，读档侧不许 ?? [] 兜底）', () => {
    const missing = structuredClone(v17);
    delete missing.stats.bag;
    expect(SaveValidator.validate(missing)).toContain('stats.bag 必须是数组');
    const wrong = structuredClone(v17);
    wrong.stats.bag = {};
    expect(SaveValidator.validate(wrong)).toContain('stats.bag 必须是数组');
  });

  it('v5 fixture 自己过不了校验，但走一次迁移就通过（迁移链是补 bag 的唯一一条路）', () => {
    expect(SaveValidator.validate(v5).length).toBeGreaterThan(0);
    const { data } = migrate(structuredClone(v5));
    expect(data.stats.bag).toEqual([]);
    expect(SaveValidator.validate(data)).toEqual([]);
  });

  it('v6 那一跳补的是**推得出来的**事实：歇过的营火就算见过（B66 的旧档兼容）', () => {
    const 旧档 = structuredClone(v6);
    旧档.campfireMemory = { restCount: { fantasy: 2, magic: 1 } };
    delete 旧档.restPointEnhancer;
    expect(SaveValidator.validate(旧档)).toContain('缺少 restPointEnhancer 对象');
    const { data, applied } = migrate(旧档);
    expect(applied).toContain(6);
    expect([...data.restPointEnhancer.discovered].sort()).toEqual(['fantasy', 'magic']);
    expect(SaveValidator.validate(data)).toEqual([]);
  });

  it('restPointEnhancer 的三种坏形状都要红（数组、类型、id）', () => {
    const 缺字段 = structuredClone(v17);
    delete 缺字段.restPointEnhancer.discovered;
    expect(SaveValidator.validate(缺字段)).toContain('restPointEnhancer.discovered 必须是数组');
    const 类型错 = structuredClone(v17);
    类型错.restPointEnhancer.discovered = 'fantasy';
    expect(SaveValidator.validate(类型错)).toContain('restPointEnhancer.discovered 必须是数组');
    const 混入对象 = structuredClone(v17);
    混入对象.restPointEnhancer.discovered = ['fantasy', { id: 'magic' }];
    expect(SaveValidator.validate(混入对象)).toContain('restPointEnhancer.discovered 里出现了非字符串的 id');
    // 控制组：这一族的三条判据不能是"什么都报"
    expect(SaveValidator.validate(structuredClone(v17))).toEqual([]);
  });

  it('抉择那一格（decisions）缺失 ⇒ 红（老档由迁移那一跳补上，不是"缺失就当默认值凑合读"）', () => {
    const 缺 = structuredClone(v17);
    delete 缺.quests.stats.decisions;
    expect(SaveValidator.validate(缺)).toContain('quests.stats 缺少: decisions');
  });

  it('旧版本 fixture 自己过不了当前校验 —— 它们必须先走迁移链（版本号不宽松）', () => {
    expect(SaveValidator.validate(v6)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    // v7 / v8 那两份现在都是历史件了（主线两次加长把它们落在了后面两跳的**前面**）
    expect(SaveValidator.validate(v7)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(SaveValidator.validate(v8)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(SaveValidator.validate(v9)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(SaveValidator.validate(v10)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(SaveValidator.validate(v11)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(SaveValidator.validate(v12)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(SaveValidator.validate(v13)).toContain(`version 必须为 ${CURRENT_VERSION}`);
    expect(SaveValidator.validate(v16)).toContain(`version 必须为 ${CURRENT_VERSION}`);
  });

  it('把数字型 kills 规范化为对象（旧 Godot 导出兼容）', () => {
    const legacy = structuredClone(v17);
    legacy.quests.stats.kills = 12;
    expect(SaveValidator.validate(legacy).length).toBeGreaterThan(0);
    SaveValidator.normalize(legacy);
    expect(SaveValidator.validate(legacy)).toEqual([]);
  });
});
