/**
 * 赛季（W-F2 切片1）—— 客户端这一侧的赛季名册与轮转规则。
 *
 * ## 与 `server/season-service` 的关系：**同一条规则，两份实现**
 *
 * 服务端的 `SeasonCatalog` 用 `epochDay / cycleDays` 取模算当前赛季；这里用**同一个算式**。
 * 这不是"又抄一份真源"，而是这个功能的设计前提：
 *
 * - 赛季服务是**可选**的。没有它的时候，游戏仍然要有赛季（单机玩家不该看到一片空白）；
 * - 有它的时候，它只做一件事：**确认**本地算出来的那一季，并把运维的 override 带下来。
 *
 * 两份实现必须给出同一个答案，这一点由 `tests/seasons.test.js` 用**同一批 epochDay**
 * 逐日比对（名单与服务端 `SeasonCatalogTest` 用的是同一组边界）来钉。
 *
 * ## 词缀为什么只有 id 和文案
 *
 * 服务端不认识游戏机制，它只发 id（`burning-ground` 这类）。**这些 id 意味着什么，
 * 只有客户端说了算** —— 所以词缀表在这里，服务端加一条新词缀也不会让老客户端崩
 * （未知 id 直接不显示，见 `SeasonSystem`）。真正的数值效果属于试炼（W-F3），
 * 这一片只把"这一季带哪几条"如实呈现出来，不假装它们已经在改数值。
 */

/** 一个赛季多少天 —— 与服务端 `season-service.cycle-days` 的默认值同一个数 */
export const SEASON_CYCLE_DAYS = 14;

/**
 * 四套赛季，顺序即轮转顺序，id 与服务端名册**逐字相同**。
 * 名字与说明存的是**文案键**（与仓库其它内容表同一口径）。
 */
export const SEASONS = Object.freeze([
  Object.freeze({
    id: 'ember',
    name: 'season_ember_name',
    tagline: 'season_ember_tagline',
    modifierIds: Object.freeze(['burning-ground', 'elite-surge']),
    soulsBonusPct: 25,
  }),
  Object.freeze({
    id: 'tide',
    name: 'season_tide_name',
    tagline: 'season_tide_tagline',
    modifierIds: Object.freeze(['drowned-echo', 'heavy-fog']),
    soulsBonusPct: 20,
  }),
  Object.freeze({
    id: 'gloom',
    name: 'season_gloom_name',
    tagline: 'season_gloom_tagline',
    modifierIds: Object.freeze(['gloom-veil', 'swift-shades']),
    soulsBonusPct: 30,
  }),
  Object.freeze({
    id: 'radiant',
    name: 'season_radiant_name',
    tagline: 'season_radiant_tagline',
    modifierIds: Object.freeze(['radiant-decree', 'armored-choir']),
    soulsBonusPct: 30,
  }),
]);

/**
 * 词缀名册（八条）。id 里的连字符在文案键里换成下划线 —— 键名规范只允许小写 snake_case。
 *
 * 每条都只有一句"它让这一季变成什么样"，**不写数值**：数值属于试炼，
 * 写在赛季页上会变成一句玩家永远验证不了的承诺。
 */
export const SEASON_MODIFIERS = Object.freeze([
  Object.freeze({ id: 'burning-ground', label: 'season_mod_burning_ground', desc: 'season_mod_burning_ground_desc' }),
  Object.freeze({ id: 'elite-surge', label: 'season_mod_elite_surge', desc: 'season_mod_elite_surge_desc' }),
  Object.freeze({ id: 'drowned-echo', label: 'season_mod_drowned_echo', desc: 'season_mod_drowned_echo_desc' }),
  Object.freeze({ id: 'heavy-fog', label: 'season_mod_heavy_fog', desc: 'season_mod_heavy_fog_desc' }),
  Object.freeze({ id: 'gloom-veil', label: 'season_mod_gloom_veil', desc: 'season_mod_gloom_veil_desc' }),
  Object.freeze({ id: 'swift-shades', label: 'season_mod_swift_shades', desc: 'season_mod_swift_shades_desc' }),
  Object.freeze({ id: 'radiant-decree', label: 'season_mod_radiant_decree', desc: 'season_mod_radiant_decree_desc' }),
  Object.freeze({ id: 'armored-choir', label: 'season_mod_armored_choir', desc: 'season_mod_armored_choir_desc' }),
]);

/** 词缀 id → 那一行（未知 id 返回 null：服务端加了新词缀，老客户端不显示而不是崩） */
export function modifierOf(id) {
  return SEASON_MODIFIERS.find((row) => row.id === id) ?? null;
}

/** 赛季 id → 那一行 */
export function seasonOf(id) {
  return SEASONS.find((row) => row.id === id) ?? null;
}

/**
 * 第 `epochDay` 天属于哪一季 —— **与服务端 `SeasonCatalog#active()` 同一个算式**：
 * `floorDiv(day, cycleDays)` 得到周期序号（负数向下取整），再对名册长度取模。
 *
 * JS 的 `%` 对负数返回负值，所以取模必须写成 `((x % n) + n) % n`；
 * Java 那边用的是 `Math.floorMod`，两者在全部整数上等价。
 */
export function seasonAt(epochDay, cycleDays = SEASON_CYCLE_DAYS) {
  if (!Number.isFinite(epochDay)) throw new TypeError(`seasonAt: epochDay 必须是数，收到 ${epochDay}`);
  if (!Number.isInteger(cycleDays) || cycleDays <= 0) {
    throw new RangeError(`seasonAt: cycleDays 必须是正整数，收到 ${cycleDays} —— 0 或负数会让周期除法失去意义`);
  }
  const day = Math.floor(epochDay);
  const cycleIndex = Math.floor(day / cycleDays);
  const index = ((cycleIndex % SEASONS.length) + SEASONS.length) % SEASONS.length;
  return SEASONS[index];
}

/** 本周期第几天（0 起）—— 与 `seasonAt` 同一个 day 口径 */
export function dayInCycleAt(epochDay, cycleDays = SEASON_CYCLE_DAYS) {
  const day = Math.floor(epochDay);
  return ((day % cycleDays) + cycleDays) % cycleDays;
}

/** 本周期还剩几天（含今天，最小 1） */
export function daysRemainingAt(epochDay, cycleDays = SEASON_CYCLE_DAYS) {
  return cycleDays - dayInCycleAt(epochDay, cycleDays);
}

/** 从毫秒时间戳取"第几天"（UTC 日界，与服务端 `LocalDate.now(UTC)` 对齐） */
export function epochDayOf(timestampMs) {
  return Math.floor(timestampMs / 86400000);
}
