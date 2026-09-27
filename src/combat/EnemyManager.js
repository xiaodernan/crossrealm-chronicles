import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { SquadController } from '../ai/Squad.js';
import { bodyOf } from '../ai/Separation.js';
import { AI, SUMMON } from '../content/tuning.js';
import { Boss } from './Boss.js';
import { GroundHazards } from './GroundHazards.js';
import { MagicBoss } from './MagicBoss.js';
import { SpaceBoss } from './SpaceBoss.js';
import { VoidBoss } from './VoidBoss.js';
import { ChaosBoss } from './ChaosBoss.js';
import { chapterGateFor } from '../content/bossRoster.js';
import { zoneIdAt } from '../content/ZoneIdentity.js';

export class EnemyManager {
  constructor(scene, world, projectiles) {
    this.scene = scene;
    this.world = world;
    this.projectiles = projectiles;
    this.enemies = [];
    /** 围攻名额：整张地图的敌人共用一个仲裁器（Boss 不占名额） */
    this.squad = new SquadController();
    /**
     * 场地红圈：危险区不属于任何一只敌人，归管理器统一推进。
     * 与 `projectiles` 同一处理由 —— 远程招交出弹体、砸地招交出圈，二者都要活得比施法者久。
     */
    this.hazards = new GroundHazards(scene, world);
    /** 每帧复用同一份 AI 上下文，避免为每只敌人分配对象 */
    this._aiCtx = {
      target: null,
      playerRef: null,
      neighbors: this.enemies,
      collision: null,
      // 远程招式交出的弹体走同一个管理器（敌方弹体由这里更新）
      projectiles: this.projectiles ?? null,
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
      const e = this.spawn({
        name: SUMMON.name,
        type: q.type,
        x: q.owner.position.x + Math.sin(q.angle) * r,
        z: q.owner.position.z + Math.cos(q.angle) * r,
        hp: SUMMON.hp,
        posture: SUMMON.posture,
        damage: SUMMON.damage,
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
    this.boss = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnMagicBoss(config) {
    const boss = new MagicBoss(this.scene, this.world, {
      ...config, projectiles: this.projectiles, hazards: this.hazards,
    });
    this.boss2 = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnSpaceBoss(config) {
    const boss = new SpaceBoss(this.scene, this.world, {
      ...config, projectiles: this.projectiles, hazards: this.hazards,
    });
    this.boss3 = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnVoidBoss(config) {
    const boss = new VoidBoss(this.scene, this.world, {
      ...config, hazards: this.hazards,
    });
    this.voidBoss = boss;
    this.enemies.push(boss);
    return boss;
  }

  spawnChaosBoss(config) {
    const boss = new ChaosBoss(this.scene, this.world, {
      ...config, hazards: this.hazards,
    });
    this.chaosBoss = boss;
    this.enemies.push(boss);
    return boss;
  }

  buildBossArena(center, color = 0x442244) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.15,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(22, 48), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.08;
    group.add(floor);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x5a4050, roughness: 0.85 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 4, 6), pillarMat);
      p.position.set(Math.cos(a) * 20, 2, Math.sin(a) * 20);
      p.castShadow = true;
      group.add(p);
    }

    group.position.set(center.x, 0, center.z);
    group.visible = true;
    floor.material.opacity = 0.2;
    this.scene.add(group);
    return { group, center, radius: 22, activated: false };
  }

  spawnDefaults() {
    this.spawn({ name: '训练木人', type: 'dummy', x: 15, z: 45, hp: 99999, posture: 99999, canAttack: false, respawn: false, color: 0x6a5040 });

    for (const [x, z] of [[-215, -20], [-185, 35], [-230, 15], [-200, -45], [-170, -30]]) {
      this.spawn({ name: '影之战士', type: 'soldier', x, z, hp: 160, posture: 58, damage: 15, color: 0x3a3038 });
    }

    for (const [x, z] of [[10, -195], [-25, -210], [30, -170], [-10, -230]]) {
      this.spawn({ name: '魔法构装体', type: 'golem', x, z, hp: 230, posture: 82, damage: 17, speed: 3.8, color: 0x4a3868 });
    }

    for (const [x, z] of [[220, 60], [185, 110], [240, 100], [160, 70], [210, 140]]) {
      this.spawn({ name: '轨道无人机', type: 'drone', x, z, hp: 120, posture: 48, damage: 11, speed: 7.5, aggroRange: 24, color: 0x3a5068 });
    }

    this.spawn({ name: '精英·虚空骑士', type: 'elite', x: -50, z: -60, hp: 350, posture: 90, damage: 22, speed: 5.5, aggroRange: 25, color: 0x224466, respawnTime: 15 });

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
        const souls = kind === 'boss' ? 500 : kind === 'golem' ? 80 : kind === 'elite' ? 120 : 25;
        // 掉哪一件按"它死在哪儿"查（`zoneIdAt` 是按位置反推区域的唯一一处，这里只是调用它）
        loot?.spawnKill(enemy.position, souls, kind, zoneIdAt(enemy.position, game?.world?.zones));
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
}
