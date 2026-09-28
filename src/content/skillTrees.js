/**
 * 技能树 —— 三条流派（剑 / 杖 / 位面）的节点表（W-B6 切片1）。
 *
 * ## 为什么要从 `game/WeaponSkillTree.js` 搬到这里
 *
 * 修前这张表住在 `game/` 里，与"解锁状态、技能点、存档"混在一个 155 行的类里。
 * 它有两处代价：① 它是**跨块共享的纯数据**（营火面板、日志流派页签、存档、成就都要读），
 * 住在 `game/` 意味着任何想读它的层都得反向依赖游戏装配点 —— 这正是 W-B1 切片1
 * 把 `content/` 立起来的那条规矩（本层不依赖任何其他层，由 `content-boundary` 门禁钉住）；
 * ② 它**没有任何一张表回答"一共有哪些节点"**，于是"8 个节点"这个数只能靠人肉数。
 *
 * ## 三张名单合成两张
 *
 * 修前有**两份关于同一批节点的名单**：`WEAPON_SKILLS`（可加点节点）与
 * `STORY_SKILL_META`（其中 8 格的章节 / Boss / 碎片门槛 + 故事文本）。两份都要写对
 * id，写错一份的症状是"这一格在面板上永远点不动"而另一份毫无察觉 —— 与 B36/B45
 * 同族（稳定身份靠人肉复制）。这一片把门槛与故事文本**并回节点行自己身上**，
 * 于是"这个节点是什么"只有一个答案：
 *
 * - `lock` —— 可加点节点的**前置剧情条件**（不满足就不能加点，`canUnlock` 返回 false）；
 * - `grant` —— 叙事技（**条件满足时白送**，`cost` 必须为 0，面板上不可购买）；
 * - `lore` —— 解锁时写进日志的那段故事（可加点节点也可以有）。
 *
 * 两者互斥：一个节点不可能既是"达标白送"又是"达标才能买"。这条由注册表不变式钉住。
 *
 * `lock` 的每一格都必须是**真的有人读的判断**：修前 `m-mana` 那一格写的是 `quest: 'spells'`，
 * 而 ① `getStoryLockReason` 从来不读 `quest`；② `'spells'` 不是任何一张任务表里的 id
 * （真正的那条叫 `learn-spell`）—— 于是那一格是"看起来有门、其实敞着"。现在换成
 * `spellCasts: 8`（读 `stats.spellCasts`，就是 `learn-spell` 那条任务数的那本账）。
 *
 * ## `effect` 的键为什么要有白名单
 *
 * `Enemy` 那一族踩过的坑是 B68：招式表里写着 `telegraph.ring`，全仓没有一行代码读它，
 * 于是"这张表看起来配置了预警圈"而屏幕上并不存在。技能树是同一种形状：
 * `effect` 是**自由形状的对象**，写一个没人读的键（拼错 `melee` 成 `meele`）不会报错，
 * 只会安静地什么都不做。所以键必须取自 `SKILL_EFFECT_CONSUMERS` —— 那份表逐格写明
 * "谁在什么地方读它"，而 `tests/skill-trees.test.js` 会去源码里核对这句话仍然成立。
 */

/**
 * 分支清单 —— "一共几条流派"的唯一真源。
 *
 * 面板、日志页签、状态机的遍历全部读它，所以加第四条流派时不需要再改四个 `['sword','staff']`。
 */
export const SKILL_BRANCHES = [
  { id: 'sword', name: '⚔ 位面长剑', note: '近战流派：连段、弹反、终结技与位面斩' },
  { id: 'staff', name: '✦ 奥术法杖', note: '法术流派：法术强度、蓄力、法力与化身' },
  { id: 'realm', name: '⟡ 位面共鸣', note: '跨界流派：位面斩、法力与化身的交汇' },
];

/**
 * `effect` 的允许键 → **谁在读它**。
 *
 * 这份表是"技能点花出去真的会改变什么"的唯一答案。加一格键 = 先把消费者写出来，
 * 否则加的就是 B68 那一族（表里有、没人读）。`tests/skill-trees.test.js` 会逐格
 * 去源码里找 `sk.<键>` 或 `skillMods?.<键>`，找不到就红。
 *
 * 单位约定：除 `mana`（点）与 `transform`（秒）是加法外，其余都是**乘区加成的小数**
 * （0.08 = +8%）。
 */
