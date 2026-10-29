import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { SquadController } from '../ai/Squad.js';
import { bodyOf } from '../ai/Separation.js';
import { AI, SUMMON } from '../content/tuning.js';
import { enemyRosterOf, KILL_SOULS } from '../content/enemies.js';
import { Boss } from './Boss.js';
import { GroundHazards } from './GroundHazards.js';
import { MagicBoss } from './MagicBoss.js';
import { SpaceBoss } from './SpaceBoss.js';
import { VoidBoss } from './VoidBoss.js';
import { ChaosBoss } from './ChaosBoss.js';
import { releaseSubtree } from '../engine/releaseSubtree.js';
import { chapterGateFor } from '../content/bossRoster.js';
import { zoneIdAt } from '../content/ZoneIdentity.js';
import { ENEMY_SPAWNS } from '../content/enemySpawns.js';
import { growthAt, zoneGrowthStage } from '../content/enemyGrowth.js';
import { applyShadow } from '../engine/shadowPolicy.js';
import { difficultyMultiplier } from '../game/Difficulty.js';
import { t } from '../engine/i18n.js';

/**
 * 击杀魂魄基数（W-E1 切片6：收口"余"里的"魂收入不随成长缩放"）。
 *
 * 修前写在 `update` 循环里的硬编码常量（boss 500 / golem 80 / elite 120 / normal 25），
 * 只经 `addSouls` 乘难度、**不乘成长**——"哪个区更富"在击杀掉落这条路上没生效，
 * 与 `enemyGrowth.js` 的 `souls` 列（"按区域档位放大单个敌人的基础掉落"）说的是两回事。
 * 现在按敌人记下的档位乘 `growth.souls`，难度乘子仍只在 `addSouls` 那一口结算
 * （两轴各司其职，与 `enemyGrowth.js` 文件头那一段同一分工）。
 *
 * 抽成纯函数：循环里只调用、门禁也能直接调。基数表**只此一份**：`KILL_SOULS` 住在
 * `content/enemies.js`（那里还派生 `KILL_SOUL_KINDS`，由门禁
 * `tests/kill-souls-single-source.test.js` 对齐 `GEAR_DROP.byKind` 的击杀档位域）——
 * 本文件 import 它，不再另抄一份（再抄就会冒出"改一处、另一处不跟着变"的两个击杀魂口径）。
 */

/** 击杀掉魂 = 基类 × `growth.souls`（难度乘子在 `PlayerStats.addSouls` 结算） */
export function killRewardSouls(kind, growthStage = 0) {
  const base = KILL_SOULS[kind] ?? KILL_SOULS.normal;
  return Math.round(base * growthAt(growthStage).souls);
}

