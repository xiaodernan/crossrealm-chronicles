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

/**
 * 动作运动表（W-C6 切片5）—— 每个动作**只在这里**声明一次：循环与否、时长、以及三条通道的关键帧。
 *
 * 为什么由它替代早前的 `PLAYER_ANIM_PRESETS` / `ENEMY_ANIM_PRESETS` / `BOSS_ANIM_PRESETS`：
 * 那三张表全仓零读者（只在 `index.js` 里被再导出一次），而它们写的 `loop` / `fadeIn` 与适配器
 * 里那份 `ACTION_SPEC` 是**同一件事的两份陈述**（`idle.loop` 两边都真，但 `fadeIn` 一边 0.2 一边 0.1）。
 * 留着 = 下一处漂移等着发生；删掉、让运动表既给配置又给关键帧，才是"一个动作只定义一次"。
 *
 * 通道口径（三条，全是**视觉层自己的**属性，见 `AnimationEntityAdapter.js` 的所有权那一段）：
 * - `y`  → `.position[y]`，米。正 = 抬起来。
 * - `rx` → `.rotation[x]`，弧度。**负 = 前倾**（与 `CharacterModel.proc.pitch` 同号，两套手感不互斥）。
 * - `rz` → `.rotation[z]`，弧度。挥/侧身的滚转。
 * 关键帧写的是 `[时长分数, 值]` —— 分数制让"改时长"不会改动作形状（改 `duration` 一整条动作跟着缩放）。
 * 循环档的**首尾两帧必须同值**，否则每圈结尾有一下硬跳；一次性档由混音器 `clampWhenFinished` 停在末帧。
 */
export const ANIM_MOTION = Object.freeze({
  idle: {
    loop: true, duration: 2.0,
    y: [[0, 0], [0.5, 0.035], [1, 0]],
    rx: [[0, 0], [0.5, 0.02], [1, 0]],
  },
  walk: {
    loop: true, duration: 1.0,
    y: [[0, 0], [0.25, 0.07], [0.5, 0], [0.75, 0.07], [1, 0]],
    rz: [[0, 0], [0.25, 0.03], [0.75, -0.03], [1, 0]],
  },
  run: {
    loop: true, duration: 0.7,
    y: [[0, 0], [0.25, 0.11], [0.5, 0], [0.75, 0.11], [1, 0]],
    rx: [[0, -0.05], [0.5, -0.12], [1, -0.05]],
  },
  // 通用"起手/前摇"档：与 attack1 同形但更轻，`windup` 状态走它
  attack: {
    loop: false, duration: 0.5,
    y: [[0, 0], [0.35, -0.03], [1, 0]],
    rx: [[0, 0], [0.35, -0.30], [1, 0]],
  },
  attack1: {
    loop: false, duration: 0.5,
    y: [[0, 0], [0.35, -0.04], [1, 0]],
    rx: [[0, 0], [0.35, -0.34], [1, 0]],
    rz: [[0, 0], [0.35, 0.12], [1, 0]],
  },
  attack2: {
    loop: false, duration: 0.5,
    y: [[0, 0], [0.35, -0.04], [1, 0]],
    rx: [[0, 0], [0.35, -0.34], [1, 0]],
    rz: [[0, 0], [0.35, -0.12], [1, 0]],   // 与 attack1 反手：连段第三下之前先甩另一边
  },
  attack3: {
    loop: false, duration: 0.6,
    y: [[0, 0], [0.4, -0.06], [1, 0]],
    rx: [[0, 0], [0.4, -0.42], [1, 0]],
    rz: [[0, 0], [0.4, 0.16], [1, 0]],
  },
  heavy: {
    loop: false, duration: 0.7,
    y: [[0, 0], [0.2, 0.05], [0.55, -0.05], [1, 0]],
    rx: [[0, 0], [0.2, 0.06], [0.55, -0.5], [1, 0]],   // 先仰身举起来，再砸下去
  },
  dodge: {
    loop: false, duration: 0.5,
    y: [[0, 0], [0.35, 0.12], [1, 0]],
    rx: [[0, 0], [0.4, 0.2], [1, 0]],
    rz: [[0, 0], [0.35, 0.45], [1, 0]],
  },
  hit: {
    loop: false, duration: 0.4,
    y: [[0, 0], [0.25, -0.02], [1, 0]],
    rx: [[0, 0], [0.25, 0.3], [1, 0]],
    rz: [[0, 0], [0.25, 0.12], [1, 0]],
  },
  block: {
    loop: true, duration: 0.4,
    rx: [[0, -0.14], [0.5, -0.18], [1, -0.14]],   // 常驻的举盾前倾：首尾同值才不跳
    rz: [[0, -0.08], [0.5, -0.1], [1, -0.08]],
  },
  parry: {
    loop: false, duration: 0.5,
    rx: [[0, 0], [0.3, -0.2], [1, 0]],
    rz: [[0, 0], [0.3, 0.32], [1, 0]],
  },
  skill: {
    loop: false, duration: 0.8,
    y: [[0, 0], [0.45, -0.05], [1, 0]],
    rx: [[0, 0], [0.45, -0.18], [1, 0]],
  },
  death: {
    loop: false, duration: 1.0,
    y: [[0, 0], [0.35, 0.05], [1, -0.1]],
    rx: [[0, 0], [0.35, -0.45], [1, -1.1]],   // 末帧不倒下去就白死一次：`clampWhenFinished` 停在 −1.1
    rz: [[0, 0], [1, 0.3]],
  },
});

/** 运动表里的通道名 → 片段轨道的绑定路径（只有这三条，且都是视觉层自己的属性）。 */
export const MOTION_CHANNELS = Object.freeze({
  y: '.position[y]',
  rx: '.rotation[x]',
  rz: '.rotation[z]',
});