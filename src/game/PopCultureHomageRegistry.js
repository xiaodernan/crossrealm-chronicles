/**
 * 次元回声目录 — 致敬母题用「合法区分」命名
 * 参考：独立游戏常用 parody / trope / 双轨命名（展示副标题 + 任务中性名）
 */
import { POP_CULTURE_ECHOES_WAVE2 } from './PopCultureHomageRegistryWave2.js';
import { POP_CULTURE_ECHOES_WAVE3 } from './PopCultureHomageRegistryWave3.js';
import { POP_CULTURE_ECHOES_WAVE4 } from './PopCultureHomageRegistryWave4.js';

export const POP_CULTURE_ECHOES = [
  // ── 魔法学院母题（HP 系）──
  { id: 'echo-wizard-school', franchise: '魔法学院', zone: 'magic', title: '悬浮咒术学院', desc: '夜空中漂移的塔楼与蜡烛 — 时空法则在此弯曲。', trigger: 'discovery:magic-castle' },
  { id: 'echo-forbidden-wood', franchise: '魔法学院', zone: 'magic', title: '低语禁林', desc: '树影里不是风，是未签名的咒语在回响。', trigger: 'discovery:magic-forest' },
  { id: 'echo-broom-ring', franchise: '魔法学院', zone: 'magic', title: '飞天环赛看台', desc: '三根金环悬在半空 — 曾有人骑着扫帚从这里掠过月亮。', trigger: 'echo:broom-ring' },
  { id: 'echo-potion-lab', franchise: '魔法学院', zone: 'magic', title: '魔药温室', desc: '玻璃穹顶下，曼德拉草在梦里尖叫。', trigger: 'echo:potion-lab' },
  { id: 'echo-sorting-hall', franchise: '魔法学院', zone: 'magic', title: '分院残厅', desc: '四色横幅已褪色，帽子仍在低语：「去冒险。」', trigger: 'echo:sorting-hall' },

  // ── 星际穿越母题 ──
  { id: 'echo-endurance', franchise: '星际穿越', zone: 'space', title: '坚韧号残骸', desc: '船载日志末句：「不要温和地走进那个良夜。」', trigger: 'discovery:space-wreck' },
  { id: 'echo-tesseract', franchise: '星际穿越', zone: 'space', title: '五维_tesseract', desc: '无数时间线的画面涌入脑海 — 爱能跨越维度。', trigger: 'discovery:space-tesseract' },
  { id: 'echo-miller', franchise: '星际穿越', zone: 'space', title: '米勒沙漏', desc: '这里的一小时，可能是地上的七年。', trigger: 'echo:miller-hourglass' },
  { id: 'echo-murphy', franchise: '星际穿越', zone: 'space', title: '墨菲书架', desc: '引力在书页间写字 — 「Stay」的幽灵笔迹。', trigger: 'echo:murphy-shelf' },
  { id: 'echo-docking', franchise: '星际穿越', zone: 'space', title: '对接舱旋转', desc: '两艘船必须以相同转速相遇，否则就是金属的葬礼。', trigger: 'echo:docking-spin' },

  // ── 怪奇物语母题（逆相界 / 80 年代小镇）──
  { id: 'echo-upside-rift', franchise: '逆相界', zone: 'void', title: '逆相裂口', desc: '天空像被撕开，红色孢子缓慢飘落 — 另一边的风是冷的。', trigger: 'echo:upside-rift' },
  { id: 'echo-radio-tower', franchise: '逆相界', zone: 'void', title: '旧镇广播塔', desc: '1983 年的电台仍在循环播放 — 你听见的是另一个维度的 SOS。', trigger: 'echo:radio-tower' },
  { id: 'echo-rift-hound', franchise: '逆相界', zone: 'void', title: '裂隙猎犬足迹', desc: '爪印通向没有星星的方向。别在夜里单独追。', trigger: 'echo:rift-hound' },
  { id: 'echo-neon-mall', franchise: '逆相界', zone: 'void', title: '霓虹商场残影', desc: '粉色与青色霓虹在雾中闪烁 — 像从未关门的 80 年代。', trigger: 'echo:neon-mall' },
  { id: 'echo-flip-gravity', franchise: '逆相界', zone: 'void', title: '翻转重力带', desc: '一步踏错，天花板变成地板。Ctrl 翻滚救不了方向感。', trigger: 'discovery:void-rift' },

  // ── 指环王（已有，补回声）──
  { id: 'echo-one-ring', franchise: '中洲', zone: 'fantasy', title: '至尊石环', desc: 'One Realm to bind them all… 戒指已碎，石环仍在。', trigger: 'discovery:fantasy-ring' },

  // ── 枢纽彩蛋墙 ──
  { id: 'echo-poster-wall', franchise: '跨界', zone: 'hub', title: '位面海报墙', desc: '六张褪色海报：学院、荒原、逆相、石环、混沌、锚点。', trigger: 'echo:poster-wall' },
  ...POP_CULTURE_ECHOES_WAVE2,
  ...POP_CULTURE_ECHOES_WAVE3,
  ...POP_CULTURE_ECHOES_WAVE4,
];

export const FRANCHISE_LABELS = {
  all: '全部',
  '魔法学院': '魔法学院',
  '星际穿越': '星际穿越',
  '逆相界': '逆相界',
  '中洲': '中洲',
  '边境往事': '边境往事',
  '幽冥帮派': '幽冥帮派',
  '深空纪元': '深空纪元',
  '赛博霓虹': '赛博霓虹',
  '武士残响': '武士残响',
  '旧日低语': '旧日低语',
  '星港商路': '星港商路',
  '跨界': '跨界',
};
