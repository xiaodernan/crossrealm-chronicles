/**
 * 敌人图鉴的静态口径（W-F1 切片1）。
 *
 * ## 为什么图鉴是"推出来的"而不是"再写一张表"
 *
 * 名册里现在有 **61 个 `ENEMY_ROSTER` 条目**（其中 `dummy` 是训练木人，不是敌人）。
 * 手抄一张 60 行的图鉴表意味着**第二个真源**：改一个 `hp`、加一类敌人、调一次移速，
 * 图鉴那一行不会跟着动，而它错的形状恰好是"玩家读到的数字"—— 最不该错的那种。
 *
 * 所以这里只登记三样东西：
 * 1. **档位**（击杀多少算"见过 / 研过 / 精通"）—— 这是设计选择，代码里没有第二个答案；
 * 2. **特征标签的判据**（疾行 / 重装 / 硬架势 / 远哨 / 浮空）—— 每个标签是一条**阈值**，
 *    从 `ENEMY_ROSTER` 与 `BODY_PLANS` 现算，不抄任何一类的名字；
 * 3. **元素名**（火 / 冰 / 引力）—— 抗性表里出现过的三种，文案键在这里，别处不再写。
 *
 * 图鉴的**内容**（这一类的血量、抗性、住在哪、杀过几只）全部来自已有真源：
 * `ENEMY_ROSTER`（身份与基础数值）、`ENEMY_RESIST`（属性相性）、`BODY_PLANS`（体型/浮空）、
 * `PlayerStats.kills`（击杀账，存档里本来就有，**不需要存档版本 +1**）。
 *
 * ## 为什么"居所"只认前缀，不按坐标反推
 *
 * 区域的半径是**氛围的领地**（量级 135–165 米，彼此大面积重叠），按坐标反推
 * "这一类住在哪"会把一只站在重叠带上的怪判给隔壁区 —— 而这正是 B121 / B150 那一族
 * 已经踩过的坑（`zoneIdAt` 只回答"大气归属"）。图鉴要的答案是"它是哪座位面的东西"，
 * 那件事在 id 前缀里写着（`gloom_*` / `radiant_*` / `void_*` / `abyss_*`），
 * `tests/zone-exclusive-enemies.test.js` 早就在用同一条口径。
 *
 * 没有前缀的是**通用野怪**（士兵 / 构装体 / 无人机 / …），它们本来就跨区刷，
 * 归到 `shared` 一档 —— 不假装它们属于某一座位面。
 */

import { ENEMY_ROSTER } from './enemies.js';
import { ENEMY_RESIST, BODY_PLANS } from './tuning.js';

/** 训练木人不是敌人：它不可攻击、不结算击杀，进图鉴只会永远停在"未记录" */
export const BESTIARY_EXCLUDED = Object.freeze(['dummy']);

/**
 * 三档"认识程度"。阈值是**设计选择**，不是数据：1 次 = 见过，5 次 = 摸清招式，15 次 = 精通。
 * 15 这个数取自"一场 Boss 战 + 两次清剿"的量级 —— 玩家不需要刻意刷就能到。
 */
export const BESTIARY_TIERS = Object.freeze([
  Object.freeze({ id: 'sighted', kills: 1, label: 'bestiary_tier_sighted' }),
  Object.freeze({ id: 'studied', kills: 5, label: 'bestiary_tier_studied' }),
  Object.freeze({ id: 'mastered', kills: 15, label: 'bestiary_tier_mastered' }),
]);

/** 抗性表里出现过的三种元素（`fire` / `ice` / `gravity`）；文案键只在这里写一次 */
export const BESTIARY_ELEMENTS = Object.freeze([
  Object.freeze({ id: 'fire', label: 'bestiary_elem_fire' }),
  Object.freeze({ id: 'ice', label: 'bestiary_elem_ice' }),
  Object.freeze({ id: 'gravity', label: 'bestiary_elem_gravity' }),
]);

/** 位面前缀 → 区域 id。图鉴的"居所"从 id 推，不从坐标推（见文件头） */
const ZONE_PREFIXES = Object.freeze([
  Object.freeze({ prefix: 'gloom_', zone: 'gloom' }),
  Object.freeze({ prefix: 'radiant_', zone: 'radiant' }),
  Object.freeze({ prefix: 'void_', zone: 'void' }),
  Object.freeze({ prefix: 'abyss_', zone: 'abyss' }),
]);

/** 没有位面前缀的那一档（通用野怪，跨区刷） */
export const BESTIARY_SHARED_ZONE = 'shared';

