import * as THREE from 'three';
import { codeFor } from '../content/keybinds.js';
import { SPELL_BANDS } from './MoveTable.js';
import { pickPart } from './Hurtbox.js';
import { hitDirection, hitKindOf, hitSuffix, isGuarded, resolveHit } from './Resolution.js';
import { GUARD, HIT } from '../content/tuning.js';
import { addShake } from '../engine/Shake.js';
import { Observable } from '../engine/Observable.js';

/** 黑神话式法术：真火 / 玄冰 / 引力 / 大圣化身 + 蓄力派生 */
export const SPELLS = {
  1: { id: 'fire', name: '真火咒', cost: 16, cooldown: 0.4, damage: 38, posture: 8, color: 0xff5522, type: 'bolt', chargeDamage: 72, chargePosture: 18, chargeCost: 28 },
  2: { id: 'ice', name: '玄冰刺', cost: 12, cooldown: 0.35, damage: 30, posture: 8, color: 0x66ccff, type: 'bolt', chargeDamage: 58, chargePosture: 18, chargeCost: 22 },
  3: { id: 'gravity', name: '引力坍缩', cost: 28, cooldown: 2.5, damage: 45, posture: 25, color: 0x8844ff, type: 'aoe', radius: 5.5, chargeRadius: 9, chargeDamage: 78, chargePosture: 35, chargeCost: 40 },
  4: { id: 'transform', name: '大圣化身', cost: 45, cooldown: 18, duration: 10, type: 'buff', damageMult: 1.65, speedMult: 1.3 },
};

const CHARGE_TIME = 0.55;
/** 弹体方向复用的临时向量 */
const _dir = new THREE.Vector3();
/** 命中方向复用体（击退与火花共用，避免每次命中新建对象） */
const _hd = { x: 0, z: 0 };

export class SpellSystem {
  constructor(scene, player, enemies, projectiles, damageNumbers, audio, stats) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;
    this.projectiles = projectiles;
    this.damageNumbers = damageNumbers;
    /** 命中特效由 Game 注入（与 CombatController 同一所有者），未注入时静默跳过 */
    this.feedback = null;
    this.audio = audio;
    this.stats = stats;

