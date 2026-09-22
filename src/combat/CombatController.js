import * as THREE from 'three';
import { MOVES, LOCKED_CONE } from './MoveTable.js';
import { hitDirection, hitSuffix, isBehind, isGuarded, resolveHit } from './Resolution.js';
import { createHurtbox, pickPart } from './Hurtbox.js';
import { COMBO, GUARD, HIT, PLAYER_DEFENSE, PLAYER_MOVES, STAMINA_REGEN } from '../content/tuning.js';
import { addShake } from '../engine/Shake.js';
import { Observable } from '../engine/Observable.js';

const COMBO_WINDOW = 0.55;
/** 判定循环复用的临时向量，避免每次出手为每个目标新建对象 */
const _toEnemy = new THREE.Vector3();
/** 命中方向复用体：火花、击退、震屏共用同一句"往哪打的" */
const _hitDir = { x: 0, z: 0 };

export class CombatController {
  constructor(player, enemyManager, dialog, damageNumbers, audio, stats) {
    this.player = player;
    this.enemies = enemyManager;
    this.dialog = dialog;
    this.damageNumbers = damageNumbers;
    this.audio = audio;
    this.stats = stats;

    this.hp = 100;
    this.maxHp = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.damageMult = 1;
    this.skillMult = 1;

    /* 战斗观测量（B41）：以前每帧派发一条 'stamina-changed' CustomEvent，
     * 60fps 下每秒 60 条、内容却常常与上一帧完全相同。改为"变化才通知"。
     * 量化 0.5：精力随时间连续回复，不量化的话"每帧都是新值"，退化成原来那样。 */
    this.vitals = {
      stamina: new Observable(this.stamina, { quantize: 0.5 }),
      combo: new Observable(0),
      hp: new Observable(this.hp, { quantize: 1 }),
      parryable: new Observable(false),
    };

    this.lockTarget = null;
    this.lockRange = 26;
    this.state = 'idle';
    this.stateTimer = 0;
    this.invincible = false;
    this.invincibleTimer = 0;
    this.attackHitDone = false;
    this.mouseDown = { left: false, right: false };
    /** 本次出手的定格判定参数，null 表示当前无待判定攻击 */
    this._strike = null;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.riposteWindow = 0;
    this.parryCooldown = 0;
    this.skillCooldown = 0;
    this.skillMods = {};
    this.feedback = null;
    this._finisherCd = 0;

    this.lightDamage = PLAYER_MOVES.light.damage;
    this.heavyDamage = PLAYER_MOVES.heavy.damage;
    this.lightPosture = PLAYER_MOVES.light.posture;
    this.heavyPosture = PLAYER_MOVES.heavy.posture;
    this.lightStamina = PLAYER_MOVES.light.stamina;
    this.heavyStamina = PLAYER_MOVES.heavy.stamina;
    this.rollStamina = PLAYER_MOVES.roll.stamina;
    this.rollCooldown = PLAYER_MOVES.roll.cooldown;
    this.rollCooldownTimer = 0;
    this.parryStamina = PLAYER_MOVES.parry.stamina;
    this.skillStamina = PLAYER_MOVES.skill.stamina;
    /** 受击方只读量：玩家与敌人走同一条结算，防御/抗性来源集中在调参表 */
    this.defense = PLAYER_DEFENSE;
    this.resist = {};
    /** 玩家也是"有部位的目标"：敌人那一刀的竖直判定要有东西可撞，否则跳跃与高台毫无意义 */
    this.hurtbox = createHurtbox('player');
    /** 暴击随机源；单测注入确定值，正式局用 Math.random */
    this.rng = Math.random;

    this.slashGroup = new THREE.Group();
    player.scene.add(this.slashGroup);
    /** 主循环时间源与临时特效的生命周期（M2：禁用 setTimeout） */
    this.time = null;
    this._timed = [];
    stats?.applyToCombat(this);
  }

  /** 由 Game 注入；hitstop 需要作用于全局时间而非仅战斗计时器 */
  setTimeController(time) {
    this.time = time;
  }

  /** 登记一个按 dt 倒计时的清理动作（附带 GPU 资源释放） */
  schedule(seconds, action, ...resources) {
    this._timed.push({ left: seconds, action, resources });
  }

