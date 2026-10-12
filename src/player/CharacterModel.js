import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ANIM_MANIFEST } from '../assets/AnimManifest.js';
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

  pickAnim(candidates) {
    for (const c of candidates) {
      if (!c) continue;
      if (this.actions[c]) return c;
      const hit = Object.keys(this.actions).find((k) => k.toLowerCase() === String(c).toLowerCase());
      if (hit) return hit;
      const partial = Object.keys(this.actions).find((k) =>
        k.toLowerCase().includes(String(c).toLowerCase()) && String(c).length > 3
      );
      if (partial) return partial;
    }
    return null;
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
      model.rotation.y = Math.PI;
      model.traverse((c) => {
        if (c.isMesh) {
          applyShadow(c, 'prop');
        }
      });
      this.group.add(model);
      this.modelRoot = model;
      const box = new THREE.Box3().setFromObject(model);
      model.position.y -= box.min.y;
      this.mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      }
      for (const [key, list] of Object.entries(ANIM_MANIFEST)) {
        this.catalog[key] = this.pickAnim(list);
      }
      this.hasMixamoClips = !!(this.catalog.hit && this.catalog.block && this.catalog.dodge);
      console.info('[AnimCatalog]', this.catalog, 'mixamo:', this.hasMixamoClips, Object.keys(this.actions));
      this._playLoop(this.catalog.idle || 'Idle', 1, 0);
      this.loaded = true;
    } catch {
      this.createFallback();
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
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.setEffectiveTimeScale(timeScale);
      if (this.currentAction && this.currentAction !== action) this.currentAction.fadeOut(0.06);
      action.fadeIn(0.06).play();
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
      [this.catalog.attack1, ...ANIM_MANIFEST.attack1, this.catalog.walk, 'Walk'],
      [this.catalog.attack2, ...ANIM_MANIFEST.attack2, this.catalog.run, 'Run'],
      [this.catalog.attack3, ...ANIM_MANIFEST.attack3, ...ANIM_MANIFEST.heavy, this.catalog.run, 'Run'],
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
      [this.catalog.heavy, ...ANIM_MANIFEST.heavy, this.catalog.attack3, ...ANIM_MANIFEST.attack3],
      0.92, 0.62, { pitch: -0.45, roll: 0.05 }
    )) {
      this._playOnce([this.catalog.run, 'Run'], 0.65, 0.62, { pitch: -0.45 });
      if (!this.hasMixamoClips) this._startProcCombat('heavy', 0.62, 1);
    }
    return true;
  }

  playRiposte() {
    this.combatState = 'riposte';
    this._playOnce(
      [this.catalog.parry, ...ANIM_MANIFEST.parry, this.catalog.heavy, ...ANIM_MANIFEST.heavy],
      1.1, 0.55, { pitch: -0.5, yawOff: 0.18 }
    );
    return true;
  }

  playDodge() {
    this.combatState = 'dodge';
    if (!this._playOnce(
      [this.catalog.dodge, ...ANIM_MANIFEST.dodge, this.catalog.run, 'Run'],
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
      [this.catalog.hit, ...ANIM_MANIFEST.hit, this.catalog.walk, 'Walk'],
      1.0, 0.48, { pitch: 0.35, roll: (Math.random() - 0.5) * 0.3 }
    )) {
      this._playOnce(['Walk'], -1.6, 0.42, { pitch: 0.32 });
      if (!this.hasMixamoClips) this._startProcCombat('hit', 0.42, 1);
    }
    return true;
  }

  playBlock() {
    this.combatState = 'block';
    this.actionLock = 0.38;
    this.proc.pitch = -0.14;
    this.proc.roll = -0.08;
    if (!this._playOnce([this.catalog.block, ...ANIM_MANIFEST.block, this.catalog.idle, 'Idle'], 1.0, 0.35, {})) {
      this._playLoop(this.catalog.idle || 'Idle', 0.2, 0.05);
      if (!this.hasMixamoClips) this._startProcCombat('block', 0.35, 0.9);
    }
    return true;
  }

  playParrySuccess() {
    this.combatState = 'parry';
    this.actionLock = 0.48;
    this.proc.pitch = -0.25;
    this.proc.yawOff = 0.2;
    this._playOnce([this.catalog.parry, ...ANIM_MANIFEST.parry, this.catalog.block, ...ANIM_MANIFEST.block], 1.1, 0.45, {});
    return true;
  }

  playSkill() {
    this.combatState = 'skill';
    this._playOnce(
      [this.catalog.skill, ...ANIM_MANIFEST.skill, this.catalog.heavy, ...ANIM_MANIFEST.heavy],
      1.05, 0.5, { pitch: -0.3, yawOff: 0.15 }
    );
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
      this.modelRoot.rotation.y = Math.PI + this.proc.yawOff;
    }
    this.mixer?.update(dt);
    if (this.actionLock <= 0 && this.currentAction?.loop === THREE.LoopOnce) {
      this.combatState = 'idle';
      const idle = this.catalog.idle || 'Idle';
      if (this.actions[idle] && this.currentAction !== this.actions[idle]) {
        this._playLoop(idle, 1, 0.12);
      }
    }
  }

  getObjectByName(name) {
    return this.group.getObjectByName(name);
  }
}
