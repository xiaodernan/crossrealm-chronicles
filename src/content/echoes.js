/**
 * 次元回声数据表（W-B2：消灭 Wave/Extras 叠加）。
 *
 * 合并了 PopCultureHomageRegistry + Wave2/3/4 的所有回声条目。
 * 字段：
 * - id: kebab-case 稳定标识符
 * - franchise: FRANCHISE 常量（来自 franchises.js）
 * - zone: 区域 id（来自 ZoneIdentity.js）
 * - title: 显示标题
 * - desc: 描述文本
 * - trigger: 触发条件（discovery:xxx / echo:xxx）
 */
import { FRANCHISE } from './franchises.js';

export const ECHOES = [
  // ── 魔法学院母题（HP 系）──
  { id: 'echo-wizard-school', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '悬浮咒术学院', desc: '夜空中漂移的塔楼与蜡烛 — 时空法则在此弯曲。', trigger: 'discovery:magic-castle' },
  { id: 'echo-forbidden-wood', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '低语禁林', desc: '树影里不是风，是未签名的咒语在回响。', trigger: 'discovery:magic-forest' },
  { id: 'echo-broom-ring', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '飞天环赛看台', desc: '三根金环悬在半空 — 曾有人骑着扫帚从这里掠过月亮。', trigger: 'echo:broom-ring' },
  { id: 'echo-potion-lab', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '魔药温室', desc: '玻璃穹顶下，曼德拉草在梦里尖叫。', trigger: 'echo:potion-lab' },
  { id: 'echo-sorting-hall', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '分院残厅', desc: '四色横幅已褪色，帽子仍在低语：「去冒险。」', trigger: 'echo:sorting-hall' },

  // ── 星际穿越母题 ──
  { id: 'echo-endurance', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '坚韧号残骸', desc: '船载日志末句：「不要温和地走进那个良夜。」', trigger: 'discovery:space-wreck' },
  { id: 'echo-tesseract', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '五维_tesseract', desc: '无数时间线的画面涌入脑海 — 爱能跨越维度。', trigger: 'discovery:space-tesseract' },
  { id: 'echo-miller', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '米勒沙漏', desc: '这里的一小时，可能是地上的七年。', trigger: 'echo:miller-hourglass' },
  { id: 'echo-murphy', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '墨菲书架', desc: '引力在书页间写字 — 「Stay」的幽灵笔迹。', trigger: 'echo:murphy-shelf' },
  { id: 'echo-docking', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '对接舱旋转', desc: '两艘船必须以相同转速相遇，否则就是金属的葬礼。', trigger: 'echo:docking-spin' },

  // ── 怪奇物语母题（逆相界 / 80 年代小镇）──
  { id: 'echo-upside-rift', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '逆相裂口', desc: '天空像被撕开，红色孢子缓慢飘落 — 另一边的风是冷的。', trigger: 'echo:upside-rift' },
  { id: 'echo-radio-tower', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '旧镇广播塔', desc: '1983 年的电台仍在循环播放 — 你听见的是另一个维度的 SOS。', trigger: 'echo:radio-tower' },
  { id: 'echo-rift-hound', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '裂隙猎犬足迹', desc: '爪印通向没有星星的方向。别在夜里单独追。', trigger: 'echo:rift-hound' },
  { id: 'echo-neon-mall', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '霓虹商场残影', desc: '粉色与青色霓虹在雾中闪烁 — 像从未关门的 80 年代。', trigger: 'echo:neon-mall' },
  { id: 'echo-flip-gravity', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '翻转重力带', desc: '一步踏错，天花板变成地板。Ctrl 翻滚救不了方向感。', trigger: 'discovery:void-rift' },

  // ── 指环王（已有，补回声）──
  { id: 'echo-one-ring', franchise: FRANCHISE.MIDDLE_EARTH, zone: 'fantasy', title: '至尊石环', desc: 'One Realm to bind them all… 戒指已碎，石环仍在。', trigger: 'discovery:fantasy-ring' },

  // ── 枢纽彩蛋墙 ──
  { id: 'echo-poster-wall', franchise: FRANCHISE.CROSSOVER, zone: 'hub', title: '位面海报墙', desc: '六张褪色海报：学院、荒原、逆相、石环、混沌、锚点。', trigger: 'echo:poster-wall' },

  // ── Wave2 ──
  // 魔法学院
  { id: 'echo-nine-platform', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '九分又四分三站台', desc: '砖墙在月台中央裂开 — 只有「相信」的人才能穿过去。', trigger: 'echo:nine-platform' },
  { id: 'echo-patronus-lake', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '护念湖镜', desc: '湖面映出的不是脸，是你最需要的勇气形状。', trigger: 'echo:patronus-lake' },
  { id: 'echo-triwizard', franchise: FRANCHISE.WIZARD, zone: 'magic', title: '三强赛台', desc: '三只高脚杯已空，龙息与迷宫的回声仍在石台打转。', trigger: 'echo:triwizard-cup' },

  // 星际穿越
  { id: 'echo-brand-beacon', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '曼恩假信标', desc: '信标在冰原上闪烁 — 日志说「完美」，脚印说「谎言」。', trigger: 'echo:brand-beacon' },
  { id: 'echo-wormhole', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '虫洞拱门', desc: '光在环中折叠 — 穿过它的人，年龄与记忆不同步。', trigger: 'echo:wormhole-arch' },
  { id: 'echo-love-signal', franchise: FRANCHISE.INTERSTELLAR, zone: 'space', title: '爱即坐标', desc: '五维_tesseract 里，唯一不变的导航星是「不要放手」。', trigger: 'echo:love-signal' },

  // 逆相界
  { id: 'echo-bike-trail', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '夜游单车灯串', desc: '四盏车灯在雾中排成线 — 像有人还在找失踪的朋友。', trigger: 'echo:bike-trail' },
  { id: 'echo-arcade', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '街机厅残影', desc: '吃豆人与恶魔在 CRT 里循环 — 投币口塞满红色孢子。', trigger: 'echo:arcade' },
  { id: 'echo-vecna-clock', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '裂相钟塔', desc: '指针停在 11 点 6 分 — 每次钟声，天花板就远一点。', trigger: 'echo:vecna-clock' },
  { id: 'echo-underground-lab', franchise: FRANCHISE.UPSIDE, zone: 'void', title: '地下实验室残骸', desc: '编号门牌 rusted shut — 门后仍有低频嗡鸣，像未关的实验。', trigger: 'echo:underground-lab' },

  // 跨界
  { id: 'echo-full-resonance', franchise: FRANCHISE.CROSSOVER, zone: 'hub', title: '全位面共鸣', desc: '所有回声同频 — 海报墙六色齐亮，像六个梦在同一句台词里醒来。', trigger: 'echo:full-resonance' },

  // ── Wave3 ──
  // ── 边境往事（西部）──
  { id: 'echo-saloon-mirror', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: '沙龙镜墙', desc: '旋转门后是一面裂镜 — 决斗者的倒影永远比你快半拍。', trigger: 'echo:saloon-mirror' },
  { id: 'echo-duel-noon', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: '正午决斗圈', desc: ' chalk 圈里的太阳不会移动 — 直到有人拔枪，或拔剑。', trigger: 'echo:duel-noon' },
  { id: 'echo-ghost-rails', franchise: FRANCHISE.BORDER, zone: 'fantasy', title: '幽灵铁道', desc: '铁轨通向已消失的镇 — 汽笛声在雾里，火车从不到站。', trigger: 'echo:ghost-rails' },

  // ── 幽冥帮派（黑帮）──
  { id: 'echo-speakeasy', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: '禁酒窖门', desc: '无标记的后巷入口 — 里面谈的不是酒，是界与界的关税。', trigger: 'echo:speakeasy' },
  { id: 'echo-family-shrine', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: '家族圣龛', desc: '三支蜡烛照一面黑镜 — 镜里映出的不是你，是上一任引路人。', trigger: 'echo:family-shrine' },
  { id: 'echo-dock-crates', franchise: FRANCHISE.FAMILY, zone: 'abyss', title: '码头货仓', desc: '木箱上烙着旧家族纹章 — 打开全是位面走私的魂火。', trigger: 'echo:dock-crates' },

  // ── 深空纪元（科幻）──
  { id: 'echo-colony-dome', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: '殖民穹顶', desc: '穹顶内是人工黄昏 — 外面是米勒荒原，里面是另一个天空。', trigger: 'echo:colony-dome' },
  { id: 'echo-ai-core', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: '休眠 AI 核心', desc: '核心低语：「任务未完成。」 — 它指的不是飞船，是你。', trigger: 'echo:ai-core' },
  { id: 'echo-jump-gate', franchise: FRANCHISE.DEEPSPACE, zone: 'space', title: '跃迁门阵列', desc: '三门同相才能跃迁 — 错相的人，会在门里永远循环第一秒。', trigger: 'echo:jump-gate' },

  // ── Wave4 ──
  // 赛博霓虹 → 魔法遗境
  { id: 'echo-neon-alley', franchise: FRANCHISE.CYBER, zone: 'magic', title: '霓虹后巷', desc: '全息广告在雨里短路 — 义眼记录的不一定是真相。', trigger: 'echo:neon-alley' },
  { id: 'echo-chrome-clinic', franchise: FRANCHISE.CYBER, zone: 'magic', title: '铬合金诊所', desc: '魔药与芯片同柜 — 「升级」一词在此有两种读音。', trigger: 'echo:chrome-clinic' },
  { id: 'echo-corp-spire', franchise: FRANCHISE.CYBER, zone: 'magic', title: '巨企尖塔投影', desc: '塔顶循环播放同一句 Slogan — 连魂火都被算进 KPI。', trigger: 'echo:corp-spire' },

  // 武士残响 → 灰白森林
  { id: 'echo-torii-gate', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: '鸟居残门', desc: '朱漆剥落 — 门后不是神域，是未结束的决斗。', trigger: 'echo:torii-gate' },
  { id: 'echo-dojo-ruins', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: '道场废墟', desc: '木桩上的刀痕比树年轮密 — 最后一式没人接得住。', trigger: 'echo:dojo-ruins' },
  { id: 'echo-sakura-blade', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: '樱落刃冢', desc: '落樱盖住断刃 — 风一吹，金属反光像未散的杀气。', trigger: 'echo:sakura-blade' },

  // 旧日低语 → 破碎时线
  { id: 'echo-tentacle-obelisk', franchise: FRANCHISE.COSMIC, zone: 'void', title: '触须方尖碑', desc: '碑面铭文不是文字，是盯着你的角度。', trigger: 'echo:tentacle-obelisk' },
  { id: 'echo-mad-scribe', franchise: FRANCHISE.COSMIC, zone: 'void', title: '疯癫抄写室', desc: '羽毛笔自己写 — 墨水味像海水与铁锈。', trigger: 'echo:mad-scribe' },
  { id: 'echo-spiral-well', franchise: FRANCHISE.COSMIC, zone: 'void', title: '螺旋深井', desc: '井底没有水，只有回声在数数 — 数到你。', trigger: 'echo:spiral-well' },

  // 星港商路 → 米勒荒原
  { id: 'echo-star-cantina', franchise: FRANCHISE.STARPORT, zone: 'space', title: '星港酒肆', desc: '百种方言混成一种笑 — 赏金、走私、跃迁合同在同一张桌。', trigger: 'echo:star-cantina' },
  { id: 'echo-smuggler-dock', franchise: FRANCHISE.STARPORT, zone: 'space', title: '走私码头', desc: '集装箱编号是位面坐标 — 开错箱的人再没回来。', trigger: 'echo:smuggler-dock' },
  { id: 'echo-holo-chart', franchise: FRANCHISE.STARPORT, zone: 'space', title: '全息星图室', desc: '星图每天变 — 领航员说：「航线是谈判出来的。」', trigger: 'echo:holo-chart' },
];
