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
 */
export function getStoryLockReason(game, skillId) {
  const lock = skillById(skillId)?.lock;
  if (!lock || !game) return null;
  const q = game.quests;
  if (lock.chapter && (q?.chapter ?? 1) < lock.chapter) return `需 Chapter ${lock.chapter}`;
  if (lock.loreFragments) {
    const fr = game.storyJournal?.getCounts?.().fragment ?? 0;
    if (fr < lock.loreFragments) return `需 ${lock.loreFragments} 条叙事碎片 (${fr}/${lock.loreFragments})`;
  }
if (lock.spellCasts) {
    const n = q?.stats?.spellCasts ?? 0;
    if (n < lock.spellCasts) return `需施放法术 ${lock.spellCasts} 次 (${n}/${lock.spellCasts})`;
  }
  if (lock.kills) {
    const { type, count } = lock.kills;
    const n = q?.stats?.kills?.[type] ?? 0;
    if (n < count) return `需击败 ${count} 只 ${type} (${n}/${count})`;
  }
  if (lock.skillUses) {
    const { skill, count } = lock.skillUses;
    const n = q?.stats?.skillUses?.[skill] ?? 0;
    if (n < count) return `需使用 ${count} 次 ${skill} (${n}/${count})`;
  }
  if (lock.bossDefeated) {
    const { bossId, count = 1 } = lock.bossDefeated;
    const defeated = q?.stats?.bossDefeated?.[bossId] ?? 0;
    if (defeated < count) return `需击败 ${count} 次 ${bossId} (${defeated}/${count})`;
  }
  if (lock.questComplete) {
    const { questId, count = 1 } = lock.questComplete;
    const completed = q?.stats?.questsCompleted?.[questId] ?? 0;
    if (completed < count) return `需完成 ${count} 次支线 ${questId} (${completed}/${count})`;
  }
  if (lock.itemCollected) {
    const { itemId, count = 1 } = lock.itemCollected;
    const collected = q?.stats?.itemsCollected?.[itemId] ?? 0;
    if (collected < count) return `需收集 ${count} 个 ${itemId} (${collected}/${count})`;
  }
  if (lock.achievementUnlocked) {
    const { achievementId, count = 1 } = lock.achievementUnlocked;
    const unlocked = q?.stats?.achievementsUnlocked?.[achievementId] ?? 0;
    if (unlocked < count) return `需解锁 ${count} 次成就 ${achievementId} (${unlocked}/${count})`;
  }
  if (lock.zoneReached) {
    const { zoneId, count = 1 } = lock.zoneReached;
    const reached = q?.stats?.zonesReached?.[zoneId] ?? 0;
    if (reached < count) return `需到达 ${count} 次区域 ${zoneId} (${reached}/${count})`;
  }
  if (lock.storyFlag) {
    const { flagId, count = 1 } = lock.storyFlag;
    const flagged = q?.stats?.storyFlags?.[flagId] ?? 0;
    if (flagged < count) return `需触发 ${count} 次剧情 ${flagId} (${flagged}/${count})`;
  }
  if (lock.level) {
    const lvl = q?.stats?.level ?? 1;
    if (lvl < lock.level) return `需 Lv.${lock.level} (当前 Lv.${lvl})`;
  }
  if (lock.boss && !bossDefeated(game, lock.boss)) return '需击败对应 Boss';
  return null;
}
