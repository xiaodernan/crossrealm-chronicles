import * as THREE from 'three';
import { anyDown, codeFor } from '../content/keybinds.js';
import { keyText } from '../content/keyHints.js';
import { t } from '../engine/i18n.js';

import { CharacterModel } from './CharacterModel.js';

import { attachToHand, GRIP } from './WeaponGrip.js';

import { PlayerAnimationAdapter } from './animation/PlayerAnimationAdapter.js';

import { createPlayerFSM } from './PlayerFSM.js';

import { shake } from '../engine/Shake.js';
import { CameraRig, FOV_LAYER_OVERRIDE, CAMERA_OVERRIDES_NONE, isFiniteVec3 } from '../engine/CameraRig.js';
import { LOOK_SENSITIVITY, DEFAULT_LOOK_SENSITIVITY, normalizeLookSensitivity } from '../engine/lookSensitivity.js';
import { emitCue } from '../engine/cues.js';
import { CAMERA_FOV, CAMERA_OCCLUSION, CAMERA_BLEND, LOCK_ON_CAMERA, PLAYER_KNOCK } from '../content/tuning.js';
import { ZONE_IDS } from '../content/ZoneIdentity.js';

import { TextureLibrary } from '../assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../content/materialSurfaces.js';
import { paletteOf } from '../content/materialPalette.js';
import { makeUvBoxGeometry } from '../engine/uvGeometry.js';


/** 第三人称轨道 + 第一人称 — 参考法环/黑神话：鼠标直控、镜头始终看向角色 */

export class PlayerController {

  constructor(scene, camera, world, game) {

    this.scene = scene;

    this.camera = camera;

    this.world = world;

    this.game = game;

    this.combat = null;

    this.characterModel = new CharacterModel();



    this.position = new THREE.Vector3(0, 2, 60);

    this.velocity = new THREE.Vector3();

    this.yaw = Math.PI;

    this.pitch = 0.38;

    this.targetYaw = this.yaw;

    this.targetPitch = this.pitch;



    this.cameraMode = 'third';

    this.cameraDistance = 5.2;

    this.minCameraDistance = 3.5;

    this.maxCameraDistance = 8.5;

    this.shoulderOffset = 0.35;

    this.eyeHeight = 1.62;

    this.pivotHeight = 1.38;

    this.moveSpeed = 15;

    this.sprintMultiplier = 1.85;

    this.jumpForce = 10;

    this.invertedGravity = false;

    this._voidGravityNotified = false;

    this.grounded = false;

    /* 鼠标镜头的两枚出厂倍率（W-D6 切片7 之前是这里的两行硬编码）。
       真源在 `engine/lookSensitivity.js` —— 设成字段只是为了 `addCameraInput` 少查一次表。
       `lookSensitivityScale` 是玩家拧的倍率，出厂 1 = 与硬编码时代逐帧相同。 */
    this.cameraSensitivity = LOOK_SENSITIVITY.x;
    this.cameraSensitivityY = LOOK_SENSITIVITY.y;
    this.lookSensitivityScale = DEFAULT_LOOK_SENSITIVITY;
    /** 震屏不归玩家所有：`engine/Shake.js` 的共享实例是唯一写入者，相机只读它的偏移 */
    this.shake = shake;

    this._camTmp = new THREE.Vector3();

    this._camTmp2 = new THREE.Vector3();

    /** 演出镜头借视线时用的一次向量：第一人称搬不走眼睛，只能搬"看哪里" */
    this._camTmp3 = new THREE.Vector3();

    /** 第一人称的注视点（旧实现每帧 `pos.clone()`，热路径上的分配没有主人） */
    this._camTmp4 = new THREE.Vector3();

    /** 第三人称的期望机位：遮挡求交要在原值上反复插值，不能就地改 `desired` */
    this._camTmp5 = new THREE.Vector3();

    /** 相机热路径零分配（M4 切片1）：每帧跑 60~144 次，不能再随手 new Vector3 */
    this._camTmpRight = new THREE.Vector3();
    this._camTmpLook = new THREE.Vector3();
    this._camTmpLookB = new THREE.Vector3();

    /** 移动输入热路径零分配（M4 切片2）：readMoveDir 每帧一次，方向 + 两条基向量都走复用槽 */
    this._moveTmpDir = new THREE.Vector3();
    this._moveTmpFwd = new THREE.Vector3();
    this._moveTmpRight = new THREE.Vector3();



    this.currentCameraPos = new THREE.Vector3();

    this.currentLookTarget = new THREE.Vector3();

    this.fpWeaponGroup = null;



    this.mesh = this.characterModel.group;

    this.mesh.position.copy(this.position);

    scene.add(this.mesh);



    this.interactRadius = 8;

    this.nearbyPoint = null;

    this.interactCooldown = 0;

    this.walkCycle = 0;

    /**
     * 时标：所有"让玩家变慢"的来源都走 `applyTimeScale()`，这个字段是账本算出来的缓存，
     * 别处不要直接写（旧写法 `playerRef.timeSlow = 1` 只有自然到期那一条还原路径，
     * 被打断、被打死两条都会把玩家永远留在 0.35 —— 见 `VoidBoss`）。
     */
    this.timeSlow = 1;

    /** 时标账本 `key → { scale, left }`；null = 当前没有任何来源在改时标（不为一个用不上的 Map 分配） */
    this._timeScales = null;

    /**
     * 外部冲量账（被拽、被推）：别处不要写 `velocity`，走 `applyKnockback()`。
     * 与玩家的位移意图**分开积分**，所以"按住方向键"抹不掉它，两条通道也不会互相喂 —— 见 `PLAYER_KNOCK`。
     */
    this.knock = { x: 0, z: 0 };

    /** `_stepKnock()` 的复用槽：本帧的外力速度，热路径不分配（M4） */
    this._knockStep = { x: 0, z: 0 };


    /** 移动与碰撞参数（M1）：脚部圆半径、可迈上台阶、土狼时间与跳跃缓冲 */
    this.colliderRadius = 0.45;

    this.stepUp = 0.65;

    this.coyoteTime = 0.1;

    this.jumpBufferTime = 0.12;

    this._jumpWasDown = false;

    this._jumpBuffer = 0;

    this._coyoteTimer = 0;

    /** 翻滚/位移冲量：由战斗系统按帧表请求，玩家侧按剩余时间积分（修 ±3% 整帧量化） */
    this._dashVelocity = new THREE.Vector3();

    this._dashRemaining = 0;



    /** 相机不归玩家写：所有 position / lookAt / FOV 都过这一台 rig（M3） */
    this.rig = new CameraRig(camera);
    this.rig.setBaseFov(CAMERA_FOV.third);



    this.modelReady = this._loadModel();

    /** locomotion / 战斗态 / 翻滚的互斥规则集中在这里，见 PlayerFSM.js */
    this.fsm = createPlayerFSM(this);

  }



