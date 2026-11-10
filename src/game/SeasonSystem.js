/**
 * 赛季的运行时所有者（W-F2 切片1）。
 *
 * ## 它优先信谁
 *
 * **默认信本地**。赛季是按天算的一道除法（`content/seasons.js`），不依赖网络、不依赖存档，
 * 于是单机玩家从第一秒起就有一季可看。在线伙伴服务在的时候，它只做两件事：
 *
 * 1. **确认**本地算出来的那一季（正常情况两者一致，不一致说明有人在配置中心按了 override）；
 * 2. 把服务端的 override 与周期读数带下来 —— 这是运维唯一能"改赛季"的口子。
 *
 * 拿不到在线答案时**不回退成空**，而是保持本地那一季，`source` 标成 `local`。
 * 界面上这两个来源要说清楚：玩家看到的"还剩 3 天"到底是本地算的，还是服务端说的。
 *
 * ## 为什么不缓存
 *
 * 它没有"每 N 分钟刷新"的定时器（B39 禁止游戏逻辑自建计时）。`refreshFromOnline()`
 * 由调用方决定何时调（当前是开机一次）；不调就一直用本地答案 —— 这在离线场景下
 * 与"调了但失败"是同一个结果，没必要为它引入一套过期策略。
 *
 * ## 未知 id
 *
 * 服务端返回的赛季 id 客户端不认识（老客户端连上新服务端）时，**忽略服务端那份**，
 * 继续用本地。这一条是契约的一部分：服务端可以先加赛季，客户端晚一个版本跟上。
 */

import {
  SEASON_CYCLE_DAYS, SEASONS, dayInCycleAt, daysRemainingAt, epochDayOf,
  modifierOf, seasonAt, seasonOf,
} from '../content/seasons.js';

export class SeasonSystem {
  /**
   * @param {object} game 宿主（读 `onlineServices` 与 `errorReporter`，都允许缺省）
   * @param {{ now?: () => number, online?: object, cycleDays?: number }} [options]
   *        `now` 与 `online` 都是给测试注入的：赛季轮转不能靠等，网络不能被真打。
   */
  constructor(game, options = {}) {
    this.game = game;
    this.now = options.now ?? (() => Date.now());
    this.online = options.online ?? game?.onlineServices ?? null;
    this.cycleDays = options.cycleDays ?? SEASON_CYCLE_DAYS;
    /** 服务端确认过的那一份（原始 JSON），没有就是 null */
    this.server = null;
    /** 'local' | 'online' —— 界面要如实说出这个读数是谁给的 */
    this.source = 'local';
  }

  /** 本地轮转算出来的那一季（永远有答案） */
  localSeason() {
    return seasonAt(epochDayOf(this.now()), this.cycleDays);
  }

  /** 当前生效的赛季行（服务端认过就用服务端那份，否则本地） */
  season() {
    if (this.source === 'online' && this.server) {
      return seasonOf(this.server.id) ?? this.localSeason();
    }
    return this.localSeason();
  }

  /** 本周期第几天（0 起） */
  dayInCycle() {
    if (this.source === 'online' && Number.isInteger(this.server?.dayInCycle)) return this.server.dayInCycle;
    return dayInCycleAt(epochDayOf(this.now()), this.cycleDays);
  }

  /** 本周期还剩几天（含今天） */
  daysRemaining() {
    if (this.source === 'online' && Number.isInteger(this.server?.daysRemaining)) return this.server.daysRemaining;
    return daysRemainingAt(epochDayOf(this.now()), this.cycleDays);
  }

  /** 本赛季词缀（只保留客户端认识的 id；未知 id 静默丢弃） */
  modifiers() {
    const ids = this.season()?.modifierIds ?? [];
    return ids.map((id) => modifierOf(id)).filter(Boolean);
  }

  /** 魂火加成（服务端给了就用服务端的，否则用本地名册那一份） */
  soulsBonusPct() {
    if (this.source === 'online' && Number.isFinite(this.server?.soulsBonusPct)) {
      return this.server.soulsBonusPct;
    }
    return this.season()?.soulsBonusPct ?? 0;
  }

  /** 面板要的一整份读数 */
  getState() {
    const season = this.season();
    return {
      season,
      id: season?.id ?? '',
      modifierIds: season?.modifierIds ?? [],
      modifiers: this.modifiers(),
      dayInCycle: this.dayInCycle(),
      daysRemaining: this.daysRemaining(),
      soulsBonusPct: this.soulsBonusPct(),
      source: this.source,
      cycleDays: this.cycleDays,
    };
  }

  /**
   * 向在线伙伴服务确认一次。**永不抛**：失败只是保持本地答案。
   *
   * 返回值是落地后的 state，方便调用方（或测试）直接断言 —— 也省得调用方再问一次。
   */
  async refreshFromOnline() {
    const client = this.online;
    if (!client?.enabled?.() || typeof client.fetchActiveSeason !== 'function') {
      return this.getState();
    }
    let payload = null;
    try {
      payload = await client.fetchActiveSeason();
    } catch (e) {
      // 客户端承诺吞错，但这一层不能依赖那个承诺：开机流程上任何一次抛出都会变成黑屏。
      console.warn('[season] 在线确认失败，继续用本地赛季', e?.message ?? e);
    }
    if (payload && seasonOf(payload.id)) {
      this.server = payload;
      this.source = 'online';
    }
    return this.getState();
  }

  /** 允许测试/设置面板把来源退回本地（例如玩家关掉了在线服务） */
  useLocal() {
    this.server = null;
    this.source = 'local';
    return this.getState();
  }

  dispose() {
    this.game = null;
    this.online = null;
    this.server = null;
  }
}

export { SEASONS };
