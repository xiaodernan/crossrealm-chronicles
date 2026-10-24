import { ZONE_IDS } from '../content/ZoneIdentity.js';
import { mergeZoneEvents } from './WorldAmbientCatalog.js';
import { mergePopCultureAmbient } from '../content/ambientLore.js';
import { t } from '../engine/i18n.js';
import { keyText } from '../ui/keyHints.js';

/**
 * 氛围事件进日志时的条目标题（**文案键**，W-D2 切片16a）。
 *
 * 改前这里是裸中文 `'旅途见闻'` —— 日志里那一条的标题永远中文，
 * 切到英文语言时它不变，而同一条的正文会跟着变 —— 一条日志两个语种。
 */
/**
 * 氛围台词进日志时的那一行标题（i18n 键）。**不导出**（2026-10-23 过导出决断）：
 * 只在本文件用一次，外部零 import；键本身登记在双语文案表里，解析路径由
 * `tests/world-ambient-events.test.js` 的行为断言盯着（日志条目的标题真的展开成那句话）。
 */
const AMBIENT_JOURNAL_TITLE = 'ambient_journal_title';

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

/**
 * 探索时随机氛围事件 — 区域台词 / 小惊喜。
 *
 * ## `text` 存的是**文案键**（W-D2 切片16a），不是文案本身
 *
 * 三张表（基础 / 扩写 / 致敬层）合起来 60 条，全是玩家会看到的字。
 * 改前它们都是裸中文，于是切到英文语言时这一族台词**原样留在中文** ——
 * 界面上一半是英文一半是中文，而没有任何一处会报错。
 * 现在数据层只存键（`ambient_<区>_<序号>`，扩展层 `_e` 后缀、致敬层 `_p` 后缀），
 * 显示侧（`update()` 那一条路）在播出那一刻 `keyText(t(键))` 展开。
 *
 * **键即身份**：`seen` 去重账用键而不是文案前 12 个字 —— 换语言时同一句的文案变了，
 * 键没变，那条"已见过"才不会因为换了语言就重新弹一遍。
 */
const _BASE_ZONE_EVENTS = {
  hub: [
    { text: 'ambient_hub_0', weight: 1 },
    { text: 'ambient_hub_1', weight: 0.6 },
  ],
  fantasy: [
    { text: 'ambient_fantasy_0', weight: 1 },
    { text: 'ambient_fantasy_1', weight: 0.7 },
    { text: 'ambient_fantasy_2', weight: 0.5 },
  ],
  magic: [
    { text: 'ambient_magic_0', weight: 1 },
    { text: 'ambient_magic_1', weight: 0.6 },
  ],
  space: [
    { text: 'ambient_space_0', weight: 0.8 },
    { text: 'ambient_space_1', weight: 0.7 },
  ],
  void: [
    { text: 'ambient_void_0', weight: 1 },
    { text: 'ambient_void_1', weight: 0.6 },
  ],
  abyss: [
    { text: 'ambient_abyss_0', weight: 1 },
    { text: 'ambient_abyss_1', weight: 0.7 },
  ],
  // W-B9 的两座新区域（2026-10-12 补；改前它们的条数是 0，玩家听到的是枢纽台词）
  gloom: [
    { text: 'ambient_gloom_0', weight: 1 },
    { text: 'ambient_gloom_1', weight: 0.7 },
    { text: 'ambient_gloom_2', weight: 0.6 },
  ],
  radiant: [
    { text: 'ambient_radiant_0', weight: 1 },
    { text: 'ambient_radiant_1', weight: 0.7 },
    { text: 'ambient_radiant_2', weight: 0.5 },
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

    /* `pick.text` 现在是**文案键**（W-D2 切片16a）：展开只在这一处做，
     * 展开出来的句子进日志（快照语义 —— 换语言不回改已存的那一条），
     * 而 `seen` 去重账存**键**：键不随语言变，同一句换语言后不会被当成"没见过的"重弹一遍。 */
    const 文案 = keyText(t(pick.text));
    const key = `${this.zone}:${pick.text}`;
    if (!this.seen.has(key)) {
      this.seen.add(key);
      this.game.storyJournal?.add?.({
        id: `ambient-${key}`,
        category: 'poi',
        title: keyText(t(AMBIENT_JOURNAL_TITLE)),
        text: 文案,
        chapter: this.game.quests?.chapter ?? 1,
      });
    }

    this.game.dialog.toast(文案, 3600);
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