export const SKILL_EFFECT_CONSUMERS = {
  melee: { where: 'core/Game.js → combat.weaponMeleeMult', note: '近战伤害乘区' },
  combo: { where: 'combat/CombatController.js getComboMultiplier()', note: '连击倍率步进' },
  riposte: { where: 'combat/CombatController.js 处决那一击', note: '处决 / 弹反伤害' },
  finisher: { where: 'combat/CombatController.js 终结技半径', note: '终结技范围' },
  skill: { where: 'combat/CombatController.js 位面斩（R 战技）', note: '战技伤害' },
  spell: { where: 'core/Game.js → spells.weaponSpellMult', note: '法术伤害乘区' },
  charge: { where: 'combat/SpellSystem.js 蓄力那一发', note: '蓄力伤害' },
  mana: { where: 'combat/SpellSystem.js maxMana', note: '法力上限（加法，点）' },
  transform: { where: 'combat/SpellSystem.js transformTimer', note: '大圣化身时长（加法，秒）' },
};

/** `effect` 的允许键（由上面那份表推导 —— 不许再手抄第二份） */
export const SKILL_EFFECT_KEYS = Object.keys(SKILL_EFFECT_CONSUMERS);

/**
 * 三条流派 × 12 个可加点节点 + 叙事技。
 *
 * 形制：每个分支是一棵**有向无环图**（`reqs` 是前置 id 数组，空数组 = 根节点）。
 * 每棵树里都有一条"两条支脉汇合"的节点（`s-annihilate` / `m-singularity` /
 * `r-breakthrough`）与一个收尾的顶点（`s-apotheosis` / `m-omniscience` / `r-convergence`）——
 * 于是"先点哪条脉"是真的取舍，而不是一条直线点到底。
 *
 * `cost` 是技能点价码；叙事技（带 `grant`）的 `cost` 必须是 0。
 */
