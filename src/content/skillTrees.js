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

import { STRINGS_ZH } from './strings.zh.js';
import { STRINGS_EN } from './strings.en.js';

/**
 * 分支清单 —— "一共几条流派"的唯一真源。
 *
 * 面板、日志页签、状态机的遍历全部读它，所以加第四条流派时不需要再改四个 `['sword','staff']`。
 */
/**
 * 流派清单：`name` / `note` 存的是**文案键**（W-D2 切片16o），不是文案本身。
 * 键名 `skill_branch_<id>_name` / `_note`。
 */
export const SKILL_BRANCHES = [
  { id: 'sword', name: 'skill_branch_sword_name', note: 'skill_branch_sword_note' },
  { id: 'staff', name: 'skill_branch_staff_name', note: 'skill_branch_staff_note' },
  { id: 'realm', name: 'skill_branch_realm_name', note: 'skill_branch_realm_note' },
];

/** 流派显示名 / 说明（按语言展开） */
export function skillBranchText(branch, lang = 'zh') {
  const t = lang === 'en' ? STRINGS_EN : STRINGS_ZH;
  return {
    name: t[branch.name] ?? branch.id,
    note: t[branch.note] ?? '',
  };
}

/**
 * `effect` 的允许键 → **谁在读它**。
 *
 * 这份表是"技能点花出去真的会改变什么"的唯一答案。加一格键 = 先把消费者写出来，
 * 否则加的就是 B68 那一族（表里有、没人读）。`tests/skill-trees.test.js` 会逐格
 * 去源码里找 `sk.<键>` 或 `skillMods?.<键>`，找不到就红。
 *
 * `where` 的**主文件 = 读 `sk.<键>` 的那个文件**（要么它直接用，要么它经 `→ 下游字段`
 * 追到真正落地处）。门禁不光查"`sk.<键>` 在 src 某处出现"，还查**它就在 `where` 写的那个
 * 文件里** —— 因为门禁的失败信息会把 `where` 念给开发者听（"白名单上写着：<键> → <where>"），
 * 主文件若与实际读取处对不上，那句提示就会把人带去错文件排查。
 *
 * 单位约定：除 `mana`（点）与 `transform`（秒）是加法外，其余都是**乘区加成的小数**
 * （0.08 = +8%）。
 *
 * 数值曲线设计（切片5）：
 * - Cost 1 基准值 = 1.0x
 * - Cost 2 = 1.6x
 * - Cost 3 = 2.4x
 * - Cost 4 = 3.5x
 * - Cost 5 = 5.5x (顶点)
 * 每个 stat 类型有独立基准，避免跨类型比较。
 */
export const SKILL_EFFECT_CONSUMERS = {
  melee: { where: 'core/Game.js → combat.weaponMeleeMult', note: '近战伤害乘区', base: 0.06 },
  combo: { where: 'combat/CombatController.js getComboMultiplier()', note: '连击倍率步进', base: 0.10 },
  riposte: { where: 'combat/CombatController.js 处决那一击', note: '处决 / 弹反伤害', base: 0.25 },
  finisher: { where: 'combat/CombatController.js 终结技半径', note: '终结技范围', base: 0.30 },
  skill: { where: 'combat/CombatController.js 位面斩（R 战技）', note: '战技伤害', base: 0.15 },
  spell: { where: 'core/Game.js → spells.weaponSpellMult', note: '法术伤害乘区', base: 0.07 },
  charge: { where: 'core/Game.js → spells.chargeBonus', note: '蓄力伤害', base: 0.14 },
  mana: { where: 'core/Game.js → spells.bonusMana', note: '法力上限（加法，点）', base: 12 },
  transform: { where: 'core/Game.js → spells.transformBonus', note: '大圣化身时长（加法，秒）', base: 3 },
};

/** `effect` 的允许键（由上面那份表推导 —— 不许再手抄第二份） */
export const SKILL_EFFECT_KEYS = Object.keys(SKILL_EFFECT_CONSUMERS);

