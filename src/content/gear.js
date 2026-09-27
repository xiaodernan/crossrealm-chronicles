/**
 * 装备的数据层（W-B5 切片1）：槽位、基表、稀有度、词缀，以及"一件装备等于几点属性"这一处算式。
 *
 * ## 为什么装备加的是**属性点**，而不是自己的乘数
 *
 * `PlayerStats` 已经把四组数值写成派生 getter（`maxHp = 100 + vigor × 18`、
 * `damageMult = 1 + strength × 0.08` …），升级面板、存档、`SpellSystem.maxMana` 读的都是这些
 * getter。装备若另立一条 `gearDamageMult`，"最终伤害"就有了两处生产者 —— 而这两处的相乘顺序、
 * 取整时机、与 hitstop/暴击的先后，全都没有裁判（B36 那一族：同一条算式抄第二份，漂移不报错，
 * 玩家只看到数字与预期不符却说不出哪儿不对）。
 * 加属性点则整条链一个字都不用改：**装备与升级吃同一本账**，稀有度越高就是点越多。
 *
 * ## 为什么这张表今天没有中文显示名与颜色
 *
 * 因为还没有人读它。`name` 与 `tint` 会在"拾取提示 / 掉落物网格 / 营火面板"那一片接上（切片2），
 * 那时它们各自有消费者；现在写进表里就是一格"声明了没人校验也没人显示"的数据 ——
 * 本仓的门禁专门扫这种形状（切片20 那条"表里有而页面没有"就是它的读数版本）。
 *
 * ## 随机数从哪儿来
 *
 * `rollGear(rng)` 收一个 `() => number`（0~1），默认 `Math.random`。不注入的话用例只能断言
 * "在范围内"，那是最弱的一种断言：一件装备是不是真按权重掉、词缀会不会重复、稀有度与条数对不对，
 * 全都查不出来。测试用一条线性同余的定序 rng，于是"这一件是这个 base"是可复现的期望值。
 */

/** 槽位：装备必须落到一个槽上；`GEAR_BASES.slot` 与玩家档的 `gear` 都以这张表为准 */
export const GEAR_SLOTS = ['charm', 'sigil'];

/**
 * 装备能改的属性点，只许是这五个。
 *
 * 为什么不是"随便什么键"：这五个各自有一个真消费者 —— `vigor → maxHp`、`endurance → maxStamina`、
 * `strength → damageMult`、`arcane → skillMult` 与 `maxMana`、`mind → maxMana`。多加一个键不会报错，
 * 只会让那一点属性**没有主人**（装备说明上写着"+3 幸运"而玩家身上什么都不变），而注册表按这份名单
 * 当场拦住。
 */
export const GEAR_STATS = ['vigor', 'endurance', 'strength', 'arcane', 'mind'];

/**
 * 稀有度。`affixes` 是这一档**额外**挂几条词缀（基表那几点是底座），`weight` 是掉落的相对权重。
 *
 * 为什么条数写在稀有度里而不是词缀表里：一次 roll 需要的是"抽几条"，把答案放在词缀那一侧
 * 就得先抽完再数，而"抽几条"决定"能抽到谁"（同一枚词缀不该在一次 roll 里出现两遍）。
 */
export const GEAR_RARITY = [
  { id: 'common', weight: 62, affixes: 0 },
  { id: 'uncommon', weight: 26, affixes: 1 },
  { id: 'rare', weight: 9, affixes: 2 },
  { id: 'epic', weight: 3, affixes: 3 },
];

/**
 * 基表。`mods` 是这件装备天生给的属性点，`weight` 是在**同槽**内的相对权重。
 *
 * 权重分两层（稀有度一层、基表一层）而不是摊成一张 24 行的联合表：一件装备"有多稀有"与
 * "是哪个底座"是两件事，摊平成一张表就要为每个组合抄一行，加一档稀有度得改六行。
 */
export const GEAR_BASES = [
  { id: 'ash-charm', slot: 'charm', weight: 30, mods: { vigor: 1 } },
  { id: 'tide-charm', slot: 'charm', weight: 24, mods: { endurance: 1 } },
  { id: 'ember-charm', slot: 'charm', weight: 18, mods: { strength: 1 } },
  { id: 'oath-charm', slot: 'charm', weight: 8, mods: { vigor: 1, endurance: 1 } },
  { id: 'quill-sigil', slot: 'sigil', weight: 30, mods: { arcane: 1 } },
  { id: 'ring-sigil', slot: 'sigil', weight: 22, mods: { mind: 1 } },
  { id: 'war-sigil', slot: 'sigil', weight: 14, mods: { strength: 1 } },
  { id: 'dual-sigil', slot: 'sigil', weight: 8, mods: { strength: 1, arcane: 1 } },
];

/**
 * 词缀池。`minRarity` 决定这枚词缀从哪一档起才会出现 —— 凡品上不该长出史诗的词。
 *
 * 为什么词缀不分槽：词缀只加属性点，不加"这件装备是什么"，所以同一枚词缀贴在护符或印记上
 * 算式相同。真要分槽（比如某条词缀只给法术），那时再给这行加一个 `slot`，注册表的字段规则
 * 是 `required: false` 的加列，不是重写这张表。
 */
