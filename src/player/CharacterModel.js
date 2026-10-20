import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ANIM_MANIFEST } from '../assets/AnimManifest.js';
import { ANIMATION_GLB_MANIFEST } from '../assets/AnimationGLBManifest.js';
import { isSkeletonClipName, registerSkeletonClips, boneName } from '../assets/SkeletonMotion.js';
import { applyShadow } from '../engine/shadowPolicy.js';

const MODEL_CANDIDATES = [
  '/assets/models/player.glb',
  '/assets/models/Soldier.glb',
  'https://threejs.org/examples/models/gltf/Soldier.glb',
];

export const ANIM_CATALOG = ANIM_MANIFEST;

/**
 * 视觉层根节点的名字 —— 与 `animation/AnimationEntityAdapter.js` 的 `ANIM_ROOT_NAME`
 * 是同一条约定（两边相等由 `tests/player-combat-feedback.test.js` 钉住）。
 * 不 import 那个模块：玩家块不该为了一个组名把整条动画管线拖进自己的 chunk。
 */
export const PLAYER_VISUAL_ROOT_NAME = '__anim';

/** 战斗动画状态机 — 支持 Mixamo 多 Clip GLB */
export class CharacterModel {
  constructor() {
    this.group = new THREE.Group();
    this.modelRoot = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.loaded = false;
    this.fallback = false;
    this.actionLock = 0;
    this.footOffset = 0;
    this.catalog = {};
    // 骨名 → 骨节点（`load()` 的 `isBone` 遍历顺手填）。唯一取骨口是 `boneOf()`：
    // 挂武器的一方不该自己写 `mixamorig` 前缀，也不该自己去 `getObjectByName` 撞运气。
    this.bones = {};
    // 招式 → 骨骼片段在 `actions` 里的键名（`SkeletonMotion` 那四条）。与 `catalog` 分两本账：
    // `catalog` 只说"GLB 素材自己提供了哪个 clip"，这里说"我们替这具骨架编出来了哪几招"。
    this.skeletal = {};
    this.combatState = 'idle';
    this.comboStep = 0;
    this.proc = { pitch: 0, roll: 0, yawOff: 0 };
    this._procDecay = 8;
    this.hasMixamoClips = false;
    this._procCombat = { t: 0, kind: null, intensity: 0 };
  }

  _startProcCombat(kind, duration, intensity = 1) {
    // 趔趄的方向**一次定死**，整段受击都用这一份。改前 `hit` 分支每帧重摇 `Math.random()`：
    // 60Hz 下实测 20 局受击里 `proc.roll` 逐帧翻号 248 次、总变分 2.278（单调衰减应当 ≈ 2×峰值
    // = 0.21）—— 玩家看到的不是"往一边歪一下"，是身体每帧抖一下。GLB clip 那条路径
    // （`playHit` 的 `_playOnce`）本来就是一次性赋值，这里向它对齐。
    this._procCombat = {
      t: duration,
      kind,
      intensity,
      rollOffset: (Math.random() - 0.5) * 0.25 * intensity,
    };
  }

  _applyProcCombat(dt) {
    if (!this._procCombat.t || !this.modelRoot) return;
    this._procCombat.t = Math.max(0, this._procCombat.t - dt);
    const k = this._procCombat.kind;
    const i = this._procCombat.intensity;
    const phase = 1 - this._procCombat.t / 0.5;
    if (k === 'attack') {
      this.proc.pitch = THREE.MathUtils.lerp(this.proc.pitch, -0.35 * i, 0.35);
      this.proc.yawOff = Math.sin(phase * Math.PI * 2) * 0.12 * i;
    } else if (k === 'heavy') {
      this.proc.pitch = -0.5 * i * Math.sin(phase * Math.PI);
      this.proc.roll = 0.08 * i;
    } else if (k === 'dodge') {
      this.proc.roll = 0.28 * i;
      this.proc.pitch = 0.1 * i;
    } else if (k === 'hit') {
      this.proc.pitch = 0.4 * i;
      // 用的是起手那一刻冻住的 `rollOffset`，不是每帧新摇（见 `_startProcCombat` 的注）
      this.proc.roll = this._procCombat.rollOffset;
    } else if (k === 'block') {
      this.proc.pitch = -0.18 * i;
      this.proc.roll = -0.1 * i;
    }
    if (this._procCombat.t <= 0) this._procCombat.kind = null;
  }