/**
 * `effect` → 显示名的**文案键**（W-D2 切片45）。
 *
 * 锁因里 effect 是当名词用的（"需使用 30 次 连击 (0/30)"）—— 那一格必须是玩家认识的词，
 * 不是代码里的 `combo`。这张表就是"哪种效果 → 那句话住哪一格"：
 * 五格（近战 / 连击 / 处决与弹反 / 终结技 / 蓄力）全表没有同文旧键，新开 `skill_effect_*`；
 * 四格（战技 / 法术 / 法力 / 化身）在 HUD 与键位表里已有同文键，按"同文不建第二键"
 * **复用**那些键，不新起住址（`tests/skill-lock-i18n.test.js` ⑦ 腿双向钉死）。
 *
 * 键集合必须与 `SKILL_EFFECT_KEYS` 逐一对齐：加一种效果就得给它一句人话，
 * 漏一个的症状就是玩家在锁因里看见裸 id —— 本片修的就是这个。
 */
export const SKILL_EFFECT_LABEL_KEYS = {
  melee: 'skill_effect_melee',
  combo: 'skill_effect_combo',
  riposte: 'skill_effect_riposte',
  finisher: 'skill_effect_finisher',
  skill: 'kb_label_skill',
  spell: 'hud_ctrl_spell',
  charge: 'skill_effect_charge',
  mana: 'hud_mana',
  transform: 'hud_spell_4',
};

/** cost 曲线倍率（切片5：数值曲线论证）
 * 1->1.0, 2->1.6, 3->2.4, 4->3.5, 5->5.5
 */
const COST_MULT = [0, 1.0, 1.6, 2.4, 3.5, 5.5];

/** 根据 cost 与 stat 类型算出乘区加成（切片5：数值曲线论证） */
export function curveValue(stat, cost) {
  const c = SKILL_EFFECT_CONSUMERS[stat];
  if (!c) return 0;
  const base = c.base;
  const val = base * (COST_MULT[cost] ?? 1.0);
  return isAdditiveStat(stat) ? Math.round(val) : Math.round(val * 100) / 100;
}

/** 判断是否为加法型 stat（mana/transform）。曾 `export` 但全仓零 import —— 收成模块内私有 */
function isAdditiveStat(stat) {
  return stat === 'mana' || stat === 'transform';
}

/**
 * 三条流派 × 12 个可加点节点 + 叙事技。
 *
 * 形制：每个分支是一棵**有向无环图**（`reqs` 是前置 id 数组，空数组 = 根节点）。
 * 每棵树里都有一条"两条支脉汇合"的节点（`s-annihilate` / `m-singularity` /
 * `r-breakthrough`）与一个收尾的顶点（`s-apotheosis` / `m-omniscience` / `r-convergence`）——
 * 于是"先点哪条脉"是真的取舍，而不是一条直线点到底。
 *
 * `cost` 是技能点价码；叙事技（带 `grant`）的 `cost` 必须是 0。
 *
 * 数值曲线（切片5）：可加点节点（`cost ≥ 1`）的 effect 值**手工按 `curveValue` 的增长
 * 比率取值** —— 单属性节点与 `curveValue(stat, cost)` 逐值吻合，多属性节点是折价组合
 * （每项 ≤ 同 cost 的单属性曲线值）。`curveValue` 不进运行时路径（节点是硬编码数据），
 * 它是曲线的**参考实现**，由 `tests/skill-trees.test.js` 拿来核对"没有节点越过曲线"。
 * 叙事技（`cost: 0`）是免费剧情奖励，不归曲线管。
 */
