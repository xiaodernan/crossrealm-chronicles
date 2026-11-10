/**
 * 位面试炼的运行时（W-F3 切片1，切片3 起自己刷怪）。
 *
 * ## 它是什么
 *
 * 一份**限时清剿**：从赛季词缀里取几条，逐层提高配额与强度，时间用完或人死了即结束。
 * 成绩 = 打到第几层 + 剩多少秒（口径在 `content/trial.js` 的 `trialScore`）。
 *
 * ## 四条边界（写在这里，免得下一片自己发明）
 *
 * ① **状态只在内存，不写存档。** 与 W-F1 图鉴同一条纪律：能算出来的东西不存 ——
 *    "最好成绩"是本次会话里跑出来的，重开一局就是零。真要跨会话，正确的位置是
 *    排行榜（`OnlineServices.submitRun`），而不是存档里再长一个版本号。
 * ② **时间是世界时。** 只在 `Game` 喂 `update(dt)` 的那些帧里前进（与
 *    `DungeonRunTracker` 同一个口径）。改前那类写法用 `performance.now()` 差值，
 *    于是玩家开着暂停菜单那 60 秒也算进了限时里 —— 那是"限时"变成"限你开着菜单"。
 * ③ **词缀在这里真的生效**：时限（`timeDelta`）、配额（`quotaDelta`）、灼烧（`burnDps`）
 *    三条由试炼自己执行；出生缩放（`hp/damage/speed`）写进 `SpawnTuning` 那一格，
 *    由 `EnemyManager.spawnAt` 那条唯一的出生咽喉读走（切片2）。
 * ④ **怪是它自己刷的**（切片3）：以玩家为圆心按黄金角散开，每层刷到配额为止。
 *    击杀口径因此收窄成"**只算它自己刷的那批**"——判据是 `enemy-defeated.origin`，
 *    那个值在出生那一刻写死在敌人身上，死亡现场不猜。
 *
 * ## 为什么这一段不再监听"世界里的击杀"
 *
 * 切片1/2 的口径是"任何击杀都算"。那不是试炼，那是收获季：玩家站在世界怪最多的
 * 地方平推，五层配额几分钟就刷完了，而"位面试炼"本该是**被拉进一个场里打完**。
 * 收窄之后试炼才有"打不完就超时"的压力 —— 因为怪只从场里来，不来就是不来。
 *
 * ## 一条踩过的坑：`spawn` 可以同步，`despawn` 必须延迟
 *
 * 击杀是 `Enemy.die()` 用 `dispatchEvent` 派发出来的，而 `die()` 正发生在
 * `EnemyManager` 遍历 `enemies` 数组的途中。此刻：
 * - **`spawn` 安全**：往数组尾部 push 只会让迭代器多走一格，不会漏掉谁；
 * - **`despawn` 不安全**：它要 `splice` 掉当前元素之前的那一格，`for...of`
 *   的索引会跟着往前跳，**于是下一只敌人这一帧不会被更新**（不报错、不掉帧，
 *   表现是"偶尔有一只怪站着不动一帧"）。
 * 所以刷怪在开层时同步做（玩家立刻看到东西），清理一律进 `_pendingClear`，
 * 等下一次 `update()` 把数组改动挪出事件栈。**这条不是洁癖，是上面那个漏更新的成因。**
 */
import { on, offAll, emit } from '../engine/EventBus.js';
import { setSpawnScale, resetSpawnScale } from './SpawnTuning.js';
import { TrialArena } from '../effects/TrialArena.js';
import {
  TRIAL_MAX_LAYERS, TRIAL_ORIGIN, TRIAL_ARENA, trialSpawnOffset,
  trialModifiers, trialLayerOf, layerSeconds, layerQuota, layerScale, trialScore,
} from '../content/trial.js';

const OWNER = 'game/TrialSystem';

