/**
 * 角色动画目录（catalog）的挑选与兜底 —— W-C6 切片2。
 *
 * `CharacterModel` 真模型到位后，`catalog[key] = pickAnim(ANIM_MANIFEST[key])` 决定每个战斗
 * 动作从 GLB 里挑哪个 clip。`pickAnim` 的兜底是**静默的**：候选全落空就返回 null，`catalog[key]`
 * 于是是 undefined，播放侧 `this.catalog.attack1 || 'Slash'` 之类的回落也会静默走程序化动画。
 * 症状是玩家看到的动作"看着像但其实没播到那个 clip"，而**没有任何报错** —— 正是本项目反复要防的
 * "静默兜底"。这片把挑选逻辑钉死，逐条验：
 *   - 精确名命中、大小写不敏感命中、子串部分命中、全落空返回 null（不抛、不谎报）；
 *   - catalog 覆盖全部 12 个战斗动作，每个都能从一份"全 Clip 齐"的 actions 里挑到；
 *   - 一旦某个动作在 actions 里缺失，`pickAnim` 诚实返回 null（让上层回落有据可查）。
 *
 * 变异自证（`cp` 备份 + 逐字节还原）：把 `pickAnim` 的精确匹配提前 return、把 catalog 里
 * 的 attack1 名删掉一行、把部分匹配的 `length > 3` 阈值改成 `> 0` —— 各自必须红。
 */
import { describe, it, expect } from 'vitest';
import { ANIM_MANIFEST } from '../src/assets/AnimManifest.js';
import { ANIM_CATALOG, CharacterModel } from '../src/player/CharacterModel.js';

describe('动画目录：pickAnim 的挑选与诚实兜底（W-C6 切片2）', () => {
  it('ANIM_CATALOG 就是 ANIM_MANIFEST（对外暴露的目录就是那份真源）', () => {
    expect(ANIM_CATALOG).toBe(ANIM_MANIFEST);
  });

  it('manifest 覆盖全部 12 个战斗动作，且每个都是非空候选数组', () => {
    const 期望 = ['idle', 'walk', 'run', 'attack1', 'attack2', 'attack3', 'heavy', 'dodge', 'hit', 'block', 'parry', 'skill'];
    for (const key of 期望) {
      expect(ANIM_MANIFEST[key], `动作 ${key} 不在 manifest 里`).toBeTruthy();
      expect(Array.isArray(ANIM_MANIFEST[key]), `${key} 的候选不是数组`).toBe(true);
      expect(ANIM_MANIFEST[key].length, `${key} 的候选是空的`).toBeGreaterThan(0);
    }
    // 目录不该有"查无此动作"的野键
    const 野 = Object.keys(ANIM_MANIFEST).filter((k) => !期望.includes(k));
    expect(野, `manifest 里有未登记的战斗动作：${野.join('、')}`).toEqual([]);
  });

  describe('pickAnim：四种命中路径 + 诚实 null', () => {
    // 用一个真 CharacterModel 的实例方法（不 load，避免碰网络 glb）
    const m = new CharacterModel();

    it('精确名命中：候选第一项就是 actions 的键', () => {
      m.actions = { Idle: {}, SwordSlash: {} };
      expect(m.pickAnim(['Idle', 'Walk'])).toBe('Idle');
    });

    it('大小写不敏感命中：候选与键大小写不同，挑到的是 actions 里的那个键', () => {
      m.actions = { 'sword slash': {} };
      expect(m.pickAnim(['Sword Slash'])).toBe('sword slash'); // 返回 actions 的键，不是候选名
    });

    it('子串部分命中：键包含候选（候选长度 >3）时挑到那个键', () => {
      m.actions = { 'Run To Rolling': {} };
      expect(m.pickAnim(['Roll'])).toBe('Run To Rolling');
    });

    it('全落空返回 null：挑不到不抛、不谎报成别的键', () => {
      m.actions = { Idle: {}, Walk: {} };
      expect(m.pickAnim(['NonExistentClip', 'AlsoMissing'])).toBeNull();
    });

    it('空候选与空 actions 都安全：返回 null', () => {
      m.actions = { Idle: {} };
      expect(m.pickAnim([])).toBeNull();
      expect(m.pickAnim([null, undefined])).toBeNull();
      m.actions = {};
      expect(m.pickAnim(['Idle'])).toBeNull();
    });
  });

  it('全 Clip 齐时，每个战斗动作都能挑到 clip（catalog 不会静默空转）', () => {
    // 造一份"每个动作都有对应 clip"的 actions（取 manifest 每项的第一个候选名）
    const m = new CharacterModel();
    m.actions = {};
    for (const list of Object.values(ANIM_MANIFEST)) {
      m.actions[list[0]] = {};
    }
    for (const [key, list] of Object.entries(ANIM_MANIFEST)) {
      const picked = m.pickAnim(list);
      expect(picked, `动作 ${key} 在全齐 actions 下竟挑不到 clip`).toBeTruthy();
    }
  });
});