export const SKILL_TREES = {
  sword: [
    { id: 's-blade', name: 'skill_s_blade_name', cost: 1, desc: 'skill_s_blade_desc', effect: { melee: 0.06 },
      reqs: [], lock: { chapter: 1 }, lore: 'skill_s_blade_lore' },
    { id: 's-edge', name: 'skill_s_edge_name', cost: 2, desc: 'skill_s_edge_desc', effect: { melee: 0.10 }, reqs: ['s-blade'] },
    { id: 's-combo', name: 'skill_s_combo_name', cost: 2, desc: 'skill_s_combo_desc', effect: { combo: 0.16 },
      reqs: ['s-blade'], lock: { chapter: 2, loreFragments: 1, kills: { type: 'normal', count: 20 } }, lore: 'skill_s_combo_lore' },
    { id: 's-riposte', name: 'skill_s_riposte_name', cost: 2, desc: 'skill_s_riposte_desc', effect: { riposte: 0.40 },
      reqs: ['s-blade'], lock: { chapter: 2, boss: 'shadow-warden' },
      lore: 'skill_s_riposte_lore' },
    { id: 's-tempo', name: 'skill_s_tempo_name', cost: 2, desc: 'skill_s_tempo_desc', effect: { combo: 0.10, melee: 0.06 }, reqs: ['s-combo'], lock: { skillUses: { skill: 'combo', count: 30 } }, lore: 'skill_s_tempo_lore' },
    { id: 's-finisher', name: 'skill_s_finisher_name', cost: 3, desc: 'skill_s_finisher_desc', effect: { finisher: 0.72 },
      reqs: ['s-combo'], lock: { chapter: 3, boss: 'archmagus' },
      lore: 'skill_s_finisher_lore' },
    { id: 's-guardbreak', name: 'skill_s_guardbreak_name', cost: 3, desc: 'skill_s_guardbreak_desc', effect: { riposte: 0.60, finisher: 0.36 }, reqs: ['s-riposte'] },
    { id: 's-reach', name: 'skill_s_reach_name', cost: 3, desc: 'skill_s_reach_desc', effect: { melee: 0.14, skill: 0.17 }, reqs: ['s-tempo'] },
    { id: 's-realmedge', name: 'skill_s_realmedge_name', cost: 3, desc: 'skill_s_realmedge_desc', effect: { skill: 0.36 }, reqs: ['s-reach'], lock: { bossDefeated: { bossId: 'archmagus', count: 1 } }, lore: 'skill_s_realmedge_lore' },
    { id: 's-echo', name: 'skill_s_echo_name', cost: 3, desc: 'skill_s_echo_desc', effect: { skill: 0.36, combo: 0.24 }, reqs: ['s-realmedge'] },
    { id: 's-champion', name: 'skill_s_champion_name', cost: 2, desc: 'skill_s_champion_desc', effect: { melee: 0.08, riposte: 0.15 }, reqs: ['s-echo'], lock: { achievementUnlocked: { achievementId: 'champion-of-hub', count: 1 } }, lore: 'skill_s_champion_lore' },
    { id: 's-annihilate', name: 'skill_s_annihilate_name', cost: 4, desc: 'skill_s_annihilate_desc', effect: { finisher: 1.05, riposte: 0.88 }, reqs: ['s-guardbreak', 's-finisher'] },
    { id: 's-apotheosis', name: 'skill_s_apotheosis_name', cost: 5, desc: 'skill_s_apotheosis_desc',
      effect: { melee: 0.33, combo: 0.55, finisher: 1.65, riposte: 1.38, skill: 0.83 }, reqs: ['s-annihilate', 's-echo'], lock: { level: 12 } },
  ],
staff: [
    { id: 'm-arcane', name: 'skill_m_arcane_name', cost: 1, desc: 'skill_m_arcane_desc', effect: { spell: 0.07 },
      reqs: [], lock: { chapter: 2 }, lore: 'skill_m_arcane_lore' },
    { id: 'm-focus', name: 'skill_m_focus_name', cost: 1, desc: 'skill_m_focus_desc', effect: { mana: 12 }, reqs: [] },
    { id: 'm-charge', name: 'skill_m_charge_name', cost: 2, desc: 'skill_m_charge_desc', effect: { charge: 0.22 },
      reqs: ['m-arcane'], lock: { chapter: 3, loreFragments: 2 }, lore: 'skill_m_charge_lore' },
    { id: 'm-mana', name: 'skill_m_mana_name', cost: 2, desc: 'skill_m_mana_desc', effect: { mana: 19 },
      reqs: ['m-arcane'], lock: { chapter: 2, spellCasts: 8 }, lore: 'skill_m_mana_lore' },
    { id: 'm-pierce', name: 'skill_m_pierce_name', cost: 2, desc: 'skill_m_pierce_desc', effect: { spell: 0.11 }, reqs: ['m-arcane'], lock: { kills: { type: 'elite', count: 5 } }, lore: 'skill_m_pierce_lore' },
    { id: 'm-echo', name: 'skill_m_echo_name', cost: 2, desc: 'skill_m_echo_desc', effect: { charge: 0.22, spell: 0.11 }, reqs: ['m-charge'] },
    { id: 'm-transform', name: 'skill_m_transform_name', cost: 3, desc: 'skill_m_transform_desc', effect: { transform: 7 },
      reqs: ['m-charge'], lock: { chapter: 4, boss: 'singularity-herald' }, lore: 'skill_m_transform_lore' },
    { id: 'm-arcane2', name: 'skill_m_arcane2_name', cost: 3, desc: 'skill_m_arcane2_desc', effect: { spell: 0.17 }, reqs: ['m-pierce'] },
    { id: 'm-font', name: 'skill_m_font_name', cost: 3, desc: 'skill_m_font_desc', effect: { mana: 29 }, reqs: ['m-mana'] },
    { id: 'm-wanderer', name: 'skill_m_wanderer_name', cost: 2, desc: 'skill_m_wanderer_desc', effect: { spell: 0.08, mana: 10 }, reqs: ['m-arcane2'], lock: { zoneReached: { zoneId: 'void', count: 1 } }, lore: 'skill_m_wanderer_lore' },
    { id: 'm-singularity', name: 'skill_m_singularity_name', cost: 4, desc: 'skill_m_singularity_desc', effect: { spell: 0.25, charge: 0.49 }, reqs: ['m-arcane2', 'm-echo'] },
    { id: 'm-avatar', name: 'skill_m_avatar_name', cost: 4, desc: 'skill_m_avatar_desc', effect: { transform: 11, mana: 42 }, reqs: ['m-transform', 'm-font'] },
    { id: 'm-omniscience', name: 'skill_m_omniscience_name', cost: 5, desc: 'skill_m_omniscience_desc',
      effect: { spell: 0.39, charge: 0.77, mana: 66, transform: 17 }, reqs: ['m-singularity', 'm-avatar'], lock: { level: 12 } },
  ],
realm: [
    { id: 'r-attune', name: 'skill_r_attune_name', cost: 1, desc: 'skill_r_attune_desc', effect: { spell: 0.07 }, reqs: [] },
    { id: 'r-veil', name: 'skill_r_veil_name', cost: 1, desc: 'skill_r_veil_desc', effect: { mana: 12 }, reqs: [] },
    { id: 'r-resonance', name: 'skill_r_resonance_name', cost: 2, desc: 'skill_r_resonance_desc', effect: { spell: 0.11 }, reqs: ['r-attune'] },
    { id: 'r-wellspring', name: 'skill_r_wellspring_name', cost: 2, desc: 'skill_r_wellspring_desc', effect: { mana: 19 }, reqs: ['r-veil'] },
    { id: 'r-overcharge', name: 'skill_r_overcharge_name', cost: 2, desc: 'skill_r_overcharge_desc', effect: { charge: 0.22 }, reqs: ['r-attune'] },
    { id: 'r-riftstep', name: 'skill_r_riftstep_name', cost: 2, desc: 'skill_r_riftstep_desc', effect: { skill: 0.24 }, reqs: ['r-attune'] },
    { id: 'r-harmonics', name: 'skill_r_harmonics_name', cost: 3, desc: 'skill_r_harmonics_desc', effect: { spell: 0.17, charge: 0.34 }, reqs: ['r-resonance'], lock: { skillUses: { skill: 'charge', count: 20 } }, lore: 'skill_r_harmonics_lore' },
    { id: 'r-quest-master', name: 'skill_r_quest_master_name', cost: 2, desc: 'skill_r_quest_master_desc', effect: { spell: 0.08, mana: 10 }, reqs: ['r-resonance'], lock: { questComplete: { questId: 'side-lost-scholar', count: 1 } }, lore: 'skill_r_quest_master_lore' },
    { id: 'r-deepwell', name: 'skill_r_deepwell_name', cost: 3, desc: 'skill_r_deepwell_desc', effect: { mana: 29 }, reqs: ['r-wellspring'] },
    { id: 'r-ascendant', name: 'skill_r_ascendant_name', cost: 3, desc: 'skill_r_ascendant_desc', effect: { transform: 7 }, reqs: ['r-overcharge'] },
    { id: 'r-breakthrough', name: 'skill_r_breakthrough_name', cost: 4, desc: 'skill_r_breakthrough_desc', effect: { skill: 0.53, spell: 0.25 }, reqs: ['r-harmonics', 'r-riftstep'] },
    { id: 'r-relic-hunter', name: 'skill_r_relic_hunter_name', cost: 3, desc: 'skill_r_relic_hunter_desc', effect: { mana: 15, charge: 0.1 }, reqs: ['r-harmonics'], lock: { itemCollected: { itemId: 'void-resonance-shard', count: 3 } }, lore: 'skill_r_relic_hunter_lore' },
    { id: 'r-archivist', name: 'skill_r_archivist_name', cost: 2, desc: 'skill_r_archivist_desc', effect: { spell: 0.08, charge: 0.1 }, reqs: ['r-harmonics'], lock: { storyFlag: { flagId: 'void-chronicle-read', count: 1 } }, lore: 'skill_r_archivist_lore' },
    { id: 'r-timeless', name: 'skill_r_timeless_name', cost: 4, desc: 'skill_r_timeless_desc', effect: { transform: 11, mana: 42 }, reqs: ['r-ascendant', 'r-deepwell'] },
    { id: 'r-convergence', name: 'skill_r_convergence_name', cost: 5, desc: 'skill_r_convergence_desc',
      effect: { spell: 0.39, skill: 0.83, charge: 0.77, mana: 66, transform: 17 }, reqs: ['r-breakthrough', 'r-timeless'], lock: { level: 12 } },
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
  { id: 's-shadow-cut', branch: 'sword', name: 'skill_s_shadow_cut_name', desc: 'skill_s_shadow_cut_desc',
    effect: { melee: 0.05, riposte: 0.05 }, grant: { boss: 'shadow-warden' },
    lore: 'skill_s_shadow_cut_lore' },
  { id: 's-realm-slash', branch: 'sword', name: 'skill_s_realm_slash_name', desc: 'skill_s_realm_slash_desc',
    effect: { skill: 0.25 }, grant: { boss: 'singularity-herald' },
    lore: 'skill_s_realm_slash_lore' },
  { id: 's-infinity', branch: 'sword', name: 'skill_s_infinity_name', desc: 'skill_s_infinity_desc',
    effect: { finisher: 0.3, combo: 0.1 }, grant: { boss: 'chaos-overlord' },
    lore: 'skill_s_infinity_lore' },
  { id: 'm-arcane-ii', branch: 'staff', name: 'skill_m_arcane_ii_name', desc: 'skill_m_arcane_ii_desc',
    effect: { spell: 0.08 }, grant: { boss: 'archmagus' },
    lore: 'skill_m_arcane_ii_lore' },
  { id: 'm-chrono', branch: 'staff', name: 'skill_m_chrono_name', desc: 'skill_m_chrono_desc',
    effect: { charge: 0.15 }, grant: { boss: 'void-chronarch' },
    lore: 'skill_m_chrono_lore' },
  { id: 'm-chaos-weave', branch: 'staff', name: 'skill_m_chaos_weave_name', desc: 'skill_m_chaos_weave_desc',
    effect: { mana: 20, spell: 0.05 }, grant: { chapter: 5 },
    lore: 'skill_m_chaos_weave_lore' },
  { id: 'r-veilstep', branch: 'realm', name: 'skill_r_veilstep_name', desc: 'skill_r_veilstep_desc',
    effect: { skill: 0.2 }, grant: { boss: 'void-chronarch' },
    lore: 'skill_r_veilstep_lore' },
  { id: 'r-chaos-attune', branch: 'realm', name: 'skill_r_chaos_attune_name', desc: 'skill_r_chaos_attune_desc',
    effect: { spell: 0.1, mana: 15 }, grant: { boss: 'chaos-overlord' },
    lore: 'skill_r_chaos_attune_lore' },
  { id: 'r-first-crossing', branch: 'realm', name: 'skill_r_first_crossing_name', desc: 'skill_r_first_crossing_desc',
    effect: { spell: 0.05, skill: 0.1 }, grant: { chapter: 3 },
    lore: 'skill_r_first_crossing_lore' },
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
