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
import { bossNameKeyOf, isKnownBossId } from '../content/bossRoster.js';
import { ENEMY_ROSTER } from '../content/enemies.js';
import { SKILL_EFFECT_LABEL_KEYS, skillById } from '../content/skillTrees.js';
import { ZONE_NAMES } from '../content/ZoneIdentity.js';
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
 * 锁因插值里的四族 id → 玩家看见的那个词（W-D2 切片45）。
 *
 * 修前这里把 id 原样插进句子：玩家在升级面板读到的是"需击败 1 次 archmagus (0/1)"
 * / "需使用 30 次 combo (0/30)"，英文界面下连中文玩家都得猜那两个词是什么。
 * 这四支把 id 翻成显示名；**翻不出来原样退回 id** —— 不静默换成别的词，
 * 那样"引用了不存在的东西"就被盖住了（B36 那一族正是这么烂起来的）。
 *
 * 解析源各是一处真源：Boss 问 `bossNameKeyOf`（journal 侧 `weapon_skill_need_boss_fmt`
 * 同一套），区域问 `ZONE_NAMES`，敌人问名册的 `name`（那一列存的就是文案键），
 * 效果问 `SKILL_EFFECT_LABEL_KEYS`。
 *
 * 住在 game 层而不是 content：展开要 `t()`，而 content 不许向上够 engine
 * （`content-boundary` 门禁）—— 所以"键住在 content、展开住在 game"。
 *
 * 另外四族（支线 / 物品 / 成就 / 剧情旗标）今天仍出裸 id：支线与成就唯一引用处的 id
 * 压根不在任何表里（`tests/skill-lock-refs.test.js` ③ 腿钉着那五处死锁），现在做解析器
 * 就是死代码；物品与旗标两族全仓没有 id 宇宙。等死锁接驳时一起补（§9 ADR 留名）。
 */
export const bossLabel = (bossId) => {
  if (!isKnownBossId(bossId)) return bossId;
  return t(bossNameKeyOf(bossId));
};

export const zoneLabel = (zoneId) => {
  const key = ZONE_NAMES[zoneId];
  return key ? t(key) : zoneId;
};

export const enemyLabel = (type) => {
  const key = ENEMY_ROSTER[type]?.name;
  return key ? t(key) : type;
};

export const effectLabel = (effect) => {
  const key = SKILL_EFFECT_LABEL_KEYS[effect];
  return key ? t(key) : effect;
};

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
 * 插值里的 id 由本文件那四支解析器翻成显示名（W-D2 切片45）：Boss / 区域 / 击杀类型 /
 * 效果四族有真源可查 —— 查得到的翻成人话，查不到的原样退回 id。支线 / 物品 / 成就 /
 * 旗标四族今天仍是裸 id（为什么，见 `bossLabel` 上方的说明）。
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
    if (n < count) return t('skill_lock_kills_fmt', { count, type: enemyLabel(type), have: n });
  }
  if (lock.skillUses) {
    const { skill, count } = lock.skillUses;
    const n = q?.stats?.skillUses?.[skill] ?? 0;
    if (n < count) return t('skill_lock_skilluses_fmt', { count, skill: effectLabel(skill), have: n });
  }
  if (lock.bossDefeated) {
    const { bossId, count = 1 } = lock.bossDefeated;
    const defeated = q?.stats?.bossDefeated?.[bossId] ?? 0;
    if (defeated < count) return t('skill_lock_bosskills_fmt', { count, boss: bossLabel(bossId), have: defeated });
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
    if (reached < count) return t('skill_lock_zone_fmt', { count, zone: zoneLabel(zoneId), have: reached });
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
