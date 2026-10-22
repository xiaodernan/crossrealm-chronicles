/** 存档结构校验 — 版本号为 schema 的唯一权威，迁移链从这里取目标版本 */
export const CURRENT_VERSION = 14;

const VERSION = CURRENT_VERSION;

const QUEST_STAT_KEYS = [
  'hits', 'discoveries', 'bossDefeated', 'boss2Defeated', 'boss3Defeated',
  'voidBossDefeated', 'chaosBossDefeated', 'dungeonRerun',
  'spellCasts', 'chargedCasts', 'dungeonsCleared', 'npcTalked', 'chestsOpened',
];

export class SaveValidator {
  static validate(data) {
    const issues = [];
    if (!data || typeof data !== 'object') {
      issues.push('根节点必须是 JSON 对象');
      return issues;
    }
    if (data.version !== VERSION) {
      issues.push(`version 必须为 ${VERSION}`);
    }
    if (!data.player || typeof data.player !== 'object') {
      issues.push('缺少 player 对象');
    } else {
      for (const key of ['x', 'y', 'z', 'hp', 'stamina']) {
        if (!(key in data.player)) issues.push(`player 缺少字段: ${key}`);
      }
      // v5：镜头轨道角入档，读档不再把朝向重置成初始值
      for (const key of ['yaw', 'pitch']) {
        if (!Number.isFinite(data.player[key])) issues.push(`player.${key} 必须是有限数`);
      }
    }
    if (!data.quests || typeof data.quests !== 'object') {
      issues.push('缺少 quests 对象');
    } else {
      if (data.quests.index === undefined) issues.push('quests 缺少 index');
      if (!data.quests.stats) issues.push('quests 缺少 stats');
      else SaveValidator.validateQuestStats(data.quests.stats, issues);
    }
    if (!data.stats || typeof data.stats !== 'object') {
      issues.push('缺少 stats 对象');
    } else if (!Array.isArray(data.stats.bag)) {
      // v6：背包入档（W-B5 切片4）。必填而不是"缺了当空包" —— 补齐由迁移链负责，
      // 读档侧的 `?? []` 兜底正是本文件开头禁止的"字段缺失就当默认值凑合读"
      issues.push('stats.bag 必须是数组');
    }
    // v7：营火地标的"发现过哪些"入档（B66 —— 读档侧一直在读这个键，而写档侧从来没有写过，
    // 于是那行加载代码是死的，每次读档所有营火都退回"没见过"）。必填，缺由迁移链补，不在读档侧兜底。
    if (!data.restPointEnhancer || typeof data.restPointEnhancer !== 'object') {
      issues.push('缺少 restPointEnhancer 对象');
    } else if (!Array.isArray(data.restPointEnhancer.discovered)) {
      issues.push('restPointEnhancer.discovered 必须是数组');
    } else if (data.restPointEnhancer.discovered.some((id) => typeof id !== 'string')) {
      issues.push('restPointEnhancer.discovered 里出现了非字符串的 id');
    }
    // v5：这两项从"可选 + 读档侧兜底"升级为必填，兜底逻辑随之删除
    if (!data.spells || !Number.isFinite(data.spells.mana)) issues.push('spells.mana 必须是有限数');
    if (!data.settings || typeof data.settings !== 'object') issues.push('缺少 settings 对象');
    if (data.weaponSkills === undefined) issues.push('缺少 weaponSkills（双端 parity）');
    if (data.fastTravel === undefined) issues.push('缺少 fastTravel');
    return issues;
  }

  static validateQuestStats(stats, issues) {
    if (!stats || typeof stats !== 'object') {
      issues.push('quests.stats 必须是对象');
      return;
    }
    for (const key of QUEST_STAT_KEYS) {
      if (!(key in stats)) issues.push(`quests.stats 缺少: ${key}`);
    }
    // v5 移除的字段若仍存在，说明迁移链没有跑过
    if ('skillsUnlocked' in stats) issues.push('quests.stats.skillsUnlocked 已在 v5 移除（派生值）');
    if (!('kills' in stats)) issues.push('quests.stats 缺少 kills');
    else if (typeof stats.kills !== 'object' || stats.kills === null || Array.isArray(stats.kills)) {
      issues.push('quests.stats.kills 必须是对象（非数字/数组）');
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