    this.mana = 100;
    this.maxMana = 100;
    this.cooldowns = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this.transformTimer = 0;
    this.chargeSlot = null;
    this.chargeTime = 0;
    this.keyWasDown = { 1: false, 2: false, 3: false, 4: false };
    /* 法力观测量（B41）：法力随时间连续回复，量化 1 点，
     * 把"每帧一条事件"压成"每积够 1 点才通知一次"。 */
    this.vitals = {
      mana: new Observable(this.mana, { quantize: 1 }),
      charging: new Observable(false),
      chargePct: new Observable(0, { quantize: 0.02 }),
      transform: new Observable(0, { quantize: 0.1 }),
    };
    this.weaponSpellMult = 1;
    /** 暴击随机源；单测注入确定值，正式局用 Math.random */
    this.rng = Math.random;
    /** 弹体与领域效果由主循环 dt 驱动（原为自建 rAF + 固定 0.016 步长，B9） */
    this._bolts = [];
    this._aoes = [];
    this.vfxGroup = new THREE.Group();
    scene.add(this.vfxGroup);
    this.syncMana();
  }

  /** 存活法系效果数（弹体 + 领域），供性能 HUD 监控泄漏 */
  count() {
    return this._bolts.length + this._aoes.length;
  }

  syncMana() {
    this.maxMana = 80 + (this.stats?.arcane ?? 1) * 12 + (this.stats?.mind ?? 0) * 10 + (this.bonusMana ?? 0);
    this.mana = Math.min(this.mana, this.maxMana);
  }

  get damageMult() {
    let m = this.stats?.skillMult ?? 1;
    if (this.transformTimer > 0) m *= SPELLS[4].damageMult;
    m *= this.weaponSpellMult ?? 1;
    return m;
  }

  get speedMult() {
    return this.transformTimer > 0 ? SPELLS[4].speedMult : 1;
  }

  cast(slot, charged = false) {
    const spell = SPELLS[slot];
    if (!spell || this.cooldowns[slot] > 0) return false;
    if (this.player.combat?.isBusy()) return false;

    const cost = charged ? (spell.chargeCost ?? spell.cost * 1.5) : spell.cost;
    if (this.mana < cost) return false;

    this.mana -= cost;
    this.cooldowns[slot] = spell.cooldown * (charged ? 1.3 : 1);
    this.emitMana();

    if (spell.type === 'bolt') this.castBolt(spell, charged);
    else if (spell.type === 'aoe') this.castGravity(spell, charged);
    else if (spell.type === 'buff') this.castTransform(spell);

    // W-B6 切片3：蓄力施法计入 charge 使用
    if (charged) this.game?.stats?.addSkillUse('charge');

    window.dispatchEvent(new CustomEvent('spell-cast', {
      detail: { id: spell.id, name: spell.name, charged },
    }));
    this.audio?.spellCast?.();
    return true;
  }

  castBolt(spell, charged) {
    // 弹道朝向走玩家的接口，不再自己用 yaw 拼方向：
    // 旧实现写的是 (-sin yaw, -cos yaw)，与 getForwardXZ() 正好相反，法术会往身后飞
    const aim = this.player.getCombatForwardXZ();
    const origin = this.player.position.clone();
    origin.y += 1.4;
    const range = charged ? 28 : 20;
    const target = origin.clone().add(new THREE.Vector3(aim.x * range, 0, aim.z * range));
    const size = charged ? 0.85 : 0.4;
    const dmgBase = charged ? spell.chargeDamage * (1 + (this.chargeBonus ?? 0)) : spell.damage;

    const geometry = new THREE.SphereGeometry(size, charged ? 12 : 8, charged ? 12 : 8);
    const material = new THREE.MeshBasicMaterial({ color: spell.color, transparent: true, opacity: 0.9 });
    const orb = new THREE.Mesh(geometry, material);
    orb.position.copy(origin);
    this.vfxGroup.add(orb);

    this._bolts.push({
      mesh: orb,
      geometry,
      material,
      target,
      baseY: origin.y,
      casterY: this.player.position.y,
      age: 0,
      life: charged ? 1.5 : 1.2,
      speed: charged ? 34 : 28,
      hitRadius: charged ? 3 : 2,
      damage: Math.round(dmgBase * this.damageMult),
      posture: charged ? spell.chargePosture : spell.posture,
      element: spell.id,
      tint: spell.color,
      color: `#${spell.color.toString(16).padStart(6, '0')}`,
      charged,
    });
  }

  /**
   * 命中统一走 Resolution：法术与近战共用同一套部位/防御/抗性/暴击公式，
   * 也共用同一份"往哪退、往哪溅"（`from` 默认是施法者，领域类传自己的圆心）。
   *
   * `knock` 是有符号的击退倍率：正数推开、负数吸向 `from`（引力坍缩就该往里拽）。
   */
  _applyHit(target, {
    base, posture, element, casterY, band, color, tint = 0xff8844,
    suffix = '', from = null, knock = 1, heavy = false,
  }) {
    const part = pickPart(target, casterY, band);
    if (!part) return;
    const origin = from ?? this.player.position;
    const hit = resolveHit({
      base, posture, target, part, element, rng: this.rng,
      guard: isGuarded(target, origin),
    });
    target.takeDamage(hit.damage, hit.posture);
    const dir = hitDirection(origin, target.position, _hd);
    if (!hit.blocked) {
      target.applyKnockback(dir.x * knock, dir.z * knock, HIT.speed * (hit.crit ? HIT.critScale : 1));
    }
    // 被吸进去的一击，火花也该往圆心喷 —— 方向要跟位移一致，不能各说一套
    if (knock < 0) { dir.x = -dir.x; dir.z = -dir.z; }
    this.damageNumbers?.spawn(
      target.position,
      `${hit.damage}${suffix}${hitSuffix(hit)}`,
      hit.crit ? '#ff5566' : color,
      hitKindOf(hit), // 种类判据同 CombatController：同一个 hitKindOf（W-D6 切片12）
    );
    this.feedback?.impact(target.position, hit.blocked ? GUARD.spark : tint, heavy ? 1.3 : 1, dir);
  }

  _updateBolts(dt) {
    for (let i = this._bolts.length - 1; i >= 0; i--) {
      const b = this._bolts[i];
      b.life -= dt;
      if (b.life <= 0) { this._recycleBolt(i); continue; }
      b.age += dt;
      _dir.subVectors(b.target, b.mesh.position);
      _dir.y = 0;
      if (_dir.length() > 0.5) {
        _dir.normalize();
        b.mesh.position.addScaledVector(_dir, b.speed * dt);
      }
      b.mesh.position.y = b.baseY + Math.sin(b.age * 12) * 0.2;

      for (const e of this.enemies.getAliveEnemies()) {
        if (e.distanceTo(b.mesh.position) >= b.hitRadius) continue;
        this._applyHit(e, {
          base: b.damage, posture: b.posture, element: b.element,
          casterY: b.casterY, band: SPELL_BANDS.bolt, color: b.color,
          tint: b.tint, heavy: b.charged,
          suffix: b.charged ? '!' : '',
        });
        this.audio?.hit();
        if (b.charged) addShake(0.1);
        this._recycleBolt(i);
        break;
      }
    }
  }

  _recycleBolt(i) {
    const b = this._bolts[i];
    this._bolts.splice(i, 1);
    this.vfxGroup.remove(b.mesh);
    b.geometry.dispose();
    b.material.dispose();
  }

  castGravity(spell, charged) {
    const pos = this.player.position.clone();
    const dmgBase = charged ? spell.chargeDamage * (1 + (this.chargeBonus ?? 0)) : spell.damage;
    const radius = charged ? spell.chargeRadius : spell.radius;
    const geometry = new THREE.RingGeometry(0.5, radius, 32);
    const material = new THREE.MeshBasicMaterial({ color: spell.color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, pos.y + 0.2, pos.z);
    this.vfxGroup.add(ring);

    this._aoes.push({
      mesh: ring,
      geometry,
      material,
      center: pos,
      casterY: pos.y,
      radius,
      t: 0,
      duration: charged ? 0.65 : 0.5,
      growth: charged ? 1.5 : 2,
      damage: Math.round(dmgBase * this.damageMult),
      posture: charged ? spell.chargePosture : spell.posture,
      element: spell.id,
      tint: spell.color,
      charged,
    });
  }

  _updateAoes(dt) {
    for (let i = this._aoes.length - 1; i >= 0; i--) {
      const a = this._aoes[i];
      a.t += dt;
      const s = 1 + a.t * a.growth;
      a.mesh.scale.set(s, s, 1);
      a.mesh.material.opacity = Math.max(0, 0.6 - a.t * 0.4);
      if (a.t < a.duration) continue;

      for (const e of this.enemies.getAliveEnemies()) {
        if (e.distanceTo(a.center) >= a.radius) continue;
        this._applyHit(e, {
          base: a.damage, posture: a.posture, element: a.element,
          casterY: a.casterY, band: SPELL_BANDS.aoe, color: '#8844ff',
          tint: a.tint, from: a.center, heavy: a.charged,
          // 引力坍缩是把场内的敌人吸向圆心，方向取负；火与冰仍然推开
          knock: (a.element === 'gravity' ? -1 : 1) * (a.charged ? 1.6 : 1),
        });
      }
      this.audio?.heavyHit();
      addShake(a.charged ? 0.35 : 0.2);
      this._recycleAoe(i);
    }
  }

  _recycleAoe(i) {
    const a = this._aoes[i];
    this._aoes.splice(i, 1);
    this.vfxGroup.remove(a.mesh);
    a.geometry.dispose();
    a.material.dispose();
  }

  castTransform(spell) {
    this.transformTimer = spell.duration + (this.transformBonus ?? 0);
    window.dispatchEvent(new CustomEvent('transform-start', { detail: { duration: spell.duration } }));
    window.dispatchEvent(new CustomEvent('spell-toast', { detail: { message: '大圣化身 — 伤害与移速大幅提升' } }));
  }

  emitMana() {
    // 只推"确实变了"的量（B41）；订阅者拿到的仍是精确值，量化只影响要不要通知
    this.vitals.mana.set(this.mana);
    this.vitals.charging.set(!!this.chargeSlot);
    this.vitals.chargePct.set(this.chargeSlot ? Math.min(1, this.chargeTime / CHARGE_TIME) : 0);
    this.vitals.transform.set(Math.max(0, this.transformTimer));
  }

  update(dt, keys) {
    this._updateBolts(dt);
    this._updateAoes(dt);
    this.syncMana();
    for (const k of [1, 2, 3, 4]) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }

    for (const k of [1, 2, 3]) {
      const down = keys[codeFor(`spell${k}`)];
      if (down && !this.keyWasDown[k]) {
        this.chargeSlot = k;
        this.chargeTime = 0;
      }
      if (down && this.chargeSlot === k) {
        this.chargeTime += dt;
        this.emitMana();
      }
      if (!down && this.keyWasDown[k] && this.chargeSlot === k) {
        const charged = this.chargeTime >= CHARGE_TIME;
        this.cast(k, charged);
        this.chargeSlot = null;
        this.chargeTime = 0;
      }
      this.keyWasDown[k] = down;
    }

    if (keys[codeFor('spell4')] && !this.keyWasDown[4]) {
      this.cast(4, false);
      keys[codeFor('spell4')] = false;
    }
    this.keyWasDown[4] = keys[codeFor('spell4')];

    if (this.transformTimer > 0) {
      this.transformTimer -= dt;
      if (this.transformTimer <= 0) window.dispatchEvent(new CustomEvent('transform-end'));
    }

    if (this.mana < this.maxMana) {
      this.mana = Math.min(this.maxMana, this.mana + dt * 8);
    }
    this.emitMana();
  }
}
