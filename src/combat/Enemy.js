import * as THREE from 'three';
import { createHurtbox, pickPart } from './Hurtbox.js';
import { AI, BODY_PLANS, ENEMY_DEFENSE, ENEMY_RESIST, HIT, SUMMON } from '../content/tuning.js';
import {
  fanTargets, holdRangeOf, moveHits, moveRange, pickMove, resolveMoveSet, seededRng, threatRangeOf,
} from './EnemyMoves.js';
import { Sense } from '../ai/Perception.js';
import { createEnemyFSM, tryClaimStrikeSlot } from '../ai/EnemyFSM.js';
import { separationPush } from '../ai/Separation.js';
import { Billboard } from '../effects/Billboard.js';
import { applyShadow } from '../engine/shadowPolicy.js';
import { TextureLibrary } from '../assets/TextureLibrary.js';
import { SURFACE_SPECS } from '../content/materialSurfaces.js';
import { paletteOf } from '../content/materialPalette.js';
import { makeUvBoxGeometry, makeUvCapsuleGeometry, makeUvConeGeometry } from '../engine/uvGeometry.js';

/** 分离推力在两个身体完全重合时需要一个稳定的"每人一个方向"，用出生顺序做身份差 */
let aiSeq = 0;

/* ---- 共享几何（W-C2 切片2）----
 * 修前 `createMesh` / `_buildHpBar` / `_buildLockMarker` / `_ensureTelegraph` 里的几何
 * 全部每实例新建：64 个敌人 × 每人 5~8 份 ≈ 数百份一模一样的 CapsuleGeometry /
 * PlaneGeometry / RingGeometry（真实页面 `renderer.info.memory.geometries` 约 545 的主体）。
 * 形状只由类型与构造参数决定，与个体无关 —— 缓存起来，全场景每个形状只建一份。
 * 材质保持每实例一份：受击闪红要改自家 `emissive`，预警圈要按招式改色，不能共。
 * `userData.shared` 是"别 dispose 我"的标记：敌人销毁（`dispose`）与血条 Billboard 销毁
 * 见到它就跳过 —— 几何归缓存所有，随页面生命周期存活（与 dungeonAssets 的 sharedGeo 同一口径）。
 *
 * W-C5 切片4 起：身体 / 盔 / 翼 / 肩甲 / 炮管 / 撞角这些**走 `mat` 的件**改用米制 UV 族
 * （`engine/uvGeometry.js`，键前缀 `uv:`）以贴装甲板面（plate）—— 体格放大（BODY_PLANS.scale）
 * 不会把板子一起放大。自发光核心 / 半透明罩袍仍用各自的材质与裸几何（不换贴图，UV 没人读）。
 */
const ENEMY_GEO = new Map();

/** 按"类型 + 构造参数"取一份共享几何；key 必须把决定形状的参数写全 */
function enemyGeo(key, make) {
  let g = ENEMY_GEO.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    ENEMY_GEO.set(key, g);
  }
  return g;
}

/** 给门禁用的读数：共享库里现在持有几份几何（tests/enemy-shared-geometry.test.js） */
export function enemyGeoStats() {
  return ENEMY_GEO.size;
}

