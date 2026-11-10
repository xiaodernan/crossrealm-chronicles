/**
 * 位面试炼的运行时（W-F3 切片1）。
 *
 * ## 它是什么
 *
 * 一份**限时清剿**：从赛季词缀里取几条，逐层提高配额与强度，时间用完或人死了即结束。
 * 成绩 = 打到第几层 + 剩多少秒（口径在 `content/trial.js` 的 `trialScore`）。
 *
 * ## 三条边界（写在这里，免得下一片自己发明）
 *
 * ① **状态只在内存，不写存档。** 与 W-F1 图鉴同一条纪律：能算出来的东西不存 ——
 *    "最好成绩"是本次会话里跑出来的，重开一局就是零。真要跨会话，正确的位置是
 *    排行榜（`OnlineServices.submitRun`），而不是存档里再长一个版本号。
 * ② **时间是世界时。** 只在 `Game` 喂 `update(dt)` 的那些帧里前进（与
 *    `DungeonRunTracker` 同一个口径）。改前那类写法用 `performance.now()` 差值，
 *    于是玩家开着暂停菜单那 60 秒也算进了限时里 —— 那是"限时"变成"限你开着菜单"。
 * ③ **词缀在这里第一次真的生效**：时限（`timeDelta`）、配额（`quotaDelta`）、
 *    灼烧（`burnDps`）三条由试炼自己执行；出生缩放（`hp/damage/speed`）由
 *    `layerScale()` 算好交给刷怪那一侧 —— 本片还不刷怪（切片2 接出生咽喉），
 *    所以那三个乘子**已经算得出、还没人用**，这一点在 `getState()` 里如实标出来。
 *
 * ## 为什么监听 `enemy-defeated` 而不是自己数
 *
 * 击杀这件事已经有一个**唯一生产者**（`CombatController`）。试炼再数一遍等于
 * 第二份真源，而两份真源迟早会差一只（B36 那一族）。所以试炼只消费事件，
 * 口径是"任何击杀都算" —— 这一片不刷自己的怪，玩家要去世界里打。
 */
import { on, offAll, emit } from '../engine/EventBus.js';
import { setSpawnScale, resetSpawnScale } from './SpawnTuning.js';
import {
  TRIAL_MAX_LAYERS, trialModifiers, layerSeconds, layerQuota, layerScale, trialScore,
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

    this._onKill = () => this._handleKill();
    this._onDeath = () => { if (this.state === 'running') this._fail('death'); };
    on('enemy-defeated', this._onKill, OWNER);
    on('player-death-count', this._onDeath, OWNER);
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
    this._beginLayer(1);
    emit('trial-started', { layer: 1, affixIds: this.affixIds });
    return this.getState();
  }

  /** 进入某一层：配额、时限、剩余击杀清零，并把这一层的出生缩放下发给 spawnAt */
  _beginLayer(layer) {
    this.layer = layer;
    this.quota = layerQuota(layer, this.mods);
    this.secondsLeft = layerSeconds(layer, this.mods);
    this.kills = 0;
    this._burnDebt = 0;
    /* W-F3 切片2：词缀的 hp/damage/speed 从这一行起真的落地 —— 写的是模块级那一格，
     * 读它的是 `EnemyManager.spawnAt` 那条唯一的出生咽喉（不另开刷怪路）。 */
    setSpawnScale(layerScale(layer, this.mods));
  }

  _handleKill() {
    if (this.state !== 'running') return;
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
   * 世界时推进。**只在 `running` 时做事** —— 结束了还在扣时间的后果是
   * "上一局失败的原因"被下一帧改写成 `timeout`。
   */
  update(dt) {
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
      },
      /** 出生缩放：跑着的时候就是 `spawnAt` 正在乘的那一份 */
      spawnScale: scale,
      /** 出生缩放是否已经在生效（W-F3 切片2 起为真：已接进 `EnemyManager.spawnAt`） */
      spawnScaleLive: this.state === 'running',
      best: { ...this.best },
    };
  }

  dispose() {
    offAll(OWNER);
    // 销毁也要归位：`_adopt` 的 teardown 会在换档/重开时走到这里
    resetSpawnScale();
  }
}
