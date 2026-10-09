import { AnimationMixer } from './AnimationMixer.js';

/**
 * AnimationController —— 实体级动画控制器（W-C6 切片2）。
 *
 * 将 AnimationMixer + AnimationLibrary 封装为实体可用的高级接口：
 * - 状态机驱动：根据实体状态自动切换动画
 * - 网络同步就绪：动作名而非 clip 对象跨网络
 * - 事件驱动：支持动画事件回调（如攻击判定帧、音效触发点）
 *
 * 用法：
 *   const anim = new AnimationController(entity, animLib);
 *   anim.setState('run');
 *   anim.update(dt);
 */
export class AnimationController {
  /**
   * @param {Entity} entity - 拥有此控制器的实体
   * @param {AnimationLibrary} library - 动画库
   * @param {object} [opts]
   * @param {object} [opts.stateMap] - 状态到动作名的映射 { state: actionName }
   * @param {string} [opts.defaultState='idle']
   */
  constructor(entity, library, opts = {}) {
    this.entity = entity;
    this.library = library;
    this.mixer = new AnimationMixer(entity.mesh || entity.object3D, library);
    this.stateMap = opts.stateMap ?? {};
    this.currentState = opts.defaultState ?? 'idle';
    this._prevState = null;
    this._transitioning = false;
    this._callbacks = new Map(); // 状态变更回调
  }

  /**
   * 设置状态（自动处理过渡）。
   * @param {string} state - 目标状态
   * @param {object} [opts] - 过渡选项
   */
  setState(state, opts = {}) {
    if (state === this.currentState && !this._transitioning) return;

    const actionName = this.stateMap[state] ?? state;
    if (!this.library.has(actionName)) {
      console.warn(`AnimationController: 状态 "${state}" 对应的动作 "${actionName}" 未在库中注册`);
      return;
    }

    this._prevState = this.currentState;
    this.currentState = state;
    this._transitioning = true;

    const fadeIn = opts.fadeIn ?? this.library.getConfig(actionName).fadeIn;
    const fadeOut = opts.fadeOut ?? this.library.getConfig(actionName).fadeOut;

    if (this.mixer.currentAction) {
      this.mixer.crossFade(actionName, Math.max(fadeIn, fadeOut));
    } else {
      this.mixer.play(actionName);
    }

    this._transitioning = false;
    this._fireCallbacks('stateChange', { from: this._prevState, to: state });
  }

  /**
   * 获取当前状态。
   */
  getState() {
    return this.currentState;
  }

  /**
   * 立即播放指定动作（跳过状态机）。
   */
  play(actionName, opts = {}) {
    return this.mixer.play(actionName, opts);
  }

  /**
   * 淡入切换到指定动作。
   */
  crossFade(actionName, duration, opts = {}) {
    return this.mixer.crossFade(actionName, duration, opts);
  }

  /**
   * 添加层级动画。
   */
  addLayer(actionName, weight, opts = {}) {
    return this.mixer.addLayer(actionName, weight, opts);
  }

  /**
   * 停止指定动作。
   */
  stop(actionName) {
    this.mixer.stop(actionName);
  }

  /**
   * 注册状态变更回调。
   * @param {Function} callback - callback(fromState, toState)
   */
  onStateChange(callback) {
    this._callbacks.set('stateChange', callback);
  }

  /**
   * 注册动画事件回调。
   */
  onAnimationEvent(actionName, eventType, callback) {
    this.mixer.onEvent(actionName, eventType, callback);
  }

  _fireCallbacks(event, data) {
    const cb = this._callbacks.get(event);
    if (cb) cb(data);
  }

  /**
   * 每帧更新。
   */
  update(dt) {
    this.mixer.update(dt);
  }

  /**
   * 获取当前动作名。
   */
  getCurrentAction() {
    return this.mixer.getCurrentActionName();
  }

  /**
   * 释放资源。
   */
  dispose() {
    this.mixer.dispose();
    this._callbacks.clear();
  }
}

/**
 * 状态机定义辅助：从简单配置生成状态映射。
 * @param {object} config - { states: { stateName: { action, transitions: { toState: condition } } } }
 */
export function createStateMachine(config) {
  const stateMap = {};
  for (const [state, def] of Object.entries(config.states)) {
    stateMap[state] = def.action ?? state;
  }
  return stateMap;
}

/** 默认玩家状态机 */
export const DEFAULT_PLAYER_STATE_MAP = Object.freeze({
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  attack: 'attack',
  dodge: 'dodge',
  hit: 'hit',
  death: 'death',
  interact: 'interact',
  spellcast: 'spellcast',
});

/** 默认敌人状态机 */
export const DEFAULT_ENEMY_STATE_MAP = Object.freeze({
  idle: 'idle',
  patrol: 'walk',
  chase: 'run',
  attack: 'attack',
  hit: 'hit',
  death: 'death',
  stagger: 'hit',
});

/** 默认 Boss 状态机 */
export const DEFAULT_BOSS_STATE_MAP = Object.freeze({
  idle: 'idle',
  intro: 'intro',
  phase1: 'idle',
  phase2: 'phaseChange',
  phase3: 'phaseChange',
  attack1: 'attack1',
  attack2: 'attack2',
  special: 'special',
  stagger: 'hit',
  death: 'death',
});