export class EnemyManager {
  constructor(scene, world, projectiles, audio = null, time = null) {
    this.scene = scene;
    this.world = world;
    this.projectiles = projectiles;
    /** 音效句柄：目前只穿给场地危险区的落地提示音（M6）。与 ProjectileManager 同款可空 */
    this.audio = audio ?? null;
    this.enemies = [];
    /** 围攻名额：整张地图的敌人共用一个仲裁器（Boss 不占名额） */
    this.squad = new SquadController();
    /**
     * 场地红圈：危险区不属于任何一只敌人，归管理器统一推进。
     * 与 `projectiles` 同一处理由 —— 远程招交出弹体、砸地招交出圈，二者都要活得比施法者久。
     * 第 4 参 `time`（切片13）：全场时停（`worldSlow`）要经它持有世界时标；不传的层铺不了那一档。
     */
    this.hazards = new GroundHazards(scene, world, this.audio, time);
    /**
     * Boss 场的**两份共享几何**与**一份共享材质**（W-C1 切片3g）。
     *
     * 改前每一座场各造各的：八根柱子各造一份 `CylinderGeometry`、一个圆盘各造一份
     * ⇒ **五座场 = 5 个圆盘 + 40 根柱子 = 45 份几何**，而它们**一模一样**
     * （半径 22 的圆盘 / 0.4→0.5×4 的柱子）。现在全场共用**两份**。
     *
     * 场的**地面材质**逐场一份（颜色不同 —— 那是它认哪一只 Boss 的标记）。
     */
    this._场圆盘几何 = new THREE.CircleGeometry(22, 48);
    this._场柱几何 = new THREE.CylinderGeometry(0.4, 0.5, 4, 6);
    this._场柱材质 = new THREE.MeshStandardMaterial({ color: 0x5a4050, roughness: 0.85 });
    // 这三份**不属于任何一棵子树**（五座场共用）⇒ 标上共享标记，子树释放器会跳过它们，
    // 由这一层自己释放**一次**（`dispose()` 里）。标记的语义是"不由所在子树负责释放"。
    this._场圆盘几何.userData.shared = true;
    this._场柱几何.userData.shared = true;
    this._场柱材质.userData.shared = true;
    /** 造出来的 Boss 场清单（`buildBossArena` 入册，拆卸按它走） */
    this.arenas = [];
    /** 每帧复用同一份 AI 上下文，避免为每只敌人分配对象 */
    this._aiCtx = {
      target: null,
      playerRef: null,
      neighbors: this.enemies,
      collision: null,
      // 远程招式交出的弹体走同一个管理器（敌方弹体由这里更新）
      projectiles: this.projectiles ?? null,
      /**
       * 场地危险区的唯一出口（W-B7 切片3）。与 `projectiles` / `summon` 同一条纪律：
       * 敌人只交出"这块地归我了"的意图，圈的生命周期、池化与撤销全归 `GroundHazards`。
       * 此前只有 Boss 拿得到它（构造期注入），普通敌人一律没有 —— 于是"范围招"只剩
       * 长在自己脚下、随自己一起消失的那一种（`aoe`）。
       */
      hazards: this.hazards,
      /**
       * 召唤招式的唯一出口。敌人只交出"按这份规格放仆从"的意图，
       * 出生点、名额、归属与生命周期全在这里定 —— 让 `Enemy` 自己往 `enemies`
       * 里塞东西会在迭代途中改数组，也让"谁创建了谁"变成一笔糊账。
       */
      summon: (owner, spec) => this._summon(owner, spec),
      /**
       * 相机：世界空间 UI（血条 / 锁定标记）要按它对齐朝向（W-A3）。
       * 每帧从 `game.camera` 重取，不在构造期缓存 —— 与 `collision` 同一条纪律。
       */
      camera: null,
    };
    /** 活着的仆从与其召唤者：名额、消散与生命周期都要靠这两本账 */
    this._summons = new Set();
    this._summoners = new Set();
    /** 本帧要放出的仆从排在这里，循环结束后才真正生成（不在迭代中改 `enemies`） */
    this._pendingSummons = [];
    this.boss = null;
    this.boss2 = null;
    this.boss3 = null;
    this.voidBoss = null;
    this.chaosBoss = null;
    this.bossArena = null;
    this.boss2Arena = null;
    this.boss3Arena = null;
    this.voidArena = null;
    this.chaosArena = null;
    this.bossActive = false;
    this.boss2Active = false;
  }

  spawn(config) {
    const enemy = new Enemy(this.scene, this.world, { ...config, squad: this.squad });
    this.enemies.push(enemy);
    /* 两本账分开记：谁能召唤、谁是被召出来的。
     * 只记"能召唤的"而不是每帧扫描全体敌人的招式表，是为了让名额刷新是 O(召唤者数) */
    if (enemy.isSummon) this._summons.add(enemy);
    else if (enemy.moves.some((m) => m.summon)) this._summoners.add(enemy);
    return enemy;
  }