  async _loadModel() {

    await this.characterModel.load();

    // W-C6 余项：玩家接入动画适配器系统（与敌人统一管理）
    this.animAdapter = new PlayerAnimationAdapter(this.characterModel);
    this.animAdapter.registerStates();
    this.animAdapter.registerProceduralClips();

    const sword = this._buildWeapon();

    // 剑挂**右手骨**（B112）：切片8 之后手臂真的挥了，剑却还住在视觉层的 (0.55, 1.0, 0)。
    // 对着 `Soldier.glb` 字节量 Idle 第 0 帧：右手在 (-0.332, 1.072, -0.215)，剑心离右手 0.910 米、
    // 离左手只有 0.317 米 —— 玩家看到的是"左手边挂剑、右手挥空"（肩线读数见 `WeaponGrip.js` 头注）。
    // 素材不在（胶囊 fallback / GLB 装配失败）⇒ `boneOf` 返回 null，退回切片7 的视觉层挂点：
    // 那一层才带 proc 的前倾 / 侧倾（B110），并把静止姿态交给程序摆动（`swingRest`，见 CombatController）。
    // 第一人称那把（下面的 `fpWeaponGroup`）两条路径都留在相机下 —— 身体前倾不该走着手腕去拧相机。
    const 右手 = this.characterModel.boneOf(GRIP.骨标签);

    if (右手) attachToHand(右手, sword);

    else {
      sword.userData.swingRest = { x: sword.rotation.x, z: sword.rotation.z };
      (this.characterModel.modelRoot ?? this.mesh).add(sword);
    }



    this.fpWeaponGroup = new THREE.Group();

    const fpSword = sword.clone();

    fpSword.position.set(0.32, -0.22, -0.55);

    fpSword.rotation.set(-0.15, 0.1, -0.35);

    fpSword.scale.set(0.9, 0.9, 0.9);

    this.fpWeaponGroup.add(fpSword);

    this.fpWeaponGroup.visible = false;

    this.camera.add(this.fpWeaponGroup);

  }

  /**
   * 剑（W-C5 切片5）：剑身贴拉丝金属（steel）。几何用米制 UV（`engine/uvGeometry.js`）——
   * 0.9 米的剑身摊 3.6 铺贴图，与墙砖同一个"铺数只有一个"的口径（不随剑的缩放走）。
   * 材质每实例一份（设计上要留着改自家 emissive 的口），纹理是共享壳。
   */
  _buildWeapon() {

    const mat = new THREE.MeshStandardMaterial({ color: paletteOf('metal.gilt'), roughness: 0.35, metalness: 0.7, emissive: 0x332200, emissiveIntensity: 0.2 });

    const sword = new THREE.Mesh(makeUvBoxGeometry(0.06, 0.9, 0.12), mat);

    sword.position.set(0.55, 1.0, 0);

    sword.rotation.z = -0.3;

    sword.name = 'weapon';

    this._applySteelSurface(mat);

    return sword;

  }

  /**
   * steel 两段式：`_loadModel` 不等贴图库（模型与贴图各加载各的），所以库已就绪就直接上；
   * 没就绪挂到 `TextureLibrary.load()` 的同一份缓存 promise 上 —— 与 `WorldDecorations`
   * 同一口径。敌人只走同步那一段（建得早就退回旧读数）：剑是整局在手的物件，等一次才不至于
   * 整局没有金属纹理。上贴后 `needsUpdate`：材质可能已经编译过，新贴图要重收一次程序。
   */
  _applySteelSurface(mat) {

    const 上贴 = (lib) => {

      const 砖 = 1 / SURFACE_SPECS.steel.tileMeters;

      const v = lib.uvVariant('steel', 砖, 砖);

      if (!v) return;

      if (v.normalMap) mat.normalMap = v.normalMap;

      if (v.roughnessMap) mat.roughnessMap = v.roughnessMap;

      mat.normalScale = new THREE.Vector2(0.8, 0.8);

      mat.roughness = 1;

      mat.needsUpdate = true;

    };

    const 就绪 = TextureLibrary.loaded();

    if (就绪) 上贴(就绪);

    else TextureLibrary.load().then(上贴);

  }

  toggleCameraMode() {

    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';

    this.mesh.visible = this.cameraMode === 'third';

    if (this.fpWeaponGroup) this.fpWeaponGroup.visible = this.cameraMode === 'first';

    this.rig.setBaseFov(this.cameraMode === 'first' ? CAMERA_FOV.first : CAMERA_FOV.third);

    if (this.cameraMode === 'first') {

      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.45, 0.45);

    }

    this.currentCameraPos.set(0, 0, 0);
    // 震屏的幅度与注视点权重按视角切换，切换处只在这里声明一次
    this.shake.setProfile(this.cameraMode);
    const swap = keyText(t('toast_camera_swap'));
    this.game.dialog?.toast(this.cameraMode === 'first' ? t('toast_camera_first_fmt', { swap }) : t('toast_camera_third_fmt', { swap }));