export const SKILL_TREES = {
  sword: [
    { id: 's-blade', name: '锋刃精通 I', cost: 1, desc: '近战伤害 +8%', effect: { melee: 0.08 },
      reqs: [], lock: { chapter: 1 }, lore: '位面流浪者：「先学会挥剑，再学会在位面间挥剑。」' },
    { id: 's-edge', name: '锋刃精通 II', cost: 2, desc: '近战伤害 +12%', effect: { melee: 0.12 }, reqs: ['s-blade'] },
    { id: 's-combo', name: '连击延伸', cost: 2, desc: '连击倍率 +15%', effect: { combo: 0.15 },
      reqs: ['s-blade'], lock: { chapter: 2, loreFragments: 1 }, lore: '精灵斥候：「连击不是炫耀 — 是压制。」' },
    { id: 's-riposte', name: '处决强化', cost: 2, desc: '处决伤害 +40%', effect: { riposte: 0.4 },
      reqs: ['s-blade'], lock: { chapter: 2, boss: 'shadow-warden' },
      lore: '影界守护者倒下后，你理解了弹反的 rhythm。' },
    { id: 's-tempo', name: '疾风步调', cost: 2, desc: '连击倍率 +10% · 近战 +5%', effect: { combo: 0.1, melee: 0.05 }, reqs: ['s-combo'] },
    { id: 's-finisher', name: '修罗终结', cost: 3, desc: '终结技范围 +50%', effect: { finisher: 0.5 },
      reqs: ['s-combo'], lock: { chapter: 3, boss: 'archmagus' },
      lore: '大奥术师的最后一击被你学去 — 用于终结连段。' },
    { id: 's-guardbreak', name: '破架势', cost: 3, desc: '处决伤害 +25% · 终结技范围 +20%', effect: { riposte: 0.25, finisher: 0.2 }, reqs: ['s-riposte'] },
    { id: 's-reach', name: '长驱直入', cost: 3, desc: '近战 +8% · 战技伤害 +10%', effect: { melee: 0.08, skill: 0.1 }, reqs: ['s-tempo'] },
    { id: 's-realmedge', name: '位面锋芒', cost: 3, desc: '战技伤害 +25%', effect: { skill: 0.25 }, reqs: ['s-reach'] },
    { id: 's-echo', name: '回响斩', cost: 3, desc: '战技伤害 +20% · 连击 +10%', effect: { skill: 0.2, combo: 0.1 }, reqs: ['s-realmedge'] },
    { id: 's-annihilate', name: '湮灭', cost: 4, desc: '终结技范围 +30% · 处决伤害 +30%', effect: { finisher: 0.3, riposte: 0.3 }, reqs: ['s-guardbreak', 's-finisher'] },
    { id: 's-apotheosis', name: '剑之极意', cost: 5, desc: '近战 +15% · 连击 +15% · 终结 +25% · 处决 +20% · 战技 +20%',
      effect: { melee: 0.15, combo: 0.15, finisher: 0.25, riposte: 0.2, skill: 0.2 }, reqs: ['s-annihilate', 's-echo'] },
  ],
  staff: [
    { id: 'm-arcane', name: '奥术共鸣 I', cost: 1, desc: '法术伤害 +10%', effect: { spell: 0.1 },
      reqs: [], lock: { chapter: 2 }, lore: '霍格沃兹遗境的残页记载：奥术共鸣始于营火。' },
    { id: 'm-focus', name: '凝神', cost: 1, desc: '法力上限 +15', effect: { mana: 15 }, reqs: [] },
    { id: 'm-charge', name: '蓄力增幅', cost: 2, desc: '蓄力伤害 +20%', effect: { charge: 0.2 },
      reqs: ['m-arcane'], lock: { chapter: 3, loreFragments: 2 }, lore: '蓄力是信任 — 信任法力会回应你。' },
    { id: 'm-mana', name: '法力泉涌', cost: 2, desc: '法力上限 +25', effect: { mana: 25 },
      reqs: ['m-arcane'], lock: { chapter: 2, spellCasts: 8 }, lore: '宇航员回声：「时间在这里是圆的 — 法力也是。」' },
    { id: 'm-pierce', name: '穿透', cost: 2, desc: '法术伤害 +12%', effect: { spell: 0.12 }, reqs: ['m-arcane'] },
    { id: 'm-echo', name: '奥术回响', cost: 2, desc: '蓄力伤害 +15% · 法术 +5%', effect: { charge: 0.15, spell: 0.05 }, reqs: ['m-charge'] },
    { id: 'm-transform', name: '化身延长', cost: 3, desc: '大圣化身 +4 秒', effect: { transform: 4 },
      reqs: ['m-charge'], lock: { chapter: 4, boss: 'singularity-herald' }, lore: '奇点领主的化身术式被你逆向解析。' },
    { id: 'm-arcane2', name: '奥术共鸣 II', cost: 3, desc: '法术伤害 +15%', effect: { spell: 0.15 }, reqs: ['m-pierce'] },
    { id: 'm-font', name: '法力之泉', cost: 3, desc: '法力上限 +30', effect: { mana: 30 }, reqs: ['m-mana'] },
    { id: 'm-singularity', name: '奇点', cost: 4, desc: '法术 +20% · 蓄力 +15%', effect: { spell: 0.2, charge: 0.15 }, reqs: ['m-arcane2', 'm-echo'] },
    { id: 'm-avatar', name: '大圣化身·极', cost: 4, desc: '大圣化身 +6 秒 · 法力 +20', effect: { transform: 6, mana: 20 }, reqs: ['m-transform', 'm-font'] },
    { id: 'm-omniscience', name: '全知', cost: 5, desc: '法术 +20% · 蓄力 +20% · 法力 +30 · 化身 +4 秒',
      effect: { spell: 0.2, charge: 0.2, mana: 30, transform: 4 }, reqs: ['m-singularity', 'm-avatar'] },
  ],
  realm: [
    { id: 'r-attune', name: '位面共鸣 I', cost: 1, desc: '法术伤害 +8%', effect: { spell: 0.08 }, reqs: [] },
    { id: 'r-veil', name: '帷幕亲和', cost: 1, desc: '法力上限 +15', effect: { mana: 15 }, reqs: [] },
    { id: 'r-resonance', name: '共鸣增幅', cost: 2, desc: '法术伤害 +10%', effect: { spell: 0.1 }, reqs: ['r-attune'] },
    { id: 'r-wellspring', name: '泉涌', cost: 2, desc: '法力上限 +25', effect: { mana: 25 }, reqs: ['r-veil'] },
    { id: 'r-overcharge', name: '过载蓄能', cost: 2, desc: '蓄力伤害 +20%', effect: { charge: 0.2 }, reqs: ['r-attune'] },
    { id: 'r-riftstep', name: '裂隙步', cost: 2, desc: '战技伤害 +15%', effect: { skill: 0.15 }, reqs: ['r-attune'] },
    { id: 'r-harmonics', name: '谐律', cost: 3, desc: '法术 +12% · 蓄力 +10%', effect: { spell: 0.12, charge: 0.1 }, reqs: ['r-resonance'] },
    { id: 'r-deepwell', name: '深泉', cost: 3, desc: '法力上限 +35', effect: { mana: 35 }, reqs: ['r-wellspring'] },
    { id: 'r-ascendant', name: '化身延展', cost: 3, desc: '大圣化身 +4 秒', effect: { transform: 4 }, reqs: ['r-overcharge'] },
    { id: 'r-breakthrough', name: '破界', cost: 4, desc: '战技 +30% · 法术 +15%', effect: { skill: 0.3, spell: 0.15 }, reqs: ['r-harmonics', 'r-riftstep'] },
    { id: 'r-timeless', name: '无时', cost: 4, desc: '大圣化身 +6 秒 · 法力 +20', effect: { transform: 6, mana: 20 }, reqs: ['r-ascendant', 'r-deepwell'] },
    { id: 'r-convergence', name: '位面交汇', cost: 5, desc: '法术 +15% · 战技 +15% · 蓄力 +15% · 法力 +20 · 化身 +4 秒',
      effect: { spell: 0.15, skill: 0.15, charge: 0.15, mana: 20, transform: 4 }, reqs: ['r-breakthrough', 'r-timeless'] },
  ],
};

