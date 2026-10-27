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

    const combatState = cm.combatState;
    const sprinting = cm.sprinting;

    // locomotion + sprinting → run 状态
    const _controllerState = (combatState === 'locomotion' && sprinting) ? 'run' : combatState;
    const _action = this._resolveAction(combatState);

    // 同步 mixer 状态：如果当前动作与目标不符，尝试切换
    // 实际播放逻辑委托给 CharacterModel 的专用方法（playComboAttack / playHit / playDodge 等）
    // 这里只做状态标记，具体播放由 CharacterModel 的专用方法处理
    if (cm.currentAction) {
      const currentActionName = cm.currentAction.getClip?.()?.name;
      const targetAction = this._resolveAction(combatState);
      if (currentActionName !== targetAction && cm.actions[targetAction]) {
        // 状态不匹配且目标动作存在，标记需要切换（实际切换由 CharacterModel 的专用方法触发）
        cm._pendingAction = targetAction;
      }
    }
  }

  /** 每帧推进。 */
  update(dt) {
    // 推进 mixer（W-C6 玩家接入适配器：统一由适配器驱动 mixer）
    const cm = this.model;
    if (cm && cm.mixer) {
      cm.mixer.update(dt);
    }
    // 同步状态
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