/**
 * 动画系统统一导出（W-C6）。
 *
 * 导出结构：
 * - AnimationMixer: 底层混合器（三层：clip -> action -> mixer）
 * - AnimationLibrary: 动画库（clip + 配置的唯一真源）
 * - AnimationController: 实体级控制器（状态机 + 过渡 + 事件）
 * - AnimationClipLoader: 片段加载器（glTF/JSON/KFB）
 * - ANIM_MOTION / MOTION_CHANNELS: 动作运动表（每个动作的循环/时长/关键帧只在这里声明一次）
 * - ANIM_ACTIONS: 预设动作名常量
 * - 工厂函数
 */

export { AnimationMixer } from './AnimationMixer.js';
export { AnimationLibrary, ANIM_MOTION, MOTION_CHANNELS } from './AnimationLibrary.js';
export { AnimationController } from './AnimationController.js';
export { AnimationClipLoader, ANIM_ACTIONS, ANIM_ACTION_LABELS } from './AnimationClipLoader.js';
export { AnimationEntityAdapter, createEntityAdapter, STATE_TO_ACTION, ANIM_ROOT_NAME, ensureAnimRoot } from './AnimationEntityAdapter.js';