/**
 * 玩家专用动画适配器（W-C6 余项：玩家接入适配器系统）。
 *
 * 玩家已有完整动画系统（THREE.AnimationMixer + GLB clip + SkeletonMotion 骨骼片段），
 * 此适配器把现有系统包装成与 AnimationEntityAdapter 兼容的接口，
 * 使玩家能统一纳入 Game._attachEnemyAnimAdapters 等管理流程。
 *
 * 关键差异：
 * - 敌人用 AnimationController + AnimationLibrary + 程序化片段
 * - 玩家用 THREE.AnimationMixer + GLB clip + SkeletonMotion 骨骼片段
 * - 两套系统的“动作名 → Action”映射各自维护，适配器只提供统一的 update/sync 接口
 */

import { PLAYER_VISUAL_ROOT_NAME } from '../CharacterModel.js';

/** 视觉层根节点名 —— 与敌人适配器的 ANIM_ROOT_NAME 保持一致（'__anim'）。 */
const ANIM_ROOT_NAME = '__anim';

/** 确保两边的视觉层根节点名一致（测试里有断言）。 */
console.assert(PLAYER_VISUAL_ROOT_NAME === ANIM_ROOT_NAME, '玩家与敌人视觉层根节点名必须一致');

export class PlayerAnimationAdapter {
  /**
   * @param {CharacterModel} characterModel - 已完成 load() 的玩家模型实例
   */
  constructor(characterModel) {
    this.model = characterModel;
    this.entityRoot = characterModel.group;              // 实体根（group）
    this.animRoot = characterModel.modelRoot;            // 视觉层根节点（__anim）
  }

  /** 注册状态：玩家已有完整动画系统，此处仅做兼容性占位。 */
  registerStates() {
    // 玩家的状态在 catalog/skeletal 中管理，无需额外注册
  }

  /** 注册程序化片段：玩家已在 load() 里通过 SkeletonMotion 注册完成。 */
  registerProceduralClips() {
    // 已在 load() 里通过 registerSkeletonClips 完成
  }

  /** combatState → 动作名（与 STATE_TO_ACTION 语义对齐）。 */
  _resolveAction(combatState) {
    const map = {
      idle: 'idle',
      walk: 'walk',
      run: 'run',
      locomotion: 'walk',
      combo1: 'attack1',
      combo2: 'attack2',
      combo3: 'attack3',
      heavy: 'heavy',
      dodge: 'dodge',
      hit: 'hit',
      block: 'block',
      parry: 'parry',
      riposte: 'parry',
      skill: 'skill',
      stagger: 'hit',
      dead: 'death',
    };
    return map[combatState ?? 'idle'] ?? 'idle';
  }

  /** 从玩家实体同步动作状态到 mixer。 */
  syncFromEntity() {
    const cm = this.model;
    if (!cm || !cm.mixer) return;

    // 移动档（idle / walk / run）的"愿望 → 真的在播"由 CharacterModel 自己收口：
    // 它是 mix 器的**所有者**（`load()` 里建的 mixer，`actions` / `currentAction` /
    // `actionLock` 三本账都在它那儿），愿望字段（`moving` / `sprinting`）也跟它同在一家。
    // 这里只走**公开接口**，不碰它的内部字段。
    //
    // 改前这一段是**空转**的：它把 `combatState` 映射成动作名（'walk' / 'idle' …），
    // 再拿那个名字去问 `cm.actions[...]` —— 可 `actions` 的键是 **clip 名**
    // （'Walk' / 'Idle' / '__sk:heavy'），不是语义名 ⇒ 那个判断**永远为假**，
    // 于是它写出去的 `cm._pendingAction` 从来没被写出去过，也从来没有人读过。
    // （命名空间错配这一族正是 B113 那条："招式表里写着的东西全仓没有一行读它"。）
    cm.playLocomotion?.();
  }

  /** 每帧推进。 */
  update(dt) {
    // mixer 推进**不在这里**（B135）：mixer 是 CharacterModel 建的，推进它的是它自己
    // （`CharacterModel.update(dt)`）。改前有一阵子推进被挪到了这里，于是
    // "只调 `cm.update(dt)`"那条出货路径（`src/player/WeaponGrip.js` 头注与四道门禁
    // 都按它写）不再推帧 ⇒ 骨头不动 ⇒ 行程读数塌掉（13 例红）。
    //
    // 敌方那边（`animation/AnimationEntityAdapter.js`）确实是适配器推进 mixer ——
    // 但那是因为敌方的 mixer 归 `AnimationController` 所有，而 `AnimationController`
    // 不是实体本身。玩家这一侧不一样：模型与 mixer 同属 CharacterModel。
    this.syncFromEntity();
  }

  /** 验证视觉层结构：根下必须有 __anim 组，子节点在组里。 */
  validateStructure() {
    const root = this.model.group;
    const anim = root.children.find((o) => o.name === '__anim');
    if (!anim) {
      console.warn('[PlayerAnimationAdapter] 视觉层根节点 __anim 缺失');
    }
  }

  dispose() {
    this.model = null;
  }
}