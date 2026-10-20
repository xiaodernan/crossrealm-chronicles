import * as THREE from 'three';
import { addShake } from '../engine/Shake.js';
import { emitCue } from '../engine/cues.js';
import { EXECUTION_CAMERA } from '../content/tuning.js';
import { requestDof, cancelDof, setDofEnabled } from '../engine/DofManager.js';

import { on, offAll } from '../engine/EventBus.js';

const CINEMATIC_COMBATCAMERADIRECTOR = 'cinematic/CombatCameraDirector';
const camDirOn = (name, handler) => on(name, handler, CINEMATIC_COMBATCAMERADIRECTOR);
import { FOV_LAYER_OVERRIDE as COMBAT_FOV_LAYER } from '../engine/CameraRig.js';

/** Boss 战 / 连击处决 — 慢动作 + 轨道锁定镜头 + FOV 压缩 */
const PRESETS = {
  finisher: {
    duration: 0.62,
    timeScale: 0.24,
    pull: 1.4,
    fovDelta: -7,
    shake: 0.11,
    letterbox: 0.35,
    label: '连击终结',
    orbitRadius: 4.2,
    orbitHeight: 1.55,
    orbitSweep: 0.42,
    orbitLock: 0.72,
  },
  riposte: {
    duration: 0.52,
    timeScale: 0.2,
    pull: 1.8,
    fovDelta: -9,
    shake: 0.09,
    letterbox: 0.4,
    label: '致命反击',
    orbitRadius: 3.8,
    orbitHeight: 1.35,
    orbitSweep: 0.28,
    orbitLock: 0.78,
  },
  execution: {
    duration: 0.78,
    timeScale: 0.16,
    pull: 2.2,
    fovDelta: -11,
    shake: 0.13,
    letterbox: 0.55,
    label: '处决',
    orbitRadius: 4.6,
    orbitHeight: 1.48,
    orbitSweep: 0.55,
    orbitLock: 0.88,
  },
  bossKill: {
    duration: 1.12,
    timeScale: 0.12,
    pull: 2.6,
    fovDelta: -14,
    shake: 0.16,
    letterbox: 0.72,
    label: 'Boss 击破',
    orbitRadius: 5.4,
    orbitHeight: 1.75,
    orbitSweep: 0.72,
    orbitLock: 0.95,
  },
};

