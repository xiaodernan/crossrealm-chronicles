import * as THREE from 'three';

/** 自动通关 — 操控玩家角色跑图，Boss 步骤会强制现身后再推进任务 */
export class PlayerAutoPlay {
  constructor(game) {
    this.game = game;
    this.active = false;
    this._steps = [];
    this._stepIndex = 0;
    this._state = 'idle';
    this._targetX = null;
    this._targetZ = null;
    this._timer = 0;
    this._actionPending = false;
    this._onStepAction = null;
    this.speed = 18;
    this._buildOverlay();
  }

  _buildOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'autoplay-overlay';
    this.overlay.className = 'autoplay-overlay hidden';
    this.overlay.innerHTML = `
      <div class="autoplay-screen-glow"></div>
      <div class="autoplay-badge">⚡ 自动通关 — 请看你的角色移动</div>
      <div id="autoplay-status" class="autoplay-status">准备…</div>
      <div class="autoplay-bar-wrap"><div id="autoplay-bar" class="autoplay-bar"></div></div>
      <div class="autoplay-hint">Esc 停止 · N 也可开启</div>
    `;
    document.body.appendChild(this.overlay);
    this.statusEl = this.overlay.querySelector('#autoplay-status');
    this.barEl = this.overlay.querySelector('#autoplay-bar');
  }

  begin(steps, onStepAction) {
    if (this.active) return false;
    this._steps = steps;
    this._stepIndex = 0;
    this._onStepAction = onStepAction;
    this._state = 'advance';
    this._timer = 0;
    this._actionPending = false;
    this._targetX = null;

    this.active = true;
    this.game.autoPlayMode = true;
    document.exitPointerLock?.();

    const p = this.game.player;
    if (p.cameraMode === 'first') p.toggleCameraMode();
    p.currentCameraPos.set(0, 0, 0);
    p.targetYaw = p.yaw;
    p.pitch = 0.38;
    p.targetPitch = 0.38;
    p.mesh.visible = true;
    p.velocity.set(0, 0, 0);

    this.overlay?.classList.remove('hidden');
    this._updateBar();
    this.game.dialog.toast('自动通关开始 — 你的角色将跑图并遭遇全部 Boss · Esc 停止');
    return true;
  }

  stop(completed = false) {
    if (!this.active && !this.game.autoPlayMode) return;
    this.active = false;
    this._state = 'idle';
    this._actionPending = false;
    this.game.player.velocity.set(0, 0, 0);
    this.overlay?.classList.add('hidden');
    this.game.autoPlayMode = false;
    if (this.game.questAssistant) this.game.questAssistant.autoPlayRunning = false;
    this.game.dialog.toast(
      completed ? '🎉 自动通关完成！任务已全部推进' : '已停止自动通关，可继续手动探索'
    );
  }

  _updateBar() {
    if (!this.barEl || !this._steps.length) return;
    this.barEl.style.width = `${Math.min(100, (this._stepIndex / this._steps.length) * 100)}%`;
  }

  _currentStep() {
    return this._steps[this._stepIndex];
  }

  _advanceStep() {
    if (this._stepIndex >= this._steps.length) {
      this.stop(true);
      return;
    }
    const step = this._currentStep();
    if (this.statusEl) {
      this.statusEl.textContent = `${this._stepIndex + 1}/${this._steps.length} · ${step.label}`;
    }
    this._updateBar();
    this.game.dialog.toast(step.label, 1800);

    if (step.x != null) {
      const p = this.game.player;
      const dist = Math.hypot(step.x - p.position.x, step.z - p.position.z);
      if (dist > 3) {
        this._targetX = step.x;
        this._targetZ = step.z;
        this._state = 'walk';
        return;
      }
    }
    this._afterArrive();
  }

  _afterArrive() {
    const step = this._currentStep();
    if (step.action === 'boss' && step.bossId) {
      this._forceBossShow(step);
      this._state = 'bossShow';
      this._timer = 3;
      return;
    }
    this._state = 'act';
    this._runAction();
  }

  _runAction() {
    this._actionPending = true;
    this.game.player.velocity.set(0, 0, 0);
    const step = this._currentStep();
    Promise.resolve(this._onStepAction?.(step))
      .then(() => this.game.quests.syncProgress())
      .catch((err) => {
        console.error('[AutoPlay]', err);
        this.game.dialog.toast(`步骤失败：${step.label}`);
      })
      .finally(() => { this._actionPending = false; });
  }

  _forceBossShow(step) {
    const em = this.game.enemyManager;
    const map = {
      'shadow-warden': [em.boss, em.bossArena],
      archmagus: [em.boss2, em.boss2Arena],
      'singularity-herald': [em.boss3, em.boss3Arena],
      'void-chronarch': [em.voidBoss, em.voidArena],
      'chaos-overlord': [em.chaosBoss, em.chaosArena],
    };
    const pair = map[step.bossId];
    if (!pair) return;
    const [boss, arena] = pair;
    if (!boss || !arena) return;
    boss.alive = true;
    boss.hp = boss.maxHp;
    boss.posture = 0;
    boss.phase = 1;
    boss.setBodyVisible(true);
    boss.updateHpBar?.();
    arena.group.visible = true;
    arena.activated = true;
    this.game.player.targetYaw = Math.atan2(
      boss.position.x - this.game.player.position.x,
      boss.position.z - this.game.player.position.z
    );
    this.game.player.yaw = this.game.player.targetYaw;
    this.game.dialog.toast(`⚔️ Boss 现身：${boss.name}`, 4000);
  }

  update(dt) {
    if (!this.active) return;
    const p = this.game.player;

    if (this._state === 'advance') {
      this._advanceStep();
      return;
    }

    if (this._state === 'walk' && this._targetX != null) {
      const dx = this._targetX - p.position.x;
      const dz = this._targetZ - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 3) {
        p.velocity.set(0, 0, 0);
        this._targetX = null;
        this._afterArrive();
      } else {
        p.velocity.x = (dx / dist) * this.speed;
        p.velocity.z = (dz / dist) * this.speed;
        const yaw = Math.atan2(dx, dz);
        p.targetYaw = yaw;
        p.yaw = yaw;
        p.mesh.rotation.y = p.meshYawFromDirection(dx, dz);
        p.characterModel?.setMovementState(true, dist > 50);
      }
      return;
    }

    if (this._state === 'bossShow') {
      p.velocity.set(0, 0, 0);
      p.characterModel?.setMovementState(false, false);
      this._timer -= dt;
      if (this._timer <= 0) {
        this._state = 'act';
        this._runAction();
      }
      return;
    }

    if (this._state === 'act') {
      if (this._actionPending) return;
      this._stepIndex++;
      if (this._stepIndex >= this._steps.length) {
        this.stop(true);
        return;
      }
      this._state = 'wait';
      this._timer = 0.4;
      return;
    }

    if (this._state === 'wait') {
      p.velocity.x *= 0.75;
      p.velocity.z *= 0.75;
      p.characterModel?.setMovementState(false, false);
      this._timer -= dt;
      if (this._timer <= 0) this._state = 'advance';
    }
  }
}
