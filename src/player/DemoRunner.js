import * as THREE from 'three';
import { refreshKeyText } from '../content/keyHints.js';

/** 演示行者 — 金色小人，自动跑完全流程，镜头跟随观看（由 update 驱动，不依赖 async 等待） */
export class DemoRunner {
  constructor(scene, world, game) {
    this.scene = scene;
    this.world = world;
    this.game = game;
    this.active = false;
    this.position = new THREE.Vector3(0, 0, 55);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI;
    this.speed = 14;
    this.walkPhase = 0;
    this._steps = [];
    this._stepIndex = 0;
    this._state = 'idle';
    this._targetX = null;
    this._targetZ = null;
    this._delayTimer = 0;
    this._actionPending = false;
    this._onStepAction = null;
    this._followLight = null;
    this.mesh = this._buildMesh();
    this.mesh.visible = false;
    scene.add(this.mesh);
    this._buildOverlay();
  }

  _buildMesh() {
    const g = new THREE.Group();
    g.name = 'DemoRunner';
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffcc44,
      emissive: 0xaa6600,
      emissiveIntensity: 0.55,
      roughness: 0.4,
      metalness: 0.25,
    });
    const capeMat = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x224488,
      emissiveIntensity: 0.5,
      roughness: 0.5,
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.65, 6, 10), bodyMat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), bodyMat);
    head.position.y = 1.75;
    head.castShadow = true;
    g.add(head);
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.0), capeMat);
    cape.position.set(0, 1.15, 0.25);
    cape.rotation.x = 0.2;
    g.add(cape);
    const trail = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.65, 16),
      new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.y = 0.08;
    trail.name = 'trail';
    g.add(trail);
    g.scale.setScalar(1.15);
    return g;
  }

  _buildOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'spectator-overlay';
    this.overlay.className = 'spectator-overlay hidden';
    this.overlay.innerHTML = `
      <div class="spectator-badge">🎬 观看小人通关</div>
      <div id="spectator-status" class="spectator-status">准备中…</div>
      <div class="spectator-hint" data-ktext="{escape} 退出观看 · 镜头自动跟随，无需转鼠标"></div>
    `;
    document.body.appendChild(this.overlay);
    // 这块遮罩是**开始观看那一刻**才进 DOM 的，赶在 `HUD.refreshKeyHints()` 之后 ——
    // 所以写入这一刻自己展开一次；改绑那一条路仍然由整份 document 的扫描负责。
    refreshKeyText(this.overlay);
    this.statusEl = this.overlay.querySelector('#spectator-status');
  }

  beginWatch(steps, onStepAction) {
    if (this.active) return false;
    this._steps = steps;
    this._stepIndex = 0;
    this._onStepAction = onStepAction;
    this._state = 'step';
    this._delayTimer = 0;
    this._actionPending = false;
    this._targetX = null;
    this._targetZ = null;
    this.velocity.set(0, 0, 0);

    this.position.copy(this.game.player.position);
    const gy = this.world.getGroundHeight(this.position.x, this.position.z);
    this.position.y = this._isVoid(this.position.x, this.position.z) ? gy + 9 : gy;

    this.active = true;
    this.game.spectatorMode = true;
    this.game.player.mesh.visible = false;
    if (this.game.player.fpWeaponGroup) this.game.player.fpWeaponGroup.visible = false;
    document.exitPointerLock?.();
    this.overlay?.classList.remove('hidden');
    this.mesh.visible = true;
    this.mesh.position.copy(this.position);
    this.game.spectatorCamera.reset();
    this.game.player.currentCameraPos.set(0, 0, 0);

    if (!this._followLight) {
      this._followLight = new THREE.PointLight(0xffcc66, 2.2, 18);
      this.scene.add(this._followLight);
    }
    this._followLight.visible = true;

    this.game.dialog.toast('观看模式已开始 — 金色小人将跑完全流程 · {escape} 退出');
    return true;
  }

  stop(completed = false) {
    if (!this.active && !this.game.spectatorMode) return;
    this.active = false;
    this._state = 'idle';
    this._actionPending = false;
    this._targetX = null;
    this.velocity.set(0, 0, 0);
    this.mesh.visible = false;
    if (this._followLight) this._followLight.visible = false;
    this.overlay?.classList.add('hidden');
    this.game.spectatorMode = false;
    this.game.player.mesh.visible = true;
    if (this.game.player.cameraMode === 'first' && this.game.player.fpWeaponGroup) {
      this.game.player.fpWeaponGroup.visible = true;
    }
    if (this.game.questAssistant) this.game.questAssistant.demoRunning = false;
    this.game.dialog.toast(completed ? '小人已跑完全流程通关！按 {questTracker} 可自己继续探索' : '已退出观看模式');
  }

  _beginStep() {
    if (this._stepIndex >= this._steps.length) {
      this.stop(true);
      return;
    }
    const step = this._steps[this._stepIndex];
    if (this.statusEl) {
      this.statusEl.textContent = `${this._stepIndex + 1}/${this._steps.length} · ${step.label}`;
    }
    if (step.x != null) {
      const dx = step.x - this.position.x;
      const dz = step.z - this.position.z;
      if (Math.sqrt(dx * dx + dz * dz) < 2.5) {
        this._startAction();
      } else {
        this._targetX = step.x;
        this._targetZ = step.z;
        this._state = 'walking';
      }
    } else {
      this._startAction();
    }
  }

  _startAction() {
    this._state = 'acting';
    this._actionPending = true;
    Promise.resolve(this._onStepAction?.(this._steps[this._stepIndex]))
      .then(() => {
        this.game.quests.syncProgress();
      })
      .catch((err) => {
        console.error('[DemoRunner]', err);
        this.game.dialog.toast(`演示步骤出错：${this._steps[this._stepIndex]?.label ?? ''}`);
      })
      .finally(() => {
        this._actionPending = false;
      });
  }

  update(dt) {
    if (!this.active) return;

    const gy = this.world.getGroundHeight(this.position.x, this.position.z);
    const voidZone = this._isVoid(this.position.x, this.position.z);
    this.position.y = voidZone ? gy + 9 : gy;

    if (this._state === 'walking' && this._targetX != null) {
      const dx = this._targetX - this.position.x;
      const dz = this._targetZ - this.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 2.5) {
        this.velocity.set(0, 0, 0);
        this._targetX = null;
        this._startAction();
      } else {
        this.velocity.x = (dx / dist) * this.speed;
        this.velocity.z = (dz / dist) * this.speed;
        this.yaw = Math.atan2(dx, dz);
      }
    }

    if (this._state === 'acting' && !this._actionPending) {
      this._stepIndex++;
      if (this._stepIndex >= this._steps.length) {
        this.stop(true);
        return;
      }
      this._delayTimer = 0.35;
      this._state = 'delay';
    }

    if (this._state === 'delay') {
      this._delayTimer -= dt;
      if (this._delayTimer <= 0) {
        this._state = 'step';
        this._beginStep();
      }
    }

    if (this._state === 'step') {
      this._beginStep();
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.walkPhase += dt * 10;

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    if (this.velocity.lengthSq() > 0.5) {
      this.mesh.position.y += Math.sin(this.walkPhase) * 0.07;
    }
    const trail = this.mesh.getObjectByName('trail');
    if (trail) trail.rotation.z += dt * 2.5;

    if (this._followLight) {
      this._followLight.position.set(this.position.x, this.position.y + 2.2, this.position.z);
    }

    this.game.player.position.copy(this.position);
    this.game.player.velocity.copy(this.velocity);
    this.game.player.yaw = this.yaw;
    this.game.player.targetYaw = this.yaw;

    this.game.spectatorCamera.update(dt, this.position, this.velocity.x, this.velocity.z);
  }

  _isVoid(x, z) {
    return Math.sqrt(x * x + (z - 220) * (z - 220)) < 140;
  }
}