export const GEAR_AFFIXES = [
  { id: 'vigor-ward', weight: 20, minRarity: 'common', mods: { vigor: 1 } },
  { id: 'endurance-march', weight: 20, minRarity: 'common', mods: { endurance: 1 } },
  { id: 'ember-edge', weight: 16, minRarity: 'uncommon', mods: { strength: 1 } },
  { id: 'arcane-lens', weight: 16, minRarity: 'uncommon', mods: { arcane: 1 } },
  { id: 'clear-mind', weight: 12, minRarity: 'uncommon', mods: { mind: 1 } },
  { id: 'twin-fang', weight: 8, minRarity: 'rare', mods: { strength: 1, arcane: 1 } },
  { id: 'bulwark-oath', weight: 6, minRarity: 'rare', mods: { vigor: 1, endurance: 1 } },
  { id: 'archmagistone', weight: 2, minRarity: 'epic', mods: { arcane: 2, mind: 1 } },
];

/** 表内查表用的索引：`id` 是数据里的钥匙，重复的 id 由注册表在加载期算红 */
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const RARITY = byId(GEAR_RARITY);
const BASES = byId(GEAR_BASES);
const AFFIXES = byId(GEAR_AFFIXES);

export const rarityOf = (id) => RARITY[id] ?? null;
export const baseOf = (id) => BASES[id] ?? null;
export const affixOf = (id) => AFFIXES[id] ?? null;

/** 稀有度的排序：`minRarity` 比的是"这档或更高"，所以要有一把尺子而不是比字符串 */
const RARITY_RANK = Object.fromEntries(GEAR_RARITY.map((r, i) => [r.id, i]));
export const rarityRank = (id) => RARITY_RANK[id] ?? -1;

const weightedPick = (rows, rng, allowed) => {
  const pool = allowed ? rows.filter(allowed) : rows;
  const total = pool.reduce((s, r) => s + r.weight, 0);
  // 落在 [0,1) 的抽样点按累计权重切段：`roll` 恰好等于 total 那一档也要有归属，所以用 <
  let roll = rng() * total;
  for (const r of pool) {
    if (roll < r.weight) return r;
    roll -= r.weight;
  }
  return pool[pool.length - 1];              // rng 给出 1.0 时的兜底：最后一档
};

/**
 * 抽一件装备。返回的是**实例数据**（可以原样进存档），不是 THREE 网格也不是运行时对象。
 *
 * 词缀**不重复**：同一枚词缀在一次 roll 里出现两遍等于同一件装备给自己加了两遍同一条属性，
 * 而"装备看起来只有一条词缀说明"—— 显示与账本分家（B47 那一族）。
 */
export function rollGear(rng = Math.random) {
  const rarity = weightedPick(GEAR_RARITY, rng);
  const base = weightedPick(GEAR_BASES, rng, (b) => b.weight > 0);
  const wanted = rarity.affixes;
  const picked = [];
  const taken = new Set();
  for (let i = 0; i < wanted; i++) {
    const affix = weightedPick(GEAR_AFFIXES, rng,
      (a) => !taken.has(a.id) && rarityRank(a.minRarity) <= rarityRank(rarity.id));
    if (!affix) break;                      // 这一档够不到任何词缀：少给一条而不是给个假的
    picked.push(affix.id);
    taken.add(affix.id);
  }
  return { base: base.id, rarity: rarity.id, affixes: picked };
}

/** 这一件装备等于哪些属性点（基表 + 词缀一起加）。**全仓只有这一处**把实例换算成点数 */
export function gearMods(instance) {
  const out = {};
  const add = (mods) => {
    for (const [stat, n] of Object.entries(mods ?? {})) out[stat] = (out[stat] ?? 0) + n;
  };
  const base = BASES[instance?.base];
  if (!base) return null;
  add(base.mods);
  const seen = new Set();
  for (const id of instance.affixes ?? []) {
    const affix = AFFIXES[id];
    if (!affix || seen.has(id)) continue;   // 不认识的词缀与重复的都不进账：存档可被手写
    seen.add(id);
    add(affix.mods);
  }
  return out;
}

/**
 * 认一件"实例"是否合这张表的规矩。存档读进来时问这里：坏的那一件当件丢掉，而不是整包回默认 ——
 * 与 `padTuning()` 逐项回落是同一条纪律（一格坏不连累别的格子）。
 */
export function isGearInstance(instance) {
  if (!instance || typeof instance !== 'object') return false;
  const base = BASES[instance.base];
  if (!base) return false;
  if (!RARITY[instance.rarity]) return false;
  if (!Array.isArray(instance.affixes)) return false;
  const seen = new Set();
  for (const id of instance.affixes) {
    const affix = AFFIXES[id];
    if (!affix || seen.has(id)) return false;
    if (rarityRank(affix.minRarity) > rarityRank(instance.rarity)) return false;
    seen.add(id);
  }
  return true;
}
