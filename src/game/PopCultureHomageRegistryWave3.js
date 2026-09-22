/**
 * 次元回声 Wave3 — 三巨头母题
 * 边境往事 (Western) → 灰白森林
 * 幽冥帮派 (Gangster) → 混沌边境
 * 深空纪元 (Sci-Fi) → 米勒荒原（与星际穿越并列，偏殖民/跃迁/AI）
 */
export const POP_CULTURE_ECHOES_WAVE3 = [
  // ── 边境往事（西部）──
  { id: 'echo-saloon-mirror', franchise: '边境往事', zone: 'fantasy', title: '沙龙镜墙', desc: '旋转门后是一面裂镜 — 决斗者的倒影永远比你快半拍。', trigger: 'echo:saloon-mirror' },
  { id: 'echo-duel-noon', franchise: '边境往事', zone: 'fantasy', title: '正午决斗圈', desc: ' chalk 圈里的太阳不会移动 — 直到有人拔枪，或拔剑。', trigger: 'echo:duel-noon' },
  { id: 'echo-ghost-rails', franchise: '边境往事', zone: 'fantasy', title: '幽灵铁道', desc: '铁轨通向已消失的镇 — 汽笛声在雾里，火车从不到站。', trigger: 'echo:ghost-rails' },

  // ── 幽冥帮派（黑帮）──
  { id: 'echo-speakeasy', franchise: '幽冥帮派', zone: 'abyss', title: '禁酒窖门', desc: '无标记的后巷入口 — 里面谈的不是酒，是界与界的关税。', trigger: 'echo:speakeasy' },
  { id: 'echo-family-shrine', franchise: '幽冥帮派', zone: 'abyss', title: '家族圣龛', desc: '三支蜡烛照一面黑镜 — 镜里映出的不是你，是上一任引路人。', trigger: 'echo:family-shrine' },
  { id: 'echo-dock-crates', franchise: '幽冥帮派', zone: 'abyss', title: '码头货仓', desc: '木箱上烙着旧家族纹章 — 打开全是位面走私的魂火。', trigger: 'echo:dock-crates' },

  // ── 深空纪元（科幻）──
  { id: 'echo-colony-dome', franchise: '深空纪元', zone: 'space', title: '殖民穹顶', desc: '穹顶内是人工黄昏 — 外面是米勒荒原，里面是另一个天空。', trigger: 'echo:colony-dome' },
  { id: 'echo-ai-core', franchise: '深空纪元', zone: 'space', title: '休眠 AI 核心', desc: '核心低语：「任务未完成。」 — 它指的不是飞船，是你。', trigger: 'echo:ai-core' },
  { id: 'echo-jump-gate', franchise: '深空纪元', zone: 'space', title: '跃迁门阵列', desc: '三门同相才能跃迁 — 错相的人，会在门里永远循环第一秒。', trigger: 'echo:jump-gate' },
];

/** 三巨头 franchise 元数据 — 供 UI / 帮助手册引用 */
export const TRIAD_FRANCHISE_META = {
  '边境往事': { zone: 'fantasy', tone: 'western', icon: '🤠' },
  '幽冥帮派': { zone: 'abyss', tone: 'noir', icon: '🎩' },
  '深空纪元': { zone: 'space', tone: 'scifi', icon: '🚀' },
};