export class TrialSystem {
  constructor(game = null) {
    this.game = game;
    /** @type {'idle'|'running'|'finished'|'failed'} */
    this.state = 'idle';
    this.layer = 0;
    this.affixIds = [];
    this.mods = trialModifiers([]);
    this.secondsLeft = 0;
    this.quota = 0;
    this.kills = 0;
    this.layersCleared = 0;
    this.score = 0;
    /** 上一局为什么结束（`timeout` / `death` / `abandon`）；跑着的时候是 null */
    this.lastReason = null;
    /** 本次会话的最好成绩（只在内存，见文件头第 ① 条） */
    this.best = { score: 0, layersCleared: 0, secondsLeft: 0 };
    /** 灼烧的零头：不足一秒的伤害累加，够一秒才打一次（每帧打 0.04 点会刷爆事件） */
    this._burnDebt = 0;

    /** 本局场地中心 `{ x, z }`；拿不到玩家位置时为 null（没有场就没有刷怪） */
    this._arena = null;
    /** 本层刷出来的敌人（含已经倒下的 —— 它们要等清理才能离开 EnemyManager 的数组） */
    this._spawned = [];
    /** 等下一次 `update()` 才真正 despawn 的桶（见文件头那条坑） */
    this._pendingClear = [];
    /** 本层已经刷出几只（上限 = 本层配额） */
    this._spawnedThisLayer = 0;
    /** 落点用的递增序号（黄金角散开，不按波次归零） */
    this._spawnCursor = 0;
    /** 距离下一次补刷还有多久 */
    this._waveTimer = 0;
    /**
     * 场地边界的可视化（W-F3 切片5）。**首次开局面才造**，`dispose()` 才拆 ——
     * 一局结束只 `hide()`，因为下一局还要用（拆了就是每局重建一次 GPU 资源）。
     */
    this._arenaFx = null;

    this._onKill = (e) => this._handleKill(e?.detail);
    this._onDeath = () => { if (this.state === 'running') this._fail('death'); };
    on('enemy-defeated', this._onKill, OWNER);
    on('player-death-count', this._onDeath, OWNER);
  }

  /** 定场：以玩家此刻的位置为圆心。拿不到位置（单测 / 没有玩家）就退化成"不刷怪" */
  _locateArena() {
    const p = this.game?.player?.position;
    const x = Number(p?.x);
    const z = Number(p?.z);
    this._arena = Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
  }

  /** 开一局。已经在跑就先放弃（不做"嵌套试炼"，那是没人定过规则的东西） */
  start(affixIds = []) {
    if (this.state === 'running') this.abandon();
    this.affixIds = [...new Set(affixIds)];
    this.mods = trialModifiers(this.affixIds);
    this.state = 'running';
    this.layer = 1;
    this.layersCleared = 0;
    this.score = 0;
    this.lastReason = null;
    this._locateArena();
    this._flushPendingClear();
    this._spawnCursor = 0;
    this._beginLayer(1);
    this._showArena();
    emit('trial-started', { layer: 1, affixIds: this.affixIds });
    return this.getState();
  }

  /** 进入某一层：配额、时限、剩余击杀清零，出生缩放下发，并立刻刷第一波 */
  _beginLayer(layer) {
    // 上一层的残留（含尸体）进待清理桶：**不在这个栈里 despawn**（可能正走在击杀派发里）
    if (this._spawned.length) {
      this._pendingClear.push(...this._spawned);
      this._spawned = [];
    }
    this.layer = layer;
    this.quota = layerQuota(layer, this.mods);
    this.secondsLeft = layerSeconds(layer, this.mods);
    this.kills = 0;
    this._burnDebt = 0;
    this._spawnedThisLayer = 0;
    this._waveTimer = TRIAL_ARENA.waveInterval;
    /* W-F3 切片2：词缀的 hp/damage/speed 从这一行起真的落地 —— 写的是模块级那一格，
     * 读它的是 `EnemyManager.spawnAt` 那条唯一的出生咽喉（不另开刷怪路）。 */
    setSpawnScale(layerScale(layer, this.mods));
    // 雾也归位到本层的倍率（词缀 heavy-fog / gloom-veil）—— 雾的唯一写者是 ZoneFog
    this._setFog(this.mods.fogMul);
    // 开层立刻给一波：不然玩家要盯着空气等一个补刷间隔
    this._spawnWave();
  }

  /**
   * 把场地边界摆出来（W-F3 切片5）。
   *
   * 三个前置都缺一不可：有场心、有场景、还有 `TrialArena` 自己 —— 单测里的
   * 假 game 常常没有 `scene`，那时试炼照样要能跑（只是看不见边界）。
   */
  _showArena() {
    if (!this._arena || !this.game?.scene) return;
    if (!this._arenaFx) this._arenaFx = new TrialArena(this.game.scene);
    this._arenaFx.show(this._arena, TRIAL_ARENA.radius);
  }