  _updateTimed(dt) {
    for (let i = this._timed.length - 1; i >= 0; i--) {
      const t = this._timed[i];
      t.left -= dt;
      if (t.left > 0) continue;
      this._timed.splice(i, 1);
      t.action?.();
      for (const r of t.resources) r?.dispose?.();
    }
  }

  /** 命中停顿：走全局时间缩放，敌人与特效同步减速 */
  requestHitstop(seconds) {
    this.time?.hitstop?.(seconds, 0.12);
  }

  toggleLock() {
    const forward = this.player.getCombatForwardXZ();
    if (this.lockTarget?.alive) {
      const candidates = this.enemies.getLockCandidates(this.player.position, forward, this.lockRange);
      if (candidates.length <= 1) { this.clearLock(); return; }
      const idx = candidates.indexOf(this.lockTarget);
      const next = candidates[(idx + 1) % candidates.length];
      this.lockTarget = next;
      this.enemies.setLockTarget(next);
      this.dialog.toast(`切换锁定：${next.name}`);
      return;
    }
    const target = this.enemies.getBestLockTarget(this.player.position, forward, this.lockRange);
    if (target) {
      this.lockTarget = target;
      this.enemies.setLockTarget(target);
      this.dialog.toast(`锁定：${target.name}（Q 切换）`);
    } else {
      this.dialog.toast('附近没有可锁定目标');
    }
  }

  clearLock() {
    this.lockTarget = null;
    this.enemies.setLockTarget(null);
  }

  /** 无敌帧/翻滚中：外部只通过这个接口问，不读 invincible 字段 */
  isInvulnerable() {
    return this.invincible || this.state === 'roll';
  }

  /** 受击方接口（与 Enemy 同一份契约，供 Resolution 只读调用） */
  getDefense() {
    return this.defense;
  }

  getResist(element) {
    return this.resist?.[element] ?? 0;
  }

  /** 受击盒的世界基准：玩家网格原点就是脚底 */
  hurtBaseY() {
    return this.player.position.y;
  }

  facingYaw() {
    return this.player.yaw;
  }

  /** 玩家没有架势条，因此永不存在"破防后额外吃架势"的状态 */
  isStaggered() {
    return false;
  }

  /**
   * 受击方接口（与 Enemy 同一份契约，供 Resolution 只读调用）。
   * `part` 是敌人那一刀撞到的玩家分段：同一记横扫扫在腿上和砸在头上不是一个数。
   */
  takeDamage(amount, element = null, part = null) {
    if (this.isInvulnerable()) return;
    const hit = resolveHit({ base: amount, target: this, element, part, side: 'enemy', rng: this.rng });
    this.hp = Math.max(0, this.hp - hit.damage);
    this.player.characterModel?.playHit?.();
    this.audio?.playerHurt?.();
    this.damageNumbers?.spawn(this.player.position, `-${hit.damage}${hitSuffix(hit)}`, hit.crit ? '#ff5566' : '#ff4444');
    this.audio?.hit?.();
    this.vitals.hp.set(this.hp);
    window.dispatchEvent(new CustomEvent('player-damaged', { detail: { hp: this.hp, maxHp: this.maxHp } }));
    // 挨一下晃多少按"这一刀占我多少血"给：小兵蹭皮不该和 Boss 砸脸同样天旋地转
    addShake(Math.min(0.2, 0.03 + (hit.damage / this.maxHp) * 0.7) * (hit.crit ? HIT.critScale : 1));
    if (this.hp <= 0) this.respawn();
  }

  respawn() {
    this.stats?.applyToCombat(this);
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.player.teleport(0, 2, 55);
    this.clearLock();
    this.state = 'idle';
    this.stateTimer = 0;
    this._strike = null;
    this.comboCount = 0;
    this.dialog.toast('穿越者倒下了…在世界之锚处重生');
    window.dispatchEvent(new CustomEvent('player-respawn', { detail: {} }));
    this.publishVitals();
  }

