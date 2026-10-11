import { AnimationController } from './AnimationController.js';
import { AnimationLibrary } from './AnimationLibrary.js';
import { AnimationClipLoader } from './AnimationClipLoader.js';

/**
 * 实体 → 动画适配器（W-C6 切片2）。
 *
 * 把实体的战斗状态（`combatState`）接到 `AnimationController`（状态机）+ `AnimationLibrary`
 * （clip/配置真源）上。**只对接已存在的真接口**，方法名不再凭想象：
 *   - `AnimationController(entity, library, opts)` 第一参是实体（内部自建 `AnimationMixer`），
 *     状态映射走 `opts.stateMap`；它**没有** `registerState()`。
 *   - `AnimationLibrary` 是**实例**（`register/getConfig/getClip/setClip/has`），
 *     **没有** 静态 `getInstance()` / `createProceduralClip()`；程序化片段由
 *     `AnimationClipLoader.createFromJSON(def)` 生成，再 `library.setClip(name, clip)`。
 *   - 程序化片段是**占位回退**：真模型接入后由加载器 `setClip` 覆盖同名 clip。
 */

/** 实体 combatState → 库内动作名（未知回落 idle，绝不谎报）。 */
const COMBAT_TO_ACTION = Object.freeze({
  // 玩家/通用
  idle: 'idle',
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
  // 敌人 FSM 状态（EnemyFSM.js）
  return: 'walk',      // 归位走回出生点
  pursue: 'run',       // 追击冲刺
  orbit: 'walk',       // 外圈侧向移动
  windup: 'attack',    // 前摇（统一用 attack）
  strike: 'attack1',   // 命中段
  recover: 'idle',     // 后撤/收招
  stagger: 'hit',      // 硬直
  dead: 'death',       // 死亡
});

/** 库内动作 → { 循环?, 时长 }（程序化占位片段与动作配置共用）。 */
const ACTION_SPEC = Object.freeze({
  idle: { loop: true, duration: 2.0 },
  walk: { loop: true, duration: 1.0 },
  run: { loop: true, duration: 0.7 },
  attack: { loop: false, duration: 0.5 },   // 通用攻击别名，供 windup 等状态用
  attack1: { loop: false, duration: 0.5 },
  attack2: { loop: false, duration: 0.5 },
  attack3: { loop: false, duration: 0.6 },
  heavy: { loop: false, duration: 0.7 },
  dodge: { loop: false, duration: 0.5 },
  hit: { loop: false, duration: 0.4 },
  block: { loop: true, duration: 0.4 },
  parry: { loop: false, duration: 0.5 },
  skill: { loop: false, duration: 0.8 },
  death: { loop: false, duration: 1.0 },
});

export class AnimationEntityAdapter {
  /**
   * @param {object} entity - 拥有 `mesh` 或 `object3D` 的实体（如 CharacterModel）
   * @param {AnimationLibrary} [library] - 不传则自建一个空库
   * @param {object} [stateMap] - 状态到动作名的映射（如 { windup: 'attack', pursue: 'run' }）
   */
  constructor(entity, library = new AnimationLibrary(), stateMap = {}) {
    const root = entity?.mesh ?? entity?.object3D ?? null;
    if (!root) throw new Error('AnimationEntityAdapter: 实体没有 mesh/object3D');
    this.entity = entity;
    this.library = library;
    // 默认状态映射：包含玩家与敌人常用状态
    const defaultStateMap = {
      // 玩家/通用
      idle: 'idle',
      walk: 'walk',
      run: 'run',
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
      locomotion: 'walk',
      // 敌人 FSM 状态（EnemyFSM.js）
      return: 'walk',
      pursue: 'run',
      orbit: 'walk',
      windup: 'attack',
      strike: 'attack1',
      recover: 'idle',
      stagger: 'hit',
      dead: 'death',
    };
    this.controller = new AnimationController(entity, library, { stateMap: { ...defaultStateMap, ...stateMap }, defaultState: 'idle' });
    this.entity = entity;
    this.library = library;
  }

  /** 把动作配置注册进库（幂等：已注册则跳过）。 */
  registerStates() {
    for (const [name, spec] of Object.entries(ACTION_SPEC)) {
      if (this.library.has(name)) continue;
      this.library.register(name, {
        clipName: name,
        loop: spec.loop,
        fadeIn: 0.1,
        fadeOut: spec.loop ? 0.15 : 0.25,
      });
    }
  }

  /** 生成程序化占位 clip 并写入库（覆盖同名，供真模型接入前兜底）。 */
  registerProceduralClips() {
    for (const [name, spec] of Object.entries(ACTION_SPEC)) {
      const clip = AnimationClipLoader.createFromJSON({
        name,
        duration: spec.duration,
        tracks: [{ propertyPath: '.rotation[y]', times: [0, spec.duration], values: [0, 0] }],
      });
      this.library.setClip(name, clip);
    }
  }

  /** combatState → 动作名。 */
  _resolveAction(combatState, sprinting, state) {
    // 兼容 Enemy：它用 `state` 而非 `combatState`
    const effectiveState = combatState ?? state;
    if (effectiveState === 'locomotion') return sprinting ? 'run' : 'walk';
    return COMBAT_TO_ACTION[effectiveState] ?? 'idle';
  }

/** 按实体当前战斗状态同步控制器（库内没有的动作就不切，不谎报）。 */
  syncFromEntity() {
    if (!this.entity) return;
    const combatState = this.entity.combatState ?? this.entity.state;
    const sprinting = this.entity.sprinting;
    // locomotion + sprinting → run 状态
    const controllerState = (combatState === 'locomotion' && sprinting) ? 'run' : combatState;
    const action = this._resolveAction(combatState, sprinting);
    if (!this.library.has(action)) return;
    if (this.controller.currentState !== controllerState) {
      this.controller.setState(controllerState);
    } else if (!this.controller.getCurrentAction()) {
      this.controller.setState(controllerState, { force: true });
    }
  }

/** 每帧：同步 + 推进 mixer。 */
  update(dt) {
    this.syncFromEntity();
    this.controller.update(dt);
  }

  setState(state, params = {}) {
    this.controller.setState(state, params);
  }

  getState() {
    return this.controller.currentState;
  }

  getCurrentAction() {
    return this.controller.getCurrentAction();
  }

  dispose() {
    this.controller?.dispose();
    this.entity = null;
    this.library = null;
  }
}

/**
 * 工厂：为实体建适配器并补程序化占位片段。
 * 实体没有 mesh/object3D 时返回 null（诚实，不返回半成品）。
 */
export function createEntityAdapter(entity, opts = {}) {
  if (!entity) return null;
  const root = entity.mesh ?? entity.object3D ?? null;
  if (!root) {
    console.warn('[AnimationEntityAdapter] 实体没有 mesh/object3D，跳过');
    return null;
  }
  const library = new AnimationLibrary();
  const adapter = new AnimationEntityAdapter(entity, library, opts.stateMap);
  adapter.registerStates();
  adapter.registerProceduralClips();
  return adapter;
}
