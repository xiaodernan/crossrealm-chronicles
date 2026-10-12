import * as THREE from 'three';
import { AnimationController } from './AnimationController.js';
import { AnimationLibrary, ANIM_MOTION, MOTION_CHANNELS } from './AnimationLibrary.js';
import { AnimationClipLoader } from './AnimationClipLoader.js';

/**
 * 实体 → 动画适配器（W-C6 切片2 / 切片5 所有权分家）。
 *
 * 把实体的战斗状态（`combatState`）接到 `AnimationController`（状态机）+ `AnimationLibrary`
 * （clip/配置真源）上。**只对接已存在的真接口**，方法名不再凭想象：
 *   - `AnimationController(entity, library, opts)` 第一参是实体，状态映射走 `opts.stateMap`；
 *     它**没有** `registerState()`。
 *   - `AnimationLibrary` 是**实例**（`register/getConfig/getClip/setClip/has`）。
 *   - 程序化片段是**占位回退**：真模型接入后由加载器 `setClip` 覆盖同名 clip。
 *
 * ## 切片5：动画只写「视觉层根节点」自己的属性
 *
 * 改前混音器直接绑在 `entity.mesh` 上，而 `Enemy.mesh` 同时是三样东西的账本：
 * `facePoint/faceSpin` 写 `rotation.y`（朝向）、`wobble` 写 `rotation.z`（悬浮摆动）、
 * `updateMeshY` 写 `position.y`（贴地）。占位片段那条 `.rotation[y]` 轨道每帧把
 * `rotation.y` 按关键帧写成 0 —— 敌人因此**不再转身**，`Resolution.isBehind` 从背面打
 * 也由 true 翻成 false（背刺在实机上失效）。这不是"动画不好看"，是动画层偷走了战斗逻辑的字段。
 *
 * 现在分家：适配器在实体根下建一个 `THREE.Group`（`ANIM_ROOT_NAME`），把视觉子节点整体搬进去
 * （组的局部变换是单位阵 ⇒ 世界位置分毫不动），混音器绑这个组。于是：
 *   - 实体根（`entity.mesh`）继续由逻辑独占：朝向、贴地、摆动，动画一概不碰；
 *   - 组由动画独占：`ANIM_MOTION` 那三条通道（起伏 / 前倾 / 滚转）叠在逻辑变换之上。
 * 换句话说 `rotation.y` 从此不可能进片段 —— `MOTION_CHANNELS` 里就只有 `x` 和 `z`，
 * 门禁 `tests/animation-visual-root.test.js` 按"轨道绑定路径"逐条钉死这件事。
 *
 * ⚠️ 由此产生的约定：挂了适配器的实体，其视觉子节点不再是 `mesh.children` 的直接子项，
 * 任何按**位置**索引子节点的写法（`mesh.children[1]`）都会指错东西。取部件请走
 * `getObjectByName(...)`（`Enemy.bodyMesh` 就是这么取的），它在组里照样能找到。
 */

/** 视觉层根节点的 name —— 也是"这个实体已经接过动画"的标记（重复挂载复用它，不套第二层）。 */
export const ANIM_ROOT_NAME = '__anim';

/**
 * 实体状态 → 库内动作名：**这张表就是唯一那一份**（切片5 收掉了原来的两份抄本）。
 *
 * 改前同一个映射写了两遍 —— 模块级 `COMBAT_TO_ACTION` 给 `_resolveAction` 用，构造器里内联的
 * `defaultStateMap` 给控制器用。两份的键集不完全一样（内联那份多 `walk`/`run`/`locomotion`），
 * 于是"新加一个 FSM 状态"要改两处，漏一处的症状是动画不切而不报错。
 * 未知状态一律回落 `idle`（不抛、不谎报成别的动作）。
 */