export class Enemy {
  constructor(scene, world, config) {
    this.scene = scene;
    this.world = world;
    this.aiSeed = ++aiSeq;
    this.name = config.name ?? '敌人';
    this.type = config.type ?? 'soldier';
    this.position = new THREE.Vector3(config.x, 0, config.z);
    this.maxHp = config.hp ?? 100;
    this.hp = this.maxHp;
    this.maxPosture = config.posture ?? 60;
    this.posture = 0;
    this.damage = config.damage ?? 12;
    this.speed = config.speed ?? 5;
    this.aggroRange = config.aggroRange ?? 18;
    this.attackRange = config.attackRange ?? 2.2;
    this.canAttack = config.canAttack ?? true;
    this.respawn = config.respawn ?? true;
    this.respawnTime = config.respawnTime ?? 8;
    this.deathTimer = 0;
    this.state = 'idle';
    this.stateTimer = 0;
    this.attackCooldown = 0;
    this.staggerTimer = 0;
    this.hitFlash = 0;
    this.bodyMesh = null;
    this.spawnPoint = this.position.clone();
    this.alive = true;
    this.isBoss = config.type === 'boss';

    /** 受击方对外只暴露这几个只读量，结算由 combat/Resolution.js 统一算（M2） */
    this.defense = config.defense ?? ENEMY_DEFENSE[this.type] ?? 0;
    this.resist = config.resist ?? ENEMY_RESIST[this.type] ?? {};
    this.hurtbox = createHurtbox(this.type, config.hurtScale ?? 1);
    /** 网格原点离地高度：体型表给出（悬浮单位），它和打击带必须一起调 */
    this.hover = config.hover ?? BODY_PLANS[this.type]?.hover ?? 0;
    /** 分离与碰撞用的身体半径 */
    this.radius = config.radius ?? BODY_PLANS[this.type]?.radius ?? 0.45;
    /** AI 行为参数：默认全表，spawn config 可按只覆盖（同一类敌人也能有特例） */
    this.ai = { ...AI, ...(config.ai ?? {}) };
    /** 招式表：整类默认取自 `ENEMY_MOVE_SETS`，spawn config 的 `moves` 可给 id 或内联招式 */
    this.moves = resolveMoveSet(this.type, config.moves);
    /** 所有招式里最远的落点：追击要跑到这里才停（远程单位不再一路贴脸） */
    this.threatRange = threatRangeOf(this);
    /** 没抢到进攻名额时想站住的距离 */
    this.holdRange = holdRangeOf(this);
    /** 选招随机数按身份播种：同一只敌人每次运行顺序一致，同一群又不会整齐出同一招 */
    this.moveRng = seededRng(this.aiSeed * 7919 + 13);
    /** 当前招式与剩余连段数；`windupNow` 是本段前摇（连段后续段被压缩） */
    this.activeMove = null;
    this.comboLeft = 0;
    this.windupNow = 0;
    this.squad = config.squad ?? null;
    this.sense = new Sense(this);
    /** 绕行手性：由出生点定死，同一群敌人不会全往同一边绕 */
    this.orbitSide = (Math.round((this.spawnPoint.x + this.spawnPoint.z) / 3) % 2) ? 1 : -1;
    /** 本帧位移意图，由状态机写入，`_advance()` 统一积分 */
    this.wish = { x: 0, z: 0 };
    /** 外部冲量（击退）：由结算侧 `applyKnockback()` 请求，与 AI 意图分开积分、按秒衰减 */
    this.knock = { x: 0, z: 0 };
    /** 质量：体型 scale 越大越推不动（Boss 与小兵吃到同样的重击不该跑一样远） */
    this.mass = config.mass ?? BODY_PLANS[this.type]?.scale ?? 1;

    /* ---- 召唤：归属、配额与生命周期。三件事都由 EnemyManager 统一记账 ----
     * `summonQuota` 是管理器每帧盖下来的"你现在还能放出几只"（名额是全局资源，
     * 敌人自己无权决定）；仆从则拿着 `summoner` 的引用，召唤者一死就跟着消散。 */
    this.isSummon = config.isSummon === true;
    this.summoner = config.summoner ?? null;
    this.summonTtl = this.isSummon ? (config.summonTtl ?? SUMMON.life) : 0;
    this.summonQuota = 0;

    this.fsm = createEnemyFSM(this);

    this.mesh = this.createMesh(config);
    this.mesh.userData.enemy = this;
    this.updateMeshY();
    scene.add(this.mesh);

    /* 世界空间 UI 一律挂场景根，不挂在 `mesh` 上（W-A3）：
     * `mesh.rotation` 同时承担"朝向移动方向"与"悬浮摆动"，挂上去的血条会
     * 跟着转成一条线、跟着歪成斜的。见 `effects/Billboard.js` 的说明。 */
    this.hpBar = this._buildHpBar(scene);
    this.lockMarker = this._buildLockMarker(scene);
    this.updateHpBar();
    this.setLocked(false);
  }

  /** 血条的尺寸 / 配色 / 离地高度：子类按各自体型覆盖 */
  hpBarSpec() {
    return { width: 1.2, height: 0.12, color: 0xcc3333, bg: 0x222222, offsetY: 2.8 };
  }

  _buildHpBar(scene) {
    const spec = this.hpBarSpec();
    const bar = new Billboard(scene, { name: 'hpBar', offsetY: spec.offsetY });
    if (spec.bg != null) {
      const bg = new THREE.Mesh(
        enemyGeo(`hpBg:plane:${spec.width},${spec.height}`, () => new THREE.PlaneGeometry(spec.width, spec.height)),
        new THREE.MeshBasicMaterial({ color: spec.bg })
      );
      bar.add(bg);
    }
    const fillW = spec.width * (spec.fillScale ?? 0.983);
    const fillH = spec.height * 0.83;
    const fill = new THREE.Mesh(
      enemyGeo(`hpFill:plane:${fillW},${fillH}`, () => new THREE.PlaneGeometry(fillW, fillH)),
      new THREE.MeshBasicMaterial({ color: spec.color })
    );
    // 稍稍前移，避免与底板 z-fighting（底板缺失时这点偏移无副作用）
    fill.position.z = 0.01;
    fill.name = 'hpFill';
    bar.add(fill);
    bar.setVisible(true);
    return bar;
  }

