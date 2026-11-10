/**
 * 敌人图鉴的**运行时投影**（W-F1 切片1）。
 *
 * ## 它不拥有任何状态
 *
 * 图鉴不新建存档字段、不订阅击杀事件、不维护自己的计数 —— 它读的是
 * `PlayerStats.kills`（`{ type: count }`，从仓库第一天起就在存档里）。
 * 于是：
 * - 老存档一读进来，图鉴就已经是"满的"（那些杀过的怪不会从册子里消失）；
 * - 击杀账只有**一个写者**（`PlayerStats.recordKill`），图鉴永远不会与它分家；
 * - 存档版本不用 +1，也不用写迁移 —— 这一片碰到的最贵的东西恰好是"不需要动"。
 *
 * ## 它为什么不是纯函数表
 *
 * 因为"杀过几只"是**这一局**的账。`content/bestiary.js` 回答"这一类是什么"，
 * 这一层回答"玩家认识它到什么程度"。两层分开之后，门禁可以分别钉：
 * 内容层钉"每一类都收得进来"，运行时层钉"档位/筛选/统计算得对"。
 *
 * ## 未知类型的处理
 *
 * `kills` 里出现名册里没有的 id（旧版本存档、被删掉的敌人）时**不抛、不显示**：
 * 图鉴是按名册遍历的，账上多出来的键自然被忽略。反过来"名册里有一类但账上没有"
 * 是正常状态（还没杀过），显示为未记录。
 */

import { ENEMY_ROSTER } from '../content/enemies.js';
import {
  BESTIARY_SHARED_ZONE, BESTIARY_TIERS,
  bestiaryAffinity, bestiaryTierOf, bestiaryTraits, bestiaryTypes, bestiaryZoneOf,
} from '../content/bestiary.js';

/** 玩家"认识"某一类的程度 —— 三档，0 次为 `null` */
export class BestiarySystem {
  constructor(game) {
    this.game = game;
  }

  /** 击杀账（防御性读：`stats` 还没装配时图鉴也不该炸 —— 设置面板能在开局前打开） */
  kills() {
    return this.game?.stats?.kills ?? {};
  }

  killsOf(type) {
    const n = this.kills()[type];
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }

  /**
   * 一条图鉴记录。`known: false` 时**仍然给全字段**（数值、抗性、标签都在），
   * 由 UI 决定遮哪些 —— 把"遮"写在 UI 里，而不是在这里把数据抹成 null：
   * 抹掉之后想加一个"击杀 1 次解锁数值"的档位就得回来重写这一层。
   */
  entryOf(type) {
    const row = ENEMY_ROSTER[type];
    if (!row) return null;
    const kills = this.killsOf(type);
    const tier = bestiaryTierOf(kills);
    return {
      type,
      nameKey: row.name,
      kills,
      known: kills > 0,
      tier,
      tierId: tier?.id ?? null,
      tierIndex: tier ? BESTIARY_TIERS.findIndex((t) => t.id === tier.id) : -1,
      zone: bestiaryZoneOf(type),
      traits: bestiaryTraits(type).map((t) => t.id),
      affinity: bestiaryAffinity(type),
      stats: {
        hp: row.hp ?? 0,
        posture: row.posture ?? 0,
        damage: row.damage ?? 0,
        speed: row.speed ?? 0,
        aggroRange: row.aggroRange ?? 0,
      },
    };
  }

  /** 全部记录（名册顺序）。`filter` 取 `BESTIARY_FILTERS` 的 id */
  entries(filter = 'all') {
    const all = bestiaryTypes().map((type) => this.entryOf(type)).filter(Boolean);
    if (filter === 'all') return all;
    return all.filter((e) => e.zone === filter);
  }

  /**
   * 汇总读数：`seen` = 杀过的类数，`mastered` = 精通（15 次）的类数。
   * `percent` 用 **seen / total** —— 图鉴的"完成度"是"见过多少种"，
   * 不是"精通多少种"：把百分比绑在精通上会让 90% 的册子长期停在 3%。
   */
  getStats() {
    const all = this.entries('all');
    const total = all.length;
    const seen = all.filter((e) => e.known).length;
    const mastered = all.filter((e) => e.tierId === 'mastered').length;
    return {
      total,
      seen,
      mastered,
      percent: total === 0 ? 0 : Math.round((seen / total) * 100),
      /** 按档位分桶，给成就/面板做副读数用（键就是 `BESTIARY_TIERS` 的 id） */
      tiers: Object.fromEntries(BESTIARY_TIERS.map((t) => [
        t.id, all.filter((e) => e.tierId === t.id).length,
      ])),
    };
  }

  /** 某一档（`shared` / `gloom` / …）有多少类 —— 筛选条上不带数字，留给面板自己决定 */
  countInZone(zone) {
    return this.entries(zone === 'all' ? 'all' : zone).length;
  }

  /**
   * 最近解锁的一批（按档位高→低、击杀数高→低排）。
   * 目前没有面板消费它；留着是因为"图鉴解锁一条就弹一次"是这类系统的常规做法，
   * 而弹出的时机必须**由账算**，不能由 UI 自己记 —— 那是第二个真源。
   */
  highlights(limit = 5) {
    return this.entries('all')
      .filter((e) => e.known)
      .sort((a, b) => (b.tierIndex - a.tierIndex) || (b.kills - a.kills))
      .slice(0, Math.max(0, limit));
  }

  /** 该位面是否真的有图鉴条目（给筛选条做空档保护） */
  static hasEntries(zone) {
    return bestiaryTypes().some((type) => bestiaryZoneOf(type) === zone);
  }

  /** 与其它子系统同一形状：这一层没有监听、没有 THREE 资源，`dispose` 是显式的"什么都不用收" */
  dispose() {
    this.game = null;
  }
}

export { BESTIARY_SHARED_ZONE };