  /**
   * 把当前血量/精力同步给观测量与 UI。
   * 「回血」用 `set` 而不是 `emit`：数值确实变了就该通知；
   * 数值没变（满血再吃补给）时 `set` 自动静默，正是我们想要的。
   */
  publishVitals() {
    this.vitals.hp.set(this.hp);
    this.vitals.stamina.set(this.stamina);
  }

  /** 外部补给/休息恢复走接口，避免其他系统直接改写战斗内部字段 */
  restore({ hp = 0, stamina = 0 } = {}) {
    this.hp = Math.min(this.maxHp, this.hp + hp);
    this.stamina = Math.min(this.maxStamina, this.stamina + stamina);
    this.publishVitals();
    window.dispatchEvent(new CustomEvent('player-healed', { detail: { hp: this.hp, maxHp: this.maxHp } }));
  }

  restHeal() {
    this.stats?.applyToCombat(this);
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.publishVitals();
    window.dispatchEvent(new CustomEvent('player-healed', { detail: { hp: this.hp, maxHp: this.maxHp } }));
  }

  getComboMultiplier() {
    const steps = Math.min(this.comboCount, COMBO.maxSteps);
    return 1 + steps * (COMBO.step + (this.skillMods?.combo ?? 0) * COMBO.skillStep);
  }

  /** 出手瞬间按帧表登记本次判定：判定只在跨过 move.at 的那一帧执行一次，
   *  窗口内后到的敌人不再被补判（B5），战技与终结技也不再于释放当帧结算（B6）。 */
  _setStrike(move, { dmg, posture, color, tint, range = move.range, band = move.band, element = null, suffix = '' }) {
    this.attackHitDone = false;
    this._strike = {
      at: move.at, range, cone: move.cone, heavy: move.heavy,
      omni: move.cone <= -1, band, element, dmg, posture, color, tint, suffix,
    };
  }

  tryLightAttack() {
    if ((this.state !== 'idle' && this.state !== 'combo') || this.stamina < this.lightStamina) return false;
    this.stamina -= this.lightStamina;
    this.state = 'light';
    this.stateTimer = 0;
    this.comboCount = this.comboTimer > 0 ? this.comboCount + 1 : 1;
    this.comboTimer = COMBO_WINDOW;
    this._setStrike(MOVES.light, {
      dmg: Math.round(this.lightDamage * this.getComboMultiplier() * this.damageMult * (this.weaponMeleeMult ?? 1)),
      posture: this.lightPosture,
      color: '#ffdd66',
      tint: 0xffdd88,
    });
    this.animateWeapon(MOVES.light.anim);
    this.player.characterModel?.playComboAttack?.(this.comboCount);
    this.audio?.swingLight?.();
    return true;
  }

  tryHeavyAttack() {
    if (this.riposteWindow > 0) return this.tryRiposte();
    if ((this.state !== 'idle' && this.state !== 'combo') || this.stamina < this.heavyStamina) return false;
    this.stamina -= this.heavyStamina;
    this.state = 'heavy';
    this.stateTimer = 0;
    this.comboCount = 0;
    this._setStrike(MOVES.heavy, {
      dmg: Math.round(this.heavyDamage * this.damageMult * (this.weaponMeleeMult ?? 1)),
      posture: this.heavyPosture,
      color: '#ff8844',
      tint: 0xff8844,
    });
    this.animateWeapon(MOVES.heavy.anim, true);
    this.player.characterModel?.playHeavyAttack?.();
    this.audio?.swingHeavy?.();
    return true;
  }

  tryRiposte() {
    this.state = 'heavy';
    this.stateTimer = 0;
    this.riposteWindow = 0;
    // 处决伤害写进本次出手的判定参数，不再临时改写 heavyDamage/lightDamage 基线
    const rip = PLAYER_MOVES.riposte;
    const base = rip.damage * (1 + (this.skillMods?.riposte ?? 0) * rip.skillScaleMult);
    this._setStrike(MOVES.heavy, {
      dmg: Math.round(base * this.damageMult * (this.weaponMeleeMult ?? 1)),
      posture: rip.posture,
      color: '#ff8844',
      tint: 0xff8844,
    });
    this.animateWeapon(0.5, true);
    this.player.characterModel?.playRiposte?.();
    this.dialog.toast('致命一击！');
    window.dispatchEvent(new CustomEvent('combat-riposte'));
    return true;
  }