  /**
   * 雾密度倍率下发（W-F3 切片4）。
   *
   * 走 `game.zoneFog.setDensityScale` 而不是直接写 `scene.fog.density` ——
   * `ZoneFog` 是雾的唯一写者（M3 那条纪律：全局状态必须有唯一所有者），
   * 绕过它写会让"跨区平滑"和词缀打架，症状是过场时雾闪一下。
   */
  _setFog(scale) {
    this.game?.zoneFog?.setDensityScale?.(scale);
  }

  /** 本层场上还活着几只试炼怪 */
  _aliveCount() {
    let n = 0;
    for (const e of this._spawned) if (e?.alive) n += 1;
    return n;
  }

  /**
   * 刷一波：补到 `waveSize`，但**本层总刷出数不超过配额**。
   *
   * 上限取配额而不是"配额 + 补偿"，是因为击杀计数与刷出计数必须能对上：
   * 刷 8 只而只要求清 5 只，多出来的 3 只会在过层后变成没人管的野怪。
   */
  _spawnWave() {
    const em = this.game?.enemyManager;
    if (!this._arena || !em?.spawnAt) return 0;
    const want = Math.min(
      TRIAL_ARENA.waveSize - this._aliveCount(),
      this.quota - this._spawnedThisLayer,
    );
    if (!(want > 0)) return 0;
    const pool = trialLayerOf(this.layer).pool;
    let n = 0;
    for (let i = 0; i < want; i += 1) {
      const type = pool[(this._spawnedThisLayer + i) % pool.length];
      const off = trialSpawnOffset(this._spawnCursor);
      this._spawnCursor += 1;
      const enemy = em.spawnAt(type, this._arena.x + off.x, this._arena.z + off.z, {
        origin: TRIAL_ORIGIN,
        // 死了不重生：试炼的怪是"这一层的配额"，不是这个世界常驻的一部分
        respawn: false,
      });
      if (enemy) {
        this._spawned.push(enemy);
        n += 1;
      }
    }
    this._spawnedThisLayer += n;
    return n;
  }

  /** 补刷：只在跑着时按间隔补，满员或刷满配额就不动 */
  _tickSpawn(dt) {
    if (!this._arena) return;
    this._waveTimer -= dt;
    if (this._waveTimer > 0) return;
    this._waveTimer = TRIAL_ARENA.waveInterval;
    if (this._spawnedThisLayer >= this.quota) return;
    if (this._aliveCount() >= TRIAL_ARENA.waveSize) return;
    this._spawnWave();
  }

  /** 真正执行清理。**只能从 `update()` 或 `dispose()` 进**，不能从事件回调里进（见文件头） */
  _flushPendingClear() {
    if (!this._pendingClear.length) return;
    const em = this.game?.enemyManager;
    const list = this._pendingClear;
    this._pendingClear = [];
    for (const e of list) em?.despawn?.(e);
  }

  _handleKill(detail) {
    if (this.state !== 'running') return;
    // 口径收窄（切片3）：世界里顺手杀的不算这一局的账
    if (detail?.origin !== TRIAL_ORIGIN) return;
    this.kills += 1;
    if (this.kills < this.quota) return;
    this.layersCleared = this.layer;
    emit('trial-layer-cleared', {
      layer: this.layer, quota: this.quota, secondsLeft: Math.round(this.secondsLeft),
    });
    if (this.layer >= TRIAL_MAX_LAYERS) { this._finish(); return; }
    this._beginLayer(this.layer + 1);
  }

  _finish() {
    this.state = 'finished';
    // 收工归位：不归位，玩家离开试炼之后世界里的怪会一直按最后一层的强度长
    resetSpawnScale();
    this._setFog(1);
    this._arenaFx?.hide();
    // 本层与积压的残留一起进待清理（下一帧真正 despawn）
    if (this._spawned.length) {
      this._pendingClear.push(...this._spawned);
      this._spawned = [];
    }
    this.score = trialScore(this.layersCleared, this.secondsLeft);
    if (this.score > this.best.score) {
      this.best = {
        score: this.score,
        layersCleared: this.layersCleared,
        secondsLeft: Math.round(this.secondsLeft),
      };
    }
    emit('trial-finished', {
      score: this.score, layersCleared: this.layersCleared, secondsLeft: Math.round(this.secondsLeft),
    });
  }

  _fail(reason) {
    this.state = 'failed';
    resetSpawnScale();
    this._setFog(1);
    this._arenaFx?.hide();
    // 失败时场上可能还有活着的：全部进待清理（不清的话玩家会被一堆残怪围着）
    if (this._spawned.length) {
      this._pendingClear.push(...this._spawned);
      this._spawned = [];
    }
    this.lastReason = reason;
    this.score = trialScore(this.layersCleared, 0);
    emit('trial-failed', {
      reason, layer: this.layer, kills: this.kills, quota: this.quota,
    });
  }