    window.dispatchEvent(new CustomEvent('camera-mode-changed', { detail: { mode: this.cameraMode } }));

  }



  getForwardXZ(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** 攻击判定朝向 — 锁定目标 / 角色朝向 / 镜头朝向 */
  getCombatForwardXZ() {
    const target = this.combat?.getLockTarget?.();
    if (target) {
      const dx = target.position.x - this.position.x;
      const dz = target.position.z - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      return new THREE.Vector3(dx / len, 0, dz / len);
    }
    const meshFwd = new THREE.Vector3(
      Math.sin(this.mesh.rotation.y),
      0,
      Math.cos(this.mesh.rotation.y)
    );
    const camFwd = this.getForwardXZ();
    if (this.combat?.isBusy?.()) return meshFwd;
    return meshFwd.dot(camFwd) > 0.55 ? meshFwd : camFwd;
  }



  getRightXZ(out = new THREE.Vector3()) {

    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

  }



  faceYawFromDirection(dx, dz) {
    return Math.atan2(dx, dz);
  }



  meshYawFromDirection(dx, dz) {

    return Math.atan2(dx, dz);

  }



  /**
   * 镜头灵敏度倍率（W-D6 切片7）。出厂 1 = 与硬编码时代逐帧相同。
   *
   * 倍率乘在**两枚出厂值**上而不是覆盖它们：横竖比例（0.002 : 0.0017）是手感决定，
   * 玩家拧的只是"整体快慢"，拧完比例不变。唯一写入口是
   * `SettingsManager.applyToGame` 里的 `applyLookSensitivity` —— 与难度档 / 色觉档同一条纪律。
   *
   * 脏值在这里夹回量程而不是抛：这一格来自玩家可写的 localStorage，
   * 一行手改的错字不该把开机炸了（`normalizeShadowQuality` 的同一先例）。
   */
  setLookSensitivity(scale) {
    this.lookSensitivityScale = normalizeLookSensitivity(scale);
    this.cameraSensitivity = LOOK_SENSITIVITY.x * this.lookSensitivityScale;
    this.cameraSensitivityY = LOOK_SENSITIVITY.y * this.lookSensitivityScale;
    return this.lookSensitivityScale;
  }

  addCameraInput(dx, dy) {
    this.yaw -= dx * this.cameraSensitivity;
    /* 第一人称的鼠标 dy 反向补手感。`pitch` 语义已在两人称统一为「> 0 = 视线朝下」
     * （见 `_updateFirstPersonCamera` 的注），而第一人称的 look 向量对 pitch 取了反，
     * 所以这里必须把 dy 也取反，鼠标下推（dy > 0）才会让 pitch 变大 = 视线朝下压 ——
     * 第一人称该有的手感；第三人称吊臂随 pitch 升高，鼠标下推 → 吊臂下沉 →
     * 仰视角色，那是 TPS 的标准手感。两边手感各自符合常识，底层是同一个方向。 */
    const dyEff = this.cameraMode === 'first' ? -dy : dy;
    this.pitch -= dyEff * this.cameraSensitivityY;
    if (this.cameraMode === 'first') {
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.5, 0.5);
    } else {
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.12, 0.62);
    }
    this.targetYaw = this.yaw;
    this.targetPitch = this.pitch;
  }



  adjustZoom(delta) {

    if (this.cameraMode === 'first') return;

    this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + delta * 0.8, this.minCameraDistance, this.maxCameraDistance);

  }



  /** 传送/重生唯一入口：落点若嵌在障碍里会沿最浅方向脱困 */
  teleport(x, y, z, { keepVelocity = false, yaw, pitch } = {}) {
    this.position.set(x, y, z);
    if (!keepVelocity) this.velocity.set(0, 0, 0);
    // 外力账**无条件**清：`keepVelocity` 保的是玩家自己的动量，而拽他的那口井在上一张地图 ——
    // 落点上再留一笔隐形的手，等于传送出去还往回漂
    this.clearKnockback();
    if (Number.isFinite(yaw)) { this.yaw = yaw; this.targetYaw = yaw; }
    if (Number.isFinite(pitch)) {
      this.pitch = THREE.MathUtils.clamp(pitch, -0.12, 0.62);
      this.targetPitch = this.pitch;
    }
    this.resolveOverlap();
    this._jumpBuffer = 0;
    this._coyoteTimer = 0;
    // 传送即换场景：残留的半截抖动会跨区跟过来，落点应当是静止画面
    this.shake.reset();
    this.mesh.position.copy(this.position);
  }

  /** 供战斗系统请求位移冲量（翻滚等）：时长由帧表给出，位移在玩家侧按剩余时间积分 */
  applyDash(yaw, speed, duration) {
    // 与 getForwardXZ() 同一套朝向约定：yaw 的正前方是 (sin yaw, cos yaw)
    this._dashVelocity.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed);
    this._dashRemaining = Math.max(this._dashRemaining, duration ?? 0);
  }

  /**
   * 借一格时标：`key` 是"谁在拖慢我"（一个来源一个 key，互不覆盖），`leash` 是
   * **这一笔的寿命**而非招式的时长 —— 想持续就每帧再要一次，不想持续就不来。
   *
   * 为什么是"续绳"而不是"申请 + 注销"：写者总会漏掉注销（`VoidBoss` 漏了两条路径），
   * 而续绳模型里最坏的失败是"多慢 0.2 秒"，不是"永远慢着"。同时它也不需要谁持有
   * 撤账的把手 —— 打断了时停只要不再续绳就行。
   */
  applyTimeScale(key, scale, leash) {
    const ledger = this._timeScales ?? (this._timeScales = new Map());
    const e = ledger.get(key);
    if (e) {
      if (scale < e.scale) e.scale = scale;
      if (leash > e.left) e.left = leash;
    } else {
      ledger.set(key, { scale, left: leash });
    }
    this._syncTimeSlow();
  }

  /** 立刻还账（走出时停域那一帧就该跑起来，不等绳子自己烂掉） */
  releaseTimeScale(key) {
    if (!this._timeScales?.delete(key)) return;
    this._syncTimeSlow();
  }

  /** 每帧按游戏 `dt` 收绳：绳子烧完的那一格自动出账。账本空着时这是一句判空。 */
  updateTimeScales(dt) {
    const ledger = this._timeScales;
    if (!ledger) return;
    for (const [key, e] of ledger) {
      e.left -= dt;
      if (e.left <= 0) ledger.delete(key);
    }
    this._syncTimeSlow();
  }

  /** effective = 最狠的那一格（同时被两种时标拖住，玩家吃更强的那份减速） */
  _syncTimeSlow() {
    let s = 1;
    if (this._timeScales) {
      for (const e of this._timeScales.values()) if (e.scale < s) s = e.scale;
    }
    this.timeSlow = s;
  }

  /**
   * 外力进玩家：`(dirX, dirZ)` 归一后乘 `speed` 记进冲量账，本帧不许立刻改变位置。
   *
   * 为什么不给一条 `velocity +=` 的捷径：状态机在有输入时是**整条改写**水平速度的
   * （`moveHorizontal`），写进 `velocity` 的外力下一帧就没了 —— 引力井从前症状是
   * "按住方向键等于没有引力"。记在另一本账上，玩家的意图与外力的偏移各自衰减、相加后才积分。
   * 返回实际记下的速度（`0` = 这一下没进账），调用方要拿它决定要不要出戏。
   */
  applyKnockback(dirX, dirZ, speed) {
    if (!(speed > 0)) return 0;
    const len = Math.hypot(dirX, dirZ);
    if (len <= 0) return 0;
    let kx = this.knock.x + (dirX / len) * speed;
    let kz = this.knock.z + (dirZ / len) * speed;
    // 封顶：两口井叠一记撞击不该把玩家弹射出去，方向保留、只缩长度
    const m = Math.hypot(kx, kz);
    if (m > PLAYER_KNOCK.maxSpeed) {
      const s = PLAYER_KNOCK.maxSpeed / m;
      kx *= s;
      kz *= s;
    }
    this.knock.x = kx;
    this.knock.z = kz;
    return speed;
  }

  /**
   * 持续力场（引力井那一类）：`accel` 是米/秒²，本帧记进账的增量是它**在这一帧上的积分**。
   *
   * 为什么单列一条：脉冲按"每帧加 `a·dt`"记账的话，稳态速度会变成
   * `a·dt / (1 - e^(-λdt))` —— 60Hz 下比设计值高 8.9%、128Hz 下高 4.4%，帧率换了手感就换了
   * （B39 禁的正是这个）。按积分记则稳态速度精确等于 `accel / decay`，与帧长无关。
   */
  applySustainedForce(dirX, dirZ, accel, dt) {
    if (!(accel > 0) || !(dt > 0)) return 0;
    const lambda = PLAYER_KNOCK.decay;
    return this.applyKnockback(dirX, dirZ, (accel * (1 - Math.exp(-lambda * dt))) / lambda);
  }

  /** 传送/重生：账本跟着 `velocity` 一起清 —— 人已经不在那块地上了，拽他的场也不在了 */
  clearKnockback() {
    this.knock.x = 0;
    this.knock.z = 0;
  }

  /**
   * 结算本帧的外力速度，并把账按秒衰减。与 `Enemy._advance` 同一套曲线平均：
   * 用的是"衰减曲线在本帧上的平均值"而不是起始值，所以 30Hz 与 240Hz 累计位移相同（B39）。
   *
   * 返回的是**本帧要叠进位移的速度**（复用槽，别存下来）。为什么不直接加进 `velocity`：
   * 那条通道自己也在被状态机衰减（无输入时 `decayHorizontal`），两笔一起积分等于把同一个
   * 拉力喂两遍 —— 稳态速度会随帧率翻倍。
   */
  _stepKnock(dt) {
    const out = this._knockStep;
    const kx = this.knock.x;
    const kz = this.knock.z;
    if (kx === 0 && kz === 0) {
      out.x = 0;
      out.z = 0;
      return out;
    }
    const lambda = PLAYER_KNOCK.decay;
    const kd = Math.exp(-lambda * dt);
    const km = dt > 0 ? (1 - kd) / (lambda * dt) : 0;
    out.x = kx * km;
    out.z = kz * km;
    this.knock.x = Math.abs(kx * kd) < 1e-3 ? 0 : kx * kd;
    this.knock.z = Math.abs(kz * kd) < 1e-3 ? 0 : kz * kd;
    return out;
  }

  /** 速度倍率：法术、时停等外部效果统一从这里乘进去，状态机不必各自认识它们 */
  speedMultiplier() {
    return (this.game.spells?.speedMult ?? 1) * (this.timeSlow ?? 1);
  }

  /** 位移原语 —— 状态机只调这几个方法，碰撞与重力仍由 update() 统一处理 */
  moveHorizontal(dt, dir, { speed, turnRate = 14, walkRate = 9 } = {}) {
    this.velocity.x = dir.x * speed;
    this.velocity.z = dir.z * speed;
    this.mesh.rotation.y = THREE.MathUtils.lerp(
      this.mesh.rotation.y,
      this.meshYawFromDirection(dir.x, dir.z),
      turnRate * dt
    );
    this.walkCycle += dt * walkRate;
  }

  decayHorizontal(dt, k) {
    const decay = Math.pow(k, dt * 60);
    this.velocity.x *= decay;
    this.velocity.z *= decay;
  }

  faceCameraYaw(dt, rate = 10) {
    this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, this.yaw, rate * dt);
  }

  faceDirection(yaw) {
    this.mesh.rotation.y = yaw;
  }

  faceTarget(target, dt, rate = 12) {
    this.mesh.rotation.y = THREE.MathUtils.lerp(
      this.mesh.rotation.y,
      this.meshYawFromDirection(target.x - this.position.x, target.z - this.position.z),
      rate * dt
    );
  }

  /**
   * 每帧把 `targetYaw/targetPitch` 落到实际朝向上。
   *
   * 未锁定时是直赋（鼠标手感不能被 rig 侧再抹一层）。锁定时改成**按秒指数逼近**：
   * `CombatController` 每帧把 `targetYaw` 硬写成"指向锁定目标"，若也直赋，锁定一个身后的
   * 敌人就等于镜头一帧甩 180°（短板 A4 的"锁定无阻尼"）。走最短弧（`atan2(sin,cos)` 把差值
   * 折回 [-π,π]），且速率按秒算 → 与帧率无关。命中朝向另走 `getCombatForwardXZ()`（读目标
   * 位置，与本 yaw 无关），所以这里只缓观感、不削准头。
   */
  _advanceYaw(dt) {
    if (this.combat?.getLockTarget?.()) {
      const d = Math.atan2(
        Math.sin(this.targetYaw - this.yaw),
        Math.cos(this.targetYaw - this.yaw)
      );
      this.yaw += d * (1 - Math.exp(-LOCK_ON_CAMERA.yawRate * dt));
    } else {
      this.yaw = this.targetYaw;
    }
    this.pitch = this.targetPitch;
  }

  setAnimState(moving, sprinting) {
    if (this._animMoving === moving && this._animSprinting === sprinting) return;
    this._animMoving = moving;
    this._animSprinting = sprinting;
    this.characterModel.setMovementState(moving, sprinting);
  }

  /** 输入 → 期望移动方向（自动演示模式沿用自己的当前速度方向）
   *  默认写进复用槽 `_moveTmpDir`：调用方（`update` 里的 `ctx.moveDir`）只在本帧内消费，
   *  下一帧开头 `dir.set(0, 0, 0)` 归零即可安全复用。传自定义 out 时不碰这枚槽。 */
  readMoveDir(keys, autoPlay, out = this._moveTmpDir, analog = null) {
    const dir = out.set(0, 0, 0);
    if (autoPlay) {
      if (this.velocity.lengthSq() > 0.5) dir.set(this.velocity.x, 0, this.velocity.z).normalize();
      return dir;
    }
    const forward = this.getForwardXZ(this._moveTmpFwd);
    const right = this.getRightXZ(this._moveTmpRight);
    if (analog && analog.mag > 0) {
      // 左摇杆（切片8）：方向按摇杆、快慢按**幅度**，所以这条路径刻意不归一化 ——
      // 下游是 `velocity = dir × speed`，`dir` 的长度天然就是速度倍率（半推半速）。
      // 八向码在这里不参与：十字键与键盘的 `move.mag` 为 0，走下面那条满速路径。
      dir.addScaledVector(forward, analog.y).addScaledVector(right, analog.x);
      return dir;
    }
    if (keys[codeFor('moveUp')]) dir.add(forward);
    if (keys[codeFor('moveDown')]) dir.sub(forward);
    if (keys[codeFor('moveRight')]) dir.sub(right);
    if (keys[codeFor('moveLeft')]) dir.add(right);
    if (dir.lengthSq() > 0) dir.normalize();
    return dir;
  }

  resolveOverlap() {
    const world = this.world?.collision;
    if (!world) return;
    const footY = this.position.y - (this.characterModel?.footOffset ?? 0);
    const out = world.unpenetrate(this.position.x, this.position.z, this.colliderRadius, footY);
    this.position.x = out.x;
    this.position.z = out.z;
  }



  /** 边界提示：贴到世界边缘的隐形墙时给出方向感，避免玩家以为卡死 */
  hintBoundary(dt) {
    this._boundaryHintTimer = Math.max(0, (this._boundaryHintTimer ?? 0) - dt);
    if (this._boundaryHintTimer > 0) return;
    const b = this.world.bounds;
    if (!b) return;
    const near =
      this.position.x < b.minX + 6 ||
      this.position.x > b.maxX - 6 ||
      this.position.z < b.minZ + 6 ||
      this.position.z > b.maxZ - 6;
    if (!near) return;
    this._boundaryHintTimer = 6;
    this.game.dialog?.toast(t('toast_void_boundary'));
  }



  /**
   * @param {object} keys 键盘形状（含手柄桥合成的那一份）
   * @param {object} [analog] 左摇杆模拟量 `{x, y, mag, sprint}`（`GamepadInput.move` 的复用槽）；
   *        给 `null`/`undefined` 就是"没有手柄"，走八向码的满速路径
   */
  update(dt, keys, analog = null) {

    if (this.game.cinematicActive || this.game.paused) {
      this.mesh.position.copy(this.position);
      return;
    }

    const autoPlay = this.game.autoPlayMode && this.game.playerAutoPlay?.active;

    // 时标账本先收绳，状态机这一帧才用得上正确的速度倍率
    this.updateTimeScales(dt);

    this.combat?.update(dt, keys);

    this.characterModel.update(dt);
    // W-C6 余项：玩家动画适配器同步更新
    this.animAdapter?.update(dt);

    this.interactCooldown = Math.max(0, this.interactCooldown - dt);



    this._advanceYaw(dt);


    // 位移意图整帧交给状态机：它只写 velocity 的水平分量与朝向，
    // 积分、碰撞、贴地、重力仍在本方法后半段统一做，避免两处同时写位移
    const ctx = {
      moveDir: this.readMoveDir(keys, autoPlay, undefined, analog),
      // "够不够跑"由桥判（切片21）：门槛吃的是玩家自己拧的那一格手档，而手档只有桥拿着
      sprintHeld: !!anyDown(keys, 'sprint') || !!analog?.sprint,
    };
    ctx.moving = ctx.moveDir.lengthSq() > 0;
    this.fsm.resolve(ctx);
    this.fsm.update(dt, ctx);

    // 停止输入时把残余水平速度归零，但翻滚的冲量结算不受输入影响
    if (!ctx.moving && this._dashRemaining <= 0) {
      if (Math.abs(this.velocity.x) < 0.05) this.velocity.x = 0;
      if (Math.abs(this.velocity.z) < 0.05) this.velocity.z = 0;
    }



    const voidZone = this._isVoidZone();

    if (voidZone !== this.invertedGravity) {

      this.invertedGravity = voidZone;

      if (voidZone) {

        this.game.audio?.voidGravityFlip?.();

        this.game.dialog?.toast(t('toast_broken_timeline'));

      }

      this._voidGravityNotified = voidZone;

    }



    const spaceDown = !!keys[codeFor('jump')];

    if (spaceDown && !this._jumpWasDown) this._jumpBuffer = this.jumpBufferTime;

    this._jumpWasDown = spaceDown;

    this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);

    this._coyoteTimer = this.grounded ? this.coyoteTime : Math.max(0, this._coyoteTimer - dt);

    if (this._jumpBuffer > 0 && this._coyoteTimer > 0 && this.fsm.allows('allowJump')) {

      this.velocity.y = voidZone ? -this.jumpForce : this.jumpForce;

      this._jumpBuffer = 0;

      this._coyoteTimer = 0;

      this.grounded = false;

    }



    const grav = voidZone ? 24 : -24;

    this.velocity.y += grav * dt;



    const footOffset = this.characterModel.footOffset ?? 0;

    const footY = this.position.y - footOffset;

    const inDungeon = !!this.game.dungeons?.active;

    const collision = inDungeon ? null : this.world.collision;

    const r = this.colliderRadius;

    // 外力与本帧速度相加后才进积分：玩家的意图这一帧已经由状态机写完（locomotion 是整条
    // 改写水平速度的），两条通道各衰减各的，谁也不喂谁 —— 见 `_stepKnock`
    const kv = this._stepKnock(dt);
    const ivx = this.velocity.x + kv.x;
    const ivz = this.velocity.z + kv.z;


    if (collision) {

      const moved = collision.moveCircle(

        this.position.x,

        this.position.z,

        r,

        ivx * dt,

        ivz * dt,

        footY

      );

      this.position.x = moved.x;

      this.position.z = moved.z;

    } else {

      this.position.x += ivx * dt;

      this.position.z += ivz * dt;

    }

    this.position.y += this.velocity.y * dt;



    const standTop = collision ? collision.supportAt(this.position.x, this.position.z, r, footY, this.stepUp) : null;

    const groundY = this.world.getGroundHeight(this.position.x, this.position.z) + footOffset;

    const walkY = voidZone ? groundY + 9 : (standTop === null ? groundY : Math.max(groundY, standTop + footOffset));

    if (voidZone) {

      if (this.position.y >= walkY - 0.05) {

        this.position.y = THREE.MathUtils.lerp(this.position.y, walkY, 0.92);

        this.velocity.y = Math.min(0, this.velocity.y);

        this.grounded = true;

      } else {

        this.grounded = false;

      }

    } else if (this.position.y <= walkY + 0.12 || (this.grounded && this.position.y < walkY + 0.45)) {

      this.position.y = THREE.MathUtils.lerp(this.position.y, walkY, this.grounded ? 0.88 : 1);

      if (this.velocity.y <= 0) this.velocity.y = 0;

      this.grounded = true;

    } else {

      this.grounded = false;

    }

    if (this.game.dungeons?.active) {
      this.game.dungeons.updatePlayerRoom(this.position);
      this.game.dungeons.clampPlayer(this);
    }

    this.hintBoundary(dt);


    this.mesh.position.copy(this.position);

    if (!this.characterModel.mixer) {

      const bob = Math.sin(this.walkCycle) * 0.04 * (ctx.moving ? 1 : 0);

      this.mesh.position.y += voidZone ? -bob : bob;

    }

    this.updateCamera(dt);

    if (this.fsm.allows('allowInteract')) this.handleInteractions(keys);

  }



  handleInteractions(keys) {

    const prompt = document.getElementById('interaction-prompt');

    if (!keys[codeFor('interact')] || this.interactCooldown > 0) {

      this.updatePrompt(prompt);

      return;

    }



    const rest = this.game.restPoints.getNearest(this.position, 4);

    if (rest) {

      keys[codeFor('interact')] = false;

      this.interactCooldown = 0.8;

      this.game.restDialogue.start(rest);

      prompt.classList.add('hidden');

      return;

    }



    const npc = this.game.npcs.getNearest(this.position, 4);

    if (npc) {

      keys[codeFor('interact')] = false;

      this.interactCooldown = 0.6;

      this.game.npcs.talk(npc);

      prompt.classList.add('hidden');

      return;

    }



    const chest = this.game.collectibles.tryOpen(this.position, 3.5);

    if (chest) {

      keys[codeFor('interact')] = false;

      this.interactCooldown = 0.6;

      this.game.collectibles.open(chest);

      // W-D6 切片8：开箱也走字幕线索 —— 声音由 AudioManager 听 game-cue 播，字幕由 Captions 听同一条画
      emitCue('pickup');

      prompt.classList.add('hidden');

      return;

    }



    if (this.game.dungeons?.active) {

      if (this.game.dungeons.tryReadLore(this.position)) {

        keys[codeFor('interact')] = false;

        this.interactCooldown = 0.6;

        prompt.classList.add('hidden');

        return;

      }

      if (this.game.dungeons.tryExit(this.position)) {

        keys[codeFor('interact')] = false;

        this.interactCooldown = 0.8;

        prompt.classList.add('hidden');

        return;

      }

    } else {

      const dungeon = this.game.dungeons?.getEntranceNear(this.position, 5);

      if (dungeon) {

        keys[codeFor('interact')] = false;

        this.interactCooldown = 0.8;

        this.game.dungeons.enter(dungeon, this);

        prompt.classList.add('hidden');

        return;

      }

    }



    this.nearbyPoint = this.world.getNearestPointOfInterest(this.position, this.interactRadius);

    if (this.nearbyPoint) {

      keys[codeFor('interact')] = false;

      this.interactCooldown = 0.6;

      // 以前这里写 `this.nearbyPoint.discovered = true;` —— 那个字段全仓没有读者（写一次、没人读，
      // 也不进存档），W-A2 尾巴③记的"discovered 不进存档"其实先该问"有没有人读它"。
      // 发现与否由 `discovery` 事件与 `explorationMap.poiRevealed` 说话，那两份是真的有人消费。

      window.dispatchEvent(new CustomEvent('poi-interact', { detail: { id: this.nearbyPoint.id } }));

      this.nearbyPoint.onInteract?.();

    }

    this.updatePrompt(prompt);

  }



  updatePrompt(prompt) {

    const rest = this.game.restPoints.getNearest(this.position, 4);

    const npc = this.game.npcs.getNearest(this.position, 4);

    const chest = this.game.collectibles.tryOpen(this.position, 3.5);

    this.nearbyPoint = this.world.getNearestPointOfInterest(this.position, this.interactRadius);

    const dungeon = !this.game.dungeons?.active ? this.game.dungeons?.getEntranceNear(this.position, 5) : null;

    // 键名走生效表（切片6）：模板是字面量，所以每帧只是查一次缓存，不重新拼字符串
    const interact = keyText('[{interact}]');

    if (this.game.dungeons?.active) {
      const hint = this.game.dungeons.getExplorationHint();
      const lore = this.game.dungeons.getNearbyLore?.(this.position);
      prompt.classList.remove('hidden');
      if (lore) {
        prompt.textContent = t('prompt_dungeon_read_fmt', { interact, title: t(lore.title) });
      } else if (hint?.bossAlive) {
        prompt.textContent = t('prompt_dungeon_boss_leave', { interact });
      } else if (hint?.enemies > 0) {
        prompt.textContent = t('prompt_dungeon_room_enemies_fmt', { interact, enemies: hint.enemies });
      } else if (hint?.isExit) {
        prompt.textContent = t('prompt_dungeon_leave_fmt', { interact, name: hint.name });
      } else {
        prompt.textContent = t('prompt_dungeon_explore_fmt', { interact, visited: hint?.visited, total: hint?.total });
      }
    } else if (rest) {

      prompt.classList.remove('hidden');

      const rn = this.game.restNpcs?.getByRestId?.(rest.id);

      // 营火名在 `RestPointManager.buildDefaults` 那一刻就展开好了（世界里存的是显示名）
      prompt.textContent = rn
        ? t('prompt_rest_npc_fmt', { interact, npc: rn.name, rest: rest.name })
        : t('prompt_rest_plain_fmt', { interact, rest: rest.name });

    } else if (npc) {

      prompt.classList.remove('hidden');

      prompt.textContent = t('prompt_npc_talk_fmt', { interact, name: npc.name });

    } else if (chest) {

      prompt.classList.remove('hidden');

      prompt.textContent = t('prompt_chest_open', { interact });

    } else if (dungeon) {

      prompt.classList.remove('hidden');

      prompt.textContent = t('dungeon_enter_prompt_fmt', { interact, name: t(dungeon.def.name) });

    } else if (this.nearbyPoint) {

      prompt.classList.remove('hidden');

      prompt.textContent = `${interact} ${t(this.nearbyPoint.label)}`;

    } else {

      prompt.classList.add('hidden');

    }

  }



  _isVoidZone() {

    // 修 B36：重力反转此前靠中文区域名匹配（`name.includes('时线')`），

    // 改一行字幕就能让整个时线位面的玩法消失。现在问世界层要 id。

    return this.world.zoneId === ZONE_IDS.VOID;

  }



  /**
   * 阻尼槽重播种（B122 / B120 尾巴①）。
   *
   * 原判据只认「槽还是 (0,0,0)」这一种没用过的状态。NaN 是另一种更糟的状态：
   * `lerp` 从 NaN 出发还是 NaN，而 `lengthSq()` 在 NaN 上算出 NaN，判据永不为真 ——
   * 于是玩家被救回有限地面 600 帧之后机位仍是 `[#,NaN,#]`（`.tmp-20261017-b122/probe-camera-nan.mjs`
   * 用真 rig + 真相机 + 真 PlayerController 实测），四元数跟着全 NaN，视锥平面变垃圾、剔除"看见一切"。
   * 所以"这槽能不能用"必须问有限性，而不只问是不是零。
   *
   * 期望值本身非有限时照旧播种（那时 rig 会拒收这一笔，画面停在最后一帧有效机位），
   * 关键区别是：**上游一旦回到有限值，下一帧就能自己接上**，不需要任何外力去复位。
   */
  _reseedIfUnusable(desired, look) {
    if (!isFiniteVec3(this.currentCameraPos) || !isFiniteVec3(this.currentLookTarget)
      || this.currentCameraPos.lengthSq() === 0) {
      this.currentCameraPos.copy(desired);
      this.currentLookTarget.copy(look);
    }
  }



  _updateFirstPersonCamera(dt) {

    const eyeY = this.position.y + this.eyeHeight;

    const pos = this._camTmp.set(this.position.x, eyeY, this.position.z);

    pos.addScaledVector(this.getRightXZ(this._camTmpRight), 0.12);



    /* 统一 pitch 语义：**pitch > 0 = 视线朝下**。两人称必须同一把尺 ——
     * 第三人称里 pitch > 0 意味着相机升到支点之上（`_updateThirdPersonCamera` 的
     * `pivot.y + sinP * dist`），画面是俯身看角色；第一人称原本写 `Math.sin(pitch)`，
     * 同一个正值却变成抬头。于是**同一个 pitch 值在两人称描述相反的方向**，
     * 按 V 切换视角时视线被整个翻个面（探针 `.tmp-scan/probe-camera-pitch.mjs`
     * 实测：第三人称把镜头推到高位俯视角色时切第一人称，同一个 pitch 值变成仰望天空）
     * —— 玩家的说法是"视角转换有问题、操作对玩家很不友好"。这里取反与第三人称对齐：
     * 同一个 pitch 值在两人称描述同一件事，切视角不再翻面。鼠标手感由
     * `addCameraInput` 里对第一人称 dy 取反补回（两边各自符合常识）。
     * 存储语义不变（存档字段不迁移）。 */
    const look = this._camTmp2.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    );

    /* 处决 / 终结技的机位对第一人称同样要成立。眼睛搬不走（那等于硬切成旁观镜头），
     * 但"看哪里"可以借：注视点按 director 给出的同一档 blend 拉向被处决者。
     * 旧实现整段不读演出镜头，于是第一人称按处决时只剩黑边与慢动作，画面仍朝着鼠标。 */
    const ov = this.game?.combatCamera?.getCameraOverrides?.() ?? null;
    if (ov && ov.gaze > 0 && ov.orbit) {
      this._camTmp3.copy(ov.orbit.lookAt).sub(pos);
      if (this._camTmp3.lengthSq() > 1e-6) {
        look.lerp(this._camTmp3.normalize(), Math.min(1, ov.gaze));
      }
    }

    if (ov?.fovAdd) this.rig.requestFov(FOV_LAYER_OVERRIDE, ov.fovAdd);

    const target = this._camTmp4.copy(pos).addScaledVector(look, 12);



    this.shake.applyTo(pos, target);



    const smooth = 1 - Math.exp(-22 * dt);

    // 阻尼槽"能不能用"要问有限性，不只问是不是零 —— 见 `_reseedIfUnusable` 的注（B122）
    this._reseedIfUnusable(pos, target);

    this.currentCameraPos.lerp(pos, smooth);

    this.currentLookTarget.lerp(target, smooth);

    this.rig.setView(this.currentCameraPos, this.currentLookTarget,
      { owner: 'player', transition: CAMERA_BLEND.exit });

  }



  _updateThirdPersonCamera(dt) {
    const yaw = this.yaw;
    const pitch = this.pitch;
    const combatCam = this.game?.combatCamera?.getCameraOverrides?.() ?? CAMERA_OVERRIDES_NONE;
    const restCam = !combatCam.lockOrbit ? (this.game?.restScene?.getCameraOverrides?.() ?? CAMERA_OVERRIDES_NONE) : combatCam;
    const camDir = combatCam.lockOrbit ? combatCam : restCam;
    const lockTarget = this.combat?.getLockTarget?.();
    let dist = lockTarget
      ? THREE.MathUtils.lerp(this.cameraDistance, LOCK_ON_CAMERA.distance, LOCK_ON_CAMERA.distanceBlend)
      : this.cameraDistance;
    dist = Math.max(this.minCameraDistance, dist - camDir.pull);

    const pivot = this._camTmp.set(this.position.x, this.position.y + this.pivotHeight, this.position.z);
    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);

    let desired = this._camTmp2.set(
      pivot.x - Math.sin(yaw) * cosP * dist,
      pivot.y + sinP * dist,
      pivot.z - Math.cos(yaw) * cosP * dist
    );

    const shoulder = lockTarget ? this.shoulderOffset : this.shoulderOffset * 0.5;
    desired.addScaledVector(this.getRightXZ(this._camTmpRight), shoulder);

    if (camDir.lockOrbit && camDir.orbit?.position) {
      const blend = camDir.orbit.blend ?? 1;
      desired.lerp(camDir.orbit.position, blend);
    }

    const ground = this.world.getGroundHeight(desired.x, desired.z) + CAMERA_OCCLUSION.groundLift;
    if (desired.y < ground) desired.y = ground;

    /* 地形遮挡：走一格查一格，被吃掉的那一格退回上一格并把机位**抬到坡面之上** ——
     * 山坡该让镜头升高，而不是把力臂缩短（缩短到一米出头就没法看人走路了）。 */
    for (let i = 1; i <= CAMERA_OCCLUSION.terrainSteps; i++) {
      const k = i / CAMERA_OCCLUSION.terrainSteps;
      const px = pivot.x + (desired.x - pivot.x) * k;
      const py = pivot.y + (desired.y - pivot.y) * k;
      const pz = pivot.z + (desired.z - pivot.z) * k;
      const blockY = this.world.getGroundHeight(px, pz) + CAMERA_OCCLUSION.blockClearance;
      if (py < blockY) {
        desired.lerpVectors(pivot, desired, (i - 1) / CAMERA_OCCLUSION.terrainSteps);
        desired.y = Math.max(desired.y, blockY);
        break;
      }
    }

    /* 实体遮挡（修 B3）：墙、柱、树干旧实现完全不看，镜头直接穿进建筑里。
     * 与地形分开处理：地形靠"抬高"，实体只能"缩短" —— 墙是抬不过去的。
     * 查询用 `blocksPoint()` 而不是 `blocked()`：后者按 1.5 米一格采段内点，
     * 我们每步只有 0.65 米，拿它当逐段查询会一路返回"没挡住"，遮挡静默失效。 */
    const cw = this.world.collision ?? null;
    if (cw) {
      this._pullInFromSolids(pivot, desired);
    }
    this._resolveThirdPersonLook(pivot, desired, camDir, lockTarget, dt);
  }

  /** 实体遮挡：把机位沿"支点 → 期望机位"往回收，收到贴着障碍物的前面 */
  _pullInFromSolids(pivot, desired) {
    const cw = this.world.collision;
    const wanted = this._camTmp5.copy(desired);
    const steps = CAMERA_OCCLUSION.steps;
    const len = pivot.distanceTo(wanted) || 1;
    const solidAt = (k) => {
      const px = pivot.x + (wanted.x - pivot.x) * k;
      const py = pivot.y + (wanted.y - pivot.y) * k;
      const pz = pivot.z + (wanted.z - pivot.z) * k;
      return cw.blocksPoint(px, pz, py, CAMERA_OCCLUSION.pointPad);
    };
    let hitAt = 0;
    for (let i = 1; i <= steps; i++) {
      if (solidAt(i / steps)) { hitAt = i / steps; break; }
    }
    let t = 1;
    if (hitAt > 0) {
      /* 前向 march 的一格是 0.65 米级，直接退回上一格会让镜头停在一米开外
       * （玩家贴墙时表现为"镜头被远远拽走"）。在最后一格安全与第一格被挡之间再夹几刀。 */
      let lo = hitAt - 1 / steps;
      let hi = hitAt;
      for (let i = 0; i < CAMERA_OCCLUSION.refine; i++) {
        const mid = (lo + hi) / 2;
        if (solidAt(mid)) hi = mid; else lo = mid;
      }
      t = Math.max(CAMERA_OCCLUSION.minPull, lo - CAMERA_OCCLUSION.wallMargin / len);
    }
    if (t < 1) desired.lerpVectors(pivot, wanted, t);
  }

  /** 注视点、抖动与落笔 */
  _resolveThirdPersonLook(pivot, desired, camDir, lockTarget, dt) {

    const lookAt = this._camTmpLook.set(pivot.x, pivot.y + 0.12, pivot.z);
    if (camDir.lockOrbit && camDir.orbit?.lookAt) {
      lookAt.lerp(camDir.orbit.lookAt, camDir.orbit.blend ?? 0.85);
    } else if (lockTarget) {
      const t = lockTarget.position;
      lookAt.lerp(this._camTmpLookB.set(t.x, t.y + 1.35, t.z), 0.38);
    } else if (camDir.focus) {
      lookAt.lerp(this._camTmpLookB.set(camDir.focus.x, camDir.focus.y + 1.2, camDir.focus.z), camDir.lookBias);
    }

    this.shake.applyTo(desired, lookAt);

    // 阻尼槽"能不能用"要问有限性，不只问是不是零 —— 见 `_reseedIfUnusable` 的注（B122）
    this._reseedIfUnusable(desired, lookAt);

    /* 收进来快、伸出去慢：贴墙时镜头必须立刻让位（否则就是穿模），
     * 离开墙时慢慢展开（否则每贴一次墙画面就弹一下）。两个速率都按秒算，与帧率无关。 */
    const pulling = pivot.distanceTo(desired) < pivot.distanceTo(this.currentCameraPos);
    const smooth = 1 - Math.exp(-(pulling ? CAMERA_OCCLUSION.retractRate : CAMERA_OCCLUSION.extendRate) * dt);
    this.currentCameraPos.lerp(desired, smooth);
    this.currentLookTarget.lerp(lookAt, smooth);
    if (camDir.fovAdd) this.rig.requestFov(FOV_LAYER_OVERRIDE, camDir.fovAdd);
    this.rig.setView(this.currentCameraPos, this.currentLookTarget,
      { owner: 'player', transition: CAMERA_BLEND.exit });
  }



  /** 每帧相机的唯一入口：内部只算机位，落笔一律交给 `rig`（渲染器读的 `this.camera` 与 rig 是同一台） */
  updateCamera(dt) {

    if (this.cameraMode === 'first') this._updateFirstPersonCamera(dt);

    else this._updateThirdPersonCamera(dt);

  }

  /**
   * 拆干净：把玩家从场景里摘掉，拆掉动画适配器与那具模型。
   *
   * 为什么现在才有（W-C1 切片3j）：`Game._adopt` **拒绝**没有 `dispose()` 的子系统
   * （"假装收编"的防线），而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒
   * `Game.dispose()` 走完，玩家造的资源（模型 / 剑 / 混放器）**一份都不还**。
   *
   * **剑的几何与材质归模型那一组**（剑挂在模型的视觉根上 ⇒ 在 `CharacterModel` 那一组里）
   * ⇒ 由 `CharacterModel.dispose()` 释放，这里**不重复一遍**。
   *
   * 这一层**自己没有监听**（它读输入设备，不订阅事件）⇒ 收编它不会漏掉解绑。
   */
  dispose() {
    this.scene?.remove(this.mesh);
    this.animAdapter?.dispose?.();
    this.animAdapter = null;
    this.characterModel?.dispose?.();
  }

}


