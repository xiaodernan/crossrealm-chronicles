import * as THREE from 'three';

/**
 * 动画库 —— 动画片段与配置的唯一真源（W-C6 切片1）。
 *
 * 设计动机：
 * - 改前 clip 到处手写路径、到处 `THREE.AnimationClip`，同一动作在不同实体里
 *   帧范围、循环模式、优先级不一致。
 * - 现在所有 clip 与配置集中在此，**按模型类型分类**，每个动作只定义一次。
 *
 * 用法：
 *   const lib = new AnimationLibrary();
 *   await lib.load();
 *   const clip = lib.getClip('player_run');
 *   const cfg = lib.getConfig('player_run');
 */
export class AnimationLibrary {
  constructor() {
    this.clips = new Map();      // name -> THREE.AnimationClip
    this.configs = new Map();    // name -> AnimationConfig
    this._loaded = false;
  }

  /**
   * 注册一个动画配置。
   * @param {string} name - 动作名（唯一键，如 'player_run'）
   * @param {AnimationConfig} config
   */
  register(name, config) {
    if (this.configs.has(name)) {
      throw new Error(`AnimationLibrary: 动作 "${name}" 已注册`);
    }
    this.configs.set(name, Object.freeze({
      clipName: config.clipName ?? name,
      loop: config.loop ?? true,
      priority: config.priority ?? 0,
      fadeIn: config.fadeIn ?? 0.2,
      fadeOut: config.fadeOut ?? 0.2,
      layer: config.layer ?? 0,
      events: config.events ?? [],
      ...config,
    }));
  }

  /**
   * 批量注册（按模型类型批量）。
   */
  registerBatch(configs) {
    for (const [name, config] of Object.entries(configs)) {
      this.register(name, config);
    }
  }

  /**
   * 获取动作配置。
   */
  getConfig(name) {
    const cfg = this.configs.get(name);
    if (!cfg) throw new Error(`AnimationLibrary: 未知动作 "${name}"`);
    return cfg;
  }

  /**
   * 获取动画片段（从 THREE 加载或程序化生成）。
   * 实际 clip 由外部加载器提供，这里只做缓存与代理。
   */
  getClip(name) {
    return this.clips.get(name) ?? null;
  }

  /**
   * 设置动画片段（由加载器调用）。
   */
  setClip(name, clip) {
    if (!(clip instanceof THREE.AnimationClip)) {
      throw new Error(`AnimationLibrary: "${name}" 不是有效的 AnimationClip`);
    }
    this.clips.set(name, clip);
  }

  /**
   * 批量设置 clip（由加载器批量调用）。
   */
  setClips(clips) {
    for (const [name, clip] of Object.entries(clips)) {
      this.setClip(name, clip);
    }
  }

  /**
   * 获取所有已注册的动作名。
   */
  getActionNames() {
    return [...this.configs.keys()];
  }

  /**
   * 检查是否已注册。
   */
  has(name) {
    return this.configs.has(name);
  }

  /**
   * 预热：为常用动作预创建 AnimationAction（需配合 AnimationMixer 使用）。
   * 这里只做配置校验，实际 Action 创建在 mixer.play() 时。
   */
  validate() {
    for (const [name, cfg] of this.configs) {
      if (!this.clips.has(cfg.clipName)) {
        console.warn(`AnimationLibrary: 动作 "${name}" 引用的 clip "${cfg.clipName}" 尚未加载`);
      }
    }
  }
}

/**
 * @typedef {object} AnimationConfig
 * @property {string} [clipName] - 对应的 clip 名（默认同 name）
 * @property {boolean} [loop=true] - 是否循环
 * @property {number} [priority=0] - 优先级（高者打断低者）
 * @property {number} [fadeIn=0.2] - 淡入时长（秒）
 * @property {number} [fadeOut=0.2] - 淡出时长（秒）
 * @property {number} [layer=0] - 层级（分层动画）
 * @property {Array<{time: number, name: string, data?: any}>} [events] - 事件点
 */

/** 玩家基础动作预设（可被具体模型覆盖） */
export const PLAYER_ANIM_PRESETS = Object.freeze({
  idle: { clipName: 'idle', loop: true, priority: 0, fadeIn: 0.2, fadeOut: 0.2 },
  walk: { clipName: 'walk', loop: true, priority: 1, fadeIn: 0.15, fadeOut: 0.15 },
  run: { clipName: 'run', loop: true, priority: 2, fadeIn: 0.1, fadeOut: 0.1 },
  attack: { clipName: 'attack', loop: false, priority: 5, fadeIn: 0.05, fadeOut: 0.2 },
  dodge: { clipName: 'dodge', loop: false, priority: 6, fadeIn: 0.05, fadeOut: 0.15 },
  hit: { clipName: 'hit', loop: false, priority: 7, fadeIn: 0.02, fadeOut: 0.1 },
  death: { clipName: 'death', loop: false, priority: 10, fadeIn: 0.1, fadeOut: 0 },
});

/** 敌人通用动作预设 */
export const ENEMY_ANIM_PRESETS = Object.freeze({
  idle: { clipName: 'idle', loop: true, priority: 0, fadeIn: 0.2, fadeOut: 0.2 },
  walk: { clipName: 'walk', loop: true, priority: 1, fadeIn: 0.15, fadeOut: 0.15 },
  run: { clipName: 'run', loop: true, priority: 2, fadeIn: 0.1, fadeOut: 0.1 },
  attack: { clipName: 'attack', loop: false, priority: 5, fadeIn: 0.1, fadeOut: 0.2 },
  hit: { clipName: 'hit', loop: false, priority: 6, fadeIn: 0.05, fadeOut: 0.1 },
  death: { clipName: 'death', loop: false, priority: 10, fadeIn: 0.1, fadeOut: 0 },
});

/** Boss 专用动作预设 */
export const BOSS_ANIM_PRESETS = Object.freeze({
  idle: { clipName: 'idle', loop: true, priority: 0, fadeIn: 0.3, fadeOut: 0.3 },
  intro: { clipName: 'intro', loop: false, priority: 8, fadeIn: 0.5, fadeOut: 0.3 },
  phaseChange: { clipName: 'phase_change', loop: false, priority: 9, fadeIn: 0.3, fadeOut: 0.2 },
  attack1: { clipName: 'attack1', loop: false, priority: 6, fadeIn: 0.1, fadeOut: 0.3 },
  attack2: { clipName: 'attack2', loop: false, priority: 7, fadeIn: 0.1, fadeOut: 0.3 },
  special: { clipName: 'special', loop: false, priority: 9, fadeIn: 0.2, fadeOut: 0.4 },
  death: { clipName: 'death', loop: false, priority: 10, fadeIn: 0.5, fadeOut: 0 },
});