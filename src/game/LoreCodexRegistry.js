/** 位面秘典 — lore 条目目录 */
export const LORE_CODEX = [
  { id: 'codex-anchor', zone: 'hub', title: '世界之锚', text: '三界交汇处的稳定点。锚火非柴焰，而是位面摩擦的余温。', unlock: 'journal:rest-hub-souls' },
  { id: 'codex-walker', zone: 'hub', title: '位面行者', text: '能穿越灰林、遗境与荒原的缝合者 — 非游客，是修复裂隙的人。', unlock: 'journal:rest-hub-gallery' },
  { id: 'codex-shadow', zone: 'fantasy', title: '影界守护者', text: '灰白森林东侧红圈。两阶段：砸地红圈前翻滚，弹反可致命反击。', unlock: 'journal:rest-fantasy-boss1' },
  { id: 'codex-mage', zone: 'magic', title: '大奥术师萨尔林', text: '紫色法球追踪 — 靠近弹反可打断。二阶段法球加速。', unlock: 'boss:archmagus' },
  { id: 'codex-singularity', zone: 'space', title: '奇点领主', text: '米勒荒原引力井核心。三阶段轨道弹幕 — 保持移动，蓄力破盾。', unlock: 'boss:singularity-herald' },
  { id: 'codex-void', zone: 'void', title: '时线执政官', text: '隐藏 Boss。蓄力法术可打断时停 — 非主线三座之一。', unlock: 'journal:rest-void-hidden' },
  { id: 'codex-chaos', zone: 'abyss', title: '混沌裂隙领主', text: '终焉试炼三阶段。混沌脉冲灼烧近身 — 剑杖切换与技能树拉满。', unlock: 'boss:chaos-overlord' },
  { id: 'codex-execution', zone: 'combat', title: '处决', text: '架势条满后重击触发绕轨慢镜头。{escape} 可跳过演出。', unlock: 'execution' },
  { id: 'codex-finisher', zone: 'combat', title: '连击终结', text: '第三段连击命中锁定目标 — 镜头推近，时间缩放。', unlock: 'finisher' },
  { id: 'codex-rematch', zone: 'hub', title: 'Boss 再战', text: '击败后在信标按 {interact} 可召唤再战。补魂火，不推进主线。', unlock: 'journal:rest-hub-rematch' },
  { id: 'codex-cg', zone: 'hub', title: 'CG 画廊', text: '营火分支、Boss 击破、战斗记忆解锁插画 — {journal} 键 CG 画廊页签。', unlock: 'cg:bonus:world-anchor' },
  { id: 'codex-dungeon', zone: 'dungeon', title: '迷宫叙事', text: '石碑碎片进日志。Ch5 后可重复挑战随机布局地下城。', unlock: 'dungeon-clear' },
];

export const CODEX_ZONE_LABELS = {
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
