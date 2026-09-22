/**
 * 次元回声 Wave4 — 四系扩写
 * 赛博霓虹 → 魔法遗境 | 武士残响 → 灰白森林
 * 旧日低语 → 破碎时线 | 星港商路 → 米勒荒原
 */
import { FRANCHISE } from '../content/franchises.js';
export const POP_CULTURE_ECHOES_WAVE4 = [
  { id: 'echo-neon-alley', franchise: FRANCHISE.CYBER, zone: 'magic', title: '霓虹后巷', desc: '全息广告在雨里短路 — 义眼记录的不一定是真相。', trigger: 'echo:neon-alley' },
  { id: 'echo-chrome-clinic', franchise: FRANCHISE.CYBER, zone: 'magic', title: '铬合金诊所', desc: '魔药与芯片同柜 — 「升级」一词在此有两种读音。', trigger: 'echo:chrome-clinic' },
  { id: 'echo-corp-spire', franchise: FRANCHISE.CYBER, zone: 'magic', title: '巨企尖塔投影', desc: '塔顶循环播放同一句 Slogan — 连魂火都被算进 KPI。', trigger: 'echo:corp-spire' },
  { id: 'echo-torii-gate', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: '鸟居残门', desc: '朱漆剥落 — 门后不是神域，是未结束的决斗。', trigger: 'echo:torii-gate' },
  { id: 'echo-dojo-ruins', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: '道场废墟', desc: '木桩上的刀痕比树年轮密 — 最后一式没人接得住。', trigger: 'echo:dojo-ruins' },
  { id: 'echo-sakura-blade', franchise: FRANCHISE.SAMURAI, zone: 'fantasy', title: '樱落刃冢', desc: '落樱盖住断刃 — 风一吹，金属反光像未散的杀气。', trigger: 'echo:sakura-blade' },
  { id: 'echo-tentacle-obelisk', franchise: FRANCHISE.COSMIC, zone: 'void', title: '触须方尖碑', desc: '碑面铭文不是文字，是盯着你的角度。', trigger: 'echo:tentacle-obelisk' },
  { id: 'echo-mad-scribe', franchise: FRANCHISE.COSMIC, zone: 'void', title: '疯癫抄写室', desc: '羽毛笔自己写 — 墨水味像海水与铁锈。', trigger: 'echo:mad-scribe' },
  { id: 'echo-spiral-well', franchise: FRANCHISE.COSMIC, zone: 'void', title: '螺旋深井', desc: '井底没有水，只有回声在数数 — 数到你。', trigger: 'echo:spiral-well' },
  { id: 'echo-star-cantina', franchise: FRANCHISE.STARPORT, zone: 'space', title: '星港酒肆', desc: '百种方言混成一种笑 — 赏金、走私、跃迁合同在同一张桌。', trigger: 'echo:star-cantina' },
  { id: 'echo-smuggler-dock', franchise: FRANCHISE.STARPORT, zone: 'space', title: '走私码头', desc: '集装箱编号是位面坐标 — 开错箱的人再没回来。', trigger: 'echo:smuggler-dock' },
  { id: 'echo-holo-chart', franchise: FRANCHISE.STARPORT, zone: 'space', title: '全息星图室', desc: '星图每天变 — 领航员说：「航线是谈判出来的。」', trigger: 'echo:holo-chart' },
];