  /**
   * 从候选名里挑一个真有 Action 的。
   *
   * 三档里只有第一档（精确键）认骨骼片段：`this.skeletal.X` 是 `__sk:招式` 这种**内部地址**，
   * 调用方必须把它**明写**进候选表。忽略大小写与子串那两档是给素材名留的余地
   * （`'Roll'` 撞上 `'Run To Rolling'`），让它们能撞进 `__sk:` 就把"这招没有 clip"偷换成了
   * "借了隔壁那招的骨骼片段"（B113①：`playSkill` / `playRiposte` 的候选里有 `heavy`，
   * 子串档于是每次都挑中 `__sk:heavy` —— 战技和弹反反击共用重击那一档的骨，而且一声不响）。
   */
  pickAnim(candidates) {
    const 可撞 = Object.keys(this.actions).filter((k) => !isSkeletonClipName(k));
    for (const c of candidates) {
      if (!c) continue;
      if (this.actions[c]) return c;
      const 小写 = String(c).toLowerCase();
      const hit = 可撞.find((k) => k.toLowerCase() === 小写);
      if (hit) return hit;
      const partial = 可撞.find((k) => k.toLowerCase().includes(小写) && 小写.length > 3);
      if (partial) return partial;
    }
    return null;
  }

  /**
   * 这个 Action 播的是不是本仓 `SkeletonMotion` 编出来的骨骼片段。
   * 判据只看 clip 名的前缀（`__sk:`），因为交接方式只取决于是不是同一类轨道 —— 见 `_playOnce`。
   */
  _isSkeletal(action) {
    return !!action && isSkeletonClipName(action.getClip?.()?.name);
  }

  /**
   * 按 Mixamo 标签取骨（`'RightHand'` → 节点上那个 `mixamorigRightHand`）。前缀口径归
   * `SkeletonMotion.BONE_PREFIX` —— 与骨骼片段驱动的是同一套名字，不会出现"表动 A 骨、剑挂 B 骨"。
   * 素材不在（胶囊 fallback、GLB 装配失败）时返回 null，调用方据此退回视觉层挂点。
   */
  boneOf(标签) {
    return this.bones[boneName(标签)] ?? null;
  }

