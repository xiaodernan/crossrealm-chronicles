import {
  BOSS_PHASE_LINES,
  BOSS_DEFEAT_LINES,
  DUNGEON_BOSS_LINES,
  dungeonIdOf,
} from '../content/bossDialogue.js';
import { addShake } from '../engine/Shake.js';
import { scheduler } from '../engine/Scheduler.js';
import * as THREE from 'three';

/** 横幅计时分组：同一时刻只该有一条 Boss 横幅在走（重复触发先撤旧的） */
const BANNER_TAG = 'boss-phase-banner';
/** 相位特效标签分组：同一时刻只允许一个相位特效在跑 */
const PHASE_FX_TAG = 'boss-phase-fx';

/** Boss 阶段演出 — 横幅 / 台词 / 镜头 / 叙事技能解锁 / 相位特效 */
export class BossPhaseDirector {
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
    const t = this.bannerEl.querySelector('.bp-text');
    const s = this.bannerEl.querySelector('.bp-sub');
    if (t) { t.textContent = text; t.style.color = color; }
    if (s) s.textContent = sub;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.add('show');
    scheduler.clear(BANNER_TAG);
    scheduler.after(duration / 1000, () => {
      this.bannerEl.classList.remove('show');
      scheduler.after(0.4, () => this.bannerEl.classList.add('hidden'), BANNER_TAG);
    }, BANNER_TAG);
  }

  setupListeners() {
    window.addEventListener('boss-phase', (e) => this.onPhase(e.detail));
    window.addEventListener('boss-defeated', (e) => this.onDefeat(e.detail));
    window.addEventListener('boss-start', (e) => this.onStart(e.detail));
  }

  onStart(detail) {
    const bossId = detail.bossId;
    const dungeonId = dungeonIdOf(bossId);
    if (dungeonId) {
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      if (lines?.intro) {
        scheduler.after(0.6, () => this.game.dialog.toast(lines.intro, 4000));
      }
    }
  }

  onPhase(detail) {
    const bossId = detail.bossId ?? detail.name;
    const dungeonId = dungeonIdOf(bossId);
    if (dungeonId) {
      const lines = DUNGEON_BOSS_LINES[dungeonId];
      if (detail.phase === 2 && lines?.p2) {
        this.showBanner('守钥者 · 第二阶段', lines.p2, '#ff8866');
      }
      window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'bossPhase' } }));
      return;
    }

    const cfg = BOSS_PHASE_LINES[bossId]?.[detail.phase];
    if (!cfg) {
      this.game.dialog.toast(`Boss 第 ${detail.phase} 阶段！`);
      return;
    }

    this._playPhaseTransitionFX(cfg.color ?? '#c9a962', cfg.shake ?? 0.12, detail.phase);

    this.showBanner(cfg.banner ?? `阶段 ${detail.phase}`, cfg.toast ?? '', cfg.color ?? '#c9a962');
    if (cfg.toast) this.game.dialog.toast(cfg.toast, 3500);
    window.dispatchEvent(new CustomEvent('game-audio-sfx', { detail: { sfx: 'bossPhase' } }));
    this.game.storyJournal?.addSilent({
      id: `boss-phase-${bossId}-${detail.phase}`,
      category: 'boss',
      title: cfg.banner ?? `Boss 阶段 ${detail.phase}`,
      text: cfg.toast ?? '',
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
        scheduler.after(0.8, () => this.game.dialog.show('守钥者已倒', lines.defeat));
      }
      return;
    }
    const cfg = BOSS_DEFEAT_LINES[bossId];
    if (cfg) {
      scheduler.after(1.0, () => this.game.dialog.show(cfg.title, cfg.text));
    }
    this.game.weaponSkills?.tryNarrativeUnlocks?.(this.game);
  }
}