export const STATE_TO_ACTION = Object.freeze({
  // 玩家/通用
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  locomotion: 'walk',   // 移动态：配 `sprinting` 分流到 run，见 `_resolveAction`
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

/**
 * 取（或建）实体的视觉层根节点。
 * 幂等：已有 `ANIM_ROOT_NAME` 子组就复用 —— 同一枚敌人被 `Game._attachEnemyAnimAdapters`
 * 重复挂载时，不能每次都往组里再套一层、也不能把已经搬进去的组当成"视觉子节点"再搬一次。
 */
export function ensureAnimRoot(entityRoot) {
  const 现成 = entityRoot.children.find((o) => o.name === ANIM_ROOT_NAME);
  if (现成) return 现成;
  const g = new THREE.Group();
  g.name = ANIM_ROOT_NAME;
  // 先记下要搬的，再搬：`add()` 会把节点从旧父级摘下来，边遍历 `children` 边搬会跳项。
  for (const child of [...entityRoot.children]) g.add(child);
  entityRoot.add(g);
  return g;
}

/** 拆掉视觉层根节点：子节点原路搬回实体根，组本身摘掉。 */
function releaseAnimRoot(entityRoot, animRoot) {
  if (!entityRoot || !animRoot) return;
  for (const child of [...animRoot.children]) entityRoot.add(child);
  animRoot.parent?.remove(animRoot);
}

export class AnimationEntityAdapter {
  /**
   * @param {object} entity - 拥有 `mesh` 或 `object3D` 的实体（如 CharacterModel、Enemy）
   * @param {AnimationLibrary} [library] - 不传则自建一个空库
   * @param {object} [stateMap] - 状态到动作名的映射（如 { windup: 'attack', pursue: 'run' }）
   */
  constructor(entity, library = new AnimationLibrary(), stateMap = {}) {
    const root = entity?.mesh ?? entity?.object3D ?? null;
    if (!root) throw new Error('AnimationEntityAdapter: 实体没有 mesh/object3D');
    this.entity = entity;
    this.library = library;
    this.entityRoot = root;
    this.animRoot = ensureAnimRoot(root);
    // `root` 传的是视觉层根节点，不是实体的变换节点 —— 切片5 的全部意义在这一行。
    this.controller = new AnimationController(entity, library, {
      stateMap: { ...STATE_TO_ACTION, ...stateMap },
      defaultState: 'idle',
      root: this.animRoot,
    });
  }

  /** 把动作配置注册进库（幂等：已注册则跳过）。配置逐项派生自 `ANIM_MOTION`，不再另抄一份。 */
  registerStates() {
    for (const name of Object.keys(ANIM_MOTION)) {
      if (this.library.has(name)) continue;
      const motion = ANIM_MOTION[name];
      this.library.register(name, {
        clipName: name,
        loop: motion.loop,
        fadeIn: 0.1,
        fadeOut: motion.loop ? 0.15 : 0.25,
      });
    }
  }

  /** 生成程序化占位 clip 并写入库（覆盖同名，供真模型接入前兜底）。 */
  registerProceduralClips() {
    for (const name of Object.keys(ANIM_MOTION)) {
      const motion = ANIM_MOTION[name];
      const tracks = [];
      for (const [通道, propertyPath] of Object.entries(MOTION_CHANNELS)) {
        const keys = motion[通道];
        if (!keys) continue;
        tracks.push({
          propertyPath,
          // 关键帧存的是"时长分数"，这里才乘上时长：改 `duration` 缩放整条动作，不改形状。
          times: keys.map(([分数]) => 分数 * motion.duration),
          values: keys.map(([, 值]) => 值),
        });
      }
      this.library.setClip(name, AnimationClipLoader.createFromJSON({
        name,
        duration: motion.duration,
        tracks,
      }));
    }
  }

  /** combatState → 动作名。 */
  _resolveAction(combatState, sprinting, state) {
    // 兼容 Enemy：它用 `state` 而非 `combatState`
    const effectiveState = combatState ?? state;
    if (effectiveState === 'locomotion') return sprinting ? 'run' : 'walk';
    return STATE_TO_ACTION[effectiveState] ?? 'idle';
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
    releaseAnimRoot(this.entityRoot, this.animRoot);
    this.entity = null;
    this.library = null;
    this.entityRoot = null;
    this.animRoot = null;
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