  /**
   * 彻底移除一只敌人并释放它的 GPU 资源。
   *
   * 世界原生敌人走重生路径，不走这里；召唤物与副本清理走这里 ——
   * 有明确的创建者就要有明确的销毁者，否则一场围山下来隐形敌人会一直堆在数组里
   * （`Enemy.dispose()` 在 M2 第一切片就为这条准备好了）。
   */
  despawn(enemy) {
    this.squad.release(enemy);
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
    this._summons.delete(enemy);
    this._summoners.delete(enemy);
    enemy.dispose();
  }

  /** 副本/区域清理用：把所有活着的仆从连同待生成的一并抹掉 */
  clearSummons() {
    for (const s of [...this._summons]) this.despawn(s);
    this._pendingSummons.length = 0;
  }

  /**
   * 本帧还剩几个名额给这只召唤者 —— 每帧盖一次，落在 `enemy.summonQuota` 上。
   * 招式的可选性由 `moveUsable` 读这个数：没名额时「召唤」直接从选招池里消失，
   * 而不是抢了围攻名额唱一段空咒（预警会因此说谎）。
   */
  _refreshSummonQuota() {
    if (!this._summoners.size) return;
    const perOwner = new Map();
    for (const s of this._summons) {
      if (!s.alive) continue;
      perOwner.set(s.summoner, (perOwner.get(s.summoner) ?? 0) + 1);
    }
    let alive = 0;
    for (const n of perOwner.values()) alive += n;
    for (const owner of this._summoners) {
      if (!owner.alive) { this._summoners.delete(owner); continue; }
      const mine = perOwner.get(owner) ?? 0;
      owner.summonQuota = Math.max(0,
        Math.min(SUMMON.perOwner - mine, SUMMON.total - alive));
    }
  }

  /** 召唤落点：以召唤者为圆心的黄金角散开，不与召唤者本体重叠 */
  _summon(owner, spec) {
    if (!owner.alive || !(owner.summonQuota > 0)) return false;
    const n = Math.min(spec?.count ?? 1, owner.summonQuota);
    for (let i = 0; i < n; i++) {
      this._pendingSummons.push({
        owner,
        type: spec?.type ?? 'soldier',
        angle: owner.separationSeed() + i * 2.399963,   // 黄金角
      });
    }
    owner.summonQuota -= n;      // 同一帧里多个召唤者也不能互相超发
    return n > 0;
  }

  /** 循环结束后统一生成：`_summon` 只排队，绝不在迭代 `enemies` 的途中改数组 */
  _drainSummons() {
    if (!this._pendingSummons.length) return;
    const r = SUMMON.ringRadius;
    for (const q of this._pendingSummons) {
      // 仆从按**召唤者**的成长档位长（W-E1 切片4）：它是召唤者强度的回响，不是另一块
      // 独立调过的数值。档位读召唤者身上那一个数（`spawnAt` 出生那一刻定下的），不按坐标
      // 反推 —— 副本里反推只会得到 0 档。召唤者全是走 `spawnAt` 出来的普通敌人
      // （`ENEMY_MOVE_SETS` 里带召唤招的只有 elite 与 stalker，Boss 不在此列），
      // 所以 `?? 0` 只是"哪条路漏记档位就当没成长"的兜底，不是常态。
      const growth = growthAt(q.owner.growthStage ?? 0);
      const e = this.spawn({
        name: t(SUMMON.name),
        type: q.type,
        x: q.owner.position.x + Math.sin(q.angle) * r,
        z: q.owner.position.z + Math.cos(q.angle) * r,
        hp: Math.round(SUMMON.hp * growth.hp),
        // posture 刻意不乘：硬直抗性跟着血量缩会把"更脆"变成"更容易被打断两次"
        // （与 spawnAt 对名册 posture 的同一条口径，切片3 立下的）
        posture: SUMMON.posture,
        damage: Math.round(SUMMON.damage * growth.damage),
        speed: SUMMON.speed,
        respawn: false,
        isSummon: true,
        summoner: q.owner,
      });
      // 被召进正在打的这场仗：不该先散步三秒再想起玩家
      e.sense.noteHostile();
    }
    this._pendingSummons.length = 0;
  }

