import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * 动画片段加载器 —— 统一加载 glTF/KFB/JSON 等格式的动画（W-C6 切片3）。
 *
 * 设计动机：
 * - 改前每个模型各自手写加载逻辑，路径硬编码、格式不统一。
 * - 现在统一入口：给模型类型 + 动作列表，返回 { name: clip } 映射。
 * - 支持 glTF（标准）、KFB（国产）、JSON（程序化）三种来源。
 */
export class AnimationClipLoader {
  /**
   * @param {THREE.LoadingManager} [manager] - 共享加载管理器
   */
  constructor(manager = null) {
    this.loader = manager ? new GLTFLoader(manager) : new GLTFLoader();
    this._cache = new Map(); // url -> Promise<Map<name, AnimationClip>>（未过滤的原件）
  }

  /**
   * 从 glTF 加载动画。
   * @param {string} url - glTF 文件路径
   * @param {string[]} [actionNames] - 只要这几个动作（可选，过滤用）
   * @returns {Promise<Map<string, THREE.AnimationClip>>}
   */
  async loadGLTF(url, actionNames = null) {
    // 缓存的是**原件**：过滤写在读取侧（切片3 补测）。早先这里把「首个调用方的
    // actionNames 过滤结果」按 url 存了下来 —— 同一个模型第二次要别的动作时，
    // 拿到的是别人那份过滤结果，而且不会报错，只会悄悄少动画。
    if (!this._cache.has(url)) {
      this._cache.set(url, this.loader.loadAsync(url).then((gltf) => {
        const clips = new Map();
        for (const clip of gltf.animations) {
          clips.set(clip.name, clip);
        }
        return clips;
      }));
    }

    const all = await this._cache.get(url);
    if (!actionNames) return new Map(all);
    const picked = new Map();
    for (const name of actionNames) {
      const clip = all.get(name);
      if (clip) picked.set(name, clip);
    }
    return picked;
  }

  /**
   * 批量加载多个模型的动画。
   * @param {Array<{url: string, actions?: string[]}>} entries
   * @returns {Promise<Map<string, THREE.AnimationClip>>} 合并后的所有 clip
   */
  async loadBatch(entries) {
    const allClips = new Map();
    for (const entry of entries) {
      const clips = await this.loadGLTF(entry.url, entry.actions);
      for (const clip of clips.values()) {
        allClips.set(`${entry.url}#${clip.name}`, clip);
      }
    }
    return allClips;
  }

  /**
   * 从 JSON 生成程序化动画（用于简单几何、UI 图标等）。
   * @param {object} def - { name, duration, tracks: [{ propertyPath, values, times }] }
   */
  static createFromJSON(def) {
    const tracks = def.tracks.map((t) =>
      new THREE.KeyframeTrack(t.propertyPath, t.times, t.values)
    );
    return new THREE.AnimationClip(def.name, def.duration, tracks);
  }

  /**
   * 清理缓存。
   */
  clearCache() {
    this._cache.clear();
  }
}

/**
 * 预设动作名常量（避免魔法字符串）。
 */
export const ANIM_ACTIONS = Object.freeze({
  // 玩家
  PLAYER_IDLE: 'player_idle',
  PLAYER_WALK: 'player_walk',
  PLAYER_RUN: 'player_run',
  PLAYER_ATTACK: 'player_attack',
  PLAYER_DODGE: 'player_dodge',
  PLAYER_HIT: 'player_hit',
  PLAYER_DEATH: 'player_death',
  PLAYER_INTERACT: 'player_interact',
  PLAYER_SPELLCAST: 'player_spellcast',

  // 敌人通用
  ENEMY_IDLE: 'enemy_idle',
  ENEMY_WALK: 'enemy_walk',
  ENEMY_RUN: 'enemy_run',
  ENEMY_ATTACK: 'enemy_attack',
  ENEMY_HIT: 'enemy_hit',
  ENEMY_DEATH: 'enemy_death',

  // Boss
  BOSS_IDLE: 'boss_idle',
  BOSS_INTRO: 'boss_intro',
  BOSS_PHASE_CHANGE: 'boss_phase_change',
  BOSS_ATTACK1: 'boss_attack1',
  BOSS_ATTACK2: 'boss_attack2',
  BOSS_SPECIAL: 'boss_special',
  BOSS_DEATH: 'boss_death'
});

/** 反向映射：用于调试日志 */
export const ANIM_ACTION_LABELS = Object.freeze(
  Object.fromEntries(Object.entries(ANIM_ACTIONS).map(([k, v]) => [v, k]))
);