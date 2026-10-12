import { ZONE_IDS } from '../content/ZoneIdentity.js';
import { mergeZoneEvents } from './WorldAmbientCatalog.js';
import { mergePopCultureAmbient } from '../content/ambientLore.js';

/**
 * 探索时随机氛围事件 — 区域台词 / 小惊喜。
 *
 * ## 两张表的合成
 *
 * 三张表按顺序合并（基础 → 扩写 → 致敬层），每一步都只**追加**，不覆盖：
 * `_BASE_ZONE_EVENTS`（这里）→ `ZONE_EVENTS_EXTRA`（`WorldAmbientCatalog.js`）→
 * `ZONE_EVENTS_POP`（`content/ambientLore.js`）。
 *
 * ## 每一条**真实区域**都必须有自己的台词（W-B9 余项，2026-10-12 修）
 *
 * 改前这里写的是 `ZONE_EVENTS[this.zone] ?? ZONE_EVENTS.hub` —— 一个区在表里没有条目时
 * **静默借枢纽的台词**。W-B9 把区域从 5 座扩到 7 座（幽暗林地 / 辉煌圣域），
 * 而三张表一张都没跟着加：实测 `gloom` 与 `radiant` 的条数是 **0**，于是玩家在幽暗林地
 * 会看到"世界之锚发出低沉嗡鸣 — 位面仍相连。"（枢纽的台词）。
 *
 * 这正是本仓最忌讳的形状：**不报错，只是说错话**。修法两条一起：
 * ① 给两个区补上自己的台词；② **把跨区回退删掉** —— 查不到就是空池，宁可这一刻不弹，
 * 也不拿别处的台词冒充"你在的地方"。空池的合法场合只有走廊与未知（见 `NO_AMBIENT_ZONES`），
 * 而且它现在是**显式**的：`ambientPoolFor()` 只认本区的键。
 * 门禁 `tests/world-ambient-events.test.js` 逐个真实区域点名，谁都别再悄悄少一格。
 */

/** 探索时随机氛围事件 — 区域台词 / 小惊喜 */
const _BASE_ZONE_EVENTS = {
  hub: [
    { text: '世界之锚发出低沉嗡鸣 — 位面仍相连。', weight: 1 },
    { text: '远处营火看守在整理柴薪（其实没有柴）。', weight: 0.6 },
  ],
  fantasy: [
    { text: '灰白森林起雾了 — 小心红圈。', weight: 1 },
    { text: '树梢传来精灵口哨 — 斥候在巡逻。', weight: 0.7 },
    { text: '地下城方向传来石门摩擦声…', weight: 0.5 },
  ],
  magic: [
    { text: '紫色奥术屑飘落 — 大奥术师在远处活跃。', weight: 1 },
    { text: '禁书图书馆的方向有微光闪烁。', weight: 0.6 },
  ],
  space: [
    { text: '米勒荒原引力异常 — 跳跃高度略减。', weight: 0.8 },
    { text: 'Endurance 号日志碎片在风里打转。', weight: 0.7 },
  ],
  void: [
    { text: '时间卡顿了一帧 — 你又前进了。', weight: 1 },
    { text: '时线残影在远处闪烁后消失。', weight: 0.6 },
  ],
  abyss: [
    { text: '混沌脉冲掠过地平线 — 裂隙在呼吸。', weight: 1 },
    { text: '引路人的低语：「快一点，界在变薄的。」', weight: 0.7 },
  ],
  // W-B9 的两座新区域（2026-10-12 补；改前它们的条数是 0，玩家听到的是枢纽台词）
  gloom: [
    { text: '雾又厚了一层 — 前方三步就看不清了。', weight: 1 },
    { text: '头顶枝叶间有东西挪了一下，随即安静。', weight: 0.7 },
    { text: '苔藓的荧光在树根间明灭，像谁在呼吸。', weight: 0.6 },
  ],
  radiant: [
    { text: '金沙被风推着流过脚背，烫而细。', weight: 1 },
    { text: '远处的圣殿轮廓在热气里轻轻晃动。', weight: 0.7 },
    { text: '一声很轻的钟响 — 你分不清来自哪一座塔。', weight: 0.5 },
  ],
};

/**
 * **故意**没有氛围台词的区。放进来的唯一理由是"它不是一处地方"：
 * - `corridor`（区际走廊）是一条通路，不是目的地 —— 一句"你在某地"的旁白在通路上是假话；
 * - `unknown` 是 `zoneIdAt` 认不出时给的哨兵值，它连坐标都不指向一个具体区。
 *
 * 这两个区在运行时**不会**弹氛围事件（空池），也不会去借别人的台词。
 * 门禁按这份名单划界：名单里的区不要求有条目，名单外、又在 `ZONE_ORDER`/hub 里的区
 * 必须有自己的台词 —— 少一格当场红。
 */
export const NO_AMBIENT_ZONES = Object.freeze([ZONE_IDS.CORRIDOR, ZONE_IDS.UNKNOWN]);

/** 合并后的整张表（三张表依次追加）。导出来是给门禁逐个区域点名用的，不在生产路径上读。 */
export const AMBIENT_ZONE_EVENTS = Object.freeze(
  mergePopCultureAmbient(mergeZoneEvents(_BASE_ZONE_EVENTS))
);

/**
 * 取某个区这一刻可用的氛围台词池。
 *
 * **只认本区的键**：查不到就是空数组，不回落、不借别处的台词（改前的 `?? ZONE_EVENTS.hub`
 * 正是幽暗林地听见枢纽那句话的来路）。`chapter` 用来过滤带 `minChapter` 的条目 ——
 * 这一句是运行时**真的**在用的过滤，门禁调的是同一个函数，不是抄一份判据。
 */
export function ambientPoolFor(zoneId, chapter = 1) {
  const pool = AMBIENT_ZONE_EVENTS[zoneId];
  if (!pool) return [];
  return pool.filter((e) => !e.minChapter || chapter >= e.minChapter);
}

export class WorldAmbientEvents {
  constructor(game) {
    this.game = game;
    this.zone = ZONE_IDS.HUB;
    this.timer = 45 + Math.random() * 30;
    this.seen = new Set();
  }

  setZone(zone) {
    this.zone = zone;
    this.timer = 35 + Math.random() * 25;
  }

  update(dt, playerPos) {
    this.timer -= dt;
    if (this.timer > 0 || this.game.dialog?.open || this.game.combatCamera?.blocksInput?.()) return;
    if (this.game.dungeons?.active) return;

    const pool = ambientPoolFor(this.zone, this.game.quests?.chapter ?? 1);
    // 空池（走廊 / 未知 / 全被 minChapter 滤掉）不是错误，只是这一刻没有可说的一句。
    // 把计时器推回去，免得每帧都重新走一遍这条路。
    if (!pool.length) { this.timer = 20; return; }

    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) { pick = e; break; }
    }

    const key = `${this.zone}:${pick.text.slice(0, 12)}`;
    if (!this.seen.has(key)) {
      this.seen.add(key);
      this.game.storyJournal?.add?.({
        id: `ambient-${key}`,
        category: 'poi',
        title: '旅途见闻',
        text: pick.text,
        chapter: this.game.quests?.chapter ?? 1,
      });
    }

    this.game.dialog.toast(pick.text, 3600);
    this.game.audio?.loreDiscover?.();
    this.timer = 55 + Math.random() * 45;
  }

  toJSON() {
    return { seen: [...this.seen] };
  }

  fromJSON(data) {
    if (data?.seen) this.seen = new Set(data.seen);
  }
}