  /** 锁定标记：地面环 + 头顶菱形。环仍是平的（只绕 Y 转，不受影响） */
  _buildLockMarker(scene) {
    const marker = new Billboard(scene, { name: 'lockMarker', offsetY: this.hpBarSpec().offsetY });
    const ring = new THREE.Mesh(
      enemyGeo('lockRing:0.65,0.85,4', () => new THREE.RingGeometry(0.65, 0.85, 4)),
      new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -this.hpBarSpec().offsetY + 0.05;
    marker.add(ring);
    const diamond = new THREE.Mesh(
      enemyGeo('lockDiamond:cone:0.18,0.45,4', () => new THREE.ConeGeometry(0.18, 0.45, 4)),
      new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.9 })
    );
    diamond.position.y = 0.55;
    marker.add(diamond);
    marker.setVisible(false);
    return marker;
  }

  /** 受击盒的世界基准：网格原点已含地形高差与悬浮高度 */
  hurtBaseY() {
    return this.mesh.position.y;
  }

  /** 朝向（与本仓库一致：atan2(dx, dz)），背刺判定用 */
  facingYaw() {
    return this.mesh.rotation.y;
  }

  /**
   * 取景用：受击盒最高段的上沿离**网格原点**多高。
   * 处决镜头需要这个数，否则会拿"人类身高"去框所有目标 —— Boss 3.85 米与
   * 无人机 1.87 米得到一模一样的构图。悬浮单位不含 `hover`：那是基准的事，
   * 由 `hurtBaseY()` 一起交出，镜头自己相加。
   */
  statureHeight() {
    return this.hurtbox.segments.reduce((top, seg) => Math.max(top, seg.y1), 0);
  }

  getDefense() {
    return this.defense;
  }

  getResist(element) {
    return this.resist?.[element] ?? 0;
  }

  isStaggered() {
    return this.staggerTimer > 0;
  }

  /** 弹反窗口：已起手且进入本招前摇的后半段。窗口按**这一招**的前摇算，
   *  定值写法会让短前摇的快招根本弹不了（0.4 秒的突刺永远在窗口外结束） */
  isParriable() {
    // 霸体招不给弹反窗口（W-B7 切片4）：弹得动却打不断是玩家读不出来的错位，
    // 与 forceStagger 共用同一个判据 —— 这一招只能用走位解
    if (this.isUnstoppableNow()) return false;
    return this.canAttack && this.state === 'windup'
      && this.stateTimer > this.windupNow * this.ai.parryRatio;
  }

  /**
   * 这一招此刻是不是"霸体"（W-B7 切片4）。
   *
   * 只护**出手段**（windup / strike）：预警已经当众说出口，走完收招照常能被按进硬直。
   * 架势**没有**被豁免：打满的那一笔照常记在账上（只是不落地），所以霸体一结束，
   * 第一下就把它按下去 —— "破防→处决"这条循环被推迟，不是被取消，玩家学得到。
   */
  isUnstoppableNow() {
    if (!this.activeMove?.unstoppable) return false;
    return this.fsm.current === 'windup' || this.fsm.current === 'strike';
  }

  /** 正面格挡是否举着：只在防御招的命中段成立。
   *  硬直/死亡/收招都自动落空（`fsm.current` 已经离开 strike），不需要额外记账 */
  isGuarding() {
    return this.alive && this.fsm.current === 'strike' && this.activeMove?.guard === true;
  }

  /** 外部强制硬直（弹反成功）：架势条清零、交出进攻名额并立刻进入 stagger */
  forceStagger(seconds) {
    // 霸体（W-B7 切片4）：出手段拒绝硬直；返回 false 让调用方读得出"这一下没打断它"。
    // 这里不清架势 —— 攒满的那笔账要留到这一招走完，正是"霸体护招不护命"的落点
    if (this.isUnstoppableNow()) return false;
    this.staggerTimer = seconds;
    this.posture = 0;
    this.fsm.change('stagger');
    this.state = 'stagger';
    this.stateTimer = 0;
    this.clearTelegraph();
    return true;
  }

  /* ------------------------------------------------------------------ *
   * 状态机的动作原语：状态只调这些，不直接碰 position / mesh / 碰撞
   * ------------------------------------------------------------------ */

  separationRadius() {
    return this.radius;
  }

  separationSeed() {
    return this.aiSeed;
  }

  /** 本帧朝向的单位向量（与全仓库正方向一致：`(sin yaw, cos yaw)`） */
  facingDir() {
    const yaw = this.mesh.rotation.y;
    return { x: Math.sin(yaw), z: Math.cos(yaw) };
  }

  /** 朝向与"指向目标"的夹角余弦：招式锥形判定用 */
  facingDotTo(pos) {
    const dx = pos.x - this.position.x;
    const dz = pos.z - this.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const f = this.facingDir();
    return (f.x * dx + f.z * dz) / len;
  }

  /** 面向"感知到的目标"的贴合度：抢名额与选招共用，没有目标时视为完全没面向 */
  aimDot() {
    return this.sense.target ? this.facingDotTo(this.sense.target) : -2;
  }

  /**
   * 起手：连段的首段选招并起完整前摇，后续段沿用同一招但压到 `comboWindup`。
   * 只在进入 windup 那一帧调用（随机数在这里取，资格判定不含随机）。
   */
  beginMove() {
    const first = !this.activeMove || this.comboLeft <= 0;
    if (first) {
      this.activeMove = pickMove(this, this.sense.dist, this.aimDot(), this.moveRng);
      this.comboLeft = this.activeMove ? (this.activeMove.combo ?? 1) : 0;
    } else {
      this.comboLeft -= 1;
    }
    const m = this.activeMove;
    this.windupNow = m ? (first ? m.windup : (m.comboWindup ?? m.windup)) : 0;
    return m;
  }

  /** 承诺段时长：没有招式就立刻走完（目标中途消失时的自愈路径） */
  strikeDur() { return this.activeMove?.strike ?? 0; }

  recoverDur() { return this.activeMove?.recover ?? 0; }

  /**
   * 一次进攻序列结束（走完收招、或被打断、或死亡）：连段计数与当前招式一起清零。
   * 不清零的话下一轮起手会被当成"上一招的后续段"，既沿用旧招的距离容差而空挥，
   * 又把前摇压成 comboWindup，等于所有敌人的第二招都变成更快更长的第一招。
   */
  endMove() {
    this.activeMove = null;
    this.comboLeft = 0;
    this.windupNow = 0;
  }

  /**
   * 预警圈该画多大：范围招画真实危险半径，"伤害会离开身体"的招只给自己一圈起手提示。
   *
   * 远程与裂隙同属后一类：真正的危险要么在弹体上、要么在玩家脚下那块地里，圈长在敌人
   * 自己身上就只是在说"我在起手"。按 `moveRange`（裂隙是 7 米的抛掷距离）画出来的话，
   * 玩家会后退七米以为躲开了，而那块地还是在原处开 —— 圈要说的是"离开哪儿"，不是"离我多远"。
   */
  teleRadius() {
    const m = this.activeMove;
    if (!m) return 1.05;
    if (m.aoe) return m.aoe;
    if (m.ranged || m.hazard) return this.attackRange;
    return moveRange(this, m);
  }

  /** 本帧位移意图（米/秒），由状态写入、`_advance()` 积分 */
  setWish(vx, vz) {
    this.wish.x = vx;
    this.wish.z = vz;
  }

  /**
   * 请求一次击退：`dirX/dirZ` 是"攻击者指向目标"的水平单位向量，`speed` 是初速（米/秒）。
   *
   * 与 `setWish` 的区别是这里给的是**外力**：AI 下一秒想往哪走照旧，冲量单独按秒衰减，
   * 所以打退一步不会被"想靠近"的意图立刻吞掉，也不会把状态机改成击退态。
   * 硬直中的敌人吃全额（这正是把大家伙打进硬直的意义），起手/命中段只吃一小部分 ——
   * 预警已经当众说出口，完全钉住就没有重击的位移反馈，全额推开又会让预警圈说谎。
   */
  applyKnockback(dirX, dirZ, speed = HIT.speed) {
    if (!this.alive || !(speed > 0)) return 0;
    const rooted = this.fsm.current === 'windup' || this.fsm.current === 'strike';
    const s = speed
      * (rooted ? HIT.rootedScale : 1)
      * (this.isStaggered() ? HIT.staggerScale : 1)
      / Math.max(0.2, 1 + (this.mass - 1) * HIT.massDivisor);
    this.knock.x += dirX * s;
    this.knock.z += dirZ * s;
    return s;
  }

  clearKnockback() {
    this.knock.x = 0;
    this.knock.z = 0;
  }

  facePoint(pos, dt, rate = 8) {
    const want = Math.atan2(pos.x - this.position.x, pos.z - this.position.z);
    let d = want - this.mesh.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    // 与帧率无关的指数逼近：dt 越大补得越多，但不会一步拧过去
    this.mesh.rotation.y += d * (1 - Math.exp(-rate * dt));
  }

  faceSpin(dt) {
    this.mesh.rotation.y += dt * 0.3;
  }

  wobble(t, freq, amp) {
    this.mesh.rotation.z = Math.sin(t * freq) * amp;
  }

  upright() {
    this.mesh.rotation.z = 0;
  }

  /** 预警的脉动（纯表现）：圈长到本招真实落点，脉动频率随前摇变短而变急 */
  pulseTelegraph(t, dt) {
    const parts = this.teleParts;
    if (!parts) return;
    const { ring, inner, warn } = parts;
    const p = this.windupNow > 0 ? Math.min(1, t / this.windupNow) : 1;
    const urgency = 8 + 10 * (1 - Math.min(1, this.windupNow / 1.2));
    const scale = (0.4 + 0.6 * p) * this.teleRadius() / 1.05;
    ring.material.opacity = 0.45 + Math.sin(t * urgency) * 0.3;
    ring.scale.setScalar(scale);
    inner.material.opacity = 0.6 + Math.sin(t * (urgency + 6)) * 0.4;
    inner.scale.setScalar(scale);
    if (warn.visible) {
      warn.rotation.y += dt * 6;
      warn.position.y = 2.55 + Math.sin(t * 18) * 0.08;
    }
  }

  /** 前摇结束那一帧落地：伤害与距离都按**这一招**算，玩家侧只走公开接口 */
  landStrike(ctx) {
    const ref = ctx.playerRef;
    const move = this.activeMove;
    if (!ref || !move) return false;
    // 防御招的"命中段"是举着盾的那段时间：不打人，减免由 Resolution 在玩家出手那一侧算
    if (move.guard) return false;
    /* 召唤招：敌人只说"按这份规格放仆从"，出生点、名额、归属与生命周期全归管理器。
     * 直接在这里往 enemies 里塞东西会在迭代途中改数组，也会让"谁创建了谁"变成一笔糊账 */
    if (move.summon) return ctx.summon ? ctx.summon(this, move.summon) === true : false;
    /* 相位招：命中段落的是"我到你背后"这一步。落点越过目标 `reach` 米，位移走碰撞
     * （`blinkBehind`），所以相位是位移、不是穿模 —— 玩家背靠墙时落点会短一截，
     * 代价是这一刀砍在墙外，而不是"贴进墙里劈"。落点之后照样走下面同一条 `moveHits`，
     * 它按 `landRange`（近战那一档）判距离，所以闪不动时也判不出"隔着八米命中" */
    if (move.phase) this.blinkBehind(ctx.target, ctx.collision, move);
    const damage = Math.round(this.damage * (move.damage ?? 1));
    if (move.ranged) {
      // 远程：命中段改为交出弹体，弹体在玩家侧走同一条 takeDamage 结算。
      // `ranged.count` > 1 时交出的是一个**扇面**（落点由 `fanTargets` 纯几何算）：
      // 单发与旧行为逐字相同（count 缺省时 `fanTargets` 原样回目标自己）。
      const p = ctx.projectiles;
      if (!p) return false;
      for (const aim of fanTargets(this.position, ctx.target, move.ranged)) {
        const point = ctx.target.clone();
        point.x = aim.x;
        point.z = aim.z;
        p.spawn(this.position, point, damage, move.ranged.speed, move.ranged.color);
      }
      return true;
    }
    const dist = this.distanceTo(ctx.target);
    if (!moveHits(this, move, dist, this.facingDotTo(ctx.target))) return false;
    /* 裂隙：命中段交出的是"玩家此刻脚下这块地归我了"，这一帧一次血都不掉 —— 伤害由
     * `GroundHazards` 按段结。`hazard.damage` 是乘数（与其余招同一写法），绝对值在这里
     * 按本体伤害算一次，别处不再复制一份。无敌帧不挡这一手：圈不是"这一下"，是接下来
     * 几秒的一块地，躲它的办法是走出去而不是在这一帧闪一下。
     * 圆心取**玩家此刻的位置**、不是敌人脚下 —— 这正是它与 `aoe` 的分界：`aoe` 说的是
     * "别站我旁边"，`rift` 说的是"别站你刚才那块地"。 */
    if (move.hazard) {
      const h = ctx.hazards;
      if (!h) return false;
      h.spawn({
        x: ctx.target.x,
        z: ctx.target.z,
        radius: move.hazard.radius,
        telegraph: move.hazard.telegraph,
        damage: Math.round(this.damage * move.hazard.damage),
        duration: move.hazard.duration,
        tick: move.hazard.tick,
        color: move.hazard.color,
        owner: this,
      });
      return true;
    }
    if (ref.combat.isInvulnerable()) return false;
    // 竖直方向也要相交：横扫低段该被跳掉、重劈高段跳不掉、玩家站高台时近战全部落空
    const part = pickPart(ref.combat, this.hurtBaseY(), move.band);
    if (!part) return false;
    /* 推开这一类附带位移（刀背/盾击的 `move.knock`）经 `impact` 一并交给咽喉
     * （W-A6 切片7）：记账纪律写在 `CombatController.takeDamage` —— "真的砍到了才顶开、
     * 无敌帧与跳掉的低段不附赠位移"那一段。这里只负责把"谁出的手、招要推多远"递过去。 */
    ref.combat.takeDamage(damage, null, part, { from: this.position, knock: move.knock });
    return true;
  }

  /**
   * 相位落点：越过目标落在它背后 `reach` 米处，落地即转向目标（W-B7 切片2）。
   *
   * 位移过 `moveCircle`：本仓"一个圆怎么沿障碍滑"只有这一处实现，绕开它自己写一份
   * 就会得到"敌人随机穿进墙里"这一族症状（B36 那一族）。
   */
  blinkBehind(target, collision, move) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return false;                       // 与目标重合：没有"另一侧"可言
    const behind = move.reach ?? 1;
    const toX = target.x + (dx / len) * behind - this.position.x;
    const toZ = target.z + (dz / len) * behind - this.position.z;
    const footY = this.world.getGroundHeight(this.position.x, this.position.z);
    const moved = collision
      ? collision.moveCircle(this.position.x, this.position.z, this.radius, toX, toZ, footY)
      : { x: this.position.x + toX, z: this.position.z + toZ };
    this.position.x = moved.x;
    this.position.z = moved.z;
    /* 位置写在这里，贴地就必须同步在这里：`hurtBaseY()` 读的是 `mesh.position.y`，
     * 而 `updateMeshY()` 要到 `Enemy.update()` 末尾才跑 —— 少了这一句，同一帧的命中判定
     * 会拿起跳点的高度去比玩家的。真浏览器里 12.5 米的坡上闪下来、落差 10 米，
     * 竖直方向当场判空，症状是"人已经贴在脸上、血条一动不动"（B67）。 */
    this.updateMeshY();
    // 落地即转向目标：相位是"从背后来的那一刀"，朝向不跟上就是空挥
    this.mesh.rotation.y = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    return true;
  }

  /** 意图 → 分离 → 限速 → 碰撞积分，一帧只在这里写一次位置 */
  _advance(dt, ctx) {
    const push = separationPush(this, ctx.neighbors, this.ai);
    // 预警与命中段扎住脚跟：不受同伴推挤。起手时"这一招能够到哪"是当着玩家说出口的，
    // 中途被挤开 0.7 米就会必然打空（玩家站着不动反而躲掉了），预警圈就成了假话。
    // 后撤段（recover）不冻结，让打完的人顺势退出去、把坑让给排队的同伴。
    const rooted = this.fsm.current === 'windup' || this.fsm.current === 'strike';
    const k = rooted ? 0 : 1;
    // 击退冲量按秒指数衰减。这一帧用的是"衰减曲线在本帧上的平均值"而不是起始值，
    // 于是 30 Hz 与 240 Hz 累计走出的总位移相同（起始值积分会让慢帧率多走一成以上）
    const kx = this.knock.x;
    const kz = this.knock.z;
    const kd = Math.exp(-HIT.decay * dt);
    const km = dt > 0 ? (1 - kd) / (HIT.decay * dt) : 0;
    this.knock.x *= kd;
    this.knock.z *= kd;
    if (Math.abs(this.knock.x) < 1e-3) this.knock.x = 0;
    if (Math.abs(this.knock.z) < 1e-3) this.knock.z = 0;
    let vx = this.wish.x + (push?.x ?? 0) * k + kx * km;
    let vz = this.wish.z + (push?.z ?? 0) * k + kz * km;
    const max = this.speed * 1.6;
    const s = Math.hypot(vx, vz);
    if (s > max) {
      vx *= max / s;
      vz *= max / s;
    }
    if (s < 1e-5) return;
    const c = ctx.collision;
    if (!c) {
      this.position.x += vx * dt;
      this.position.z += vz * dt;
      return;
    }
    const footY = this.world.getGroundHeight(this.position.x, this.position.z);
    const moved = c.moveCircle(this.position.x, this.position.z, this.radius, vx * dt, vz * dt, footY);
    this.position.x = moved.x;
    this.position.z = moved.z;
  }

  createMesh(config) {
    const group = new THREE.Group();
    const color = config.color ?? paletteOf('armor.fallback');
    // 装甲板面（W-C5 切片4）：normal / roughness 来自离线烘焙贴图（`npm run bake:textures`），
    // 颜色仍归每个类型自己的 `color`（名册按类型配色）。UV 以米计 ⇒ 铺数只有一个：1 / 0.5 米。
    // 材质**保持每实例一份**（W-C2 切片2 的口径不变）：受击闪红要改自家 emissive。
    // 拿不到库（同步构建路径 / 这一组没加载出来）退回旧读数：roughness 0.75、无贴图。
    const lib = TextureLibrary.loaded();
    const 板砖 = 1 / SURFACE_SPECS.plate.tileMeters;
    const 板 = lib?.uvVariant('plate', 板砖, 板砖) ?? null;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 板 ? 1.0 : 0.75, metalness: 0.25 });
    if (板) {
      if (板.normalMap) mat.normalMap = 板.normalMap;
      if (板.roughnessMap) mat.roughnessMap = 板.roughnessMap;
      mat.normalScale = new THREE.Vector2(0.8, 0.8);
    }

    const body = new THREE.Mesh(
      enemyGeo('uv:body:capsule:0.4,1.0,8,16', () => makeUvCapsuleGeometry(0.4, 1.0, 8, 16)),
      mat
    );
    body.position.y = 1.2;
    applyShadow(body, 'actor');
    body.name = 'body';
    group.add(body);

    if (config.type === 'golem') {
      const core = new THREE.Mesh(
        enemyGeo('golemCore:octa:0.35,0', () => new THREE.OctahedronGeometry(0.35, 0)),
        new THREE.MeshStandardMaterial({ color: 0xaa66ff, emissive: 0x442266, emissiveIntensity: 0.6 })
      );
      core.position.y = 2.2;
      group.add(core);
    } else if (config.type === 'drone') {
      const wing = new THREE.Mesh(
        enemyGeo('uv:droneWing:box:1.4,0.08,0.3', () => makeUvBoxGeometry(1.4, 0.08, 0.3)),
        mat
      );
      wing.position.y = 2.0;
      group.add(wing);
    } else if (config.type === 'wraith') {
      // 时线怨影：半透明罩袍罩住本体，胸口一点冷光 —— 悬浮身形靠 BODY_PLANS.hover 抬
      const shroud = new THREE.Mesh(
        enemyGeo('wraithShroud:cone:0.62,1.9,8,1,true', () => new THREE.ConeGeometry(0.62, 1.9, 8, 1, true)),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.4 })
      );
      shroud.position.y = 1.05;
      group.add(shroud);
      const core = new THREE.Mesh(
        enemyGeo('wraithCore:sphere:0.14,8,8', () => new THREE.SphereGeometry(0.14, 8, 8)),
        new THREE.MeshStandardMaterial({ color: 0xaaddff, emissive: 0x335577, emissiveIntensity: 0.9 })
      );
      core.position.y = 1.55;
      group.add(core);
    } else if (config.type === 'stalker') {
      // 混沌掠行兽：前倾的头与背脊，贴地跑（低矮靠 BODY_PLANS.scale 体现）
      const head = new THREE.Mesh(
        enemyGeo('uv:stalkerHead:box:0.42,0.34,0.6', () => makeUvBoxGeometry(0.42, 0.34, 0.6)),
        mat
      );
      head.position.set(0, 1.45, 0.62);
      group.add(head);
      const spine = new THREE.Mesh(
        enemyGeo('uv:stalkerSpine:box:0.14,0.3,0.9', () => makeUvBoxGeometry(0.14, 0.3, 0.9)),
        mat
      );
      spine.position.set(0, 1.85, -0.1);
      group.add(spine);
    } else if (config.type === 'sentinel') {
      // 边境哨炮：肩甲与前置炮管，胸口带装甲核
      const barrel = new THREE.Mesh(
        enemyGeo('uv:sentinelBarrel:box:0.18,0.18,0.9', () => makeUvBoxGeometry(0.18, 0.18, 0.9)),
        mat
      );
      barrel.position.set(0, 1.5, 0.55);
      group.add(barrel);
      const pauldron = new THREE.Mesh(
        enemyGeo('uv:sentinelPauldron:box:1.1,0.16,0.5', () => makeUvBoxGeometry(1.1, 0.16, 0.5)),
        mat
      );
      pauldron.position.y = 1.95;
      group.add(pauldron);
      const core = new THREE.Mesh(
        enemyGeo('sentinelCore:octa:0.16,0', () => new THREE.OctahedronGeometry(0.16, 0)),
        new THREE.MeshStandardMaterial({ color: 0x88bbff, emissive: 0x224466, emissiveIntensity: 0.7 })
      );
      core.position.y = 1.5;
      group.add(core);
    } else if (config.type === 'hexer') {
      // 位面咒师：开口长袍罩住本体，掌心浮一枚符文环 —— 一眼是"念咒的"，不是"挥刀的"
      const robe = new THREE.Mesh(
        enemyGeo('hexerRobe:cone:0.58,1.6,8,1,true', () => new THREE.ConeGeometry(0.58, 1.6, 8, 1, true)),
        new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.1, side: THREE.DoubleSide })
      );
      robe.position.y = 0.95;
      group.add(robe);
      const rune = new THREE.Mesh(
        enemyGeo('hexerRune:torus:0.2,0.045,6,12', () => new THREE.TorusGeometry(0.2, 0.045, 6, 12)),
        new THREE.MeshStandardMaterial({ color: 0xbfa8ff, emissive: 0x4a2f7a, emissiveIntensity: 0.8 })
      );
      rune.position.set(0.42, 1.35, 0.48);
      group.add(rune);
    } else if (config.type === 'juggernaut') {
      // 破阵重兵：一副比同场骑士更宽的双肩厚甲 + 胸前撞角 —— 剪影上就比其他重甲更钝更宽
      const pauldron = new THREE.Mesh(
        enemyGeo('uv:juggernautPauldron:box:1.5,0.3,0.7', () => makeUvBoxGeometry(1.5, 0.3, 0.7)),
        mat
      );
      pauldron.position.y = 1.95;
      group.add(pauldron);
      const ram = new THREE.Mesh(
        enemyGeo('uv:juggernautRam:cone:0.26,0.5,6', () => makeUvConeGeometry(0.26, 0.5, 6)),
        mat
      );
      ram.rotation.x = Math.PI / 2;
      ram.position.set(0, 1.3, 0.62);
      group.add(ram);
    } else if (config.type !== 'boss') {
      const helm = new THREE.Mesh(
        enemyGeo('uv:helm:box:0.5,0.35,0.5', () => makeUvBoxGeometry(0.5, 0.35, 0.5)),
        mat
      );
      helm.position.y = 2.15;
      group.add(helm);
    }

    return group;
  }

  updateMeshY() {
    const groundY = this.world.getGroundHeight(this.position.x, this.position.z);
    this.mesh.position.set(this.position.x, groundY + this.hover, this.position.z);
  }

  setLocked(locked) {
    this.lockMarker?.setVisible(!!locked && this.alive && this.mesh.visible);
  }

  /**
   * 身体可见性的唯一出口（W-A3）。
   *
   * 血条与锁定标记挂在**场景根**上，不再随 `mesh.visible` 一起消失 —— 所以
   * "把身体藏起来"这件事必须走这里，否则会出现"敌人已经剔除/已死，血条还挂在天上"。
   * 距离剔除（`PerformanceManager`）与死亡都改调本方法，不再各写一次 `mesh.visible`。
   */
  setBodyVisible(visible) {
    this.mesh.visible = visible;
    if (!visible) {
      this.hpBar?.setVisible(false);
      this.lockMarker?.setVisible(false);
    }
  }

  updateHpBar() {
    const spec = this.hpBarSpec();
    const fill = this.hpBar?.object3D.getObjectByName('hpFill');
    if (!fill) return;
    const ratio = Math.max(0, this.hp / this.maxHp);
    const fullWidth = spec.width * (spec.fillScale ?? 0.983);
    fill.scale.x = ratio;
    // 左对齐收缩：宽度减半后要往左挪半个"消失的宽度"，否则血条从中间缩
    fill.position.x = -(fullWidth * (1 - ratio)) / 2;
  }

  /**
   * 世界空间 UI 的每帧跟随（W-A3）。位置跟着锚点走，朝向跟着相机走 ——
   * 两者都不经过 `mesh` 的旋转，所以敌人转身、悬浮摆动都不会再影响它们。
   *
   * @param {{x:number,y:number,z:number} | null} camPos
   */
  updateWorldUi(camPos) {
    const anchor = this.mesh.position;
    // `mesh.visible` 也参与判断：距离剔除把身体藏了之后，血条不该还挂在天上
    const showHp = this.alive && this.mesh.visible && this.hp < this.maxHp;
    this.hpBar?.follow(anchor);
    this.hpBar?.setVisible(showHp);
    this.hpBar?.faceCamera(camPos);
    if (this.lockMarker) {
      this.lockMarker.follow(anchor);
      this.lockMarker.faceCamera(camPos);
    }
    // 预警圈不参与公告板：地面圈就该平躺在地上，头顶警示靠自转（pulseTelegraph）
    if (this.telegraph) {
      this.telegraph.position.set(anchor.x, anchor.y, anchor.z);
    }
  }

  /** 记账：伤害与架势都已在 Resolution 里算好，这里只落实与广播。 */
  takeDamage(amount, postureDamage = 0) {
    if (!this.alive) return false;
    // 挨打就是仇恨：背后一刀或隔墙被法术蹭到，都不该继续散步
    this.sense.noteHostile();

    this.hp = Math.max(0, this.hp - amount);
    this.posture = Math.min(this.maxPosture, this.posture + postureDamage);
    this.updateHpBar();

    const body = this.bodyMesh ??= this.mesh.getObjectByName('body');
    if (body?.material?.emissive) {
      body.material.emissive.setHex(0xff0000);
      body.material.emissiveIntensity = 0.6;
      // 受光闪按主循环 dt 衰减：setTimeout 会在死亡/重生后触达已失效材质（B19）
      this.hitFlash = 0.08;
    }

    window.dispatchEvent(new CustomEvent('combat-hit', { detail: { damage: amount, target: this.name } }));

    if (this.posture >= this.maxPosture) {
      this.forceStagger(this.ai.stagger);
    }

    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    // 身体、血条、锁定标记一起收掉（血条挂在场景根上，不随 mesh 一起消失）
    this.setBodyVisible(false);
    this.clearTelegraph();
    this.setWish(0, 0);
    // 倒地不该继续滑行：冲量与连段一样，不跨生命保留
    this.clearKnockback();
    // 死亡必须交出进攻名额，否则一个占位者能让整群敌人永远不再起手
    this.squad?.release(this);
    // 连段不跨生命：重生后的第一招要重新选，不能接着打完前世的一半
    this.endMove();
    this.deathTimer = this.respawnTime;
    window.dispatchEvent(new CustomEvent('enemy-defeated', {
      detail: { name: this.name, type: this.type, bossId: this.bossId },
    }));
  }

  respawnEnemy() {
    this.hp = this.maxHp;
    this.posture = 0;
    this.alive = true;
    this.state = 'idle';
    this.stateTimer = 0;
    this._lootDropped = false;
    this.position.copy(this.spawnPoint);
    this.sense.clear();
    this.setWish(0, 0);
    this.clearKnockback();
    this.upright();
    this.fsm.change('idle');
    this.setBodyVisible(true);
    this.updateMeshY();
    this.updateHpBar();
    this.updateWorldUi(null);
    this.setLocked(false);
  }

  distanceTo(pos) {
    return Math.sqrt((pos.x - this.position.x) ** 2 + (pos.z - this.position.z) ** 2);
  }

  /** 预警三件套按需创建一次并常驻，用 visible 切换。
   *  旧实现每次出手 new 三组几何 + 材质、清除时只 remove 不 dispose，
   *  一只敌人一轮攻击就漏 6 个 GPU 对象（B20 的主要来源）。 */
  showTelegraph() {
    const group = this._ensureTelegraph();
    group.visible = true;
    const { ring, inner, warn } = this.teleParts;
    const move = this.activeMove;
    const color = move?.telegraph?.color ?? 0xff2222;
    ring.material.color.setHex(color);
    inner.material.color.setHex(color);
    // 分级：慢重招才有头顶的旋转警示，快招只有地面圈 —— 玩家靠"有没有第三个标记"分辨该弹还是该跑
    warn.visible = this.windupNow >= this.ai.telegraphMarkWindup;
    ring.material.opacity = 0.85;
    ring.scale.setScalar(0.4 * this.teleRadius() / 1.05);
    inner.material.opacity = 0.9;
    inner.scale.setScalar(ring.scale.x);
    warn.rotation.y = 0;
    warn.position.y = 2.55;
  }

  _ensureTelegraph() {
    if (this.telegraph) return this.telegraph;
    const group = new THREE.Group();
    group.name = 'telegraph';
    const ring = new THREE.Mesh(
      enemyGeo('teleRing:0.15,1.05,16', () => new THREE.RingGeometry(0.15, 1.05, 16)),
      new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.name = 'teleRing';
    group.add(ring);
    const inner = new THREE.Mesh(
      enemyGeo('teleInner:0.05,0.35,12', () => new THREE.RingGeometry(0.05, 0.35, 12)),
      new THREE.MeshBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.08;
    inner.name = 'teleInner';
    group.add(inner);
    const warn = new THREE.Mesh(
      enemyGeo('teleWarn:cone:0.12,0.35,3', () => new THREE.ConeGeometry(0.12, 0.35, 3)),
      new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.95 })
    );
    warn.position.y = 2.6;
    warn.name = 'teleWarn';
    group.add(warn);
    group.visible = false;
    // 同样挂场景根（W-A3）：挂在 `mesh` 上时，悬浮单位的 wobble 会把地面圈一起扳歪
    this.scene.add(group);
    this.telegraph = group;
    this.teleParts = { ring, inner, warn };
    return group;
  }

  clearTelegraph() {
    if (this.telegraph) this.telegraph.visible = false;
  }

  /** 释放本敌人生成的全部 GPU 资源 */
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => {
      // 共享几何（W-C2 切片2）不归本实例释放：拆了全场同类敌人一起渲染坏
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    // 世界空间 UI 不在 `mesh` 子树里，必须单独摘（否则血条会留在场景里）
    this.hpBar?.dispose();
    this.hpBar = null;
    this.lockMarker?.dispose();
    this.lockMarker = null;
    if (this.telegraph) {
      this.scene.remove(this.telegraph);
      this.telegraph.traverse((o) => {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
        o.material?.dispose();
      });
    }
    this.telegraph = null;
    this.teleParts = null;
  }

  /**
   * 一帧：计时衰减 → 感知 → 状态判定 → 状态推进 → 位移积分 → 贴地。
   *
   * `ctx` 由 `EnemyManager` 每帧复用同一份：`{ target, playerRef, neighbors, collision }`。
   * Boss 系（含四个阶段 Boss）仍走各自的阶段脚本，本方法只接管普通敌人。
   */
  update(dt, playerPos, playerRef, ctx) {
    if (!this.alive) {
      if (this.respawn) {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) this.respawnEnemy();
      }
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    this._decayHitFlash(dt);

    ctx.target = playerPos;
    ctx.playerRef = playerRef;
    this.sense.update(dt, playerPos, ctx.collision);
    ctx.canStrike = tryClaimStrikeSlot(this, this.squad);

    // 意图每帧重新决定：状态没写就代表"这一帧不动"，不会残留上一态的冲量
    this.wish.x = 0;
    this.wish.z = 0;
    this.fsm.resolve(ctx);
    this.fsm.update(dt, ctx);
    this.state = this.fsm.current;
    this.stateTimer = this.fsm.time;

    this._advance(dt, ctx);
    this.updateMeshY();
    this.updateWorldUi(ctx.camera);
  }

  /** 受光闪：按 dt 衰减，死亡/重生都不会留下悬空的材质写入（B19） */
  _decayHitFlash(dt) {
    if (this.hitFlash <= 0) return;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const body = this.bodyMesh;
    if (body?.material?.emissive) {
      body.material.emissiveIntensity = this.hitFlash > 0 ? 0.6 : 0;
    }
  }
}
