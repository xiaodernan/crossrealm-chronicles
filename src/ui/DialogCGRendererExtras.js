/** 营火对话 CG 扩写 preset */
import { REST_DIALOGUE_CG_POP } from './DialogCGRendererPopCulture.js';

export const REST_DIALOGUE_CG_EXTRA = {
  'hub:gallery': { scene: 'quest_scroll', caption: 'CG 画廊指引' },
  'hub:style': { scene: 'combat_tutorial', caption: '战斗风格' },
  'hub:rematch': { scene: 'boss_shadow', caption: 'Boss 再战' },
  'fantasy:wisp': { scene: 'forest_camp', caption: '魂火萤' },
  'fantasy:journal': { scene: 'forest_map', caption: '日志纪事' },
  'magic:cg': { scene: 'boss_mage', caption: '奥术 CG' },
  'magic:codex': { scene: 'spell_orbs', caption: '秘典之门' },
  'space:photo': { scene: 'space_endurance', caption: '荒原留影' },
  'space:rematch': { scene: 'boss_singularity', caption: '奇点再战' },
  'void:skip': { scene: 'execution_art', caption: 'Esc 跳过' },
  'void:memory': { scene: 'void_time', caption: '营火记忆' },
  'abyss:achieve': { scene: 'final_gate', caption: '成就墙' },
  'abyss:legend': { scene: 'boss_chaos', caption: '终局仪式', mood: 'warn' },
  'hub:dungeon': { scene: 'forest_map', caption: '地下城纪事' },
  'hub:side': { scene: 'quest_scroll', caption: '支线委托' },
  'fantasy:streak': { scene: 'combat_tutorial', caption: '连杀魂火' },
  'magic:skills': { scene: 'spell_orbs', caption: '流派技能' },
  'void:death': { scene: 'void_time', caption: '重生提示' },
  'abyss:credits': { scene: 'final_gate', caption: '通关字幕' },
};

export function mergeDialogueCg(base) {
  return { ...base, ...REST_DIALOGUE_CG_EXTRA, ...REST_DIALOGUE_CG_POP };
}
