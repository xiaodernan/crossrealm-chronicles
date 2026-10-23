/**
 * 技能树的剧情门槛 —— "这一格现在能不能动"的唯一判定（W-B6 切片1）。
 *
 * ## 修前这里住着第二份名单
 *
 * 这个文件原本有三样东西：`STORY_SKILL_META`（8 格的章节 / Boss / 碎片门槛 + 故事文本）、
 * `NARRATIVE_SKILLS`（叙事技），以及 `getStoryLockReason`。前两样与
 * `game/WeaponSkillTree.js` 的 `WEAPON_SKILLS` 构成"关于同一批 id 的两份名单"：
 * 两份都得把同一个 id 写对，写错一份的症状是"这一格永远点不动 / 永远白送不了"，
 * 而另一份毫无察觉 —— 与 B36（中文显示名判定）、B45（POI id 回退）同族。
 * 数据已并进 `content/skillTrees.js` 的节点行（`lock` / `grant` / `lore`），这里只留判定。
 *
 * ## 顺带收掉的一张表
 *
 * `bossId → 统计账本里那一格` 这张映射，修前在本文件与 `WeaponSkillTree._bossDefeated`
 * 里各有一份（另有 `world/BossRematchDirector.js` 与 `ui/QuestAssistant.js` 两个抄本，
 * 共 4 份），而唯一真源是 `content/objectives.js` 的 `BOSS_STAT_KEYS`。现在一律读真源。
 */
import { BOSS_STAT_KEYS } from '../content/objectives.js';
import { skillById } from '../content/skillTrees.js';
import { t } from '../engine/i18n.js';

/**
 * 这只 Boss 打过了吗。格子名问 `BOSS_STAT_KEYS`（未登记的怪 Boss 一律当作没打过 ——
 * 与 `isKnownBossId` 对副本 Boss 放行的方向相反，因为这里问的是"账本上那一格写了吗"）。
 */
export function bossDefeated(game, bossId) {
  const key = BOSS_STAT_KEYS[bossId];
  if (!key) return false;
  return !!game?.quests?.stats?.[key];
}

/**
 * 这一格现在为什么不能加点（`null` = 没有东西拦着）。
 *
 * 规则**全部**来自节点行自己的 `lock` —— 这里不再自带任何一张门槛表。
 * 每一格都必须真的有人读：修前 `m-mana` 那一格写的是 `quest: 'spells'`，而这里从来不读
 * `quest`，且 `'spells'` 也不是任何一张任务表里的 id（那条任务叫 `learn-spell`）——
 * 于是那一格是"看起来有门、其实敞着"。现在换成 `spellCasts`（读 `stats.spellCasts`，
 * 正是 `learn-spell` 数的那本账）。
 * 返回值全部走双表（W-D2 切片43）：每一句是一条 `skill_lock_*_fmt` 模板，
 * `t()` 按当前语言展开；章节与"击败 Boss"两条**复用**营火升级面板既有的两枚键（同文不建第二键）。
 * 中文逐字节未动 —— 既有按中文匹配的用例原样绿。插值里的 id（type / skill / bossId /
 * questId / itemId / achievementId / zoneId / flagId）仍是裸 id：那是"显示名解析"
 * 另一条线（journal 侧的 `weapon_skill_need_boss_fmt` 已开先例），不在本片范围。
 */
export function getStoryLockReason(game, skillId) {
  const lock = skillById(skillId)?.lock;
  if (!lock || !game) return null;
  const q = game.quests;
  if (lock.chapter && (q?.chapter ?? 1) < lock.chapter) return t('upgrade_skill_lock_chapter_fmt', { chapter: lock.chapter });
  if (lock.loreFragments) {
    const fr = game.storyJournal?.getCounts?.().fragment ?? 0;
    if (fr < lock.loreFragments) return t('skill_lock_fragments_fmt', { need: lock.loreFragments, have: fr });
  }
  if (lock.spellCasts) {
    const n = q?.stats?.spellCasts ?? 0;
    if (n < lock.spellCasts) return t('skill_lock_spellcasts_fmt', { need: lock.spellCasts, have: n });
  }
  if (lock.kills) {
    const { type, count } = lock.kills;
    const n = q?.stats?.kills?.[type] ?? 0;
    if (n < count) return t('skill_lock_kills_fmt', { count, type, have: n });
  }
  if (lock.skillUses) {
    const { skill, count } = lock.skillUses;
    const n = q?.stats?.skillUses?.[skill] ?? 0;
    if (n < count) return t('skill_lock_skilluses_fmt', { count, skill, have: n });
  }
  if (lock.bossDefeated) {
    const { bossId, count = 1 } = lock.bossDefeated;
    const defeated = q?.stats?.bossDefeated?.[bossId] ?? 0;
    if (defeated < count) return t('skill_lock_bosskills_fmt', { count, boss: bossId, have: defeated });
  }
  if (lock.questComplete) {
    const { questId, count = 1 } = lock.questComplete;
    const completed = q?.stats?.questsCompleted?.[questId] ?? 0;
    if (completed < count) return t('skill_lock_quest_fmt', { count, quest: questId, have: completed });
  }
  if (lock.itemCollected) {
    const { itemId, count = 1 } = lock.itemCollected;
    const collected = q?.stats?.itemsCollected?.[itemId] ?? 0;
    if (collected < count) return t('skill_lock_item_fmt', { count, item: itemId, have: collected });
  }
  if (lock.achievementUnlocked) {
    const { achievementId, count = 1 } = lock.achievementUnlocked;
    const unlocked = q?.stats?.achievementsUnlocked?.[achievementId] ?? 0;
    if (unlocked < count) return t('skill_lock_achievement_fmt', { count, achievement: achievementId, have: unlocked });
  }
  if (lock.zoneReached) {
    const { zoneId, count = 1 } = lock.zoneReached;
    const reached = q?.stats?.zonesReached?.[zoneId] ?? 0;
    if (reached < count) return t('skill_lock_zone_fmt', { count, zone: zoneId, have: reached });
  }
  if (lock.storyFlag) {
    const { flagId, count = 1 } = lock.storyFlag;
    const flagged = q?.stats?.storyFlags?.[flagId] ?? 0;
    if (flagged < count) return t('skill_lock_flag_fmt', { count, flag: flagId, have: flagged });
  }
  if (lock.level) {
    const lvl = q?.stats?.level ?? 1;
    if (lvl < lock.level) return t('skill_lock_level_fmt', { need: lock.level, have: lvl });
  }
  if (lock.boss && !bossDefeated(game, lock.boss)) return t('upgrade_skill_lock_boss');
  return null;
}
