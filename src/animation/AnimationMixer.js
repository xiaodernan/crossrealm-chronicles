import * as THREE from 'three';

/**
 * AnimationMixer 封装：统一管理实体的动画状态机（W-C6 切片1）。
 *
 * 设计动机：
 * - 改前每个实体各自 `new THREE.AnimationMixer(mesh)`，动作名、权重、过渡散在各处，
 *   同一个动作（如 'run'）在不同实体里参数不一致，导致同模型不同实体表现不一。
 * - 现在所有动画状态机走唯一出口：`AnimationMixer` 类，动作配置集中在 `AnimationLibrary`，
 *   过渡、层级、事件钩子只在此处维护。
 *
 * 用法：
 *   const mixer = new AnimationMixer(entity.mesh, animLib);
 *   mixer.play('run');
 *   mixer.crossFade('idle', 0.2);
 *   mixer.update(dt);
 */
export class AnimationMixer {
  /**
   * @param {THREE.Object3D} root - 挂载动画的根对象（通常是 SkinnedMesh 或其父 Group）
   * @param {AnimationLibrary} library - 动画库实例（提供 clip、配置）
   */
  constructor(root, library) {
    this.root = root;
    this.library = library;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();        // name -> THREE.AnimationAction
    this.currentAction = null;       // 当前主动作
    this.currentLayer = 0;           // 当前层级（用于分层动画）
    this._eventCallbacks = new Map(); // 动画事件回调
  }

  /**
   * 播放动作（立即切换，无过渡）。
   * @param {string} name - 动作名（需在 library 中注册）
   * @param {object} [opts] - 选项
   * @param {number} [opts.layer=0] - 层级
   * @param {boolean} [opts.loop=true] - 是否循环
   * @param {number} [opts.timeScale=1] - 播放速度
   * @returns {THREE.AnimationAction}
   */
  play(name, opts = {}) {
    const clip = this.library.getClip(name);
    if (!clip) throw new Error(`AnimationMixer: 未知动作 "${name}"`);

    const layer = opts.layer ?? 0;
    const action = this.mixer.clipAction(clip);
    action.setLoop(opts.loop !== false ? THREE.LoopRepeat : THREE.LoopOnce);
    action.timeScale = opts.timeScale ?? 1;
    action.play();

    // 停止同层级的其他动作
    for (const [, existing] of this.actions) {
      if (existing !== action && this._getLayer(existing) === layer) {
        existing.stop();
      }
    }

    this.actions.set(name, action);
    this.currentAction = action;
    this.currentLayer = layer;
    return action;
  }

  /**
   * 淡入切换（交叉淡化）。
   * @param {string} name - 目标动作名
   * @param {number} duration - 过渡时长（秒）
   * @param {object} [opts] - 同 play()
   */
  crossFade(name, duration, opts = {}) {
    const clip = this.library.getClip(name);
    if (!clip) throw new Error(`AnimationMixer: 未知动作 "${name}"`);

    const layer = opts.layer ?? 0;
    const action = this.mixer.clipAction(clip);
    action.setLoop(opts.loop !== false ? THREE.LoopRepeat : THREE.LoopOnce);
    action.timeScale = opts.timeScale ?? 1;
    action.enabled = true;

    if (this.currentAction && this._getLayer(this.currentAction) === layer) {
      this.currentAction.crossFadeTo(action, duration, true);
    } else {
      action.play();
    }

    this.actions.set(name, action);
    this.currentAction = action;
    this.currentLayer = layer;
    return action;
  }

  /**
   * 在指定层级添加附加动作（不停止主动作，权重叠加）。
   * @param {string} name
   * @param {number} weight - 权重 0~1
   * @param {object} [opts]
   */
  addLayer(name, weight, opts = {}) {
    const clip = this.library.getClip(name);
    if (!clip) throw new Error(`AnimationMixer: 未知动作 "${name}"`);

    const action = this.mixer.clipAction(clip);
    action.setLoop(opts.loop !== false ? THREE.LoopRepeat : THREE.LoopOnce);
    action.timeScale = opts.timeScale ?? 1;
    action.weight = weight;
    action.play();

    this.actions.set(name, action);
    return action;
  }

  /**
   * 停止指定动作。
   */
  stop(name) {
    const action = this.actions.get(name);
    if (action) {
      action.stop();
      this.actions.delete(name);
      if (this.currentAction === action) {
        this.currentAction = null;
      }
    }
  }

  /**
   * 停止所有动作。
   */
  stopAll() {
    for (const action of this.actions.values()) {
      action.stop();
    }
    this.actions.clear();
    this.currentAction = null;
  }

  /**
   * 设置动作权重。
   */
  setWeight(name, weight) {
    const action = this.actions.get(name);
    if (action) action.weight = weight;
  }

  /**
   * 获取动作的层级（内部实现）。
   */
  _getLayer(action) {
    // 简化：所有动作默认层级 0，扩展时可在 action.userData.layer 存储
    return action.userData?.layer ?? 0;
  }

  /**
   * 注册动画事件回调。
   * @param {string} actionName - 动作名
   * @param {string} eventType - 事件类型（'finished' | 'loop' | 自定义）
   * @param {Function} callback
   */
  onEvent(actionName, eventType, callback) {
    const action = this.actions.get(actionName);
    if (!action) throw new Error(`AnimationMixer: 动作 "${actionName}" 不存在`);
    const key = `${actionName}:${eventType}`;
    if (!this._eventCallbacks.has(key)) {
      this._eventCallbacks.set(key, []);
      // 监听 THREE 的事件
      action.getMixer().addEventListener(eventType, (e) => {
        if (e.action === action) {
          const callbacks = this._eventCallbacks.get(key);
          if (callbacks) callbacks.forEach((cb) => cb(e));
        }
      });
    }
    this._eventCallbacks.get(key).push(callback);
  }

  /**
   * 每帧更新。
   * @param {number} dt - 帧时间（秒）
   */
  update(dt) {
    this.mixer.update(dt);
  }

  /**
   * 获取当前动作名。
   */
  getCurrentActionName() {
    if (!this.currentAction) return null;
    for (const [name, action] of this.actions) {
      if (action === this.currentAction) return name;
    }
    return null;
  }

  /**
   * 释放资源。
   */
  dispose() {
    this.stopAll();
    this.mixer.uncacheRoot(this.root);
    this.mixer.uncacheAction(this.currentAction);
    this.actions.clear();
    this._eventCallbacks.clear();
  }
}