  tryRoll() {
    if (this.rollCooldownTimer > 0) return false;
    if ((this.state !== 'idle' && this.state !== 'combo') || this.stamina < this.rollStamina) return false;
    this.stamina -= this.rollStamina;
    this.state = 'roll';
    this.stateTimer = 0;
    this.invincible = true;
    this.invincibleTimer = MOVES.roll.iframes;
    this.rollCooldownTimer = this.rollCooldown;
    this.player.applyDash(this.player.yaw, MOVES.roll.speed, MOVES.roll.duration);
    this.player.characterModel?.playDodge?.();
    this.audio?.dodge();
    return true;
  }

  tryParry() {
    if (this.parryCooldown > 0 || this.stamina < this.parryStamina) return false;
    if (this.state !== 'idle' && this.state !== 'combo') return false;

    this.player.characterModel?.playBlock?.();
    this.audio?.blockClink?.();

    for (const enemy of this.enemies.getAliveEnemies()) {
      if (enemy.distanceTo(this.player.position) > 3.5) continue;
      if (enemy.isParriable()) {
        this.stamina -= this.parryStamina;
        this.parryCooldown = 0.5;
        enemy.forceStagger(2.5);
        this.invincible = true;
        this.invincibleTimer = 0.3;
        this.riposteWindow = 1.8;
        this.player.characterModel?.playParrySuccess?.();
        this.feedback?.parryFlash(this.player.position);
        this.audio?.parry();
        this.dialog.toast('完美弹反！');
        addShake(0.08);
        window.dispatchEvent(new CustomEvent('parry-success'));
        return true;
      }
    }
    return false;
  }

