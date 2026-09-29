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
 * ## 显示名与颜色为什么在切片2 才进来
 *
 * 切片1 只有账，没有脸：那时写 `label` 与 `tint` 就是一格"没人校验也没人显示"的数据（切片20 那条
 * "表里有而页面没有"扫的正是这种形状）。切片2 带来了两个真消费者 —— 拾取提示那一行字，和地上
 * 那一团光的颜色 —— 字样与颜色从此有人读，也就开始被门禁双向盯着（名单里有而表里没有 = 那条名字
 * 永远不会出现；表里有而名单没有 = 玩家看到一个 id）。
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
 * 槽位的中文名（W-B5 切片4）。切片1 只有账没有脸 —— 没有任何界面上说过这两个词，所以当时不写；
 * 装备页签第一次要把槽显示给人看，名字才有了消费者（表里有而页面没有 / 页面上有而表里没有，
 * 注册表那条**双向** invariant 两头都盯）。
 */
export const GEAR_SLOT_NAMES = { charm: '护符', sigil: '印记' };

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
 * 抽稀有度那一档该挂的词缀：条数由稀有度给，同一枚在一次 roll 里不许出现两次。
 * `rollGear`（池里抽）与 `rollBossGear`（固定掉落）共用这一处 —— 抄一份就等于两种装备
 * 各有一套"词缀怎么抽"的规矩，改一条而另一条不动不报错（B36 那一族）。
 */
function rollAffixes(rng, rarity) {
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
  return picked;
}

/**
 * 抽一件装备。返回的是**实例数据**（可以原样进存档），不是 THREE 网格也不是运行时对象。
 *
 * 词缀**不重复**：同一枚词缀在一次 roll 里出现两遍等于同一件装备给自己加了两遍同一条属性，
 * 而"装备看起来只有一条词缀说明"—— 显示与账本分家（B47 那一族）。
 */
