import {
  BOSS_PHASE_LINES,
  BOSS_DEFEAT_LINES,
  DUNGEON_BOSS_LINES,
  dungeonIdOf,
} from '../content/bossDialogue.js';
import { addShake } from '../engine/Shake.js';
import { FOV_LAYER_PHASE } from '../engine/CameraRig.js';
import { scheduler } from '../engine/Scheduler.js';
import { t } from '../engine/i18n.js';
import * as THREE from 'three';

import { on, offAll } from '../engine/EventBus.js';

const UI_BOSSPHASEDIRECTOR = 'ui/BossPhaseDirector';
const phaseDirOn = (name, handler) => on(name, handler, UI_BOSSPHASEDIRECTOR);
/** 横幅计时分组：同一时刻只该有一条 Boss 横幅在走（重复触发先撤旧的） */
const BANNER_TAG = 'boss-phase-banner';
/** 相位特效标签分组：同一时刻只允许一个相位特效在跑 */
const PHASE_FX_TAG = 'boss-phase-fx';

/**
 * 阶段入场的镜头语言（W-A6 切片12）：转阶段那一帧一记**收拢**的 FOV punch，
 * 随后按半衰期指数回弹。方向与被拽收FOV同号（负 = 画面往里吸）但语义不同 ——
 * 拽是"你被拖向那里"，punch 是"场地变了"；不同层 id（`FOV_LAYER_PHASE`）所以同帧相加不顶账。
 * 与 `_getPhaseShakeIntensity` 同一条纪律：纯表现常数，不进内容表。
 *
 * 为什么不进 rig 加 API：rig 的契约是**按帧申领**（想要就每帧要，不要就别说）——
 * punch 的衰减账由本导演自己持有、自己在 `update(dt)` 里逐帧申领，衰减到位就停止申领，
 * 层自己消失。调用方不需要"记得收尾"，rig 一行不用改。
 */
const FOV_PUNCH = 3.5;
const FOV_PUNCH_HALF_LIFE = 0.12;
/** 衰减到这一格以下就停止申领：rig 的契约明说"不要申领一个 0" */
const FOV_PUNCH_FLOOR = 0.08;

/** Boss 阶段演出 — 横幅 / 台词 / 镜头 / 叙事技能解锁 / 相位特效 */
export class BossPhaseDirector {
  /** 本文件的监听都挂在同一个所有权下，`dispose()` 一次结清（W-A1 迁移第九处） */
  dispose() {
    offAll(UI_BOSSPHASEDIRECTOR);
  }

  constructor(game) {
    this.game = game;
    this.bannerEl = null;
    this.phaseFlashEl = null;
    this.phaseParticleGroup = null;
    this.phaseParticles = null;
    this.phaseParticleVelocities = null;
    this.phaseParticleLifetime = 0;
    this.phaseParticleMaxLifetime = 1.8;
    this.scene = null;
    /** 阶段 punch 的剩余申领量（负数；0 = 没有 punch 在走） */
    this._fovPunch = 0;
    this._phaseParticles = null;
    this._buildBanner();
    this._buildPhaseFlash();
    this._buildPhaseParticles();
    this.setupListeners();
  }

  _buildBanner() {
    this.bannerEl = document.createElement('div');
    this.bannerEl.id = 'boss-phase-banner';
    this.bannerEl.className = 'boss-phase-banner hidden';
    this.bannerEl.innerHTML = '<div class="bp-text"></div><div class="bp-sub"></div>';
    document.body.appendChild(this.bannerEl);
  }

  _buildPhaseFlash() {
    this.phaseFlashEl = document.createElement('div');
    this.phaseFlashEl.id = 'boss-phase-flash';
    this.phaseFlashEl.className = 'boss-phase-flash hidden';
    this.phaseFlashEl.style.cssText = `
      position: fixed; inset: 0; z-index: 60;
      pointer-events: none; opacity: 0;
      background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.5) 0%, transparent 70%);
      transition: opacity 0.1s ease-out;
    `;
    document.body.appendChild(this.phaseFlashEl);
  }

  _buildPhaseParticles() {
    if (typeof THREE === 'undefined') return;
    this.phaseParticleGroup = new THREE.Group();
    this.phaseParticles = null;
    this.phaseParticleVelocities = null;
    this.phaseParticleLifetime = 0;
    this.phaseParticleMaxLifetime = 1.8;
    this.scene = null;
  }

