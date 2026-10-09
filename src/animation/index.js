/**
 * 动画系统统一导出（W-C6）。
 *
 * 导出结构：
 * - AnimationMixer: 底层混合器（三层：clip -> action -> mixer）
 * - AnimationLibrary: 动画库（clip + 配置的唯一真源）
 * - AnimationController: 实体级控制器（状态机 + 过渡 + 事件）
 * - AnimationClipLoader: 片段加载器（glTF/JSON/KFB）
 * - ANIM_ACTIONS: 预设动作名常量
 * - 预设动作配置
 * - 工厂函数
 */

export { AnimationMixer } from './AnimationMixer.js';
export { AnimationLibrary, PLAYER_ANIM_PRESETS, ENEMY_ANIM_PRESETS, BOSS_ANIM_PRESETS } from './AnimationLibrary.js';
export { AnimationController, createStateMachine, DEFAULT_PLAYER_STATE_MAP, DEFAULT_ENEMY_STATE_MAP, DEFAULT_BOSS_STATE_MAP } from './AnimationController.js';
export { AnimationClipLoader, ANIM_ACTIONS, ANIM_ACTION_LABELS } from './AnimationClipLoader.js';
export { AnimationEntityAdapter, createEntityAdapter } from './AnimationEntityAdapter.js';