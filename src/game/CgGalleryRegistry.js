import { REST_DIALOGUE_CG } from '../content/dialogueCgPresets.js';
import { REST_NPC_DEFS } from '../content/restNpcDefs.js';
import { CG_GALLERY_BONUS_EXTRA } from '../content/cgGallery.js';

/** CG 画廊完整目录 — 营火对话 + Boss 击破 + 隐藏 */
export const CG_GALLERY_CATALOG = [
  ...Object.entries(REST_DIALOGUE_CG).map(([key, preset]) => {
    const [restId, nodeId] = key.split(':');
    const npc = REST_NPC_DEFS[restId];
    return {
      id: key,
      restId,
      nodeId,
      scene: preset.scene,
      caption: preset.caption,
      mood: preset.mood ?? 'calm',
      zone: restId,
      // 名与色只从 `REST_NPC_DEFS` 取（W-B4 切片1）：改前这里是 `?? restId` / `?? '#c9a962'` ——
      // 认不出这一座时把 id 当说话人名摆进画廊，再给它戴上锚火看守的金边。
      // `registry.js` 的 `checkDialogueCgPresets` 保证每个键的营火既有一棵树也有定义，
      // 而 `restDialogues` 那一条保证定义里的 name/accent 是非空串，所以这里不需要兜底。
      speaker: npc?.name,
      accent: npc?.accent,
      unlock: 'dialogue',
      sort: 10,
    };
  }),
  { id: 'bonus:finisher', scene: 'execution_art', caption: '连击终结', mood: 'calm', zone: 'combat', speaker: '战斗记忆', accent: '#ffcc44', unlock: 'finisher', sort: 100 },
  { id: 'bonus:riposte', scene: 'combat_tutorial', caption: '致命反击', mood: 'warn', zone: 'combat', speaker: '战斗记忆', accent: '#ff8866', unlock: 'riposte', sort: 101 },
  { id: 'bonus:execution', scene: 'execution_art', caption: '处决瞬间', mood: 'warn', zone: 'combat', speaker: '战斗记忆', accent: '#ff4422', unlock: 'execution', sort: 102 },
  { id: 'bonus:boss-shadow', scene: 'boss_shadow', caption: '影界守护者击破', mood: 'warn', zone: 'fantasy', speaker: 'Boss', accent: '#aa2222', unlock: 'boss:shadow-warden', sort: 110 },
  { id: 'bonus:boss-mage', scene: 'boss_mage', caption: '大奥术师击破', mood: 'warn', zone: 'magic', speaker: 'Boss', accent: '#8844ff', unlock: 'boss:archmagus', sort: 111 },
  { id: 'bonus:boss-singularity', scene: 'boss_singularity', caption: '奇点领主击破', mood: 'warn', zone: 'space', speaker: 'Boss', accent: '#4488ff', unlock: 'boss:singularity-herald', sort: 112 },
  { id: 'bonus:boss-void', scene: 'hidden_boss', caption: '时线执政官击破', mood: 'warn', zone: 'void', speaker: 'Boss', accent: '#c9a962', unlock: 'boss:void-chronarch', sort: 113 },
  { id: 'bonus:boss-chaos', scene: 'boss_chaos', caption: '混沌领主击破', mood: 'warn', zone: 'abyss', speaker: 'Boss', accent: '#ff2244', unlock: 'boss:chaos-overlord', sort: 114 },
  { id: 'bonus:dungeon-clear', scene: 'forest_map', caption: '迷宫清空', mood: 'calm', zone: 'dungeon', speaker: '探索', accent: '#889977', unlock: 'dungeon-clear', sort: 120 },
  { id: 'bonus:world-anchor', scene: 'anchor_fire', caption: '世界之锚觉醒', mood: 'calm', zone: 'hub', speaker: '序章', accent: '#c9a962', unlock: 'quest:ch1', sort: 1 },
  ...CG_GALLERY_BONUS_EXTRA,
];

export const CG_ZONE_LABELS = {
  all: '全部',
  hub: '枢纽',
  fantasy: '森林',
  magic: '魔法',
  space: '荒原',
  void: '时线',
  abyss: '混沌',
  combat: '战斗',
  dungeon: '地牢',
};