  /**
   * 召唤物的三本账：被打死的就地释放、召唤者一死仆从跟着消散、寿命到了自己散。
   * 后两条不 `die()` —— 自然消散不该记进击杀数，也不该掉魂魄（否则"刷召唤再刷魂"
   * 成了一条正当的致富路线）。
   */
  _reapSummons(dt) {
    for (const s of [...this._summons]) {
      if (!s.alive) { this.despawn(s); continue; }
      if (s.summoner && !s.summoner.alive) { this.despawn(s); continue; }
      s.summonTtl -= dt;
      if (s.summonTtl <= 0) this.despawn(s);
    }
  }

  spawnBoss(config) {
    const boss = new Boss(this.scene, this.world, { ...config, hazards: this.hazards });
    this._scaleBoss(boss, zoneGrowthStage(zoneIdAt({ x: config.x ?? 0, z: config.z ?? 0 }, this.world?.zones)));
    this.boss = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnMagicBoss(config) {
    const boss = new MagicBoss(this.scene, this.world, {
      ...config, projectiles: this.projectiles, hazards: this.hazards,
    });
    this._scaleBoss(boss, zoneGrowthStage(zoneIdAt({ x: config.x ?? 0, z: config.z ?? 0 }, this.world?.zones)));
    this.boss2 = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnSpaceBoss(config) {
    const boss = new SpaceBoss(this.scene, this.world, {
      ...config, projectiles: this.projectiles, hazards: this.hazards,
    });
    this._scaleBoss(boss, zoneGrowthStage(zoneIdAt({ x: config.x ?? 0, z: config.z ?? 0 }, this.world?.zones)));
    this.boss3 = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnVoidBoss(config) {
    const boss = new VoidBoss(this.scene, this.world, {
      ...config, hazards: this.hazards,
    });
    this._scaleBoss(boss, zoneGrowthStage(zoneIdAt({ x: config.x ?? 0, z: config.z ?? 0 }, this.world?.zones)));
    this.voidBoss = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnChaosBoss(config) {
    const boss = new ChaosBoss(this.scene, this.world, {
      ...config, hazards: this.hazards,
    });
    this._scaleBoss(boss, zoneGrowthStage(zoneIdAt({ x: config.x ?? 0, z: config.z ?? 0 }, this.world?.zones)));
    this.chaosBoss = boss;
    this.enemies.push(boss);
    return boss;
  }

  /**
   * Boss 也走难度×成长这一条缩放链（W-E1 切片6：收口"余"里的"Boss 不收成长"）。
   *
   * 修前五个 `spawn*Boss` 直接 `new BossX(config)`，绕过了 `spawnAt` 的难度×成长咽喉，
   * 于是同一只影界守护者在灰白森林与破碎时线里血量是同一个 800、伤害同一个 18 ——
   * "越往后越难"在 Boss 身上断档。这里的缩放口径**逐格对齐** `spawnAt`（290–310）：
   * - 血量 = 构造基值 × `difficulty.enemyHp` × `growth.hp`（与 `spawnAt` 同一式）；
   * - 伤害 = 构造基值 × `growth.damage`（与 `spawnAt` 同一式：**不乘难度**——
   *   难度的 `damageTaken` 是玩家侧的，敌人出招伤害只随成长，否则 brutal 档会把
   *   "更肉"变成"更疼两道"，那是另一件事）；
   * - 把档位记在 Boss 身上（`growthStage`），于是 Boss 召的仆从也跟着这一档长
   *   （`_drainSummons` 读 `owner.growthStage`，把"召唤物不收成长"那半句话一并结了）。
   *
   * 基值从 `boss.maxHp` / `boss.damage` 现读，不抄第二份：新增一只 Boss 类改了默认血量，
   * 这里自动跟着变，不用回来同步一个常数。
   */
  _scaleBoss(boss, stage) {
    const growth = growthAt(stage);
    const hpMul = difficultyMultiplier('enemyHp') * growth.hp;
    const dmgMul = growth.damage;
    boss.maxHp = boss.hp = Math.round(boss.maxHp * hpMul);
    boss.damage = Math.round(boss.damage * dmgMul);
    boss.growthStage = stage;
    return boss;
  }

  buildBossArena(center, color = 0x442244) {
    const group = new THREE.Group();
    // 场要有名（W-C2 切片17）：榜的归属标签取"顶层组名 / 件名"，八根场柱与圆盘自己都没名，
    // 组没名时这一族就并进 `(直属scene) / (无名)` 那一大格。名字带**中心坐标** ⇒ 五座场各占一格，
    // 榜上能问出是哪一座（坐标由世界种子定死，读数可复现）。
    group.name = `boss-arena@${Math.round(center.x)},${Math.round(center.z)}`;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(this._场圆盘几何, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.08;
    group.add(floor);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = new THREE.Mesh(this._场柱几何, this._场柱材质);
      p.position.set(Math.cos(a) * 20, 2, Math.sin(a) * 20);
      applyShadow(p, 'actor');
      group.add(p);
    }

    group.position.set(center.x, 0, center.z);
    group.visible = true;
    floor.material.opacity = 0.2;
    this.scene.add(group);
    // 场**入册**：拆卸时按这一份清单走（改前只有 `bossArena` / `boss2Arena` … 五个具名字段，
    // 清单外的场就拆不到 —— "造了没人能拆"的一种）。
    this.arenas.push({ group, center, radius: 22, activated: false });
    return this.arenas[this.arenas.length - 1];
  }

  /**
   * 按类型出生：名字与基础数值一律读 `content/enemies.js` 的名册（W-B10 切片2）。
   *
   * 修前这里是 13 处 `this.spawn({ name, type, hp, posture, damage, ... })` 的手抄，
   * 而副本侧（`DungeonManager`）又抄了第二套 —— 同一只 `golem` 在图书馆叫「魔法构装体」
   * 230 血，在迷宫里叫「构装守卫」120~219 血。坐标留在这里（那是关卡数据），身份进表。
   *
   * **这里是难度的唯一入口**（W-E1 切片1）：世界与副本两条出生路都汇到 `spawnAt`
   * （`spawnDefaults` 与 `DungeonManager._spawnRoomEnemies` 都调它），所以 `enemyHp`
   * 乘子只写在这一处。乘的是名册那一格，不是另抄一份数值 —— 抄本会漂（B36/B45/B62 同族）。
   * `posture` 刻意**不乘**：它是硬直抗性，跟着血量一起缩放会把"更脆"变成
   * "更容易被打断两次"，那是另一件事，本片不做。
   *
   * **成长曲线也在这里落地**（W-E1 切片3）：档位默认按出生点所在区域推
   * （`zoneGrowthStage(zoneIdAt(...))` —— 敌人强度是地方的属性），副本两条出生路
   * 显式递 `extra.growthStage`（它们的坐标在 (5000, …) 的独立空间里，反推不出区域）。
   * 最终血量 = 名册 hp × difficulty.enemyHp × growth.hp，两个乘子都是正有限数，
   * 乘法可交换 —— 语义各占一边：难度是玩家选的，成长是地方给的。
   *
   * **仆从也走这条曲线**（W-E1 切片4）：`_drainSummons` 按召唤者身上记下的档位缩放
   * `SUMMON.hp` / `SUMMON.damage`（`posture` 仍不乘）。档位记在敌人身上而不是按坐标
   * 反推，是因为副本的出生点在 `(5000, …)` 的独立坐标空间里 —— 反推只会得到 0 档。
   */
  spawnAt(type, x, z, extra = {}) {
    const roster = enemyRosterOf(type);
    // growthStage 是给这条咽喉的指令，不是敌人的属性 —— 摘出来，别流进 spawn config
    const { growthStage, ...rest } = extra;
    // 区位**只反推一次**（W-B12 切片7）：成长档要它，"这一区的原生敌人"也要它 ——
    // 而后者是任务账里"该位面的清剿数"那一格的生产者（判据问"你在这座区清了多少只"）。
    const 区位 = zoneIdAt({ x, z }, this.world?.zones);
    const stage = growthStage ?? zoneGrowthStage(区位);
    const growth = growthAt(stage);
    const enemy = this.spawn({
      ...roster,
      // 名字是**文案键**（W-D2 切片16s）：展开在出生这一刻 ——
      // 于是"它叫什么"在事件负载里仍然是那句人看的话（锁定提示 / 击败横幅 / 字幕都读它）。
      name: t(roster.name),
      hp: Math.round(roster.hp * difficultyMultiplier('enemyHp') * growth.hp),
      // damage 是可缺的（`dummy` 没有）：缺格不缩放，交给 Enemy 构造器的 `?? 12`
      ...(roster.damage == null ? {} : { damage: Math.round(roster.damage * growth.damage) }),
      // souls 收入倍率：只对收入生效（W-E1 切片1）
      ...(roster.souls == null ? {} : { souls: Math.round(roster.souls * growth.souls) }),
      type, x, z, ...rest,
    });
    // 档位记在敌人身上（W-E1 切片4）：仆从按**召唤者**的档位长，而副本里的召唤者
    // 按坐标反推只会得到 0 档（坐标在 (5000, …) 的独立空间里）—— 出生那一刻定下，
    // 之后谁都不必再反推一次。`growthAt` 仍只在 spawnAt 与本文件里被读（门禁盯着）。
    enemy.growthStage = stage;
    // 区位同样记在敌人身上（W-B12 切片7）：反推**只做一次**（上面那一次），死亡事件带着它走 ——
    // 于是任务账里"该位面的清剿数"有一份生产者，而 `zoneIdAt` 的调用点没有多一处
    // （`tests/gear-pools.test.js` 钉着"调用方只有世界与敌人两处"）。
    enemy.zone = 区位;
    return enemy;
  }

  spawnDefaults() {
    // 出生点表在内容层（W-B7 切片7 搬过来的）：`content/enemySpawns.js` ——
    // 坐标与类型是**内容**，混在行为文件里既没人知道它是内容，内容层也够不着它
    // （"那位面到底有没有敌人可杀"因此查不到）。
    for (const s of ENEMY_SPAWNS) this.spawnAt(s.type, s.x, s.z);
    const bx = -250, bz = -35;
    this.bossArena = this.buildBossArena({ x: bx, z: bz });
    this.spawnBoss({ bossId: 'shadow-warden', x: bx, z: bz });
    this.deactivateBoss(this.boss);

    const b2x = 5, b2z = -220;
    this.boss2Arena = this.buildBossArena({ x: b2x, z: b2z }, 0x331155);
    this.spawnMagicBoss({ bossId: 'archmagus', x: b2x, z: b2z });
    this.deactivateBoss(this.boss2);

    const b3x = 235, b3z = 155;
    this.boss3Arena = this.buildBossArena({ x: b3x, z: b3z }, 0x112244);
    this.spawnSpaceBoss({ bossId: 'singularity-herald', x: b3x, z: b3z });
    this.deactivateBoss(this.boss3);

    const vx = 0, vz = 235;
    this.voidArena = this.buildBossArena({ x: vx, z: vz }, 0x443322);
    this.spawnVoidBoss({ bossId: 'void-chronarch', x: vx, z: vz });
    this.deactivateBoss(this.voidBoss);

    const cx = -200, cz = 285;
    this.chaosArena = this.buildBossArena({ x: cx, z: cz }, 0x661122);
    this.spawnChaosBoss({ bossId: 'chaos-overlord', x: cx, z: cz });
    this.deactivateBoss(this.chaosBoss);
  }

  deactivateBoss(boss) {
    if (!boss) return;
    boss.alive = false;
    boss.setBodyVisible(false);
  }

  activateBoss(boss, arena, playerPos, game) {
    if (!boss || boss.alive || arena.activated) return;
    /* 章节门槛读名册（W-B1 切片2）：修前是两句手写的 bossId 比较，
     * 加第三只带门槛的 Boss 就得在这里再抄一句，而抄错了不报错 —— 只是"它永远不开战"。
     * 名册里没有的 id（副本 Boss、将来工具生成的野生 Boss）一律放行。 */
    if ((game?.quests?.chapter ?? 1) < chapterGateFor(boss.bossId)) return;
    const c = arena.center;
    const dist = Math.sqrt((playerPos.x - c.x) ** 2 + (playerPos.z - c.z) ** 2);
    if (dist > arena.radius) return;

    arena.activated = true;
    boss.alive = true;
    boss.hp = boss.maxHp;
    boss.phase = 1;
    boss.phaseTriggered = { p2: false, p3: false };
    boss.posture = 0;
    boss.setBodyVisible(true);
    boss.updateHpBar?.();
    arena.group.visible = true;
    window.dispatchEvent(new CustomEvent('boss-start', {
      detail: { name: boss.name, bossId: boss.bossId, position: boss.position.clone() },
    }));
  }

  update(dt, playerPos, playerRef, loot, game) {
    if (this.bossArena && !this.bossArena.activated) {
      this.activateBoss(this.boss, this.bossArena, playerPos, game);
    }
    if (this.boss2Arena && !this.boss2Arena.activated) {
      this.activateBoss(this.boss2, this.boss2Arena, playerPos, game);
    }
    if (this.boss3Arena && !this.boss3Arena.activated) {
      this.activateBoss(this.boss3, this.boss3Arena, playerPos, game);
    }
    if (this.voidArena && !this.voidArena.activated) {
      this.activateBoss(this.voidBoss, this.voidArena, playerPos, game);
    }
    if (this.chaosArena && !this.chaosArena.activated) {
      this.activateBoss(this.chaosBoss, this.chaosArena, playerPos, game);
    }

    this.squad.tick(dt);
    const ctx = this._aiCtx;
    ctx.target = playerPos;
    ctx.playerRef = playerRef;
    ctx.combat = playerRef?.combat ?? null;
    // 碰撞世界会随区域重建换对象，每帧取当前值，不在构造期缓存
    ctx.collision = this.world?.collision ?? null;
    // 相机同理：观看模式/过场会换相机，每帧重取（W-A3 世界空间 UI 的朝向依据）
    ctx.camera = game?.camera ?? null;
    const neighbors = this._neighbors ??= [];
    neighbors.length = 0;
    for (const e of this.enemies) if (e.alive) neighbors.push(e);
    // 玩家身体也参与分离：敌人不该叠进玩家模型里（旧实现可以直接穿过去）
    this._playerBody ??= bodyOf(playerPos, AI.playerRadius);
    this._playerBody.position = playerPos;
    neighbors.push(this._playerBody);
    ctx.neighbors = neighbors;
    this._refreshSummonQuota();

    for (const enemy of this.enemies) {
      const perf = game?.performance;
      if (perf && !perf.shouldUpdateEnemy(enemy, playerPos)) continue;
      enemy.update(dt, playerPos, playerRef, ctx);
      if (!enemy.alive && enemy._lootDropped) continue;
      // 仆从不掉魂魄：否则"让召唤者无限刷、再逐个收割"成了一条正当的致富路线
      if (!enemy.alive && enemy.type !== 'dummy' && !enemy.isSummon && !enemy._lootDropped) {
        enemy._lootDropped = true;
        // 档位只问一次：魂魄数与"掉不掉装备"都读这同一个 `kind`（两条各判一遍迟早一个说精英一个说普通）
        const kind = enemy.isBoss ? 'boss' : enemy.type === 'golem' ? 'golem' : enemy.type === 'elite' ? 'elite' : 'normal';
        // 按敌人死时记下的档位乘成长（`growth.souls`）；难度乘子在 `addSouls` 结算
        const souls = killRewardSouls(kind, enemy.growthStage ?? 0);
        // 掉哪一件按"它死在哪儿"查（`zoneIdAt` 是按位置反推区域的唯一一处，这里只是调用它）；
        // `bossId` 同理由这里给（切片5 固定掉落只认世界 Boss 的登记，野生/副本 Boss 交 null）
        loot?.spawnKill(enemy.position, souls, kind, zoneIdAt(enemy.position, game?.world?.zones), enemy.bossId ?? null);
      }
    }

    this._drainSummons();
    this._reapSummons(dt);
    // 危险区排在敌人之后推进：本帧刚交出的圈同样从 0 起表，之后与施法者再无关系
    this.hazards.update(dt, playerPos, playerRef);
  }

  getAliveEnemies() {
    return this.enemies.filter((e) => e.alive);
  }

  getNearestEnemy(pos, maxRange = 26) {
    let nearest = null;
    let minDist = maxRange;
    for (const e of this.getAliveEnemies()) {
      const d = e.distanceTo(pos);
      if (d < minDist) { minDist = d; nearest = e; }
    }
    return nearest;
  }

  getLockCandidates(pos, forward, maxRange = 26) {
    return this.getAliveEnemies()
      .map((e) => {
        const dx = e.position.x - pos.x;
        const dz = e.position.z - pos.z;
        const dist = Math.hypot(dx, dz);
        const dot = dist > 0.01 ? (dx / dist) * forward.x + (dz / dist) * forward.z : -1;
        const score = dot * 2.2 + (1 - dist / maxRange);
        return { e, dist, dot, score };
      })
      .filter((x) => x.dist <= maxRange && x.dot > -0.35 && x.e.canAttack !== false)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.e);
  }

  getBestLockTarget(pos, forward, maxRange = 26) {
    const list = this.getLockCandidates(pos, forward, maxRange);
    return list[0] ?? null;
  }

  setLockTarget(target) {
    for (const e of this.enemies) e.setLocked(e === target);
  }

  /**
   * 拆干净：五座 Boss 场 + 那三份共用资源（W-C1 切片3g）。
   *
   * 为什么现在才有：`Game._adopt` **拒绝**没有 `dispose()` 的子系统（"假装收编"的防线），
   * 而这一层此前**没有** `dispose()` ⇒ 它从不被收编 ⇒ `Game.dispose()` 走完，
   * 五座场的几何与材质**一份都不还**。
   *
   * **在场的敌人**各自有 `Enemy.dispose()`（死亡与回收那两条路都走它），
   * **这一层不重复释放它们** —— 敌人的几何是共享库那份（`ENEMY_GEO`，带共享标记 ⇒ 不释放），
   * 材质逐只一份（由敌人自己还）⇒ 归属清楚，不在这里再走一遍。
   */
  dispose() {
    // 在场的敌人（含 Boss）各自有 `Enemy.dispose()` —— 死亡与回收那两条路都走它，
    // 拆卸这一条也不能漏（它们的材质是**逐只一份**的 ⇒ 漏了就是白漏）。
    for (const e of this.enemies) e.dispose?.();
    this.enemies.length = 0;
    for (const arena of this.arenas) {
      if (!arena?.group) continue;
      this.scene.remove(arena.group);
      releaseSubtree(arena.group);
    }
    this.arenas.length = 0;
    this._场圆盘几何?.dispose?.();
    this._场柱几何?.dispose?.();
    this._场柱材质?.dispose?.();
    // 场地危险区（圈）是这一层的另一个属主 ⇒ 它自己拆
    this.hazards?.dispose?.();
  }
}
