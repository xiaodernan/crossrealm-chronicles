/** 存档结构校验 — 版本号为 schema 的唯一权威，迁移链从这里取目标版本 */
import { t } from '../engine/i18n.js';

export const CURRENT_VERSION = 21;

const VERSION = CURRENT_VERSION;

const QUEST_STAT_KEYS = [
  'hits', 'discoveries', 'bossDefeated', 'boss2Defeated', 'boss3Defeated',
  'voidBossDefeated', 'chaosBossDefeated', 'dungeonRerun',
  'spellCasts', 'chargedCasts', 'dungeonsCleared', 'npcTalked', 'chestsOpened',
  // 「抉择」那一格（W-E3 切片18）：它是**账**（已经发生的事）⇒ 必须落盘 ⇒
  // 老档缺它 ⇒ 迁移那一跳补上（不是"缺失就当默认值凑合读"）
  'decisions',
  // 「主线旗标」那一格（W-E3 切片24）：同样是**账**（哪一步走完了）⇒ 必须落盘 ⇒
  // 老档缺它 ⇒ v17 → v18 那一跳按 `questIndex` 重放补上
  'objectiveFlags',
];

export class SaveValidator {
  static validate(data) {
    const issues = [];
    if (!data || typeof data !== 'object') {
      issues.push(t('save_issue_root_not_object'));
      return issues;
    }
    if (data.version !== VERSION) {
      issues.push(t('save_issue_version_fmt', { version: VERSION }));
    }
    if (!data.player || typeof data.player !== 'object') {
      issues.push(t('save_issue_missing_player'));
    } else {
      for (const key of ['x', 'y', 'z', 'hp', 'stamina']) {
        if (!(key in data.player)) issues.push(t('save_issue_player_missing_field_fmt', { key }));
      }
      // v5：镜头轨道角入档，读档不再把朝向重置成初始值
      for (const key of ['yaw', 'pitch']) {
        if (!Number.isFinite(data.player[key])) issues.push(t('save_issue_player_not_finite_fmt', { key }));
      }
    }
    if (!data.quests || typeof data.quests !== 'object') {
      issues.push(t('save_issue_missing_quests'));
    } else {
      if (data.quests.index === undefined) issues.push(t('save_issue_quests_missing_index'));
      // v21（W-E3 切片38）：「走到哪一步」的 **id** 入档。必填 —— 缺了由迁移链补
      // （v20 → v21 按旧表的下标填），读档侧不兜底：兜底会让"没迁移的档"看起来像好档。
      // 通关档没有"当前步" ⇒ 合法值是字符串或 null。
      if (data.quests.currentId === undefined) issues.push(t('save_issue_quests_missing_current_id'));
      else if (data.quests.currentId !== null && typeof data.quests.currentId !== 'string') {
        issues.push(t('save_issue_quests_current_id_not_string'));
      }
      if (!data.quests.stats) issues.push(t('save_issue_quests_missing_stats'));
      else SaveValidator.validateQuestStats(data.quests.stats, issues);
    }
    if (!data.stats || typeof data.stats !== 'object') {
      issues.push(t('save_issue_missing_stats'));
    } else if (!Array.isArray(data.stats.bag)) {
      // v6：背包入档（W-B5 切片4）。必填而不是"缺了当空包" —— 补齐由迁移链负责，
      // 读档侧的 `?? []` 兜底正是本文件开头禁止的"字段缺失就当默认值凑合读"
      issues.push(t('save_issue_bag_not_array'));
    }
    // v7：营火地标的"发现过哪些"入档（B66 —— 读档侧一直在读这个键，而写档侧从来没有写过，
    // 于是那行加载代码是死的，每次读档所有营火都退回"没见过"）。必填，缺由迁移链补，不在读档侧兜底。
    if (!data.restPointEnhancer || typeof data.restPointEnhancer !== 'object') {
      issues.push(t('save_issue_missing_rest_points'));
    } else if (!Array.isArray(data.restPointEnhancer.discovered)) {
      issues.push(t('save_issue_discovered_not_array'));
    } else if (data.restPointEnhancer.discovered.some((id) => typeof id !== 'string')) {
      issues.push(t('save_issue_discovered_non_string'));
    }
    // v5：这两项从"可选 + 读档侧兜底"升级为必填，兜底逻辑随之删除
    if (!data.spells || !Number.isFinite(data.spells.mana)) issues.push(t('save_issue_mana_not_finite'));
    if (!data.settings || typeof data.settings !== 'object') issues.push(t('save_issue_missing_settings'));
    if (data.weaponSkills === undefined) issues.push(t('save_issue_missing_weapon_skills'));
    if (data.fastTravel === undefined) issues.push(t('save_issue_missing_fast_travel'));
    return issues;
  }

  static validateQuestStats(stats, issues) {
    if (!stats || typeof stats !== 'object') {
      issues.push(t('save_issue_quest_stats_not_object'));
      return;
    }
    for (const key of QUEST_STAT_KEYS) {
      if (!(key in stats)) issues.push(t('save_issue_quest_stats_missing_fmt', { key }));
    }
    // v5 移除的字段若仍存在，说明迁移链没有跑过
    if ('skillsUnlocked' in stats) issues.push(t('save_issue_skills_unlocked_removed'));
    if (!('kills' in stats)) issues.push(t('save_issue_quest_stats_missing_kills'));
    else if (typeof stats.kills !== 'object' || stats.kills === null || Array.isArray(stats.kills)) {
      issues.push(t('save_issue_kills_not_object'));
    }
    if (typeof stats.objectiveFlags !== 'object' || stats.objectiveFlags === null
      || Array.isArray(stats.objectiveFlags)) {
      issues.push(t('save_issue_objective_flags_not_object'));
    }
  }

  static isValid(data) {
    return SaveValidator.validate(data).length === 0;
  }

  /** 导入前规范化 — 兼容早期外部工具导出的存档 */
  static normalize(data) {
    if (!data?.quests?.stats) return data;
    const s = data.quests.stats;
    if (typeof s.kills === 'number') s.kills = {};
    if (Array.isArray(s.kills)) s.kills = {};
    if (!s.npcTalked) s.npcTalked = [];
    if (!s.discoveries) s.discoveries = [];
    if (!s.dungeonsCleared) s.dungeonsCleared = [];
    return data;
  }
}
