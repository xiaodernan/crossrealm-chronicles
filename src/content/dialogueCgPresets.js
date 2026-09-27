/**
 * 营火对话 CG 的预设表 —— 纯数据（W-B1 切片1）。
 *
 * 从 `ui/DialogCGRenderer*.js` 四个文件里搬过来。它们原本是"数据与绘制混住"：
 * 表定义在渲染器旁边，于是 `game/CgGalleryRegistry.js`（要枚举全部 CG 建画廊目录）
 * 只能 `import ... from '../ui/DialogCGRenderer.js'` —— 那是 `chunk-core → chunk-ui`
 * 的一条回边，B37 循环分块的成因之一。
 *
 * 拆分口径：**"有哪些 CG、叫什么、什么场景"是数据**，留在 `ui/` 的是
 * "怎么把它画出来"（`ui/DialogCGRenderer.js` 的 `CG_PAINTERS` 与致敬层的 `POP_CG_PAINTERS`）。
 * 数据进了 `content/` 之后，画廊目录与渲染器读的是同一份，不会再各有一半。
 *
 * 合并顺序：基础表 → `_EXTRA` → `_POP`。三张名单**必须互不相交** ——
 * spread 的同名键是后层静默盖掉前层，界面上只看得到后一张的画面，谁也不知道少了一层。
 * 这条不相交由 `registry.js` 的 `checkDialogueCgPresets` 在开机时逐键核（注册表条目 `restDialogueCg`）。
 *
 * 键是 `<营火 id>:<节点 id>` 的复合串，而 `game/CgGalleryRegistry.js` 直接按每个键建一行画廊目录：
 * 写错的节点名 = 一条玩家永远解锁不了的画廊行，而 `side-cg-half` / 成就 `cg-half` 读的分母就是那张目录。
 */
export const REST_DIALOGUE_CG_BASE = {
  'hub:start': { scene: 'anchor_fire', caption: '三界交汇 · 余温' },
  'hub:origin': { scene: 'anchor_fire', caption: '位面摩擦之火' },
  'hub:quest': { scene: 'quest_scroll', caption: '当前使命' },
  'hub:walker': { scene: 'walker_silhouette', caption: '位面行者' },
  'fantasy:start': { scene: 'forest_camp', caption: '灰白森林营火' },
  'fantasy:deep': { scene: 'forest_map', caption: '遗城与 Boss 环' },
  'fantasy:tip': { scene: 'combat_tutorial', caption: '弹反与终结' },
  'fantasy:boss1': { scene: 'boss_shadow', caption: '影界守护者', mood: 'warn' },
  'magic:start': { scene: 'magic_castle', caption: '魔法遗境倒影' },
  'magic:spell': { scene: 'spell_orbs', caption: '奥术牵制' },
  'magic:boss2': { scene: 'boss_mage', caption: '大奥术师', mood: 'warn' },
  'space:start': { scene: 'space_endurance', caption: 'Endurance 应急火' },
  'space:well': { scene: 'gravity_well', caption: '米勒引力井', mood: 'warn' },
  'space:boss3': { scene: 'boss_singularity', caption: '奇点领主' },
  'void:start': { scene: 'void_time', caption: '折叠时线' },
  'void:stop': { scene: 'time_stop', caption: '时停对策', mood: 'warn' },
  'void:hidden': { scene: 'hidden_boss', caption: '隐藏试炼' },
  'void:exec': { scene: 'execution_art', caption: '处决瞬间' },
  'abyss:start': { scene: 'chaos_border', caption: '混沌边境', mood: 'warn' },
  'abyss:end': { scene: 'final_gate', caption: '终焉试炼' },
  'abyss:boss5': { scene: 'boss_chaos', caption: '裂隙领主', mood: 'warn' },
};

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
  'void:skip': { scene: 'execution_art', caption: '{escape} 跳过' },
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

export const REST_DIALOGUE_CG_POP = {
  'magic:wizard': { scene: 'wizard_school', caption: '咒术学院' },
  'magic:broom': { scene: 'broom_ring', caption: '飞天环赛' },
  'space:interstellar': { scene: 'murphy_shelf', caption: '星际方程' },
  'space:stay': { scene: 'murphy_shelf', caption: 'Stay' },
  'void:upside': { scene: 'upside_down', caption: '逆相界' },
  'void:radio': { scene: 'radio_tower', caption: '旧镇广播' },
  'fantasy:lotr': { scene: 'one_ring', caption: '至尊石环' },
  'hub:echoes': { scene: 'poster_wall', caption: '次元回声' },
  'magic:nine': { scene: 'nine_platform', caption: '九分站台' },
  'magic:patronus': { scene: 'patronus_lake', caption: '护念湖镜' },
  'space:wormhole': { scene: 'wormhole_arch', caption: '虫洞拱门' },
  'void:arcade': { scene: 'arcade_cab', caption: '街机厅' },
  'void:vecna': { scene: 'vecna_clock', caption: '裂相钟塔' },
  'fantasy:western': { scene: 'western_saloon', caption: '边境往事' },
  'fantasy:duel': { scene: 'duel_noon', caption: '正午决斗' },
  'abyss:gangster': { scene: 'noir_speakeasy', caption: '幽冥帮派' },
  'space:scifi': { scene: 'scifi_dome', caption: '深空纪元' },
  'space:jump': { scene: 'jump_gate', caption: '跃迁门' },
  'hub:triad': { scene: 'triad_poster', caption: '三巨头' },
  'magic:cyber': { scene: 'cyber_alley', caption: '赛博霓虹' },
  'fantasy:samurai': { scene: 'samurai_torii', caption: '武士残响' },
  'void:cosmic': { scene: 'cosmic_obelisk', caption: '旧日低语' },
  'space:starport': { scene: 'starport_cantina', caption: '星港商路' },
  'hub:wave4': { scene: 'wave4_grid', caption: 'Wave4 四系' },
};

/** 合并后的全表：基础 + 扩写 + 致敬层。画廊目录与渲染器读的都是这一份 */
export function mergeDialogueCg() {
  return { ...REST_DIALOGUE_CG_BASE, ...REST_DIALOGUE_CG_EXTRA, ...REST_DIALOGUE_CG_POP };
}

export const REST_DIALOGUE_CG = mergeDialogueCg();