  /** 玩家自己退出 —— 与"时间到了"分开记账，否则日志里分不清是被打败还是不想玩了 */
  abandon() {
    if (this.state !== 'running') return false;
    this._fail('abandon');
    return true;
  }

  /**
   * 世界时推进。**只在 `running` 时扣时间** —— 结束了还在扣的后果是
   * "上一局失败的原因"被下一帧改写成 `timeout`。
   *
   * 但清理**不管什么状态都做**：`_finish` / `_fail` 只把残留挪进待清理桶，
   * 真正 despawn 的是这里（把数组改动挪出事件栈，见文件头那条坑）。
   */
  update(dt) {
    this._flushPendingClear();
    if (this.state !== 'running') return;
    const step = Number(dt);
    if (!Number.isFinite(step) || step <= 0) return;

    this.secondsLeft -= step;
    if (this.secondsLeft <= 0) {
      this.secondsLeft = 0;
      this._fail('timeout');
      return;
    }
    this._tickBurn(step);
    this._tickSpawn(step);
    this._arenaFx?.update(step);
  }

  /** 灼烧：按秒结算，走玩家受伤的既有入口（不直接改血量字段） */
  _tickBurn(dt) {
    const dps = this.mods.burnDps;
    if (!(dps > 0)) return;
    this._burnDebt += dt;
    while (this._burnDebt >= 1) {
      this._burnDebt -= 1;
      // 战斗控制器的真名是 `player.combat`（Game 上没有 `combat` 这一格）——
      // `tests/game-field-contract` 会扫这个点号路径，写错当场红
      const combat = this.game?.player?.combat;
      if (combat?.takeDamage) {
        // 元素传 'fire'：灼烧就是灼烧，不该按物理抗性算
        combat.takeDamage(dps, 'fire');
      }
    }
  }

  /** 面板要的全部状态（一次给全，免得 UI 去读内部字段） */
  getState() {
    const scale = this.state === 'running' ? layerScale(this.layer, this.mods) : null;
    const running = this.state === 'running';
    return {
      state: this.state,
      layer: this.layer,
      maxLayers: TRIAL_MAX_LAYERS,
      layersCleared: this.layersCleared,
      secondsLeft: Math.max(0, Math.ceil(this.secondsLeft)),
      quota: this.quota,
      kills: this.kills,
      score: this.score,
      lastReason: this.lastReason,
      affixIds: [...this.affixIds],
      /** 词缀已生效的三条（试炼自己执行的那三条） */
      active: {
        timeDelta: this.mods.timeDelta,
        quotaDelta: this.mods.quotaDelta,
        burnDps: this.mods.burnDps,
        /** 雾密度倍率（切片4 起真的落到 ZoneFog 上） */
        fogMul: this.mods.fogMul,
      },
      /** 出生缩放：跑着的时候就是 `spawnAt` 正在乘的那一份 */
      spawnScale: scale,
      /** 出生缩放是否已经在生效（W-F3 切片2 起为真：已接进 `EnemyManager.spawnAt`） */
      spawnScaleLive: running,
      /** 刷怪器是否在跑（有场、有刷怪入口、并且这一局正在进行） */
      spawnerLive: running && this._arena != null && !!this.game?.enemyManager?.spawnAt,
      /** 本层已刷出几只（上限 = `quota`） */
      spawnedThisLayer: this._spawnedThisLayer,
      /** 场上还活着几只试炼怪 */
      aliveCount: this._aliveCount(),
      /** 场地中心；没有场时为 null（页面上照实说） */
      arena: this._arena ? { ...this._arena, radius: TRIAL_ARENA.radius } : null,
      best: { ...this.best },
    };
  }

  dispose() {
    offAll(OWNER);
    // 销毁也要归位：`_adopt` 的 teardown 会在换档/重开时走到这里
    resetSpawnScale();
    this._setFog(1);
    // 场地边界是**它造的**，也只能由它拆（`new THREE.*` 的创建者/销毁者纪律）
    this._arenaFx?.dispose();
    this._arenaFx = null;
    // dispose 不在 update 栈里，可以同步清（此时没有谁在遍历 enemies）
    if (this._spawned.length) {
      this._pendingClear.push(...this._spawned);
      this._spawned = [];
    }
    this._flushPendingClear();
  }
}
