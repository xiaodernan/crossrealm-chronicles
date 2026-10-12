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
   * @param {THREE.Object3D} [opts.root] - 片段绑定的根对象。**默认是实体自己的变换节点，
   *   而那正是逻辑（朝向/贴地/摆动）每帧在写的地方** —— 所以调用方（`AnimationEntityAdapter`）
   *   必须传入视觉层根节点，见切片5 的所有权分家。
   */
  constructor(entity, library, opts = {}) {
    this.entity = entity;
    this.library = library;
    this.mixer = new AnimationMixer(opts.root ?? entity.mesh ?? entity.object3D, library);
    this.stateMap = opts.stateMap ?? {};
    this.currentState = opts.defaultState ?? 'idle';
    this._prevState = null;
    this._transitioning = false;
    this._callbacks = new Map();
    // 自动播放默认状态（若库中已有该动作）
    const defaultState = opts.defaultState ?? 'idle';
    const actionName = this.stateMap[defaultState] ?? defaultState;
    if (this.library.has(actionName)) {
      this.mixer.play(actionName);
    }
  }

  /**
   * 设置状态（自动处理过渡）。
   * @param {string} state - 目标状态
   * @param {object} [opts] - 过渡选项
   */
  setState(state, opts = {}) {
    const force = opts.force === true;
    if (!force && state === this.currentState && !this._transitioning) return;

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

/* 切片5 删掉了这里的 `createStateMachine` 与 `DEFAULT_{PLAYER,ENEMY,BOSS}_STATE_MAP` 四件：
 * 全仓零读者（只有 `index.js` 再导出），却是"状态 → 动作名"的第二份陈述 —— 而且它们在撒谎：
 * `interact` / `spellcast` / `intro` / `phaseChange` / `special` 这些动作名在运动表
 * （`AnimationLibrary.ANIM_MOTION`）里一个都不存在。真在跑的那一份映射收在
 * `AnimationEntityAdapter.js` 的 `STATE_TO_ACTION`，由门禁用例对着运动表逐条核对。 */