export function rollGear(rng = Math.random, zoneId = 'default') {
  const rarity = weightedPick(GEAR_RARITY, rng);
  const entry = weightedPick(poolForZone(zoneId), rng, (e) => e.weight > 0);
  const base = BASES[entry.base];
  return { base: base.id, rarity: rarity.id, affixes: rollAffixes(rng, rarity) };
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

/* ------------------------------------------------------------------ *
 * 显示与掉落（切片2）：这两件事第一次有了消费者
 * ------------------------------------------------------------------ */

/**
 * 稀有度的字样与颜色。**只有这一处**：地上那团光与拾取提示里那个词必须是同一个答案，
 * 分两处写迟早一个说蓝的一个说紫的（B36 那一族 —— 同一条算式抄两处，漂移不报错）。
 */
export const GEAR_RARITY_DISPLAY = {
  common: { label: '凡品', tint: 0xbfc7d1 },
  uncommon: { label: '良品', tint: 0x63d97a },
  rare: { label: '稀有', tint: 0x4ea8ff },
  epic: { label: '史诗', tint: 0xc77bff },
};

/** 基表与词缀的中文名：`id` 是数据用的，字样是给人看的，两者不许互换 */
export const GEAR_NAMES = {
  'ash-charm': '灰烬护符', 'tide-charm': '潮纹护符', 'ember-charm': '余烬护符', 'oath-charm': '誓约护符',
  'quill-sigil': '笔痕印记', 'ring-sigil': '环纹印记', 'war-sigil': '战纹印记', 'dual-sigil': '双纹印记',
  'vigor-ward': '固守', 'endurance-march': '长行', 'ember-edge': '余烬之锋', 'arcane-lens': '奥术透镜',
  'clear-mind': '清明', 'twin-fang': '双牙', 'bulwark-oath': '壁垒之誓', 'archmagistone': '大贤者石',
};

/**
 * 掉率与折魂数。`byKind` 的键是 `EnemyManager` 交过来的敌人档位名，`none` 是名单外档位的兜底 ——
 * 兜底必须写成显式一格，否则"新加一种敌人"的表现是"它永远不掉装备"（静默，没有报错）。
 * `dummy: 0` 同理是显式的"训练木人什么都不掉"，而不是"漏写了"。
 */
export const GEAR_DROP = {
  byKind: { boss: 1, elite: 0.5, golem: 0.35, normal: 0.15, dummy: 0, none: 0.15 },
  soulValue: { common: 20, uncommon: 45, rare: 90, epic: 160 },
};

/**
 * 每个区域掉得出哪些基表（切片3）。`weight` 只在**本池内**比大小，所以同一个 base 可以在
 * 两个区域用不同的权重。
 *
 * 为什么按区域而不是全局一张池：§1.2 的 B6 与 C3 都在说"区域之间没差别"，而"这里的怪掉的东西
 * 与那里的不一样"是路线感知最便宜的一种做法。为什么 `default` 是显式一格：`corridor` 与
 * `unknown` 都落它 —— 新加一个区域而忘了列池，表现将是"那里的怪什么都不掉"（静默，不报错）。
 */
export const GEAR_POOLS = {
  default: [{ base: 'ash-charm', weight: 3 }, { base: 'tide-charm', weight: 3 },
    { base: 'quill-sigil', weight: 2 }, { base: 'ring-sigil', weight: 2 }],
  hub: [{ base: 'tide-charm', weight: 4 }, { base: 'ring-sigil', weight: 2 },
    { base: 'ash-charm', weight: 2 }],
  fantasy: [{ base: 'ash-charm', weight: 4 }, { base: 'ember-charm', weight: 3 },
    { base: 'war-sigil', weight: 3 }],
  magic: [{ base: 'quill-sigil', weight: 5 }, { base: 'dual-sigil', weight: 2 },
    { base: 'oath-charm', weight: 3 }],
  space: [{ base: 'ring-sigil', weight: 4 }, { base: 'war-sigil', weight: 3 },
    { base: 'dual-sigil', weight: 3 }, { base: 'ember-charm', weight: 2 }],
  void: [{ base: 'oath-charm', weight: 5 }, { base: 'dual-sigil', weight: 3 },
    { base: 'ember-charm', weight: 2 }],
  abyss: [{ base: 'war-sigil', weight: 4 }, { base: 'oath-charm', weight: 2 },
    { base: 'dual-sigil', weight: 3 }, { base: 'ember-charm', weight: 2 }],
};

/** 这一片的兜底档名（`corridor` / `unknown` / 名单外的新区域都落这里） */
export const GEAR_POOL_DEFAULT = 'default';

/** 按位置反推出来的区域 id → 那一片能掉的基表。判据只在这里一次 */
export const poolForZone = (zoneId) => GEAR_POOLS[zoneId] ?? GEAR_POOLS[GEAR_POOL_DEFAULT];

export const dropChance = (kind) => GEAR_DROP.byKind[kind] ?? GEAR_DROP.byKind.none;
export const soulValue = (rarityId) => GEAR_DROP.soulValue[rarityId] ?? 0;

/**
 * 每只世界 Boss 必掉的那一件（W-B5 切片5）。键是 `bossId` —— 名册之外的键由注册表
 * `keyRef` 到 `bosses` 在开机拦住，所以这里不必也不该再去 import 一份花名册（数据只认识
 * 自己的表，谁合法由注册表回答）。
 *
 * 两条规矩写在表的旁边而不是散在判断里：
 * 1. **必掉**：固定件不掷骰。它是表上的承诺，掷骰就是把"这只 Boss 必掉那一件"改成"多半会掉"；
 *    掉落层只在 `kind === 'boss'` 时查这张表，且查不到就照常走池子（副本 Boss 今天没有固定件）。
 * 2. **档位从 rare 起**：Boss 掉一件凡品等于让玩家白跑一趟 —— 这根下限由注册表的
 *    `checkGearBossDrops` 盯着，而不是靠"大家记得别改坏"。
 *
 * 取的基表是各区域池的头一件（fantasy→灰烬、magic→笔痕、space→环纹、void→誓约、abyss→战纹），
 * 于是"这里的 Boss 掉这里的东西"与玩家在那一片打出来的装备对得上。
 */
export const GEAR_BOSS_DROPS = {
  'shadow-warden': { base: 'ash-charm', rarity: 'rare' },
  archmagus: { base: 'quill-sigil', rarity: 'rare' },
  'singularity-herald': { base: 'ring-sigil', rarity: 'epic' },
  'void-chronarch': { base: 'oath-charm', rarity: 'epic' },
  'chaos-overlord': { base: 'war-sigil', rarity: 'epic' },
};

/** 这只 Boss 的固定掉落规格。没登记的（副本 Boss、野生 Boss）返回 `null` —— 与"掉一件空的"不是一回事 */
export const bossDropFor = (bossId) => GEAR_BOSS_DROPS[bossId] ?? null;

/**
 * 按登记规格造那一件。**不掷档位也不掷底座**（两格都写在表上），只掷词缀 —— 同一只 Boss
 * 每次掉的底座与档位一样、词缀各不相同。未登记或表被写坏时返回 `null`：宁可没有固定件，
 * 也不造一个过不了 `isGearInstance` 的坏实例（坏实例进包会连累整包的读档判断）。
 */
export function rollBossGear(rng = Math.random, bossId = null) {
  const spec = bossDropFor(bossId);
  if (!spec) return null;
  const base = BASES[spec.base];
  const rarity = RARITY[spec.rarity];
  if (!base || !rarity) return null;
  // rollBossGear 返回：固定底座与档位，只掷词缀
  return { base: base.id, rarity: rarity.id, affixes: rollAffixes(rng, rarity) };
}

/**
 * 背包容量（W-B5 切片4）。写成**显式一格**而不是"数组多长算多长"：包满时必须有一条说得出来的
 * 路（折成魂并把理由写进提示），否则"新加一条规则忘了管满"的表现就是物品凭空消失，或者永远捡不起来。
 *
 * 为什么 20：六区域 × 十六件基表，一次探索掉三五件，20 格够存一整趟而不必在半路回营火；
 * 这个数没有真人读数支撑，所以它只是一格能拧的表，不是一个写死在判断里的字面量。
 */
export const GEAR_BAG = { capacity: 20 };

/** 包满没有？分岔只在这一处：能装就进包，装不下才折魂（`Game.pickUpGear` 与面板卸下都问它） */
export const bagIsFull = (bag) => !Array.isArray(bag) || bag.length >= GEAR_BAG.capacity;

/** 一件"多重"= 它给的点数总和。判据只定义在这里：别处再造一个"装备战力"就是第二份算式 */
export function gearScore(instance) {
  const mods = gearMods(instance);
  if (!mods) return 0;
  return Object.values(mods).reduce((s, n) => s + n, 0);
}

/**
 * 捡到一件之后的那条分岔：严格更好才换上，其余（含相等）不换。
 *
 * 这一片只回答"要不要往身上套"，**不回答"不套的那件去哪"** —— 去哪是切片4 的包的事：
 * `Game.pickUpGear` 拿到 `dust` 之后先试着塞进背包，塞不下才折成魂（两条路都当场说清楚）。
 * 相等不换：把玩家刚穿的那件拆掉换一枚一样的，只多一条提示，没有收益。
 */
export function pickupChoice(current, incoming) {
  if (!isGearInstance(incoming)) return { action: 'nothing' };
  const slot = baseOf(incoming.base).slot;
  const worn = current?.[slot] ?? null;
  if (worn && gearScore(incoming) <= gearScore(worn)) {
    return { action: 'dust', slot, souls: soulValue(incoming.rarity) };
  }
  return {
    action: 'equip', slot, replaced: worn,
    souls: worn ? soulValue(worn.rarity) : 0,
    score: gearScore(incoming),
  };
}

/** 给人看的那一行字：`稀有·余烬护符（长行 · 固守）`。拼装只有这一处 */
export function gearLabel(instance) {
  const base = baseOf(instance?.base);
  if (!base) return '';
  const rarity = GEAR_RARITY_DISPLAY[instance.rarity];
  const affixes = (instance.affixes ?? []).map((id) => GEAR_NAMES[id] ?? id);
  const name = GEAR_NAMES[base.id] ?? base.id;
  return `${rarity ? `${rarity.label}·` : ''}${name}${affixes.length ? `（${affixes.join(' · ')}）` : ''}`;
}