  showBanner(text, sub = '', color = '#c9a962', duration = 2800) {
    if (!this.bannerEl) return;
    const textEl = this.bannerEl.querySelector('.bp-text');
    const subEl = this.bannerEl.querySelector('.bp-sub');
    if (textEl) { textEl.textContent = text; textEl.style.color = color; }
    if (subEl) subEl.textContent = sub;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.add('show');
    scheduler.clear(BANNER_TAG);
    scheduler.after(duration / 1000, () => {
      this.bannerEl.classList.remove('show');
      scheduler.after(0.4, () => this.bannerEl.classList.add('hidden'), BANNER_TAG);
    }, BANNER_TAG);
  }

  setupListeners() {
    phaseDirOn('boss-phase', (e) => this.onPhase(e.detail));
    phaseDirOn('boss-defeated', (e) => this.onDefeat(e.detail));
    phaseDirOn('boss-start', (e) => this.onStart(e.detail));
  }

  onStart(detail) {
    const bossId = detail.bossId;
    const dungeonId = dungeonIdOf(bossId);
    if (dungeonId) {
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      if (lines?.intro) {
        scheduler.after(0.6, () => this.game.dialog.toast(t(lines.intro), 4000));
      }
    }
  }

  onPhase(detail) {
    // 镜头语言（切片12）：世界 Boss 与副本 Boss 的两个分支都吃这一记 ——
    // 派发在 transitionTo 的钩子之后同一 tick，圈（入场招）已经铺下，镜头与场地同一帧表态
    this._cueCameraPunch();
    const bossId = detail.bossId ?? detail.name;
    const dungeonId = dungeonIdOf(bossId);
    if (dungeonId) {
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      // W-E3 切片5：副本守钥者有**三个**阶段（门槛 0.5 / 0.25，与世界 Boss 同一套），
      // 改前这里只认 phase 2 —— 三阶段那一格从来没有台词也没有横幅，
      // 玩家看到血条掉到四分之一却什么也没发生（"写了但没生效"那一族）。
      if (detail.phase === 1 && lines?.p1) {
        this.showBanner(t('boss_dungeon_phase1_banner'), t(lines.p1), '#ff8866');
      } else if (detail.phase === 2 && lines?.p2) {
        this.showBanner(t('boss_dungeon_phase2_banner'), t(lines.p2), '#ff8866');
      } else if (detail.phase === 3 && lines?.p3) {
        this.showBanner(t('boss_dungeon_phase3_banner'), t(lines.p3), '#ff5544');
      }
      window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'bossPhase' } }));
      return;
    }

    const cfg = BOSS_PHASE_LINES[bossId]?.[detail.phase];
    if (!cfg) {
      this.game.dialog.toast(t('boss_phase_fallback_toast', { phase: detail.phase }));
      return;
    }

    this._playPhaseTransitionFX(cfg.color ?? '#c9a962', cfg.shake ?? 0.12, detail.phase);

    // W-D2 切片16u：横幅与台词都是**文案键** —— 展开在演出这一刻
    const 横幅 = t(cfg.banner ?? 'boss_phase_fallback_banner', { phase: detail.phase });
    const 台词 = cfg.toast ? t(cfg.toast) : '';
    this.showBanner(横幅, 台词, cfg.color ?? '#c9a962');
    if (台词) this.game.dialog.toast(台词, 3500);
    window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'bossPhase' } }));
    this.game.storyJournal?.addSilent({
      id: `boss-phase-${bossId}-${detail.phase}`,
      category: 'boss',
      title: 横幅,
      text: 台词,
      chapter: this.game.quests.chapter,
    });
  }

  _playPhaseTransitionFX(color, shakeIntensity, phase = 2) {
    if (this.phaseFlashEl) {
      this.phaseFlashEl.classList.remove('hidden');
      this.phaseFlashEl.style.opacity = '0.6';
      this.phaseFlashEl.style.background = `radial-gradient(circle at 50% 50%, ${color} 0%, transparent 70%)`;
      scheduler.clear(PHASE_FX_TAG);
      scheduler.after(0, () => {
        this.phaseFlashEl.style.opacity = '0';
        scheduler.after(0.12, () => this.phaseFlashEl.classList.add('hidden'), PHASE_FX_TAG);
      }, PHASE_FX_TAG);
    }

    if (this.game?.enemyManager?.boss) {
      this._spawnPhaseParticles(this.game.enemyManager.boss, this.game.enemyManager.boss.bossId);
    }

    const phaseShake = this._getPhaseShakeIntensity(phase);
    if (phaseShake > 0) addShake(phaseShake);

    window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'bossPhase' } }));
  }

  _getPhaseShakeIntensity(phase = 2) {
    const phaseMultipliers = { 1: 0.5, 2: 1.0, 3: 1.5 };
    return 0.12 * (phaseMultipliers[phase] ?? 1.0);
  }

  _spawnPhaseParticles(boss, bossId) {
    if (!this.scene || typeof THREE === 'undefined') return;

    const pos = new Float32Array(180 * 3);
    const vel = new Float32Array(180 * 3);
    const colors = new Float32Array(180 * 3);
    const sizes = new Float32Array(180);

    const baseColor = new THREE.Color(this._getBossColor(bossId));
    for (let i = 0; i < 180; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2;
      pos[i * 3 + 1] = Math.random() * 1.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2;

      vel[i * 3] = (Math.random() - 0.5) * 10;
      vel[i * 3 + 1] = 3 + Math.random() * 8;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 10;

      const c = baseColor.clone().multiplyScalar(0.6 + Math.random() * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = 0.2 + Math.random() * 0.25;
    }

    const particlesGeo = new THREE.BufferGeometry();
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    particlesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particlesGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particlesGeo, mat);
    this.phaseParticleGroup.add(particles);

    this._phaseParticles = { particles, velocities: vel, lifetime: 0, maxLifetime: 1.5 };
  }

  update(dt) {
    this._updatePhaseParticles(dt);
    this._stepPhaseFov(dt);
  }

  /** 转阶段的那一记 punch：重复转档重打满（同一层 id，后写的赢是 rig 的既定行为） */
  _cueCameraPunch() {
    this._fovPunch = -FOV_PUNCH;
  }

  /**
   * punch 的按帧申领与衰减：先以当前余量申领本帧，再为下一帧衰减；
   * 跌破地板就清账 —— 下一帧不再申领，层自己从 rig 上消失，没人需要"记得恢复"。
   * rig 不在场（用例 / 无相机场景）走可选链，这一层安静降级。
   */
  _stepPhaseFov(dt) {
    if (!this._fovPunch) return;
    this.game?.player?.rig?.requestFov(FOV_LAYER_PHASE, this._fovPunch);
    const next = this._fovPunch * Math.pow(2, -dt / FOV_PUNCH_HALF_LIFE);
    this._fovPunch = Math.abs(next) >= FOV_PUNCH_FLOOR ? next : 0;
  }

  _updatePhaseParticles(dt) {
    if (!this._phaseParticles || !this._phaseParticles.particles) return;

    this._phaseParticles.lifetime += dt;
    if (this._phaseParticles.lifetime > 1.5) {
      this._destroyPhaseParticles();
      return;
    }

    const pos = this._phaseParticles.particles.geometry.attributes.position.array;

    for (let i = 0; i < 180; i++) {
      pos[i * 3] += this._phaseParticles.velocities[i * 3] * dt;
      pos[i * 3 + 1] += this._phaseParticles.velocities[i * 3 + 1] * dt;
      pos[i * 3 + 2] += this._phaseParticles.velocities[i * 3 + 2] * dt;

      this._phaseParticles.velocities[i * 3 + 1] -= 9.8 * dt;
      this._phaseParticles.velocities[i * 3] *= 0.98;
      this._phaseParticles.velocities[i * 3 + 1] *= 0.98;
      this._phaseParticles.velocities[i * 3 + 2] *= 0.98;
    }

    this._phaseParticles.particles.material.opacity = 0.9 * (1 - this._phaseParticles.lifetime / 1.5);
    this._phaseParticles.particles.geometry.attributes.position.needsUpdate = true;
  }

  _destroyPhaseParticles() {
    if (this._phaseParticles && this._phaseParticles.particles) {
      this.phaseParticleGroup.remove(this._phaseParticles.particles);
      this._phaseParticles.particles.geometry.dispose();
      this._phaseParticles.particles.material.dispose();
      this._phaseParticles = null;
    }
  }

  _getBossColor(bossId) {
    const colors = {
      'shadow-warden': 0x8844ff,
      archmagus: 0xaa66ff,
      'singularity-herald': 0x4488ff,
      'void-chronarch': 0xc9a962,
      'chaos-overlord': 0xff2244,
    };
    return new THREE.Color(colors[bossId] ?? 0xff4444);
  }

  onDefeat(detail) {
    const bossId = detail.bossId;
    const dungeonId = dungeonIdOf(bossId);
    if (dungeonId) {
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      if (lines?.defeat) {
        scheduler.after(0.8, () => this.game.dialog.show(t('boss_dungeon_defeat_banner'), t(lines.defeat)));
      }
      return;
    }
    const cfg = BOSS_DEFEAT_LINES[bossId];
    if (cfg) {
      scheduler.after(1.0, () => this.game.dialog.show(t(cfg.title), t(cfg.text)));
    }
    this.game.weaponSkills?.tryNarrativeUnlocks?.(this.game);
  }
}