  tryWeaponArt() {
    if (this.skillCooldown > 0 || this.stamina < this.skillStamina) return false;
    if (this.state !== 'idle' && this.state !== 'combo') return false;
    this.stamina -= this.skillStamina;
    this.skillCooldown = 4;
    this.state = 'skill';
    this.stateTimer = 0;

    this.player.characterModel?.playSkill?.();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, MOVES.skill.range, 32),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.player.position);
    ring.position.y += 0.2;
    this.slashGroup.add(ring);
    this.schedule(0.4, () => this.slashGroup.remove(ring), ring.geometry, ring.material);

    this._setStrike(MOVES.skill, {
      dmg: Math.round(PLAYER_MOVES.skill.damage * this.skillMult * this.damageMult
        * (1 + (this.skillMods?.skill ?? 0)) * (this.weaponSkillMult ?? 1)),
      posture: PLAYER_MOVES.skill.posture,
      color: '#66ccff',
      tint: 0x66ccff,
    });
    this.audio?.swingHeavy?.();
    return true;
  }

  /** 武器摆动按主循环 dt 推进（原为自建 rAF，脱离时间缩放且切标签页会失准） */
  animateWeapon(duration, heavy = false) {
    this._weaponAnim = { t: 0, dur: duration, heavy };
  }

  _updateWeaponAnim(dt) {
    const a = this._weaponAnim;
    if (!a) return;
    const weapon = this.player.mesh.getObjectByName?.('weapon');
    a.t += dt;
    if (!weapon) { this._weaponAnim = null; return; }
    const t = a.t / a.dur;
    if (t >= 1) {
      this._weaponAnim = null;
      weapon.rotation.z = -0.3;
      weapon.rotation.x = 0;
      return;
    }
    weapon.rotation.z = -0.3 - Math.sin(t * Math.PI) * (a.heavy ? 1.8 : 1.2);
    weapon.rotation.x = Math.sin(t * Math.PI) * 0.8;
  }

  processHitWindow() {
    const s = this._strike;
    if (!s || this.attackHitDone) return;
    this.attackHitDone = true;
    const origin = s.omni ? this.player.position : this.getAttackOrigin();
    const forward = this.player.getCombatForwardXZ();
    const minDot = s.omni ? s.cone : (this.lockTarget?.alive ? LOCKED_CONE : s.cone);
    let hitAny = false;

    for (const enemy of this.enemies.getAliveEnemies()) {
      _toEnemy.subVectors(enemy.position, origin);
      _toEnemy.y = 0;
      if (_toEnemy.length() > s.range) continue;
      _toEnemy.normalize();
      if (forward.dot(_toEnemy) < minDot) continue;
      // 垂直方向同样要相交，不再把 3D 判定压成 2D 投影：打不到就是 no-hit
      const part = pickPart(enemy, this.player.position.y, s.band);
      if (!part) continue;

      const hit = resolveHit({
        base: s.dmg,
        posture: s.posture,
        target: enemy,
        part,
        element: s.element,
        backstab: !s.omni && isBehind(enemy, this.player.position),
        guard: isGuarded(enemy, this.player.position),
        rng: this.rng,
      });
      const killed = enemy.takeDamage(hit.damage, hit.posture);
      // 一次命中的三种反馈必须同源：火花往哪喷、敌人往哪退、屏幕晃多少都来自这一下
      const dir = hitDirection(origin, enemy.position, _hitDir);
      // 举着盾的目标不吃击退：它那一招的代价就是站在原地挨，推开反而把防御变成了好事
      if (!hit.blocked) {
        enemy.applyKnockback(dir.x, dir.z,
          HIT.speed
          * (s.heavy ? HIT.heavyScale : 1)
          * (hit.crit ? HIT.critScale : 1)
          * (part.mult > 1.3 ? 1.2 : 1));
      }
      this.damageNumbers?.spawn(
        enemy.position,
        `${hit.damage}${s.suffix ?? ''}${hitSuffix(hit)}`,
        hit.crit ? '#ff5566' : s.color
      );
      this.feedback?.impact(
        enemy.position, hit.blocked ? GUARD.spark : s.tint, s.heavy ? 1.3 : 1, dir
      );
      hitAny = true;
      if (killed) this._dispatchExecution(enemy);
      // 砍在盾上顿不了那么久：hitstop 是"这一刀落实了"的重音，挡住的该短一档
      this.requestHitstop(hit.blocked ? 0.03 : s.heavy ? 0.075 : 0.055);
      this.audio?.[hit.blocked ? 'blockClink' : s.heavy ? 'heavyHit' : 'hit']?.();
      addShake((s.heavy ? 0.05 : 0.03) * (hit.crit ? 1.3 : 1));
    }
    if (hitAny) {
      window.dispatchEvent(new CustomEvent('combat-hit'));
      if (this.state === 'light' && this.comboCount >= 3) this.tryComboFinisher();
    }
  }

  tryComboFinisher() {
    if (this._finisherCd > 0) return;
    this._finisherCd = 1.2;
    this.state = 'skill';
    this.stateTimer = 0;
    this.comboCount = 0;
    const radius = 3.5 * (1 + (this.skillMods?.finisher ?? 0));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, radius, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(this.player.position);
    ring.position.y += 0.3;
    this.slashGroup.add(ring);
    this.schedule(0.35, () => this.slashGroup.remove(ring), ring.geometry, ring.material);
    this._setStrike(MOVES.skill, {
      range: radius,
      dmg: Math.round(PLAYER_MOVES.finisher.damage * this.damageMult * (this.weaponMeleeMult ?? 1)),
      posture: PLAYER_MOVES.finisher.posture,
      color: '#ffcc44',
      tint: 0xffcc44,
      suffix: '!',
    });
    this.audio?.swingHeavy?.();
    window.dispatchEvent(new CustomEvent('combo-finisher'));
    this.dialog.toast('连击终结！');
  }

  /**
   * 处决事件：镜头与特效要知道"死的是谁、多大一只"，但不该反过来翻敌人的内部字段，
   * 所以这里交出的是三枚公开只读量 —— 身高（受击盒顶，相对网格原点）、网格原点的世界高度、
   * 以及位置本身。缺了 stature/base 时取景退回旧构图（Boss 家族的兜底）。
   */
  _dispatchExecution(enemy) {
    const boss = enemy.type === 'boss' || enemy.bossId;
    window.dispatchEvent(new CustomEvent('combat-execution', {
      detail: {
        boss: !!boss,
        bossId: enemy.bossId,
        name: enemy.name,
        position: enemy.position.clone?.() ?? { x: enemy.position.x, y: enemy.position.y, z: enemy.position.z },
        stature: enemy.statureHeight?.() ?? null,
        base: enemy.hurtBaseY?.() ?? enemy.position.y,
      },
    }));
  }

  getAttackOrigin() {
    const forward = this.player.getCombatForwardXZ();
    return new THREE.Vector3(
      this.player.position.x + forward.x * 1.2,
      this.player.position.y + (this.player.cameraMode === 'first' ? 1.45 : 1.2),
      this.player.position.z + forward.z * 1.2
    );
  }

  update(dt, keys) {
    this._updateTimed(dt);
    this._updateWeaponAnim(dt);

    this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
    this.invincible = this.invincibleTimer > 0;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.rollCooldownTimer = Math.max(0, this.rollCooldownTimer - dt);
    this.riposteWindow = Math.max(0, this.riposteWindow - dt);
    this.parryCooldown = Math.max(0, this.parryCooldown - dt);
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    this._finisherCd = Math.max(0, (this._finisherCd ?? 0) - dt);

    if (this.stamina < this.maxStamina && (this.state === 'idle' || this.state === 'combo')) {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * STAMINA_REGEN);
    }
    // 只在量化档位真的挪了才通知订阅者（B41）；HUD 侧仍能拿到最新精确值
    this.vitals.stamina.set(this.stamina);
    this.vitals.combo.set(this.comboCount);
    this.vitals.parryable.set(this.riposteWindow > 0);

    if (this.lockTarget && (!this.lockTarget.alive || this.lockTarget.distanceTo(this.player.position) > this.lockRange * 1.6)) {
      this.clearLock();
    }
    if (this.lockTarget?.alive) {
      const dx = this.lockTarget.position.x - this.player.position.x;
      const dz = this.lockTarget.position.z - this.player.position.z;
      this.player.targetYaw = this.player.faceYawFromDirection(dx, dz);
    }

    if (keys['KeyQ']) {
      keys['KeyQ'] = false;
      if (keys['ShiftLeft'] || keys['ShiftRight']) {
        keys['ShiftLeft'] = false;
        keys['ShiftRight'] = false;
        this.clearLock();
        this.dialog.toast('已解除锁定');
      } else {
        this.toggleLock();
      }
    }
    if (keys['KeyF']) { keys['KeyF'] = false; this.tryParry(); }
    if (keys['KeyR']) { keys['KeyR'] = false; this.tryWeaponArt(); }
    if (keys['ControlLeft'] || keys['ControlRight']) {
      if (this.state === 'idle' || this.state === 'combo') {
        keys['ControlLeft'] = false;
        keys['ControlRight'] = false;
        this.tryRoll();
      }
    }

    this.stateTimer += dt;

    if (this._strike && !this.attackHitDone && this.stateTimer >= this._strike.at) {
      this.processHitWindow();
    }

    if (this.state === 'combo') {
      if (this.comboTimer <= 0) { this.state = 'idle'; this.stateTimer = 0; }
    } else {
      const mv = MOVES[this.state];
      if (mv && this.stateTimer > mv.duration) {
        const toCombo = this.state === 'light' && this.comboTimer > 0;
        this.state = toCombo ? 'combo' : 'idle';
        this.stateTimer = 0;
      }
    }

    if (this.state === 'idle' || this.state === 'combo') {
      if (this.mouseDown.left) { this.mouseDown.left = false; this.tryLightAttack(); }
      if (this.mouseDown.right) { this.mouseDown.right = false; this.tryHeavyAttack(); }
    }
  }

  isBusy() {
    return ['heavy', 'roll', 'light', 'skill'].includes(this.state);
  }

  /** 体力是否够付出 amount（供玩家状态机判断能否冲刺，不暴露 stamina 字段本身） */
  canSpend(amount) {
    return this.stamina >= amount;
  }

  /** 出手期间允许的位移速度倍率（玩家状态机调用，避免它反过来猜 combat.state） */
  getMoveScale() {
    return MOVES[this.state]?.moveScale ?? 1;
  }

  /** 当前锁定目标；无目标或目标已死返回 null */
  getLockTarget() {
    return this.lockTarget?.alive ? this.lockTarget : null;
  }
}