  createFallback() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a4a5a, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 8, 16), bodyMat);
    torso.position.y = 1.1;
    applyShadow(torso, 'actor');
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), bodyMat);
    head.position.y = 2.0;
    applyShadow(head, 'actor');
    // 部件住进**视觉层根节点**，不直接挂 `group`：`group.rotation.y` 是 `PlayerController`
    // 每帧 lerp 出来的逻辑朝向（`PlayerController.js:124` 把 `mesh` 就指向这个 `group`），
    // 战斗反馈（pitch / roll / yawOff）必须写另一层。改前这里 `modelRoot = group`，于是
    // `update()` 里那句 `modelRoot !== group` 守卫把整段写入静默跳过 —— 实测（探针
    // `probe-player-hit.mjs` [b] 段）5 招 × 30 帧落点最大变化 `0.00e+0`：没有 GLB 的玩家
    // 在战斗里一动不动，而 proc 自己算到了 0.7 弧度。
    let 视觉 = this.group.children.find((o) => o.name === PLAYER_VISUAL_ROOT_NAME);
    if (!视觉) {
      视觉 = new THREE.Group();
      视觉.name = PLAYER_VISUAL_ROOT_NAME;
      this.group.add(视觉);
    }
    视觉.add(torso, head);   // `add()` 会先从旧父级摘下 ⇒ 重复调用也不套第二层
    this.modelRoot = 视觉;
    // 胶囊没有骨骼可挂。`load()` 的 catch 可能在 `bones` 已填之后才抛（骨骼片段注册就在那段 try 里），
    // 留着那份账会让 `boneOf` 认出一根不在场景图里的骨 ⇒ 剑被挂进空气里，玩家看不见武器。
    this.bones = {};
    this.fallback = true;
    this.loaded = true;
  }

  async load() {
    let gltf = null;
    const loader = new GLTFLoader();
    for (const url of MODEL_CANDIDATES) {
      try {
        gltf = await loader.loadAsync(url);
        console.info('[CharacterModel] loaded', url);
        break;
      } catch { /* next */ }
    }
    if (!gltf) {
      this.createFallback();
      return;
    }
    try {
      const model = gltf.scene;
      model.scale.set(1.1, 1.1, 1.1);
      // GLB 素材的朝向偏移（π）留在 model 自己这个节点上 —— 视觉层只承载 proc 三份值，
      // 两者合成朝向仍是 `π + yawOff`（画面与改前逐帧相同）。改前视觉层直接是 model，
      // 于是 proc 的 yawOff 只能写成 `π + yawOff`，把非对称部件（剑）镜像到另一侧（B110）。
      model.rotation.y = Math.PI;
      model.traverse((c) => {
        if (c.isMesh) {
          applyShadow(c, 'prop');
        }
      });
      let 视觉 = this.group.children.find((o) => o.name === PLAYER_VISUAL_ROOT_NAME);
      if (!视觉) {
        视觉 = new THREE.Group();
        视觉.name = PLAYER_VISUAL_ROOT_NAME;
        this.group.add(视觉);
      }
      视觉.add(model);
      this.modelRoot = 视觉;
      const box = new THREE.Box3().setFromObject(model);
      model.position.y -= box.min.y;
      this.mixer = new THREE.AnimationMixer(model);

      // 1) 主模型自带 clip（Idle/Run/Walk/TPose...）
      for (const clip of gltf.animations) {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      }

      // 2) 额外动画 GLB（Mixamo 真 clip）—— 真 clip 到位即覆盖同名程序化片段
      await this._loadExtraAnimationGLBs(loader);

      // 3) 建 catalog（真 clip 优先 → 程序化 → 素材 fallback）
      for (const [key, list] of Object.entries(ANIM_MANIFEST)) {
        this.catalog[key] = this.pickAnim(list);
      }
      this.hasMixamoClips = !!(this.catalog.hit && this.catalog.block && this.catalog.dodge);

      // 4) 骨骼收集 + 程序化片段注册（作为兜底，真 clip 已在 actions 里则不会被覆盖）
      const 在世骨骼 = new Set();
      model.traverse((o) => {
        if (!o.isBone) return;
        在世骨骼.add(o.name);
        this.bones[o.name] = o;
      });
      const 骨骼片 = registerSkeletonClips(this.mixer, 在世骨骼);
      for (const [招式, 名] of Object.entries(骨骼片.片段名)) {
        // 只有当 actions 里还没有真 clip 同名 action 时，才注册程序化片段
        if (!this.actions[名]) {
          this.actions[名] = 骨骼片.动作[招式];
          this.skeletal[招式] = 名;
        }
      }
      console.info('[AnimCatalog]', this.catalog, 'mixamo:', this.hasMixamoClips,
        '骨骼片段:', `${骨骼片.接上}招/${骨骼片.轨道数}轨`, Object.keys(this.actions));
      this._playLoop(this.catalog.idle || 'Idle', 1, 0);
      this.loaded = true;
    } catch (e) {
      // 退回胶囊是**看得见的降级**，但原因必须说出来：这段 try 里现在包含了骨骼片段的注册，
      // 表里用了没配基准姿态的骨会当场抛（`SkeletonMotion.buildSkeletonClip`），
      // 不让它变成一次没有日志的"素材没加载上"。
      console.error('[CharacterModel] GLB 装配失败，退回胶囊：', e);
      this.createFallback();
    }
  }

  /** 加载额外动画 GLB（W-C6 余项续：真 Mixamo clip 管线） */
  async _loadExtraAnimationGLBs(loader) {
    for (const url of ANIMATION_GLB_MANIFEST) {
      try {
        const gltf = await loader.loadAsync(url);
        console.info('[CharacterModel] extra anim loaded', url);
        for (const clip of gltf.animations || []) {
          // 真 clip 直接覆盖同名 action（优先级高于程序化片段）
          this.actions[clip.name] = this.mixer.clipAction(clip);
        }
      } catch (e) {
        console.warn('[CharacterModel] extra anim load failed:', url, e.message);
      }
    }
  }

  _playLoop(name, timeScale = 1, fade = 0.15) {
    const next = name ? this.actions[name] : null;
    if (!next) return false;
    if (this.currentAction && this.currentAction !== next) this.currentAction.fadeOut(fade);
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.setEffectiveTimeScale(timeScale);
    next.fadeIn(fade).play();
    this.currentAction = next;
    return true;
  }

  _playOnce(candidates, timeScale, duration, proc = {}) {
    const name = this.pickAnim(candidates);
    if (name && this.mixer) {
      const action = this.actions[name];
      const 骨骼 = this._isSkeletal(action);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      // 骨骼片段的关键帧是**秒**：`SkeletonMotion` 的 `strikeAt` 与 `combat/MoveTable.js` 的 `at`
      // 同源，倍速会把视觉峰从判定帧上挪开（一式要 1.12 倍 ⇒ 峰早一帧），所以这一类不跟手感倍速。
      action.setEffectiveTimeScale(骨骼 ? 1 : timeScale);
      // 交接方式只有一条判据：**跨类就硬切，同类才淡入淡出**。
      // 跨类不能淡：GLB clip 用四元数驱动全部 49 根骨，骨骼片段用 `.rotation[x]` 数字轨道驱动
      // 其中 11 根，而 `Object3D` 的 `quaternion` 与 `rotation` 互相同步 —— 淡入期内同一根骨每帧
      // 被两个写者各写一遍，谁后写谁全赢，权重斜坡根本不构成插值（看着像没接上，其实是接脏了）。
      // 硬切的跳变实测 ≈ 3 厘米：`Idle` 在自己整圈循环里离它第 0 帧最远 0.034 米
      // （探针 `.tmp-20261013/probe-idle-deviation.mjs`），而片段首/末帧的增量都是 0，
      // 加完 `SKELETON_REST` 正好就是 `Idle` 第 0 帧那一档 —— 接缝两边本来就是同一个姿势。
      // 同类之间（连段一式接二式）两边都是数字欧拉轨道，three 的加权求和是真插值，照旧淡。
      const 跨类 = 骨骼 !== this._isSkeletal(this.currentAction);
      if (this.currentAction && this.currentAction !== action) {
        if (跨类) this.currentAction.stop();
        else this.currentAction.fadeOut(0.06);
      }
      action.fadeIn(跨类 ? 0 : 0.06).play();
      this.currentAction = action;
    }
    this.actionLock = duration;
    Object.assign(this.proc, proc);
    return !!name;
  }

  playComboAttack(step) {
    this.comboStep = step;
    this.combatState = `combo${step}`;
    const dur = 0.36 + step * 0.06;
    const sets = [
      // 优先级：素材真有攻击 clip（`catalog.attack1` / `ANIM_MANIFEST` 里的名字）> 我们替这具
      // 骨架编的骨骼片段 > 跑步/走路当替身。最后那一档就是 B111 的病根：出厂 GLB 一条攻击都没有，
      // 于是每一招都落到 `'Walk'`/`'Run'` × 倍速 —— 玩家看到一边挥空手一边原地踏步。
      [this.catalog.attack1, ...ANIM_MANIFEST.attack1, this.skeletal.attack1, this.catalog.walk, 'Walk'],
      [this.catalog.attack2, ...ANIM_MANIFEST.attack2, this.skeletal.attack2, this.catalog.run, 'Run'],
      [this.catalog.attack3, ...ANIM_MANIFEST.attack3, this.skeletal.attack3, ...ANIM_MANIFEST.heavy, this.catalog.run, 'Run'],
    ];
    const procs = [
      { pitch: -0.22, yawOff: 0.08 },
      { pitch: -0.3, yawOff: -0.06 },
      { pitch: -0.42, yawOff: 0.14 },
    ];
    const speeds = [1.12, 1.05, 0.95];
    if (!this._playOnce(sets[step - 1], speeds[step - 1], dur, procs[step - 1])) {
      this._playOnce([this.catalog.run, 'Run'], 2 + step * 0.4, dur, procs[step - 1]);
      if (!this.hasMixamoClips) this._startProcCombat('attack', dur, 0.8 + step * 0.15);
    }
    return true;
  }

  playAttack() { return this.playComboAttack(1); }

  playHeavyAttack() {
    this.combatState = 'heavy';
    if (!this._playOnce(
      [this.catalog.heavy, ...ANIM_MANIFEST.heavy, this.skeletal.heavy, this.catalog.attack3, ...ANIM_MANIFEST.attack3],
      0.92, 0.62, { pitch: -0.45, roll: 0.05 }
    )) {
      this._playOnce([this.catalog.run, 'Run'], 0.65, 0.62, { pitch: -0.45 });
      if (!this.hasMixamoClips) this._startProcCombat('heavy', 0.62, 1);
    }
    return true;
  }

  playRiposte() {
    this.combatState = 'riposte';
    // 骨骼片段的档位与这一招的状态锁**同长**（0.55），所以不需要再借重击那一档（B113②）。
    if (!this._playOnce(
      [this.catalog.parry, ...ANIM_MANIFEST.parry, this.skeletal.riposte, this.catalog.heavy, ...ANIM_MANIFEST.heavy],
      1.1, 0.55, { pitch: -0.5, yawOff: 0.18 }
    )) {
      if (!this.hasMixamoClips) this._startProcCombat('heavy', 0.55, 1.1);
    }
    return true;
  }

  playDodge() {
    this.combatState = 'dodge';
    if (!this._playOnce(
      [this.catalog.dodge, ...ANIM_MANIFEST.dodge, this.skeletal.dodge, this.catalog.run, 'Run'],
      1.22, 0.52, { pitch: 0.12, roll: 0.22 }
    )) {
      this._playOnce(['Run'], 1.75, 0.52, { pitch: 0.15, roll: 0.25 });
      if (!this.hasMixamoClips) this._startProcCombat('dodge', 0.52, 1);
    }
    return true;
  }

  playHit() {
    this.combatState = 'hit';
    if (!this._playOnce(
      [this.catalog.hit, ...ANIM_MANIFEST.hit, this.skeletal.hit, this.catalog.walk, 'Walk'],
      1.0, 0.48, { pitch: 0.35, roll: (Math.random() - 0.5) * 0.3 }
    )) {
      // 这里原来是 `0.42` —— 与上面那条 0.48 的状态锁不一致，兜底那一跑把锁缩了 6 帧。
      this._playOnce(['Walk'], -1.6, 0.48, { pitch: 0.32 });
      if (!this.hasMixamoClips) this._startProcCombat('hit', 0.48, 1);
    }
    return true;
  }

  playBlock() {
    this.combatState = 'block';
    // 原来这里先写 `actionLock = 0.38`，紧接着 `_playOnce` 又把它覆盖成 0.35 —— 那个 0.38
    // 从来没有生效过，留着只让人以为格挡锁 0.38。锁的真源是 `_playOnce` 的第三参。
    this.proc.pitch = -0.14;
    this.proc.roll = -0.08;
    if (!this._playOnce([this.catalog.block, ...ANIM_MANIFEST.block, this.skeletal.block, this.catalog.idle, 'Idle'], 1.0, 0.35, {})) {
      this._playLoop(this.catalog.idle || 'Idle', 0.2, 0.05);
      if (!this.hasMixamoClips) this._startProcCombat('block', 0.35, 0.9);
    }
    return true;
  }

  playParrySuccess() {
    this.combatState = 'parry';
    // 同上：`actionLock = 0.48` 是一笔死账，`_playOnce` 的 0.45 才是生效的那一份。
    this.proc.pitch = -0.25;
    this.proc.yawOff = 0.2;
    if (!this._playOnce(
      [this.catalog.parry, ...ANIM_MANIFEST.parry, this.skeletal.parry, this.catalog.block, ...ANIM_MANIFEST.block],
      1.1, 0.45, {}
    )) {
      if (!this.hasMixamoClips) this._startProcCombat('attack', 0.45, 0.9);
    }
    return true;
  }

  playSkill() {
    this.combatState = 'skill';
    if (!this._playOnce(
      [this.catalog.skill, ...ANIM_MANIFEST.skill, this.skeletal.skill, this.catalog.heavy, ...ANIM_MANIFEST.heavy],
      1.05, 0.5, { pitch: -0.3, yawOff: 0.15 }
    )) {
      if (!this.hasMixamoClips) this._startProcCombat('attack', 0.5, 1.2);
    }
    return true;
  }

  setMovementState(moving, sprinting) {
    if (!this.mixer || this.actionLock > 0) return;
    if (this.combatState !== 'idle' && this.combatState !== 'locomotion') return;
    this.combatState = 'locomotion';
    if (!moving) this._playLoop(this.catalog.idle || 'Idle', 1, 0.12);
    else if (sprinting) this._playLoop(this.catalog.run || 'Run', 1.28, 0.08);
    else this._playLoop(this.catalog.walk || 'Walk', 1.08, 0.1);
  }

  update(dt) {
    this.actionLock = Math.max(0, this.actionLock - dt);
    this._applyProcCombat(dt);
    this.proc.pitch = THREE.MathUtils.lerp(this.proc.pitch, 0, this._procDecay * dt);
    this.proc.roll = THREE.MathUtils.lerp(this.proc.roll, 0, this._procDecay * dt);
    this.proc.yawOff = THREE.MathUtils.lerp(this.proc.yawOff, 0, this._procDecay * dt);
    // 落点永远是视觉层：两条构造路径都把 `modelRoot` 设成 `group` 的**子**节点
    // （fallback 走 `PLAYER_VISUAL_ROOT_NAME` 那个组，GLB 走 `gltf.scene`）。
    // 这里不再判 `modelRoot !== this.group` —— 那个判据不是防护，是把整段反馈吞掉的静默兜底
    // （B109），防护的职责已经由"构造时分家"承担了，`tests/player-combat-feedback.test.js`
    // 拿逻辑朝向哨兵钉住"动画不写 group"这件事。
    if (this.modelRoot) {
      this.modelRoot.rotation.x = this.proc.pitch;
      this.modelRoot.rotation.z = this.proc.roll;
      // 视觉层只承载 proc 三份值，**不含** GLB 素材那半圈朝向偏移（π）—— 那个 π 归 GLB 分支
      // 自己的节点（`load()` 里 `model.rotation.y = Math.PI`）。改前这里写 `Math.PI + yawOff`，
      // 于是任何挂进视觉层的非对称部件（剑）会被那半圈镜像到身体另一侧并甩出去一截（B110）。
      this.modelRoot.rotation.y = this.proc.yawOff;
    }
    this.mixer?.update(dt);
    if (this.actionLock <= 0 && this.currentAction?.loop === THREE.LoopOnce) {
      this.combatState = 'idle';
      const idle = this.catalog.idle || 'Idle';
      if (this.actions[idle] && this.currentAction !== this.actions[idle]) {
        // 骨骼片段收在站姿上（末帧增量 0 ⇒ 加完 `SKELETON_REST` 就是 `Idle` 的第 0 帧那一档），
        // 所以回到 `Idle` 时硬切即连续；留 0.12 的淡入淡出反而让两类轨道同时写那 11 根骨
        // —— 与 `_playOnce` 里进招式那一侧是同一条理由，判据也共用 `_isSkeletal`。
        this._playLoop(idle, 1, this._isSkeletal(this.currentAction) ? 0 : 0.12);
      }
    }
  }

  getObjectByName(name) {
    return this.group.getObjectByName(name);
  }
}