/**
 * 叙事技（`grant`）—— 不需要技能点，达成条件的那一刻白送。
 *
 * 与可加点节点同住一张表：它们的区别是 `grant` 而不是住在另一个文件里 ——
 * 修前它们在 `game/StoryWeaponSkills.js` 的 `NARRATIVE_SKILLS`，与 `STORY_SKILL_META`
 * 一起构成"关于同一批 id 的第二份名单"。现在两者都在这里，`WeaponSkillTree` 只读一张表。
 */
const GRANTS = [
  { id: 's-shadow-cut', branch: 'sword', name: '影界斩', desc: '近战 +5% · 弹反窗口 +5%',
    effect: { melee: 0.05, riposte: 0.05 }, grant: { boss: 'shadow-warden' },
    lore: '影界守护者的剑意残留于你的位面长剑。' },
  { id: 's-realm-slash', branch: 'sword', name: '位面斩强化', desc: '战技伤害 +25%',
    effect: { skill: 0.25 }, grant: { boss: 'singularity-herald' },
    lore: '奇点领主坍缩瞬间，你截获了引力刃的一缕余波。' },
  { id: 's-infinity', branch: 'sword', name: '无尽行者', desc: '终结技伤害 +30% · 连击 +10%',
    effect: { finisher: 0.3, combo: 0.1 }, grant: { boss: 'chaos-overlord' },
    lore: '斩裂混沌后，你的剑成为位面行者的证明。' },
  { id: 'm-arcane-ii', branch: 'staff', name: '奥术共鸣·遗篇', desc: '法术伤害 +8%',
    effect: { spell: 0.08 }, grant: { boss: 'archmagus' },
    lore: '大奥术师萨尔林的法杖碎片融入你的杖芯。' },
  { id: 'm-chrono', branch: 'staff', name: '时线洞察', desc: '蓄力伤害 +15%',
    effect: { charge: 0.15 }, grant: { boss: 'void-chronarch' },
    lore: '时线执政官的钟表停在你胜利的那一刻。' },
  { id: 'm-chaos-weave', branch: 'staff', name: '混沌织法', desc: '法力 +20 · 法术 +5%',
    effect: { mana: 20, spell: 0.05 }, grant: { chapter: 5 },
    lore: 'Ch5 边境的混沌低语被你驯服为法力。' },
  { id: 'r-veilstep', branch: 'realm', name: '帷幕穿行', desc: '战技伤害 +20%',
    effect: { skill: 0.2 }, grant: { boss: 'void-chronarch' },
    lore: '时线在你脚下折了一折 —— 你学会了踩着它走。' },
  { id: 'r-chaos-attune', branch: 'realm', name: '混沌同调', desc: '法术 +10% · 法力 +15',
    effect: { spell: 0.1, mana: 15 }, grant: { boss: 'chaos-overlord' },
    lore: '混沌裂隙的嗡鸣第一次听起来像一段和声。' },
  { id: 'r-first-crossing', branch: 'realm', name: '初渡', desc: '法术 +5% · 战技 +10%',
    effect: { spell: 0.05, skill: 0.1 }, grant: { chapter: 3 },
    lore: '跨过第三道门之后，位面不再拒绝你。' },
];

for (const g of GRANTS) SKILL_TREES[g.branch].push({ ...g, cost: 0, reqs: [] });

/** 分支 id 列表（顺序与 `SKILL_BRANCHES` 一致） */
export const SKILL_BRANCH_IDS = SKILL_BRANCHES.map((b) => b.id);

/** 可加点节点（不含叙事技）—— "技能树有多少节点"这个问题问的是这一批 */
export function purchasableNodes() {
  return SKILL_BRANCH_IDS.flatMap((b) => SKILL_TREES[b].filter((n) => !n.grant));
}

/** 某个分支的全部节点（含叙事技） */
export function nodesOf(branch) {
  return SKILL_TREES[branch] ?? [];
}

/** 按 id 找节点，返回 `{ ...节点, branch }`；找不到返回 `null` */
export function skillById(id) {
  for (const branch of SKILL_BRANCH_IDS) {
    const node = SKILL_TREES[branch].find((n) => n.id === id);
    if (node) return { ...node, branch };
  }
  return null;
}

/** 这个节点是不是叙事技（白送、不可购买） */
export const isGrant = (node) => !!node?.grant;