export class CombatCameraDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第七处） */
  dispose() {
    offAll(CINEMATIC_COMBATCAMERADIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.active = false;
    this.timer = 0;
    this.duration = 0;
    this.preset = null;
    this.target = new THREE.Vector3();
    this.playerAnchor = new THREE.Vector3();
    this.orbitCenter = new THREE.Vector3();
    this._pull = 0;
    this._fovAdd = 0;
    this._lookBias = 0;
    this._timeScale = 1;
    this._cooldown = 0;
    this.blocksInputUntil = 0;
    this._orbitStart = 0;
    this._orbitSweep = 0;
    this._orbitRadius = 4;
    this._orbitHeight = 1.4;
    this._orbitLock = 0;
    /* 每帧的取景点：相机唯一的写入方是 PlayerController，这里一次算好就不再 new
     * （旧实现在 getCameraOverrides 里每帧新建三个 Vector3，一帧的镜头不该有分配） */
    this._camPos = new THREE.Vector3();
    this._lookAt = new THREE.Vector3();
    this._chest = new THREE.Vector3();
    /**
     * 覆盖量协议的对象本身也是单份的：`PlayerController` 每帧来读一次，
     * 旧实现每帧新建返回对象 + `orbit` 子对象 + 三个 Vector3，等于"看一帧镜头先分配五个对象"。
     */
    this._ov = {
      pull: 0, fovAdd: 0, lookBias: 0, focus: null, lockOrbit: false, gaze: 0,
      orbit: { position: this._camPos, lookAt: this._lookAt, blend: 0 },
    };
    /** 被处决者的注视高度（世界 Y）与体型折算档，play() 一次算好整段沿用 */
    this._lookY = 0;
    this._statureScale = 1;

    this.flash = document.createElement('div');
    this.flash.id = 'combat-exec-flash';
    this.flash.className = 'combat-exec-flash hidden';
    document.body.appendChild(this.flash);

    this.label = document.createElement('div');
    this.label.id = 'combat-exec-label';
    this.label.className = 'combat-exec-label hidden';
    document.body.appendChild(this.label);

    this.letterbox = document.createElement('div');
    this.letterbox.id = 'combat-micro-letterbox';
    this.letterbox.className = 'combat-micro-letterbox hidden';
    this.letterbox.innerHTML = '<div class="cm-bar cm-top"></div><div class="cm-bar cm-bottom"></div>';
    document.body.appendChild(this.letterbox);

    this.vignette = document.createElement('div');
    this.vignette.id = 'combat-orbit-vignette';
    this.vignette.className = 'combat-orbit-vignette hidden';
    document.body.appendChild(this.vignette);

    this._bindEvents();
  }

  _bindEvents() {
    camDirOn('combo-finisher', () => this.play('finisher'));
    camDirOn('combat-riposte', () => this.play('riposte'));
    camDirOn('combat-execution', (e) => {
      if (e.detail?.boss) this.play('bossKill', e.detail);
      else this.play('execution', e.detail);
    });
  }

  play(kind, detail = {}) {
    if (this._cooldown > 0 || this.game.cinematicActive || this.game.cinematics?.active) return;
    const preset = PRESETS[kind];
    if (!preset) return;

    this.game.restScene?.release?.('combat');

    this.active = true;
    this.timer = 0;
    this.duration = preset.duration;
    this.preset = kind;  // 存预设名字符串，供 DoF 预设表使用
    this._timeScale = preset.timeScale;

    const player = this.game.player;
    const lock = player?.combat?.lockTarget;
    this.playerAnchor.copy(player.position);
    /* 被处决者是谁、有多大：优先用事件带过来的身高与网格原点高度，
     * 没有事件（连击终结/弹反）就当场问锁定目标本人的两个只读接口 */
    let subject = null;
    if (detail?.position) {
      this.target.copy(detail.position);
      subject = detail;
    } else if (lock?.alive) {
      this.target.copy(lock.position);
      subject = { stature: lock.statureHeight?.() ?? null, base: lock.hurtBaseY?.() ?? lock.position.y };
    } else {
      this.target.copy(player.position)
        .addScaledVector(player.getCombatForwardXZ?.() ?? new THREE.Vector3(0, 0, -1), 4);
    }

    /* 取景按身体算，不按"人类身高"算：注视点是胸口，环绕中心与半径/高度同一档折算。
     * 旧写法把注视点写成 `target.y + 1.25`，于是 1.87 米的无人机与 3.85 米的 Boss 构图相同 ——
     * 打 Boss 时镜头埋进它肚子里，打小个子时又远到看不清是谁死了 */
    const stat = subject?.stature ?? EXECUTION_CAMERA.fallbackStature;
    const k = THREE.MathUtils.clamp(
      stat / EXECUTION_CAMERA.ref, EXECUTION_CAMERA.minScale, EXECUTION_CAMERA.maxScale
    );
    this._statureScale = k;
    this._lookY = (subject?.base ?? this.target.y) + stat * EXECUTION_CAMERA.lookRatio;
    this.orbitCenter.lerpVectors(this.playerAnchor, this.target, EXECUTION_CAMERA.centerBias);
    this.orbitCenter.y = THREE.MathUtils.lerp(this.playerAnchor.y, this._lookY, EXECUTION_CAMERA.centerBias);

    const dx = this.target.x - this.playerAnchor.x;
    const dz = this.target.z - this.playerAnchor.z;
    this._orbitStart = Math.atan2(dx, dz) - preset.orbitSweep * 0.35;
    this._orbitSweep = preset.orbitSweep;
    this._orbitRadius = preset.orbitRadius
      * (1 + (k - 1) * EXECUTION_CAMERA.radiusFollow);
    this._orbitHeight = preset.orbitHeight
      * (1 + (k - 1) * EXECUTION_CAMERA.heightFollow);
    this._orbitLock = preset.orbitLock;

    this._pull = preset.pull;
    this._fovAdd = preset.fovDelta;
    this._lookBias = kind === 'bossKill' ? 0.62 : 0.48;

    if (player) player.timeSlow = preset.timeScale;

    const lockRatio = kind === 'bossKill' ? 0.92 : kind === 'execution' ? 0.78 : 0.65;
    this.blocksInputUntil = performance.now() + preset.duration * lockRatio * 1000;
    this.game.combatInputLock?.lock(preset.duration * lockRatio, { allowCamera: kind === 'finisher' });

    this.flash.classList.remove('hidden');
    this.flash.style.opacity = kind === 'bossKill' ? '0.55' : '0.38';
    // rAF-EXCEPTION：闪光层的淡出需要一次绘制间隔（CSS 过渡），不参与世界时间缩放
    requestAnimationFrame(() => { this.flash.style.opacity = '0'; });

    if (preset.label) {
      this.label.textContent = preset.label;
      this.label.classList.remove('hidden');
    }

    if (preset.letterbox > 0) {
      this.letterbox.classList.remove('hidden');
      this.letterbox.style.setProperty('--cm-size', `${preset.letterbox * 5.5}vh`);
    }

    this.vignette.classList.remove('hidden');
    addShake(preset.shake);
    this.game.audio?.heavyHit?.();
    if (kind === 'bossKill' || kind === 'execution') emitCue('execution');
    // W-D6 切片8：处决只响不写，是听障玩家读不到的那一格 —— 改派字幕线索，声音与字幕同一个出口
    this.game.executionFx?.burst?.(this.target, kind);
  }

  getTimeScale() {
    if (!this.active) return 1;
    return this._timeScale;
  }

  blocksInput() {
    return this.active || performance.now() < this.blocksInputUntil;
  }

  _envelope(t) {
    const easeIn = Math.sin(Math.min(t, 0.35) / 0.35 * Math.PI * 0.5);
    const easeOut = t > 0.55 ? 1 - Math.pow((t - 0.55) / 0.45, 2) : 1;
    return easeIn * easeOut;
  }

  /**
   * 覆盖量协议 —— `PlayerController` 每帧读这一份。
   *
   * 返回的对象、里面的 `orbit` 与两个取景点全是常驻的：旧实现每帧新建 5 个对象
   * （其中三个 `THREE.Vector3`），等于"看一帧镜头先分配五个对象"，正好砸在掉帧的那几帧上。
   * 因此调用方只能**当场读完**，不得把返回的引用存下来 —— 下一帧它就不是那个值了。
   * 不活跃时把 `orbit.position/lookAt` 置空，保持旧契约（读取方用 `?.` 短路）。
   */
  getCameraOverrides() {
    const ov = this._ov;
    if (!this.active) {
      ov.pull = 0;
      ov.fovAdd = 0;
      ov.lookBias = 0;
      ov.focus = null;
      ov.lockOrbit = false;
      ov.gaze = 0;
      ov.orbit.position = null;
      ov.orbit.lookAt = null;
      ov.orbit.blend = 0;
      return ov;
    }
    const t = this.timer / this.duration;
    const envelope = this._envelope(t);
    const orbitT = Math.pow(Math.min(t / 0.82, 1), 0.85);
    const angle = this._orbitStart + this._orbitSweep * orbitT;
    const radius = this._orbitRadius * (0.92 + envelope * 0.08);
    const height = this._orbitHeight + Math.sin(orbitT * Math.PI) * 0.35;

    const camPos = this._camPos.set(
      this.orbitCenter.x + Math.sin(angle) * radius,
      this.orbitCenter.y + height,
      this.orbitCenter.z + Math.cos(angle) * radius
    );

    /* 注视点：胸口（`_lookY`，play() 那一次算好）与玩家心脏之间的加权 */
    const lookTarget = this._lookAt.set(this.target.x, this._lookY, this.target.z)
      .lerp(this._chest.set(this.playerAnchor.x, this.playerAnchor.y + 1.2, this.playerAnchor.z), 0.18);

    const blend = envelope * this._orbitLock;
    ov.pull = this._pull * envelope;
    ov.fovAdd = this._fovAdd * envelope;
    ov.lookBias = this._lookBias * envelope;
    ov.focus = this.target;
    ov.lockOrbit = blend > 0.12;
    /* 第一人称的"借镜头"额度：相机就是玩家的眼睛，搬不走位置，只能按同一档权威搬视线。
     * 与 lockOrbit 同一条门槛，避免出现"第三人称已绕轨、第一人称还看着别处" */
    ov.gaze = blend > 0.12 ? blend : 0;
    ov.orbit.position = camPos;
    ov.orbit.lookAt = lookTarget;
    ov.orbit.blend = blend;
    return ov;
  }

  update(rawDt) {
    this._cooldown = Math.max(0, this._cooldown - rawDt);
    const wasActive = this.active;
    if (!this.active) {
      if (wasActive) {
        // 从活跃变非活跃：显式取消 DoF 请求并立即关灯
        cancelDof();
        if (this.game.dofPass) setDofEnabled(this.game.dofPass, false);
      }
      return;
    }

    this.timer += rawDt;
    const t = this.timer / this.duration;

    if (t >= 1) {
      this.active = false;
      this._timeScale = 1;
      if (this.game.player) this.game.player.timeSlow = 1;
      this.label.classList.add('hidden');
      this.letterbox.classList.add('hidden');
      this.vignette.classList.add('hidden');
      this._cooldown = 0.35;
      this.blocksInputUntil = 0;
      this.game.combatInputLock?.release();
      /* 演出一结束就当场收回这层偏移，不等下一帧的申领结算：跳过、面板抢占、异常路径
       * 都可能让"下一帧"迟到，而 FOV 残留在玩家眼里就是"画面突然变广了没还原" */
      this.game.player?.rig?.revokeFov(COMBAT_FOV_LAYER);
      // DoF 显式取消：立即关灯，不等下一帧
      cancelDof();
      if (this.game.dofPass) setDofEnabled(this.game.dofPass, false);
    } else {
      const ov = this.getCameraOverrides();
      // 只申领，不写相机：全仓库只有 `CameraRig` 一处会碰 `camera.fov`
      this.game.player?.rig?.requestFov(COMBAT_FOV_LAYER, ov.fovAdd);
      this.vignette.style.opacity = String(0.15 + (ov.orbit?.blend ?? 0) * 0.35);
      /* 演出 DoF：使用预设表驱动，含平滑淡入淡出 ——
       * 焦点钉在本帧注视点，模糊量由预设 fadeIn/fadeOut 平滑过渡，
       * 不再手动写 maxblur，避免硬切。 */
      requestDof({
        preset: this.preset,              // 'finisher' | 'riposte' | 'execution' | 'bossKill'
        focus: ov.orbit.position.distanceTo(ov.orbit.lookAt),
      });
    }
  }

  /** 正常播完或被 skip：显式取消 DoF 请求，并立即关灯（不等下一帧）。 */
  end() {
    if (!this.active) return;
    this.active = false;
    this._timeScale = 1;
    if (this.game.player) this.game.player.timeSlow = 1;
    this.label.classList.add('hidden');
    this.letterbox.classList.add('hidden');
    this.vignette.classList.add('hidden');
    this._cooldown = 0.35;
    this.blocksInputUntil = 0;
    this.game.combatInputLock?.release();
    this.game.player?.rig?.revokeFov(COMBAT_FOV_LAYER);
    cancelDof();
    if (this.game.dofPass) setDofEnabled(this.game.dofPass, false);
  }

  /** 外部强制中断（ESC / 面板抢占等）—— 走同一条收尾路径。 */
  skip() {
    if (this.active) this.end();
  }
}