/**
 * 特征标签：每条 = 一个阈值 + 一句文案键。
 * `test` 收 `(row, type)` —— `hover` 要读 `BODY_PLANS`（体型表），其余读名册那一行。
 *
 * 阈值挑的都是名册里**真实存在的分界**（而不是"看着顺眼"）：
 * 疾行 6.5 把掠行兽/舞者那一档与重装分开；重装 240 把构装体/骑士/壁垒那一档拎出来；
 * 硬架势 80 是"砍上去会被弹开"的那一档；远哨 28 是"还没看见它就先被它看见"的那一档。
 */
export const BESTIARY_TRAITS = Object.freeze([
  Object.freeze({ id: 'swift', label: 'bestiary_trait_swift', test: (row) => (row.speed ?? 0) >= 6.5 }),
  Object.freeze({ id: 'heavy', label: 'bestiary_trait_heavy', test: (row) => (row.hp ?? 0) >= 240 }),
  Object.freeze({ id: 'sturdy', label: 'bestiary_trait_sturdy', test: (row) => (row.posture ?? 0) >= 80 }),
  Object.freeze({ id: 'far', label: 'bestiary_trait_far', test: (row) => (row.aggroRange ?? 0) >= 28 }),
  Object.freeze({ id: 'hover', label: 'bestiary_trait_hover', test: (_row, type) => (BODY_PLANS[type]?.hover ?? 0) > 0 }),
]);

/**
 * 图鉴收录的敌人 id（名册顺序，跳过训练木人）。
 * **顺序不排序**：名册的顺序是"先通用、后位面、位面内按落地先后"—— 那正好是玩家遇到它们的顺序，
 * 图鉴按它排读起来像一本册子，按字母排则像一张 CSV。
 */
export function bestiaryTypes() {
  return Object.keys(ENEMY_ROSTER).filter((type) => !BESTIARY_EXCLUDED.includes(type));
}

/** 这一类属于哪一档：`gloom` / `radiant` / `void` / `abyss` / `shared` */
export function bestiaryZoneOf(type) {
  const hit = ZONE_PREFIXES.find((row) => type.startsWith(row.prefix));
  return hit ? hit.zone : BESTIARY_SHARED_ZONE;
}

/**
 * 击杀数 → 档位行。0 次返回 `null`（那是"还没记录"，不是最低档）。
 * 负数按 0 处理：存档里的脏值不该让图鉴显示"负击杀"。
 */
export function bestiaryTierOf(kills) {
  const n = Number.isFinite(kills) ? Math.max(0, Math.floor(kills)) : 0;
  let hit = null;
  for (const tier of BESTIARY_TIERS) if (n >= tier.kills) hit = tier;
  return hit;
}

/** 这一类的特征标签（可能是空数组 —— 大多数通用野怪不该硬凑一个标签） */
export function bestiaryTraits(type) {
  const row = ENEMY_ROSTER[type];
  if (!row) return [];
  return BESTIARY_TRAITS.filter((trait) => trait.test(row, type));
}

/**
 * 属性相性：最怕的那一系与最抗的那一系。
 *
 * 符号约定沿用 `ENEMY_RESIST`：**负数 = 更吃这一系**（弱点），正数 = 抗性。
 * 相等时取表里靠前的那一条（`BESTIARY_ELEMENTS` 的顺序是火/冰/引力），
 * 于是同一份抗性表永远给出同一个答案 —— 不靠对象键序。
 */
export function bestiaryAffinity(type) {
  const row = ENEMY_RESIST[type] ?? {};
  let weak = null;
  let resist = null;
  for (const elem of BESTIARY_ELEMENTS) {
    const value = row[elem.id];
    if (!Number.isFinite(value) || value === 0) continue;
    if (value < 0 && (!weak || value < weak.value)) weak = { ...elem, value };
    if (value > 0 && (!resist || value > resist.value)) resist = { ...elem, value };
  }
  return { weak, resist };
}

/**
 * 图鉴筛选条要的那几档：`all` + 四座有独占敌人的位面 + 通用。
 *
 * **刻意不给 fantasy / magic / space 三档**：那三座位面没有带前缀的独占敌人
 * （士兵/构装体/无人机是跨区通用野怪），给一个点进去必然是空列表的按钮，
 * 等于让玩家以为自己的图鉴漏了三页。
 */
export const BESTIARY_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: 'franchise_all_label' }),
  Object.freeze({ id: 'gloom', label: 'zone_name_gloom' }),
  Object.freeze({ id: 'radiant', label: 'zone_name_radiant' }),
  Object.freeze({ id: 'void', label: 'zone_name_void' }),
  Object.freeze({ id: 'abyss', label: 'zone_name_abyss' }),
  Object.freeze({ id: BESTIARY_SHARED_ZONE, label: 'bestiary_zone_shared' }),
]);
